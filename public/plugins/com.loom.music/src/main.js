const { createApp } = Vue;

const app = createApp(window.AppConfig);
app.mount('#app');

// Ensure host knows we are ready after mount
window.loomContext.ready();
