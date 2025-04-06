// spectrum.js - Handles frequency spectrum analysis from time range selection

// --- Spectrum Analysis State ---
const spectrumState = {
    timeRange: {
        start: 0,
        end: 0
    },
    charts: {
        comparison: null,
        difference: null
    },
    data: {
        file1: null,
        file2: null,
        difference: null
    },
    dom: { // Added to store relevant DOM elements
        diffChartSection: null
    },
    initialized: false
};

// --- Chart Colors ---
const chartColors = {
    file1: 'rgba(65, 105, 225, 1.0)', // Royal Blue (Opaque)
    file2: 'rgba(255, 99, 71, 1.0)',  // Tomato Red (Opaque)
    positive: 'rgba(255, 99, 71, 1.0)', // Red for positive differences (Opaque)
    negative: 'rgba(65, 105, 225, 1.0)' // Blue for negative differences (Opaque)
};

// --- Public API ---

// Initialize spectrum analysis
function initSpectrumAnalysis() {
    // Only initialize once
    if (spectrumState.initialized) {
        return;
    }
    
    // Get the DOM element for the difference chart section
    spectrumState.dom.diffChartSection = document.querySelector('.spectrum-diff-chart-section');
    if (!spectrumState.dom.diffChartSection) {
        console.error("Could not find the difference chart section element.");
    }
    
    // Charts are created dynamically in updateCharts now
    
    spectrumState.initialized = true;
    console.log("Spectrum analysis initialized");
}

// Update the selected time range and recompute/plot spectrum data
function updateTimeRange(start, end) {
    // Make sure we have valid values
    if (typeof start !== 'number' || typeof end !== 'number') {
        console.warn("Invalid time range values", start, end);
        return;
    }
    
    // Update state
    spectrumState.timeRange.start = start;
    spectrumState.timeRange.end = end;
    
    // Update the displayed time range (now handled in UI's updateTimeDisplay function)
    // Let UI controller know we need to update the display
    if (window.UIController && window.UIController.updateUI) {
        window.UIController.updateUI(); // This mainly updates the text display
    }
    
    // Recompute and update charts based on available spectrograms
    computeAndPlotSpectra(); // Use the unified function
}

// Compute average spectrum from a spectrogram within the selected time range
function computeAverageSpectrum(spectrogramData) {
    if (!spectrogramData || !spectrogramData.data || spectrogramData.data.length === 0) {
        console.warn("No spectrogram data available to compute average");
        return null;
    }
    
    // Use parameters stored within the spectrogram data
    const { data, sampleRate, numFreqBinsUsed, numTimeSteps } = spectrogramData;
    
    // Convert time range to indices in the spectrogram data
    const duration = window.AudioEngine?.state?.duration; // Get duration safely
    if (!duration || duration <= 0) {
        console.warn("Audio duration not available or invalid for time range conversion.");
        return new Float32Array(numFreqBinsUsed); // Return zeros
    }
    
    const startIdx = Math.floor((spectrumState.timeRange.start / duration) * numTimeSteps);
    const endIdx = Math.floor((spectrumState.timeRange.end / duration) * numTimeSteps);
    
    const validStartIdx = Math.max(0, Math.min(startIdx, numTimeSteps - 1));
    const validEndIdx = Math.max(validStartIdx, Math.min(endIdx, numTimeSteps - 1));
    
    const avgSpectrum = new Float32Array(numFreqBinsUsed);
    
    // Handle case where start/end indices are the same or invalid range
    if (validEndIdx <= validStartIdx) {
        // If it's a single frame selection, return that frame's data directly (converted to dB)
        if (validStartIdx < numTimeSteps && data[validStartIdx]) {
             for (let f = 0; f < numFreqBinsUsed; f++) {
                 if (f < data[validStartIdx].length) {
                     avgSpectrum[f] = data[validStartIdx][f]; // Data is already dBFS
                 } else {
                     avgSpectrum[f] = -Infinity; // Or a very low dB value
                 }
             }
             console.warn("Time range resulted in single frame, returning its spectrum.");
             return avgSpectrum;
        } else {
            console.warn("Invalid time range for spectrum computation, returning zeros.", {start: spectrumState.timeRange.start, end: spectrumState.timeRange.end, duration, startIdx, endIdx, validStartIdx, validEndIdx});
            return avgSpectrum; // Return zeros
        }
    }
    
    const linearAccumulator = new Float32Array(numFreqBinsUsed).fill(0);
    let frameCount = 0;
    
    for (let t = validStartIdx; t <= validEndIdx; t++) {
        // Check if data[t] exists 
        if (data[t]) {
            frameCount++;
            for (let f = 0; f < numFreqBinsUsed; f++) {
                if (f < data[t].length) { // Ensure frequency bin exists
                    // Convert dBFS back to linear for averaging
                    const linearValue = Math.pow(10, data[t][f] / 20);
                    linearAccumulator[f] += linearValue;
                }
            }
        }
    }
    
    if (frameCount === 0) {
        console.warn("No valid frames found in the selected time range.");
        return avgSpectrum; // Return zeros
    }
    
    // Average the linear values and convert back to dBFS
    for (let f = 0; f < numFreqBinsUsed; f++) {
        const linearAvg = linearAccumulator[f] / frameCount;
        // Add a small epsilon to prevent log10(0)
        avgSpectrum[f] = 20 * Math.log10(linearAvg + 1e-10); 
    }
    
    return avgSpectrum;
}

// Generate frequency labels and bin positions for x-axis
function generateFrequencyScale(sampleRate, fftSize, numFreqBinsUsed) {
    if (!sampleRate || !fftSize) {
        console.warn("Cannot generate frequency scale without sampleRate and fftSize");
        return { freqValues: [], labels: [] };
    }
    
    const freqValues = [];
    const labels = [];
    const keyFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const freqStep = sampleRate / fftSize;
    
    // Store the index associated with each key frequency label to avoid duplicates
    const labelIndexMap = {};

    // Generate up to numFreqBinsUsed
    for (let i = 0; i < numFreqBinsUsed; i++) {
        const binFreq = (i * sampleRate) / fftSize; 
        freqValues.push(binFreq);
        
        let label = "";
        let closestKeyFreq = -1;
        let minDiff = Infinity;

        // Find the closest key frequency below the max analysis frequency
        for (const keyFreq of keyFreqs) {
            if (keyFreq <= window.AppConfig.ANALYSIS_MAX_FREQ) {
                 const diff = Math.abs(binFreq - keyFreq);
                 if (diff < minDiff) {
                     minDiff = diff;
                     closestKeyFreq = keyFreq;
                 }
            }
        }

        // Only label if this bin is the closest one to that key frequency (within half a bin width)
        if (closestKeyFreq !== -1 && minDiff <= freqStep / 2) { 
             let keyLabel;
             if (closestKeyFreq >= 1000) {
                 keyLabel = (closestKeyFreq / 1000) + "K";
             } else {
                 keyLabel = closestKeyFreq.toString();
             }
             // Check if this label has already been assigned to a closer index
             if (!labelIndexMap.hasOwnProperty(keyLabel) || labelIndexMap[keyLabel] === i) {
                 label = keyLabel;
                 labelIndexMap[keyLabel] = i; // Mark this index as the one for this label
             } else {
                // If another index was closer to this key freq, don't label this one
             }
        }
        labels.push(label);
    }
    
    return { freqValues, labels };
}

// Compute the difference between two spectra
function computeSpectrumDifference(spectrum1, spectrum2) {
    if (!spectrum1 || !spectrum2) {
        console.warn("Missing spectrum data for difference calculation");
        return null;
    }
    
    const numFreqBinsUsed = Math.min(spectrum1.length, spectrum2.length);
    const diffSpectrum = new Float32Array(numFreqBinsUsed);
    
    for (let f = 0; f < numFreqBinsUsed; f++) {
        // Ensure both values are valid numbers before subtracting
        const val1 = (typeof spectrum1[f] === 'number' && isFinite(spectrum1[f])) ? spectrum1[f] : -Infinity;
        const val2 = (typeof spectrum2[f] === 'number' && isFinite(spectrum2[f])) ? spectrum2[f] : -Infinity;
        
        // Handle infinities gracefully - difference is 0 if both are -Infinity
        if (val1 === -Infinity && val2 === -Infinity) {
            diffSpectrum[f] = 0;
        } else if (val1 === -Infinity) {
            diffSpectrum[f] = Infinity; // Or a large positive number if preferred
        } else if (val2 === -Infinity) {
            diffSpectrum[f] = -Infinity; // Or a large negative number
        } else {
            diffSpectrum[f] = val2 - val1;
        }
    }
    
    return diffSpectrum;
}

// Compute available spectra based on loaded spectrograms and plot them
function computeAndPlotSpectra() {
    const spec1 = window.SpectrogramVisualizer?.state?.spectrograms?.file1;
    const spec2 = window.SpectrogramVisualizer?.state?.spectrograms?.file2;

    let computedSomething = false;

    // Reset existing data first
    spectrumState.data.file1 = null;
    spectrumState.data.file2 = null;
    spectrumState.data.difference = null;

    // Compute File 1 if spectrogram exists
    if (spec1) {
        spectrumState.data.file1 = computeAverageSpectrum(spec1);
        if (spectrumState.data.file1) {
            computedSomething = true;
            console.log("Average spectrum computed for File 1");
        }
    }

    // Compute File 2 and Difference if both spectrograms exist
    if (spec1 && spec2) {
        spectrumState.data.file2 = computeAverageSpectrum(spec2);
        // Ensure both file1 and file2 spectra were computed successfully
        if (spectrumState.data.file1 && spectrumState.data.file2) {
            spectrumState.data.difference = computeSpectrumDifference(
                spectrumState.data.file1,
                spectrumState.data.file2
            );
            computedSomething = true; // Already true if file1 computed, but be explicit
            console.log("Average spectrum computed for File 2 and Difference");
        } else {
             console.warn("Could not compute difference because one or both file spectra failed.");
             spectrumState.data.difference = null; // Ensure difference is null if computation failed
        }
    }

    // Only update charts if we actually computed something
    if (computedSomething) {
        console.log("Updating charts for time range:", 
            spectrumState.timeRange.start.toFixed(2), "-", 
            spectrumState.timeRange.end.toFixed(2));
        updateCharts();
    } else {
        console.log("No spectrograms available to compute spectra.");
        // Optionally clear charts or show a message if needed
    }
}


// Update chart data with computed spectra
function updateCharts() {
    // Check what data is available
    const hasFile1 = !!spectrumState.data.file1;
    const hasFile2 = !!spectrumState.data.file2;
    const hasDifference = !!spectrumState.data.difference;
    
    // Need parameters from at least one spectrogram for scale
    // Prioritize file1 if available, otherwise use file2
    const specParams = window.SpectrogramVisualizer?.state?.spectrograms?.file1 || 
                       window.SpectrogramVisualizer?.state?.spectrograms?.file2;
                       
    if (!hasFile1 && !hasFile2) {
        console.log("No spectrum data available to update charts.");
        // Optionally clear existing charts if needed
        if (spectrumState.charts.comparison) {
             spectrumState.charts.comparison.destroy();
             spectrumState.charts.comparison = null;
        }
         if (spectrumState.charts.difference) {
             spectrumState.charts.difference.destroy();
             spectrumState.charts.difference = null;
        }
        if (spectrumState.dom.diffChartSection) {
            spectrumState.dom.diffChartSection.classList.add('hidden');
        }
        return; // Nothing to plot
    }
                       
    if (!specParams || !specParams.sampleRate || !specParams.fftSize || !specParams.numFreqBinsUsed) {
        console.warn("Spectrogram parameters missing for chart update");
        return; // Cannot proceed without scale info
    }
    const { sampleRate, fftSize, numFreqBinsUsed } = specParams;
    
    // Generate frequency scale based on actual data parameters
    const { freqValues, labels } = generateFrequencyScale(sampleRate, fftSize, numFreqBinsUsed);

    // Get canvas elements
    const comparisonCanvas = document.getElementById('frequencySpectrumChart');
    const differenceCanvas = document.getElementById('spectralDifferenceChart');
    if (!comparisonCanvas || !differenceCanvas) {
         console.error("Comparison or Difference chart canvas not found.");
         return;
    }

    // --- Comparison Chart --- 
    const comparisonDatasets = [];
    const audioState = window.AudioEngine?.state; // Get audio state for filenames
    const filename1 = audioState?.filenames?.file1 || 'File 1';
    const filename2 = audioState?.filenames?.file2 || 'File 2';
    
    const mapData = (data) => Array.from(data)
                                    .map((y, i) => ({ x: freqValues[i], y: (isFinite(y) ? y : null) }));

    if (hasFile1) {
        comparisonDatasets.push({
            label: filename1, // Use filename
            data: mapData(spectrumState.data.file1),
            borderColor: chartColors.file1,
            backgroundColor: chartColors.file1.replace('1.0', '0.2'),
            borderWidth: 1, // Default to 1px width
            tension: 0, fill: false,
            pointRadius: 0, pointHitRadius: 5,
            spanGaps: true
        });
    }
    if (hasFile2) {
         comparisonDatasets.push({
            label: filename2, // Use filename
            data: mapData(spectrumState.data.file2),
            borderColor: chartColors.file2,
            backgroundColor: chartColors.file2.replace('1.0', '0.2'),
            borderWidth: 1, // Default to 1px width
            tension: 0, fill: false,
            pointRadius: 0, pointHitRadius: 5,
            spanGaps: true
        });
    }

    const comparisonData = { /* labels inferred */ datasets: comparisonDatasets };
    const comparisonOptions = {
        responsive: true, maintainAspectRatio: false, animation: false,
        parsing: false, // Important for performance with {x,y} data
        normalized: true, // Also good for performance
        elements: { point: { radius: 0 } },
        scales: {
            x: {
                type: 'logarithmic',
                min: window.AppConfig.SPECTRUM_MIN_FREQ,
                max: window.AppConfig.ANALYSIS_MAX_FREQ, 
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    // Revert to simpler callback for default log ticks, just format labels
                     callback: function(value, index, ticks) {
                        // Basic formatting for log ticks provided by Chart.js
                        if (value >= 1000) return (value / 1000).toFixed(value < 10000 ? 1 : 0) + 'K'; // Add K for kHz, adjust precision
                        if (value === 0) return '0'; // Handle 0 case if it appears
                        // You might add more specific checks if needed, e.g., for 20, 50, etc.
                        // Let Chart.js decide which ticks to show based on log scale.
                        // Return value directly for ticks below 1000 Hz or let Chart.js skip based on density.
                         return value.toString(); 
                    },
                    maxRotation: 0,
                    autoSkip: true, // Allow Chart.js to skip ticks to prevent overlap
                    maxTicksLimit: 15 // Limit density further if needed
                },
                 title: { display: false } // Title removed, axis implies frequency
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                title: { display: true, text: 'Level (dBFS)', color: 'rgba(255, 255, 255, 0.9)' },
                min: window.AppConfig.SPECTRUM_MIN_DB,
                max: window.AppConfig.SPECTRUM_MAX_DB
            }
        },
        plugins: {
            legend: {
                display: comparisonDatasets.length > 1, 
                position: 'top', labels: { color: 'rgba(255, 255, 255, 0.9)' } 
            },
            tooltip: {
                callbacks: {
                    title: (context) => `${formatFrequencyTooltip(context[0].parsed.x)} Hz`,
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) { label += ': '; }
                        if (context.parsed.y !== null) {
                            label += `${context.parsed.y.toFixed(2)} dB`;
                        } else {
                            label += 'No Data';
                        }
                        return label;
                    }
                }
            }
        }
    };

    // Update or create the comparison chart
    if (spectrumState.charts.comparison) {
        spectrumState.charts.comparison.data = comparisonData;
        spectrumState.charts.comparison.options = comparisonOptions;
        spectrumState.charts.comparison.update('none');
    } else if (hasFile1 || hasFile2) { // Only create if we have *any* data
        spectrumState.charts.comparison = new Chart(comparisonCanvas, { type: 'line', data: comparisonData, options: comparisonOptions });
    }

    // --- Difference Chart --- 
    const diffChartSection = spectrumState.dom.diffChartSection;
    if (hasDifference && diffChartSection) {
        diffChartSection.classList.remove('hidden');
        
        const mapDiffData = (data) => Array.from(data)
                                        .map((y, i) => ({ x: freqValues[i], y: (isFinite(y) ? y : null) }));

        const differenceData = {
            datasets: [{
                label: `Difference (${filename2} - ${filename1})`, // Use filenames in label
                data: mapDiffData(spectrumState.data.difference),
                fill: {
                   target: 'origin',
                   above: chartColors.positive.replace('1.0', '0.7'), 
                   below: chartColors.negative.replace('1.0', '0.7')
                },
                borderWidth: 0, 
                pointRadius: 0,
                tension: 0,
                spanGaps: false
            }]
        };
        const differenceOptions = {
            responsive: true, maintainAspectRatio: false, animation: false,
            parsing: false, // Important for performance
            normalized: true, // Also good for performance
            scales: {
                x: {
                    type: 'logarithmic',
                    min: window.AppConfig.SPECTRUM_MIN_FREQ,
                    max: window.AppConfig.ANALYSIS_MAX_FREQ,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { 
                        color: 'rgba(255, 255, 255, 0.7)',
                        // Revert to simpler callback for default log ticks, just format labels
                         callback: function(value, index, ticks) {
                            // Basic formatting for log ticks provided by Chart.js
                            if (value >= 1000) return (value / 1000).toFixed(value < 10000 ? 1 : 0) + 'K';
                            if (value === 0) return '0';
                             return value.toString();
                        },
                        maxRotation: 0,
                        autoSkip: true, // Allow Chart.js to skip ticks
                        maxTicksLimit: 15 // Limit density
                    },
                    title: { display: true, text: 'Frequency (Hz)', color: 'rgba(255, 255, 255, 0.9)' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                    title: { display: true, text: 'Difference (dBFS)', color: 'rgba(255, 255, 255, 0.9)' },
                    min: window.AppConfig.SPECTRUM_DIFF_MIN_DB,
                    max: window.AppConfig.SPECTRUM_DIFF_MAX_DB
                }
            },
            plugins: {
                legend: { display: false }, // Keep legend hidden for diff
                tooltip: {
                    callbacks: {
                        title: (context) => `${formatFrequencyTooltip(context[0].parsed.x)} Hz`,
                        // Update tooltip label to use dynamic filenames
                        label: (context) => {
                            const value = context.parsed.y !== null ? context.parsed.y.toFixed(2) + ' dB' : 'No Data';
                            return `${filename2} - ${filename1}: ${value}`;
                        }
                    }
                }
            }
        };

        // Update or create the difference chart
        if (spectrumState.charts.difference) {
            spectrumState.charts.difference.data = differenceData;
            spectrumState.charts.difference.options = differenceOptions;
            spectrumState.charts.difference.update('none');
            // Delayed update might still be needed depending on browser/Chart.js version
            setTimeout(() => { if (spectrumState.charts.difference) { spectrumState.charts.difference.update('none'); } }, 50); 
        } else {
            spectrumState.charts.difference = new Chart(differenceCanvas, { type: 'line', data: differenceData, options: differenceOptions });
            setTimeout(() => { if (spectrumState.charts.difference) { spectrumState.charts.difference.update('none'); } }, 50);
        }
        console.log("Difference chart updated and shown");

    } else if (diffChartSection) {
        diffChartSection.classList.add('hidden'); // Hide the section if no diff data
        // Destroy the difference chart if it exists to free resources
        if (spectrumState.charts.difference) {
             spectrumState.charts.difference.destroy();
             spectrumState.charts.difference = null;
             console.log("Difference chart hidden and destroyed");
        }
    }

    console.log("Charts updated based on available spectrum data");
}

// --- New Highlighting Function ---
// Update the comparison chart highlighting based on playback state
function updateChartHighlighting() {
    const comparisonChart = spectrumState.charts.comparison;
    const audioState = window.AudioEngine?.state;

    if (!comparisonChart || !audioState) {
        return; // Cannot update if chart or audio engine state is missing
    }

    // Determine default width based on playback state
    const isPlaying = audioState.isPlaying;
    const playingSource = audioState.selectedSource; // 1 or 2

    // Iterate through datasets to set width
    comparisonChart.data.datasets.forEach((dataset, index) => {
        // Assuming dataset 0 = file 1, dataset 1 = file 2 if both exist.
        // This relies on the order they are added in updateCharts.
        // A more robust approach might involve matching dataset.label if filenames are guaranteed unique
        // or storing references, but this keeps it simple.
        let targetWidth = 1; // Default width
        if (isPlaying) {
            if (index === 0 && playingSource === 1) { // File 1 playing
                targetWidth = 2;
            } else if (index === 1 && playingSource === 2) { // File 2 playing
                targetWidth = 2;
            }
        }
        dataset.borderWidth = targetWidth;
    });

    // Update the chart without animation
    comparisonChart.update('none');
}

// Helper function to format frequency for tooltips (avoids showing too many decimals for low freqs)
function formatFrequencyTooltip(freq) {
    if (!isFinite(freq)) return "N/A";
    if (freq < 1) return freq.toFixed(2);
    if (freq < 10) return freq.toFixed(1);
    if (freq < 1000) return Math.round(freq);
    return (freq / 1000).toFixed(1) + 'k'; // Use 'k' for kHz
}

// Handle time range selection from UI (mouse up event)
function handleTimeRangeSelection(start, end) {
    // Check if analyzer is initialized
    if (!spectrumState.initialized) return;
    // Call updateTimeRange which now handles computation and plotting
    updateTimeRange(start, end);
}

// Export the public API
window.SpectrumAnalyzer = {
    init: initSpectrumAnalysis,
    updateTimeRange,
    handleTimeRangeSelection,
    computeAndPlotSpectra, // Export the new function
    updateChartHighlighting, // Export the highlighting function
    state: spectrumState
}; 