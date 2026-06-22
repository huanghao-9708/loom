<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

// ==========================================
// 数据实体接口定义
// ==========================================
interface Source {
  id: number;
  kind: string;
  name: string;
  config_json: string;
  status: string;
  created_at: string;
}

interface FileRecord {
  id: number;
  source_id: number;
  vpath: string;
  name: string;
  ext: string | null;
  category: string | null;
  size_bytes: number | null;
  is_dir: number;
  mtime: string | null;
  scanned_at: string;
}

interface CategoryStats {
  category: string | null;
  count: number;
  total_size: number;
}

interface SourceSizeStats {
  source_id: number;
  source_name: string;
  total_size: number;
  file_count: number;
}

interface BentoStats {
  recent: FileRecord[];
  category_distribution: CategoryStats[];
  source_statistics: SourceSizeStats[];
}

// ==========================================
// 状态管理
// ==========================================
const sources = ref<Source[]>([]);
const currentSourceId = ref<number | null>(null);
const currentPath = ref<string>("/");
const files = ref<FileRecord[]>([]);
const searchQuery = ref<string>("");
const isSearching = ref<boolean>(false);

// 看板统计数据
const bentoStats = ref<BentoStats>({
  recent: [],
  category_distribution: [],
  source_statistics: [],
});

// 新建数据源弹窗状态
const showAddModal = ref<boolean>(false);
const newSourceKind = ref<string>("local");
const newSourceName = ref<string>("");
const localPath = ref<string>("");
const webdavUrl = ref<string>("https://dav.jianguoyun.com/dav/");
const webdavUser = ref<string>("");
const webdavToken = ref<string>("");

// 媒体播放器状态
const audioPlayer = ref<HTMLAudioElement | null>(null);
const isPlaying = ref<boolean>(false);
const currentPlaybackTime = ref<number>(0);
const totalDuration = ref<number>(0);
const activeTrack = ref<FileRecord | null>(null);
const selectedFile = ref<FileRecord | null>(null); // 单选预览的文件

// ==========================================
// 计算属性
// ==========================================
// 格式化文件大小
const formatBytes = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined) return "--";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// 格式化时间为 mm:ss
const formatPlaybackTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// 当前选中的 Source 名字
const currentSourceName = computed(() => {
  const s = sources.value.find((x) => x.id === currentSourceId.value);
  return s ? s.name : "";
});

// 计算进度百分比
const progressPercent = computed(() => {
  if (totalDuration.value === 0) return 0;
  return (currentPlaybackTime.value / totalDuration.value) * 100;
});

// ==========================================
// 业务逻辑核心方法
// ==========================================

// 1. 加载所有数据源配置
const loadSources = async () => {
  try {
    sources.value = await invoke<Source[]>("cmd_get_sources");
  } catch (e) {
    console.error("Failed to load sources:", e);
  }
};

// 2. 加载 Bento 看板统计数据
const loadBentoStats = async () => {
  try {
    bentoStats.value = await invoke<BentoStats>("cmd_get_bento_stats");
  } catch (e) {
    console.error("Failed to load bento stats:", e);
  }
};

// 3. 点击列出数据源目录下的文件 (包含懒加载)
const selectSource = async (sourceId: number) => {
  currentSourceId.value = sourceId;
  currentPath.value = "/";
  selectedFile.value = null;
  searchQuery.value = "";
  isSearching.value = false;
  await loadDir(sourceId, "/");
};

const loadDir = async (sourceId: number, path: string) => {
  try {
    currentPath.value = path;
    files.value = await invoke<FileRecord[]>("cmd_list_dir", { sourceId, path });
  } catch (e) {
    console.error("Failed to load VFS dir:", e);
  }
};

// 4. 返回上一级目录
const navigateUp = async () => {
  if (!currentSourceId.value || currentPath.value === "/") return;
  
  const segments = currentPath.value.split("/");
  segments.pop(); // 移除最后一项
  let parentPath = segments.join("/");
  if (parentPath === "") {
    parentPath = "/";
  }
  await loadDir(currentSourceId.value, parentPath);
};

// 5. 点击列表条目时的交互 (进入目录或触发单选预览)
const handleRowClick = async (file: FileRecord) => {
  if (file.is_dir) {
    await loadDir(file.source_id, file.vpath);
  } else {
    selectedFile.value = file;
  }
};

// 双击音频条目触发播放
const handleRowDblClick = (file: FileRecord) => {
  if (file.is_dir) return;
  
  if (file.category === "audio") {
    activeTrack.value = file;
    selectedFile.value = file;
    playTrack(file);
  }
};

// 6. 添加数据源
const addSource = async () => {
  if (!newSourceName.value.trim()) return;

  let configObj = {};
  if (newSourceKind.value === "local") {
    if (!localPath.value.trim()) return;
    configObj = { root_path: localPath.value };
  } else {
    if (!webdavUser.value || !webdavToken.value) return;
    configObj = {
      url: webdavUrl.value,
      username: webdavUser.value,
      token: webdavToken.value,
    };
  }

  try {
    // 写入数据库并缓存到 VFS
    const sourceId = await invoke<number>("cmd_add_source", {
      kind: newSourceKind.value,
      name: newSourceName.value,
      configJson: JSON.stringify(configObj),
    });

    // 触发后台异步文件增量扫描，不卡死 UI
    await invoke("cmd_trigger_scan", { sourceId });

    // 重置并关闭
    showAddModal.value = false;
    newSourceName.value = "";
    localPath.value = "";
    webdavUser.value = "";
    webdavToken.value = "";

    // 刷新数据
    await loadSources();
    await loadBentoStats();
  } catch (e) {
    alert("添加数据源失败: " + e);
  }
};

// 7. 删除数据源
const deleteSource = async (id: number) => {
  if (!confirm("确认移除该数据源及其全部本地文件缓存索引？")) return;
  try {
    await invoke("cmd_remove_source", { id });
    if (currentSourceId.value === id) {
      currentSourceId.value = null;
      files.value = [];
    }
    await loadSources();
    await loadBentoStats();
  } catch (e) {
    console.error("Failed to delete source:", e);
  }
};

// 8. 全文搜索文件名 (实时查询)
const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    isSearching.value = false;
    if (currentSourceId.value) {
      await loadDir(currentSourceId.value, currentPath.value);
    }
    return;
  }

  try {
    isSearching.value = true;
    files.value = await invoke<FileRecord[]>("cmd_search_files", { query: searchQuery.value });
  } catch (e) {
    console.error("Search failed:", e);
  }
};

// 9. 音频播放与多媒体控制
const playTrack = (track: FileRecord) => {
  if (!audioPlayer.value) return;

  // 使用自定义 loom://preview/ 安全协议流
  const url = `loom://preview/${track.source_id}${track.vpath}`;
  audioPlayer.value.src = url;
  audioPlayer.value.play();
  isPlaying.value = true;
};

const togglePlay = () => {
  if (!audioPlayer.value) return;
  
  if (isPlaying.value) {
    audioPlayer.value.pause();
    isPlaying.value = false;
  } else {
    if (activeTrack.value) {
      audioPlayer.value.play();
      isPlaying.value = true;
    }
  }
};

const onTimeUpdate = () => {
  if (audioPlayer.value) {
    currentPlaybackTime.value = audioPlayer.value.currentTime;
  }
};

const onDurationChange = () => {
  if (audioPlayer.value) {
    totalDuration.value = audioPlayer.value.duration || 0;
  }
};

const onAudioEnded = () => {
  isPlaying.value = false;
  currentPlaybackTime.value = 0;
};

// 允许在进度条上手动跳转
const handleProgressBarClick = (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const ratio = clickX / width;
  
  if (audioPlayer.value && totalDuration.value > 0) {
    audioPlayer.value.currentTime = ratio * totalDuration.value;
  }
};

// 10. 进入“看板视图”首页
const goHome = async () => {
  currentSourceId.value = null;
  files.value = [];
  selectedFile.value = null;
  searchQuery.value = "";
  isSearching.value = false;
  await loadBentoStats();
};

onMounted(async () => {
  await loadSources();
  await loadBentoStats();
});
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-bg-base text-text-primary overflow-hidden font-sans select-none antialiased">
    
    <!-- 隐藏的 HTML5 播放器，供 JS 代理驱动 -->
    <audio 
      ref="audioPlayer" 
      @timeupdate="onTimeUpdate" 
      @durationchange="onDurationChange"
      @ended="onAudioEnded"
    ></audio>

    <!-- 顶部状态栏 -->
    <header class="h-8 border-b border-border-light flex items-center justify-between px-4 text-[10px] tracking-widest font-mono text-text-secondary uppercase">
      <div class="flex items-center gap-4">
        <span>DEVICE: LOOM-STATION v1.0.0</span>
        <span class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" :class="{'animate-pulse': isPlaying}"></span>
          SYS ACTIVE
        </span>
      </div>
      <div class="flex items-center gap-6">
        <span>SOURCES: {{ sources.length }}</span>
        <span>CACHE: OK</span>
        <span>DB: SQLITE</span>
      </div>
    </header>

    <!-- 中部主区 (左导航，中主板，右预览) -->
    <div class="flex-1 flex min-h-0">
      
      <!-- 1. 左侧面板 (挂载源与操作) -->
      <aside class="w-52 border-r border-border-light flex flex-col justify-between p-4 bg-bg-surface font-mono">
        <div class="space-y-6">
          <div>
            <div class="text-[10px] tracking-wider text-text-secondary uppercase mb-2">Workspace</div>
            <ul class="space-y-1 text-xs">
              <li 
                @click="goHome" 
                class="px-2 py-1 cursor-pointer flex items-center justify-between transition-colors"
                :class="currentSourceId === null ? 'bg-text-primary text-bg-surface' : 'hover:bg-bg-base'"
              >
                <span>BENTO DASHBOARD</span>
              </li>
            </ul>
          </div>

          <div>
            <div class="text-[10px] tracking-wider text-text-secondary uppercase mb-2 flex items-center justify-between">
              <span>Connected Sources</span>
              <button 
                @click="showAddModal = true" 
                class="text-accent hover:text-text-primary text-xs font-bold font-sans cursor-pointer"
              >
                [+]
              </button>
            </div>
            <ul class="space-y-1.5 text-xs">
              <li 
                v-for="src in sources" 
                :key="src.id"
                class="group px-2 py-1 cursor-pointer flex items-center justify-between transition-colors"
                :class="currentSourceId === src.id ? 'bg-text-primary text-bg-surface' : 'hover:bg-bg-base'"
              >
                <div @click="selectSource(src.id)" class="flex items-center gap-1.5 truncate flex-1">
                  <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
                  <span class="truncate">{{ src.name }}</span>
                </div>
                <button 
                  @click.stop="deleteSource(src.id)"
                  class="opacity-0 group-hover:opacity-100 text-[10px] text-accent font-sans ml-1 hover:text-text-primary"
                >
                  ✖
                </button>
              </li>
              <li v-if="sources.length === 0" class="text-[10px] text-text-secondary px-2 italic">
                No sources connected.
              </li>
            </ul>
          </div>
        </div>

        <!-- 极简开发标牌 -->
        <div class="border-t border-border-light pt-4 space-y-1 font-mono text-[9px] text-text-secondary leading-tight">
          <div>BYOS FILE SYSTEM MANAGER</div>
          <div class="text-accent">LOOM CO. 2026</div>
        </div>
      </aside>

      <!-- 2. 中间面板 (看板视图 vs 文件列表视图) -->
      <main class="flex-1 flex flex-col min-w-0 bg-bg-base">
        
        <!-- 看板视图 (Bento Dash) -->
        <div v-if="currentSourceId === null" class="flex-1 p-6 overflow-y-auto no-scrollbar space-y-6">
          <div class="font-mono text-xs text-text-secondary">SYSTEM OVERVIEW //</div>
          
          <!-- 便当盒布局 1: 上部大类及各源大小分布 -->
          <div class="grid grid-cols-2 gap-4">
            <!-- 类别分布 -->
            <div class="bg-bg-surface border border-border-light p-4 font-mono">
              <div class="text-[10px] text-text-secondary uppercase mb-3 border-b border-border-light pb-1">File Category Analysis</div>
              <div class="space-y-2 text-xs">
                <div v-for="cat in bentoStats.category_distribution" :key="cat.category || 'other'" class="flex items-center justify-between">
                  <span class="uppercase text-text-secondary w-16">{{ cat.category || 'OTHER' }}</span>
                  <div class="flex-1 mx-3 h-2 bg-bg-base relative">
                    <div class="h-full bg-text-primary" :style="{ width: Math.min(100, (cat.count / 500) * 100) + '%' }"></div>
                  </div>
                  <span class="w-20 text-right">{{ formatBytes(cat.total_size) }} ({{ cat.count }})</span>
                </div>
                <div v-if="bentoStats.category_distribution.length === 0" class="text-[10px] italic text-text-secondary text-center py-4">
                  Add a source to calculate statistics.
                </div>
              </div>
            </div>

            <!-- 数据源大小 -->
            <div class="bg-bg-surface border border-border-light p-4 font-mono">
              <div class="text-[10px] text-text-secondary uppercase mb-3 border-b border-border-light pb-1">Storage Usage by Source</div>
              <div class="space-y-2 text-xs">
                <div v-for="stat in bentoStats.source_statistics" :key="stat.source_id" class="flex items-center justify-between">
                  <span class="truncate flex-1 text-text-secondary uppercase">{{ stat.source_name }}</span>
                  <span class="ml-4 font-bold">{{ formatBytes(stat.total_size) }}</span>
                  <span class="ml-3 text-[10px] text-text-secondary">[{{ stat.file_count }} files]</span>
                </div>
                <div v-if="bentoStats.source_statistics.length === 0" class="text-[10px] italic text-text-secondary text-center py-4">
                  No storage statistics available.
                </div>
              </div>
            </div>
          </div>

          <!-- 便当盒布局 2: 最近变动文件 -->
          <div class="bg-bg-surface border border-border-light p-4 font-mono">
            <div class="text-[10px] text-text-secondary uppercase mb-3 border-b border-border-light pb-1">Recent System Changes (Top 50)</div>
            <div class="max-h-64 overflow-y-auto no-scrollbar text-xs">
              <table class="w-full text-left">
                <thead>
                  <tr class="text-[9px] text-text-secondary uppercase border-b border-border-light">
                    <th class="pb-1.5 font-normal">File Name</th>
                    <th class="pb-1.5 font-normal">Category</th>
                    <th class="pb-1.5 font-normal">Size</th>
                    <th class="pb-1.5 font-normal text-right">Modified Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="rec in bentoStats.recent" :key="rec.id" class="border-b border-border-light/40 hover:bg-bg-base/30">
                    <td class="py-1.5 truncate max-w-xs text-text-primary">{{ rec.name }}</td>
                    <td class="py-1.5 uppercase text-text-secondary text-[10px]">{{ rec.category }}</td>
                    <td class="py-1.5 text-text-secondary">{{ formatBytes(rec.size_bytes) }}</td>
                    <td class="py-1.5 text-right text-[10px] text-text-secondary">{{ rec.mtime?.split('T')[0] || '--' }}</td>
                  </tr>
                  <tr v-if="bentoStats.recent.length === 0">
                    <td colspan="4" class="text-center py-6 text-[10px] italic text-text-secondary">
                      No files indexed yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- VFS 文件浏览器视图 -->
        <div v-else class="flex-1 flex flex-col min-h-0">
          <!-- 上方导航条 -->
          <div class="h-9 border-b border-border-light flex items-center justify-between px-4 bg-bg-surface font-mono text-xs">
            <div class="flex items-center gap-4">
              <button 
                @click="navigateUp" 
                class="hover:text-accent font-bold"
                :disabled="currentPath === '/'"
                :class="currentPath === '/' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'"
              >
                ↑ PARENT
              </button>
              <span class="text-text-secondary font-mono truncate">
                / {{ currentSourceName }} {{ currentPath }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[9px] text-text-secondary uppercase">FTS:</span>
              <input 
                v-model="searchQuery"
                @input="performSearch"
                type="text" 
                placeholder="search file name..." 
                class="bg-bg-base border border-border-light px-2 py-0.5 text-xs w-44 focus:outline-none focus:border-accent text-text-primary"
              />
            </div>
          </div>

          <!-- 文件列表表格 -->
          <div class="flex-1 overflow-y-auto no-scrollbar">
            <table class="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr class="border-b border-border-light bg-bg-surface text-text-secondary text-[9px] sticky top-0 uppercase z-10">
                  <th class="py-2 px-4 font-normal w-8">#</th>
                  <th class="py-2 px-4 font-normal">Title / Name</th>
                  <th class="py-2 px-4 font-normal w-20">Type</th>
                  <th class="py-2 px-4 font-normal w-24">Size</th>
                  <th class="py-2 px-4 font-normal w-36 text-right">Modified</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="(file, idx) in files" 
                  :key="file.id"
                  @click="handleRowClick(file)"
                  @dblclick="handleRowDblClick(file)"
                  class="border-b border-border-light hover:bg-bg-surface cursor-pointer select-none"
                  :class="[
                    selectedFile?.id === file.id ? 'bg-text-primary text-bg-surface hover:bg-text-primary' : '',
                    activeTrack?.id === file.id && isPlaying ? 'border-l-2 border-l-accent' : ''
                  ]"
                >
                  <td class="py-2 px-4 text-text-secondary w-8 text-center">
                    <span v-if="activeTrack?.id === file.id && isPlaying" class="text-accent font-bold">▶</span>
                    <span v-else>{{ idx + 1 }}</span>
                  </td>
                  <td class="py-2 px-4 truncate max-w-sm flex items-center gap-1.5 font-sans" :class="selectedFile?.id === file.id ? 'text-bg-surface' : 'text-text-primary'">
                    <span v-if="file.is_dir" class="text-text-secondary font-mono mr-1">📁</span>
                    <span v-else class="text-text-secondary font-mono mr-1">📄</span>
                    <span class="truncate font-mono">{{ file.name }}</span>
                  </td>
                  <td class="py-2 px-4 text-[10px] uppercase" :class="selectedFile?.id === file.id ? 'text-bg-surface' : 'text-text-secondary'">
                    {{ file.is_dir ? 'DIR' : (file.ext || 'FILE') }}
                  </td>
                  <td class="py-2 px-4" :class="selectedFile?.id === file.id ? 'text-bg-surface' : 'text-text-secondary'">
                    {{ file.is_dir ? '--' : formatBytes(file.size_bytes) }}
                  </td>
                  <td class="py-2 px-4 text-right text-[10px]" :class="selectedFile?.id === file.id ? 'text-bg-surface' : 'text-text-secondary'">
                    {{ file.mtime?.split('T')[0] || '--' }}
                  </td>
                </tr>

                <tr v-if="files.length === 0">
                  <td colspan="5" class="py-12 text-center text-[10px] italic text-text-secondary">
                    {{ isSearching ? 'No match found in FTS.' : 'Empty directory or indexing...' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <!-- 3. 右侧 Now Playing / 预览面板 -->
      <aside class="w-64 border-l border-border-light flex flex-col p-4 bg-bg-surface justify-between">
        
        <!-- 默认展示 Now Playing (音频) -->
        <div v-if="selectedFile?.category !== 'image' && selectedFile?.category !== 'video' && selectedFile?.ext !== 'pdf'" class="space-y-4 flex flex-col h-full justify-between">
          <div class="space-y-4">
            <div class="text-[10px] tracking-wider font-mono text-text-secondary uppercase">Track Monitor</div>
            
            <!-- 硬件旋盘效果 -->
            <div class="aspect-square bg-bg-base border border-border-light flex items-center justify-center p-6 relative overflow-hidden">
              <div 
                class="absolute inset-2 rounded-full border border-border-light/40 flex items-center justify-center transition-transform duration-1000"
                :class="{'animate-spin': isPlaying}"
                style="animation-duration: 4s"
              >
                <div class="h-16 w-16 rounded-full border border-border-light/60 flex items-center justify-center bg-bg-surface">
                  <div class="h-4 w-4 rounded-full bg-accent"></div>
                </div>
              </div>
              <div class="z-10 text-center font-mono space-y-1">
                <div class="text-[8px] text-text-secondary uppercase">STATUS</div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-accent">
                  {{ isPlaying ? 'PLAYING' : 'READY' }}
                </div>
              </div>
            </div>

            <!-- 当前选中/播放信息 -->
            <div class="space-y-2 font-mono">
              <h2 class="text-xs font-bold leading-tight break-all uppercase border-b border-border-light pb-1">
                {{ selectedFile ? selectedFile.name : (activeTrack ? activeTrack.name : 'No track active') }}
              </h2>
              <div class="text-[9px] text-text-secondary space-y-0.5">
                <div>TYPE: <span class="text-text-primary uppercase">{{ selectedFile ? selectedFile.ext : (activeTrack?.ext || '--') }}</span></div>
                <div>SIZE: <span class="text-text-primary">{{ selectedFile ? formatBytes(selectedFile.size_bytes) : formatBytes(activeTrack?.size_bytes) }}</span></div>
                <div>PATH: <span class="text-text-primary truncate block">{{ selectedFile ? selectedFile.vpath : (activeTrack?.vpath || '--') }}</span></div>
              </div>
            </div>
          </div>

          <!-- 音频流监控指标 -->
          <div class="border-t border-border-light pt-4 font-mono space-y-1 text-[9px]">
            <div class="flex justify-between">
              <span class="text-text-secondary">STREAM DECODER</span>
              <span>JS / WASM</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">CHANNEL RATE</span>
              <span>44.1 KHZ / STEREO</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">CACHE BUFFER</span>
              <span>OK (206 RANGE)</span>
            </div>
          </div>
        </div>

        <!-- 图像预览 -->
        <div v-else-if="selectedFile?.category === 'image'" class="h-full flex flex-col justify-between">
          <div class="space-y-4">
            <div class="text-[10px] tracking-wider font-mono text-text-secondary uppercase">Image Preview</div>
            <div class="bg-bg-base border border-border-light p-2 flex items-center justify-center overflow-hidden aspect-square">
              <img 
                :src="`loom://preview/${selectedFile.source_id}${selectedFile.vpath}`"
                class="max-w-full max-h-full object-contain pointer-events-none" 
              />
            </div>
            <div class="font-mono text-[9px] space-y-1">
              <div class="font-bold truncate text-xs">{{ selectedFile.name }}</div>
              <div class="text-text-secondary">SIZE: <span class="text-text-primary">{{ formatBytes(selectedFile.size_bytes) }}</span></div>
              <div class="text-text-secondary truncate">VPATH: <span class="text-text-primary">{{ selectedFile.vpath }}</span></div>
            </div>
          </div>
          <button 
            @click="selectedFile = null" 
            class="w-full border border-border-light py-1 text-[10px] font-mono hover:bg-bg-base cursor-pointer"
          >
            [CLOSE PREVIEW]
          </button>
        </div>

        <!-- 视频预览 -->
        <div v-else-if="selectedFile?.category === 'video'" class="h-full flex flex-col justify-between">
          <div class="space-y-4">
            <div class="text-[10px] tracking-wider font-mono text-text-secondary uppercase">Video Player</div>
            <div class="bg-bg-base border border-border-light overflow-hidden aspect-video flex items-center justify-center">
              <video 
                controls 
                class="w-full h-full"
                :src="`loom://preview/${selectedFile.source_id}${selectedFile.vpath}`"
              ></video>
            </div>
            <div class="font-mono text-[9px] space-y-1">
              <div class="font-bold truncate text-xs">{{ selectedFile.name }}</div>
              <div class="text-text-secondary">FORMAT: <span class="text-text-primary uppercase">{{ selectedFile.ext }}</span></div>
              <div class="text-text-secondary">SIZE: <span class="text-text-primary">{{ formatBytes(selectedFile.size_bytes) }}</span></div>
            </div>
          </div>
          <button 
            @click="selectedFile = null" 
            class="w-full border border-border-light py-1 text-[10px] font-mono hover:bg-bg-base cursor-pointer"
          >
            [CLOSE PREVIEW]
          </button>
        </div>

        <!-- PDF 预览 -->
        <div v-else-if="selectedFile?.ext === 'pdf'" class="h-full flex flex-col justify-between">
          <div class="space-y-4 flex-1 flex flex-col min-h-0">
            <div class="text-[10px] tracking-wider font-mono text-text-secondary uppercase">Document Monitor</div>
            <div class="flex-1 bg-bg-base border border-border-light min-h-[250px] relative">
              <iframe 
                :src="`loom://preview/${selectedFile.source_id}${selectedFile.vpath}`"
                class="w-full h-full border-none absolute inset-0"
              ></iframe>
            </div>
            <div class="font-mono text-[9px]">
              <div class="font-bold truncate">{{ selectedFile.name }}</div>
              <div class="text-text-secondary">SIZE: {{ formatBytes(selectedFile.size_bytes) }}</div>
            </div>
          </div>
          <button 
            @click="selectedFile = null" 
            class="w-full border border-border-light py-1 text-[10px] font-mono hover:bg-bg-base cursor-pointer mt-4"
          >
            [CLOSE PREVIEW]
          </button>
        </div>
      </aside>
    </div>

    <!-- 底部控制栏 (硬件面板隐喻) -->
    <footer class="h-16 border-t border-border-light bg-bg-surface flex items-center justify-between px-6 font-mono">
      <!-- 播放操作按键 -->
      <div class="flex items-center gap-1">
        <button class="h-8 w-8 border border-border-light flex items-center justify-center text-xs hover:bg-bg-base cursor-pointer">⏮</button>
        <button 
          @click="togglePlay"
          class="h-9 w-12 border border-border-light flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
          :class="isPlaying ? 'bg-accent text-bg-surface border-accent' : 'bg-text-primary text-bg-surface hover:bg-accent hover:border-accent'"
        >
          {{ isPlaying ? '||' : '▶' }}
        </button>
        <button class="h-8 w-8 border border-border-light flex items-center justify-center text-xs hover:bg-bg-base cursor-pointer">⏭</button>
      </div>

      <!-- 进度条刻度尺 -->
      <div class="flex-1 max-w-xl mx-8 space-y-0.5">
        <div class="flex justify-between text-[8px] text-text-secondary">
          <span>{{ formatPlaybackTime(currentPlaybackTime) }}</span>
          <span>MEASURE SCALE (SEC)</span>
          <span>{{ formatPlaybackTime(totalDuration) }}</span>
        </div>
        <!-- 精密测量标尺效果 -->
        <div 
          @click="handleProgressBarClick"
          class="h-3 relative flex items-end select-none cursor-pointer"
        >
          <!-- 刻度线 -->
          <div class="absolute inset-x-0 bottom-0 h-1.5 flex justify-between pointer-events-none">
            <span v-for="i in 21" :key="i" class="h-full w-[1px] bg-border-light" :class="{ 'h-2 bg-text-secondary': i % 5 === 1 }"></span>
          </div>
          <!-- 进度条轨道 -->
          <div class="absolute inset-x-0 bottom-1 h-[2px] bg-border-light"></div>
          <!-- 激活的进度条 -->
          <div class="absolute left-0 bottom-1 h-[2px] bg-accent" :style="{ width: progressPercent + '%' }"></div>
          <!-- 橙色滑块 (TE风格小圆点) -->
          <div class="absolute h-2 w-2 rounded-full bg-accent" :style="{ left: progressPercent + '%', transform: 'translate(-50%, 25%)' }"></div>
        </div>
      </div>

      <!-- 音量与辅助控制器 -->
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-text-secondary">VOL:</span>
          <!-- 精密模拟滑块 -->
          <div class="w-16 h-1.5 bg-border-light relative cursor-not-allowed">
            <div class="absolute left-0 top-0 h-full bg-text-primary" style="width: 70%"></div>
            <div class="absolute h-3 w-1.5 bg-text-primary top-1/2 -translate-y-1/2" style="left: 70%"></div>
          </div>
        </div>
        <span class="text-[9px] text-text-secondary">STEREO</span>
      </div>
    </footer>

    <!-- 极简工业模态框: 添加数据源 -->
    <div v-if="showAddModal" class="fixed inset-0 bg-text-primary/40 backdrop-blur-[1px] z-50 flex items-center justify-center">
      <div class="bg-bg-surface border border-border-light w-[400px] p-6 font-mono space-y-4 shadow-xl">
        <div class="text-[10px] text-text-secondary uppercase border-b border-border-light pb-1">Connect Source Device //</div>
        
        <!-- 类型选择 -->
        <div class="space-y-1 text-xs">
          <label class="text-[9px] text-text-secondary uppercase">Source Kind</label>
          <div class="grid grid-cols-2 gap-2">
            <button 
              @click="newSourceKind = 'local'"
              class="border py-1.5 font-bold cursor-pointer text-center text-[10px]"
              :class="newSourceKind === 'local' ? 'bg-text-primary text-bg-surface border-text-primary' : 'border-border-light hover:bg-bg-base'"
            >
              LOCAL DISK
            </button>
            <button 
              @click="newSourceKind = 'webdav'"
              class="border py-1.5 font-bold cursor-pointer text-center text-[10px]"
              :class="newSourceKind === 'webdav' ? 'bg-text-primary text-bg-surface border-text-primary' : 'border-border-light hover:bg-bg-base'"
            >
              WEBDAV CLOUD
            </button>
          </div>
        </div>

        <!-- 名字 -->
        <div class="space-y-1 text-xs">
          <label class="text-[9px] text-text-secondary uppercase">Source Name</label>
          <input 
            v-model="newSourceName"
            type="text" 
            placeholder="e.g. My Music Library"
            class="w-full bg-bg-base border border-border-light px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary text-xs"
          />
        </div>

        <!-- 本地参数 -->
        <div v-if="newSourceKind === 'local'" class="space-y-1 text-xs">
          <label class="text-[9px] text-text-secondary uppercase">Absolute Path</label>
          <input 
            v-model="localPath"
            type="text" 
            placeholder="e.g. D:/MyMusic or /Users/me/Music"
            class="w-full bg-bg-base border border-border-light px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary text-xs"
          />
        </div>

        <!-- WebDAV 参数 -->
        <div v-else class="space-y-3">
          <div class="space-y-1 text-xs">
            <label class="text-[9px] text-text-secondary uppercase">Server Endpoint</label>
            <input 
              v-model="webdavUrl"
              type="text" 
              class="w-full bg-bg-base border border-border-light px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary text-xs"
            />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1 text-xs">
              <label class="text-[9px] text-text-secondary uppercase">Username</label>
              <input 
                v-model="webdavUser"
                type="text" 
                placeholder="Email/Username"
                class="w-full bg-bg-base border border-border-light px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary text-xs"
              />
            </div>
            <div class="space-y-1 text-xs">
              <label class="text-[9px] text-text-secondary uppercase">App Password</label>
              <input 
                v-model="webdavToken"
                type="password" 
                placeholder="Token"
                class="w-full bg-bg-base border border-border-light px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary text-xs"
              />
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="border-t border-border-light pt-4 flex justify-end gap-2 text-xs">
          <button 
            @click="showAddModal = false"
            class="px-4 py-1.5 border border-border-light hover:bg-bg-base font-bold cursor-pointer text-[10px]"
          >
            CANCEL
          </button>
          <button 
            @click="addSource"
            class="px-4 py-1.5 bg-text-primary text-bg-surface font-bold hover:bg-accent transition-colors cursor-pointer text-[10px]"
          >
            [SAVE CONNECTION]
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* 确保滚动高度受限并支持平滑滚动 */
aside, main {
  transition: all 0.15s ease-in-out;
}
</style>