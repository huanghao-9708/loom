(() => {
const { ref, onMounted } = Vue;

window.AppConfig = {
     template: `
      <div class="flex h-full w-full flex-col bg-bg-base">
          <div class="flex-1 flex overflow-hidden">
             <!-- Left Sidebar -->
             <div class="w-56 border-r border-border-light bg-bg-secondary flex flex-col select-none shrink-0">
                <div class="h-16 border-b border-border-light flex items-center px-4 shrink-0">
                    <span class="text-sm font-bold tracking-tight text-text-primary">Loom</span>
                    <span class="ml-1.5 text-[9px] font-mono text-text-muted tracking-[0.12em]">MUSIC</span>
                    <div class="ml-auto flex items-center gap-0.5 text-text-muted">
                        <button @click="goBack" :disabled="!canGoBack" :class="['w-7 h-7 rounded-md flex items-center justify-center transition', canGoBack ? 'hover:bg-gray-100 text-text-primary' : 'opacity-20 cursor-not-allowed']">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <button @click="goForward" :disabled="!canGoForward" :class="['w-7 h-7 rounded-md flex items-center justify-center transition', canGoForward ? 'hover:bg-gray-100 text-text-primary' : 'opacity-20 cursor-not-allowed']">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                    <div class="space-y-0.5 text-[13px] font-medium">
                        <div @click="navigate('tracks')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'tracks' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                            全部歌曲
                        </div>
                        <div @click="navigate('artists')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'artists' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            艺人
                        </div>
                    </div>

                    <div>
                        <div class="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 font-mono">收藏</div>
                        <div class="space-y-0.5 text-[13px] font-medium">
                            <div @click="navigate('favorites')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'favorites' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                                收藏歌曲
                                <span v-if="favoritesCount > 0" class="ml-auto text-[10px] text-text-muted font-mono">{{ favoritesCount }}</span>
                            </div>
                            <div @click="navigate('favoriteArtists')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'favoriteArtists' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                收藏艺人
                                <span v-if="favoriteArtistsCount > 0" class="ml-auto text-[10px] text-text-muted font-mono">{{ favoriteArtistsCount }}</span>
                            </div>
                            <div @click="navigate('favoriteAlbums')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'favoriteAlbums' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                收藏专辑
                                <span v-if="favoriteAlbumsCount > 0" class="ml-auto text-[10px] text-text-muted font-mono">{{ favoriteAlbumsCount }}</span>
                            </div>
                            <div @click="navigate('recent')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'recent' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                最近播放
                            </div>
                            <div @click="navigate('queue')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'queue' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                                播放队列
                                <span v-if="queueCount > 0" class="ml-auto text-[10px] text-text-muted font-mono">{{ queueCount }}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="px-3 mb-2 flex items-center justify-between">
                            <div class="text-[10px] font-bold uppercase tracking-widest text-text-muted font-mono">歌单</div>
                        </div>
                        <div class="space-y-0.5 text-[13px] font-medium text-text-secondary">
                            <div v-for="pl in playlists" :key="pl.id" @click="navigate('playlistDetail', { id: pl.id, name: pl.name })"
                                 :class="['px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition group', (currentRoute.name === 'playlistDetail' && currentRoute.params.id == pl.id) ? 'bg-white text-text-primary shadow-sm' : 'hover:bg-gray-100 hover:text-text-primary']">
                                <span class="truncate">{{ pl.name }}</span>
                                <span class="text-[10px] text-text-muted font-mono flex-shrink-0 ml-2">{{ pl.track_count }}</span>
                            </div>
                            <div v-if="playlists.length === 0" class="px-3 py-2 text-[11px] text-text-muted italic">暂无歌单</div>
                            <div @click="openCreatePlaylist" class="px-3 py-2 mt-2 flex items-center gap-3 text-text-muted cursor-pointer hover:bg-gray-100 hover:text-text-primary rounded-lg transition">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                新建歌单
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 font-mono">设置</div>
                        <div class="space-y-0.5 text-[13px] font-medium">
                            <div @click="navigate('settings')" :class="['px-3 py-2 rounded-lg cursor-pointer transition flex items-center gap-3', currentRoute.name === 'settings' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                设置
                            </div>
                        </div>
                    </div>
                </div>
             </div>

             <!-- Center Main Content -->
              <div class="flex-1 flex flex-col min-w-0">
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
                                 <span class="font-mono font-bold text-text-primary">{{tablesCount}}</span>
                             </div>
                         </div>
                         <div class="w-full">
                             <div class="border border-border-light rounded-lg p-6 bg-bg-secondary mb-6 max-w-xl">
                                 <h3 class="text-sm font-semibold mb-2">添加扫描目录</h3>
                                 <p class="text-text-secondary mb-4 leading-relaxed text-xs">选择一个虚拟文件系统源并指定相对路径，将其添加到音乐扫描器中。</p>
                                 <div class="flex items-end gap-3">
                                     <div class="flex-1">
                                         <label class="block text-xs font-medium text-text-secondary mb-1">目录源</label>
                                         <select v-model="selectedSourceId" class="w-full border border-border-light rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm">
                                             <option :value="null" disabled>选择挂载源...</option>
                                             <option v-for="s in sources" :key="s.id" :value="s.id">{{s.name}} ({{s.kind}})</option>
                                         </select>
                                     </div>
                                     <div class="flex-1">
                                         <label class="block text-xs font-medium text-text-secondary mb-1">相对路径</label>
                                         <div class="flex items-center gap-2">
                                             <input v-model="inputPath" type="text" placeholder="/" class="w-full border border-border-light rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 text-sm" />
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
                <favorites-view v-if="currentRoute.name === 'favorites'"></favorites-view>
                <favorite-artists-view v-if="currentRoute.name === 'favoriteArtists'"></favorite-artists-view>
                <favorite-albums-view v-if="currentRoute.name === 'favoriteAlbums'"></favorite-albums-view>
                <recent-view v-if="currentRoute.name === 'recent'"></recent-view>
                <queue-view v-if="currentRoute.name === 'queue'"></queue-view>
                <playlist-detail-view v-if="currentRoute.name === 'playlistDetail'" :playlist-id="currentRoute.params.id" :playlist-name="currentRoute.params.name"></playlist-detail-view>
                </main>
                
                <!-- Footer Stats -->
             </div>

             <!-- Right Context Panel -->
             <div v-if="currentTrack" class="w-72 border-l border-border-light flex flex-col shrink-0">
                <div class="pt-8 pb-3 px-6 flex flex-col items-center gap-6 shrink-0">
                    <div class="w-44 h-44 bg-bg-secondary rounded-xl border border-border-light/60 overflow-hidden flex items-center justify-center text-text-muted">
                        <img v-if="currentTrack?.cover_url" :src="currentTrack.cover_url" class="w-full h-full object-cover" />
                        <svg v-else class="w-14 h-14 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                    </div>
                    <div class="flex flex-col text-center w-full">
                        <div class="text-base font-bold text-text-primary tracking-tight truncate leading-tight" :title="currentTrack.title">{{ currentTrack.title }}</div>
                        <div class="text-[12px] font-medium text-text-secondary mt-1 truncate" :title="currentTrack.artist_name">{{ currentTrack.artist_name }}</div>
                    </div>
                </div>

                <div class="flex-1 relative overflow-hidden px-4" style="mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%);" id="lyrics-container">
                    <div class="absolute top-0 left-0 right-0 transition-transform duration-500 ease-out flex flex-col gap-4 text-[13px] font-medium text-text-secondary text-center"
                         :style="{ transform: 'translateY(' + lyricsOffsetY + 'px)' }" id="lyrics-inner">
                        <div v-if="!currentLyrics || currentLyrics.length === 0" class="text-text-muted mt-24">暂无歌词</div>
                        <div v-for="(line, index) in currentLyrics" :key="index" :id="'lyric-line-' + index"
                             @click="actions.seek(line.time)"
                             :class="[
                                 'transition-all duration-300 cursor-pointer px-4 leading-relaxed',
                                 index === activeLyricIndex ? 'font-semibold text-text-primary' : 'hover:text-text-primary'
                             ]">
                            {{ line.text }}
                        </div>
                    </div>
                </div>
             </div>
          </div>

          <!-- Bottom Player Bar -->
          <div class="h-[72px] bg-bg-base flex items-center px-5 justify-between border-t border-border-light shrink-0">
             <div class="flex items-center gap-3 min-w-[180px]">
                 <div class="w-11 h-11 bg-bg-secondary rounded-md border border-border-light flex items-center justify-center text-text-muted overflow-hidden bg-cover bg-center" :style="currentTrack?.cover_url ? 'background-image: url(' + currentTrack.cover_url + ')' : ''">
                    <svg v-if="!currentTrack?.cover_url" class="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                 </div>
                 <div class="flex flex-col truncate max-w-[140px]">
                    <div class="text-[13px] font-medium text-text-primary truncate leading-tight">{{ currentTrack ? currentTrack.title : '暂无歌曲' }}</div>
                    <div class="text-[11px] text-text-muted truncate mt-0.5">{{ currentTrack ? currentTrack.artist_name : '未在播放' }}</div>
                 </div>
             </div>

             <div class="flex flex-col items-center gap-1.5 max-w-xl flex-1 px-6">
                 <div class="flex items-center gap-5">
                     <button @click="togglePlayMode" class="text-text-muted hover:text-text-primary transition" :class="{'text-text-primary': playMode !== 'normal'}">
                        <svg v-if="playMode === 'shuffle'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        <span v-if="playMode === 'loop-one'" class="absolute -mt-3.5 ml-2.5 text-[7px] font-bold">1</span>
                     </button>
                     <button @click="playPrevious" class="text-text-secondary hover:text-text-primary transition">
                         <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>
                     </button>
                     <button @click="togglePlay" class="w-9 h-9 bg-white border border-border-light rounded-full flex items-center justify-center hover:shadow-sm transition-all active:scale-95">
                        <svg v-if="!isPlaying" class="w-4 h-4 ml-0.5 text-text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                        <svg v-else class="w-4 h-4 text-text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"></path></svg>
                     </button>
                     <button @click="playNext" class="text-text-secondary hover:text-text-primary transition">
                         <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path></svg>
                     </button>
                     <button class="text-text-muted opacity-40 cursor-not-allowed">
                         <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                     </button>
                 </div>
                 <div class="w-full flex items-center gap-2.5">
                     <span class="text-[10px] text-text-muted font-mono w-8 text-right tabular-nums">{{ formatTime(currentTime) }}</span>
                     <div class="flex-1 h-1 bg-gray-100 cursor-pointer group relative rounded-full" @click="seekByClick">
                         <div class="h-full bg-text-primary group-hover:bg-black transition-colors absolute left-0 pointer-events-none rounded-full" :style="{ width: progressPercent + '%' }"></div>
                     </div>
                     <span class="text-[10px] text-text-muted font-mono w-8 tabular-nums">{{ formatTime(duration) }}</span>
                 </div>
             </div>

             <div class="flex items-center gap-4 text-text-muted min-w-[180px] justify-end">
                 <button @click="toggleMute" class="hover:text-text-primary transition">
                    <svg v-if="isMuted || volume === 0" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                 </button>
                 <div class="w-16 h-1 bg-gray-100 cursor-pointer relative rounded-full" @click="setVolumeByClick">
                     <div class="h-full bg-text-muted absolute left-0 pointer-events-none rounded-full" :style="{ width: (volume * 100) + '%' }"></div>
                 </div>
                 <div class="h-3 w-px bg-border-light"></div>
                 <button @click="showQueuePanel = !showQueuePanel" :class="['transition hover:text-text-primary', showQueuePanel ? 'text-text-primary' : 'text-text-muted']">
                     <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                 </button>
             </div>
          </div>

          <!-- Queue Flyout Panel -->
          <div v-if="showQueuePanel" class="absolute bottom-[72px] right-5 w-96 bg-white rounded-xl shadow-2xl border border-border-light flex flex-col overflow-hidden z-40" style="max-height: 55vh;">
              <div class="px-4 py-3 border-b border-border-light flex items-center justify-between bg-bg-secondary shrink-0">
                  <div class="flex flex-col">
                      <span class="text-sm font-semibold text-text-primary tracking-tight">接下来的播放</span>
                      <span class="text-[10px] text-text-muted font-mono mt-0.5">{{ queue.length }} 首歌曲</span>
                  </div>
                  <button @click="showQueuePanel = false" class="text-text-muted hover:text-text-primary transition">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
              </div>
              <div v-if="queue.length === 0" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-bg-base">
                  <svg class="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                  <p class="text-xs text-text-secondary">队列为空<br>双击歌曲或点击"播放全部"</p>
              </div>
              <div v-else class="flex-1 overflow-y-auto bg-white p-1">
                  <div v-for="(track, index) in queue" :key="track.id + '-' + index" 
                       @dblclick="playQueueTrack(index)"
                       class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group transition mb-0.5"
                       :class="{'bg-gray-50': queueIndex === index}">
                      <div class="text-[10px] font-mono w-5 text-center flex-shrink-0 group-hover:hidden" :class="{'text-text-primary': queueIndex === index, 'text-text-muted': queueIndex !== index}">
                          <span v-if="queueIndex === index" class="animate-pulse">▶</span>
                          <span v-else>{{ index + 1 }}</span>
                      </div>
                      <button @click.stop="playQueueTrack(index)" class="w-5 h-5 flex-shrink-0 hidden group-hover:flex items-center justify-center hover:scale-110 transition-transform text-text-secondary">
                          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                      </button>
                      <div class="w-7 h-7 rounded border border-border-light bg-bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0" :style="track.cover_url ? 'background-image: url(' + track.cover_url + '); background-size: cover;' : ''">
                          <svg v-if="!track.cover_url" class="w-3.5 h-3.5 text-text-muted opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                      </div>
                      <div class="flex-1 flex flex-col min-w-0 pr-2">
                          <div class="text-[11px] font-medium text-text-primary truncate leading-tight" :class="{'text-text-primary': queueIndex === index}">{{ track.title }}</div>
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
                              <svg class="w-5 h-5 text-text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
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

        <!-- 新建歌单 模态框 -->
        <div v-if="showCreatePlaylist" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeCreatePlaylist">
            <div class="bg-white rounded-lg shadow-2xl w-[420px] overflow-hidden flex flex-col">
                <div class="px-6 py-5 border-b border-border-light">
                    <h2 class="text-lg font-bold text-text-primary">新建歌单</h2>
                </div>
                <div class="px-6 py-6">
                    <input ref="playlistNameInput" v-model="newPlaylistName" type="text" placeholder="输入歌单名称"
                        @keydown.enter="confirmCreatePlaylist"
                        class="w-full px-4 py-2.5 border border-border-light rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" />
                </div>
                <div class="px-6 py-4 border-t border-border-light bg-bg-secondary flex justify-end gap-3">
                    <button @click="closeCreatePlaylist" class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition">取消</button>
                    <button @click="confirmCreatePlaylist" :disabled="!newPlaylistName.trim()" class="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed">创建</button>
                </div>
            </div>
        </div>

        <!-- 添加到歌单 模态框 -->
        <div v-if="addToPlaylistModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeAddToPlaylist">
            <div class="bg-white rounded-lg shadow-2xl w-[420px] overflow-hidden flex flex-col max-h-[80vh]">
                <div class="px-6 py-5 border-b border-border-light">
                    <h2 class="text-lg font-bold text-text-primary">添加到歌单</h2>
                    <p class="text-xs text-text-muted mt-1 truncate">歌曲：{{ addToPlaylistModal.trackTitle }}</p>
                </div>
                <div class="flex-1 overflow-y-auto p-2">
                    <div v-if="playlists.length === 0" class="flex flex-col items-center justify-center py-10 text-text-muted text-sm">
                        <p class="mb-3">还没有任何歌单</p>
                        <button @click="quickCreatePlaylist" class="text-text-primary text-xs font-medium hover:underline">立即创建一个</button>
                    </div>
                    <div v-else>
                        <div v-for="pl in playlists" :key="pl.id" @click="confirmAddToPlaylist(pl.id)"
                             class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-md transition">
                            <div class="flex items-center gap-3 min-w-0">
                                <svg class="w-5 h-5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"></path></svg>
                                <span class="text-sm text-text-primary truncate">{{ pl.name }}</span>
                            </div>
                            <span class="text-[10px] text-text-muted font-mono flex-shrink-0 ml-2">{{ pl.track_count }}</span>
                        </div>
                    </div>
                </div>
                <div class="px-6 py-4 border-t border-border-light bg-bg-secondary flex justify-end gap-3">
                    <button @click="closeAddToPlaylist" class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition">取消</button>
                </div>
            </div>
        </div>
    `,
    components: {
        'tracks-view': window.AppViews.TracksView,
        'artists-view': window.AppViews.ArtistsView,
        'artist-detail-view': window.AppViews.ArtistDetailView,
        'album-detail-view': window.AppViews.AlbumDetailView,
        'favorites-view': window.AppViews.FavoritesView,
        'favorite-artists-view': window.AppViews.FavoriteArtistsView,
        'favorite-albums-view': window.AppViews.FavoriteAlbumsView,
        'recent-view': window.AppViews.RecentView,
        'queue-view': window.AppViews.QueueView,
        'playlist-detail-view': window.AppViews.PlaylistDetailView
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

        // ============ 收藏 & 歌单（来自 views.js 共享状态） ============
        const favorites = computed(() => window.AppState.favorites.favorites);
        const favoritesCount = computed(() => Object.keys(window.AppState.favorites.favorites || {}).length);
        const favoriteArtistsCount = computed(() => Object.keys(window.AppState.favorites.artistFavorites || {}).length);
        const favoriteAlbumsCount = computed(() => Object.keys(window.AppState.favorites.albumFavorites || {}).length);
        const playlists = computed(() => window.AppState.playlists.playlists);
        const addToPlaylistModal = computed(() => window.AppState.addToPlaylistModal);
        const queueCount = computed(() => state.queue.length);

        const showCreatePlaylist = ref(false);
        const newPlaylistName = ref('');
        const playlistNameInput = ref(null);

        const openCreatePlaylist = () => {
            newPlaylistName.value = '';
            showCreatePlaylist.value = true;
            setTimeout(() => { playlistNameInput.value && playlistNameInput.value.focus(); }, 50);
        };
        const closeCreatePlaylist = () => { showCreatePlaylist.value = false; };
        const confirmCreatePlaylist = async () => {
            const name = newPlaylistName.value.trim();
            if (!name) return;
            await window.AppActions.createPlaylist(name);
            showCreatePlaylist.value = false;
        };

        const closeAddToPlaylist = () => window.AppActions.closeAddToPlaylistModal();
        const confirmAddToPlaylist = async (playlistId) => {
            await window.AppActions.addToPlaylist(playlistId, addToPlaylistModal.value.trackId);
            window.AppActions.closeAddToPlaylistModal();
        };
        const quickCreatePlaylist = async () => {
            const name = '我的歌单 ' + (playlists.value.length + 1);
            await window.AppActions.createPlaylist(name);
            closeAddToPlaylist();
        };
        // ============================================================

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

                // 加载收藏与歌单数据
                if (window.AppActions) {
                    await window.AppActions.loadFavorites();
                    await window.AppActions.loadFavoriteArtists();
                    await window.AppActions.loadFavoriteAlbums();
                    await window.AppActions.loadPlaylists();
                }
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
            playNext, playPrevious,
            favorites, favoritesCount, favoriteArtistsCount, favoriteAlbumsCount, playlists, addToPlaylistModal, queueCount,
            showCreatePlaylist, newPlaylistName, playlistNameInput,
            openCreatePlaylist, closeCreatePlaylist, confirmCreatePlaylist,
            closeAddToPlaylist, confirmAddToPlaylist, quickCreatePlaylist
        };
    }
};
})();
