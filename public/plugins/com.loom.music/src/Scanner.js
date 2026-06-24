

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
    
    // Check if exists
    const existing = await window.loomContext.db.query("SELECT id FROM artists WHERE normalized_name = ?", [normalized]);
    if (existing && existing.length > 0) {
        return existing[0].id;
    }
    
    // Insert
    await window.loomContext.db.execute("INSERT INTO artists (name, normalized_name, kind) VALUES (?, ?, 'person')", [name, normalized]);
    const res = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
    return res[0].id;
}

async function getOrInsertAlbum(title, artistId, coverArtworkId) {
    if (!title) title = "Unknown Album";
    const normalized = title.toLowerCase().trim();
    
    const existing = await window.loomContext.db.query("SELECT id FROM albums WHERE normalized_title = ? AND album_artist_id = ?", [normalized, artistId]);
    if (existing && existing.length > 0) {
        return existing[0].id;
    }
    
    await window.loomContext.db.execute(
        "INSERT INTO albums (title, normalized_title, album_artist_id, cover_artwork_id) VALUES (?, ?, ?, ?)", 
        [title, normalized, artistId, coverArtworkId]
    );
    const res = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
    return res[0].id;
}

async function getOrInsertGenre(name) {
    if (!name) return null;
    const normalized = name.toLowerCase().trim();
    
    const existing = await window.loomContext.db.query("SELECT id FROM genres WHERE normalized_name = ?", [normalized]);
    if (existing && existing.length > 0) {
        return existing[0].id;
    }
    
    await window.loomContext.db.execute("INSERT INTO genres (name, normalized_name) VALUES (?, ?)", [name, normalized]);
    const res = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
    return res[0].id;
}

async function processFile(sourceId, file) {
    const ext = file.ext ? file.ext.toLowerCase() : '';
    if (!['mp3', 'flac', 'wav', 'm4a', 'ogg'].includes(ext)) return;

    // Skip if already in DB
    const existing = await window.loomContext.db.query("SELECT id FROM media_files WHERE source_id = ? AND normalized_path = ?", [sourceId, file.vpath]);
    if (existing && existing.length > 0) {
        return; // Already indexed
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
            await window.loomContext.db.execute(
                "INSERT INTO artwork (cache_path, mime_type) VALUES (?, ?)", 
                [cachePath, tags.picture.format || 'image/jpeg']
            );
            const artRes = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
            coverArtworkId = artRes[0].id;
        }
    }

    // 1. Artist
    const artistId = await getOrInsertArtist(artistName);
    
    // 2. Album
    const albumId = await getOrInsertAlbum(albumName, artistId, coverArtworkId);
    
    // 3. Track
    const normalizedTitle = title.toLowerCase().trim();
    await window.loomContext.db.execute(`
        INSERT INTO tracks (title, normalized_title, album_id, track_no, year)
        VALUES (?, ?, ?, ?, ?)
    `, [title, normalizedTitle, albumId, trackNo, year]);
    
    const trackRes = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
    const trackId = trackRes[0].id;

    // 4. Track Artist Mapping
    await window.loomContext.db.execute(
        "INSERT INTO track_artists (track_id, artist_id, role) VALUES (?, ?, 'main')",
        [trackId, artistId]
    );

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
    await window.loomContext.db.execute(`
        INSERT INTO media_files (source_id, track_id, relative_path, normalized_path, file_name, file_ext, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [sourceId, trackId, file.vpath, file.vpath, file.name, file.ext, file.size_bytes || 0]);

    const mediaRes = await window.loomContext.db.query("SELECT last_insert_rowid() as id");
    const mediaFileId = mediaRes[0].id;

    // Update artwork with media_file_id
    if (coverArtworkId) {
        await window.loomContext.db.execute("UPDATE artwork SET media_file_id = ? WHERE id = ?", [mediaFileId, coverArtworkId]);
    }
    
    // 7. Update Track's primary_file_id
    await window.loomContext.db.execute("UPDATE tracks SET primary_file_id = ? WHERE id = ?", [mediaFileId, trackId]);
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
                await processFile(sourceId, f);
            }
        }
    } catch (e) {
        console.error(`[Scanner] Error scanning directory ${path}:`, e);
    }
}
