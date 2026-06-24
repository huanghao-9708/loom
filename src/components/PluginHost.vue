<template>
  <div class="plugin-host-wrapper w-full h-full relative bg-white">
    <!-- 沙箱 IFrame：仅开放脚本运行，不允许跳出、同源及弹窗，实现物理 DOM 隔离 -->
    <iframe
      ref="sandboxFrame"
      :src="entryUrl"
      sandbox="allow-scripts"
      class="w-full h-full border-0"
    ></iframe>

    <!-- 加载中或鉴权状态遮罩 -->
    <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
      <div class="flex items-center gap-3">
        <svg class="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-sm font-medium text-gray-600 tracking-wide font-mono">Initializing Sandbox: {{ pluginId }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const props = defineProps<{
  pluginId: string;
  entryUrl: string;
}>();

const sandboxFrame = ref<HTMLIFrameElement | null>(null);
const isLoading = ref(true);

// RPC 消息总线：桥接 iframe 沙箱与 Tauri 安全核心
const handleMessage = async (event: MessageEvent) => {
  // 安全校验：只接受来自当前 sandboxFrame 的消息
  if (sandboxFrame.value && event.source !== sandboxFrame.value.contentWindow) {
    return;
  }

  const { type, method, payload, requestId } = event.data;
  if (type !== 'LOOM_RPC_REQUEST') return;

  try {
    let result;
    // 权限与方法的路由分发
    switch (method) {
      case 'db.execute':
        // 将沙箱的请求附带宿主认可的签名 (pluginId) 透传给防线的最后守门员：Rust
        result = await invoke('cmd_plugin_db_execute', {
          pluginId: props.pluginId,
          sql: payload.sql,
        });
        break;
      case 'vfs.list':
        result = await invoke('cmd_plugin_vfs_list', {
          pluginId: props.pluginId,
          sourceId: payload.sourceId,
          path: payload.path,
        });
        break;
      case 'sandbox.ready':
        // 插件已完成 SDK 初始化，可以摘除遮罩
        isLoading.value = false;
        result = 'ok';
        break;
      default:
        throw new Error(`Unauthorized or unknown RPC Method: ${method}`);
    }

    // 将结果回吐给 iframe
    if (sandboxFrame.value?.contentWindow) {
      sandboxFrame.value.contentWindow.postMessage({
        type: 'LOOM_RPC_RESPONSE',
        requestId,
        result
      }, '*'); // 由于使用了 sandbox iframe，origin 可能是 null，所以用 '*'
    }
  } catch (error: any) {
    if (sandboxFrame.value?.contentWindow) {
      sandboxFrame.value.contentWindow.postMessage({
        type: 'LOOM_RPC_RESPONSE',
        requestId,
        error: error.toString()
      }, '*');
    }
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  // 防呆设计：如果插件损坏没有发出 sandbox.ready，5 秒后自动关闭遮罩避免死锁
  setTimeout(() => {
    isLoading.value = false;
  }, 5000);
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});
</script>
