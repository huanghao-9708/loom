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
                    <tr class="text-[10px] uppercase tracking-widest text-text-muted border-b-2 border-black">
                        <th class="pb-3 pl-4 font-bold w-16 text-center">NO.</th>
                        <th class="pb-3 font-bold">TITLE</th>
                        <th class="pb-3 font-bold">ARTIST</th>
                        <th class="pb-3 font-bold">ALBUM</th>
                        <th class="pb-3 pr-6 font-bold text-right">TIME</th>
                        <th class="pb-3 pr-4 font-bold text-right">FORMAT</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(track, index) in tracks" :key="track.id" 
                        class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-100 last:border-0"
                        @dblclick="playTrack(track)">
                        <td class="py-4 pl-4 text-center text-text-muted font-mono text-xs relative tabular-nums">
                            <span class="group-hover:hidden">{{ String(index + 1).padStart(2, '0') }}</span>
                            <button @click.stop="playTrack(track)" class="hidden group-hover:flex absolute inset-0 items-center justify-center text-accent">
                                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"></path></svg>
                            </button>
                        </td>
                        <td class="py-4 font-medium text-text-primary">
                            <div class="flex items-center gap-3">
                                <span class="truncate max-w-[280px]">{{ track.title }}</span>
                            </div>
                        </td>
                        <td class="py-4 text-text-secondary text-sm truncate max-w-[150px]">{{ track.artist_name || 'Unknown' }}</td>
                        <td class="py-4 text-text-secondary text-sm italic truncate max-w-[150px]">{{ track.album_title || 'Unknown' }}</td>
                        <td class="py-4 pr-6 text-right text-text-muted font-mono text-xs tabular-nums">{{ formatTime(track.duration_ms ? track.duration_ms / 1000 : 0) }}</td>
                        <td class="py-4 pr-4 text-right text-text-muted font-mono text-[10px] uppercase tracking-wider">FLAC</td>
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

const ArtistsView = {
    template: `
        <div class="w-full">
            <div v-if="loading" class="text-text-muted">Loading artists...</div>
            <div v-else-if="artists.length === 0" class="text-text-muted flex flex-col items-center justify-center h-64">
                <p>No artists found.</p>
            </div>
            <table v-else class="w-full text-left border-collapse">
                <thead>
                    <tr class="text-[10px] uppercase tracking-widest text-text-muted border-b-2 border-black">
                        <th class="pb-3 pl-4 font-bold w-16 text-center">NO.</th>
                        <th class="pb-3 font-bold">ARTIST</th>
                        <th class="pb-3 pr-6 font-bold text-right">SONGS</th>
                        <th class="pb-3 pr-4 font-bold text-right">ALBUMS</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(artist, index) in artists" :key="artist.id" 
                        class="group hover:bg-gray-50 transition cursor-pointer border-b border-gray-100 last:border-0">
                        <td class="py-4 pl-4 text-center text-text-muted font-mono text-xs tabular-nums">{{ String(index + 1).padStart(2, '0') }}</td>
                        <td class="py-4 font-medium text-text-primary">
                            <span class="truncate max-w-[280px]">{{ artist.name }}</span>
                        </td>
                        <td class="py-4 pr-6 text-right text-text-secondary text-sm font-mono tabular-nums">{{ artist.tracks_count }}</td>
                        <td class="py-4 pr-4 text-right text-text-secondary text-sm font-mono tabular-nums">{{ artist.albums_count }}</td>
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

        onMounted(fetchArtists);
        return { loading, artists };
    }
};

window.AppViews = { TracksView, ArtistsView };
})();
