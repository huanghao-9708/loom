(() => {
const { ref, onMounted, computed, watch } = Vue;

const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const getArtworkUrl = (cachePath) => {
    if (!cachePath) return null;
    return `http://loom.localhost/plugin_data/com.loom.music/${cachePath}`;
};

// Reusable table rows for tracks
const TracksTableTemplate = `
    <table class="w-full text-left border-collapse">
        <thead>
            <tr class="text-xs uppercase tracking-widest text-text-muted border-b border-border-light bg-bg-base sticky top-0 z-10 backdrop-blur-md bg-opacity-90">
                <th class="py-3 pl-6 font-medium w-16 text-center">序号</th>
                <th class="py-3 font-medium">标题</th>
                <th class="py-3 font-medium">艺人</th>
                <th class="py-3 font-medium">专辑</th>
                <th class="py-3 pr-8 font-medium text-right">时长</th>
                <th class="py-3 pr-6 font-medium text-right">格式</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="(track, index) in tracks" :key="track.id" 
                class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-100 last:border-0"
                @dblclick="playTrack(track)">
                <td class="py-2.5 pl-6 text-center text-text-muted font-mono text-xs relative tabular-nums">
                    <span class="group-hover:hidden">{{ String(index + 1).padStart(2, '0') }}</span>
                    <button @click.stop="playTrack(track)" class="hidden group-hover:flex absolute inset-0 items-center justify-center text-accent">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                    </button>
                </td>
                <td class="py-2.5 font-medium text-text-primary text-sm">
                    <div class="flex items-center gap-3">
                        <span class="truncate max-w-[280px]">{{ track.title }}</span>
                    </div>
                </td>
                <td class="py-2.5 text-text-secondary text-xs truncate max-w-[150px]">{{ track.artist_name || '未知' }}</td>
                <td class="py-2.5 text-text-secondary text-xs italic truncate max-w-[150px]">{{ track.album_title || '未知' }}</td>
                <td class="py-2.5 pr-8 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                <td class="py-2.5 pr-6 text-right text-text-muted font-mono text-[10px] uppercase tracking-wider">FLAC</td>
            </tr>
        </tbody>
    </table>
`;

const TracksView = {
    template: `
        <div class="w-full px-8 pb-8">
            <div class="py-6 flex items-center justify-between sticky top-0 bg-bg-base z-20">
                <h1 class="text-2xl font-bold tracking-tight text-text-primary">全部歌曲</h1>
                <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                    播放全部
                </button>
            </div>
            <div v-if="loading" class="text-text-muted mt-4">加载歌曲中...</div>
            <div v-else-if="tracks.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64 mt-4">
                <svg class="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                <p>未找到歌曲。请前往设置扫描文件夹。</p>
            </div>
            <div v-else>
                ${TracksTableTemplate}
            </div>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const tracks = ref([]);

        const fetchTracks = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT 
                        t.id, t.title, m.duration_ms, 
                        a.name as artist_name, 
                        al.title as album_title, 
                        m.source_id, m.normalized_path, 
                        art.cache_path
                    FROM tracks t
                    LEFT JOIN track_artists ta ON t.id = ta.track_id AND ta.role = 'main'
                    LEFT JOIN artists a ON ta.artist_id = a.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    LEFT JOIN media_files m ON t.primary_file_id = m.id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    ORDER BY t.title ASC
                `);
                tracks.value = rows.map(r => ({
                    ...r,
                    cover_url: getArtworkUrl(r.cache_path)
                }));
            } catch (e) {
                console.error("Failed to load tracks", e);
            } finally {
                loading.value = false;
            }
        };

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        onMounted(fetchTracks);
        return { loading, tracks, playTrack, playAll, formatTime };
    }
};

const ArtistsView = {
    template: `
        <div class="w-full px-8 pb-8">
            <div class="py-6 flex items-center justify-between sticky top-0 bg-bg-base z-20">
                <h1 class="text-2xl font-bold tracking-tight text-text-primary">艺人</h1>
            </div>
            <div v-if="loading" class="text-text-muted mt-4">加载艺人中...</div>
            <div v-else-if="artists.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64 mt-4">
                <p>未找到艺人。</p>
            </div>
            <table v-else class="w-full text-left border-collapse">
                <thead>
                    <tr class="text-xs uppercase tracking-widest text-text-muted border-b border-border-light bg-bg-base sticky top-[80px] z-10 backdrop-blur-md bg-opacity-90">
                        <th class="py-3 pl-6 font-medium w-16 text-center">序号</th>
                        <th class="py-3 font-medium">艺人</th>
                        <th class="py-3 pr-8 font-medium text-right">歌曲数</th>
                        <th class="py-3 pr-6 font-medium text-right">专辑数</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(artist, index) in artists" :key="artist.id" 
                        @click="goToArtist(artist)"
                        class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-100 last:border-0">
                        <td class="py-2.5 pl-6 text-center text-text-muted font-mono text-xs tabular-nums">{{ String(index + 1).padStart(2, '0') }}</td>
                        <td class="py-2.5 font-medium text-text-primary text-sm">
                            <span class="truncate max-w-[280px] group-hover:text-accent transition">{{ artist.name }}</span>
                        </td>
                        <td class="py-2.5 pr-8 text-right text-text-secondary text-xs font-mono tabular-nums">{{ artist.tracks_count }}</td>
                        <td class="py-2.5 pr-6 text-right text-text-secondary text-xs font-mono tabular-nums">{{ artist.albums_count }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const artists = ref([]);

        const fetchArtists = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT 
                        a.id, a.name,
                        COUNT(DISTINCT ta.track_id) as tracks_count,
                        COUNT(DISTINCT al.id) as albums_count
                    FROM artists a
                    LEFT JOIN track_artists ta ON a.id = ta.artist_id
                    LEFT JOIN albums al ON a.id = al.album_artist_id
                    GROUP BY a.id
                    ORDER BY a.name ASC
                `);
                artists.value = rows;
            } catch (e) {
                console.error("Failed to load artists", e);
            } finally {
                loading.value = false;
            }
        };

        const goToArtist = (artist) => {
            window.AppRouter.navigate('artistDetail', { id: artist.id, name: artist.name });
        };

        onMounted(fetchArtists);
        return { loading, artists, goToArtist };
    }
};

const ArtistDetailView = {
    props: ['artistId', 'artistName'],
    template: `
        <div class="w-full flex flex-col h-full">
            <div class="px-8 pt-8 pb-4 shrink-0 flex items-center justify-between">
                <h1 class="text-3xl font-bold tracking-tight text-text-primary">{{ artistName }}</h1>
            </div>
            
            <div class="px-8 border-b border-border-light flex gap-6 text-sm font-medium shrink-0">
                <div @click="activeTab = 'tracks'" :class="['pb-3 cursor-pointer transition', activeTab === 'tracks' ? 'text-text-primary border-b-2 border-black' : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent']">歌曲 ({{ tracks.length }})</div>
                <div @click="activeTab = 'albums'" :class="['pb-3 cursor-pointer transition', activeTab === 'albums' ? 'text-text-primary border-b-2 border-black' : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent']">专辑 ({{ albums.length }})</div>
            </div>

            <div class="flex-1 overflow-y-auto pt-4 px-8 pb-8 relative">
                <!-- Tracks Tab -->
                <div v-show="activeTab === 'tracks'">
                    <div class="flex items-center mb-4 sticky top-0 bg-bg-base z-20 py-2">
                        <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                            播放全部
                        </button>
                    </div>
                    <div v-if="loading" class="text-text-muted">加载中...</div>
                    <div v-else-if="tracks.length === 0" class="text-text-muted mt-4">未找到歌曲。</div>
                    <div v-else>
                        ${TracksTableTemplate}
                    </div>
                </div>

                <!-- Albums Tab -->
                <div v-show="activeTab === 'albums'" class="pt-4 pb-8">
                    <div v-if="loading" class="text-text-muted">加载中...</div>
                    <div v-else-if="albums.length === 0" class="text-text-muted mt-4">未找到专辑。</div>
                    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        <div v-for="album in albums" :key="album.id" @click="goToAlbum(album)" class="flex flex-col gap-3 group cursor-pointer">
                            <div class="aspect-square bg-bg-secondary rounded-lg border border-border-light overflow-hidden shadow-sm group-hover:shadow-md transition">
                                <img v-if="album.cover_url" :src="album.cover_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                <div v-else class="w-full h-full flex items-center justify-center text-text-muted">
                                    <svg class="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                                </div>
                            </div>
                            <div class="flex flex-col">
                                <span class="font-medium text-sm text-text-primary truncate group-hover:text-accent transition">{{ album.title }}</span>
                                <span class="text-xs text-text-muted mt-0.5">{{ album.tracks_count }} 首歌曲</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    setup(props) {
        const loading = ref(true);
        const activeTab = ref('tracks');
        const tracks = ref([]);
        const albums = ref([]);

        const loadData = async () => {
            loading.value = true;
            try {
                // Load Tracks
                const trackRows = await window.loomContext.db.query(`
                    SELECT 
                        t.id, t.title, m.duration_ms, 
                        a.name as artist_name, 
                        al.title as album_title, 
                        m.source_id, m.normalized_path, 
                        art.cache_path
                    FROM tracks t
                    LEFT JOIN track_artists ta ON t.id = ta.track_id AND ta.role = 'main'
                    LEFT JOIN artists a ON ta.artist_id = a.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    LEFT JOIN media_files m ON t.primary_file_id = m.id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    WHERE ta.artist_id = ?
                    ORDER BY t.title ASC
                `, [props.artistId]);
                tracks.value = trackRows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));

                // Load Albums
                const albumRows = await window.loomContext.db.query(`
                    SELECT 
                        al.id, al.title, 
                        COUNT(t.id) as tracks_count,
                        art.cache_path
                    FROM albums al
                    LEFT JOIN tracks t ON al.id = t.album_id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    WHERE al.album_artist_id = ?
                    GROUP BY al.id
                    ORDER BY al.title ASC
                `, [props.artistId]);
                albums.value = albumRows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
                
            } catch (e) {
                console.error("Failed to load artist detail", e);
            } finally {
                loading.value = false;
            }
        };

        watch(() => props.artistId, loadData, { immediate: true });

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };
        
        const goToAlbum = (album) => {
            window.AppRouter.navigate('albumDetail', { id: album.id });
        };

        return { loading, activeTab, tracks, albums, playTrack, playAll, goToAlbum, formatTime };
    }
};

const AlbumDetailView = {
    props: ['albumId'],
    template: `
        <div class="w-full flex flex-col h-full">
            <div v-if="loading" class="p-8 text-text-muted">加载中...</div>
            <template v-else-if="album">
                <div class="px-8 pt-8 pb-8 shrink-0 flex items-end gap-6 bg-gradient-to-b from-gray-50 to-bg-base border-b border-border-light">
                    <div class="w-48 h-48 bg-bg-secondary rounded-lg border border-border-light overflow-hidden shadow-lg shrink-0">
                        <img v-if="album.cover_url" :src="album.cover_url" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex items-center justify-center text-text-muted">
                            <svg class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="text-[10px] font-bold tracking-widest uppercase text-text-muted font-mono">专辑</div>
                        <h1 class="text-4xl font-bold tracking-tight text-text-primary mb-2">{{ album.title }}</h1>
                        <div class="text-sm font-medium text-text-secondary flex items-center gap-2">
                            <span @click="goToArtist" class="text-text-primary hover:underline cursor-pointer">{{ album.artist_name || '未知艺人' }}</span>
                            <span>•</span>
                            <span>{{ tracks.length }} 首歌曲</span>
                        </div>
                        <div class="mt-4 flex items-center gap-4">
                            <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                                播放全部
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto px-8 py-4 relative">
                    <div v-if="tracks.length === 0" class="text-text-muted mt-4">未找到歌曲。</div>
                    <div v-else>
                        ${TracksTableTemplate}
                    </div>
                </div>
            </template>
        </div>
    `,
    setup(props) {
        const loading = ref(true);
        const album = ref(null);
        const tracks = ref([]);

        const loadData = async () => {
            loading.value = true;
            try {
                // Load Album Info
                const albumRows = await window.loomContext.db.query(`
                    SELECT 
                        al.id, al.title, al.album_artist_id,
                        a.name as artist_name,
                        art.cache_path
                    FROM albums al
                    LEFT JOIN artists a ON al.album_artist_id = a.id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    WHERE al.id = ?
                `, [props.albumId]);
                
                if (albumRows.length > 0) {
                    album.value = { ...albumRows[0], cover_url: getArtworkUrl(albumRows[0].cache_path) };
                }

                // Load Tracks
                const trackRows = await window.loomContext.db.query(`
                    SELECT 
                        t.id, t.title, m.duration_ms, 
                        a.name as artist_name, 
                        al.title as album_title, 
                        m.source_id, m.normalized_path, 
                        art.cache_path
                    FROM tracks t
                    LEFT JOIN track_artists ta ON t.id = ta.track_id AND ta.role = 'main'
                    LEFT JOIN artists a ON ta.artist_id = a.id
                    LEFT JOIN albums al ON t.album_id = al.id
                    LEFT JOIN media_files m ON t.primary_file_id = m.id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    WHERE t.album_id = ?
                    ORDER BY t.track_no ASC, t.title ASC
                `, [props.albumId]);
                tracks.value = trackRows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
                
            } catch (e) {
                console.error("Failed to load album detail", e);
            } finally {
                loading.value = false;
            }
        };

        watch(() => props.albumId, loadData, { immediate: true });

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        const goToArtist = () => {
            if (album.value && album.value.album_artist_id) {
                window.AppRouter.navigate('artistDetail', { id: album.value.album_artist_id, name: album.value.artist_name });
            }
        };

        return { loading, album, tracks, playTrack, playAll, goToArtist, formatTime };
    }
};

window.AppViews = { TracksView, ArtistsView, ArtistDetailView, AlbumDetailView };
})();
