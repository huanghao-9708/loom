const { ref, onMounted } = Vue;

window.AppConfig = {
    template: `
      <div class="flex h-full w-full flex-col">
          <!-- Top Area: Main content + Sidebar -->
          <div class="flex-1 flex overflow-hidden">
             <!-- Sidebar -->
             <div class="w-60 border-r border-border-light bg-bg-secondary flex flex-col px-4 py-6">
                <div class="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-4 font-mono">Library</div>
                <div class="space-y-1">
                    <div class="px-3 py-2 rounded-md bg-gray-200 text-text-primary font-medium cursor-pointer transition flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        Tracks
                    </div>
                    <div class="px-3 py-2 rounded-md text-text-secondary hover:bg-gray-100 cursor-pointer transition flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        Albums
                    </div>
                    <div class="px-3 py-2 rounded-md text-text-secondary hover:bg-gray-100 cursor-pointer transition flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        Artists
                    </div>
                </div>
             </div>

             <!-- Main Content -->
             <div class="flex-1 bg-bg-base flex flex-col relative">
                <header class="h-16 border-b border-border-light flex items-center px-8">
                   <h1 class="text-2xl font-semibold tracking-tight">All Tracks</h1>
                </header>
                <main class="flex-1 overflow-y-auto p-8">
                   <div v-if="loading" class="flex items-center gap-3 text-text-muted">
                        <svg class="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading database...
                   </div>
                   <div v-else>
                      <div class="flex items-center gap-4 mb-8">
                          <div class="bg-gray-100 px-4 py-3 rounded-lg text-sm border border-border-light">
                              <span class="text-text-muted mr-2">Total Tables:</span>
                              <span class="font-mono font-bold text-accent">{{tablesCount}}</span>
                          </div>
                      </div>

                      <div class="max-w-md">
                          <div class="border border-border-light rounded-lg p-6 bg-bg-secondary">
                              <h3 class="text-sm font-semibold mb-2">Import Music</h3>
                              <p class="text-text-secondary mb-4 leading-relaxed">Select a local directory or remote WebDAV source to scan and import audio files into your Lumo library.</p>
                              
                              <div class="flex flex-col gap-3">
                                  <select v-model="selectedSourceId" class="border border-border-light rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-black">
                                      <option :value="null" disabled>Select Mount Source...</option>
                                      <option v-for="s in sources" :key="s.id" :value="s.id">{{s.name}} ({{s.kind}})</option>
                                  </select>
                                  
                                  <button @click="startScan" class="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition active:scale-95 font-medium flex justify-center items-center gap-2" :disabled="!selectedSourceId || isScanning">
                                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" v-if="!isScanning"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                      <svg v-else class="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                      {{ isScanning ? 'Scanning...' : 'Scan Root Directory' }}
                                  </button>
                                  <p v-if="scanProgress" class="text-xs text-text-muted mt-2 truncate font-mono">{{scanProgress}}</p>
                              </div>
                          </div>
                      </div>
                   </div>
                </main>
             </div>
          </div>

          <!-- Bottom Player Bar -->
          <div class="h-24 border-t border-border-light bg-bg-secondary flex items-center px-6 justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.02)] relative z-10">
             <div class="flex items-center gap-4 w-1/3 min-w-[200px]">
                 <div class="w-14 h-14 bg-gray-200 rounded-lg shadow-sm border border-black/5 flex items-center justify-center text-gray-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                 </div>
                 <div class="flex flex-col">
                    <div class="font-semibold text-sm text-text-primary tracking-tight">No Track Playing</div>
                    <div class="text-xs text-text-secondary mt-0.5">Unknown Artist</div>
                 </div>
             </div>
             
             <!-- Center Controls -->
             <div class="flex-1 flex flex-col justify-center items-center max-w-2xl px-8">
                 <div class="flex items-center gap-6 mb-2">
                     <button class="text-text-muted hover:text-text-primary transition active:scale-95"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                     <button class="text-text-primary hover:text-black transition active:scale-95"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg></button>
                     <button class="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 transition active:scale-95 shadow-md">
                        <svg class="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                     </button>
                     <button class="text-text-primary hover:text-black transition active:scale-95"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg></button>
                     <button class="text-text-muted hover:text-text-primary transition active:scale-95"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                 </div>
                 
                 <!-- Progress Bar -->
                 <div class="w-full flex items-center gap-3">
                     <span class="text-[10px] text-text-muted font-mono w-10 text-right">0:00</span>
                     <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden cursor-pointer group">
                         <div class="w-0 h-full bg-black group-hover:bg-accent transition-colors relative"></div>
                     </div>
                     <span class="text-[10px] text-text-muted font-mono w-10">0:00</span>
                 </div>
             </div>
             
             <div class="w-1/3 min-w-[200px] flex justify-end items-center gap-4">
                 <button class="text-text-muted hover:text-text-primary transition"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg></button>
                 <div class="flex items-center gap-2">
                     <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                     <div class="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden cursor-pointer">
                         <div class="w-2/3 h-full bg-text-muted"></div>
                     </div>
                 </div>
             </div>
          </div>
      </div>
    `,
    setup() {
        const loading = ref(true);
        const tablesCount = ref(0);
        const sources = ref([]);
        const selectedSourceId = ref(null);
        const isScanning = ref(false);
        const scanProgress = ref('');

        const loadStats = async () => {
            const tables = await window.loomContext.db.query("SELECT name FROM sqlite_master WHERE type='table'");
            tablesCount.value = tables.length;
        };

        onMounted(async () => {
            try {
                await loadStats();
                const srcs = await window.loomContext.vfs.getSources();
                sources.value = srcs;
                if(srcs.length > 0) {
                    selectedSourceId.value = srcs[0].id;
                }
                loading.value = false;
            } catch(e) {
                console.error("Initialization Error:", e);
                loading.value = false;
            }
        });

        const startScan = async () => {
            if (!selectedSourceId.value) return;
            isScanning.value = true;
            scanProgress.value = 'Starting scan...';
            try {
                await window.scanDirectory(selectedSourceId.value, '/', (msg) => {
                    scanProgress.value = msg;
                });
                scanProgress.value = 'Scan completed successfully!';
                await loadStats(); // refresh stats
            } catch (e) {
                scanProgress.value = 'Error during scan: ' + e;
            } finally {
                isScanning.value = false;
            }
        };

        return { loading, tablesCount, sources, selectedSourceId, isScanning, scanProgress, startScan };
    }
}
