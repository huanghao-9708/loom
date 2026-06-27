(() => {
const { ref, onMounted, computed, watch, reactive } = Vue;

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

// 把 sqlite 的 UTC datetime（'YYYY-MM-DD HH:MM:SS'）转为相对时间描述
const formatRelativeTime = (isoStr) => {
    if (!isoStr) return '';
    let s = String(isoStr).replace(' ', 'T');
    if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    const then = new Date(s);
    if (isNaN(then)) return '';
    const now = new Date();
    const diff = Math.max(0, (now - then) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';
    return then.toLocaleDateString('zh-CN');
};

// ===================== 共享：收藏 & 歌单状态 =====================
const collectionState = reactive({ favorites: {} });   // { trackId: true }
const playlistState = reactive({ playlists: [] });      // [{ id, name, track_count, ... }]
const addToPlaylistModal = reactive({ show: false, trackId: null, trackTitle: '' });

const db = () => window.loomContext.db;

async function loadFavorites() {
    try {
        const rows = await db().query("SELECT track_id FROM favorite_tracks");
        const fav = {};
        rows.forEach(r => { fav[r.track_id] = true; });
        collectionState.favorites = fav;
    } catch (e) { console.error('loadFavorites', e); }
}

function isFavorite(id) { return !!collectionState.favorites[id]; }

async function toggleFavorite(track) {
    if (!track || track.id == null) return;
    const id = track.id;
    try {
        if (collectionState.favorites[id]) {
            await db().execute("DELETE FROM favorite_tracks WHERE track_id = ?", [id]);
            delete collectionState.favorites[id];
        } else {
            await db().execute("INSERT INTO favorite_tracks (track_id) VALUES (?)", [id]);
            collectionState.favorites[id] = true;
        }
    } catch (e) { console.error('toggleFavorite', e); }
}

async function loadPlaylists() {
    try {
        const rows = await db().query(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) AS track_count
            FROM playlists p
            ORDER BY p.sort_order ASC, p.id DESC
        `);
        playlistState.playlists = rows;
    } catch (e) { console.error('loadPlaylists', e); }
}

async function createPlaylist(name) {
    name = (name || '').trim();
    if (!name) return;
    await db().execute("INSERT INTO playlists (name, kind) VALUES (?, 'manual')", [name]);
    await loadPlaylists();
}

async function deletePlaylist(id) {
    await db().execute("DELETE FROM playlists WHERE id = ?", [id]);
    await loadPlaylists();
}

async function renamePlaylist(id, name) {
    name = (name || '').trim();
    if (!name) return;
    await db().execute("UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?", [name, id]);
    await loadPlaylists();
}

async function addToPlaylist(playlistId, trackId) {
    if (playlistId == null || trackId == null) return;
    const exist = await db().query("SELECT id FROM playlist_items WHERE playlist_id = ? AND track_id = ?", [playlistId, trackId]);
    if (exist && exist.length) return; // 已存在则跳过
    await db().execute(`
        INSERT INTO playlist_items (playlist_id, track_id, position)
        VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_items WHERE playlist_id = ?))
    `, [playlistId, trackId, playlistId]);
    await loadPlaylists();
}

async function removeFromPlaylist(itemId) {
    await db().execute("DELETE FROM playlist_items WHERE id = ?", [itemId]);
    await loadPlaylists();
}

function openAddToPlaylistModal(track) {
    addToPlaylistModal.trackId = track && track.id;
    addToPlaylistModal.trackTitle = track ? track.title : '';
    addToPlaylistModal.show = true;
}

function closeAddToPlaylistModal() {
    addToPlaylistModal.show = false;
}

// 表格行复用的方法集
const tableFns = () => ({ isFav: isFavorite, toggleFav: toggleFavorite, addToMenu: openAddToPlaylistModal });

window.AppActions = {
    loadFavorites, loadPlaylists, createPlaylist, deletePlaylist, renamePlaylist,
    addToPlaylist, removeFromPlaylist, toggleFavorite, isFavorite,
    openAddToPlaylistModal, closeAddToPlaylistModal
};
window.AppState = { favorites: collectionState, playlists: playlistState, addToPlaylistModal };
// =================================================================

// 行内复用：收藏心形按钮（已收藏常显，未收藏 hover 显示）
const FavButtonTpl = `
    <button @click.stop="toggleFav(track)" :title="isFav(track.id) ? '取消收藏' : '收藏'"
        :class="['transition-transform hover:scale-110 flex-shrink-0', isFav(track.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']">
        <svg class="w-3.5 h-3.5" :class="isFav(track.id) ? 'text-red-500' : 'text-text-muted'" :fill="isFav(track.id) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
        </svg>
    </button>
`;

const AddToPlaylistBtnTpl = `
    <button @click.stop="addToMenu(track)" title="添加到歌单" class="opacity-0 group-hover:opacity-100 transition text-text-muted hover:text-accent">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
    </button>
`;

// 通用查询：完整 track 字段 + 封面缓存路径
const TRACK_SELECT = `
    t.id, t.title, m.duration_ms,
    a.name as artist_name,
    al.title as album_title,
    m.source_id, m.normalized_path,
    art.cache_path
`;
const TRACK_JOINS = `
    LEFT JOIN track_artists ta ON t.id = ta.track_id AND ta.role = 'main'
    LEFT JOIN artists a ON ta.artist_id = a.id
    LEFT JOIN albums al ON t.album_id = al.id
    LEFT JOIN media_files m ON t.primary_file_id = m.id
    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
`;

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
                <th class="py-3 pr-6 font-medium text-right w-16">操作</th>
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
                    <div class="flex items-center gap-2">
                        <span class="truncate max-w-[260px]">{{ track.title }}</span>
                        ${FavButtonTpl}
                    </div>
                </td>
                <td class="py-2.5 text-text-secondary text-xs truncate max-w-[150px]">{{ track.artist_name || '未知' }}</td>
                <td class="py-2.5 text-text-secondary text-xs italic truncate max-w-[150px]">{{ track.album_title || '未知' }}</td>
                <td class="py-2.5 pr-8 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                <td class="py-2.5 pr-6 text-right">
                    ${AddToPlaylistBtnTpl}
                </td>
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
                    SELECT ${TRACK_SELECT}
                    FROM tracks t
                    ${TRACK_JOINS}
                    ORDER BY t.title ASC
                `);
                tracks.value = rows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
            } catch (e) {
                console.error("Failed to load tracks", e);
            } finally {
                loading.value = false;
            }
        };

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        onMounted(fetchTracks);
        return { loading, tracks, playTrack, playAll, formatTime, ...tableFns() };
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
                const trackRows = await window.loomContext.db.query(`
                    SELECT ${TRACK_SELECT}
                    FROM tracks t
                    ${TRACK_JOINS}
                    WHERE ta.artist_id = ?
                    ORDER BY t.title ASC
                `, [props.artistId]);
                tracks.value = trackRows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));

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

        return { loading, activeTab, tracks, albums, playTrack, playAll, goToAlbum, formatTime, ...tableFns() };
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

                const trackRows = await window.loomContext.db.query(`
                    SELECT ${TRACK_SELECT}
                    FROM tracks t
                    ${TRACK_JOINS}
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

        return { loading, album, tracks, playTrack, playAll, goToArtist, formatTime, ...tableFns() };
    }
};

// ===================== 收藏歌曲 =====================
const FavoritesView = {
    template: `
        <div class="w-full px-8 pb-8">
            <div class="py-6 flex items-center justify-between sticky top-0 bg-bg-base z-20">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-text-primary">收藏歌曲</h1>
                    <p class="text-xs text-text-muted mt-1 font-mono">{{ tracks.length }} 首歌曲</p>
                </div>
                <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                    播放全部
                </button>
            </div>
            <div v-if="loading" class="text-text-muted mt-4">加载中...</div>
            <div v-else-if="tracks.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64 mt-4">
                <svg class="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                <p>还没有收藏任何歌曲。<br/>点击歌曲标题旁的爱心即可收藏。</p>
            </div>
            <div v-else>
                ${TracksTableTemplate}
            </div>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const tracks = ref([]);

        const fetchFavorites = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT ${TRACK_SELECT}, f.favorited_at
                    FROM favorite_tracks f
                    JOIN tracks t ON f.track_id = t.id
                    ${TRACK_JOINS}
                    ORDER BY f.favorited_at DESC
                `);
                tracks.value = rows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
            } catch (e) {
                console.error("Failed to load favorites", e);
            } finally {
                loading.value = false;
            }
        };

        // 收藏状态变化时（在任意视图点爱心）实时刷新本列表
        watch(() => JSON.stringify(collectionState.favorites), fetchFavorites);

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        onMounted(fetchFavorites);
        return { loading, tracks, playTrack, playAll, formatTime, ...tableFns() };
    }
};

// ===================== 最近播放 =====================
const RecentView = {
    template: `
        <div class="w-full px-8 pb-8">
            <div class="py-6 flex items-center justify-between sticky top-0 bg-bg-base z-20">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-text-primary">最近播放</h1>
                    <p class="text-xs text-text-muted mt-1 font-mono">{{ tracks.length }} 首歌曲</p>
                </div>
                <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                    播放全部
                </button>
            </div>
            <div v-if="loading" class="text-text-muted mt-4">加载中...</div>
            <div v-else-if="tracks.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64 mt-4">
                <svg class="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <p>还没有播放记录。<br/>双击任意歌曲开始聆听吧。</p>
            </div>
            <div v-else>
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-xs uppercase tracking-widest text-text-muted border-b border-border-light bg-bg-base sticky top-0 z-10 backdrop-blur-md bg-opacity-90">
                            <th class="py-3 pl-6 font-medium w-16 text-center">序号</th>
                            <th class="py-3 font-medium">标题</th>
                            <th class="py-3 font-medium">艺人</th>
                            <th class="py-3 font-medium">专辑</th>
                            <th class="py-3 font-medium">上次播放</th>
                            <th class="py-3 pr-8 font-medium text-right">时长</th>
                            <th class="py-3 pr-6 font-medium text-right w-16">操作</th>
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
                                <div class="flex items-center gap-2">
                                    <span class="truncate max-w-[220px]">{{ track.title }}</span>
                                    ${FavButtonTpl}
                                </div>
                            </td>
                            <td class="py-2.5 text-text-secondary text-xs truncate max-w-[130px]">{{ track.artist_name || '未知' }}</td>
                            <td class="py-2.5 text-text-secondary text-xs italic truncate max-w-[130px]">{{ track.album_title || '未知' }}</td>
                            <td class="py-2.5 text-text-muted text-xs">{{ formatRelativeTime(track.last_played_at) }}</td>
                            <td class="py-2.5 pr-8 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                            <td class="py-2.5 pr-6 text-right">
                                ${AddToPlaylistBtnTpl}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const tracks = ref([]);

        const fetchRecent = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT ${TRACK_SELECT}, MAX(ph.played_at) as last_played_at
                    FROM play_history ph
                    JOIN tracks t ON ph.track_id = t.id
                    ${TRACK_JOINS}
                    WHERE ph.track_id IS NOT NULL
                    GROUP BY t.id
                    ORDER BY last_played_at DESC
                    LIMIT 200
                `);
                tracks.value = rows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
            } catch (e) {
                console.error("Failed to load recent plays", e);
            } finally {
                loading.value = false;
            }
        };

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        onMounted(fetchRecent);
        return { loading, tracks, playTrack, playAll, formatTime, formatRelativeTime, ...tableFns() };
    }
};

// ===================== 播放队列 =====================
const QueueView = {
    template: `
        <div class="w-full px-8 pb-8 flex flex-col h-full">
            <div class="py-6 flex items-center justify-between sticky top-0 bg-bg-base z-20">
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-text-primary">播放队列</h1>
                    <p class="text-xs text-text-muted mt-1 font-mono">{{ queue.length }} 首歌曲</p>
                </div>
                <div class="flex items-center gap-3">
                    <button @click="clearQueue" v-if="queue.length > 0" class="text-text-secondary hover:text-red-500 transition px-4 py-2 rounded-full text-xs font-medium border border-border-light bg-white flex items-center gap-2">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        清空队列
                    </button>
                    <button @click="playAll" v-if="queue.length > 0" class="bg-black text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                        播放全部
                    </button>
                </div>
            </div>
            <div v-if="queue.length === 0" class="text-text-muted flex flex-col items-center justify-center flex-1">
                <svg class="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                <p>播放队列为空。<br/>双击歌曲或点击"播放全部"加入队列。</p>
            </div>
            <div v-else>
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-xs uppercase tracking-widest text-text-muted border-b border-border-light bg-bg-base sticky top-0 z-10 backdrop-blur-md bg-opacity-90">
                            <th class="py-3 pl-6 font-medium w-16 text-center">序号</th>
                            <th class="py-3 font-medium">标题</th>
                            <th class="py-3 font-medium">艺人</th>
                            <th class="py-3 pr-8 font-medium text-right">时长</th>
                            <th class="py-3 pr-6 font-medium text-right w-16">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(track, index) in queue" :key="track.id + '-' + index"
                            class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-100 last:border-0"
                            :class="{'bg-gray-50': index === currentIndex}"
                            @dblclick="playFrom(index)">
                            <td class="py-2.5 pl-6 text-center font-mono text-xs relative tabular-nums">
                                <span v-if="index === currentIndex" class="text-accent animate-pulse">▶</span>
                                <span v-else class="group-hover:hidden text-text-muted">{{ String(index + 1).padStart(2, '0') }}</span>
                                <button v-if="index !== currentIndex" @click.stop="playFrom(index)" class="hidden group-hover:flex absolute inset-0 items-center justify-center text-accent">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                                </button>
                            </td>
                            <td class="py-2.5 font-medium text-sm" :class="index === currentIndex ? 'text-accent' : 'text-text-primary'">
                                <div class="flex items-center gap-3">
                                    <div class="w-9 h-9 rounded border border-border-light bg-bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0" :style="track.cover_url ? 'background-image: url(' + track.cover_url + '); background-size: cover;' : ''">
                                        <svg v-if="!track.cover_url" class="w-4 h-4 text-text-muted opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="truncate max-w-[240px]">{{ track.title }}</span>
                                        ${FavButtonTpl}
                                    </div>
                                </div>
                            </td>
                            <td class="py-2.5 text-text-secondary text-xs truncate max-w-[160px]">{{ track.artist_name || '未知艺人' }}</td>
                            <td class="py-2.5 pr-8 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                            <td class="py-2.5 pr-6 text-right">
                                <div class="flex items-center justify-end gap-1">
                                    ${AddToPlaylistBtnTpl}
                                    <button @click.stop="removeAt(index)" title="从队列移除" class="opacity-0 group-hover:opacity-100 transition text-text-muted hover:text-red-500">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `,
    setup() {
        const { state, actions } = window.PlayerStore;

        const queue = computed(() => state.queue);
        const currentIndex = computed(() => state.queueIndex);

        const playFrom = (i) => {
            const t = state.queue[i];
            if (t) { state.queueIndex = i; actions.playTrack(t); }
        };
        const playAll = () => { if (state.queue.length) playFrom(0); };

        const removeAt = (i) => {
            state.queue.splice(i, 1);
            if (state.queueIndex === i) {
                state.queueIndex = state.queue.length ? Math.min(i, state.queue.length - 1) : -1;
            } else if (state.queueIndex > i) {
                state.queueIndex -= 1;
            }
            if (state.queue.length === 0) state.queueIndex = -1;
        };

        const clearQueue = () => actions.clearQueue();

        return { queue, currentIndex, playFrom, playAll, removeAt, clearQueue, formatTime, ...tableFns() };
    }
};

// ===================== 歌单详情 =====================
const PlaylistDetailView = {
    props: ['playlistId', 'playlistName'],
    template: `
        <div class="w-full flex flex-col h-full">
            <div class="px-8 pt-8 pb-8 shrink-0 flex items-end gap-6 bg-gradient-to-b from-gray-50 to-bg-base border-b border-border-light">
                <div class="w-48 h-48 bg-bg-secondary rounded-lg border border-border-light overflow-hidden shadow-lg shrink-0 flex items-center justify-center text-text-muted">
                    <svg class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                </div>
                <div class="flex flex-col gap-2">
                    <div class="text-[10px] font-bold tracking-widest uppercase text-text-muted font-mono">歌单</div>
                    <h1 class="text-4xl font-bold tracking-tight text-text-primary mb-2">{{ playlistName }}</h1>
                    <div class="text-sm font-medium text-text-secondary flex items-center gap-2">
                        <span>{{ tracks.length }} 首歌曲</span>
                    </div>
                    <div class="mt-4 flex items-center gap-3">
                        <button @click="playAll" v-if="tracks.length > 0" class="bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition active:scale-95 flex items-center gap-2 shadow-md">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                            播放全部
                        </button>
                        <button @click="removePlaylist" class="text-text-secondary hover:text-red-500 transition px-4 py-2 rounded-full text-sm font-medium border border-border-light bg-white">删除歌单</button>
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-8 py-4 relative">
                <div v-if="loading" class="text-text-muted mt-4">加载中...</div>
                <template v-else>
                    <div v-if="tracks.length === 0" class="text-text-muted flex flex-col items-center justify-center h-48 mt-4">
                        <p>歌单还是空的。<br/>在任意歌曲行点击"+"将其添加到本歌单。</p>
                    </div>
                    <div v-else>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="text-xs uppercase tracking-widest text-text-muted border-b border-border-light bg-bg-base sticky top-0 z-10 backdrop-blur-md bg-opacity-90">
                                    <th class="py-3 pl-6 font-medium w-16 text-center">序号</th>
                                    <th class="py-3 font-medium">标题</th>
                                    <th class="py-3 font-medium">艺人</th>
                                    <th class="py-3 font-medium">专辑</th>
                                    <th class="py-3 pr-8 font-medium text-right">时长</th>
                                    <th class="py-3 pr-6 font-medium text-right w-20">操作</th>
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
                                        <div class="flex items-center gap-2">
                                            <span class="truncate max-w-[220px]">{{ track.title }}</span>
                                            ${FavButtonTpl}
                                        </div>
                                    </td>
                                    <td class="py-2.5 text-text-secondary text-xs truncate max-w-[130px]">{{ track.artist_name || '未知' }}</td>
                                    <td class="py-2.5 text-text-secondary text-xs italic truncate max-w-[130px]">{{ track.album_title || '未知' }}</td>
                                    <td class="py-2.5 pr-8 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                                    <td class="py-2.5 pr-6 text-right">
                                        <div class="flex items-center justify-end gap-1">
                                            ${AddToPlaylistBtnTpl}
                                            <button @click.stop="removeItem(track.item_id)" title="从歌单移除" class="opacity-0 group-hover:opacity-100 transition text-text-muted hover:text-red-500">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>
            </div>
        </div>
    `,
    setup(props) {
        const loading = ref(true);
        const tracks = ref([]);

        const fetchTracks = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT pi.id as item_id, ${TRACK_SELECT}
                    FROM playlist_items pi
                    JOIN tracks t ON pi.track_id = t.id
                    ${TRACK_JOINS}
                    WHERE pi.playlist_id = ?
                    ORDER BY pi.position ASC
                `, [props.playlistId]);
                tracks.value = rows.map(r => ({ ...r, cover_url: getArtworkUrl(r.cache_path) }));
            } catch (e) {
                console.error("Failed to load playlist detail", e);
            } finally {
                loading.value = false;
            }
        };

        watch(() => props.playlistId, fetchTracks, { immediate: true });
        // 歌单项增删（在添加到歌单模态框操作后）后刷新
        watch(() => JSON.stringify(playlistState.playlists), fetchTracks);

        const playTrack = (track) => window.PlayerStore.actions.playTrack(track, tracks.value);
        const playAll = () => { if (tracks.value.length) playTrack(tracks.value[0]); };

        const removeItem = async (itemId) => {
            await removeFromPlaylist(itemId);
            await fetchTracks();
        };

        const removePlaylist = async () => {
            if (!confirm('确定要删除歌单「' + props.playlistName + '」吗？')) return;
            await deletePlaylist(props.playlistId);
            window.AppRouter.navigate('tracks');
        };

        return { loading, tracks, playTrack, playAll, removeItem, removePlaylist, formatTime, ...tableFns() };
    }
};

window.AppViews = {
    TracksView, ArtistsView, ArtistDetailView, AlbumDetailView,
    FavoritesView, RecentView, QueueView, PlaylistDetailView
};
})();
