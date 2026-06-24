// Use getters to dynamically proxy to window.loom
window.loomContext = {
    get db() { return window.loom?.db; },
    get vfs() { return window.loom?.vfs; },
    get fs() { return window.loom?.fs; },
    ready: () => {
        if (window.loom && window.loom.ready) {
            window.loom.ready();
        }
    }
};
