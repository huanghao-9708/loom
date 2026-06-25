(() => {
const { ref, onMounted } = Vue;

window.AppConfig = {
    template: `
      <div class="flex h-full w-full flex-col">
          <!-- Top Area: Main content + Sidebars -->
          <div class="flex-1 flex overflow-hidden">
             <!-- Left Sidebar -->
             <div class="w-56 border-r border-border-light bg-bg-secondary flex flex-col select-none shrink-0 h-full">
                <div class="h-[72px] border-b border-border-light shrink-0"></div>
                
                <div class="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                    <div>
                       <div class="space-y-1 text-[13px] font-medium">
                           <div @click="navigate('tracks')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'tracks' ? 'bg-white text-accent shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                               全部歌曲
                           </div>
                           <div @click="navigate('artists')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'artists' ? 'bg-white text-accent shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                               艺人
                           </div>
                       </div>
                    </div>
                    
                    <div>
                       <div class="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 font-mono">收藏 (Collection)</div>
                       <div class="space-y-1 text-[13px] font-medium text-text-secondary">
                           <div class="px-3 py-2 rounded-lg cursor-not-allowed flex items-center gap-3 opacity-50">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                               收藏歌曲
                           </div>
                           <div class="px-3 py-2 rounded-lg cursor-not-allowed flex items-center gap-3 opacity-50">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                               最近播放
                           </div>
                           <div class="px-3 py-2 rounded-lg cursor-not-allowed flex items-center gap-3 opacity-50">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                               播放队列
                           </div>
                       </div>
                    </div>

                    <div>
                       <div class="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 font-mono">歌单 (Playlists)</div>
                       <div class="space-y-1 text-[13px] font-medium text-text-secondary">
                           <div class="px-3 py-2 flex items-center justify-between opacity-50 cursor-not-allowed">
                               <div class="flex items-center gap-3"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg> 日常音乐</div>
                               <span class="text-[10px] text-text-muted font-mono">58</span>
                           </div>
                           <div class="px-3 py-2 flex items-center justify-between opacity-50 cursor-not-allowed">
                               <div class="flex items-center gap-3"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg> 工作专注</div>
                               <span class="text-[10px] text-text-muted font-mono">24</span>
                           </div>
                           <div class="px-3 py-2 mt-2 flex items-center gap-3 text-text-muted cursor-not-allowed opacity-50 hover:bg-gray-100 rounded-lg transition">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                               新建歌单
                           </div>
                       </div>
                    </div>
                    
                    <div>
                       <div class="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 font-mono">设置 (Settings)</div>
                       <div class="space-y-1 text-[13px] font-medium">
                           <div @click="navigate('settings')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'settings' ? 'bg-white text-accent shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                               设置
                           </div>
                       </div>
                    </div>
                </div>
             </div>

             <!-- Center Main Content -->
             <div class="flex-1 bg-bg-base flex flex-col relative overflow-hidden h-full">
                <!-- Header -->
                <header class="h-[72px] px-8 shrink-0 border-b border-border-light flex items-center justify-between">
                    <div class="flex items-center gap-2 text-text-muted">
                        <button @click="goBack" :disabled="!canGoBack" :class="['w-8 h-8 rounded-full flex items-center justify-center transition', canGoBack ? 'hover:bg-gray-100 text-text-primary' : 'opacity-30 cursor-not-allowed']">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <button @click="goForward" :disabled="!canGoForward" :class="['w-8 h-8 rounded-full flex items-center justify-center transition', canGoForward ? 'hover:bg-gray-100 text-text-primary' : 'opacity-30 cursor-not-allowed']">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                        <div class="flex items-center gap-5 text-text-muted">
                           <div class="relative flex items-center text-text-secondary">
                              <svg class="w-4 h-4 absolute left-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                              <input type="text" placeholder="搜索..." class="bg-transparent border-b border-border-light pl-6 pb-1 text-xs focus:outline-none focus:border-accent w-48 text-text-primary transition-colors uppercase tracking-wider" />
                           </div>
                           <svg class="w-4 h-4 cursor-not-allowed opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                           <svg class="w-4 h-4 cursor-not-allowed opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                           <svg class="w-4 h-4 cursor-not-allowed opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zm-10 10a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                        </div>
                </header>

                <main class="flex-1 overflow-y-auto relative">
                   <!-- Settings/Scanner View -->
                   <div v-show="currentRoute.name === 'settings'" class="p-8">
                      <div v-if="loading" class="flex items-center gap-3 text-text-muted">
                           <svg class="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           加载数据库中...
                      </div>
                      <div v-else>
                         <div class="flex items-center gap-4 mb-8">
                             <div class="bg-bg-secondary px-4 py-3 rounded-lg text-sm border border-border-light">
                                 <span class="text-text-muted mr-2">数据表总数:</span>
                                 <span class="font-mono font-bold text-accent">{{tablesCount}}</span>
                             </div>
                         </div>
                         <div class="w-full">
                             <div class="border border-border-light rounded-lg p-6 bg-bg-secondary mb-6 max-w-xl">
                                 <h3 class="text-sm font-semibold mb-2">添加扫描目录</h3>
                                 <p class="text-text-secondary mb-4 leading-relaxed text-xs">选择一个虚拟文件系统源并指定相对路径，将其添加到音乐扫描器中。</p>
                                 <div class="flex items-end gap-3">
                                     <div class="flex-1">
                                         <label class="block text-xs font-medium text-text-secondary mb-1">目录源</label>
                                         <select v-model="selectedSourceId" class="w-full border border-border-light rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-accent text-sm">
                                             <option :value="null" disabled>选择挂载源...</option>
                                             <option v-for="s in sources" :key="s.id" :value="s.id">{{s.name}} ({{s.kind}})</option>
                                         </select>
                                     </div>
                                     <div class="flex-1">
                                         <label class="block text-xs font-medium text-text-secondary mb-1">相对路径</label>
                                         <div class="flex items-center gap-2">
                                             <input v-model="inputPath" type="text" placeholder="/" class="w-full border border-border-light rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-accent text-sm" />
                                             <button @click="openPicker" :disabled="!selectedSourceId" class="bg-gray-100 border border-border-light text-text-primary px-3 py-2 rounded-md hover:bg-gray-200 transition active:scale-95 text-sm font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">浏览...</button>
                                         </div>
                                     </div>
                                     <button @click="addScanDirectory" class="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition active:scale-95 text-sm font-medium flex justify-center items-center h-[38px]" :disabled="!selectedSourceId">
                                         添加
                                     </button>
                                 </div>
                             </div>

                             <div class="border border-border-light rounded-lg overflow-hidden bg-white max-w-4xl">
                                 <table class="w-full text-left border-collapse text-sm">
                                     <thead>
                                         <tr class="bg-bg-secondary text-text-muted text-xs uppercase tracking-widest border-b border-border-light">
                                             <th class="py-3 px-4 font-semibold">存储源</th>
                                             <th class="py-3 px-4 font-semibold">路径</th>
                                             <th class="py-3 px-4 font-semibold text-right w-48">操作</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         <tr v-if="scanDirectories.length === 0">
                                             <td colspan="3" class="py-8 text-center text-text-muted text-xs">未配置任何扫描目录。</td>
                                         </tr>
                                         <tr v-for="dir in scanDirectories" :key="dir.id" class="border-b border-border-light last:border-0 hover:bg-gray-50 transition">
                                             <td class="py-3 px-4 font-medium text-text-primary">{{ getSourceName(dir.source_id) }}</td>
                                             <td class="py-3 px-4 text-text-secondary font-mono text-xs">{{ dir.path }}</td>
                                             <td class="py-3 px-4 text-right flex items-center justify-end gap-2">
                                                 <button @click="deleteScanDirectory(dir.id)" class="text-text-muted hover:text-red-500 transition px-2 py-1 border border-transparent hover:border-red-200 hover:bg-red-50 rounded text-xs" :disabled="isScanning">删除</button>
                                                 <button @click="startScan(dir)" class="bg-white border border-border-light text-text-primary hover:bg-gray-50 hover:text-black transition px-3 py-1 rounded text-xs font-medium flex items-center gap-1 shadow-sm" :disabled="isScanning">
                                                     <svg v-if="scanningId === dir.id" class="animate-spin w-3 h-3 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                     <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                     {{ scanningId === dir.id ? '扫描中...' : '扫描' }}
                                                 </button>
                                             </td>
                                         </tr>
                                     </tbody>
                                 </table>
                                 <div v-if="scanProgress" class="bg-bg-secondary border-t border-border-light p-3 text-[10px] text-text-muted font-mono truncate">
                                     > {{ scanProgress }}
                                 </div>
                             </div>
                         </div>
                      </div>
                   </div>

                   <!-- Dynamic Views -->
                   <tracks-view v-if="currentRoute.name === 'tracks'"></tracks-view>
                   <artists-view v-if="currentRoute.name === 'artists'"></artists-view>
                   <artist-detail-view v-if="currentRoute.name === 'artistDetail'" :artist-id="currentRoute.params.id" :artist-name="currentRoute.params.name"></artist-detail-view>
                   <album-detail-view v-if="currentRoute.name === 'albumDetail'" :album-id="currentRoute.params.id"></album-detail-view>
                </main>
                
                <!-- Footer Stats Placeholder -->
                <div class="h-10 border-t border-border-light shrink-0 flex items-center px-8 justify-between text-[10px] font-mono tracking-widest text-text-muted">
                    <div>1248 首歌曲 / 98.6 GB / 3天 14小时</div>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-px bg-border-light"></div>
                        归档
                    </div>
                </div>
             </div>

             <!-- Right Context Panel -->
             <div class="w-72 border-l border-border-light bg-bg-base flex flex-col shrink-0 h-full">
                <!-- Top Area: Cover & Title (Seamless) -->
                <div class="pt-10 pb-4 px-6 flex flex-col items-center justify-center gap-7 shrink-0 z-10">
                    <!-- Album Art (Drop shadow, rounded-2xl) -->
                    <div class="w-48 h-48 aspect-square bg-bg-secondary rounded-2xl border border-border-light/50 overflow-hidden flex items-center justify-center text-text-muted relative shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] group">
                        <img v-if="currentTrack?.cover_url" :src="currentTrack.cover_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-700 ease-out" />
                        <svg v-else class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                    </div>
                    
                    <!-- Title & Artist -->
                    <div class="flex flex-col text-center w-full px-2">
                        <div class="text-[19px] font-bold text-text-primary tracking-tight truncate leading-tight mb-1.5" :title="currentTrack ? currentTrack.title : ''">{{ currentTrack ? currentTrack.title : '暂无歌曲' }}</div>
                        <div class="text-[13px] font-medium text-text-secondary opacity-80 tracking-wide truncate" :title="currentTrack ? currentTrack.artist_name : ''">{{ currentTrack ? currentTrack.artist_name : '未知艺人' }}</div>
                    </div>
                </div>
                
                <!-- Bottom Area: Flowing Lyrics (with gradient mask) -->
                <div class="flex-1 relative overflow-hidden" style="mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);" id="lyrics-container">
                    <div class="absolute top-0 left-0 right-0 transition-transform duration-500 ease-out flex flex-col gap-5 text-[14px] font-medium text-text-secondary text-center"
                         :style="{ transform: 'translateY(' + lyricsOffsetY + 'px)' }" id="lyrics-inner">
                        <div v-if="!currentLyrics || currentLyrics.length === 0" class="text-text-muted mt-32">暂无歌词</div>
                        <div v-for="(line, index) in currentLyrics" :key="index" :id="'lyric-line-' + index"
                             @click="actions.seek(line.time)"
                             :class="[
                                 'transition-all duration-300 cursor-pointer px-6',
                                 index === activeLyricIndex ? 'font-bold text-text-primary text-[16px] transform scale-[1.02] py-1.5' : 'hover:text-black'
                             ]">
                            {{ line.text }}
                        </div>
                    </div>
                </div>
             </div>
          </div>

          <!-- Bottom Player Bar -->
          <!-- Bottom Player Bar -->
          <div class="h-24 bg-bg-base flex items-center px-8 justify-between shadow-sm border-t border-border-light relative z-10 shrink-0">
             <!-- Left: Track Info Thumbnail -->
             <div class="flex-1 flex items-center gap-4 min-w-[200px]">
                 <div class="w-14 h-14 bg-bg-secondary rounded-md border border-border-light flex items-center justify-center text-text-muted overflow-hidden bg-cover bg-center shadow-sm" :style="currentTrack?.cover_url ? 'background-image: url(' + currentTrack.cover_url + ')' : ''">
                    <svg v-if="!currentTrack?.cover_url" class="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                 </div>
                 <div class="flex flex-col truncate pr-4">
                    <div class="font-medium text-[13px] text-text-primary tracking-tight truncate">{{ currentTrack ? currentTrack.title : '暂无歌曲' }}</div>
                    <div class="text-[11px] font-medium text-text-muted mt-1 truncate">{{ currentTrack ? currentTrack.artist_name : '未知艺人' }}</div>
                 </div>
             </div>
             
             <!-- Center: Controls & Thin Progress -->
             <div class="flex-[2] flex flex-col items-center justify-center max-w-2xl px-6 gap-2.5">
                 <!-- Controls -->
                 <div class="flex items-center gap-6">
                     <button @click="togglePlayMode" class="text-text-muted hover:text-text-primary transition active:scale-95" :class="{'text-accent': playMode !== 'normal'}">
                        <svg v-if="playMode === 'shuffle'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        <svg v-else class="w-4 h-4 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        <span v-if="playMode === 'loop-one'" class="absolute -mt-4 ml-3 text-[8px] font-bold">1</span>
                     </button>
                     
                     <button @click="playPrevious" class="text-text-primary hover:text-black transition active:scale-95">
                         <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                     </button>
                     
                     <button @click="togglePlay" class="w-10 h-10 bg-white shadow-sm border border-border-light rounded-full flex items-center justify-center text-text-primary hover:text-black hover:scale-105 transition-all active:scale-95">
                        <svg v-if="!isPlaying" class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                        <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"></path></svg>
                     </button>
                     
                     <button @click="playNext" class="text-text-primary hover:text-black transition active:scale-95">
                         <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                     </button>
                     
                     <button class="text-text-muted cursor-not-allowed opacity-50">
                         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                     </button>
                 </div>
                 
                 <!-- Progress Bar -->
                 <div class="w-full flex items-center gap-3">
                     <span class="text-[10px] text-text-muted font-mono w-10 text-right tabular-nums">{{ formatTime(currentTime) }}</span>
                     <div class="flex-1 h-1 bg-gray-200 cursor-pointer group relative rounded-full" @click="seekByClick">
                         <div class="h-full bg-text-primary group-hover:bg-accent transition-colors absolute left-0 pointer-events-none rounded-full" :style="{ width: progressPercent + '%' }"></div>
                     </div>
                     <span class="text-[10px] text-text-muted font-mono w-10 tabular-nums">{{ formatTime(duration) }}</span>
                 </div>
             </div>
             
             <!-- Right: Volume -->
             <div class="flex-1 flex justify-end items-center gap-5 text-text-muted min-w-[200px]">
                 <button @click="toggleMute" class="hover:text-text-primary transition">
                    <svg v-if="isMuted || volume === 0" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                 </button>
                 <div class="w-20 h-1 bg-gray-200 cursor-pointer relative rounded-full" @click="setVolumeByClick">
                     <div class="h-full bg-text-muted absolute left-0 pointer-events-none rounded-full" :style="{ width: (volume * 100) + '%' }"></div>
                 </div>
                 <div class="h-4 w-px bg-border-light mx-2"></div>
                 <button @click="showQueuePanel = !showQueuePanel" :class="['transition hover:text-black', showQueuePanel ? 'text-accent' : 'text-text-muted']">
                     <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                 </button>
                 <button class="cursor-not-allowed opacity-50 hover:text-black transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg></button>
             </div>
          </div>

          <!-- Queue Flyout Panel -->
          <div v-if="showQueuePanel" class="absolute bottom-24 right-8 w-96 bg-white rounded-xl shadow-2xl border border-border-light flex flex-col overflow-hidden z-40 transition-all transform origin-bottom-right" style="max-height: 60vh;">
              <div class="px-5 py-4 border-b border-border-light flex items-center justify-between bg-bg-secondary shrink-0">
                  <div class="flex flex-col">
                      <span class="text-sm font-semibold text-text-primary tracking-tight">接下来的播放</span>
                      <span class="text-[10px] text-text-muted font-mono mt-0.5">{{ queue.length }} 首歌曲</span>
                  </div>
                  <button @click="showQueuePanel = false" class="text-text-muted hover:text-black transition bg-white p-1 rounded border border-border-light shadow-sm">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
              </div>
              <div v-if="queue.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bg-base">
                  <svg class="w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                  <p class="text-xs text-text-secondary">队列为空<br>双击歌曲或点击"播放全部"</p>
              </div>
              <div v-else class="flex-1 overflow-y-auto bg-white p-1">
                  <div v-for="(track, index) in queue" :key="track.id + '-' + index" 
                       @dblclick="playQueueTrack(index)"
                       class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group transition mb-1 last:mb-0"
                       :class="{'bg-gray-50 border border-border-light shadow-sm': queueIndex === index}">
                      <div class="text-[10px] font-mono w-5 text-center flex-shrink-0 flex items-center justify-center group-hover:hidden" :class="{'text-accent': queueIndex === index, 'text-text-muted': queueIndex !== index}">
                          <span v-if="queueIndex === index" class="animate-pulse">▶</span>
                          <span v-else>{{ index + 1 }}</span>
                      </div>
                      <button @click.stop="playQueueTrack(index)" class="w-5 h-5 flex-shrink-0 text-accent hidden group-hover:flex items-center justify-center hover:scale-110 transition-transform">
                          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                      </button>
                      <div class="w-8 h-8 rounded border border-border-light bg-bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0" :style="track.cover_url ? 'background-image: url(' + track.cover_url + '); background-size: cover;' : ''">
                          <svg v-if="!track.cover_url" class="w-4 h-4 text-text-muted opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                      </div>
                      <div class="flex-1 flex flex-col min-w-0 pr-2">
                          <div class="text-[11px] font-medium text-text-primary truncate leading-tight" :class="{'text-accent': queueIndex === index}">{{ track.title }}</div>
                          <div class="text-[9px] text-text-secondary truncate mt-0.5">{{ track.artist_name || '未知艺人' }}</div>
                      </div>
                      <div class="text-[10px] text-text-muted font-mono tabular-nums flex-shrink-0">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</div>
                  </div>
              </div>
          </div>

          <!-- Folder Picker Modal -->
          <div v-if="showFolderPicker" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
              <div class="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden border border-border-light">
                  <div class="px-6 py-4 border-b border-border-light flex items-center justify-between bg-bg-secondary shrink-0">
                      <h3 class="font-semibold text-text-primary">选择目录</h3>
                      <button @click="cancelPicker" class="text-text-muted hover:text-black transition">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                  </div>
                  <div class="px-6 py-3 border-b border-border-light flex items-center gap-2 bg-gray-50 text-sm shrink-0">
                      <button @click="navigatePicker('..')" class="p-1 rounded hover:bg-gray-200 text-text-secondary transition" :disabled="currentPickerPath === '/' || currentPickerPath === ''">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                      </button>
                      <div class="flex-1 font-mono text-xs text-text-primary truncate px-2">{{ currentPickerPath || '/' }}</div>
                  </div>
                  <div class="flex-1 overflow-y-auto p-2 bg-white">
                      <div v-if="isLoadingPicker" class="flex justify-center items-center h-32 text-text-muted">
                          <svg class="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      </div>
                      <div v-else-if="pickerItems.length === 0" class="flex justify-center items-center h-32 text-text-muted text-sm">
                          空目录
                      </div>
                      <div v-else class="flex flex-col">
                          <div v-for="item in pickerItems" :key="item.name" @click="navigatePicker(item.name)" class="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer rounded-md transition">
                              <svg class="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                              <span class="text-sm text-text-primary truncate">{{ item.name }}</span>
                          </div>
                      </div>
                  </div>
                  <div class="px-6 py-4 border-t border-border-light bg-bg-secondary flex justify-end gap-3 shrink-0">
                      <button @click="cancelPicker" class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition">取消</button>
                      <button @click="confirmPicker" class="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition">选择当前文件夹</button>
                  </div>
              </div>
          </div>
      </div>
    `,
    components: {
        'tracks-view': window.AppViews.TracksView,
        'artists-view': window.AppViews.ArtistsView,
        'artist-detail-view': window.AppViews.ArtistDetailView,
        'album-detail-view': window.AppViews.AlbumDetailView
    },
    setup() {
        const { state, actions, playNext, playPrevious } = window.PlayerStore;
        const { computed, watch } = Vue;

        // --- Router State ---
        const history = ref([{ name: 'tracks', params: {} }]);
        const historyIndex = ref(0);

        const currentRoute = computed(() => history.value[historyIndex.value]);
        const canGoBack = computed(() => historyIndex.value > 0);
        const canGoForward = computed(() => historyIndex.value < history.value.length - 1);

        const navigate = (name, params = {}) => {
            // If clicking the same route, do nothing
            if (currentRoute.value.name === name && JSON.stringify(currentRoute.value.params) === JSON.stringify(params)) return;
            // Drop future history if we're not at the end
            history.value = history.value.slice(0, historyIndex.value + 1);
            history.value.push({ name, params });
            historyIndex.value++;
        };

        const goBack = () => {
            if (historyIndex.value > 0) historyIndex.value--;
        };

        const goForward = () => {
            if (historyIndex.value < history.value.length - 1) historyIndex.value++;
        };

        window.AppRouter = { currentRoute, navigate, goBack, goForward, canGoBack, canGoForward };
        // -------------------

        const showQueuePanel = ref(false);

        const loading = ref(true);
        const tablesCount = ref(0);
        const sources = ref([]);
        const selectedSourceId = ref(null);
        const inputPath = ref('/');
        const scanDirectories = ref([]);
        const isScanning = ref(false);
        const scanningId = ref(null);
        const scanProgress = ref('');

        const showFolderPicker = ref(false);
        const currentPickerPath = ref('/');
        const pickerItems = ref([]);
        const isLoadingPicker = ref(false);

        // Map Player State
        const currentTrack = computed(() => state.currentTrack);
        const isPlaying = computed(() => state.isPlaying);
        const currentTime = computed(() => state.currentTime);
        const duration = computed(() => state.duration);
        const volume = computed(() => state.volume);
        const isMuted = computed(() => state.isMuted);
        const playMode = computed(() => state.playMode);
        const queue = computed(() => state.queue);
        const queueIndex = computed(() => state.queueIndex);
        const currentLyrics = computed(() => state.currentLyrics);
        const activeLyricIndex = computed(() => {
            const lyrics = state.currentLyrics;
            if (!lyrics || lyrics.length === 0) return -1;
            const time = state.currentTime;
            for (let i = lyrics.length - 1; i >= 0; i--) {
                if (time >= lyrics[i].time - 0.2) { // Add 200ms offset for better sync feeling
                    return i;
                }
            }
            return -1;
        });

        const lyricsOffsetY = ref(0);

        const updateLyricsOffset = () => {
             const container = document.getElementById('lyrics-container');
             const inner = document.getElementById('lyrics-inner');
             if (!container || !inner) return;
             
             const containerHeight = container.clientHeight;
             const targetIndex = activeLyricIndex.value >= 0 ? activeLyricIndex.value : 0;
             const el = document.getElementById('lyric-line-' + targetIndex);
             
             if (el) {
                 const elTop = el.offsetTop;
                 const elHeight = el.clientHeight;
                 lyricsOffsetY.value = (containerHeight / 2) - elTop - (elHeight / 2);
             } else {
                 lyricsOffsetY.value = 0;
             }
        };

        watch(activeLyricIndex, () => {
             setTimeout(updateLyricsOffset, 50);
        });
        
        watch(currentLyrics, () => {
             setTimeout(updateLyricsOffset, 50);
        });
        
        const progressPercent = computed(() => {
            if (duration.value <= 0) return 0;
            return (currentTime.value / duration.value) * 100;
        });

        const formatTime = (seconds) => {
            if (!seconds || isNaN(seconds)) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        const togglePlay = () => actions.togglePlay();
        const toggleMute = () => actions.toggleMute();
        
        const togglePlayMode = () => {
            const modes = ['normal', 'loop', 'loop-one', 'shuffle'];
            let idx = modes.indexOf(state.playMode);
            state.playMode = modes[(idx + 1) % modes.length];
        };

        const playQueueTrack = (index) => {
            const track = state.queue[index];
            if (track) {
                state.queueIndex = index;
                actions.playTrack(track); // Use playTrack without passing array to just play the track and keep queue
            }
        };

        const seekByClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            actions.seek(percent * duration.value);
        };

        const setVolumeByClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            actions.setVolume(percent);
            if (state.isMuted && percent > 0) actions.toggleMute();
        };

        const loadStats = async () => {
            const tables = await window.loomContext.db.query("SELECT name FROM sqlite_master WHERE type='table'");
            tablesCount.value = tables.length;
        };

        const loadScanDirectories = async () => {
            try {
                scanDirectories.value = await window.loomContext.db.query("SELECT * FROM scan_directories ORDER BY id DESC");
            } catch (e) {
                console.error("Failed to load scan directories", e);
            }
        };

        const getSourceName = (id) => {
            const s = sources.value.find(s => s.id === id);
            return s ? `${s.name} (${s.kind})` : `Unknown (${id})`;
        };

        const addScanDirectory = async () => {
            if (!selectedSourceId.value) return;
            const path = inputPath.value || '/';
            try {
                await window.loomContext.db.execute("INSERT INTO scan_directories (source_id, path) VALUES (?, ?)", [selectedSourceId.value, path]);
                inputPath.value = '/';
                await loadScanDirectories();
            } catch (e) {
                console.error("Failed to add scan directory", e);
            }
        };

        const deleteScanDirectory = async (id) => {
            try {
                await window.loomContext.db.execute("DELETE FROM scan_directories WHERE id = ?", [id]);
                await loadScanDirectories();
            } catch (e) {
                console.error("Failed to delete scan directory", e);
            }
        };

        const loadPickerItems = async () => {
            isLoadingPicker.value = true;
            try {
                const items = await window.loomContext.vfs.list(selectedSourceId.value, currentPickerPath.value);
                // Filter for directories only and sort alphabetically
                pickerItems.value = items.filter(i => i.is_dir).sort((a, b) => a.name.localeCompare(b.name));
            } catch (e) {
                console.error("Failed to list directory", e);
                pickerItems.value = [];
            } finally {
                isLoadingPicker.value = false;
            }
        };

        const openPicker = async () => {
            if (!selectedSourceId.value) return;
            currentPickerPath.value = inputPath.value || '/';
            showFolderPicker.value = true;
            await loadPickerItems();
        };

        const navigatePicker = async (folderName) => {
            if (folderName === '..') {
                if (currentPickerPath.value === '/' || currentPickerPath.value === '') return;
                const parts = currentPickerPath.value.split('/').filter(Boolean);
                parts.pop();
                currentPickerPath.value = parts.length ? '/' + parts.join('/') : '/';
            } else {
                if (currentPickerPath.value.endsWith('/')) {
                    currentPickerPath.value += folderName;
                } else {
                    currentPickerPath.value += '/' + folderName;
                }
            }
            await loadPickerItems();
        };

        const confirmPicker = () => {
            inputPath.value = currentPickerPath.value;
            showFolderPicker.value = false;
        };

        const cancelPicker = () => {
            showFolderPicker.value = false;
        };

        onMounted(async () => {
            try {
                await loadStats();
                const srcs = await window.loomContext.vfs.getSources();
                sources.value = srcs;
                if(srcs.length > 0) {
                    selectedSourceId.value = srcs[0].id;
                }
                
                // Initialize scan_directories table if running on older DB
                await window.loomContext.db.execute(`
                  CREATE TABLE IF NOT EXISTS scan_directories (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      source_id INTEGER NOT NULL,
                      path TEXT NOT NULL DEFAULT '/',
                      created_at TEXT NOT NULL DEFAULT (datetime('now'))
                  )
                `);
                
                await loadScanDirectories();
            } catch (e) {
                console.error("Failed to load initial data", e);
            } finally {
                loading.value = false;
            }
        });

        const startScan = async (dir) => {
            if (isScanning.value) return;
            isScanning.value = true;
            scanningId.value = dir.id;
            scanProgress.value = '开始扫描...';
            try {
                if (window.prepareScannerCache) {
                    await window.prepareScannerCache(dir.source_id);
                }
                await window.scanDirectory(dir.source_id, dir.path, (msg) => {
                    scanProgress.value = msg;
                });
                scanProgress.value = '扫描成功完成！';
            } catch (e) {
                console.error(e);
                scanProgress.value = '错误: ' + e;
            } finally {
                if (window.finishScannerCache) {
                    window.finishScannerCache();
                }
                isScanning.value = false;
                scanningId.value = null;
                setTimeout(() => { if (!isScanning.value) scanProgress.value = ''; }, 3000);
                await loadStats(); // Refresh DB stats
            }
        };

        return { 
            currentRoute, navigate, goBack, goForward, canGoBack, canGoForward,
            showQueuePanel,
            loading, tablesCount, sources, selectedSourceId, inputPath, scanDirectories, getSourceName,
            addScanDirectory, deleteScanDirectory,
            isScanning, scanningId, scanProgress, startScan,
            showFolderPicker, currentPickerPath, pickerItems, isLoadingPicker,
            openPicker, navigatePicker, confirmPicker, cancelPicker,
            currentTrack, isPlaying, currentTime, duration, volume, isMuted, playMode, progressPercent,
            queue, queueIndex, currentLyrics, activeLyricIndex, lyricsOffsetY, playQueueTrack,
            formatTime, togglePlay, toggleMute, togglePlayMode, seekByClick, setVolumeByClick,
            playNext, playPrevious
        };
    }
};
})();
