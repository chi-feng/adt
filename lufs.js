"use strict";

// lufs.js - Handles LUFS (Loudness Units Full Scale) analysis based on ITU-R BS.1770-4

const lufsState = {
    results: {
        file1: null, // Stores { lkfsPerBlock, energies, integrated, minLKFS, maxLKFS, hopSamples, blockSamples, numBlocks, sampleRate, 
                     // threshold, loudnessRange, lraThreshold, lraLow, lraHigh }
        file2: null
    },
    charts: {
        comparisonChart: null,
        lufsDifferenceChart: null // Add chart state for difference
    },
    dom: { // Store DOM elements related to LUFS display
        // Remove individual displays and canvases
        // integratedDisplay1: null,
        // integratedDisplay2: null,
        // lufsChartCanvas1: null,
        // lufsChartCanvas2: null,
        // Remove individual items
        // lufsItem1: null,
        // lufsItem2: null

        // Add new elements
        lufsComparisonItem: null, // Container for the comparison chart
        lufsComparisonCanvas: null, // Canvas for the comparison chart
        loudnessStatsItem: null, // Container for the stats panel (now in left sidebar)
        statIntegrated1: null,
        statIntegrated2: null,
        statPeak1: null,
        statPeak2: null,
        statCurrent: null,
        // Add elements for EBUR128 additional metrics
        statThreshold1: null,
        statLRA1: null, 
        statLRALow1: null,
        statLRAHigh1: null,
        statLRAThreshold1: null,
        // Add File 2 metrics
        statThreshold2: null,
        statLRA2: null, 
        statLRALow2: null,
        statLRAHigh2: null,
        statLRAThreshold2: null,
        // Add new elements for difference chart
        lufsDifferenceItem: null,
        lufsDifferenceCanvas: null
    },
    // Add hover state for chart
    hoverState: {
        isHovering: false,
        x: null,
        time: null
    },
    initialized: false
};

// --- Public API ---

function initLufsAnalysis() {
    if (lufsState.initialized) return;

    // Find DOM elements for the layout
    lufsState.dom.lufsComparisonItem = document.getElementById('lufs-comparison-item');
    lufsState.dom.lufsComparisonCanvas = document.getElementById('lufsComparisonChart');
    lufsState.dom.loudnessStatsItem = document.getElementById('loudness-stats-item');
    lufsState.dom.statIntegrated1 = document.getElementById('statIntegratedLufs1');
    lufsState.dom.statIntegrated2 = document.getElementById('statIntegratedLufs2');
    lufsState.dom.statPeak1 = document.getElementById('statPeakLufs1');
    lufsState.dom.statPeak2 = document.getElementById('statPeakLufs2');
    lufsState.dom.statCurrent = document.getElementById('statCurrentLufs');
    lufsState.dom.statThreshold1 = document.getElementById('statThreshold1');
    lufsState.dom.statLRA1 = document.getElementById('statLRA1');
    lufsState.dom.statLRALow1 = document.getElementById('statLRALow1');
    lufsState.dom.statLRAHigh1 = document.getElementById('statLRAHigh1');
    lufsState.dom.statLRAThreshold1 = document.getElementById('statLRAThreshold1');
    lufsState.dom.statThreshold2 = document.getElementById('statThreshold2');
    lufsState.dom.statLRA2 = document.getElementById('statLRA2');
    lufsState.dom.statLRALow2 = document.getElementById('statLRALow2');
    lufsState.dom.statLRAHigh2 = document.getElementById('statLRAHigh2');
    lufsState.dom.statLRAThreshold2 = document.getElementById('statLRAThreshold2');
    
    // Find difference chart elements
    lufsState.dom.lufsDifferenceItem = document.getElementById('lufs-difference-item');
    lufsState.dom.lufsDifferenceCanvas = document.getElementById('lufsDifferenceChart');

    // Check if all elements were found
    let allFound = true;
    for (const key in lufsState.dom) {
        // Skip loudnessStatsItem check if it's intentionally moved to left panel
        // and might not always be present depending on setup.
        // For now, assume it exists.
        if (lufsState.dom[key] === null) {
            console.error(`LUFS UI element not found: ${key}`);
            allFound = false;
        }
    }
    if (!allFound) {
        console.error("Could not find all LUFS UI elements.");
    }

    // Add mouse event listeners for the LUFS comparison chart
    if (lufsState.dom.lufsComparisonCanvas) {
        lufsState.dom.lufsComparisonCanvas.addEventListener('mousedown', handleChartMouseDown); // Re-use existing handler
        lufsState.dom.lufsComparisonCanvas.addEventListener('mousemove', handleChartHover);    // Re-use existing handler
        lufsState.dom.lufsComparisonCanvas.addEventListener('mouseleave', handleChartLeave);  // Re-use existing handler
    }
    
    // Add event listeners for the new LUFS difference chart (can re-use handlers)
    if (lufsState.dom.lufsDifferenceCanvas) {
        lufsState.dom.lufsDifferenceCanvas.addEventListener('mousedown', handleChartMouseDown); // Re-use existing handler
        lufsState.dom.lufsDifferenceCanvas.addEventListener('mousemove', handleChartHover);    // Re-use existing handler
        lufsState.dom.lufsDifferenceCanvas.addEventListener('mouseleave', handleChartLeave);  // Re-use existing handler
    }

    lufsState.initialized = true;
    console.log("LUFS analysis module initialized");
}

/**
 * Calculates LUFS/LKFS for a single audio buffer.
 * Stores the result in lufsState.
 * @param {AudioBuffer} audioBuffer - Decoded audio data.
 * @param {number} fileIndex - 1 or 2.
 * @param {Object} [opts] - Options for calculateLKFS (blockMs, hopMs, channel).
 */
function calculateLufs(audioBuffer, fileIndex, opts = {}) {
    if (!audioBuffer || (fileIndex !== 1 && fileIndex !== 2)) {
        console.error("Invalid input for calculateLufs", { fileIndex });
        return;
    }

    try {
        console.log(`Calculating LUFS for File ${fileIndex}...`);
        const result = calculateLKFSInternal(audioBuffer, opts);
        lufsState.results[`file${fileIndex}`] = result;
        console.log(`LUFS calculation complete for File ${fileIndex}. Integrated: ${result?.integrated?.toFixed(1) ?? 'N/A'} LUFS`);

        // Trigger UI update after calculation
        updateLufsUI();

    } catch (error) {
        console.error(`Error calculating LUFS for file ${fileIndex}:`, error);
        lufsState.results[`file${fileIndex}`] = null;
         // Update UI to show error or clear display
         updateLufsUI();
    }
}

/**
 * Swaps the calculated LUFS data between file 1 and file 2.
 */
function swapLufsData() {
    if (!lufsState.initialized) return;
    console.log("Swapping LUFS data...");
    const temp = lufsState.results.file1;
    lufsState.results.file1 = lufsState.results.file2;
    lufsState.results.file2 = temp;
    // Update the entire UI after swap
    updateLufsUI();
}

/**
 * Updates the LUFS comparison chart, difference chart, and statistics panel.
 */
function updateLufsUI() {
    if (!lufsState.initialized) return;

    const audioState = window.AudioEngine?.state;
    if (!audioState) return; // Need audio engine state

    const timeRangeStart = audioState.loopMode ? audioState.loopStart : 0;
    const timeRangeEnd = audioState.loopMode ? audioState.loopEnd : audioState.duration;
    const currentTime = window.AudioEngine.getCurrentTime();

    // Update the comparison chart
    plotLufsComparisonChart();
    
    // Update the difference chart
    plotLufsDifferenceChart();

    // Update the statistics panel (now in left sidebar)
    updateLoudnessStats(timeRangeStart, timeRangeEnd, currentTime);

    // Show/hide the chart items based on whether any data exists
    const hasData1 = !!(lufsState.results.file1 && lufsState.results.file1.numBlocks > 0);
    const hasData2 = !!(lufsState.results.file2 && lufsState.results.file2.numBlocks > 0);

    // Comparison Chart visibility
    if (lufsState.dom.lufsComparisonItem) {
        if (hasData1 || hasData2) {
            lufsState.dom.lufsComparisonItem.classList.remove('hidden');
        } else {
            lufsState.dom.lufsComparisonItem.classList.add('hidden');
        }
    }
    
    // Difference Chart visibility (requires both files)
    if (lufsState.dom.lufsDifferenceItem) {
        if (hasData1 && hasData2) {
            lufsState.dom.lufsDifferenceItem.classList.remove('hidden');
        } else {
            lufsState.dom.lufsDifferenceItem.classList.add('hidden');
        }
    }
    
    // Stats Panel visibility (always show if initialized and moved to left)
    // No need to hide/show if it's part of the main left panel layout
    // if (lufsState.dom.loudnessStatsItem) { ... }
}

/**
 * Gets the momentary LUFS value at a specific time point.
 * @param {number} fileIndex - 1 or 2.
 * @param {number} time - Time in seconds.
 * @returns {number | null} Momentary LUFS value or null if not available.
 */
function getMomentaryLufsAtTime(fileIndex, time) {
    const results = lufsState.results[`file${fileIndex}`];
    if (!results || results.numBlocks === 0 || time < 0) {
        return null;
    }

    const { lkfsPerBlock, hopSamples, sampleRate, numBlocks } = results;
    const timeStep = hopSamples / sampleRate;

    // Find the block index corresponding to the time
    // The block starting at index `i` covers time `i * timeStep`
    const index = Math.floor(time / timeStep);

    // Clamp index to valid range
    const validIndex = Math.max(0, Math.min(index, numBlocks - 1));

    const lufs = lkfsPerBlock[validIndex];
    return isFinite(lufs) ? lufs : null;
}

// --- Chart Hover/Tracking Functions ---

// Add drag state tracking for the chart
const chartDragState = {
    isDragging: false,
    startTime: null,
    wasPlayingBeforeDrag: false
};

/**
 * Handles mouse down event on the LUFS chart
 * @param {MouseEvent} event - Mouse event
 */
function handleChartMouseDown(event) {
    if (!lufsState.initialized || !lufsState.charts.comparisonChart) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    
    // Get the time value from chart X position
    const xScale = lufsState.charts.comparisonChart.scales.x;
    const clickTime = xScale.getValueForPixel(x);
    
    // Store playing state before starting drag
    chartDragState.wasPlayingBeforeDrag = window.AudioEngine?.state?.isPlaying || false;
    if (chartDragState.wasPlayingBeforeDrag) {
        window.AudioEngine.stopPlayback();
    }
    
    // Set loop start to click position
    window.AudioEngine.setLoopRegion(clickTime, clickTime, false);
    
    // Start drag mode
    chartDragState.isDragging = true;
    chartDragState.startTime = clickTime;
    
    // Seek to the clicked time
    window.AudioEngine.seekToTime(clickTime);
    
    // Force chart redraw
    lufsState.charts.comparisonChart.draw();
    
    // Add document-level event listeners for mousemove and mouseup
    document.addEventListener('mousemove', handleChartDrag);
    document.addEventListener('mouseup', handleChartDragEnd);
}

/**
 * Handles mouse move during drag on the LUFS chart
 * @param {MouseEvent} event - Mouse event
 */
function handleChartDrag(event) {
    if (!chartDragState.isDragging || !lufsState.charts.comparisonChart) return;
    
    const canvas = lufsState.dom.lufsComparisonCanvas;
    const rect = canvas.getBoundingClientRect();
    
    // Check if mouse is outside chart bounds horizontally
    if (event.clientX < rect.left) {
        // If dragging to the left of chart, use left edge
        handleDragToTime(lufsState.charts.comparisonChart.scales.x.min);
    } else if (event.clientX > rect.right) {
        // If dragging to the right of chart, use right edge
        handleDragToTime(lufsState.charts.comparisonChart.scales.x.max);
    } else {
        // Within chart bounds, get exact position
        const x = event.clientX - rect.left;
        const dragTime = lufsState.charts.comparisonChart.scales.x.getValueForPixel(x);
        handleDragToTime(dragTime);
    }
}

/**
 * Helper to update the loop region during dragging
 */
function handleDragToTime(currentTime) {
    // Extra safety check - only modify anything if we're actively dragging
    if (!chartDragState.isDragging || !chartDragState.startTime) return;
    
    const initialTime = chartDragState.startTime;
    
    // Determine start and end times for the loop region
    let loopStart, loopEnd;
    if (currentTime < initialTime) {
        loopStart = currentTime;
        loopEnd = initialTime;
    } else {
        loopStart = initialTime;
        loopEnd = currentTime;
    }
    
    // Update loop region without enabling loop mode yet
    window.AudioEngine.setLoopRegion(loopStart, loopEnd, false);
    
    // Force chart redraw
    if (lufsState.charts.comparisonChart) {
        lufsState.charts.comparisonChart.draw();
    }
}

/**
 * Handles mouse up to end dragging on the LUFS chart
 * @param {MouseEvent} event - Mouse event
 */
function handleChartDragEnd(event) {
    if (!chartDragState.isDragging) return;
    
    // Also clear hover state to prevent interference
    lufsState.hoverState.isHovering = false;
    lufsState.hoverState.x = null;
    lufsState.hoverState.time = null;
    
    const canvas = lufsState.dom.lufsComparisonCanvas;
    const rect = canvas.getBoundingClientRect();
    
    // Determine final time position
    let finalTime;
    if (event.clientX < rect.left) {
        finalTime = lufsState.charts.comparisonChart.scales.x.min;
    } else if (event.clientX > rect.right) {
        finalTime = lufsState.charts.comparisonChart.scales.x.max;
    } else {
        const x = event.clientX - rect.left;
        finalTime = lufsState.charts.comparisonChart.scales.x.getValueForPixel(x);
    }
    
    // Determine final loop region
    let loopStart, loopEnd;
    if (finalTime < chartDragState.startTime) {
        loopStart = finalTime;
        loopEnd = chartDragState.startTime;
    } else {
        loopStart = chartDragState.startTime;
        loopEnd = finalTime;
    }
    
    // Determine if this was a click vs. drag (small threshold)
    const enableLoop = Math.abs(loopEnd - loopStart) > 0.01;
    
    // Set the final loop region with loop mode if it's a drag
    window.AudioEngine.setLoopRegion(loopStart, loopEnd, enableLoop);
    
    // Clean up listeners
    document.removeEventListener('mousemove', handleChartDrag);
    document.removeEventListener('mouseup', handleChartDragEnd);
    
    // If spectrum analyzer exists, update it with the new time range
    if (window.SpectrumAnalyzer && enableLoop) {
        window.SpectrumAnalyzer.handleTimeRangeSelection(loopStart, loopEnd);
    }
    
    // Restore playback if it was playing before
    if (chartDragState.wasPlayingBeforeDrag) {
        // Resume from start of loop or click position based on whether it's a loop
        const resumeTime = enableLoop ? loopStart : chartDragState.startTime;
        window.AudioEngine.seekToTime(resumeTime);
        window.AudioEngine.startPlayback();
    } else {
        // Just seek to appropriate position
        const seekTime = enableLoop ? loopStart : chartDragState.startTime;
        window.AudioEngine.seekToTime(seekTime);
    }
    
    // Reset drag state
    chartDragState.isDragging = false;
    chartDragState.startTime = null;
    chartDragState.wasPlayingBeforeDrag = false;
    
    // Update LUFS stats for new range
    updateLufsUI();
}

/**
 * Handles mouse move event over the LUFS chart
 * @param {MouseEvent} event - Mouse event
 */
function handleChartHover(event) {
    // Skip hover handling completely if we're in drag mode
    // This prevents interference between hover and drag
    if (chartDragState.isDragging || !lufsState.charts.comparisonChart) return;
    
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    
    // Get the time value from chart X position
    const xScale = lufsState.charts.comparisonChart.scales.x;
    const time = xScale.getValueForPixel(x);
    
    // Update hover state
    lufsState.hoverState.isHovering = true;
    lufsState.hoverState.x = x;
    lufsState.hoverState.time = time;
    
    // Trigger chart redraw to show the hover line
    lufsState.charts.comparisonChart.draw();
}

/**
 * Handles mouse leave event from the LUFS chart
 */
function handleChartLeave() {
    // Clear hover state completely
    lufsState.hoverState.isHovering = false;
    lufsState.hoverState.x = null;
    lufsState.hoverState.time = null;
    
    // Trigger chart redraw to remove the hover line
    if (lufsState.charts.comparisonChart) {
        lufsState.charts.comparisonChart.draw();
    }
}

// --- Internal Calculation Logic ---

/**
 * LKFS / LUFS analysis (ITU‑R BS.1770‑4) - Internal Implementation
 * Handles stereo by summing channel energies before gating.
 * @param {AudioBuffer} audioBuffer – decoded by Web Audio API
 * @param {Object} [opts]
 *        opts.blockMs … analysis window, default 400 ms ("momentary")
 *        opts.hopMs   … stride between blocks, default 100 ms
 *        opts.channel … DEPRECATED - Now analyzes channel 0 and 1 for stereo.
 * @returns {Object|null} Analysis results or null on error. Contains:
 *   { lkfsPerBlock: Float32Array, energies: Float32Array (summed), integrated: number|null,
 *     minLKFS: number, maxLKFS: number, hopSamples: number, blockSamples: number,
 *     numBlocks: number, sampleRate: number }
 */
function calculateLKFSInternal(audioBuffer, opts = {}) {
  /* ---------- constants & helpers ---------- */
  const Fs = audioBuffer.samplerate || audioBuffer.sampleRate;
  if (!Fs || Fs <= 0) throw new Error("Invalid sample rate in AudioBuffer");

  const blockMs = opts.blockMs ?? 400;
  const hopMs = opts.hopMs ?? 100;
  const blockSamples = Math.round(blockMs / 1000 * Fs);
  const hopSamples = Math.round(hopMs / 1000 * Fs);
  const numChannels = audioBuffer.numberOfChannels;

  // Basic validation
  if (numChannels === 0) throw new Error("AudioBuffer has no channels.");
  const pcmL = audioBuffer.getChannelData(0);
  if (pcmL.length < blockSamples) {
       console.warn(`Audio length (${pcmL.length} samples) is shorter than block size (${blockSamples} samples). LUFS results may be unreliable or null.`);
       return {
           lkfsPerBlock: new Float32Array(0), energies: new Float32Array(0), integrated: null,
           minLKFS: -Infinity, maxLKFS: -Infinity, hopSamples, blockSamples, numBlocks: 0, sampleRate: Fs
       };
  }

  /* 1.  K‑weighting ====================================================== */
  // Design filters once using the BS.1770 specific functions
  const highShelf = designKGainShelf(Fs);
  const highPass = designKHighPass(Fs);

  // Process Left Channel (Channel 0)
  console.log("Applying K-weighting Stage 1 (High Shelf) to Channel 0...");
  const shelfFilteredL = applyBiquad(pcmL, highShelf);
  console.log("Applying K-weighting Stage 2 (High Pass) to Channel 0...");
  const filteredL = applyBiquad(shelfFilteredL, highPass);
  console.log("Finished K-weighting Channel 0.");

  let filteredR = null;
  if (numChannels > 1) {
      console.log("Applying K-weighting Stage 1 (High Shelf) to Channel 1...");
      const pcmR = audioBuffer.getChannelData(1); // Get Right Channel
      const shelfFilteredR = applyBiquad(pcmR, highShelf);
      console.log("Applying K-weighting Stage 2 (High Pass) to Channel 1...");
      filteredR = applyBiquad(shelfFilteredR, highPass);
      console.log("Finished K-weighting Channel 1.");
  }

  /* 2.  block energies =================================================== */
  const numBlocks = Math.max(0, Math.floor((filteredL.length - blockSamples) / hopSamples) + 1);
  console.log(`Calculating energy for ${numBlocks} blocks...`);

  // energies array will store the SUMMED energy if stereo
  const energies = new Float32Array(numBlocks);
  const lkfsPerBlock = new Float32Array(numBlocks); // Momentary LKFS based on summed energy
  
  // For short-term loudness calculation (3-second windows)
  const shortTermBlockMs = 3000; // 3 seconds for short-term blocks
  const shortTermBlockSamples = Math.round(shortTermBlockMs / 1000 * Fs);
  const shortTermEnergies = []; // Array to collect 3-second window energies for LRA calculation
  
  let minLKFS = Infinity;
  let maxLKFS = -Infinity;

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSamples;
    const endSample = Math.min(start + blockSamples, filteredL.length); // Use length of L channel

    let sumL = 0;
    let sumR = 0;
    let actualSamplesInBlock = 0;

    // Calculate sum of squares for Left channel
    for (let i = start; i < endSample; i++) {
      const sL = filteredL[i];
      sumL += sL * sL;
      actualSamplesInBlock++;
    }

    // Calculate sum of squares for Right channel if it exists
    if (filteredR) {
        // Ensure we don't read past the end of filteredR (should be same length ideally)
        const endSampleR = Math.min(start + blockSamples, filteredR.length);
        for (let i = start; i < endSampleR; i++) {
             const sR = filteredR[i];
             sumR += sR * sR;
        }
    }

    // Calculate mean square energy for each channel
    const msL = actualSamplesInBlock > 0 ? sumL / blockSamples : 0;
    const msR = (filteredR && actualSamplesInBlock > 0) ? sumR / blockSamples : 0;

    // Store the SUMMED energy (G = 1.0 for L/R channels according to BS.1770-4 Table 1)
    const summedMS = msL + msR;
    energies[b] = summedMS;

    // Calculate momentary LKFS based on the summed energy
    const lkfs = energyToLKFS(summedMS);
    lkfsPerBlock[b] = lkfs;

    if (isFinite(lkfs)) {
         if (lkfs < minLKFS) minLKFS = lkfs;
         if (lkfs > maxLKFS) maxLKFS = lkfs;
    }
    
    // Calculate short-term loudness (3-second windows) at appropriate intervals
    // Short-term values are calculated every 100ms but use 3-second windows
    if (b % Math.round(100/hopMs) === 0) { // Every 100ms
      // For each 3-second window, calculate the summed energy
      const stStartSample = Math.max(0, start - shortTermBlockSamples + blockSamples);
      const stEndSample = start + blockSamples;
      
      if (stEndSample - stStartSample >= shortTermBlockSamples/2) { // Only proceed if we have at least half a window
        let stSumL = 0;
        let stSumR = 0;
        let stCount = 0;
        
        // Sum over the 3-second window
        for (let i = stStartSample; i < stEndSample; i++) {
          if (i < filteredL.length) {
            const sL = filteredL[i];
            stSumL += sL * sL;
            stCount++;
          }
        }
        
        // Process right channel if it exists
        if (filteredR) {
          for (let i = stStartSample; i < stEndSample; i++) {
            if (i < filteredR.length) {
              const sR = filteredR[i];
              stSumR += sR * sR;
            }
          }
        }
        
        // Calculate mean and store if we have enough samples
        if (stCount > 0) {
          const stMsL = stSumL / stCount;
          const stMsR = filteredR ? stSumR / stCount : 0;
          const stSummedMS = stMsL + stMsR;
          
          // Store for LRA calculation
          shortTermEnergies.push(stSummedMS);
        }
      }
    }
    
    // Simple progress indicator for long files
    if (b > 0 && b % 1000 === 0) {
        console.log(`...processed ${b} / ${numBlocks} blocks`);
    }
  }
  console.log("Finished calculating block energies.");

  // Final min/max check
  if (minLKFS === Infinity) minLKFS = -Infinity;
  if (maxLKFS === -Infinity) maxLKFS = -Infinity;

  /* 3.  integrated loudness with gating (using SUMMED energies) ======== */
  console.log("Calculating integrated loudness...");
  
  // Stage 1: Calculate mean square energy of all 400ms blocks above absolute threshold
  const absGateThreshold = -70.0; // -70 LUFS absolute gate
  
  // First, filter blocks above the absolute threshold
  const blocksAboveAbsGate = energies.filter(e => energyToLKFS(e) > absGateThreshold);
  
  if (blocksAboveAbsGate.length === 0) {
    console.log("No blocks above absolute threshold (-70 LUFS)");
    return {
      lkfsPerBlock, energies, integrated: null, threshold: null,
      minLKFS, maxLKFS, hopSamples, blockSamples, numBlocks, sampleRate: Fs,
      loudnessRange: null, lraThreshold: null, lraLow: null, lraHigh: null
    };
  }
  
  // Calculate the average energy of blocks above absolute gate
  const meanEnergyAbsGate = blocksAboveAbsGate.reduce((sum, e) => sum + e, 0) / blocksAboveAbsGate.length;
  
  // Convert to LUFS to get the threshold
  const absoluteThresholdLUFS = energyToLKFS(meanEnergyAbsGate);
  
  // Stage 2: Calculate the relative threshold by subtracting 10 LU from the absolute threshold
  const relativeThresholdLUFS = absoluteThresholdLUFS - 10.0;
  
  // Filter blocks above the relative threshold
  const blocksAboveRelGate = blocksAboveAbsGate.filter(e => energyToLKFS(e) > relativeThresholdLUFS);
  
  let overallIntegrated = null;
  
  if (blocksAboveRelGate.length > 0) {
    // Calculate the mean energy of blocks above relative gate
    const meanEnergyRelGate = blocksAboveRelGate.reduce((sum, e) => sum + e, 0) / blocksAboveRelGate.length;
    
    // Convert to LUFS for final integrated loudness
    overallIntegrated = energyToLKFS(meanEnergyRelGate);
  }
  
  console.log("Finished integrated loudness calculation.");
  
  /* 4. Calculate Loudness Range (LRA) =================================== */
  console.log("Calculating loudness range (LRA)...");
  
  let loudnessRange = null;
  let lraThreshold = null;
  let lraLow = null;
  let lraHigh = null;
  
  if (shortTermEnergies.length > 0) {
    // Convert short term energies to LUFS values
    const shortTermLUFSValues = shortTermEnergies.map(energy => energyToLKFS(energy));
    
    // Apply absolute gate at -70 LUFS
    const stAbove70 = shortTermLUFSValues.filter(lufs => lufs > -70);
    
    if (stAbove70.length > 0) {
      // Calculate mean of values above absolute gate
      const stMeanAbove70 = stAbove70.reduce((sum, lufs) => sum + lufs, 0) / stAbove70.length;
      
      // Calculate relative threshold for LRA: -20 LU relative to mean
      // Different from integrated loudness gate which uses -10 LU
      lraThreshold = stMeanAbove70 - 20;
      
      // Filter for values above LRA threshold
      const stAboveRelThreshold = stAbove70.filter(lufs => lufs > lraThreshold);
      
      if (stAboveRelThreshold.length > 0) {
        // Sort the remaining values
        stAboveRelThreshold.sort((a, b) => a - b);
        
        // Get 10th and 95th percentiles
        const lowerIndex = Math.floor(stAboveRelThreshold.length * 0.1);
        const upperIndex = Math.floor(stAboveRelThreshold.length * 0.95);
        
        lraLow = stAboveRelThreshold[lowerIndex];
        lraHigh = stAboveRelThreshold[upperIndex];
        
        // Calculate LRA (difference between 10th and 95th percentiles)
        loudnessRange = lraHigh - lraLow;
      }
    }
  }
  
  console.log("Finished loudness range calculation.");

  // Note: For surround (e.g., 5.1), the summing would be: L + R + C + (1.41*Ls) + (1.41*Rs). LFE is ignored.
  // This implementation correctly handles Mono (sums only L) and Stereo (sums L+R).

  return {
    lkfsPerBlock, // Momentary based on summed energy
    energies,     // Summed energy per block
    integrated: overallIntegrated, // Integrated based on summed energy
    threshold: relativeThresholdLUFS, // Gating threshold used for integrated loudness
    minLKFS, // Min/Max of the lkfsPerBlock values
    maxLKFS,
    loudnessRange, // Loudness range in LU
    lraThreshold, // Threshold used for LRA calculation
    lraLow,      // Lower bound (10th percentile)
    lraHigh,     // Upper bound (95th percentile)
    hopSamples,
    blockSamples,
    numBlocks,
    sampleRate: Fs
  };
}

/**
 * Calculates integrated LUFS for a selected time range from pre-calculated results.
 * @param {Object} lufsResult - The result object from calculateLKFSInternal.
 * @param {number} startTime - Start time in seconds.
 * @param {number} endTime - End time in seconds.
 * @returns {{integrated: number|null, peak: number|null}} Object containing integrated and peak LUFS for the range.
 */
function calculateLufsStatsForRange(lufsResult, startTime, endTime) {
    const stats = { integrated: null, peak: -Infinity };
    if (!lufsResult || !lufsResult.energies || typeof startTime !== 'number' || typeof endTime !== 'number' || endTime < startTime) {
        return stats;
    }

    const { energies, lkfsPerBlock, hopSamples, sampleRate, numBlocks } = lufsResult;
    if (numBlocks === 0 || !sampleRate || sampleRate <= 0 || !hopSamples || hopSamples <= 0) {
        return stats; // Cannot calculate if basic parameters are invalid
    }

    const durationPerHop = hopSamples / sampleRate;

    // Index calculation needs to be precise for filtering
    const firstBlockIndex = Math.max(0, Math.ceil(startTime / durationPerHop));
    // Include blocks whose start time is strictly less than endTime
    const endBlockIndex = Math.max(0, Math.floor(endTime / durationPerHop));

    // Ensure indices are within bounds and start <= end
    const validStartIdx = Math.min(firstBlockIndex, numBlocks - 1);
    const validEndIdx = Math.min(endBlockIndex, numBlocks - 1);

    // If the calculated range is invalid (e.g., startTime >= duration), return null
    if (validStartIdx > validEndIdx || validStartIdx >= numBlocks ) {
        return stats;
    }

    // Filter energies and find peak LKFS for the selected range of blocks
    const selectedEnergies = [];
    let peakLufsInRange = -Infinity;
    for (let i = validStartIdx; i <= validEndIdx; i++) {
        if (i < energies.length) { // Ensure index is valid
            selectedEnergies.push(energies[i]);
            const lkfs = lkfsPerBlock[i];
            if (isFinite(lkfs) && lkfs > peakLufsInRange) {
                peakLufsInRange = lkfs;
            }
        }
    }

    if (selectedEnergies.length === 0) {
        return stats; // No blocks in the range
    }

    // Apply the gating logic to the selected energies for integrated LUFS
    stats.integrated = calculateOverallIntegratedLKFS(selectedEnergies);
    stats.peak = isFinite(peakLufsInRange) ? peakLufsInRange : null; // Return null if no finite peak found

    return stats;
}


// --- Charting Functions ---

/**
 * Creates or updates the LUFS comparison chart with data from both files.
 */
function plotLufsComparisonChart() {
    const canvas = lufsState.dom.lufsComparisonCanvas;
    if (!canvas) return; // No canvas

    const results1 = lufsState.results.file1;
    const results2 = lufsState.results.file2;
    const chartKey = 'comparisonChart';
    const filename1 = window.AudioEngine?.state?.filenames?.file1 || 'File 1';
    const filename2 = window.AudioEngine?.state?.filenames?.file2 || 'File 2';

    const datasets = [];

    // Function to prepare data for a single file
    const prepareChartData = (results) => {
        if (!results || results.numBlocks === 0) return [];
        const { lkfsPerBlock, hopSamples, sampleRate, numBlocks } = results;
        const chartData = [];
        const timeStep = hopSamples / sampleRate;
        for (let i = 0; i < numBlocks; i++) {
            const time = i * timeStep;
            const lufs = lkfsPerBlock[i];
            chartData.push({ x: time, y: isFinite(lufs) ? lufs : null });
        }
        return chartData;
    };

    // Add dataset for File 1 if available
    if (results1 && results1.numBlocks > 0) {
        datasets.push({
            label: filename1,
            data: prepareChartData(results1),
            borderColor: chartColors.file1,
            backgroundColor: chartColors.file1.replace('1.0', '0.1'),
            borderWidth: 1,
            pointRadius: 0, pointHitRadius: 3, tension: 0.1, fill: false, spanGaps: true
        });
    }

    // Add dataset for File 2 if available
    if (results2 && results2.numBlocks > 0) {
         datasets.push({
            label: filename2,
            data: prepareChartData(results2),
            borderColor: chartColors.file2,
            backgroundColor: chartColors.file2.replace('1.0', '0.1'),
            borderWidth: 1,
            pointRadius: 0, pointHitRadius: 3, tension: 0.1, fill: false, spanGaps: true
        });
    }

    // Destroy existing chart if no data to plot
    if (datasets.length === 0) {
        if (lufsState.charts[chartKey]) {
            lufsState.charts[chartKey].destroy();
            lufsState.charts[chartKey] = null;
        }
        // Optionally clear canvas or show message
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center'; ctx.font = '14px Arial';
        ctx.fillText('No LUFS Data', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Define chart plugins for playhead and hover line
    const playheadLinePlugin = getPlayheadLinePlugin();
    const hoverLinePlugin = getHoverLinePlugin();

    const chartConfig = {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            parsing: false, normalized: true,
            scales: {
                x: {
                    type: 'linear', title: { display: false },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)', maxRotation: 0, autoSkipPadding: 15,
                         callback: (value) => window.AudioEngine.formatTime(value)
                    }
                },
                y: {
                    min: window.AppConfig.LUFS_MIN_DISPLAY ?? -40,
                    max: window.AppConfig.LUFS_MAX_DISPLAY ?? 0,
                    title: { display: true, text: 'Momentary LUFS', color: 'rgba(255, 255, 255, 0.9)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                }
            },
            plugins: {
                legend: { display: datasets.length > 1, position: 'top', labels: { color: 'rgba(255, 255, 255, 0.9)' } },
                tooltip: {
                    callbacks: {
                        title: (context) => {
                            if (!context || !context[0] || context[0].parsed === undefined) return '';
                            return `Time: ${window.AudioEngine.formatTime(context[0].parsed.x)}`;
                        },
                        label: (context) => {
                             const label = context.dataset.label || '';
                             const value = context.parsed.y;
                             const formattedVal = (value !== null && isFinite(value)) ? `${value.toFixed(1)} LUFS` : 'N/A';
                             return `${label}: ${formattedVal}`;
                        }
                    }
                }
            }
        },
        plugins: [playheadLinePlugin, hoverLinePlugin]
    };

    // Create or update chart
    if (lufsState.charts[chartKey]) {
        lufsState.charts[chartKey].data = chartConfig.data;
        lufsState.charts[chartKey].options = chartConfig.options;
        lufsState.charts[chartKey].plugins = chartConfig.plugins;
        lufsState.charts[chartKey].update('none');
    } else {
        lufsState.charts[chartKey] = new Chart(canvas, chartConfig);
    }
}

/**
 * Creates or updates the LUFS Difference chart.
 */
function plotLufsDifferenceChart() {
    const canvas = lufsState.dom.lufsDifferenceCanvas;
    if (!canvas) return; // No canvas

    const results1 = lufsState.results.file1;
    const results2 = lufsState.results.file2;
    const chartKey = 'lufsDifferenceChart';

    // Require both results to calculate difference
    if (!results1 || results1.numBlocks === 0 || !results2 || results2.numBlocks === 0) {
        if (lufsState.charts[chartKey]) {
            lufsState.charts[chartKey].destroy();
            lufsState.charts[chartKey] = null;
        }
        // Clear canvas or show message
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center'; ctx.font = '14px Arial';
        ctx.fillText('Requires LUFS data for both files', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Assume same time base / hop size for simplicity
    const numBlocks = Math.min(results1.numBlocks, results2.numBlocks);
    const hopSamples = results1.hopSamples;
    const sampleRate = results1.sampleRate;
    const timeStep = hopSamples / sampleRate;
    const diffData = [];

    for (let i = 0; i < numBlocks; i++) {
        const time = i * timeStep;
        const lufs1 = results1.lkfsPerBlock[i];
        const lufs2 = results2.lkfsPerBlock[i];
        let diff = null;

        // Only calculate diff if both values are finite
        if (isFinite(lufs1) && isFinite(lufs2)) {
            // Invert difference: File 2 - File 1
            diff = lufs2 - lufs1; 
        }
        diffData.push({ x: time, y: diff });
    }

    const dataset = {
        // Update label to reflect inverted difference
        label: 'LUFS Difference (File 2 - File 1)',
        data: diffData,
        borderColor: chartColors.difference, // Use a difference color
        backgroundColor: chartColors.difference.replace('1.0', '0.1'),
        borderWidth: 1,
        pointRadius: 0, pointHitRadius: 3, tension: 0.1, fill: false, spanGaps: true
    };

    // Re-use plugins from comparison chart
    const playheadLinePlugin = getPlayheadLinePlugin();
    const hoverLinePlugin = getHoverLinePlugin();

    const chartConfig = {
        type: 'line',
        data: { datasets: [dataset] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            parsing: false, normalized: true,
            scales: {
                x: {
                    type: 'linear', title: { display: false },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)', maxRotation: 0, autoSkipPadding: 15,
                         callback: (value) => window.AudioEngine.formatTime(value)
                    }
                },
                y: {
                    // Set reasonable min/max for difference, e.g., -20 to +20 LU
                    min: -20,
                    max: 20,
                    title: { display: true, text: 'Difference (LU)', color: 'rgba(255, 255, 255, 0.9)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                }
            },
            plugins: {
                legend: { display: false }, // Only one dataset
                tooltip: {
                    callbacks: {
                        title: (context) => {
                            if (!context || !context[0] || context[0].parsed === undefined) return '';
                            return `Time: ${window.AudioEngine.formatTime(context[0].parsed.x)}`;
                        },
                        label: (context) => {
                             const value = context.parsed.y;
                             const formattedVal = (value !== null && isFinite(value)) ? `${value.toFixed(1)} LU` : 'N/A';
                             return `Difference: ${formattedVal}`;
                        }
                    }
                }
            }
        },
        plugins: [playheadLinePlugin, hoverLinePlugin]
    };

    // Create or update chart
    if (lufsState.charts[chartKey]) {
        lufsState.charts[chartKey].data = chartConfig.data;
        lufsState.charts[chartKey].options = chartConfig.options;
        lufsState.charts[chartKey].plugins = chartConfig.plugins;
        lufsState.charts[chartKey].update('none');
    } else {
        lufsState.charts[chartKey] = new Chart(canvas, chartConfig);
    }
}

/** Helper function to get the playhead plugin config (to avoid duplication) */
function getPlayheadLinePlugin() {
    return {
        id: 'playheadLine',
        beforeDraw: (chart) => {
            const audioState = window.AudioEngine?.state;
            if (!audioState) return;
            
            const currentTime = window.AudioEngine.getCurrentTime();
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            
            // Get x pixel position for current time
            const x = xScale.getPixelForValue(currentTime);
            
            // Only draw if time is within chart bounds
            if (x >= chart.chartArea.left && x <= chart.chartArea.right) {
                const ctx = chart.ctx;
                // Draw play head line
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chart.chartArea.top);
                ctx.lineTo(x, chart.chartArea.bottom);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.stroke();
                ctx.restore();
            }
            
            // Draw loop region if active
            if (audioState.loopMode && audioState.loopStart !== audioState.loopEnd) {
                const startX = xScale.getPixelForValue(audioState.loopStart);
                const endX = xScale.getPixelForValue(audioState.loopEnd);
                
                // Only draw if region is visible
                if (startX <= chart.chartArea.right && endX >= chart.chartArea.left) {
                    const ctx = chart.ctx;
                    ctx.save();
                    // Fill loop region
                    ctx.fillStyle = 'rgba(64, 224, 208, 0.15)';
                    const left = Math.max(chart.chartArea.left, startX);
                    const right = Math.min(chart.chartArea.right, endX);
                    ctx.fillRect(left, chart.chartArea.top, right - left, chart.chartArea.bottom - chart.chartArea.top);
                    // Draw loop boundaries
                    ctx.beginPath();
                    ctx.moveTo(startX, chart.chartArea.top);
                    ctx.lineTo(startX, chart.chartArea.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(64, 255, 64, 0.5)';
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(endX, chart.chartArea.top);
                    ctx.lineTo(endX, chart.chartArea.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255, 64, 64, 0.5)';
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    };
}

/** Helper function to get the hover line plugin config (to avoid duplication) */
function getHoverLinePlugin() {
    return {
        id: 'hoverLine',
        beforeDraw: (chart) => {
            // Only draw hover line if we're not dragging
            if (!lufsState.hoverState.isHovering || chartDragState.isDragging) return;
            
            const ctx = chart.ctx;
            const xScale = chart.scales.x; // Need xScale to check bounds
            const xPixel = lufsState.hoverState.x;

            // Only draw if x is within chart area
            if (xPixel >= chart.chartArea.left && xPixel <= chart.chartArea.right) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xPixel, chart.chartArea.top);
                ctx.lineTo(xPixel, chart.chartArea.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.restore();
            }
        }
    };
}

/**
 * Updates the text display in the loudness statistics panel.
 * @param {number} startTime - Start of the time range in seconds.
 * @param {number} endTime - End of the time range in seconds.
 * @param {number} currentTime - The current playhead time in seconds.
 */
function updateLoudnessStats(startTime, endTime, currentTime) {
    const updateStat = (element, value, unit = ' LUFS') => {
        if (!element) return;
        if (value !== null && isFinite(value)) {
            element.textContent = value.toFixed(1);
            // Remove color class logic
            element.className = 'stats-value'; // Reset class
            // if (value > -14) element.classList.add('lufs-loud');
            // else if (value < -24) element.classList.add('lufs-warn');
            // else element.classList.add('lufs-ok');
        } else {
            element.textContent = '--.-';
            element.className = 'stats-value'; // Reset class
        }
    };

    // Calculate stats for File 1
    const stats1 = calculateLufsStatsForRange(lufsState.results.file1, startTime, endTime);
    updateStat(lufsState.dom.statIntegrated1, stats1.integrated);
    updateStat(lufsState.dom.statPeak1, stats1.peak);

    // Update EBU R128 additional stats for File 1
    const result1 = lufsState.results.file1;
    if (result1) {
        updateStat(lufsState.dom.statThreshold1, result1.threshold);
        updateStat(lufsState.dom.statLRA1, result1.loudnessRange, ' LU');
        updateStat(lufsState.dom.statLRALow1, result1.lraLow);
        updateStat(lufsState.dom.statLRAHigh1, result1.lraHigh);
        updateStat(lufsState.dom.statLRAThreshold1, result1.lraThreshold);
    } else {
        updateStat(lufsState.dom.statThreshold1, null);
        updateStat(lufsState.dom.statLRA1, null, ' LU');
        updateStat(lufsState.dom.statLRALow1, null);
        updateStat(lufsState.dom.statLRAHigh1, null);
        updateStat(lufsState.dom.statLRAThreshold1, null);
    }

    // Calculate stats for File 2
    const stats2 = calculateLufsStatsForRange(lufsState.results.file2, startTime, endTime);
    updateStat(lufsState.dom.statIntegrated2, stats2.integrated);
    updateStat(lufsState.dom.statPeak2, stats2.peak);
    
    // Update EBU R128 additional stats for File 2
    const result2 = lufsState.results.file2;
    if (result2) {
        updateStat(lufsState.dom.statThreshold2, result2.threshold);
        updateStat(lufsState.dom.statLRA2, result2.loudnessRange, ' LU');
        updateStat(lufsState.dom.statLRALow2, result2.lraLow);
        updateStat(lufsState.dom.statLRAHigh2, result2.lraHigh);
        updateStat(lufsState.dom.statLRAThreshold2, result2.lraThreshold);
    } else {
        updateStat(lufsState.dom.statThreshold2, null);
        updateStat(lufsState.dom.statLRA2, null, ' LU');
        updateStat(lufsState.dom.statLRALow2, null);
        updateStat(lufsState.dom.statLRAHigh2, null);
        updateStat(lufsState.dom.statLRAThreshold2, null);
    }

    // Get current momentary LUFS based on selected source
    const selectedSource = window.AudioEngine?.state?.selectedSource || 1;
    const currentLufs = getMomentaryLufsAtTime(selectedSource, currentTime);
    updateStat(lufsState.dom.statCurrent, currentLufs);
}


// --- Math/DSP Helpers (Copied from provided code, unchanged unless necessary) ---

/* --- biquad design (BS.1770-4 K-Weighting) -------------------------- */

/**
 * Designs the first stage K-weighting filter (high-shelf)
 * Coefficients derived from BS.1770-4 specification via bilinear transform.
 * Corresponds to the filter described in libebur128.
 * @param {number} Fs Sample rate
 * @returns {object} Filter coefficients { b: [b0, b1, b2], a: [a0, a1, a2] }
 */
function designKGainShelf(Fs) {
    const f0 = 1681.974450955533; // Center frequency
    const G = 3.999843853973347;  // Gain in dB
    const Q = 0.7071752369554196; // Quality factor

    const K = Math.tan(Math.PI * f0 / Fs);
    const Vh = Math.pow(10.0, G / 20.0);
    const Vb = Math.pow(Vh, 0.4996667741545416); // Vb = sqrt(Vh)

    const a0_ = 1.0 + K / Q + K * K;
    const b0 = (Vh + Vb * K / Q + K * K) / a0_;
    const b1 = 2.0 * (K * K - Vh) / a0_;
    const b2 = (Vh - Vb * K / Q + K * K) / a0_;
    const a1 = 2.0 * (K * K - 1.0) / a0_;
    const a2 = (1.0 - K / Q + K * K) / a0_;

    // Return in the format expected by applyBiquad (a0 is normalized to 1)
    return { b: [b0, b1, b2], a: [1, a1, a2] };
}

/**
 * Designs the second stage K-weighting filter (high-pass)
 * Coefficients derived from BS.1770-4 specification via bilinear transform.
 * Corresponds to the filter described in libebur128.
 * @param {number} Fs Sample rate
 * @returns {object} Filter coefficients { b: [b0, b1, b2], a: [a0, a1, a2] }
 */
function designKHighPass(Fs) {
    const f0 = 38.13547087602444;  // Center frequency
    const Q = 0.5003270373238773;  // Quality factor

    const K = Math.tan(Math.PI * f0 / Fs);
    
    const b0 = 1.0;
    const b1 = -2.0;
    const b2 = 1.0;
    const a0_ = 1.0 + K / Q + K * K;
    const a1 = 2.0 * (K * K - 1.0) / a0_;
    const a2 = (1.0 - K / Q + K * K) / a0_;

    // Return in the format expected by applyBiquad (a0 is normalized to 1)
    // Note: Original libebur128 combines these, but applying separately is fine.
    // The coefficients here are for the high-pass stage alone.
    // We need to normalize the 'b' coefficients as well if a0_ wasn't 1.
    return { 
        b: [b0 / a0_, b1 / a0_, b2 / a0_], 
        a: [1, a1, a2] 
    };
}


/* --- biquad runner --------------------------------------------------- */
function applyBiquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    // Ensure finite numbers going into calculation
    const safe_xn = isFinite(xn) ? xn : 0;
    const safe_x1 = isFinite(x1) ? x1 : 0;
    const safe_x2 = isFinite(x2) ? x2 : 0;
    const safe_y1 = isFinite(y1) ? y1 : 0;
    const safe_y2 = isFinite(y2) ? y2 : 0;

    // Difference equation: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    const yn = b[0] * safe_xn + b[1] * safe_x1 + b[2] * safe_x2 - a[1] * safe_y1 - a[2] * safe_y2;

    y[n] = isFinite(yn) ? yn : 0; // Store zero if calculation results in NaN/Infinity
    
    // Update state variables for next iteration
    x2 = safe_x1; x1 = safe_xn; 
    y2 = safe_y1; y1 = y[n]; 
  }
  return y;
}


/* --- energy→LKFS and gating ------------------------------------------ */
function energyToLKFS(ms) {
  if (ms <= 0) return -Infinity; // Handle non-positive energy directly
  // –0.691 dB normalisation per ITU spec
  return -0.691 + 10 * Math.log10(ms);
}

/**
 * Calculates integrated LKFS using the two-stage gating process.
 * Can be used for overall loudness or on a subset of energies for range loudness.
 * @param {Float32Array | Array<number>} energies - Array of mean square energy values for blocks.
 * @returns {number | null} Integrated LKFS or null if silence/no valid blocks.
 */
function calculateOverallIntegratedLKFS(energies) {
    if (!energies || energies.length === 0) return null;

    /* absolute gate –70 LUFS */
    const kept1 = energies.filter(e => energyToLKFS(e) > -70);
    if (!kept1.length) return null; // pure silence or all blocks below -70

    const sum1 = kept1.reduce((a, b) => a + b, 0);
    const mean1 = sum1 / kept1.length;
    // Calculate the gating threshold based on the mean energy of blocks passing the absolute gate
    const gatingThresholdAbsolute = energyToLKFS(mean1); // This is Γ_abs in LUFS

    /* relative gate: –10 LU */
    const relativeThreshold = gatingThresholdAbsolute - 10; // This is Γ_rel in LUFS
    const kept2 = kept1.filter(e => energyToLKFS(e) > relativeThreshold);

    if (!kept2.length) {
        // If no blocks pass the relative gate, the standard implies the result is effectively undefined or silent.
        // Returning null is appropriate.
        return null;
    }
    const sum2 = kept2.reduce((a, b) => a + b, 0);
    const mean2 = sum2 / kept2.length;

    // Apply the final offset to the mean energy after gating
    const integrated = -0.691 + 10 * Math.log10(mean2 + 1e-20); // Add epsilon here before log

    // Return null if result is not finite (shouldn't happen with epsilon, but safeguard)
    return isFinite(integrated) ? integrated : null;
}

// --- Export public API on window.LufsCalculator ---
window.LufsCalculator = {
    init: initLufsAnalysis,
    calculateLufs,
    updateLufsUI,
    getMomentaryLufsAtTime,
    swapLufsData,
    state: lufsState,
    // Export these for debugging/verification
    energyToLKFS,
    calculateOverallIntegratedLKFS
};

// Add placeholder config values if not present
window.AppConfig = window.AppConfig || {};
window.AppConfig.LUFS_MIN_DISPLAY = window.AppConfig.LUFS_MIN_DISPLAY ?? -40;
window.AppConfig.LUFS_MAX_DISPLAY = window.AppConfig.LUFS_MAX_DISPLAY ?? 0;
