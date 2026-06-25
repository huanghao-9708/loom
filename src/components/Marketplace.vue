<template>
  <div class="marketplace w-full h-full flex flex-col bg-bg-base overflow-hidden select-none">
    <!-- 顶栏：搜索 + 标签筛选 -->
    <div class="flex-shrink-0 px-6 pt-5 pb-3 space-y-3.5 border-b border-border-light">
      <div class="flex items-center gap-3">
        <svg class="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索插件..."
          class="flex-1 bg-transparent text-sm text-text-primary placeholder-gray-400 outline-none font-medium"
          @input="applyFilters"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''; applyFilters()"
          class="text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button
          @click="refreshRegistry"
          :disabled="loading"
          class="text-gray-400 hover:text-gray-600 cursor-pointer transition-all"
          :class="{ 'animate-spin opacity-50': loading }"
          title="刷新市场"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>

      <!-- 标签筛选 -->
      <div v-if="allTags.length > 0" class="flex items-center gap-1.5 flex-wrap">
        <button
          @click="selectedTag = null; applyFilters()"
          class="px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer border"
          :class="selectedTag === null ? 'bg-text-primary text-bg-surface border-text-primary' : 'text-gray-500 border-gray-200 hover:border-gray-400'"
        >
          全部
        </button>
        <button
          v-for="tag in allTags"
          :key="tag"
          @click="selectedTag = (selectedTag === tag ? null : tag); applyFilters()"
          class="px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer border"
          :class="selectedTag === tag ? 'bg-text-primary text-bg-surface border-text-primary' : 'text-gray-500 border-gray-200 hover:border-gray-400'"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <!-- 状态指示 -->
    <div v-if="loading && entries.length === 0" class="flex-1 flex items-center justify-center">
      <div class="flex items-center gap-3 text-gray-400 text-xs">
        <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="font-medium">正在拉取插件市场...</span>
      </div>
    </div>

    <div v-else-if="errorMsg && entries.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-3 max-w-xs">
        <svg class="w-8 h-8 mx-auto text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div class="text-xs text-gray-400 leading-relaxed">
          <p class="font-medium text-gray-500 mb-1">无法连接插件市场</p>
          <p>{{ errorMsg }}</p>
        </div>
        <button
          @click="refreshRegistry"
          class="px-4 py-1.5 text-[11px] font-semibold text-accent border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          重试
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="filteredEntries.length === 0 && !loading" class="flex-1 flex items-center justify-center">
      <div class="text-center text-xs text-gray-400 space-y-1">
        <p class="font-medium text-gray-500">未找到匹配的插件</p>
        <p>试试其他关键词或标签</p>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="flex-1 overflow-y-auto px-5 py-4 no-scrollbar">
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          @click="openDetail(entry)"
          class="border border-border-light rounded-lg p-4 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all bg-bg-surface space-y-2.5 group"
        >
          <!-- 头部：图标 + 名称 -->
          <div class="flex items-start gap-2.5">
            <img
              v-if="entry.iconUrl"
              :src="entry.iconUrl"
              class="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-gray-100"
              @error="(e: any) => e.target.style.display = 'none'"
            />
            <div v-else class="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg class="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-semibold text-text-primary truncate">{{ entry.name }}</div>
              <div class="text-[10px] text-gray-400 font-mono truncate mt-0.5">{{ entry.id }}</div>
            </div>
          </div>

          <!-- 描述 -->
          <p class="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{{ entry.description || '暂无描述' }}</p>

          <!-- 底部：作者 + 标签 + 操作按钮 -->
          <div class="flex items-end justify-between gap-2">
            <div class="space-y-1.5 min-w-0">
              <div class="text-[10px] text-gray-400 truncate">{{ entry.author || '未知' }}</div>
              <div class="flex gap-1 flex-wrap" v-if="entry.tags && entry.tags.length">
                <span
                  v-for="tag in entry.tags.slice(0, 3)"
                  :key="tag"
                  class="px-1.5 py-px rounded text-[9px] bg-gray-100 text-gray-500 font-medium"
                >{{ tag }}</span>
              </div>
            </div>
            <button
              @click.stop="actionFor(entry)"
              :disabled="isActionDisabled(entry.id)"
              class="flex-shrink-0 px-3 py-1.5 rounded text-[10px] font-semibold cursor-pointer transition-all border"
              :class="actionClass(entry.id)"
            >
              <span v-if="downloadProgress[entry.id] !== undefined">
                {{ downloadProgress[entry.id] }}%
              </span>
              <span v-else>{{ actionLabel(entry.id) }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 统计提示 -->
      <div class="text-center py-6">
        <span class="text-[10px] text-gray-300 font-medium">
          {{ filteredEntries.length }} 个插件 · Registry v{{ registry?.registryVersion }}
        </span>
      </div>
    </div>

    <!-- 详情弹窗插入点（由父组件控制或使用 Teleport 显示） -->
    <slot name="detail" :entry="selectedEntry" :install="marketInstall" :update="marketUpdate" :progress="downloadProgress" :close="closeDetail" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ==========================================
// 类型定义（与 Rust market.rs 对齐）
// ==========================================
interface RegistryIndex {
  registryVersion: number;
  updatedAt: string;
  plugins: RegistryEntry[];
}

interface RegistryEntry {
  id: string;
  name: string;
  description?: string;
  version: string;
  iconUrl?: string;
  author?: string;
  tags?: string[];
  downloadUrl: string;
  sha256: string;
  minAppVersion?: string;
  homepage?: string;
  permissions?: {
    vfs?: string[];
    db?: boolean;
    net?: string[];
  };
}

interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

// ==========================================
// 状态
// ==========================================
const registry = ref<RegistryIndex | null>(null);
const entries = ref<RegistryEntry[]>([]);
const installedIds = ref<Set<string>>(new Set());
const installedVersions = ref<Map<string, string>>(new Map());
const updateIds = ref<Set<string>>(new Set());

const loading = ref<boolean>(false);
const errorMsg = ref<string>('');
const searchQuery = ref<string>('');
const selectedTag = ref<string | null>(null);
const downloadProgress = ref<Record<string, number>>({});

const selectedEntry = ref<RegistryEntry | null>(null);
let unlistenProgress: UnlistenFn | null = null;

// ==========================================
// 事件：由父组件控制详情弹窗
// ==========================================
const emit = defineEmits<{
  detail: [entry: RegistryEntry];
}>();

// ==========================================
// 计算属性
// ==========================================
const allTags = computed(() => {
  const s = new Set<string>();
  for (const e of entries.value) {
    (e.tags || []).forEach((t: string) => s.add(t));
  }
  return Array.from(s).sort();
});

const filteredEntries = computed(() => {
  let list = entries.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
    );
  }
  if (selectedTag.value) {
    list = list.filter((e) => (e.tags || []).includes(selectedTag.value!));
  }
  return list;
});

// ==========================================
// 方法
// ==========================================
const refreshRegistry = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const idx = await invoke<RegistryIndex>('cmd_fetch_registry');
    registry.value = idx;
    entries.value = idx.plugins || [];
  } catch (e: any) {
    errorMsg.value = e?.toString?.() || '未知错误';
  } finally {
    loading.value = false;
  }
};

const loadInstalledState = async () => {
  try {
    const installed = await invoke<PluginManifest[]>('cmd_get_installed_plugins');
    const ids = new Set<string>();
    const vers = new Map<string, string>();
    for (const p of installed) {
      ids.add(p.id);
      vers.set(p.id, p.version);
    }
    installedIds.value = ids;
    installedVersions.value = vers;

    // 检查更新
    try {
      const updates: any[] = await invoke('cmd_check_updates');
      const upIds = new Set<string>();
      for (const u of updates) upIds.add(u.id);
      updateIds.value = upIds;
    } catch (_) {
      updateIds.value = new Set();
    }
  } catch (_) {
    installedIds.value = new Set();
  }
};

const applyFilters = () => {
  // 搜索和标签变更已由 computed 响应式驱动
};

// 操作按钮逻辑
type ActionType = 'install' | 'update' | 'installed' | 'loading';

const getActionType = (pluginId: string): ActionType => {
  if (downloadProgress.value[pluginId] !== undefined) return 'loading';
  if (updateIds.value.has(pluginId)) return 'update';
  if (installedIds.value.has(pluginId)) return 'installed';
  return 'install';
};

const actionLabel = (pluginId: string): string => {
  const t = getActionType(pluginId);
  switch (t) {
    case 'update':
      return '更新';
    case 'installed':
      return '已安装';
    case 'loading':
      return `${downloadProgress.value[pluginId] || 0}%`;
    default:
      return '获取';
  }
};

const actionClass = (pluginId: string): string => {
  const t = getActionType(pluginId);
  switch (t) {
    case 'update':
      return 'text-white bg-accent border-accent hover:bg-orange-600';
    case 'installed':
      return 'text-gray-400 bg-gray-50 border-gray-100 cursor-default';
    case 'loading':
      return 'text-accent bg-orange-50 border-orange-100 cursor-default';
    default:
      return 'text-text-primary border-gray-300 hover:bg-gray-50';
  }
};

const isActionDisabled = (pluginId: string): boolean => {
  const t = getActionType(pluginId);
  return t === 'installed' || t === 'loading';
};

const actionFor = (entry: RegistryEntry) => {
  const t = getActionType(entry.id);
  if (t === 'install') {
    marketInstall(entry);
  } else if (t === 'update') {
    marketUpdate(entry);
  }
  // installed / loading → 无操作（防冒泡点击）
};

const marketInstall = async (entry: RegistryEntry) => {
  downloadProgress.value[entry.id] = 0;
  try {
    await invoke('cmd_market_install', { entry });
    await loadInstalledState();
    emit('detail', entry); // 安装后提示
  } catch (e: any) {
    console.error('Market install failed:', e);
    delete downloadProgress.value[entry.id];
    throw e;
  } finally {
    delete downloadProgress.value[entry.id];
  }
};

const marketUpdate = async (entry: RegistryEntry) => {
  downloadProgress.value[entry.id] = 0;
  try {
    await invoke('cmd_market_update', { entry });
    await loadInstalledState();
  } catch (e: any) {
    console.error('Market update failed:', e);
    throw e;
  } finally {
    delete downloadProgress.value[entry.id];
  }
};

const openDetail = (entry: RegistryEntry) => {
  selectedEntry.value = entry;
  emit('detail', entry);
};

const closeDetail = () => {
  selectedEntry.value = null;
};

// ==========================================
// 生命周期
// ==========================================
onMounted(async () => {
  await Promise.all([refreshRegistry(), loadInstalledState()]);

  // 监听下载进度
  unlistenProgress = await listen('download-progress', (event: any) => {
    const { id, received, total, verified } = event.payload;
    if (total > 0 && !verified) {
      downloadProgress.value[id] = Math.round((received / total) * 100);
    } else if (verified) {
      downloadProgress.value[id] = 100;
    }
  });
});

onUnmounted(() => {
  if (unlistenProgress) unlistenProgress();
});
</script>
