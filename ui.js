// ui.js - Handles user interface interactions, event handling, and UI state

// --- UI State ---
const uiState = {
    dragMode: false,
    dragStart: null, // Stores the initial mouse X position *relative* to the display canvas
    wasPlayingBeforeDrag: false, // Added to track playback state during drag
    activeTab: 'file1-tab',
    timeDisplayElements: {
        current: null,
        total: null,
        range: null
    },
    tooltip: {
        element: null,
        visible: false
    }
};

// --- DOM Elements ---
let elements = {
    fileInputs: [],
    spectrogramCanvases: [],
    tabButtons: [],
    tabContents: [],
    playButton: null,
    overlayCanvas: null,
    statusDiv: null,
    tooltip: null,
    initialSetupDiv: null, // Added for hiding initial elements
    mainContentDiv: null,   // Added for showing main content
    tabContentContainer: null, // Added for scrollable spectrogram canvases
    swapButton: null
};

// --- Public API ---

// Initialize the UI, set up event listeners
function initUI() {
    // Get all required DOM elements
    findDomElements();
    
    // Set up event listeners
    setupEventListeners();
    
    console.log("UI initialized");
}

// Position overlay over the active canvas within the tab-content-container
function positionOverlay() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab || !elements.tabContentContainer) return;
    const activeCanvas = activeTab.querySelector('canvas.spectrogram');
    if (!activeCanvas) return;

    // Get display dimensions of the active canvas
    const displayWidth = activeCanvas.clientWidth;
    const displayHeight = activeCanvas.clientHeight;

    // Position the overlay absolutely within the tabContentContainer
    // Its top/left should align with the canvas's top/left within the container
    elements.overlayCanvas.style.position = 'absolute';
    elements.overlayCanvas.style.top = `${activeCanvas.offsetTop}px`;
    elements.overlayCanvas.style.left = `${activeCanvas.offsetLeft}px`;
    // Set overlay style size to match the *display* size of the canvas
    elements.overlayCanvas.style.width = `${displayWidth}px`;
    elements.overlayCanvas.style.height = `${displayHeight}px`;

    // Match overlay canvas *drawing buffer* dimensions to the display size
    // This ensures coordinate systems match for drawing playhead/loop region
    if (elements.overlayCanvas.width !== displayWidth ||
        elements.overlayCanvas.height !== displayHeight) {
        elements.overlayCanvas.width = displayWidth;
        elements.overlayCanvas.height = displayHeight;
        needsRedraw = true; // Trigger redraw if buffer size changed
    }
}

// Switch to a specific tab
function switchTab(tabId) {
    if (!tabId) return;

    // Update active button
    elements.tabButtons.forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Update active content
    elements.tabContents.forEach(content => {
        if (content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Update active tab in state
    uiState.activeTab = tabId;
    
    // Update the audio engine state
    window.AudioEngine.state.activeTab = tabId;
    
    // Reposition overlay FIRST to get correct dimensions for drawing
    positionOverlayWithoutUpdate(); 
    
    // Explicitly redraw the spectrogram for the newly active tab
    requestAnimationFrame(() => { // Ensure redraw happens after layout update
        let canvasToDraw = null;
        let dataToDraw = null;
        let drawFunction = null;

        if (tabId === 'file1-tab') {
            canvasToDraw = elements.spectrogramCanvases[0];
            dataToDraw = window.SpectrogramVisualizer.state.spectrograms.file1;
            drawFunction = window.SpectrogramVisualizer.drawSpectrogram;
        } else if (tabId === 'file2-tab') {
            canvasToDraw = elements.spectrogramCanvases[1];
            dataToDraw = window.SpectrogramVisualizer.state.spectrograms.file2;
            drawFunction = window.SpectrogramVisualizer.drawSpectrogram;
        } else if (tabId === 'diff-tab') {
            canvasToDraw = elements.spectrogramCanvases[2];
            dataToDraw = window.SpectrogramVisualizer.state.spectrograms.diff;
            drawFunction = window.SpectrogramVisualizer.drawDiffSpectrogram;
        }

        if (canvasToDraw && dataToDraw && drawFunction) {
            const ctx = canvasToDraw.getContext('2d');
            if (ctx) {
                drawFunction(dataToDraw, ctx, canvasToDraw);
                needsRedraw = true; // Ensure overlay is also redrawn on next animation frame
            } else {
                console.error("Could not get context for canvas:", canvasToDraw.id);
            }
        } else {
            console.warn(`No data or canvas to draw for tab ${tabId}`);
        }
    });
}

// Animation frame for UI updates - Force 60fps updates
let lastUpdate = 0;
let animationFrameId = null;
let needsRedraw = true;  // Flag to track if we need to redraw

function animationLoop(timestamp) {
    // Update on first frame and then approximately every 16ms (60fps)
    const shouldUpdate = !lastUpdate || timestamp - lastUpdate >= 16;
    
    if (shouldUpdate) {
        lastUpdate = timestamp;
        
        // Get the current time from the audio engine
        const currentTime = window.AudioEngine.getCurrentTime();
        const audioState = window.AudioEngine.state;
        
        // Update time display without triggering a redraw
        updateTimeDisplay(currentTime, audioState.duration);
        
        // Only redraw the canvas if needed (playback, dragging, or explicit request)
        if (needsRedraw || audioState.isPlaying || uiState.dragMode) {
            // Draw the playhead and loop region if canvas exists
            if (elements.overlayCanvas) {
                const ctx = elements.overlayCanvas.getContext('2d');
                
                // Clear the canvas first (now handled inside drawPlaybackVisuals)
                // ctx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
                
                // Draw the playhead and loop region using the local function
                drawPlaybackVisuals(
                    ctx, 
                    elements.overlayCanvas, 
                    currentTime, 
                    audioState.duration, 
                    audioState.loopStart, 
                    audioState.loopEnd, 
                    audioState.loopMode, 
                    uiState.dragMode
                );
            }
            
            // Update play button state
            if (elements.playButton) {
                elements.playButton.innerHTML = audioState.isPlaying ? '❚❚' : '▶';
            }
            
            // Update playing indicator
            updatePlayingIndicator();
            
            // Reset the redraw flag
            needsRedraw = false;
        }
    }
    
    // Continue the animation loop
    animationFrameId = requestAnimationFrame(animationLoop);
}

// Start the animation loop
function startAnimationLoop() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(animationLoop);
    }
}

// Stop the animation loop
function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Update UI elements based on current state
function updateUI() {
    // Ensure the animation loop is running
    startAnimationLoop();
    
    // Position overlay correctly - but don't update UI again
    positionOverlayWithoutUpdate();
    
    // Mark that we need a redraw
    needsRedraw = true;
}

// Version of positionOverlay that doesn't trigger UI updates or redraws directly
function positionOverlayWithoutUpdate() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab || !elements.tabContentContainer) return;
    const activeCanvas = activeTab.querySelector('canvas.spectrogram');
    if (!activeCanvas) return;

    // Get display dimensions
    const displayWidth = activeCanvas.clientWidth;
    const displayHeight = activeCanvas.clientHeight;

    let needsPosUpdate = false;
    let needsDimUpdate = false;

    const newStyles = {
        top: `${activeCanvas.offsetTop}px`,
        left: `${activeCanvas.offsetLeft}px`,
        width: `${displayWidth}px`,
        height: `${displayHeight}px`
    };

    // Compare current styles
    if (elements.overlayCanvas.style.top !== newStyles.top ||
        elements.overlayCanvas.style.left !== newStyles.left ||
        elements.overlayCanvas.style.width !== newStyles.width ||
        elements.overlayCanvas.style.height !== newStyles.height) {
        needsPosUpdate = true;
    }

    // Compare drawing buffer dimensions
    if (elements.overlayCanvas.width !== displayWidth ||
        elements.overlayCanvas.height !== displayHeight) {
        needsDimUpdate = true;
    }

    if (needsPosUpdate) {
        elements.overlayCanvas.style.position = 'absolute';
        elements.overlayCanvas.style.top = newStyles.top;
        elements.overlayCanvas.style.left = newStyles.left;
        elements.overlayCanvas.style.width = newStyles.width;
        elements.overlayCanvas.style.height = newStyles.height;
    }
    if (needsDimUpdate) {
        elements.overlayCanvas.width = displayWidth;
        elements.overlayCanvas.height = displayHeight;
        needsRedraw = true;
    }
}

// Show a status message to the user
function showStatus(message) {
    if (elements.statusDiv) {
        elements.statusDiv.textContent = message;
    }
}

// --- Event Handlers ---

// Helper function to process a single file (load, decode, visualize)
async function processSingleFile(file, fileNumber) {
    if (!file) return false;
    const filename = file.name;
    showStatus(`Loading ${filename}...`);

    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await readFileAsArrayBuffer(file);
        
        // Decode audio data - pass the filename
        showStatus(`Decoding audio data for ${filename}...`);
        const audioBuffer = await window.AudioEngine.loadFile(arrayBuffer, fileNumber, filename);
        if (!audioBuffer) throw new Error("Decoding failed.");

        // Set initial time range for spectrum analyzer IF this is the first file loaded
        // Or if the new file's duration changes the overall duration
        if (window.SpectrumAnalyzer) {
            const currentDuration = window.AudioEngine.state.duration;
            // Use a temporary duration if audio engine state isn't updated yet
            const effectiveDuration = currentDuration > 0 ? currentDuration : audioBuffer.duration;
             // Update spectrum time range to full duration before calculating spectrum
             // Only do this if the duration actually exists
             if (effectiveDuration > 0) {
                window.SpectrumAnalyzer.updateTimeRange(0, effectiveDuration); 
             }
        }

        // Process spectrogram
        showStatus(`Processing spectrogram for ${filename}...`);
        const spectrogramData = window.SpectrogramVisualizer.calculateSpectrogram(audioBuffer);
        if (!spectrogramData) throw new Error("Spectrogram calculation failed.");

        // Store in visualization state
        window.SpectrogramVisualizer.state.spectrograms[`file${fileNumber}`] = spectrogramData;
        
        // Draw the spectrogram on the appropriate canvas
        const canvas = elements.spectrogramCanvases[fileNumber - 1];
        if (!canvas) throw new Error(`Canvas for file ${fileNumber} not found.`);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(`Context for file ${fileNumber} canvas failed.`);
        window.SpectrogramVisualizer.drawSpectrogram(spectrogramData, ctx, canvas);

        console.log(`File ${fileNumber} (${filename}) processed successfully.`);
        return true; // Indicate success

    } catch (error) {
        showStatus(`Error processing ${filename}: ${error.message}`);
        console.error(`Error in processSingleFile for file ${fileNumber}:`, error);
        // Clear potentially stored data for this file number on error
        window.AudioEngine.state.buffers[`file${fileNumber}`] = null;
        window.AudioEngine.state.filenames[`file${fileNumber}`] = `File ${fileNumber}`;
        if (window.SpectrogramVisualizer) {
             window.SpectrogramVisualizer.state.spectrograms[`file${fileNumber}`] = null;
        }
        // Optionally clear canvas
        const canvas = elements.spectrogramCanvases[fileNumber - 1];
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return false; // Indicate failure
    }
}

// Handle file selection
async function handleFileSelect(event, fileNumber) {
    const files = event.target.files;
    if (!files || files.length === 0) return; 

    // --- Handle selecting two files via the first input --- 
    if (fileNumber === 1 && files.length === 2) {
        showStatus("Processing two files...");
        const success1 = await processSingleFile(files[0], 1);
        if (success1) {
            // Show main content after first file is processed
            if (elements.initialSetupDiv) elements.initialSetupDiv.classList.add('hidden');
            if (elements.mainContentDiv) elements.mainContentDiv.classList.add('visible');
             // Compute & plot spectrum for File 1
            if (window.SpectrumAnalyzer) window.SpectrumAnalyzer.computeAndPlotSpectra();
            updateDynamicLabels();
            updateTimeDisplay(0, window.AudioEngine.state.duration);
            updateUI();
            switchTab('file1-tab'); // Switch to file 1 tab while processing second
            
            // Process the second file
            showStatus(`Processing ${files[1].name}...`);
            const success2 = await processSingleFile(files[1], 2);
            
            if (success2) {
                // Both files loaded successfully
                createDiffSpectrogram(); 
                // Update spectrum plots for both files + difference
                if (window.SpectrumAnalyzer) window.SpectrumAnalyzer.computeAndPlotSpectra(); 
                updateDynamicLabels();
                updateTimeDisplay(0, window.AudioEngine.state.duration);
                updateUI();
                switchTab('diff-tab'); // Switch to diff tab
                showStatus('Both files loaded. Drag on spectrogram to select time range.');
            } else {
                // Second file failed, status already shown by processSingleFile
                showStatus(`Failed to load ${files[1].name}. File 1 loaded.`);
                // UI remains showing File 1 info
            }
        } else {
             // First file failed, status already shown by processSingleFile
             showStatus(`Failed to load ${files[0].name}.`);
             // Optionally clear file input? event.target.value = null;
        }
        // Clear the file input value after processing to allow re-selection of same files
        event.target.value = null;
        return; // Stop execution here for the two-file case
    }
    
    // --- Handle selecting one file (or more than 2 via input 1) --- 
    let fileToProcess = null;
    if (files.length === 1) {
        fileToProcess = files[0];
    } else if (fileNumber === 1 && files.length > 2) {
        showStatus("Please select only one or two files at a time via the first input.");
        event.target.value = null; // Clear input
        return;
    } else if (fileNumber === 2 && files.length > 1) {
         showStatus("Please select only one file via the second input.");
         event.target.value = null; // Clear input
         return;
    } 
    
    if (!fileToProcess) {
        // Should not happen if checks above are correct, but as a safeguard
        console.warn("No file determined for processing.");
        event.target.value = null;
        return;
    }

    // Process the single selected file
    const success = await processSingleFile(fileToProcess, fileNumber);
    
    if (success) {
         // Show main content if this is the first successful file load overall
         if (elements.initialSetupDiv && !elements.mainContentDiv.classList.contains('visible')) {
            if (elements.initialSetupDiv) elements.initialSetupDiv.classList.add('hidden');
            if (elements.mainContentDiv) elements.mainContentDiv.classList.add('visible');
         }
         
         // Check if both files are now loaded
         const spec1Loaded = !!window.SpectrogramVisualizer?.state?.spectrograms?.file1;
         const spec2Loaded = !!window.SpectrogramVisualizer?.state?.spectrograms?.file2;
         
         if (spec1Loaded && spec2Loaded) {
             // Both files are loaded, create diff and update spectrum for both + diff
             createDiffSpectrogram();
             if (window.SpectrumAnalyzer) window.SpectrumAnalyzer.computeAndPlotSpectra();
             switchTab('diff-tab');
             showStatus('Second file loaded. Drag on spectrogram to select time range.');
         } else {
             // Only one file is loaded, just update spectrum for that file
             if (window.SpectrumAnalyzer) window.SpectrumAnalyzer.computeAndPlotSpectra();
             switchTab(fileNumber === 1 ? 'file1-tab' : 'file2-tab');
             showStatus(`File ${fileNumber} (${fileToProcess.name}) loaded. Select the other file.`);
         }
         
         // Update common UI elements
         updateDynamicLabels();
         updateTimeDisplay(0, window.AudioEngine.state.duration); 
         updateUI();
    } else {
        // Processing failed, status already shown by processSingleFile
        // UI should reflect the state before this file attempt
        updateDynamicLabels(); // Ensure labels are correct if a file failed to load over another
        updateTimeDisplay(0, window.AudioEngine.state.duration); 
        updateUI();
    }
    // Clear the file input value after processing
    event.target.value = null;
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
        window.AudioEngine.switchSource(1);
        updateUI();
        window.SpectrumAnalyzer?.updateChartHighlighting(); // Update highlighting
    }
    // 2 = switch to file 2
    else if (event.key === '2') {
        switchTab('file2-tab');
        window.AudioEngine.switchSource(2);
        updateUI();
        window.SpectrumAnalyzer?.updateChartHighlighting(); // Update highlighting
    }
    else if (event.key === '3') {
        switchTab('diff-tab');
        updateUI();
        // No need to update highlighting when switching to diff tab,
        // as the source doesn't change.
    }
}

// Toggle playback state
function togglePlayback() {
    if (window.AudioEngine.state.isPlaying) {
        window.AudioEngine.stopPlayback();
    } else {
        window.AudioEngine.startPlayback();
    }
    updateUI();
    window.SpectrumAnalyzer?.updateChartHighlighting(); // Update chart highlighting
}

// Handle mouse down on canvas = start of click or drag
function handleMouseDown(event, canvasIndex) {
    const targetCanvas = elements.spectrogramCanvases[canvasIndex];
    if (!targetCanvas) return;

    // 1. Store playing state and pause if necessary
    uiState.wasPlayingBeforeDrag = window.AudioEngine.state.isPlaying;
    if (uiState.wasPlayingBeforeDrag) {
        window.AudioEngine.stopPlayback();
        // Ensure UI updates immediately to reflect paused state visually
        needsRedraw = true; // Request redraw to update playhead/button
        if (elements.playButton) {
            elements.playButton.innerHTML = '▶'; // Update button text now
        }
        updatePlayingIndicator(); // Update tab indicator now
        window.SpectrumAnalyzer?.updateChartHighlighting(); // Update chart highlighting
    }

    // Calculate click position relative to the display canvas bounds
    const rect = targetCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const boundedX = Math.max(0, Math.min(rect.width, x)); 
    const clickPositionRatio = boundedX / rect.width; 

    const duration = window.AudioEngine.state.duration;
    if (duration <= 0) return;
    const clickTime = clickPositionRatio * duration;

    // Set start point for loop
    window.AudioEngine.setLoopRegion(clickTime, clickTime, false);

    // Initialize drag mode
    uiState.dragMode = true;
    uiState.dragStart = boundedX; // Store click X relative to the display canvas

    // Seek audio engine
    window.AudioEngine.seekToTime(clickTime);

    needsRedraw = true;
}

// Handle mouse move = potential dragging + tooltip update
function handleMouseMove(event) {
    if (uiState.dragMode) {
        const activeCanvas = document.querySelector(`#${uiState.activeTab} canvas.spectrogram`);
        if (!activeCanvas) return;

        const rect = activeCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left; 
        const boundedX = Math.max(0, Math.min(rect.width, x));

        const duration = window.AudioEngine.state.duration;
        if (duration <= 0) return;
        const dragPositionRatio = boundedX / rect.width;
        const dragTime = dragPositionRatio * duration;

        const initialClickRatio = uiState.dragStart / rect.width;
        const initialClickTime = initialClickRatio * duration;

        let newStart, newEnd;
        if (dragTime < initialClickTime) {
            newStart = dragTime;
            newEnd = initialClickTime;
        } else {
            newStart = initialClickTime;
            newEnd = dragTime;
        }

        window.AudioEngine.setLoopRegion(newStart, newEnd, false);
        needsRedraw = true;
        hideTooltip();
    } else {
        updateTooltip(event);
    }
}

// Handle mouse up = end of click or drag
function handleMouseUp(event) {
    if (!uiState.dragMode) return;

    const activeCanvas = document.querySelector(`#${uiState.activeTab} canvas.spectrogram`);
    if (!activeCanvas) {
        uiState.dragMode = false;
        uiState.wasPlayingBeforeDrag = false; // Reset flag
        return;
    }

    const rect = activeCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const boundedX = Math.max(0, Math.min(rect.width, x));

    const duration = window.AudioEngine.state.duration;
    if (duration <= 0) {
        uiState.dragMode = false;
        uiState.wasPlayingBeforeDrag = false; // Reset flag
        return;
    }

    const startXRelative = Math.min(uiState.dragStart, boundedX);
    const endXRelative = Math.max(uiState.dragStart, boundedX);

    const startPosRatio = startXRelative / rect.width;
    const endPosRatio = endXRelative / rect.width;

    const startTime = startPosRatio * duration;
    const endTime = endPosRatio * duration;

    const enableLoop = endTime > startTime + 0.01; // Add small threshold to distinguish click vs drag

    window.AudioEngine.setLoopRegion(startTime, endTime, enableLoop);

    // Set drag mode false *before* potential playback start
    uiState.dragMode = false;
    needsRedraw = true;

    // Trigger spectrum analysis update *before* potentially restarting playback
    if (window.SpectrumAnalyzer && enableLoop) {
        window.SpectrumAnalyzer.handleTimeRangeSelection(startTime, endTime);
    }

    // 3. Resume playback if it was playing before drag
    if (uiState.wasPlayingBeforeDrag) {
        // Seek to the start of the new loop region (or the click point if it wasn't a loop)
        const resumeTime = enableLoop ? startTime : startTime; // Resume from start of selection
        window.AudioEngine.seekToTime(resumeTime);
        // Start playback
        window.AudioEngine.startPlayback();
        // Reset the flag
        uiState.wasPlayingBeforeDrag = false;
        window.SpectrumAnalyzer?.updateChartHighlighting(); // Update chart highlighting on resume
    } else {
        // If not playing before, just make sure the playhead is at the start of the selection
        const seekTime = enableLoop ? startTime : startTime;
        window.AudioEngine.seekToTime(seekTime); // Updates engine's currentTime
        updateTimeDisplay(window.AudioEngine.getCurrentTime(), duration); // Update display manually
        // No need to update highlighting if not playing before and not starting now
    }
}

// Calculate and update the tooltip with time/frequency information
function updateTooltip(event) {
    const activeCanvas = document.querySelector(`#${uiState.activeTab} canvas.spectrogram`);
    const spectrogramState = window.SpectrogramVisualizer?.state?.spectrograms;

    if (!activeCanvas || !elements.tooltip || !spectrogramState) {
        hideTooltip();
        return;
    }

    // Get the relevant spectrogram data based on the active tab
    let activeSpecData = null;
    if (uiState.activeTab === 'file1-tab') {
        activeSpecData = spectrogramState.file1;
    } else if (uiState.activeTab === 'file2-tab') {
        activeSpecData = spectrogramState.file2;
    } else if (uiState.activeTab === 'diff-tab') {
        activeSpecData = spectrogramState.diff;
    }

    // Check if the necessary Mel scale info exists
    if (!activeSpecData || !activeSpecData.melScaleInfo) {
        hideTooltip();
        return;
    }

    const { minMel, melRange } = activeSpecData.melScaleInfo;

    // Get display canvas bounds
    const rect = activeCanvas.getBoundingClientRect();

    // Check if mouse is inside the display canvas bounds
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) {
        hideTooltip();
        return;
    }

    // Calculate mouse position relative to display canvas
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to ratio (0-1) relative to display dimensions
    const xRatio = x / rect.width;
    const yRatio = 1 - (y / rect.height); // Invert Y (0 = bottom, 1 = top)

    // Ensure ratios are within bounds [0, 1]
    const boundedXRatio = Math.max(0, Math.min(1, xRatio));
    const boundedYRatio = Math.max(0, Math.min(1, yRatio));

    // Convert ratio to time
    const duration = window.AudioEngine.state.duration;
    const time = boundedXRatio * duration;

    // Calculate frequency using Mel scale
    // Map boundedYRatio (0-1) to the Mel range
    const targetMel = minMel + boundedYRatio * melRange;
    // Convert Mel back to Hz
    const frequency = melToHz(targetMel); // Use the helper function

    // Format values
    const timeFormatted = window.AudioEngine.formatTime(time);
    const freqFormatted = formatFrequency(frequency);

    // Set tooltip content
    elements.tooltip.textContent = `Time: ${timeFormatted} | Freq: ${freqFormatted}`;

    // Position tooltip near the cursor
    positionTooltip(event.clientX, event.clientY);

    // Show tooltip
    showTooltip();
}

// Format frequency with appropriate units
function formatFrequency(freqHz) {
    if (freqHz >= 1000) {
        return `${(freqHz / 1000).toFixed(1)} kHz`;
    } else {
        return `${Math.round(freqHz)} Hz`;
    }
}

// Position the tooltip near the cursor
function positionTooltip(x, y) {
    if (!elements.tooltip) return;
    
    // Position tooltip directly at cursor position
    // The CSS transform will apply the small offset
    elements.tooltip.style.left = `${x}px`;
    elements.tooltip.style.top = `${y}px`;
    
    // Make sure tooltip stays within viewport bounds
    const tooltipRect = elements.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Check if tooltip is going beyond right edge of viewport
    if (tooltipRect.right > viewportWidth) {
        // Position to the left of cursor instead
        elements.tooltip.style.left = `${x - tooltipRect.width - 5}px`; // Adjust offset
        elements.tooltip.style.transform = 'translate(0, 5px)'; // Reset transform
    } else {
        // Default positioning
        elements.tooltip.style.transform = 'translate(5px, 5px)';
    }
    
    // Check if tooltip is going beyond bottom edge of viewport
    if (tooltipRect.bottom > viewportHeight) {
        // Position above cursor instead
        elements.tooltip.style.top = `${y - tooltipRect.height - 5}px`; // Adjust offset
        // Re-evaluate horizontal position based on vertical adjustment
        if (tooltipRect.right > viewportWidth) {
            elements.tooltip.style.transform = 'translate(0, 0)'; // Left and above
        } else {
            elements.tooltip.style.transform = 'translate(5px, 0)'; // Right and above
        }
    } else if (tooltipRect.right <= viewportWidth) {
        // Reset vertical transform if it fits
         elements.tooltip.style.transform = 'translate(5px, 5px)';
    }
}

// Show the tooltip
function showTooltip() {
    if (!elements.tooltip) return;
    elements.tooltip.style.display = 'block';
    uiState.tooltip.visible = true;
}

// Hide the tooltip
function hideTooltip() {
    if (!elements.tooltip) return;
    elements.tooltip.style.display = 'none';
    uiState.tooltip.visible = false;
}

// --- Helper Functions ---

// Convert Mel scale to frequency in Hz
// (Copied from visualization.js for use in ui.js)
function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

// Debounce function for resize events
function debounce(func, delay) {
    let timeoutId;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, delay);
    };
}

// Read a file as an ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e.target.error);
        
        reader.readAsArrayBuffer(file);
    });
}

// Create the difference spectrogram
function createDiffSpectrogram() {
    const diffCanvas = document.getElementById('diffSpectrogramCanvas');
    if (!diffCanvas) return;
    
    const ctx = diffCanvas.getContext('2d');
    const spec1 = window.SpectrogramVisualizer.state.spectrograms.file1;
    const spec2 = window.SpectrogramVisualizer.state.spectrograms.file2;
    
    // Calculate and draw the diff spectrogram
    const diffData = window.SpectrogramVisualizer.calculateDiffSpectrogram(spec1, spec2, diffCanvas, ctx);
    
    // Store in state
    window.SpectrogramVisualizer.state.spectrograms.diff = diffData;
    
    // REMOVED: Spectrum analyzer updates are now handled in handleFileSelect
    // after both files are confirmed loaded and duration is finalized.
    /*
    if (window.SpectrumAnalyzer && 
        window.AudioEngine.state.loopMode && 
        window.AudioEngine.state.loopEnd > window.AudioEngine.state.loopStart) {
        window.SpectrumAnalyzer.updateTimeRange(
            window.AudioEngine.state.loopStart,
            window.AudioEngine.state.loopEnd
        );
    } else if (window.SpectrumAnalyzer) {
        // Default to full file if no range selected - this happens after loading both files
        // Handled within handleFileSelect now
        // window.SpectrumAnalyzer.updateTimeRange(0, window.AudioEngine.state.duration);
    }
    */
}

// Update the time display
function updateTimeDisplay(current, total) {
    if (!elements.timeDisplayElements.current || !elements.timeDisplayElements.total) return;
    
    const currentFormatted = window.AudioEngine.formatTime(current);
    const totalFormatted = window.AudioEngine.formatTime(total);
    
    // Only update DOM if the text has changed
    if (elements.timeDisplayElements.current.textContent !== currentFormatted) {
        elements.timeDisplayElements.current.textContent = currentFormatted;
    }
    
    if (elements.timeDisplayElements.total.textContent !== totalFormatted) {
        elements.timeDisplayElements.total.textContent = totalFormatted;
    }
    
    // Update the time range display if available
    const timeRangeElement = elements.timeDisplayElements.range;
    if (timeRangeElement && window.AudioEngine.state.duration > 0) { // Check duration > 0
        let rangeText = `0:00 - ${totalFormatted}`; // Default to full range
        if (window.AudioEngine.state.loopMode && window.AudioEngine.state.loopEnd > window.AudioEngine.state.loopStart) {
            const loopStartFormatted = window.AudioEngine.formatTime(window.AudioEngine.state.loopStart);
            const loopEndFormatted = window.AudioEngine.formatTime(window.AudioEngine.state.loopEnd);
            rangeText = `${loopStartFormatted} - ${loopEndFormatted}`;
        }

        if (timeRangeElement.textContent !== rangeText) {
            timeRangeElement.textContent = rangeText;
        }
    } else if (timeRangeElement) {
        // Handle case where duration is 0 or not yet set
        const initialRangeText = `0:00 - 0:00`;
        if (timeRangeElement.textContent !== initialRangeText) {
             timeRangeElement.textContent = initialRangeText;
        }
    }
}

// Update the playing indicator on tab buttons
function updatePlayingIndicator() {
    const tab1Button = document.getElementById('tab1');
    const tab2Button = document.getElementById('tab2');

    // Remove the class from both buttons first
    if (tab1Button) tab1Button.classList.remove('is-playing');
    if (tab2Button) tab2Button.classList.remove('is-playing');

    // Add the class to the active source button if playing
    if (window.AudioEngine.state.isPlaying) {
        const playingButton = window.AudioEngine.state.selectedSource === 1 ? tab1Button : tab2Button;
        if (playingButton) {
            playingButton.classList.add('is-playing');
        }
    }
}

// Find all required DOM elements
function findDomElements() {
    elements.initialSetupDiv = document.getElementById('initial-setup'); // Get initial setup div
    elements.mainContentDiv = document.getElementById('main-content'); // Get main content div

    elements.fileInputs = [
        document.getElementById('audioFile1'),
        document.getElementById('audioFile2')
    ];
    
    elements.spectrogramCanvases = [
        document.getElementById('spectrogramCanvas1'),
        document.getElementById('spectrogramCanvas2'),
        document.getElementById('diffSpectrogramCanvas')
    ];
    
    elements.tabButtons = document.querySelectorAll('.tab-button');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.playButton = document.getElementById('playButton');
    elements.overlayCanvas = document.getElementById('playbackOverlay');
    elements.statusDiv = document.getElementById('status');
    elements.tooltip = document.getElementById('spectrogram-tooltip');
    elements.swapButton = document.getElementById('swapFilesButton'); // Add swap button
    
    elements.timeDisplayElements = {
        current: document.getElementById('currentTime'),
        total: document.getElementById('totalTime'),
        range: document.getElementById('spectrumTimeRange') // Target the span directly
    };

    elements.tabContentContainer = document.querySelector('.tab-content-container');
}

// Set up all event listeners
function setupEventListeners() {
    // File inputs
    if (elements.fileInputs[0]) {
        elements.fileInputs[0].addEventListener('change', (event) => handleFileSelect(event, 1), false);
    }
    
    if (elements.fileInputs[1]) {
        elements.fileInputs[1].addEventListener('change', (event) => handleFileSelect(event, 2), false);
    }
    
    // Play button
    if (elements.playButton) {
        elements.playButton.addEventListener('click', togglePlayback);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
    
    // Canvas interactions - attach listeners to the container for spectrogram tabs
    if (elements.tabContentContainer) {
        elements.tabContentContainer.addEventListener('mousedown', (event) => {
            // Ensure the event target is a spectrogram canvas
            if (event.target.classList.contains('spectrogram')) {
                 // Determine which canvas was clicked based on the *active tab*
                let canvasIndex = -1;
                if (uiState.activeTab === 'file1-tab') canvasIndex = 0;
                else if (uiState.activeTab === 'file2-tab') canvasIndex = 1;
                else if (uiState.activeTab === 'diff-tab') canvasIndex = 2;

                if (canvasIndex !== -1) {
                    handleMouseDown(event, canvasIndex);
                }
            }
        });
        
        // Mousemove on the container handles both dragging (if active) and tooltips
        elements.tabContentContainer.addEventListener('mousemove', handleMouseMove); 
        
        // Hide tooltip if mouse leaves the container
        elements.tabContentContainer.addEventListener('mouseleave', hideTooltip);
    }
    
    // We still handle mouse up at the document level to correctly end drags
    document.addEventListener('mouseup', handleMouseUp);
    
    // Tab buttons
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
            
            // Switch audio source when switching tabs
            if (tabId === 'file1-tab') {
                window.AudioEngine.switchSource(1);
            } else if (tabId === 'file2-tab') {
                window.AudioEngine.switchSource(2);
            }
            // If diff tab, we keep playing the current source
            
            updateUI(); // Trigger UI update after tab switch
            window.SpectrumAnalyzer?.updateChartHighlighting(); // Update chart highlighting
        });
    });
    
    // Swap button listener
    if (elements.swapButton) {
        elements.swapButton.addEventListener('click', handleSwapFiles);
    }
    
    // Window resize - Debounced
    window.addEventListener('resize', debounce(() => {
        console.log("Resize detected");
        // Redraw spectrograms needed as display canvas size changed
        if (window.SpectrogramVisualizer && typeof window.SpectrogramVisualizer.redrawAllSpectrograms === 'function') {
            window.SpectrogramVisualizer.redrawAllSpectrograms();
        }
        // Update UI (repositions overlay to new display size)
        updateUI(); 
    }, 150)); // 150ms debounce
    
    // Start animation loop
    startAnimationLoop();
    
    // Handle visibility change to pause animation when tab is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAnimationLoop();
        } else {
            startAnimationLoop();
        }
    });
    
    // Initialize spectrum analyzer if available
    if (window.SpectrumAnalyzer) {
        window.SpectrumAnalyzer.init();
    }
}

// Export the public API
window.UIController = {
    init: initUI,
    updateUI,
    switchTab,
    showStatus,
    updateDynamicLabels,
    positionOverlay // Keep this exported if needed externally, though updateUI is preferred
};

// Draw the playback position and loop region on the overlay canvas
function drawPlaybackVisuals(ctx, canvas, currentTime, duration, loopStart, loopEnd, loopMode, dragMode) {
    // Clear the overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Prevent drawing if duration is 0 or NaN
    if (!duration || isNaN(duration) || duration <= 0) return;
    
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // If loop mode is active or we're dragging, draw loop region
    if (loopMode || dragMode) {
        // Ensure loopStart and loopEnd are valid numbers
        const validLoopStart = (typeof loopStart === 'number' && isFinite(loopStart)) ? loopStart : 0;
        const validLoopEnd = (typeof loopEnd === 'number' && isFinite(loopEnd)) ? loopEnd : duration;

        // Calculate position of loop markers
        const startPos = (validLoopStart / duration) * canvasWidth;
        const endPos = (validLoopEnd / duration) * canvasWidth;

        // Draw loop region only if end > start
        if (endPos > startPos) {
            // Create a vertical linear gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
            gradient.addColorStop(0.0, "rgba(255, 255, 255, 0.15)");
            gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.05)");
            gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.05)");
            gradient.addColorStop(1.0, "rgba(255, 255, 255, 0.15)");

            // Use the gradient as the fill style
            ctx.fillStyle = gradient;
            ctx.fillRect(startPos, 0, endPos - startPos, canvasHeight);

            // Draw loop start and end lines
            ctx.beginPath();
            ctx.moveTo(startPos, 0);
            ctx.lineTo(startPos, canvasHeight);
            ctx.strokeStyle = 'rgba(64, 255, 64, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endPos, 0);
            ctx.lineTo(endPos, canvasHeight);
            ctx.strokeStyle = 'rgba(255, 64, 64, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    
    // Ensure currentTime is a valid number
    const validCurrentTime = (typeof currentTime === 'number' && isFinite(currentTime)) ? currentTime : 0;

    // Calculate position based on current time
    const position = (validCurrentTime / duration) * canvasWidth;
    
    // Draw playhead line
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvasHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';  // Full opacity white
    ctx.lineWidth = 1;  // Slightly thinner line
    ctx.stroke();
}

// Update tab labels with current filenames
function updateDynamicLabels() {
    const audioState = window.AudioEngine?.state;
    if (!audioState) return;

    const tab1Button = document.getElementById('tab1');
    const tab2Button = document.getElementById('tab2');

    if (tab1Button) {
        // Keep indicator if it exists
        const indicator = tab1Button.querySelector('.playing-indicator');
        tab1Button.firstChild.textContent = (audioState.filenames.file1 || 'File 1') + ' '; // Add space before indicator
    }
    if (tab2Button) {
        const indicator = tab2Button.querySelector('.playing-indicator');
        tab2Button.firstChild.textContent = (audioState.filenames.file2 || 'File 2') + ' '; // Add space before indicator
    }
    
    // Potentially update chart titles/legends here if needed, 
    // but spectrum.js handles its own labels based on AudioEngine state.
}

// --- New Swap Handler ---
function handleSwapFiles() {
    // Check if both files are loaded
    if (!window.AudioEngine?.state?.buffers?.file1 || 
        !window.AudioEngine?.state?.buffers?.file2 ||
        !window.SpectrogramVisualizer?.state?.spectrograms?.file1 ||
        !window.SpectrogramVisualizer?.state?.spectrograms?.file2) {
        showStatus("Please load both files before swapping.");
        return;
    }

    console.log("Handling file swap...");
    showStatus("Swapping files...");

    // 1. Swap data in modules
    window.AudioEngine.swapFiles();
    window.SpectrogramVisualizer.swapFiles();

    // 2. Recalculate difference spectrogram
    createDiffSpectrogram(); 

    // 3. Recalculate and plot spectrum analysis
    if (window.SpectrumAnalyzer) {
        // Use existing time range unless it was reset by audio swap
        window.SpectrumAnalyzer.computeAndPlotSpectra();
    }

    // 4. Redraw spectrograms
    if (window.SpectrogramVisualizer?.redrawAllSpectrograms) {
        window.SpectrogramVisualizer.redrawAllSpectrograms();
    }

    // 5. Update UI labels and state
    updateDynamicLabels();
    updateUI(); // Redraws overlay, updates time display etc.
    window.SpectrumAnalyzer?.updateChartHighlighting(); // Update chart highlighting

    // Optionally switch to a specific tab (e.g., diff) after swap
    // switchTab('diff-tab'); 

    showStatus("Files swapped successfully.");
    console.log("File swap complete.");
} 