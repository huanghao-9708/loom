(() => {
const { reactive, ref, watch } = Vue;

// The singleton audio element
const audio = new Audio();

function parseLrc(lrcContent) {
    const lines = lrcContent.split('\n');
    const lyrics = [];
    const timeRegex = /\[(\d+):(\d{2})(\.\d{1,3})?\]/g;
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        let match;
        const times = [];
        
        while ((match = timeRegex.exec(line)) !== null) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const ms = match[3] ? parseFloat('0' + match[3]) : 0;
            times.push(minutes * 60 + seconds + ms);
        }
        
        if (times.length > 0) {
            const text = line.replace(/\[\d+:\d{2}(\.\d{1,3})?\]/g, '').trim();
            if (text) {
                for (let time of times) {
                    lyrics.push({ time, text });
                }
            }
        }
    }
    
    // Sort by time
    lyrics.sort((a, b) => a.time - b.time);
    return lyrics;
}

const playerState = reactive({
    currentTrack: null, // Full track info from DB
    currentLyrics: [],
    lyricsFormat: 'plain',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    isMuted: false,
    queue: [],
    queueIndex: -1,
    playMode: 'normal' // 'normal', 'loop', 'loop-one', 'shuffle'
});

// Setup audio event listeners
audio.addEventListener('timeupdate', () => {
    playerState.currentTime = audio.currentTime;
});

audio.addEventListener('durationchange', () => {
    playerState.duration = audio.duration;
});

audio.addEventListener('play', () => {
    playerState.isPlaying = true;
});

audio.addEventListener('pause', () => {
    playerState.isPlaying = false;
});

audio.addEventListener('ended', () => {
    playNext();
});

audio.addEventListener('error', (e) => {
    console.error("[Audio Player] Error playing track:", e);
    // TODO: Record error in play_history
    playNext();
});

// Watch volume changes
watch(() => playerState.volume, (newVol) => {
    audio.volume = newVol;
});
watch(() => playerState.isMuted, (muted) => {
    audio.muted = muted;
});

// Actions
const playerActions = {
    async playTrack(track, queueList = null) {
        if (!track || !track.source_id || !track.normalized_path) {
            console.error("Invalid track object passed to playTrack");
            return;
        }

        // Set queue if provided
        if (queueList) {
            playerState.queue = queueList;
            playerState.queueIndex = queueList.findIndex(t => t.id === track.id);
        }

        playerState.currentTrack = track;
        
        // Fetch lyrics
        try {
            const lyricsRes = await window.loomContext.db.query("SELECT * FROM lyrics WHERE track_id = ?", [track.id]);
            if (lyricsRes && lyricsRes.length > 0) {
                const lrc = lyricsRes[0];
                playerState.lyricsFormat = lrc.format;
                
                const hasTimeTags = /\[\d+:\d{2}(\.\d{1,3})?\]/.test(lrc.content);
                
                if (lrc.format === 'lrc' || lrc.synced || hasTimeTags) {
                    playerState.currentLyrics = parseLrc(lrc.content);
                } else {
                    playerState.currentLyrics = lrc.content.split('\n').map(line => ({ time: 0, text: line })).filter(l => l.text.trim());
                }
            } else {
                playerState.currentLyrics = [];
            }
        } catch (err) {
            console.error("Failed to load lyrics:", err);
            playerState.currentLyrics = [];
        }
        
        // Build the physical VFS path using the custom protocol
        const encodedPath = track.normalized_path.split('/').map(encodeURIComponent).join('/');
        const url = `http://loom.localhost/preview/${track.source_id}${encodedPath}`;
        
        audio.src = url;
        try {
            await audio.play();
            // Record play history
            window.loomContext.db.execute("INSERT INTO play_history (track_id) VALUES (?)", [track.id]);
        } catch (e) {
            console.error("Playback failed:", e);
        }
    },

    togglePlay() {
        if (!playerState.currentTrack) return;
        if (playerState.isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
    },

    seek(time) {
        if (audio.readyState > 0) {
            audio.currentTime = time;
        }
    },

    setVolume(vol) {
        playerState.volume = Math.max(0, Math.min(1, vol));
    },

    toggleMute() {
        playerState.isMuted = !playerState.isMuted;
    },

    clearQueue() {
        playerState.queue = [];
        playerState.queueIndex = -1;
    }
};

function playNext() {
    if (playerState.queue.length === 0) return;
    
    let nextIndex = playerState.queueIndex + 1;
    
    if (playerState.playMode === 'loop-one') {
        nextIndex = playerState.queueIndex; // Replay same
    } else if (playerState.playMode === 'shuffle') {
        nextIndex = Math.floor(Math.random() * playerState.queue.length);
    } else if (nextIndex >= playerState.queue.length) {
        if (playerState.playMode === 'loop') {
            nextIndex = 0;
        } else {
            // End of queue
            playerState.isPlaying = false;
            audio.currentTime = 0;
            return;
        }
    }

    const nextTrack = playerState.queue[nextIndex];
    if (nextTrack) {
        playerState.queueIndex = nextIndex;
        playerActions.playTrack(nextTrack);
    }
}

function playPrevious() {
    if (playerState.queue.length === 0) return;
    
    // If playing for more than 3 seconds, previous restarts the song
    if (playerState.currentTime > 3) {
        playerActions.seek(0);
        return;
    }
    
    let prevIndex = playerState.queueIndex - 1;
    if (prevIndex < 0) {
        if (playerState.playMode === 'loop') {
            prevIndex = playerState.queue.length - 1;
        } else {
            prevIndex = 0;
        }
    }

    const prevTrack = playerState.queue[prevIndex];
    if (prevTrack) {
        playerState.queueIndex = prevIndex;
        playerActions.playTrack(prevTrack);
    }
}

window.PlayerStore = {
    state: playerState,
    actions: playerActions,
    playNext,
    playPrevious
};
})();
