const artistCache = new Map();
const albumCache = new Map();
const genreCache = new Map();
let existingFilesSet = null; // Actually a Map now

window.prepareScannerCache = async function(sourceId) {
    artistCache.clear();
    albumCache.clear();
    genreCache.clear();
    existingFilesSet = new Map();
    try {
        const rows = await window.loomContext.db.query("SELECT id, normalized_path, duration_ms FROM media_files WHERE source_id = ?", [sourceId]);
        if (rows) {
            for (let r of rows) {
                existingFilesSet.set(r.normalized_path, r);
            }
        }
    } catch(e) {
        console.warn("[Scanner] Failed to build existing files cache", e);
    }
};

window.finishScannerCache = function() {
    artistCache.clear();
    albumCache.clear();
    genreCache.clear();
    existingFilesSet = null;
};

function getAudioDuration(url) {
    return new Promise((resolve) => {
        const a = new Audio();
        a.addEventListener('loadedmetadata', () => {
            if (a.duration && !isNaN(a.duration) && a.duration !== Infinity) {
                resolve(Math.round(a.duration * 1000));
            } else {
                resolve(0);
            }
        });
        a.addEventListener('error', () => resolve(0));
        a.src = url;
    });
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function splitArtists(artistStr) {
    if (!artistStr) return ["Unknown Artist"];
    // Split by common separators: '&', ',', '/', '、', 'feat.', 'ft.'
    const parts = artistStr.split(/&|,|\/|、|\bfeat\.\b|\bft\.\b/i);
    const artists = parts.map(s => s.trim()).filter(Boolean);
    return artists.length > 0 ? artists : ["Unknown Artist"];
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Extract ID3 tags using jsmediatags
function parseAudioTags(sourceId, vpath) {
    return new Promise((resolve) => {
        // Encode URI path to handle spaces and special chars
        const encodedPath = vpath.split('/').map(encodeURIComponent).join('/');
        const url = `http://loom.localhost/preview/${sourceId}${encodedPath}`;
        
        window.jsmediatags.read(url, {
            onSuccess: function(tag) {
                resolve(tag.tags);
            },
            onError: function(error) {
                console.warn(`[Scanner] Failed to parse tags for ${vpath}:`, error.info);
                resolve(null);
            }
        });
    });
}

async function getOrInsertArtist(name) {
    if (!name) name = "Unknown Artist";
    const normalized = name.toLowerCase().trim();
    if (artistCache.has(normalized)) return artistCache.get(normalized);
    
    // Check if exists
    const existing = await window.loomContext.db.query("SELECT id FROM artists WHERE normalized_name = ?", [normalized]);
    if (existing && existing.length > 0) {
        artistCache.set(normalized, existing[0].id);
        return existing[0].id;
    }
    
    // Insert
    const res = await window.loomContext.db.execute("INSERT INTO artists (name, normalized_name, kind) VALUES (?, ?, 'person')", [name, normalized]);
    artistCache.set(normalized, res.lastInsertId);
    return res.lastInsertId;
}

async function getOrInsertAlbum(title, artistId, coverArtworkId) {
    if (!title) title = "Unknown Album";
    const normalized = title.toLowerCase().trim();
    const cacheKey = `${normalized}-${artistId}`;
    if (albumCache.has(cacheKey)) return albumCache.get(cacheKey);
    
    const existing = await window.loomContext.db.query("SELECT id FROM albums WHERE normalized_title = ? AND album_artist_id = ?", [normalized, artistId]);
    if (existing && existing.length > 0) {
        albumCache.set(cacheKey, existing[0].id);
        return existing[0].id;
    }
    
    const res = await window.loomContext.db.execute(
        "INSERT INTO albums (title, normalized_title, album_artist_id, cover_artwork_id) VALUES (?, ?, ?, ?)", 
        [title, normalized, artistId, coverArtworkId]
    );
    albumCache.set(cacheKey, res.lastInsertId);
    return res.lastInsertId;
}

async function getOrInsertGenre(name) {
    if (!name) return null;
    const normalized = name.toLowerCase().trim();
    if (genreCache.has(normalized)) return genreCache.get(normalized);
    
    const existing = await window.loomContext.db.query("SELECT id FROM genres WHERE normalized_name = ?", [normalized]);
    if (existing && existing.length > 0) {
        genreCache.set(normalized, existing[0].id);
        return existing[0].id;
    }
    
    const res = await window.loomContext.db.execute("INSERT INTO genres (name, normalized_name) VALUES (?, ?)", [name, normalized]);
    genreCache.set(normalized, res.lastInsertId);
    return res.lastInsertId;
}

async function processFile(sourceId, file, directoryFiles) {
    const ext = file.ext ? file.ext.toLowerCase() : '';
    if (!['mp3', 'flac', 'wav', 'm4a', 'ogg'].includes(ext)) return;

    // Skip if already in DB (or patch missing duration)
    if (existingFilesSet && existingFilesSet.has(file.vpath)) {
        const existingRec = existingFilesSet.get(file.vpath);
        if (existingRec.duration_ms > 0) {
            return; // Fast skip
        } else {
            // Repair missing duration
            const encodedPath = file.vpath.split('/').map(encodeURIComponent).join('/');
            const url = `http://loom.localhost/preview/${sourceId}${encodedPath}`;
            const durationMs = await getAudioDuration(url);
            if (durationMs > 0) {
                await window.loomContext.db.execute("UPDATE media_files SET duration_ms = ? WHERE id = ?", [durationMs, existingRec.id]);
                existingRec.duration_ms = durationMs;
            }
            return; // Repaired, no need to process tags again
        }
    } else if (!existingFilesSet) {
        const existing = await window.loomContext.db.query("SELECT id, duration_ms FROM media_files WHERE source_id = ? AND normalized_path = ?", [sourceId, file.vpath]);
        if (existing && existing.length > 0) {
            if (existing[0].duration_ms > 0) return;
        }
    }

    // Parse tags
    const tags = await parseAudioTags(sourceId, file.vpath);
    
    let title = file.name;
    let artistName = "Unknown Artist";
    let albumName = "Unknown Album";
    let genreName = null;
    let year = null;
    let trackNo = null;
    let coverArtworkId = null;

    if (tags) {
        if (tags.title) title = tags.title;
        if (tags.artist) artistName = tags.artist;
        if (tags.album) albumName = tags.album;
        if (tags.genre) genreName = tags.genre;
        if (tags.year) year = parseInt(tags.year) || null;
        if (tags.track) trackNo = parseInt(tags.track.split('/')[0]) || null;

        // Process Artwork
        if (tags.picture && tags.picture.data) {
            const cachePath = `artworks/${generateUUID()}.jpg`;
            const base64Data = arrayBufferToBase64(tags.picture.data);
            
            // Save to disk using our new IPC
            await window.loomContext.fs.write(cachePath, base64Data);
            
            // Insert into artwork table (media_file_id will be updated later)
            const artRes = await window.loomContext.db.execute(
                "INSERT INTO artwork (cache_path, mime_type) VALUES (?, ?)", 
                [cachePath, tags.picture.format || 'image/jpeg']
            );
            coverArtworkId = artRes.lastInsertId;
        }
    }

    // 1. Artist
    let artistNames = splitArtists(artistName);
    const artistIds = [];
    for (let name of artistNames) {
        artistIds.push(await getOrInsertArtist(name));
    }
    const primaryArtistId = artistIds[0];
    
    // 2. Album
    let albumArtistName = (tags && tags.albumArtist) ? tags.albumArtist : artistNames[0];
    const albumArtistIds = splitArtists(albumArtistName);
    const primaryAlbumArtistId = await getOrInsertArtist(albumArtistIds[0]);
    const albumId = await getOrInsertAlbum(albumName, primaryAlbumArtistId, coverArtworkId);
    
    // 3. Track
    const normalizedTitle = title.toLowerCase().trim();
    const trackRes = await window.loomContext.db.execute(`
        INSERT INTO tracks (title, normalized_title, album_id, track_no, year)
        VALUES (?, ?, ?, ?, ?)
    `, [title, normalizedTitle, albumId, trackNo, year]);
    const trackId = trackRes.lastInsertId;

    // 4. Track Artist Mapping
    for (let i = 0; i < artistIds.length; i++) {
        const role = (i === 0) ? 'main' : 'featured';
        await window.loomContext.db.execute(
            "INSERT INTO track_artists (track_id, artist_id, role, position) VALUES (?, ?, ?, ?)",
            [trackId, artistIds[i], role, i]
        );
    }

    // 5. Track Genre Mapping
    if (genreName) {
        const genreId = await getOrInsertGenre(genreName);
        if (genreId) {
            await window.loomContext.db.execute(
                "INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)",
                [trackId, genreId]
            );
        }
    }

    // 6. Media File
    const encodedPath = file.vpath.split('/').map(encodeURIComponent).join('/');
    const url = `http://loom.localhost/preview/${sourceId}${encodedPath}`;
    const durationMs = await getAudioDuration(url);

    const mediaRes = await window.loomContext.db.execute(`
        INSERT INTO media_files (source_id, track_id, relative_path, normalized_path, file_name, file_ext, file_size, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [sourceId, trackId, file.vpath, file.vpath, file.name, file.ext, file.size_bytes || 0, durationMs]);
    const mediaFileId = mediaRes.lastInsertId;

    // Update artwork with media_file_id
    if (coverArtworkId) {
        await window.loomContext.db.execute("UPDATE artwork SET media_file_id = ? WHERE id = ?", [mediaFileId, coverArtworkId]);
    }
    
    // 7. Update Track's primary_file_id
    await window.loomContext.db.execute("UPDATE tracks SET primary_file_id = ? WHERE id = ?", [mediaFileId, trackId]);

    // 8. Find and import lyrics
    let lrcContent = null;
    let lrcSource = null;

    if (tags && tags.lyrics) {
        lrcContent = typeof tags.lyrics === 'string' ? tags.lyrics : tags.lyrics.lyrics;
        if (lrcContent) lrcSource = 'embedded';
    }
    
    if (!lrcContent && directoryFiles) {
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const lrcFile = directoryFiles.find(f => !f.is_dir && f.name.toLowerCase() === `${baseName.toLowerCase()}.lrc`);
        if (lrcFile) {
            try {
                const encodedLrcPath = lrcFile.vpath.split('/').map(encodeURIComponent).join('/');
                const lrcUrl = `http://loom.localhost/preview/${sourceId}${encodedLrcPath}`;
                const res = await fetch(lrcUrl);
                if (res.ok) {
                    lrcContent = await res.text();
                    lrcSource = 'local';
                }
            } catch (err) {
                console.warn(`[Scanner] Failed to read lrc file: ${lrcFile.vpath}`, err);
            }
        }
    }

    if (lrcContent && lrcContent.trim().length > 0) {
        const isSynced = /\[\d+:\d{2}(\.\d{1,3})?\]/.test(lrcContent);
        const format = isSynced ? 'lrc' : 'plain';
        await window.loomContext.db.execute(`
            INSERT INTO lyrics (track_id, media_file_id, format, synced, content, source)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [trackId, mediaFileId, format, isSynced ? 1 : 0, lrcContent, lrcSource]);
    }
}

window.scanDirectory = async function scanDirectory(sourceId, path, onProgress) {
    try {
        const files = await window.loomContext.vfs.list(sourceId, path);
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.is_dir) {
                // Recursively scan subdirectories
                await scanDirectory(sourceId, f.vpath, onProgress);
            } else {
                if (onProgress) onProgress(`Parsing ${f.name}...`);
                await processFile(sourceId, f, files);
            }
        }
    } catch (e) {
        console.error(`[Scanner] Error scanning directory ${path}:`, e);
    }
}
