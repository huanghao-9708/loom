<template>
  <Teleport to="body">
    <div
      v-if="entry"
      class="fixed inset-0 bg-text-primary/25 backdrop-blur-[1px] z-50 flex items-center justify-center"
      @click.self="!processing && emit('close')"
    >
      <div class="bg-bg-surface border border-border-light w-[480px] max-h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <!-- 头部：图标 + 名称 + 作者 -->
        <div class="flex-shrink-0 p-5 pb-4 border-b border-border-light space-y-3">
          <div class="flex items-start gap-3">
            <img
              v-if="entry.iconUrl"
              :src="entry.iconUrl"
              class="w-11 h-11 rounded-lg object-cover bg-gray-100 flex-shrink-0"
              @error="(e: any) => e.target.style.display = 'none'"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-bold text-text-primary truncate">{{ entry.name }}</h2>
                <span class="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-gray-500 font-mono flex-shrink-0">v{{ entry.version }}</span>
              </div>
              <div class="text-[10px] text-gray-400 font-mono truncate mt-0.5">{{ entry.id }}</div>
              <div class="text-[11px] text-gray-500 mt-1" v-if="entry.author">作者：{{ entry.author }}</div>
            </div>
          </div>

          <!-- 标签 -->
          <div class="flex gap-1 flex-wrap" v-if="entry.tags && entry.tags.length">
            <span
              v-for="tag in entry.tags"
              :key="tag"
              class="px-2 py-0.5 rounded-full text-[9px] font-medium bg-gray-100 text-gray-500"
            >{{ tag }}</span>
          </div>
        </div>

        <!-- 内容区：描述 + 权限确认 + 进度 -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs no-scrollbar">
          <!-- 描述 -->
          <div>
            <div class="text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">简介</div>
            <p class="text-gray-600 leading-relaxed">{{ entry.description || '暂无描述' }}</p>
          </div>

          <!-- 版本与操作状态 -->
          <div>
            <div class="text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">状态</div>
            <div class="flex items-center gap-2">
              <span
                v-if="installedVersion"
                class="px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600 border border-green-100"
              >
                已安装 v{{ installedVersion }}
              </span>
              <span v-else class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-400 border border-gray-100">
                未安装
              </span>
              <span
                v-if="updateAvailable"
                class="px-2 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-accent border border-orange-100"
              >
                v{{ entry.version }} 可用
              </span>
            </div>
          </div>

          <!-- 权限清单（安装前展示） -->
          <div v-if="entry.permissions && hasPermissions">
            <div class="flex items-center justify-between mb-1.5">
              <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">所需权限</div>
              <span
                v-if="!permissionsAccepted && !installedVersion"
                class="text-[9px] text-orange-500 font-medium"
              >安装前请审阅</span>
            </div>
            <div class="space-y-1.5">
              <div v-if="entry.permissions.vfs?.length" class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[9px] bg-blue-50 text-blue-600 border border-blue-100 font-medium">VFS</span>
                <span class="text-gray-500 text-[10px]">
                  {{ entry.permissions.vfs.includes('read') ? '可读取' : '' }}{{ entry.permissions.vfs.includes('write') ? ' · 可写入' : '' }}文件系统中的文件索引
                </span>
              </div>
              <div v-if="entry.permissions.db" class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[9px] bg-purple-50 text-purple-600 border border-purple-100 font-medium">数据库</span>
                <span class="text-gray-500 text-[10px]">创建并使用独立的 SQLite 数据库</span>
              </div>
              <div v-if="entry.permissions.net?.length" class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[9px] bg-red-50 text-red-600 border border-red-100 font-medium">☢ 网络</span>
                <span class="text-gray-500 text-[10px]">允许访问网络（{{ entry.permissions.net.join(', ') }}）</span>
              </div>
            </div>
            <!-- 安装前权限确认（仅未安装时展示） -->
            <div v-if="!installedVersion" class="mt-3 p-3 bg-orange-50/60 border border-orange-100 rounded-lg">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input v-model="permissionsAccepted" type="checkbox" class="mt-0.5 accent-orange-500" :disabled="processing" />
                <div class="text-[10px] text-gray-600 leading-relaxed">
                  我已审阅上述权限，并同意该插件在<span class="text-text-primary font-medium">沙箱隔离环境</span>中使用所声明的能力。
                </div>
              </label>
            </div>
          </div>

          <!-- 下载进度 -->
          <div v-if="progress !== undefined" class="space-y-1.5">
            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">下载进度</div>
            <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-accent rounded-full transition-all duration-300"
                :style="{ width: progress + '%' }"
              ></div>
            </div>
            <div class="text-[10px] text-gray-400 font-mono">{{ progress }}%</div>
          </div>

          <!-- 错误提示 -->
          <div v-if="errorMsg" class="p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 leading-relaxed">
            {{ errorMsg }}
          </div>
        </div>

        <!-- 底部操作区 -->
        <div class="flex-shrink-0 p-4 pt-3 border-t border-border-light flex items-center justify-between gap-3">
          <button
            @click="emit('close')"
            :disabled="processing"
            class="px-4 py-2 border border-border-light hover:bg-gray-50 rounded-lg text-xs font-semibold text-gray-500 cursor-pointer transition-colors disabled:opacity-50"
          >
            关闭
          </button>

          <div class="flex gap-2">
            <button
              v-if="updateAvailable"
              @click="handleUpdate"
              :disabled="processing || !updateAvailable"
              class="px-5 py-2 bg-accent hover:bg-orange-600 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
            >
              <svg v-if="processing" class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ processing ? '更新中...' : '更新到 v' + entry.version }}
            </button>
            <button
              v-else-if="!installedVersion"
              @click="handleInstall"
              :disabled="processing || !permissionsAccepted"
              class="px-5 py-2 bg-text-primary hover:bg-gray-800 text-bg-surface rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
            >
              <svg v-if="processing" class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ processing ? '安装中...' : '允许并安装' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  entry: any;
  installedVersion?: string;
  updateAvailable: boolean;
  progress?: number;
}>();

const emit = defineEmits<{
  close: [];
  install: [entry: any];
  update: [entry: any];
}>();

// 本地状态
const permissionsAccepted = ref<boolean>(false);
const processing = ref<boolean>(false);
const errorMsg = ref<string>('');

const hasPermissions = computed(() => {
  if (!props.entry?.permissions) return false;
  const p = props.entry.permissions;
  return (
    (p.vfs && p.vfs.length > 0) ||
    p.db ||
    (p.net && p.net.length > 0)
  );
});

const handleInstall = async () => {
  processing.value = true;
  errorMsg.value = '';
  try {
    emit('install', props.entry);
  } catch (e: any) {
    errorMsg.value = e?.toString?.() || '安装失败';
  } finally {
    processing.value = false;
  }
};

const handleUpdate = async () => {
  processing.value = true;
  errorMsg.value = '';
  try {
    emit('update', props.entry);
  } catch (e: any) {
    errorMsg.value = e?.toString?.() || '更新失败';
  } finally {
    processing.value = false;
  }
};
</script>
