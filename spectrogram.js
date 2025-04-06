"use strict";

// --- Configuration ---
const FFT_SIZE = 1024; // Needs to be power of 2 for the simple FFT used
const HOP_SIZE = Math.floor(FFT_SIZE / 4); // Overlap: FFT_SIZE - HOP_SIZE
const NUM_FREQ_BINS = FFT_SIZE / 2; // We only use the first half of the FFT output

// --- HTML Elements ---
const fileInput1 = document.getElementById('audioFile1');
const fileInput2 = document.getElementById('audioFile2');
const canvas1 = document.getElementById('spectrogramCanvas1');
const canvas2 = document.getElementById('spectrogramCanvas2');
const diffCanvas = document.getElementById('diffSpectrogramCanvas');
const overlayCanvas = document.getElementById('playbackOverlay');
const ctx1 = canvas1.getContext('2d');
const ctx2 = canvas2.getContext('2d');
const diffCtx = diffCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const statusDiv = document.getElementById('status');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const playButton = document.getElementById('playButton');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const tab1Button = document.getElementById('tab1');
const tab2Button = document.getElementById('tab2');

// --- Web Audio API ---
let audioContext;

// --- State Storage ---
let audioData = {
    file1: null,
    file2: null
};

// --- Playback State ---
let audioSources = {
    source1: null,
    source2: null
};
let audioBuffers = {
    buffer1: null,
    buffer2: null
};
let audioNodes = {
    gain1: null,
    gain2: null,
    masterGain: null
};
let playbackState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    selectedSource: 1, // 1 or 2 to indicate which file is actively playing
    playbackStartTime: 0,
    animationFrameId: null,
    activeTab: 'file1-tab', // Track the active tab
    loopMode: false,
    loopStart: 0,
    loopEnd: 0,
    dragMode: false,
    dragStart: null
};
let spectrogramInfo = {
    timeSteps: 0,
    canvasWidth: 0,
    timePerPixel: 0
};

// --- Event Listeners ---
fileInput1.addEventListener('change', (event) => handleFileSelect(event, 1), false);
fileInput2.addEventListener('change', (event) => handleFileSelect(event, 2), false);
playButton.addEventListener('click', togglePlayback);

// Add keyboard shortcuts
document.addEventListener('keydown', handleKeydown);

// Mouse events for canvas interaction
canvas1.addEventListener('mousedown', (event) => handleMouseDown(event, canvas1));
canvas2.addEventListener('mousedown', (event) => handleMouseDown(event, canvas2));
diffCanvas.addEventListener('mousedown', (event) => handleMouseDown(event, diffCanvas));

// We'll handle movement and up events at the document level to capture all mouse movements
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);

// Set up tab switching
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        switchTab(tabId);
        
        // Switch audio source when switching tabs
        if (tabId === 'file1-tab') {
            switchAudioSource(1);
        } else if (tabId === 'file2-tab') {
            switchAudioSource(2);
        }
        // If diff tab, we keep playing the current source
    });
});

// Position the overlay when the window resizes
window.addEventListener('resize', positionOverlay);

// --- Functions ---

// Position overlay over the active canvas
function positionOverlay() {
    // Get the active tab content
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    
    // Get the spectrogram canvas in the active tab
    const activeCanvas = activeTab.querySelector('canvas.spectrogram');
    if (!activeCanvas) return;
    
    // Get positions
    const rect = activeCanvas.getBoundingClientRect();
    const tabContainerRect = document.querySelector('.tab-container').getBoundingClientRect();
    
    // Position the overlay precisely over the active canvas
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = `${rect.top - tabContainerRect.top}px`;
    overlayCanvas.style.left = `${rect.left - tabContainerRect.left}px`;
    overlayCanvas.style.width = `${rect.width}px`;
    overlayCanvas.style.height = `${rect.height}px`;
    
    // Make sure overlay dimensions match the canvas
    overlayCanvas.width = activeCanvas.width;
    overlayCanvas.height = activeCanvas.height;
    
    // Redraw the playhead on the repositioned overlay
    drawPlayhead();
}

// Handle keyboard shortcuts
function handleKeydown(event) {
    // Space = toggle play/pause
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scrolling
        togglePlayback();
    }
    // 1 = switch to file 1
    else if (event.key === '1') {
        switchTab('file1-tab');
        switchAudioSource(1);
    }
    // 2 = switch to file 2
    else if (event.key === '2') {
        switchTab('file2-tab');
        switchAudioSource(2);
    }
}

// Handle mouse down on canvas = start of click or drag
function handleMouseDown(event, canvas) {
    if (!audioBuffers.buffer1) return;
    
    // Calculate the click position relative to the canvas
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clickPositionRatio = x / rect.width;
    
    // Convert to time
    const clickTime = clickPositionRatio * playbackState.duration;
    
    // Set start point
    playbackState.loopStart = clickTime;
    
    // Initialize drag mode
    playbackState.dragMode = true;
    playbackState.dragStart = x;
    
    // If we were in loop mode, temporarily disable it until drag is complete
    if (playbackState.loopMode) {
        playbackState.loopMode = false;
    }
    
    // Set the current time to the click position
    seekToTime(clickTime);
    
    // Redraw to show the selection start
    drawPlayhead();
}

// Handle mouse move = potential dragging
function handleMouseMove(event) {
    if (!playbackState.dragMode) return;
    
    // Find the active canvas
    let activeCanvas;
    if (playbackState.activeTab === 'file1-tab') {
        activeCanvas = canvas1;
    } else if (playbackState.activeTab === 'file2-tab') {
        activeCanvas = canvas2;
    } else {
        activeCanvas = diffCanvas;
    }
    
    const rect = activeCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    
    // Ensure x is within canvas bounds
    const boundedX = Math.max(0, Math.min(rect.width, x));
    
    // Convert to time
    const dragPositionRatio = boundedX / rect.width;
    const dragTime = dragPositionRatio * playbackState.duration;
    
    // Set end point based on drag direction
    if (dragTime > playbackState.loopStart) {
        playbackState.loopEnd = dragTime;
    } else {
        // If dragging backwards, swap start/end
        playbackState.loopEnd = playbackState.loopStart;
        playbackState.loopStart = dragTime;
    }
    
    // Redraw to show selection
    drawPlayhead();
}

// Handle mouse up = end of click or drag
function handleMouseUp(event) {
    if (!playbackState.dragMode) return;
    
    // If we dragged a significant distance, enable loop mode
    const dragDistance = Math.abs(playbackState.loopEnd - playbackState.loopStart);
    if (dragDistance > 0.2) { // At least 0.2 seconds of selection to trigger loop
        playbackState.loopMode = true;
        
        // If we're playing, restart from loop start
        if (playbackState.isPlaying) {
            stopPlayback();
            playbackState.currentTime = playbackState.loopStart;
            startPlayback();
        } else {
            // Just set the current time to loop start if not playing
            playbackState.currentTime = playbackState.loopStart;
            updateTimeDisplay(playbackState.currentTime, playbackState.duration);
            drawPlayhead();
        }
    } else {
        // Single click (or very small drag) = just set start position, no looping
        playbackState.loopMode = false;
        playbackState.currentTime = playbackState.loopStart;
        updateTimeDisplay(playbackState.currentTime, playbackState.duration);
    }
    
    // End drag mode
    playbackState.dragMode = false;
}

// Function to switch between tabs
function switchTab(tabId) {
    // Update active button
    tabButtons.forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Update active content
    tabContents.forEach(content => {
        if (content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Update active tab in state
    playbackState.activeTab = tabId;
    
    // Reposition overlay
    positionOverlay();
}

function handleFileSelect(event, fileNumber) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setupAudioNodes();
    }
    
    const file = event.target.files[0];
    if (!file) return;

    statusDiv.textContent = `Loading ${file.name}...`;
    const reader = new FileReader();

    reader.onload = function(e) {
        statusDiv.textContent = `Decoding audio data for file ${fileNumber}...`;
        audioContext.decodeAudioData(e.target.result)
            .then(audioBuffer => {
                statusDiv.textContent = `Processing spectrogram for file ${fileNumber}...`;
                // Store the audio buffer in our state
                audioData[`file${fileNumber}`] = audioBuffer;
                audioBuffers[`buffer${fileNumber}`] = audioBuffer;
                
                // Update duration display if this is the first file
                if (fileNumber === 1 || !playbackState.duration) {
                    playbackState.duration = audioBuffer.duration;
                    updateTimeDisplay(0, audioBuffer.duration);
                }
                
                // Use setTimeout to allow UI update before blocking calculation
                setTimeout(() => {
                    // Calculate the spectrogram for this file
                    const spectrogramData = calculateSpectrogram(audioBuffer);
                    
                    // Store time information for click-to-seek
                    spectrogramInfo.timeSteps = spectrogramData.data.length;
                    spectrogramInfo.canvasWidth = canvas1.width;
                    spectrogramInfo.timePerPixel = audioBuffer.duration / spectrogramInfo.canvasWidth;
                    
                    // Draw the spectrogram on the appropriate canvas
                    const canvas = fileNumber === 1 ? canvas1 : canvas2;
                    const ctx = fileNumber === 1 ? ctx1 : ctx2;
                    drawSpectrogram(spectrogramData, ctx, canvas);
                    
                    // If we have both files, create the diff spectrogram
                    if (audioData.file1 && audioData.file2) {
                        createDiffSpectrogram();
                        switchTab('diff-tab');
                    } else {
                        // Auto-switch to the tab of the file just processed
                        switchTab(fileNumber === 1 ? 'file1-tab' : 'file2-tab');
                    }
                    
                    statusDiv.textContent = `Spectrogram drawn for file ${fileNumber}. ${audioData.file1 && audioData.file2 ? 'Difference calculated. Try switching tabs to compare.' : 'Waiting for both files to be loaded.'}`;
                    
                    // Draw playhead if needed
                    if (playbackState.isPlaying) {
                        drawPlayhead();
                    } else {
                        drawPlayhead(); // Also draw when not playing to show selection
                    }
                }, 0);
            })
            .catch(error => {
                statusDiv.textContent = `Error decoding audio file ${fileNumber}: ${error.message}`;
                console.error(error);
            });
    };

    reader.onerror = function(e) {
        statusDiv.textContent = `Error reading file ${fileNumber}: ${e.target.error}`;
        console.error("FileReader error:", e.target.error);
    };

    reader.readAsArrayBuffer(file);
}

function setupAudioNodes() {
    // Create gain nodes for mixing
    audioNodes.gain1 = audioContext.createGain();
    audioNodes.gain2 = audioContext.createGain();
    audioNodes.masterGain = audioContext.createGain();
    
    // Connect gain nodes to master
    audioNodes.gain1.connect(audioNodes.masterGain);
    audioNodes.gain2.connect(audioNodes.masterGain);
    
    // Connect master to output
    audioNodes.masterGain.connect(audioContext.destination);
    
    // Set initial gains - make the contrast more dramatic to ensure we can hear the difference
    audioNodes.gain1.gain.value = 1.0;
    audioNodes.gain2.gain.value = 0.0; // Start with only file 1 audible
    audioNodes.masterGain.gain.value = 1.0;
}

function switchAudioSource(sourceNum) {
    if (!audioBuffers.buffer1 || (sourceNum === 2 && !audioBuffers.buffer2)) return;
    
    // Update the selected source
    playbackState.selectedSource = sourceNum;
    
    // Update visually which source is playing
    updatePlayingIndicator();
    
    // If currently playing, crossfade between sources
    if (playbackState.isPlaying) {
        // Make the crossfade more dramatic with complete silencing of the inactive source
        const fadeTime = 0.05;
        const currentTime = audioContext.currentTime;
        
        if (sourceNum === 1) {
            // Fade in source 1, fade out source 2
            audioNodes.gain1.gain.cancelScheduledValues(currentTime);
            audioNodes.gain2.gain.cancelScheduledValues(currentTime);
            audioNodes.gain1.gain.linearRampToValueAtTime(1.0, currentTime + fadeTime);
            audioNodes.gain2.gain.linearRampToValueAtTime(0.0, currentTime + fadeTime);
        } else {
            // Fade in source 2, fade out source 1
            audioNodes.gain1.gain.cancelScheduledValues(currentTime);
            audioNodes.gain2.gain.cancelScheduledValues(currentTime);
            audioNodes.gain1.gain.linearRampToValueAtTime(0.0, currentTime + fadeTime);
            audioNodes.gain2.gain.linearRampToValueAtTime(1.0, currentTime + fadeTime);
        }
    } else {
        // Just set the gains directly if not playing
        if (sourceNum === 1) {
            audioNodes.gain1.gain.value = 1.0;
            audioNodes.gain2.gain.value = 0.0;
        } else {
            audioNodes.gain1.gain.value = 0.0;
            audioNodes.gain2.gain.value = 1.0;
        }
    }
}

function updatePlayingIndicator() {
    // Remove existing indicators
    const existingIndicators = document.querySelectorAll('.playing-indicator');
    existingIndicators.forEach(indicator => indicator.remove());
    
    // Add indicator to active source button if playing
    if (playbackState.isPlaying) {
        const indicator = document.createElement('span');
        indicator.className = 'playing-indicator';
        if (playbackState.selectedSource === 1) {
            tab1Button.appendChild(indicator);
        } else {
            tab2Button.appendChild(indicator);
        }
    }
}

function togglePlayback() {
    if (playbackState.isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    if (!audioBuffers.buffer1 && !audioBuffers.buffer2) {
        statusDiv.textContent = "No audio files loaded.";
        return;
    }
    
    // Stop any existing sources
    stopAllAudioSources();
    
    // Create new sources
    createAudioSources();
    
    // Calculate start offset based on current position
    const offset = playbackState.currentTime;
    
    // If in loop mode, set up the loop
    if (playbackState.loopMode) {
        setupLoop();
    }
    
    // Update playback state
    playbackState.isPlaying = true;
    playbackState.playbackStartTime = audioContext.currentTime - offset;
    playButton.innerHTML = '❚❚'; // Change to pause icon
    
    // Start animation for playhead
    startPlayheadAnimation();
    
    // Add playing indicator
    updatePlayingIndicator();
    
    // Log for debugging
    console.log(`Starting playback at ${offset}s, loop mode: ${playbackState.loopMode}`);
}

function stopAllAudioSources() {
    if (audioSources.source1) {
        try {
            audioSources.source1.stop();
        } catch (e) {
            // Ignore - source might already be stopped
        }
        audioSources.source1 = null;
    }
    if (audioSources.source2) {
        try {
            audioSources.source2.stop();
        } catch (e) {
            // Ignore - source might already be stopped
        }
        audioSources.source2 = null;
    }
}

function createAudioSources() {
    // Create source 1
    audioSources.source1 = audioContext.createBufferSource();
    audioSources.source1.buffer = audioBuffers.buffer1;
    audioSources.source1.connect(audioNodes.gain1);
    
    // Create source 2 if available
    if (audioBuffers.buffer2) {
        audioSources.source2 = audioContext.createBufferSource();
        audioSources.source2.buffer = audioBuffers.buffer2;
        audioSources.source2.connect(audioNodes.gain2);
    }
    
    // Set gains based on selected source
    updateSourceGains();
    
    // Start sources at current position
    const offset = playbackState.currentTime;
    audioSources.source1.start(0, offset);
    if (audioSources.source2) {
        audioSources.source2.start(0, offset);
    }
}

function updateSourceGains() {
    if (playbackState.selectedSource === 1) {
        audioNodes.gain1.gain.value = 1.0;
        audioNodes.gain2.gain.value = 0.0;
    } else {
        audioNodes.gain1.gain.value = 0.0;
        audioNodes.gain2.gain.value = 1.0;
    }
}

function setupLoop() {
    // Calculate loop duration
    const loopDuration = playbackState.loopEnd - playbackState.loopStart;
    
    // Check if this is a full audio loop - use native looping in that case
    if (playbackState.loopStart === 0 && Math.abs(playbackState.loopEnd - playbackState.duration) < 0.01) {
        console.log("Using native loop for full file");
        audioSources.source1.loop = true;
        if (audioSources.source2) {
            audioSources.source2.loop = true;
        }
        return;
    }
    
    // For custom regions, we need to handle looping manually
    // Calculate initial offset from loop start
    const currentPosition = playbackState.currentTime;
    const positionInLoop = 
        currentPosition < playbackState.loopStart ? 
        0 : (currentPosition - playbackState.loopStart) % loopDuration;
    
    // Calculate when we should end this loop iteration
    const timeToLoopEnd = loopDuration - positionInLoop;
    const loopEndTime = audioContext.currentTime + timeToLoopEnd;
    
    console.log(`Setting up loop: start=${playbackState.loopStart}s, end=${playbackState.loopEnd}s, duration=${loopDuration}s`);
    console.log(`Current position in loop: ${positionInLoop}s, time to loop end: ${timeToLoopEnd}s`);
    
    // Schedule the end of this loop iteration
    audioSources.source1.onended = null; // Clear any previous handlers
    if (audioSources.source2) {
        audioSources.source2.onended = null;
    }
    
    // Use Web Audio API's precise timing to stop at loop end
    audioSources.source1.stop(loopEndTime);
    if (audioSources.source2) {
        audioSources.source2.stop(loopEndTime);
    }
    
    // Schedule the next loop iteration to start exactly when this one ends
    const loopRestartScheduler = audioContext.createBufferSource();
    loopRestartScheduler.onended = () => {
        if (playbackState.isPlaying && playbackState.loopMode) {
            console.log(`Loop iteration complete, restarting at ${playbackState.loopStart}s`);
            
            // Update current time to loop start
            playbackState.currentTime = playbackState.loopStart;
            playbackState.playbackStartTime = audioContext.currentTime - playbackState.loopStart;
            
            // Restart sources
            stopAllAudioSources();
            createAudioSources();
            
            // Set up the next loop iteration
            setupLoop();
        }
    };
    loopRestartScheduler.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    loopRestartScheduler.connect(audioContext.destination);
    loopRestartScheduler.start(loopEndTime);
}

function stopPlayback() {
    if (!playbackState.isPlaying) return;
    
    console.log("Stopping playback");
    
    // Stop all sources
    stopAllAudioSources();
    
    // Update current position
    playbackState.currentTime = getCurrentPlaybackTime();
    
    // Update playback state
    playbackState.isPlaying = false;
    playButton.innerHTML = '▶'; // Change to play icon
    
    // Stop animation
    if (playbackState.animationFrameId) {
        cancelAnimationFrame(playbackState.animationFrameId);
        playbackState.animationFrameId = null;
    }
    
    // Remove playing indicator
    updatePlayingIndicator();
    
    // Redraw playhead to show current position
    drawPlayhead();
}

function seekToTime(time) {
    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, playbackState.duration));
    
    // Update time display
    playbackState.currentTime = clampedTime;
    updateTimeDisplay(clampedTime, playbackState.duration);
    
    // If currently playing, restart from new position
    if (playbackState.isPlaying) {
        stopPlayback();
        startPlayback();
    } else {
        // Just draw the playhead at the new position
        drawPlayhead();
    }
}

function getCurrentPlaybackTime() {
    if (!playbackState.isPlaying) {
        return playbackState.currentTime;
    }
    
    const elapsed = audioContext.currentTime - playbackState.playbackStartTime;
    
    // If in loop mode, calculate position within the loop
    if (playbackState.loopMode) {
        const loopDuration = playbackState.loopEnd - playbackState.loopStart;
        if (loopDuration > 0) {
            const positionInLoop = elapsed % loopDuration;
            const actualPosition = playbackState.loopStart + positionInLoop;
            
            // If we're past the loop end, we should be looping
            if (actualPosition >= playbackState.loopEnd) {
                return playbackState.loopStart + (actualPosition - playbackState.loopEnd);
            }
            
            return Math.min(actualPosition, playbackState.loopEnd);
        }
    }
    
    // Normal playback - just return elapsed time capped at duration
    return Math.min(playbackState.currentTime + elapsed, playbackState.duration);
}

function updateTimeDisplay(current, total) {
    currentTimeDisplay.textContent = formatTime(current);
    totalTimeDisplay.textContent = formatTime(total);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function startPlayheadAnimation() {
    // Cancel any existing animation
    if (playbackState.animationFrameId) {
        cancelAnimationFrame(playbackState.animationFrameId);
    }
    
    function animate() {
        if (!playbackState.isPlaying) return;
        
        // Get current playback time
        const currentTime = getCurrentPlaybackTime();
        
        // Update time display
        updateTimeDisplay(currentTime, playbackState.duration);
        
        // Draw playhead
        drawPlayhead();
        
        // Check if we've reached the end (or loop end in loop mode)
        if (playbackState.loopMode) {
            // In loop mode, we'll let the audio source onended handle looping
        } else if (currentTime >= playbackState.duration) {
            // In normal mode, stop at the end
            stopPlayback();
            return;
        }
        
        // Continue animation
        playbackState.animationFrameId = requestAnimationFrame(animate);
    }
    
    // Start animation loop
    playbackState.animationFrameId = requestAnimationFrame(animate);
}

function calculateSpectrogram(audioBuffer) {
    const pcmData = audioBuffer.getChannelData(0); // Use first channel
    const numSamples = pcmData.length;
    const numTimeSteps = Math.floor((numSamples - FFT_SIZE) / HOP_SIZE) + 1;

    const spectrogram = []; // Array of arrays (time steps x frequency bins)
    const window = createHanningWindow(FFT_SIZE);

    let minDb = Infinity;
    let maxDb = -Infinity;

    for (let t = 0; t < numTimeSteps; t++) {
        const startSample = t * HOP_SIZE;
        const frame = new Float32Array(FFT_SIZE);
        const frameImag = new Float32Array(FFT_SIZE); // Need imaginary part for FFT

        // Apply window function to the frame
        for (let i = 0; i < FFT_SIZE; i++) {
            if (startSample + i < numSamples) {
                frame[i] = pcmData[startSample + i] * window[i];
            } else {
                frame[i] = 0; // Zero padding if near the end
            }
            frameImag[i] = 0;
        }

        // Perform FFT - using the function from fft.js
        transform(frame, frameImag); // In-place transform

        const magnitudes = new Float32Array(NUM_FREQ_BINS);
        const dbValues = new Float32Array(NUM_FREQ_BINS);

        for (let k = 0; k < NUM_FREQ_BINS; k++) {
            const real = frame[k];
            const imag = frameImag[k];
            const magnitude = Math.sqrt(real * real + imag * imag);
            magnitudes[k] = magnitude;

            // Convert magnitude to dB
            // Add a small epsilon to avoid log10(0) = -Infinity
            const db = 20 * Math.log10(magnitude + 1e-10);
            dbValues[k] = db;

            // Keep track of min/max dB for normalization later
            if (db > -Infinity) { // Avoid -Infinity from log10(0)
               if (db < minDb) minDb = db;
               if (db > maxDb) maxDb = db;
            }
        }
        spectrogram.push(dbValues);
    }

     // Use a sensible floor if minDb is still too low or -Infinity
     if (minDb < -100) minDb = -100;
     if (maxDb === -Infinity) maxDb = 0; // Handle case of pure silence


    return { data: spectrogram, minDb, maxDb };
}

function drawSpectrogram({ data, minDb, maxDb }, ctx, canvas) {
    if (!data || data.length === 0) {
        statusDiv.textContent = "No spectrogram data to draw.";
        return;
    }

    const numTimeSteps = data.length;
    const numFreqBins = data[0].length; // Should be NUM_FREQ_BINS

    if (numFreqBins !== NUM_FREQ_BINS) {
        console.error("Frequency bin count mismatch!");
        statusDiv.textContent = "Error: Frequency bin count mismatch.";
        return;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = 'rgba(17, 17, 17, 1)'; // Match the canvas background color
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const timeStepWidth = canvasWidth / numTimeSteps;
    const freqBinHeight = canvasHeight / numFreqBins;
    let dbRange = maxDb - minDb;

    // Use a static dB range for more consistent visualization across files?
    // minDb = -90;
    // maxDb = -10;
    // dbRange = maxDb - minDb;

    console.log(`Drawing Spectrogram: ${numTimeSteps} steps, ${numFreqBins} bins. dB range [${minDb.toFixed(2)}, ${maxDb.toFixed(2)}]`);

    for (let t = 0; t < numTimeSteps; t++) {
        for (let f = 0; f < numFreqBins; f++) {
            const dbValue = data[t][f];

            // Normalize dB value to 0-1 range
            let normalizedValue = (dbValue - minDb) / dbRange;
            normalizedValue = Math.max(0, Math.min(1, normalizedValue)); // Clamp to [0, 1]

            // Map normalized value to color using Inferno colormap
            const color = infernoColorMap(normalizedValue);
            ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

            // Draw rectangle for this spectrogram cell
            // X coordinate = time step
            // Y coordinate = frequency bin (low frequency at bottom, high at top)
            const x = t * timeStepWidth;
            const y = canvasHeight - (f + 1) * freqBinHeight; // Invert Y axis

            ctx.fillRect(x, y, timeStepWidth + 1, freqBinHeight + 1); // +1 to avoid gaps
        }
    }
}

function createDiffSpectrogram() {
    statusDiv.textContent = "Calculating difference spectrogram...";
    
    setTimeout(() => {
        // Calculate both spectrograms
        const spectrogramData1 = calculateSpectrogram(audioData.file1);
        const spectrogramData2 = calculateSpectrogram(audioData.file2);
        
        // Calculate the difference and draw it
        const diffData = calculateDiff(spectrogramData1, spectrogramData2);
        drawDiffSpectrogram(diffData);
        
        // Switch to the diff tab to show the result
        switchTab('diff-tab');
        
        statusDiv.textContent = "All spectrograms drawn. Use the tabs to compare the files.";
    }, 0);
}

function calculateDiff(spec1, spec2) {
    // Get the shorter length of time steps from both spectrograms
    const timeSteps1 = spec1.data.length;
    const timeSteps2 = spec2.data.length;
    const numTimeSteps = Math.min(timeSteps1, timeSteps2);
    
    // Create the difference spectrogram
    const diffSpectrogram = [];
    let maxDiff = 0;
    
    for (let t = 0; t < numTimeSteps; t++) {
        const diffFrame = new Float32Array(NUM_FREQ_BINS);
        
        for (let f = 0; f < NUM_FREQ_BINS; f++) {
            // Calculate difference in dB values
            const diff = spec1.data[t][f] - spec2.data[t][f];
            diffFrame[f] = diff;
            
            // Track maximum absolute difference for normalization
            const absDiff = Math.abs(diff);
            if (absDiff > maxDiff) {
                maxDiff = absDiff;
            }
        }
        
        diffSpectrogram.push(diffFrame);
    }
    
    return { data: diffSpectrogram, maxDiff };
}

function drawDiffSpectrogram({ data, maxDiff }) {
    if (!data || data.length === 0) {
        statusDiv.textContent = "No difference data to draw.";
        return;
    }
    
    const numTimeSteps = data.length;
    const numFreqBins = data[0].length;
    
    const canvasWidth = diffCanvas.width;
    const canvasHeight = diffCanvas.height;
    
    // Clear canvas
    diffCtx.fillStyle = 'black';
    diffCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    const timeStepWidth = canvasWidth / numTimeSteps;
    const freqBinHeight = canvasHeight / numFreqBins;
    
    console.log(`Drawing Diff Spectrogram: ${numTimeSteps} steps, ${numFreqBins} bins. Max diff: ${maxDiff.toFixed(2)}`);
    
    for (let t = 0; t < numTimeSteps; t++) {
        for (let f = 0; f < numFreqBins; f++) {
            const diffValue = data[t][f];
            
            // Normalize difference to [-1, 1] range
            let normalizedDiff = diffValue / maxDiff;
            normalizedDiff = Math.max(-1, Math.min(1, normalizedDiff)); // Clamp to [-1, 1]
            
            // Use diverging colormap (blue-black-red)
            // Black in the middle (no difference)
            const color = divergingColorMap(normalizedDiff);
            diffCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            
            // Draw rectangle
            const x = t * timeStepWidth;
            const y = canvasHeight - (f + 1) * freqBinHeight; // Invert Y axis
            
            diffCtx.fillRect(x, y, timeStepWidth + 1, freqBinHeight + 1);
        }
    }
}

// --- Utility Functions ---

function createHanningWindow(length) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    return window;
}

// Inferno Colormap (simplified version from matplotlib)
// Input: value between 0 and 1
// Output: [r, g, b] array (0-255)
function infernoColorMap(value) {
    const colors = [
        [0, 0, 4], [30, 11, 70], [82, 11, 106], [130, 29, 102],
        [178, 50, 86], [221, 75, 67], [249, 111, 59], [253, 164, 49],
        [237, 221, 93], [252, 255, 164]
    ];
    const numSegments = colors.length - 1;
    const scaledValue = value * numSegments;
    const segmentIndex = Math.min(Math.floor(scaledValue), numSegments - 1);
    const segmentFraction = scaledValue - segmentIndex;

    const c1 = colors[segmentIndex];
    const c2 = colors[segmentIndex + 1];

    const r = Math.round(c1[0] + (c2[0] - c1[0]) * segmentFraction);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * segmentFraction);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * segmentFraction);

    return [r, g, b];
}

// Diverging Colormap (blue-black-red)
// Input: value between -1 and 1
// Output: [r, g, b] array (0-255)
function divergingColorMap(value) {
    // No difference (value = 0) should be black
    if (Math.abs(value) < 0.05) {
        return [0, 0, 0];
    }
    
    let r, g, b;
    
    if (value < 0) {
        // Negative differences: blue to black
        const intensity = Math.abs(value);
        r = 0;
        g = Math.round(intensity * 100);
        b = Math.round(70 + intensity * 185); // 70-255
    } else {
        // Positive differences: black to red
        r = Math.round(70 + value * 185); // 70-255
        g = Math.round(value * 100);
        b = 0;
    }
    
    return [r, g, b];
}