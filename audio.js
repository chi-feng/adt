// audio.js - Handles all audio processing, playback and looping functionality

// --- Remove duplicate/unused global variables ---
/*
let audioContext; 
let audioSources = { source1: null, source2: null };
let audioBuffers = { buffer1: null, buffer2: null };
let audioNodes = { gain1: null, gain2: null, masterGain: null };
*/

// --- Remove unused playbackState object ---
/*
const playbackState = {
    isPlaying: false,
    // ... other properties ...
    sampleRate: 44100 
};
*/

// --- Main Audio State Object (keep this one) ---
const audioState = {
    audioContext: null,
    buffers: { file1: null, file2: null },
    sources: { file1: null, file2: null }, // Store active sources here
    nodes: { // Store audio nodes here
        gain1: null,
        gain2: null,
        masterGain: null
    },
    filenames: { file1: "File 1", file2: "File 2" },
    isPlaying: false,
    startTime: 0, // AudioContext time when playback started
    startOffset: 0, // Offset within the buffer to start playback from
    selectedSource: 1, // 1 or 2
    loopMode: false,
    loopStart: 0,
    loopEnd: 0,
    duration: 0, // Duration of the *longer* audio file
    activeTab: 'file1-tab' // Track which spectrogram tab is active
};

// --- Public API ---

// Initialize the audio context and nodes
function initAudio() {
    // Use audioState.audioContext consistently
    if (!audioState.audioContext) {
        try {
            audioState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext created. Sample Rate:", audioState.audioContext.sampleRate);
            setupAudioNodes(); // Call setup *after* context is assigned to audioState
        } catch (e) {
            console.error("Failed to create AudioContext:", e);
            // Maybe show an error to the user via UIController
            if (window.UIController) window.UIController.showStatus("Error: Web Audio API not supported or context creation failed.");
        }
    }
}

// Load and decode audio file (keep this version)
async function loadFile(arrayBuffer, fileNumber, filename) { 
    // Ensure AudioContext is initialized
    if (!audioState.audioContext) {
        initAudio(); 
        await new Promise(resolve => setTimeout(resolve, 50)); 
        if (!audioState.audioContext) { 
             throw new Error("AudioContext could not be initialized.");
        }
    }
    
    try {
        const audioBuffer = await audioState.audioContext.decodeAudioData(arrayBuffer);
        audioState.buffers[`file${fileNumber}`] = audioBuffer;
        audioState.filenames[`file${fileNumber}`] = filename || `File ${fileNumber}`; 
        console.log(`Audio loaded for file ${fileNumber}: ${audioState.filenames[`file${fileNumber}`]}`);
        updateDuration();
        if (audioState.duration > 0 && (!audioState.loopEnd || audioState.loopEnd > audioState.duration)) {
             setLoopRegion(0, audioState.duration, false); 
        }
        return audioBuffer;
    } catch (error) {
        console.error(`Error decoding audio data for file ${fileNumber}:`, error);
        audioState.buffers[`file${fileNumber}`] = null;
        audioState.filenames[`file${fileNumber}`] = `File ${fileNumber}`;
        updateDuration(); 
        throw new Error(`Failed to decode audio file ${fileNumber}.`);
    }
}

// Start audio playback
function startPlayback() {
    // Check using audioState
    if (!audioState.buffers.file1 && !audioState.buffers.file2) { 
        console.warn("No audio buffers loaded to play");
        return false;
    }
    if (!audioState.audioContext) {
         console.warn("AudioContext not ready for playback");
         return false;
    }
    
    stopAllAudioSources(); // Uses audioState.sources internally now
    
    // Create new sources using audioState
    createAudioSources(); // Uses audioState.sources internally now
    
    // Update state
    audioState.isPlaying = true;
    // Store context start time and the desired buffer offset
    audioState.startTime = audioState.audioContext.currentTime; 
    // audioState.startOffset is set by seek or loop logic
    
    console.log(`Starting playback at offset ${audioState.startOffset}s, loop mode: ${audioState.loopMode}`);
    
    // The actual source.start() calls happen within createAudioSources
    return true;
}

// Stop audio playback
function stopPlayback() {
    if (!audioState.isPlaying) return;
    
    console.log("Stopping playback");
    
    // Calculate current position before stopping
    // Use the consistent getCurrentPlaybackTime which reads audioState
    let currentPosition = getCurrentPlaybackTime(true); // Pass true to get position without side effects
    
    stopAllAudioSources();
    
    // Update current position offset
    audioState.startOffset = currentPosition; // Store where we stopped
    
    // Update playback state
    audioState.isPlaying = false;
    
    console.log(`Playback stopped at ${audioState.startOffset}s`);
}

// Set current time (seek)
function seekToTime(time) {
    if (!audioState.audioContext) return 0; // Cannot seek without context
    // Clamp time to valid range using audioState.duration
    const clampedTime = Math.max(0, Math.min(time, audioState.duration));
    
    // Update the offset for the next playback
    audioState.startOffset = clampedTime;
    
    // If currently playing, restart from new position
    if (audioState.isPlaying) {
        stopAllAudioSources();
        createAudioSources(); // Recreates sources with new offset
        audioState.startTime = audioState.audioContext.currentTime; // Reset context start time
    }
    
    console.log(`Seeked to ${audioState.startOffset}s`);
    return audioState.startOffset;
}

// Switch between audio sources (1 or 2)
function switchAudioSource(sourceNum) {
    // Check buffers using audioState
    if (!audioState.buffers.file1 || (sourceNum === 2 && !audioState.buffers.file2)) return;
    if (!audioState.nodes.gain1 || !audioState.nodes.gain2) return; // Check nodes exist
    if (!audioState.audioContext) return; // Check context exists
    
    audioState.selectedSource = sourceNum;
    
    // If currently playing, crossfade between sources
    if (audioState.isPlaying) {
        const fadeTime = 0.05;
        const currentTime = audioState.audioContext.currentTime;
        const gain1Node = audioState.nodes.gain1;
        const gain2Node = audioState.nodes.gain2;
        
        if (sourceNum === 1) {
            gain1Node.gain.cancelScheduledValues(currentTime);
            gain2Node.gain.cancelScheduledValues(currentTime);
            gain1Node.gain.linearRampToValueAtTime(1.0, currentTime + fadeTime);
            gain2Node.gain.linearRampToValueAtTime(0.0, currentTime + fadeTime);
        } else {
            gain1Node.gain.cancelScheduledValues(currentTime);
            gain2Node.gain.cancelScheduledValues(currentTime);
            gain1Node.gain.linearRampToValueAtTime(0.0, currentTime + fadeTime);
            gain2Node.gain.linearRampToValueAtTime(1.0, currentTime + fadeTime);
        }
    } else {
        // Just set the gains directly if not playing
        updateSourceGains(); // Uses audioState internally now
    }
}

// Set loop mode and loop region
function setLoopRegion(start, end, enableLoop = true) {
    if (!audioState.audioContext) return; // Need context for duration
    const validStart = Math.max(0, start);
    const validEnd = Math.min(end, audioState.duration); // Use audioState.duration
    
    const minLoopDuration = 0.05; // Shorter minimum loop? 
    const isValidLoop = (validEnd - validStart) >= minLoopDuration;
    
    audioState.loopStart = validStart;
    audioState.loopEnd = validEnd;
    audioState.loopMode = enableLoop && isValidLoop;
    
    console.log(`Loop region set: ${audioState.loopStart.toFixed(2)}s to ${audioState.loopEnd.toFixed(2)}s, enabled: ${audioState.loopMode}`);
    
    // If playing, restart playback applying the new loop
    if (audioState.isPlaying) {
        // Determine if the current playhead (startOffset) needs to be reset to loopStart
        const currentTime = getCurrentPlaybackTime(); // Get current effective time
        let restartOffset = audioState.startOffset; // Keep current offset by default

        if (audioState.loopMode && 
            (currentTime < audioState.loopStart || currentTime >= audioState.loopEnd)) {
            restartOffset = audioState.loopStart; // Jump to loop start if outside
        }
        
        // Restart playback from the determined offset
        audioState.startOffset = restartOffset; // Set the offset for createAudioSources
        stopAllAudioSources();
        createAudioSources();
        audioState.startTime = audioState.audioContext.currentTime; // Reset context start time
    }
}

// Get current playback time
function getCurrentPlaybackTime(queryOnly = false) { // Added queryOnly flag
    if (!audioState.audioContext) return 0;

    if (!audioState.isPlaying) {
        return audioState.startOffset; // Return the stored offset if paused
    }
    
    // Calculate elapsed time since playback context time was captured
    const elapsedSinceStart = audioState.audioContext.currentTime - audioState.startTime;
    
    // Calculate current position based on starting offset and elapsed time
    let currentPosition = audioState.startOffset + elapsedSinceStart;
    
    // Handle looping logic only if not just querying the position
    if (!queryOnly && audioState.loopMode && currentPosition >= audioState.loopEnd) {
        console.log(`Loop point reached at ${currentPosition.toFixed(2)}s, loopEnd: ${audioState.loopEnd.toFixed(2)}s`);
        
        // Calculate how much we overshot the loop end
        const overshoot = currentPosition - audioState.loopEnd;
        // Calculate the new position within the loop (wrapping around)
        const loopDuration = audioState.loopEnd - audioState.loopStart;
        let newOffset = audioState.loopStart + (overshoot % loopDuration);
        
        // Restart playback from the new wrapped offset
        audioState.startOffset = newOffset;
        stopAllAudioSources();
        createAudioSources();
        audioState.startTime = audioState.audioContext.currentTime; // Reset context start time
        
        return newOffset; // Return the wrapped position
    }
    
    // Ensure time doesn't exceed duration if not looping
    if (!audioState.loopMode && currentPosition >= audioState.duration) {
        if (!queryOnly) { // Only stop playback if not just querying
             console.log("Playback reached end (duration)");
             stopPlayback(); // Stop playback
             return audioState.duration; // Return exact duration
        }
         return Math.min(currentPosition, audioState.duration);
    }

    // Return current calculated position (potentially capped at duration)
    return Math.min(currentPosition, audioState.duration);
}

// Format time in MM:SS format
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    // Optional: Add milliseconds display?
    // const milliseconds = Math.floor((seconds - totalSeconds) * 100);
    // return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// --- Internal Helper Functions ---

function setupAudioNodes() {
    if (!audioState.audioContext) {
        console.error("Cannot setup audio nodes without AudioContext");
        return;
    }
    // Use audioState.nodes
    audioState.nodes.gain1 = audioState.audioContext.createGain();
    audioState.nodes.gain2 = audioState.audioContext.createGain();
    audioState.nodes.masterGain = audioState.audioContext.createGain();
    
    audioState.nodes.gain1.connect(audioState.nodes.masterGain);
    audioState.nodes.gain2.connect(audioState.nodes.masterGain);
    audioState.nodes.masterGain.connect(audioState.audioContext.destination);
    
    // Set initial gains using audioState
    updateSourceGains(); 
    audioState.nodes.masterGain.gain.value = 1.0;
    console.log("Audio nodes set up.");
}

function stopAllAudioSources() {
    // Use audioState.sources
    if (audioState.sources.file1) {
        try {
            audioState.sources.file1.onended = null; // Remove onended handler
            audioState.sources.file1.stop();
        } catch (e) { }
        audioState.sources.file1 = null;
    }
    if (audioState.sources.file2) {
        try {
             audioState.sources.file2.onended = null; // Remove onended handler
            audioState.sources.file2.stop();
        } catch (e) { }
        audioState.sources.file2 = null;
    }
}

function createAudioSources() {
    if (!audioState.audioContext) {
        console.error("Cannot create audio sources without AudioContext");
        return;
    }
    // Use audioState consistently
    const offset = audioState.startOffset; 
    const buffer1 = audioState.buffers.file1;
    const buffer2 = audioState.buffers.file2;
    const gain1Node = audioState.nodes.gain1;
    const gain2Node = audioState.nodes.gain2;

    if (!gain1Node || !gain2Node) {
        console.error("Gain nodes not available for creating sources.");
        return;
    }
    
    // Create source 1 if buffer exists
    if (buffer1) {
        audioState.sources.file1 = audioState.audioContext.createBufferSource();
        audioState.sources.file1.buffer = buffer1;
        audioState.sources.file1.connect(gain1Node);
    } else {
        audioState.sources.file1 = null; 
    }
    
    // Create source 2 if buffer exists
    if (buffer2) {
        audioState.sources.file2 = audioState.audioContext.createBufferSource();
        audioState.sources.file2.buffer = buffer2;
        audioState.sources.file2.connect(gain2Node);
    } else {
         audioState.sources.file2 = null; 
    }
    
    updateSourceGains();
    
    // Use the captured context time from startPlayback
    const when = audioState.startTime; 
    
    let source1Started = false;
    if (audioState.sources.file1) {
        // Looping is handled by the getCurrentPlaybackTime logic restarting playback
        audioState.sources.file1.loop = false; // Ensure native loop is off
        
        console.log(`Starting source 1 at context time ${when.toFixed(3)} with offset ${offset.toFixed(3)}s`);
        try {
             audioState.sources.file1.start(when, offset);
             source1Started = true;
        } catch (e) {
             console.error("Error starting source 1:", e, {when, offset});
             audioState.sources.file1 = null; // Clear if failed
        }
         
         // Set up onended handler for *non-looping* end detection
         audioState.sources.file1.onended = () => {
             // Only trigger stop if playback was supposed to be active AND not in loop mode
             if (audioState.isPlaying && !audioState.loopMode && audioState.sources.file1) {
                  // Check if the context's current time matches the expected end time
                  const expectedEndTime = audioState.startTime + (buffer1.duration - audioState.startOffset);
                  // Allow a small tolerance for timing inconsistencies
                  if (Math.abs(audioState.audioContext.currentTime - expectedEndTime) < 0.1) { 
                     console.log("Playback ended naturally (Source 1)");
                     stopPlayback(); 
                  } else {
                     // Source stopped for other reasons (e.g., explicit stopPlayback call)
                     console.log("Source 1 ended, but not naturally at buffer end.");
                  }
             } else if (audioState.sources.file1) {
                 // Source ended while paused or looping, just ensure handler is cleared
                 audioState.sources.file1.onended = null;
             }
         };
    }
    if (audioState.sources.file2) {
        audioState.sources.file2.loop = false; // Ensure native loop is off
        console.log(`Starting source 2 at context time ${when.toFixed(3)} with offset ${offset.toFixed(3)}s`);
        try {
            audioState.sources.file2.start(when, offset);
        } catch(e) {
             console.error("Error starting source 2:", e, {when, offset});
             audioState.sources.file2 = null; // Clear if failed
        }
    }
    
    if (!audioState.sources.file1 && !audioState.sources.file2) {
        console.warn("Neither audio source could be started.");
        audioState.isPlaying = false; 
    }
}

function updateSourceGains() {
    // Use audioState.nodes
    if (!audioState.nodes.gain1 || !audioState.nodes.gain2) return; 
    
    if (audioState.selectedSource === 1) {
        audioState.nodes.gain1.gain.value = 1.0;
        audioState.nodes.gain2.gain.value = 0.0;
    } else {
        audioState.nodes.gain1.gain.value = 0.0;
        audioState.nodes.gain2.gain.value = 1.0;
    }
}

// Update the overall duration based on loaded buffers
function updateDuration() {
    const buffer1 = audioState.buffers.file1;
    const buffer2 = audioState.buffers.file2;
    let newDuration = 0;
    if (buffer1) newDuration = Math.max(newDuration, buffer1.duration);
    if (buffer2) newDuration = Math.max(newDuration, buffer2.duration);
    audioState.duration = newDuration;
    console.log("Updated audio duration:", audioState.duration);
}

// --- New Swap Function ---
function swapFiles() {
    console.log("Swapping audio file data...");
    // Swap buffers
    [audioState.buffers.file1, audioState.buffers.file2] = 
        [audioState.buffers.file2, audioState.buffers.file1];
    
    // Swap filenames
    [audioState.filenames.file1, audioState.filenames.file2] = 
        [audioState.filenames.file2, audioState.filenames.file1];

    // If playing, stop and reset to avoid issues with swapped buffers/sources
    if (audioState.isPlaying) {
        stopPlayback();
        // Reset current time to 0 or loop start?
        audioState.startOffset = 0; // Reset to start
    }

    // Note: We don't swap active sources here, as they are recreated on play.
    // Duration should remain the same (max of the two)
    console.log("Audio data swapped.");
}

// Export the public API
window.AudioEngine = {
    init: initAudio,
    loadFile: loadFile,
    startPlayback,
    stopPlayback,
    seekToTime,
    switchSource: switchAudioSource,
    setLoopRegion,
    getCurrentTime: getCurrentPlaybackTime,
    formatTime,
    swapFiles, 
    state: audioState 
}; 