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
    return `http://loom.localhost/plugin_data/${cachePath}`;
};

const TracksView = {
    template: `
        <div class="w-full">
            <div v-if="loading" class="text-text-muted">Loading tracks...</div>
            <div v-else-if="tracks.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64">
                <svg class="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                <p>No tracks found. Go to Settings to scan a folder.</p>
            </div>
            <table v-else class="w-full text-left border-collapse">
                <thead>
                    <tr class="text-xs uppercase tracking-wider text-text-muted border-b border-border-light">
                        <th class="pb-3 pl-4 font-semibold w-12 text-center">#</th>
                        <th class="pb-3 font-semibold">Title</th>
                        <th class="pb-3 font-semibold">Artist</th>
                        <th class="pb-3 font-semibold">Album</th>
                        <th class="pb-3 pr-4 font-semibold text-right">Time</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(track, index) in tracks" :key="track.id" 
                        class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-50 last:border-0"
                        @dblclick="playTrack(track)">
                        <td class="py-3 pl-4 text-center text-text-muted font-mono text-xs relative">
                            <span class="group-hover:hidden">{{ index + 1 }}</span>
                            <button @click.stop="playTrack(track)" class="hidden group-hover:flex absolute inset-0 items-center justify-center text-black">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                            </button>
                        </td>
                        <td class="py-3 font-medium text-text-primary">
                            <div class="flex items-center gap-3">
                                <img v-if="track.cover_url" :src="track.cover_url" class="w-8 h-8 rounded object-cover shadow-sm" />
                                <div v-else class="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                                </div>
                                <span class="truncate max-w-[250px]">{{ track.title }}</span>
                            </div>
                        </td>
                        <td class="py-3 text-text-secondary truncate max-w-[150px]">{{ track.artist_name }}</td>
                        <td class="py-3 text-text-secondary truncate max-w-[150px]">{{ track.album_title }}</td>
                        <td class="py-3 pr-4 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                    </tr>
                </tbody>
            </table>
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

        const playTrack = (track) => {
            window.PlayerStore.actions.playTrack(track, tracks.value);
        };

        onMounted(fetchTracks);

        return { loading, tracks, playTrack, formatTime };
    }
};

const AlbumsView = {
    template: `
        <div class="w-full">
            <div v-if="loading" class="text-text-muted">Loading albums...</div>
            <div v-else-if="albums.length === 0" class="text-text-muted">No albums found.</div>
            <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                <div v-for="album in albums" :key="album.id" class="group cursor-pointer">
                    <div class="aspect-square bg-gray-200 rounded-lg mb-3 overflow-hidden shadow-sm border border-black/5 relative">
                        <img v-if="album.cover_url" :src="album.cover_url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
                            <svg class="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        </div>
                        <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <button class="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition hover:scale-105">
                                <svg class="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="font-medium text-text-primary text-sm truncate">{{ album.title }}</div>
                    <div class="text-xs text-text-secondary truncate mt-0.5">{{ album.artist_name }}</div>
                </div>
            </div>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const albums = ref([]);

        const fetchAlbums = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT al.id, al.title, a.name as artist_name, art.cache_path
                    FROM albums al
                    LEFT JOIN artists a ON al.album_artist_id = a.id
                    LEFT JOIN artwork art ON al.cover_artwork_id = art.id
                    ORDER BY al.title ASC
                `);
                albums.value = rows.map(r => ({
                    ...r,
                    cover_url: getArtworkUrl(r.cache_path)
                }));
            } catch (e) {
                console.error("Failed to load albums", e);
            } finally {
                loading.value = false;
            }
        };

        onMounted(fetchAlbums);
        return { loading, albums };
    }
};

const ArtistsView = {
    template: `
        <div class="w-full">
            <div v-if="loading" class="text-text-muted">Loading artists...</div>
            <div v-else-if="artists.length === 0" class="text-text-muted">No artists found.</div>
            <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                <div v-for="artist in artists" :key="artist.id" class="group cursor-pointer flex flex-col items-center">
                    <div class="w-full aspect-square bg-gray-100 rounded-full mb-3 overflow-hidden shadow-sm border border-black/5 flex items-center justify-center">
                        <svg class="w-16 h-16 text-gray-300 group-hover:scale-110 transition-transform duration-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
                    </div>
                    <div class="font-medium text-text-primary text-sm truncate w-full text-center">{{ artist.name }}</div>
                </div>
            </div>
        </div>
    `,
    setup() {
        const loading = ref(true);
        const artists = ref([]);

        const fetchArtists = async () => {
            loading.value = true;
            try {
                const rows = await window.loomContext.db.query(`
                    SELECT id, name
                    FROM artists
                    ORDER BY name ASC
                `);
                artists.value = rows;
            } catch (e) {
                console.error("Failed to load artists", e);
            } finally {
                loading.value = false;
            }
        };

        onMounted(fetchArtists);
        return { loading, artists };
    }
};

window.AppViews = { TracksView, AlbumsView, ArtistsView };
})();
