<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, message } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import PluginHost from './components/PluginHost.vue';

// 统一错误处理弹窗助手
const showError = async (title: string, err: any) => {
  console.error(`[${title}]`, err);
  await message(`${err}`, { title, kind: 'error' });
};

const appWindow = getCurrentWindow();

// 窗口控制逻辑
const minimizeWindow = async () => {
  await appWindow.minimize();
};

const toggleMaximizeWindow = async () => {
  await appWindow.toggleMaximize();
};

const closeWindow = async () => {
  await appWindow.close();
};

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
  source_name?: string; // 融合大平层时动态注入的来源名称
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
  physical_capacity: number | null;
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
const currentSourceId = ref<number | null>(null); // null 代表“全部文件”融合大平层
const currentPath = ref<string>("/");
const files = ref<FileRecord[]>([]);
const searchQuery = ref<string>("");
const isSearching = ref<boolean>(false);

// 插件沙箱状态
const activePluginId = ref<string | null>(null);
const activePluginEntry = ref<string>("");

const openPlugin = (id: string, entry: string) => {
  activePluginId.value = id;
  activePluginEntry.value = entry;
  currentSourceId.value = null; // 清除左侧文件树选中的视觉高亮
};

// 异步分页与懒加载状态
const isLoading = ref<boolean>(false);
const displayLimit = ref<number>(50);
const observerTarget = ref<HTMLElement | null>(null);

const displayFiles = computed(() => {
  return files.value.slice(0, displayLimit.value);
});

// 后端全局看板与统计数据
const bentoStats = ref<BentoStats>({
  recent: [],
  category_distribution: [],
  source_statistics: [],
});

// 新建数据源/设置弹窗状态
const showAddModal = ref<boolean>(false);
const showSettingsModal = ref<boolean>(false);
const showDeleteConfirmModal = ref<boolean>(false);
const sourceToDelete = ref<number | null>(null);

const newSourceKind = ref<string>("local");
const newSourceName = ref<string>("");
const localPath = ref<string>("");
const webdavUrl = ref<string>("https://dav.jianguoyun.com/dav/");
const webdavUser = ref<string>("");
const webdavToken = ref<string>("");

// Tauri Core Greet 测试状态
const greetMsg = ref("");
const greetName = ref("Loom User");

// 预览与播放状态
const selectedFile = ref<FileRecord | null>(null); // 右边栏预览的文件

// ==========================================
// 右键菜单与基础操作状态
// ==========================================
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  file: null as FileRecord | null,
});

const renamingFileId = ref<number | null>(null);
const renameInput = ref<string>("");

const showMkdirModal = ref<boolean>(false);
const newFolderName = ref<string>("");

const openContextMenu = (e: MouseEvent, file: FileRecord) => {
  // 禁止在“全部文件”页使用右键操作
  if (currentSourceId.value === null) return;
  
  let x = e.clientX;
  let y = e.clientY;
  
  // 防边界溢出计算：假设菜单宽度约 160px，高度约 200px
  if (window.innerWidth - x < 160) x = window.innerWidth - 160;
  if (window.innerHeight - y < 200) y = window.innerHeight - 200;

  contextMenu.value = {
    visible: true,
    x,
    y,
    file,
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

let unlistenVfsUpdate: (() => void) | null = null;
let globalObserver: IntersectionObserver | null = null;

onMounted(() => {
  window.addEventListener("click", closeContextMenu);
});
onUnmounted(() => {
  window.removeEventListener("click", closeContextMenu);
  if (unlistenVfsUpdate) unlistenVfsUpdate();
  if (globalObserver) globalObserver.disconnect();
});

const startRename = () => {
  if (!contextMenu.value.file) return;
  renamingFileId.value = contextMenu.value.file.id;
  renameInput.value = contextMenu.value.file.name;
};

const confirmRename = async () => {
  if (!renamingFileId.value || !renameInput.value.trim()) {
    renamingFileId.value = null;
    return;
  }
  
  const file = files.value.find(f => f.id === renamingFileId.value);
  if (!file) return;
  
  if (file.name === renameInput.value) {
    renamingFileId.value = null;
    return;
  }

  try {
    await invoke("cmd_file_rename", {
      sourceId: file.source_id,
      path: file.vpath,
      newName: renameInput.value.trim()
    });
    // 后端完成后会自动触发重扫，我们这里只需关闭输入框即可
    renamingFileId.value = null;
  } catch (err) {
    await showError("Rename Failed", err);
  }
};

const deleteFile = async () => {
  if (!contextMenu.value.file) return;
  const file = contextMenu.value.file;
  
  if (!confirm(`确定要永久删除 [${file.name}] 吗？\n删除后无法恢复！`)) return;

  try {
    await invoke("cmd_file_delete", {
      sourceId: file.source_id,
      path: file.vpath
    });
  } catch (err) {
    await showError("Delete Failed", err);
  }
};

const confirmMkdir = async () => {
  if (!newFolderName.value.trim() || !currentSourceId.value) return;
  
  let targetPath = currentPath.value.endsWith('/') 
    ? currentPath.value + newFolderName.value.trim() 
    : currentPath.value + '/' + newFolderName.value.trim();
    
  if (currentPath.value === "/") {
      targetPath = "/" + newFolderName.value.trim();
  }

  try {
    await invoke("cmd_file_mkdir", {
      sourceId: currentSourceId.value,
      path: targetPath
    });
    showMkdirModal.value = false;
    newFolderName.value = "";
  } catch (err) {
    await showError("Mkdir Failed", err);
  }
};

// ==========================================
// 辅助与转换方法
// ==========================================
// 生成跨平台兼容的流媒体预览 URL
const getPreviewUrl = (sourceId: number, vpath: string) => {
  const isWindows = navigator.userAgent.includes("Windows");
  // WebView2 on Windows requires http://<scheme>.localhost format for custom protocols
  const baseUrl = isWindows ? "http://loom.localhost" : "loom://localhost";
  
  // URL Encode each segment of the path to avoid issues with special characters and spaces
  const encodedPath = vpath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  
  return `${baseUrl}/preview/${sourceId}${encodedPath}`;
};
// 格式化文件大小
const formatBytes = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// 格式化日期：YYYY-MM-DD HH:MM
const formatDate = (isoStr: string | null) => {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const r = d.getDate().toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${y}-${m}-${r} ${h}:${min}`;
  } catch (e) {
    return isoStr;
  }
};

// 文件图标匹配
const getFileIcon = (file: FileRecord) => {
  if (file.is_dir) return "folder";
  const ext = (file.ext || "").toLowerCase();
  switch (ext) {
    case "fig": return "figma";
    case "md": return "markdown";
    case "xlsx":
    case "xls": return "excel";
    case "docx":
    case "doc": return "word";
    case "pptx":
    case "ppt": return "powerpoint";
    case "pdf": return "pdf";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp": return "image";
    case "mp4":
    case "mkv":
    case "avi": return "video";
    case "mp3":
    case "wav":
    case "flac":
    case "m4a": return "audio";
    case "txt": return "text";
    case "zip":
    case "rar":
    case "7z": return "archive";
    default: return "file";
  }
};

// 转换友好的中文文件类型描述
const getFileTypeDisplay = (file: FileRecord) => {
  if (file.is_dir) return "文件夹";
  const ext = (file.ext || "").toLowerCase();
  switch (ext) {
    case "fig": return "Figma 文件";
    case "md": return "Markdown";
    case "xlsx":
    case "xls": return "Excel 表格";
    case "docx":
    case "doc": return "Word 文档";
    case "pptx":
    case "ppt": return "PowerPoint 演示";
    case "pdf": return "PDF 文档";
    case "jpg":
    case "jpeg": return "JPEG 图像";
    case "png": return "PNG 图像";
    case "gif": return "GIF 图像";
    case "webp": return "WEBP 图像";
    case "mp4": return "MP4 视频";
    case "mkv": return "MKV 视频";
    case "avi": return "AVI 视频";
    case "mp3": return "MP3 音频";
    case "wav": return "WAV 音频";
    case "flac": return "FLAC 音频";
    case "m4a": return "M4A 音频";
    case "txt": return "文本文件";
    case "zip":
    case "rar":
    case "7z": return "压缩包";
    default: return ext ? `${ext.toUpperCase()} 文件` : "未知文件";
  }
};

// ==========================================
// 数据计算属性 (计算右侧看板)
// ==========================================
// 分类统计映射
const statsMap = computed(() => {
  const map = {
    folder: { name: "文件夹", icon: "folder", count: 0, size: 0 },
    doc: { name: "文档", icon: "doc", count: 0, size: 0 },
    image: { name: "图片", icon: "image", count: 0, size: 0 },
    video: { name: "视频", icon: "video", count: 0, size: 0 },
    audio: { name: "音频", icon: "audio", count: 0, size: 0 },
    archive: { name: "压缩包", icon: "archive", count: 0, size: 0 },
    other: { name: "其他", icon: "file", count: 0, size: 0 },
  };

  bentoStats.value.category_distribution.forEach((item) => {
    const cat = item.category || "other";
    if (cat === "folder") {
      map.folder.count = item.count;
      map.folder.size = item.total_size;
    } else if (cat === "doc") {
      map.doc.count = item.count;
      map.doc.size = item.total_size;
    } else if (cat === "image") {
      map.image.count = item.count;
      map.image.size = item.total_size;
    } else if (cat === "video") {
      map.video.count = item.count;
      map.video.size = item.total_size;
    } else if (cat === "audio") {
      map.audio.count = item.count;
      map.audio.size = item.total_size;
    } else if (cat === "archive") {
      map.archive.count = item.count;
      map.archive.size = item.total_size;
    } else {
      map.other.count += item.count;
      map.other.size += item.total_size;
    }
  });

  return Object.values(map);
});

// 总项目数
const totalItemsCount = computed(() => {
  return statsMap.value.reduce((acc, curr) => acc + curr.count, 0);
});

// 总存储容量
const totalStorageUsed = computed(() => {
  return bentoStats.value.source_statistics.reduce((acc, curr) => acc + curr.total_size, 0);
});

// 总文件大小
const totalFilesSize = computed(() => {
  return totalStorageUsed.value;
});



// ==========================================
// 业务接口核心方法
// ==========================================

// 加载所有数据源配置
const loadSources = async () => {
  try {
    sources.value = await invoke<Source[]>("cmd_get_sources");
  } catch (err) {
    await showError("Failed to load sources", err);
  }
};

// 加载 Bento 看板统计数据
const loadBentoStats = async () => {
  try {
    bentoStats.value = await invoke<BentoStats>("cmd_get_bento_stats");
  } catch (err) {
    await showError("Failed to load bento stats", err);
  }
};

// 源与目录切换逻辑
const selectSource = async (sourceId: number | null) => {
  activePluginId.value = null;
  currentSourceId.value = sourceId;
  selectedFile.value = null;
  searchQuery.value = "";
  isSearching.value = false;
  await loadDir(sourceId, "/");
};

// 加载目录文件 (包含融合大平层处理)
const loadDir = async (sourceId: number | null, path: string) => {
  try {
    isLoading.value = true;
    displayLimit.value = 50; // 重置分页
    currentPath.value = path;
    if (sourceId === null) {
      // 融合所有数据源根目录文件
      let mergedFiles: FileRecord[] = [];
      for (const src of sources.value) {
        try {
          const srcFiles = await invoke<FileRecord[]>("cmd_list_dir", { sourceId: src.id, path: "/" });
          const mapped = srcFiles.map(f => ({
            ...f,
            source_name: src.name
          }));
          mergedFiles = mergedFiles.concat(mapped);
        } catch (e) {
          console.error(`Failed to load root for source ${src.name}:`, e);
        }
      }
      files.value = mergedFiles.sort((a, b) => b.is_dir - a.is_dir);
    } else {
      // 查询单个源下的目录
      const srcFiles = await invoke<FileRecord[]>("cmd_list_dir", { sourceId, path });
      const src = sources.value.find(s => s.id === sourceId);
      files.value = srcFiles.map(f => ({
        ...f,
        source_name: src ? src.name : ""
      }));
    }
  } catch (err) {
    await showError("Failed to load VFS dir", err);
  } finally {
    isLoading.value = false;
  }
};

// 返回上一级
const navigateUp = async () => {
  if (currentSourceId.value === null) return;
  
  if (currentPath.value === "/") {
    // 如果已经到了特定源的根目录，去上一层会退回到“全部文件”融合大平层
    await selectSource(null);
    return;
  }
  
  const segments = currentPath.value.split("/");
  segments.pop();
  let parentPath = segments.join("/");
  if (parentPath === "") {
    parentPath = "/";
  }
  await loadDir(currentSourceId.value, parentPath);
};

// 单击文件进行行高亮选择，双击文件夹进入
const handleRowClick = (file: FileRecord) => {
  selectedFile.value = file;
};

const handleRowDblClick = async (file: FileRecord) => {
  if (file.is_dir) {
    currentSourceId.value = file.source_id;
    await loadDir(file.source_id, file.vpath);
  }
};

// 选择本地文件夹目录
const selectLocalDirectory = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: '选择作为存储源的文件夹'
    });
    if (selected !== null) {
      localPath.value = selected as string;
    }
  } catch (e) {
    console.error("Failed to open dialog:", e);
  }
};

// 添加新数据源配置
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
    const sourceId = await invoke<number>("cmd_add_source", {
      kind: newSourceKind.value,
      name: newSourceName.value,
      configJson: JSON.stringify(configObj),
    });

    // 触发后台增量扫描器
    await invoke("cmd_trigger_scan", { sourceId });

    showAddModal.value = false;
    newSourceName.value = "";
    localPath.value = "";
    webdavUser.value = "";
    webdavToken.value = "";

    await loadSources();
    await loadBentoStats();
    await loadDir(currentSourceId.value, currentPath.value);
  } catch (err) {
    await showError("Add Source Failed", err);
  }
};

// 移除数据源
const deleteSourceInSettings = (id: number) => {
  sourceToDelete.value = id;
  showDeleteConfirmModal.value = true;
};

const confirmDeleteSource = async () => {
  if (sourceToDelete.value === null) return;
  const id = sourceToDelete.value;
  try {
    await invoke("cmd_remove_source", { id });
    if (currentSourceId.value === id) {
      currentSourceId.value = null;
      files.value = [];
    }
    showDeleteConfirmModal.value = false;
    sourceToDelete.value = null;
    await loadSources();
    await loadBentoStats();
    await loadDir(currentSourceId.value, currentPath.value);
  } catch (err) {
    await showError("Delete Source Failed", err);
  }
};

// 全文检索
const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    isSearching.value = false;
    await loadDir(currentSourceId.value, currentPath.value);
    return;
  }

  try {
    isSearching.value = true;
    const searchResults = await invoke<FileRecord[]>("cmd_search_files", { query: searchQuery.value });
    files.value = searchResults.map(f => {
      const src = sources.value.find(s => s.id === f.source_id);
      return {
        ...f,
        source_name: src ? src.name : ""
      };
    });
  } catch (err) {
    await showError("Search Failed", err);
  }
};

// Tauri Greet Test
async function greet() {
  greetMsg.value = await invoke("greet", { name: greetName.value });
}

onMounted(async () => {
  await loadSources();
  await loadBentoStats();
  await loadDir(null, "/"); // 默认展示合并大平层

  // 挂载 Tauri VFS 后台更新事件监听
  unlistenVfsUpdate = await listen('vfs-dir-updated', async (event: any) => {
    const { source_id, path } = event.payload;
    if (currentSourceId.value === source_id && currentPath.value === path) {
      await loadDir(source_id, path);
    } else if (currentSourceId.value === null && path === "/") {
      await loadDir(null, "/");
    }
    await loadBentoStats();
  });

  // 挂载 IntersectionObserver 实现虚拟滚动
  globalObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (displayLimit.value < files.value.length) {
        // 每次触底多加载 50 条
        displayLimit.value += 50;
      }
    }
  }, { root: null, rootMargin: '200px' });

  // 延迟绑定 observer 以确保 DOM 渲染完成
  setTimeout(() => {
    if (observerTarget.value && globalObserver) {
      globalObserver.observe(observerTarget.value);
    }
  }, 500);
});
</script>

<template>
  <div class="flex h-screen w-screen bg-bg-base text-text-primary overflow-hidden font-sans select-none antialiased">
    
    <!-- ========================================== -->
    <!-- 1. 左侧导航边栏 (Sidebar) -->
    <!-- ========================================== -->
    <aside class="w-60 border-r border-border-light bg-bg-sidebar flex flex-col justify-between p-4.5 pt-4.5">
      <div class="space-y-6">
        
        <!-- Window Drag Region for Sidebar -->
        <div data-tauri-drag-region class="h-6 flex-shrink-0 cursor-default"></div>

        <!-- Logo (Notion/Linear style with dropdown arrow) -->
        <div class="flex items-center justify-between px-1.5 py-1 mb-2 hover:bg-item-hover rounded-lg cursor-pointer transition-colors group">
          <div class="flex items-center gap-2.5">
            <div class="w-6.5 h-6.5 bg-brand-logo rounded-md flex items-center justify-center text-white shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div class="text-sm font-semibold tracking-wide text-text-primary">织 · Loom</div>
          </div>
          <span class="text-[10px] text-gray-400 group-hover:text-gray-600 mr-0.5 transition-colors">∨</span>
        </div>

        <!-- 导航菜单 -->
        <div class="space-y-1">
          <ul class="space-y-[3px] text-xs font-medium">
            <li 
              @click="selectSource(null)"
              class="relative cursor-pointer flex items-center justify-between rounded-lg transition-all"
              :class="(currentSourceId === null && !selectedFile && !activePluginId) ? 'bg-white text-text-primary font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.03)] pl-4' : 'text-gray-600 hover:bg-item-hover pl-3'"
            >
              <!-- 激活指示条 -->
              <span v-if="currentSourceId === null && !selectedFile && !activePluginId" class="absolute left-1 top-2.5 bottom-2.5 w-1 bg-accent rounded-full"></span>
              
              <div class="flex items-center gap-2.5 py-2">
                <!-- Box/All Files Icon -->
                <svg class="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>全部文件</span>
              </div>
              <span v-if="currentSourceId === null" class="text-[10px] text-gray-400 font-mono pr-2.5">&gt;</span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>最近访问</span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span>收藏夹</span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>回收站</span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              <span>标签</span>
            </li>
          </ul>
        </div>


        <!-- 插件面板 -->
        <div class="space-y-1">
          <div class="text-[9px] font-semibold text-gray-400 tracking-wider uppercase px-3 mb-1.5">插件</div>
          <ul class="space-y-[3px] text-xs font-medium">
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center justify-between rounded-lg transition-colors">
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
                <span>音乐播放器</span>
              </div>
              <span class="h-1 w-1 rounded-full bg-gray-400"></span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center justify-between rounded-lg transition-colors">
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <span>阅读器</span>
              </div>
              <span class="h-1 w-1 rounded-full bg-gray-400"></span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center justify-between rounded-lg transition-colors">
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span>笔记</span>
              </div>
              <span class="h-1 w-1 rounded-full bg-gray-400"></span>
            </li>
            <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>插件市场</span>
            </li>
            <li 
              @click="openPlugin('com.loom.hello', '/plugins/com.loom.hello/index.html')"
              class="relative px-3 py-2 cursor-pointer flex items-center justify-between rounded-lg transition-all"
              :class="activePluginId === 'com.loom.hello' ? 'bg-white text-text-primary font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.03)] pl-4' : 'text-gray-600 hover:bg-item-hover pl-3'"
            >
              <span v-if="activePluginId === 'com.loom.hello'" class="absolute left-1 top-2.5 bottom-2.5 w-1 bg-accent rounded-full"></span>
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
                <span>Hello Sandbox</span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- 底部通知和设置 -->
      <div class="border-t border-border-light pt-3.5 space-y-1 list-none">
        <li class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-all text-xs font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span>通知</span>
        </li>
        <li 
          @click="showSettingsModal = true"
          class="px-3 py-2 text-gray-600 hover:bg-item-hover cursor-pointer flex items-center gap-2.5 rounded-lg transition-all text-xs font-medium"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>设置</span>
        </li>
      </div>
    </aside>

    <!-- 右侧主容器 (包含顶栏 Tab Bar 和主工作区) -->
    <div class="flex-1 flex flex-col min-w-0">
      
      <!-- 顶部 Tab 选项卡栏 (同时作为拖拽区) -->
      <div data-tauri-drag-region class="h-11 border-b border-border-light bg-bg-sidebar flex items-end justify-between pr-3 select-none relative">
        <div data-tauri-drag-region class="flex items-center h-full pt-1.5 pl-3 gap-1">
          
          <!-- Tab 1: 首页 (未激活) -->
          <div class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-gray-500 hover:bg-item-hover active:scale-98 rounded-t-lg cursor-pointer transition-all font-medium">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>首页</span>
          </div>

          <!-- Tab 2: 全部文件 (已激活) -->
          <div class="flex items-center gap-1.5 px-4 py-1.5 text-xs text-text-primary bg-bg-base border-t border-x border-border-light rounded-t-lg font-semibold relative translate-y-[1px]">
            <svg class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>全部文件</span>
            <button class="w-3.5 h-3.5 rounded-full hover:bg-item-hover flex items-center justify-center text-gray-400 hover:text-text-primary transition-colors ml-1 cursor-pointer">
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- 新建 Tab 按钮 -->
          <button class="w-6.5 h-6.5 flex items-center justify-center rounded-md hover:bg-item-hover text-gray-500 hover:text-text-primary transition-colors ml-1.5 mb-1 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>

        <!-- 右上角 Windows 控制按钮 -->
        <div class="flex items-center gap-0.5 pb-2">
          <button 
            @click="minimizeWindow" 
            class="w-6.5 h-6.5 flex items-center justify-center rounded hover:bg-item-hover active:scale-95 transition-all text-gray-500 hover:text-text-primary cursor-pointer"
            title="最小化"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button 
            @click="toggleMaximizeWindow" 
            class="w-6.5 h-6.5 flex items-center justify-center rounded hover:bg-item-hover active:scale-95 transition-all text-gray-500 hover:text-text-primary cursor-pointer"
            title="最大化"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="1.5"></rect>
            </svg>
          </button>
          <button 
            @click="closeWindow" 
            class="w-6.5 h-6.5 flex items-center justify-center rounded hover:bg-red-500 hover:text-white active:scale-95 transition-all text-gray-500 cursor-pointer"
            title="关闭"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- 工作区主体 (工作区和右侧面板) -->
      <div class="flex-1 flex flex-row min-h-0 bg-bg-base">

    <!-- ========================================== -->
    <!-- 2. 中间主面板区 (Main Panel) -->
    <!-- ========================================== -->
    <main v-if="activePluginId" class="flex-1 flex flex-col min-w-0 bg-white relative">
      <div data-tauri-drag-region class="absolute top-0 left-0 right-0 h-4 z-20 cursor-default"></div>
      <PluginHost :pluginId="activePluginId" :entryUrl="activePluginEntry" />
    </main>
    <main v-else class="flex-1 flex flex-col min-w-0 bg-bg-surface p-6.5 pr-2.5 pt-3">
      
      <!-- Window Drag Region for Main Panel -->
      <div data-tauri-drag-region class="h-4 flex-shrink-0 cursor-default w-full"></div>

      <!-- 导航与搜索栏 -->
      <div class="flex items-center gap-3.5 mb-5.5 select-none">
        <!-- 前后进指示箭头 -->
        <div class="flex items-center gap-2.5 text-gray-400 pr-1">
          <button 
            @click="navigateUp" 
            :disabled="currentSourceId === null && currentPath === '/'"
            class="hover:text-text-primary disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
          >
            <!-- Left Arrow -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button class="opacity-30 cursor-not-allowed">
            <!-- Right Arrow -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        <!-- 搜索输入框 (聚焦时柔光蓝边框及阴影) -->
        <div class="flex-1 relative flex items-center">
          <span class="absolute left-3.5 pointer-events-none">
            <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input 
            v-model="searchQuery"
            @input="performSearch"
            type="text" 
            placeholder="搜索文件、文件夹或内容"
            class="w-full bg-bg-base border border-border-light hover:border-gray-300 focus:border-accent focus:bg-bg-surface rounded-lg pl-10.5 pr-14 py-2 text-xs transition-all focus:outline-none placeholder-gray-400 focus:shadow-[0_0_0_3.5px_rgba(79,124,255,0.12)]"
          />
          <!-- ⌘ K Pill -->
          <div class="absolute right-3 px-1.5 py-0.5 border border-border-light bg-bg-surface rounded text-[9px] font-mono text-gray-400 select-none">
            ⌘ K
          </div>
        </div>

        <!-- 列表视图独立按钮 -->
        <button class="p-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg text-text-primary cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:scale-[1.03] active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <!-- 网格视图独立按钮 -->
        <button class="p-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg text-gray-400 hover:text-text-primary cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:scale-[1.03] active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
        <!-- 分栏视图独立按钮 -->
        <button class="p-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg text-gray-400 hover:text-text-primary cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:scale-[1.03] active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 3H3v18h18V3zM9 3v18M15 3v18"></path>
          </svg>
        </button>
        <!-- 标签管理独立按钮 -->
        <button class="p-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg text-gray-400 hover:text-text-primary cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:scale-[1.03] active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
        </button>
        <!-- 更多操作独立按钮 -->
        <button class="p-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg text-gray-400 hover:text-text-primary cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:scale-[1.03] active:scale-95">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
        </button>

        <!-- 添加存储 主按钮 -->
        <button 
          @click="showAddModal = true"
          class="ml-1.5 px-3 py-1.5 bg-text-primary hover:bg-[#333333] text-bg-base rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm flex items-center gap-1.5 active:scale-95 border border-transparent"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>接入存储</span>
        </button>
      </div>

      <!-- 筛选栏 -->
      <div class="flex items-center justify-between border-b border-border-light pb-3 mb-2 font-sans text-xs">
        <div class="flex items-center gap-2">
          <!-- Dropdown Filter Buttons -->
          <button class="px-3 py-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg flex items-center gap-1.5 text-gray-600 transition-colors cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <span>类型</span>
            <span class="text-[9px] text-gray-400 ml-0.5">∨</span>
          </button>
          <button class="px-3 py-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg flex items-center gap-1.5 text-gray-600 transition-colors cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <span>大小</span>
            <span class="text-[9px] text-gray-400 ml-0.5">∨</span>
          </button>
          <button class="px-3 py-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg flex items-center gap-1.5 text-gray-600 transition-colors cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <span>修改时间</span>
            <span class="text-[9px] text-gray-400 ml-0.5">∨</span>
          </button>
          <button class="px-3 py-1.5 border border-border-light bg-bg-surface hover:bg-item-hover rounded-lg flex items-center gap-1.5 text-gray-600 transition-colors cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <span>更多筛选</span>
            <span class="text-[9px] text-gray-400 ml-0.5">∨</span>
          </button>
        </div>
        <div class="flex items-center gap-3 text-gray-400">
          <span class="text-[11px]">共 {{ files.length }} 项</span>
          
          <!-- 新建文件夹 -->
          <button 
            v-if="currentSourceId !== null"
            @click="showMkdirModal = true"
            title="新建文件夹"
            class="hover:text-text-primary transition-colors cursor-pointer mr-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </button>

          <!-- Refresh -->
          <button 
            @click="loadDir(currentSourceId, currentPath)" 
            class="hover:text-text-primary transition-colors cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 文件表格区 -->
      <div class="flex-1 overflow-y-auto no-scrollbar">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="text-gray-400 border-b border-border-light">
              <th class="py-2.5 font-normal">名称</th>
              <th class="py-2.5 font-normal w-24">大小</th>
              <th class="py-2.5 font-normal w-24">类型</th>
              <th class="py-2.5 font-normal w-40">修改时间</th>
              <th class="py-2.5 font-normal w-24">来源</th>
              <th class="py-2.5 font-normal w-28 text-right pr-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light relative">
            <tr 
              v-for="file in displayFiles" 
              :key="file.id"
              @click="handleRowClick(file)"
              @dblclick="handleRowDblClick(file)"
              @contextmenu.prevent="openContextMenu($event, file)"
              class="group hover:bg-item-hover/40 cursor-pointer select-none transition-colors border-b border-border-light/50"
              :class="selectedFile?.id === file.id ? 'bg-item-selected/45' : ''"
            >
              <!-- 1. 名称 (图标 + 名字) -->
              <td class="py-2.5 pr-4 font-normal flex items-center gap-3 text-text-primary">
                <!-- Dynamic File Icon -->
                <span class="text-lg leading-none flex items-center justify-center">
                  <span v-if="file.is_dir">📁</span>
                  <span v-else-if="getFileIcon(file) === 'markdown'">📝</span>
                  <span v-else-if="getFileIcon(file) === 'excel'">📊</span>
                  <span v-else-if="getFileIcon(file) === 'word'">📄</span>
                  <span v-else-if="getFileIcon(file) === 'powerpoint'">📉</span>
                  <span v-else-if="getFileIcon(file) === 'pdf'">📕</span>
                  <span v-else-if="getFileIcon(file) === 'image'">🖼️</span>
                  <span v-else-if="getFileIcon(file) === 'video'">🎥</span>
                  <span v-else-if="getFileIcon(file) === 'audio'">🎵</span>
                  <span v-else-if="getFileIcon(file) === 'archive'">📦</span>
                  <span v-else-if="getFileIcon(file) === 'figma'">🎨</span>
                  <span v-else>📎</span>
                </span>
                
                <!-- Inline Rename Input vs Display Span -->
                <input 
                  v-if="renamingFileId === file.id"
                  v-model="renameInput"
                  @blur="confirmRename"
                  @keyup.enter="confirmRename"
                  @keyup.esc="renamingFileId = null"
                  autoFocus
                  class="bg-bg-surface border border-accent rounded px-1.5 py-0.5 outline-none text-[12.5px] w-48 text-text-primary"
                  @click.stop
                />
                <span v-else class="truncate font-medium text-[12.5px] max-w-[260px] tracking-wide" :title="file.name">{{ file.name }}</span>
              </td>
              <!-- 2. 大小 -->
              <td class="py-2.5 text-gray-500 font-mono text-[11px] tabular-nums">
                {{ file.is_dir ? '—' : formatBytes(file.size_bytes) }}
              </td>
              <!-- 3. 类型 -->
              <td class="py-2.5 text-gray-500 text-[11.5px]">
                {{ getFileTypeDisplay(file) }}
              </td>
              <!-- 4. 修改时间 -->
              <td class="py-3 text-gray-400 font-mono text-[11px] tabular-nums">
                {{ formatDate(file.mtime) }}
              </td>
              <!-- 5. 来源 -->
              <td class="py-3 text-gray-500 text-[11.5px]">
                {{ file.source_name || '—' }}
              </td>
              <!-- 6. 行操作 -->
              <td class="py-3 text-right">
                <button class="text-gray-400 opacity-60 hover:opacity-100 hover:text-text-primary px-1.5 transition-opacity cursor-pointer">
                  •••
                </button>
              </td>
            </tr>

            <tr v-if="files.length === 0 && !isLoading">
              <td colspan="6" class="py-16 text-center text-xs italic text-gray-400">
                {{ isSearching ? '未在全文检索中找到匹配项。' : '当前目录无文件。' }}
              </td>
            </tr>
            <!-- 加载中状态 -->
            <tr v-if="isLoading">
              <td colspan="6" class="py-16 text-center text-xs text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <svg class="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path>
                  </svg>
                  <span>正在从后端获取文件...</span>
                </div>
              </td>
            </tr>
            <!-- 触底观察锚点 -->
            <tr ref="observerTarget" class="h-2 opacity-0 pointer-events-none w-full"><td colspan="6"></td></tr>
          </tbody>
        </table>
      </div>
    </main>

    <!-- ========================================== -->
    <!-- 3. 右侧信息看板 (Right Sidebar) -->
    <!-- ========================================== -->
    <aside class="w-80 border-l border-border-light bg-bg-base p-4.5 flex flex-col min-h-0 select-none overflow-y-auto no-scrollbar">
      
      <!-- 预览模式：如果单选了文件，显示该文件的预览 -->
      <div v-if="selectedFile" class="flex-1 flex flex-col justify-between h-full bg-bg-surface border border-border-light rounded-lg p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
        <div class="space-y-5">
          <div class="text-[10px] tracking-widest font-semibold text-gray-400 uppercase border-b border-border-light pb-2">
            文件预览
          </div>

          <!-- 图片预览 -->
          <div v-if="selectedFile.category === 'image'" class="bg-bg-base border border-border-light rounded-lg p-2.5 flex items-center justify-center overflow-hidden aspect-square">
            <img 
              :src="getPreviewUrl(selectedFile.source_id, selectedFile.vpath)"
              class="max-w-full max-h-full object-contain rounded" 
            />
          </div>

          <!-- 视频预览 -->
          <div v-else-if="selectedFile.category === 'video'" class="bg-bg-base border border-border-light rounded-lg overflow-hidden aspect-video flex items-center justify-center">
            <video 
              controls 
              class="w-full h-full"
              :src="getPreviewUrl(selectedFile.source_id, selectedFile.vpath)"
            ></video>
          </div>

          <!-- PDF 预览 -->
          <div v-else-if="selectedFile.ext === 'pdf'" class="bg-bg-base border border-border-light rounded-lg min-h-[300px] relative overflow-hidden">
            <iframe 
              :src="getPreviewUrl(selectedFile.source_id, selectedFile.vpath)"
              class="w-full h-full border-none absolute inset-0"
            ></iframe>
          </div>

          <!-- 音频预览 -->
          <div v-else-if="selectedFile.category === 'audio'" class="bg-bg-base border border-border-light rounded-lg p-4 flex flex-col items-center gap-3">
            <div class="text-3xl">🎵</div>
            <audio 
              controls 
              class="w-full"
              :src="getPreviewUrl(selectedFile.source_id, selectedFile.vpath)"
            ></audio>
          </div>

          <!-- 无预览的占位图标 -->
          <div v-else class="bg-bg-base border border-border-light rounded-lg p-6 flex flex-col items-center justify-center gap-3">
            <span class="text-4xl">
              <span v-if="selectedFile.is_dir">📁</span>
              <span v-else>📄</span>
            </span>
            <span class="text-xs text-gray-400">该格式暂不支持流式直接预览</span>
          </div>

          <!-- 详细元数据信息 -->
          <div class="space-y-3 font-sans text-xs">
            <div class="font-semibold text-sm break-all text-text-primary leading-snug">
              {{ selectedFile.name }}
            </div>
            <div class="space-y-2 border-t border-border-light pt-3 text-gray-500">
              <div class="flex justify-between">
                <span>类型</span>
                <span class="text-text-primary font-medium">{{ getFileTypeDisplay(selectedFile) }}</span>
              </div>
              <div class="flex justify-between">
                <span>大小</span>
                <span class="text-text-primary font-mono tabular-nums font-medium">{{ formatBytes(selectedFile.size_bytes) }}</span>
              </div>
              <div class="flex justify-between">
                <span>修改时间</span>
                <span class="text-text-primary font-mono tabular-nums font-medium">{{ formatDate(selectedFile.mtime) }}</span>
              </div>
              <div class="flex justify-between">
                <span>来源数据源</span>
                <span class="text-text-primary font-medium">{{ selectedFile.source_name }}</span>
              </div>
              <div class="flex justify-between">
                <span>VFS 虚拟路径</span>
                <span class="text-text-primary font-mono break-all text-right max-w-[180px] leading-normal">{{ selectedFile.vpath }}</span>
              </div>
            </div>
          </div>
        </div>

        <button 
          @click="selectedFile = null" 
          class="w-full border border-border-light rounded-lg py-2 text-xs text-gray-500 hover:bg-item-hover cursor-pointer font-medium mt-6 transition-colors"
        >
          关闭预览
        </button>
      </div>

      <!-- 看板模式：默认显示“存储预览”和“分类统计” -->
      <div v-else class="space-y-4 flex-1 flex flex-col">
        
        <!-- 存储预览卡片 -->
        <div class="bg-bg-surface border border-border-light rounded-lg p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-3.5">
          <div class="text-[10px] tracking-widest font-semibold text-gray-400 uppercase">
            存储预览
          </div>
          
          <div class="space-y-3.5 text-xs">
            <!-- 动态循环列出所有源的用量 -->
            <div 
              v-for="stat in bentoStats.source_statistics" 
              :key="stat.source_id" 
              @click="selectSource(stat.source_id)"
              class="group space-y-1.5 cursor-pointer"
            >
              <div class="flex justify-between items-center text-text-primary">
                <div class="flex items-center gap-2">
                  <span class="text-gray-400 group-hover:text-accent transition-colors">
                    <svg v-if="stat.source_name === '本地磁盘'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                    </svg>
                  </span>
                  <span class="font-medium group-hover:text-accent transition-colors">{{ stat.source_name }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-500 font-mono text-[11px] tabular-nums">
                    <template v-if="stat.physical_capacity">
                      {{ formatBytes(stat.total_size) }} / {{ formatBytes(stat.physical_capacity) }}
                    </template>
                    <template v-else>
                      已索引 {{ formatBytes(stat.total_size) }}
                    </template>
                  </span>
                  <!-- 删除按钮 (仅悬停时显示) -->
                  <button 
                    @click.stop="deleteSourceInSettings(stat.source_id)" 
                    class="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all cursor-pointer"
                    title="删除磁盘"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <!-- 进度条 -->
              <div class="flex items-center gap-2.5" :title="stat.physical_capacity ? '物理磁盘真实容量比' : '当前全应用内索引容量占比'">
                <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-text-primary rounded-full transition-all" 
                    :style="{ 
                      width: stat.physical_capacity 
                        ? Math.min(100, (stat.total_size / stat.physical_capacity) * 100) + '%'
                        : (totalStorageUsed > 0 ? (stat.total_size / totalStorageUsed * 100) + '%' : '0%')
                    }"
                  ></div>
                </div>
                <span class="text-[10px] text-gray-400 font-mono w-8 text-right tabular-nums">
                  <template v-if="stat.physical_capacity">
                    {{ Math.round(Math.min(100, (stat.total_size / stat.physical_capacity) * 100)) }}%
                  </template>
                  <template v-else>
                    {{ totalStorageUsed > 0 ? Math.round((stat.total_size / totalStorageUsed) * 100) : 0 }}%
                  </template>
                </span>
              </div>
            </div>

            <!-- 数据源为空的提示 -->
            <div v-if="bentoStats.source_statistics.length === 0" class="text-xs text-gray-400 italic py-2">
              暂未连接存储设备，请在设置中添加。
            </div>

            <!-- 总计空间 -->
            <div class="border-t border-border-light pt-3.5 space-y-1.5">
              <div class="flex justify-between items-center text-text-primary font-medium">
                <span>总计</span>
                <span class="font-mono text-[11px] tabular-nums text-gray-500">
                  {{ formatBytes(totalStorageUsed) }} / {{ bentoStats.source_statistics.length * 100 }} GB
                </span>
              </div>
              <div class="flex items-center gap-2.5">
                <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-[#333333] rounded-full transition-all" 
                    :style="{ width: (bentoStats.source_statistics.length > 0 ? Math.min(100, (totalStorageUsed / (bentoStats.source_statistics.length * 100 * 1024 * 1024 * 1024)) * 100) : 0) + '%' }"
                  ></div>
                </div>
                <span class="text-[10px] text-gray-400 font-mono w-7 text-right tabular-nums">
                  {{ bentoStats.source_statistics.length > 0 ? Math.round(Math.min(100, (totalStorageUsed / (bentoStats.source_statistics.length * 100 * 1024 * 1024 * 1024)) * 100)) : 0 }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件分类统计卡片 -->
        <div class="bg-bg-surface border border-border-light rounded-lg p-5 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-3 flex-1 flex flex-col min-h-0">
          <div class="text-[10px] tracking-widest font-semibold text-gray-400 uppercase mb-1">
            文件分类统计
          </div>

          <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 text-xs pr-1">
            <div v-for="item in statsMap" :key="item.name" class="flex items-center justify-between py-1 text-gray-600 hover:text-text-primary transition-colors">
              <div class="flex items-center gap-2.5">
                <span class="text-sm">
                  <span v-if="item.icon === 'folder'">📁</span>
                  <span v-else-if="item.icon === 'doc'">📄</span>
                  <span v-else-if="item.icon === 'image'">🖼️</span>
                  <span v-else-if="item.icon === 'video'">🎥</span>
                  <span v-else-if="item.icon === 'audio'">🎵</span>
                  <span v-else-if="item.icon === 'archive'">📦</span>
                  <span v-else>📎</span>
                </span>
                <span class="font-medium">{{ item.name }}</span>
              </div>
              <div class="flex items-center gap-4 text-gray-400">
                <span class="font-mono text-[10.5px] w-8 text-right tabular-nums">{{ item.count }}</span>
                <span class="font-mono text-[10.5px] w-16 text-right tabular-nums text-gray-500">{{ item.icon === 'folder' ? '—' : formatBytes(item.size) }}</span>
              </div>
            </div>
          </div>

          <!-- 分类底侧汇总 -->
          <div class="border-t border-border-light pt-3 mt-3 flex justify-between items-center text-xs text-gray-400 font-mono">
            <span>共 {{ totalItemsCount }} 项</span>
            <span class="text-gray-500 font-medium">{{ formatBytes(totalFilesSize) }}</span>
          </div>
        </div>

      </div>
    </aside>

    <!-- ========================================== -->
    <!-- 4. 极简工业模态框: 添加数据源 -->
    <!-- ========================================== -->
    <div v-if="showAddModal" class="fixed inset-0 bg-text-primary/30 backdrop-blur-[1px] z-50 flex items-center justify-center">
      <div class="bg-bg-surface border border-border-light w-[420px] p-6.5 rounded-lg space-y-4.5 shadow-2xl">
        <div class="text-[11px] font-bold text-gray-400 tracking-wider uppercase border-b border-border-light pb-1.5">
          连接存储设备 // Connect Source
        </div>
        
        <!-- 类型选择 -->
        <div class="space-y-1.5 text-xs">
          <label class="text-[9px] font-bold text-gray-400 uppercase">源类型 (Type)</label>
          <div class="grid grid-cols-2 gap-2.5">
            <button 
              @click="newSourceKind = 'local'"
              class="border py-2 font-bold cursor-pointer text-center text-[10.5px] rounded-lg transition-colors"
              :class="newSourceKind === 'local' ? 'bg-text-primary text-bg-surface border-text-primary' : 'border-border-light hover:bg-item-hover text-gray-600'"
            >
              本地磁盘
            </button>
            <button 
              @click="newSourceKind = 'webdav'"
              class="border py-2 font-bold cursor-pointer text-center text-[10.5px] rounded-lg transition-colors"
              :class="newSourceKind === 'webdav' ? 'bg-text-primary text-bg-surface border-text-primary' : 'border-border-light hover:bg-item-hover text-gray-600'"
            >
              WebDAV 云盘
            </button>
          </div>
        </div>

        <!-- 名字 -->
        <div class="space-y-1.5 text-xs">
          <label class="text-[9px] font-bold text-gray-400 uppercase">设备名称 (Name)</label>
          <input 
            v-model="newSourceName"
            type="text" 
            placeholder="例如：本地磁盘、我的坚果云"
            class="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
          />
        </div>

        <!-- 本地路径 -->
        <div v-if="newSourceKind === 'local'" class="space-y-1.5 text-xs">
          <label class="text-[9px] font-bold text-gray-400 uppercase">绝对路径 (Absolute Path)</label>
          <div class="flex items-center gap-2">
            <input 
              v-model="localPath"
              type="text" 
              placeholder="例如：D:/MyMusic 或 /Users/me/Documents"
              class="flex-1 bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
            />
            <button 
              @click="selectLocalDirectory" 
              class="px-3 py-2 bg-bg-base border border-border-light hover:bg-item-hover rounded-lg font-medium text-text-primary cursor-pointer transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.01)] flex-shrink-0"
              title="浏览文件夹"
            >
              浏览...
            </button>
          </div>
        </div>

        <!-- WebDAV 配置 -->
        <div v-else class="space-y-3.5">
          <div class="space-y-1.5 text-xs">
            <label class="text-[9px] font-bold text-gray-400 uppercase">服务器端点 (URL)</label>
            <input 
              v-model="webdavUrl"
              type="text" 
              class="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
            />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div class="space-y-1.5 text-xs">
              <label class="text-[9px] font-bold text-gray-400 uppercase">用户名 (User)</label>
              <input 
                v-model="webdavUser"
                type="text" 
                placeholder="邮箱或用户名"
                class="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
              />
            </div>
            <div class="space-y-1.5 text-xs">
              <label class="text-[9px] font-bold text-gray-400 uppercase">应用密码 (Password)</label>
              <input 
                v-model="webdavToken"
                type="password" 
                placeholder="密码或应用 Token"
                class="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
              />
            </div>
          </div>
        </div>

        <!-- 操作 -->
        <div class="border-t border-border-light pt-4 flex justify-end gap-2 text-xs font-semibold">
          <button 
            @click="showAddModal = false"
            class="px-4 py-2 border border-border-light rounded-lg hover:bg-item-hover cursor-pointer text-gray-500"
          >
            取消
          </button>
          <button 
            @click="addSource"
            class="px-4 py-2 bg-text-primary hover:bg-accent text-bg-surface rounded-lg cursor-pointer transition-colors"
          >
            连接设备
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- 5. 设置控制面板模态框 -->
    <!-- ========================================== -->
    <div v-if="showSettingsModal" class="fixed inset-0 bg-text-primary/30 backdrop-blur-[1px] z-50 flex items-center justify-center">
      <div class="bg-bg-surface border border-border-light w-[450px] p-6.5 rounded-lg space-y-4.5 shadow-2xl">
        <div class="text-[11px] font-bold text-gray-400 tracking-wider uppercase border-b border-border-light pb-1.5">
          系统设置与诊断面板 // System Settings
        </div>

        <!-- 已连接的数据源列表管理 -->
        <div class="space-y-2 text-xs">
          <div class="text-[9px] font-bold text-gray-400 uppercase mb-1">存储设备管理</div>
          <div class="border border-border-light rounded-lg divide-y divide-border-light max-h-36 overflow-y-auto no-scrollbar">
            <div 
              v-for="src in sources" 
              :key="src.id"
              class="px-3 py-2.5 flex items-center justify-between hover:bg-item-hover"
            >
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded text-[9px] bg-bg-base text-gray-500 uppercase">{{ src.kind }}</span>
                <span class="font-medium text-text-primary">{{ src.name }}</span>
              </div>
              <button 
                @click="deleteSourceInSettings(src.id)"
                class="text-red-500 hover:text-red-700 font-medium cursor-pointer"
              >
                移除
              </button>
            </div>
            <div v-if="sources.length === 0" class="p-3 text-center text-gray-400 italic text-[11px]">
              无已连接的数据源
            </div>
          </div>
        </div>

        <!-- Tauri Command 诊断调试 -->
        <div class="border-t border-border-light pt-4 space-y-2 text-xs">
          <div class="text-[9px] font-bold text-gray-400 uppercase">Tauri Core 诊断测试 (Greet)</div>
          <div class="flex gap-2">
            <input 
              v-model="greetName"
              type="text" 
              class="flex-1 bg-bg-base border border-border-light rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-400 text-xs text-text-primary"
            />
            <button 
              @click="greet"
              class="bg-text-primary hover:bg-accent text-bg-surface rounded-lg px-4 py-1.5 cursor-pointer transition-colors"
            >
              运行测试
            </button>
          </div>
          <div v-if="greetMsg" class="font-mono text-[10px] text-accent p-2 bg-orange-50/50 border border-orange-100 rounded-lg leading-relaxed break-all">
            {{ greetMsg }}
          </div>
        </div>

        <!-- 退出设置 -->
        <div class="border-t border-border-light pt-4 flex justify-end text-xs font-semibold">
          <button 
            @click="showSettingsModal = false"
            class="px-4 py-2 bg-text-primary text-bg-surface rounded-lg hover:bg-gray-800 cursor-pointer"
          >
            完成并关闭
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- 极简工业模态框: 危险操作确认 -->
    <!-- ========================================== -->
    <div v-if="showDeleteConfirmModal" class="fixed inset-0 bg-text-primary/30 backdrop-blur-[1px] z-50 flex items-center justify-center">
      <div class="bg-bg-surface border border-border-light w-[400px] p-6.5 rounded-lg space-y-5 shadow-2xl">
        <div class="flex items-center gap-2.5 border-b border-border-light pb-2">
          <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="text-[12px] font-bold text-gray-800 tracking-wider">
            彻底卸载该存储源？
          </div>
        </div>
        
        <div class="space-y-3 text-xs text-gray-500 leading-relaxed">
          <p>此操作将清空其在本应用内的所有高速索引缓存，<span class="text-text-primary font-semibold">且该操作无法恢复。</span></p>
          <div class="bg-gray-50 border border-gray-100 rounded p-2.5 text-[10px] text-gray-400">
            安全提示：作为 BYOS 系统，Loom 绝不会修改或删除您的任何物理磁盘文件或云端源数据。
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <button 
            @click="showDeleteConfirmModal = false"
            class="px-4 py-2 border border-border-light hover:bg-item-hover text-gray-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            取消
          </button>
          <button 
            @click="confirmDeleteSource"
            class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            彻底卸载
          </button>
        </div>
      </div>
    </div>
    </div>

    <!-- ========================================== -->
    <!-- 7. 右键上下文菜单 (Context Menu) -->
    <!-- ========================================== -->
    <div 
      v-show="contextMenu.visible" 
      class="fixed bg-bg-surface border border-border-light rounded-lg shadow-lg py-1.5 w-40 z-50 text-[11.5px] font-medium"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button 
        @click="startRename" 
        class="w-full text-left px-4 py-1.5 hover:bg-item-hover text-text-primary cursor-pointer transition-colors"
      >
        重命名
      </button>
      <div class="h-px bg-border-light my-1"></div>
      <button 
        @click="deleteFile" 
        class="w-full text-left px-4 py-1.5 hover:bg-red-50 text-red-500 cursor-pointer transition-colors"
      >
        永久删除
      </button>
    </div>

    <!-- ========================================== -->
    <!-- 8. 新建文件夹模态框 -->
    <!-- ========================================== -->
    <div v-if="showMkdirModal" class="fixed inset-0 bg-text-primary/30 backdrop-blur-[1px] z-50 flex items-center justify-center" @click.self="showMkdirModal = false">
      <div class="bg-bg-surface border border-border-light w-[340px] p-5 rounded-lg space-y-4 shadow-2xl">
        <div class="text-[11px] font-bold text-gray-400 tracking-wider uppercase border-b border-border-light pb-1.5">
          新建文件夹
        </div>
        <div class="space-y-1.5 text-xs">
          <label class="text-[9px] font-bold text-gray-400 uppercase">文件夹名称</label>
          <input 
            v-model="newFolderName"
            @keyup.enter="confirmMkdir"
            @keyup.esc="showMkdirModal = false"
            autoFocus
            type="text" 
            placeholder="未命名文件夹"
            class="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent text-xs text-text-primary transition-all"
          />
        </div>
        <div class="border-t border-border-light pt-3 flex justify-end gap-2 text-xs font-semibold">
          <button 
            @click="showMkdirModal = false"
            class="px-4 py-1.5 border border-border-light rounded-lg hover:bg-item-hover cursor-pointer text-gray-500"
          >
            取消
          </button>
          <button 
            @click="confirmMkdir"
            class="px-4 py-1.5 bg-text-primary hover:bg-accent text-bg-surface rounded-lg cursor-pointer transition-colors"
          >
            创建
          </button>
        </div>
      </div>
    </div>

  </div>
  </div>
</template>

<style scoped>
/* 自定义列表滚动条和过渡，保持纯净极简感 */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>