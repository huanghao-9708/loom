/**
 * Loom Plugin SDK
 * 这是一套提供给第三方插件在 Sandbox IFrame 内部使用的核心垫片（Shim）。
 * 它将拦截所有的方法调用，并序列化为 postMessage 发送给宿主 Vue 容器，
 * 由宿主经过安全校验后，转发给 Rust 核心层。
 */

(function (global) {
  // 生成每次请求的唯一标识符
  function generateRequestId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // 挂起的回调队列
  const pendingRequests = new Map();

  // 监听来自宿主 (PluginHost.vue) 的回调响应
  window.addEventListener('message', (event) => {
    // 因为在 sandbox iframe 内部可能无法获取 origin，我们只识别格式
    const data = event.data;
    if (data && data.type === 'LOOM_RPC_RESPONSE') {
      const { requestId, result, error } = data;
      if (pendingRequests.has(requestId)) {
        const { resolve, reject } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      }
    }
  });

  // 核心通信桥梁
  function rpcCall(method, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = generateRequestId();
      pendingRequests.set(requestId, { resolve, reject });

      window.parent.postMessage({
        type: 'LOOM_RPC_REQUEST',
        requestId,
        method,
        payload
      }, '*'); // 必须为 '*'，因为 sandbox 环境的 origin 为 'null'
    });
  }

  // 构建全局的 loom SDK 命名空间
  global.loom = {
    db: {
      execute: async (sql) => {
        return await rpcCall('db.execute', { sql });
      },
      query: async (sql, params = []) => {
        return await rpcCall('db.query', { sql, params });
      }
    },
    vfs: {
      list: async (sourceId, path) => {
        return await rpcCall('vfs.list', { sourceId, path });
      },
      getSources: async () => {
        return await rpcCall('vfs.getSources');
      }
    },
    // 通知宿主：沙箱已经初始化完毕，可以撤去 Loading 遮罩了
    ready: () => {
      rpcCall('sandbox.ready');
    }
  };

  // 如果插件引入了 sdk，默认自动发送 ready 信号
  // 但为了给插件加载依赖的时间，我们把 ready 作为主动 API 暴露，并延迟一个 tick 发送
  setTimeout(() => {
    if (global.loom && global.loom.ready) {
      global.loom.ready();
    }
  }, 100);

})(window);
