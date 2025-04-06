// visualization.js - Handles spectrogram calculation and drawing

// --- Configuration ---
// REMOVED Configuration Constants (now in config.js)

// --- Visualization State ---
const visualizationState = {
    spectrograms: {
        file1: null,
        file2: null,
        diff: null
    },
    dimensions: {
        canvasWidth: 1600,
        timeSteps: 0,
        timePerPixel: 0
    },
    overlayActive: false
};

// --- Public API ---

// Calculate a spectrogram from an audio buffer
function calculateSpectrogram(audioBuffer) {
    const pcmData = audioBuffer.getChannelData(0); // Use first channel
    const numSamples = pcmData.length;
    // Use the *actual* buffer sample rate for FFT calculations
    const sampleRate = audioBuffer.sampleRate; 
    const duration = audioBuffer.duration;

    // --- Calculate dynamic FFT parameters --- 
    // Adjust FFT size based on sample rate to maintain similar frequency resolution to base
    const fftSizeRatio = sampleRate / window.AppConfig.BASE_SAMPLE_RATE;
    let fftSize = Math.pow(2, Math.round(Math.log2(window.AppConfig.BASE_FFT_SIZE * fftSizeRatio)));
    // Ensure FFT size is reasonable (e.g., not excessively large)
    fftSize = Math.min(fftSize, 16384); // Cap FFT size
    fftSize = Math.max(fftSize, 512);   // Minimum FFT size

    // Calculate number of frequency bins needed to reach ANALYSIS_MAX_FREQ
    const maxUsefulBinIndex = Math.ceil((window.AppConfig.ANALYSIS_MAX_FREQ * fftSize) / sampleRate);
    const numFreqBinsToUse = Math.min(maxUsefulBinIndex, fftSize / 2); // Don't exceed Nyquist
    
    // Adjust hop size to target a specific number of time steps
    let hopSize = Math.floor(numSamples / window.AppConfig.TARGET_MAX_TIME_STEPS);
    // Ensure reasonable hop size (e.g., at least 1/8th overlap if possible)
    hopSize = Math.max(hopSize, Math.floor(fftSize / 8)); 
    // Ensure hopSize doesn't make numTimeSteps zero
    hopSize = Math.min(hopSize, numSamples - fftSize > 0 ? numSamples - fftSize : Math.floor(fftSize * 0.75)); 
    
    const numTimeSteps = Math.max(1, Math.floor((numSamples - fftSize) / hopSize) + 1);

    console.log(`Spectrogram Params: SR=${sampleRate}Hz, FFT=${fftSize}, Hop=${hopSize}, TimeSteps=${numTimeSteps}, FreqBinsUsed=${numFreqBinsToUse}`);
    // --- End Calculate dynamic FFT parameters ---

    const spectrogram = []; // Array of arrays (time steps x frequency bins)
    const windowFunc = createHanningWindow(fftSize);
    
    const windowCorrectionFactor = 2.0;  
    const fftNormalizationFactor = 2.0 / fftSize;

    let minDb = Infinity;
    let maxDb = -Infinity;

    for (let t = 0; t < numTimeSteps; t++) {
        const startSample = t * hopSize;
        const frame = new Float32Array(fftSize);
        const frameImag = new Float32Array(fftSize);

        for (let i = 0; i < fftSize; i++) {
            if (startSample + i < numSamples) {
                frame[i] = pcmData[startSample + i] * windowFunc[i];
            } else {
                frame[i] = 0;
            }
            frameImag[i] = 0;
        }

        transform(frame, frameImag);

        const dbValues = new Float32Array(numFreqBinsToUse); // Only store used bins

        for (let k = 0; k < numFreqBinsToUse; k++) { // Iterate only up to used bins
            const real = frame[k];
            const imag = frameImag[k];
            
            const magnitude = Math.sqrt(real * real + imag * imag) * fftNormalizationFactor * windowCorrectionFactor;
            const db = 20 * Math.log10(magnitude + 1e-10);
            dbValues[k] = db;

            if (db > -Infinity) {
               if (db < minDb) minDb = db;
               if (db > maxDb) maxDb = db;
            }
        }
        spectrogram.push(dbValues); // Store only the relevant frequency bins
    }

    if (minDb < window.AppConfig.MIN_DB_FLOOR) minDb = window.AppConfig.MIN_DB_FLOOR;
    if (maxDb === -Infinity) maxDb = 0; 

    visualizationState.dimensions.timeSteps = numTimeSteps;
    // Time per pixel needs recalculating if canvas width is fixed but time steps change
    visualizationState.dimensions.timePerPixel = duration / visualizationState.dimensions.canvasWidth;

    return { 
        data: spectrogram, 
        minDb, 
        maxDb, 
        // Include necessary parameters for rendering/analysis 
        sampleRate: sampleRate, 
        fftSize: fftSize,
        numFreqBinsUsed: numFreqBinsToUse,
        numTimeSteps: numTimeSteps
    }; 
}

// Create an optimized spectrogram image using offscreen canvas and direct pixel manipulation
function createSpectrogramImage(spectrogramData) {
    const { data, minDb, maxDb, numTimeSteps, numFreqBinsUsed, sampleRate, fftSize } = spectrogramData; // Added sampleRate, fftSize
    const dbRange = maxDb - minDb;
    const RENDER_HEIGHT = 512; // Fixed height for the rendered image buffer

    console.log(`Creating optimized spectrogram image (Mel scale): ${numTimeSteps}x${RENDER_HEIGHT} pixels from ${numFreqBinsUsed} bins, dB range [${minDb.toFixed(2)}, ${maxDb.toFixed(2)}]`);

    // --- Calculate Mel Frequency Mapping ---
    const yToFreqBinMapping = new Array(RENDER_HEIGHT);
    const minFreqHz = (1 / fftSize) * sampleRate; // Freq of bin 1
    const maxFreqHz = (numFreqBinsUsed / fftSize) * sampleRate; // Approx freq of highest used bin center
    const minMel = hzToMel(minFreqHz);
    const maxMel = hzToMel(maxFreqHz);
    const melRange = maxMel - minMel;

    // Store Mel scale info on the data object for tooltip use
    spectrogramData.melScaleInfo = { minMel, melRange, RENDER_HEIGHT };

    for (let y = 0; y < RENDER_HEIGHT; y++) {
        // Map y (0 to RENDER_HEIGHT-1) to normalized Mel scale (0 to 1)
        // Invert y because y=0 is the top (high frequency)
        const melNorm = (RENDER_HEIGHT - 1 - y) / (RENDER_HEIGHT - 1);
        // Calculate target Mel value
        const targetMel = minMel + melNorm * melRange;
        // Convert back to Hz
        const targetHz = melToHz(targetMel);
        // Convert Hz to linear frequency bin index
        const linearFreqBin = Math.round((targetHz * fftSize) / sampleRate);
        // Clamp and round to nearest valid bin index
        yToFreqBinMapping[y] = Math.max(0, Math.min(numFreqBinsUsed - 1, linearFreqBin));
    }
    // --- End Mel Frequency Mapping ---

    // Create offscreen canvas with the fixed render height
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = numTimeSteps;
    offscreenCanvas.height = RENDER_HEIGHT; // Use fixed render height
    const offCtx = offscreenCanvas.getContext('2d');

    const imageData = offCtx.createImageData(numTimeSteps, RENDER_HEIGHT);
    const pixels = imageData.data;

    // Iterate through output pixels (y first, as it's row-major in ImageData)
    for (let y = 0; y < RENDER_HEIGHT; y++) {
        const f = yToFreqBinMapping[y]; // Get the source frequency bin for this row
        // Make sure f is valid, otherwise skip (shouldn't happen with clamping, but safety check)
        if (f === undefined || f < 0 || f >= numFreqBinsUsed) continue;

        for (let t = 0; t < numTimeSteps; t++) {
             // Safety check for data existence
            if (!data[t] || data[t][f] === undefined) continue;

            const dbValue = data[t][f];

            let normalizedValue = (dbValue - minDb) / (dbRange || 1); // Avoid div by zero
            normalizedValue = Math.max(0, Math.min(1, normalizedValue)); // Clamp

            const color = infernoColorMap(normalizedValue);

            // Calculate pixel index for (t, y)
            // imageData is stored row-major: (y * width + x) * 4
            const currentPixelIndex = (y * numTimeSteps + t) * 4;

            pixels[currentPixelIndex    ] = color[0];
            pixels[currentPixelIndex + 1] = color[1];
            pixels[currentPixelIndex + 2] = color[2];
            pixels[currentPixelIndex + 3] = 255;
        }
    }

    offCtx.putImageData(imageData, 0, 0);

    return offscreenCanvas;
}

// Create an optimized difference spectrogram image
function createDiffSpectrogramImage(diffData) {
    const { data, maxDiff, numTimeSteps, numFreqBinsUsed, sampleRate, fftSize } = diffData; // Added sampleRate, fftSize
    const RENDER_HEIGHT = 512; // Fixed height for the rendered image buffer
    const DIFF_SENSITIVITY = 0.7; // Lower values (<1) increase sensitivity to small differences

    console.log(`Creating optimized diff spectrogram image (Mel scale): ${numTimeSteps}x${RENDER_HEIGHT} pixels from ${numFreqBinsUsed} bins, maxDiff: ${maxDiff.toFixed(2)}, sensitivity: ${DIFF_SENSITIVITY}`);

    // --- Calculate Mel Frequency Mapping (same as above) ---
    const yToFreqBinMapping = new Array(RENDER_HEIGHT);
    const minFreqHz = (1 / fftSize) * sampleRate;
    const maxFreqHz = (numFreqBinsUsed / fftSize) * sampleRate;
    const minMel = hzToMel(minFreqHz);
    const maxMel = hzToMel(maxFreqHz);
    const melRange = maxMel - minMel;

    // Store Mel scale info on the data object for tooltip use
    diffData.melScaleInfo = { minMel, melRange, RENDER_HEIGHT };

    for (let y = 0; y < RENDER_HEIGHT; y++) {
        const melNorm = (RENDER_HEIGHT - 1 - y) / (RENDER_HEIGHT - 1);
        const targetMel = minMel + melNorm * melRange;
        const targetHz = melToHz(targetMel);
        const linearFreqBin = Math.round((targetHz * fftSize) / sampleRate);
        yToFreqBinMapping[y] = Math.max(0, Math.min(numFreqBinsUsed - 1, linearFreqBin));
    }
    // --- End Mel Frequency Mapping ---

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = numTimeSteps;
    offscreenCanvas.height = RENDER_HEIGHT; // Use fixed render height
    const offCtx = offscreenCanvas.getContext('2d');

    const imageData = offCtx.createImageData(numTimeSteps, RENDER_HEIGHT);
    const pixels = imageData.data;

    // Iterate through output pixels (y first)
    for (let y = 0; y < RENDER_HEIGHT; y++) {
        const f = yToFreqBinMapping[y]; // Get the source frequency bin for this row
        if (f === undefined || f < 0 || f >= numFreqBinsUsed) continue;

        for (let t = 0; t < numTimeSteps; t++) {
            if (!data[t] || data[t][f] === undefined) continue;
            const diffValue = data[t][f];

            let normalizedDiff = diffValue / (maxDiff || 1); // Avoid division by zero

            // Apply sensitivity scaling
            let scaledNormDiff = Math.sign(normalizedDiff) * Math.pow(Math.abs(normalizedDiff), DIFF_SENSITIVITY);

            // Clamp the scaled value to [-1, 1]
            scaledNormDiff = Math.max(-1, Math.min(1, scaledNormDiff));

            // Use the scaled difference for color mapping
            const color = divergingColorMap(scaledNormDiff);

            // Calculate pixel index for (t, y)
            const currentPixelIndex = (y * numTimeSteps + t) * 4;

            pixels[currentPixelIndex    ] = color[0];
            pixels[currentPixelIndex + 1] = color[1];
            pixels[currentPixelIndex + 2] = color[2];
            pixels[currentPixelIndex + 3] = 255;
        }
    }

    offCtx.putImageData(imageData, 0, 0);

    return offscreenCanvas;
}

// Draw a spectrogram on a canvas
function drawSpectrogram(spectrogramData, ctx, canvas) {
    if (!spectrogramData || !spectrogramData.data || spectrogramData.data.length === 0) {
        console.warn("No spectrogram data to draw");
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Set the drawing buffer size based on display size and pixel ratio
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
    }
    
    // Scale the context to account for the pixel ratio
    ctx.scale(dpr, dpr);

    // Clear canvas with background color (using display dimensions)
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.fillStyle = 'rgba(17, 17, 17, 1)'; 
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Create or retrieve cached image
    let spectrogramImage = spectrogramData.renderedImage;
    if (!spectrogramImage) {
        spectrogramImage = createSpectrogramImage(spectrogramData);
        spectrogramData.renderedImage = spectrogramImage; // Cache it
    }
    
    // Draw the optimized image to the canvas, scaling it to the display dimensions
    // The context scaling handles the high-resolution rendering.
    ctx.imageSmoothingEnabled = false; // Optional: Ensure sharp pixels if needed
    ctx.drawImage(spectrogramImage, 0, 0, displayWidth, displayHeight);

    // Reset the transform to avoid affecting subsequent drawing operations (like the overlay)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Calculate and draw the difference spectrogram
function calculateAndDrawDiffSpectrogram(spec1, spec2, canvas, ctx) {
    if (!spec1 || !spec2) {
        console.warn("Missing spectrogram data for diff calculation");
        return null;
    }
    
    // Pass necessary parameters to calculateDiff
    const diffData = calculateDiff(spec1, spec2);
    drawDiffSpectrogram(diffData, ctx, canvas);
    
    return diffData;
}

// Draw the difference spectrogram using optimized image rendering
function drawDiffSpectrogram(diffData, ctx, canvas) {
    if (!diffData || !diffData.data || diffData.data.length === 0) {
        console.warn("No difference data to draw");
        return;
    }
    
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    
    // Set the drawing buffer size
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
    }
    
    // Scale the context
    ctx.scale(dpr, dpr);

    // Clear canvas (using display dimensions)
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    
    // Create or retrieve cached image
    let diffImage = diffData.renderedImage;
    if (!diffImage) {
        diffImage = createDiffSpectrogramImage(diffData);
        diffData.renderedImage = diffImage; // Cache it
    }
    
    // Draw the optimized image to the canvas, scaling to display dimensions
    ctx.imageSmoothingEnabled = false; // Optional: Ensure sharp pixels
    ctx.drawImage(diffImage, 0, 0, displayWidth, displayHeight);

    // Reset the transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- Helper Functions ---

// Calculate difference between two spectrograms
function calculateDiff(spec1, spec2) {
    // Use the number of time steps and frequency bins from the spectrogram data itself
    const numTimeSteps = Math.min(spec1.numTimeSteps, spec2.numTimeSteps);
    const numFreqBinsUsed = Math.min(spec1.numFreqBinsUsed, spec2.numFreqBinsUsed);

    // We need sampleRate and fftSize for Mel scaling in createDiffSpectrogramImage
    // Assume they are the same for both files, take from spec1
    const sampleRate = spec1.sampleRate;
    const fftSize = spec1.fftSize;

    const diffSpectrogram = [];
    let maxDiff = 0;

    for (let t = 0; t < numTimeSteps; t++) {
        const diffFrame = new Float32Array(numFreqBinsUsed);

        for (let f = 0; f < numFreqBinsUsed; f++) {
            // Check if data exists at this index for both
            if (t < spec1.data.length && t < spec2.data.length &&
                spec1.data[t] && spec2.data[t] && // Check frame exists
                f < spec1.data[t].length && f < spec2.data[t].length) {

                const diff = spec1.data[t][f] - spec2.data[t][f];
                diffFrame[f] = diff;

                const absDiff = Math.abs(diff);
                if (absDiff > maxDiff) {
                    maxDiff = absDiff;
                }
            } else {
                diffFrame[f] = 0; // Handle potential mismatch
            }
        }

        diffSpectrogram.push(diffFrame);
    }

    // Return necessary parameters along with data
    return {
        data: diffSpectrogram,
        maxDiff,
        numTimeSteps: numTimeSteps,
        numFreqBinsUsed: numFreqBinsUsed,
        sampleRate: sampleRate, // Pass through for Mel scaling
        fftSize: fftSize       // Pass through for Mel scaling
    };
}

// Create a Hanning window function for better FFT results
function createHanningWindow(length) {
    const windowFunc = new Float32Array(length); // Renamed variable
    for (let i = 0; i < length; i++) {
        windowFunc[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    return windowFunc; // Return renamed variable
}

// --- Mel Scale Conversion ---
// Convert frequency in Hz to Mel scale
function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
}

// Convert Mel scale to frequency in Hz
function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

// --- Colormaps ---
const COLORMAP_SIZE = 256; // Size of the precomputed lookup table
let infernoLookupTable = null;

// Add a global variable for the diverging lookup table
let divergingLookupTable = null;

// Generates the lookup table for the Inferno colormap
function generateInfernoLookupTable() {
    console.log("Generating Inferno lookup table...");
    infernoLookupTable = new Array(COLORMAP_SIZE);
    const colors = [
        [0, 0, 4], [30, 11, 70], [82, 11, 106], [130, 29, 102],
        [178, 50, 86], [221, 75, 67], [249, 111, 59], [253, 164, 49],
        [237, 221, 93], [252, 255, 164]
    ];
    const numSegments = colors.length - 1;

    for (let i = 0; i < COLORMAP_SIZE; i++) {
        const value = i / (COLORMAP_SIZE - 1); // Map index 0..255 to value 0..1
        const scaledValue = value * numSegments;
        const segmentIndex = Math.min(Math.floor(scaledValue), numSegments - 1);
        const segmentFraction = scaledValue - segmentIndex;

        const c1 = colors[segmentIndex];
        const c2 = colors[segmentIndex + 1];

        const r = Math.round(c1[0] + (c2[0] - c1[0]) * segmentFraction);
        const g = Math.round(c1[1] + (c2[1] - c1[1]) * segmentFraction);
        const b = Math.round(c1[2] + (c2[2] - c1[2]) * segmentFraction);
        infernoLookupTable[i] = [r, g, b];
    }
    console.log("Inferno lookup table generated.");
}

// Generates the lookup table for the diverging colormap
function generateDivergingLookupTable() {
    console.log("Generating diverging lookup table...");
    divergingLookupTable = new Array(256); // 0-255

    const positiveColorRGB = [65, 105, 255]; // Blue for positive differences (File 1 > File 2)
    const negativeColorRGB = [255, 20, 10];  // Red for negative differences (File 2 > File 1)

    // Negative part (index 0 to 127 maps value -1 to ~0)
    // Interpolates from red to black
    for (let i = 0; i < 128; i++) {
        const intensity = (127 - i) / 127; // 1 at i=0, 0 at i=127
        const r = Math.round(negativeColorRGB[0] * intensity);
        const g = Math.round(negativeColorRGB[1] * intensity);
        const b = Math.round(negativeColorRGB[2] * intensity);
        divergingLookupTable[i] = [
            Math.max(0, Math.min(255, r)),
            Math.max(0, Math.min(255, g)),
            Math.max(0, Math.min(255, b))
        ];
    }

    // Center point (index 128 maps value 0) -> Black
    divergingLookupTable[128] = [0, 0, 0];

    // Positive part (index 129 to 255 maps value ~0 to 1)
    // Interpolates from black to blue
    for (let i = 129; i < 256; i++) {
        const intensity = (i - 128) / 127; // ~0 at i=129, 1 at i=255
        const r = Math.round(positiveColorRGB[0] * intensity);
        const g = Math.round(positiveColorRGB[1] * intensity);
        const b = Math.round(positiveColorRGB[2] * intensity);
        divergingLookupTable[i] = [
            Math.max(0, Math.min(255, r)),
            Math.max(0, Math.min(255, g)),
            Math.max(0, Math.min(255, b))
        ];
    }
    console.log("Diverging lookup table generated.");
}

// Inferno Colormap (simplified version from matplotlib)
// Uses a precomputed lookup table for efficiency.
// Input: value between 0 and 1
// Output: [r, g, b] array (0-255)
function infernoColorMap(value) {
    // Generate the table on the first call if it doesn't exist
    if (!infernoLookupTable) {
        generateInfernoLookupTable();
    }

    // Clamp value to [0, 1]
    const clampedValue = Math.max(0, Math.min(1, value));

    // Map value to table index
    const index = Math.floor(clampedValue * (COLORMAP_SIZE - 1));

    // Return precomputed color
    // Ensure index is valid just in case of floating point quirks
    const safeIndex = Math.min(COLORMAP_SIZE - 1, Math.max(0, index)); 
    return infernoLookupTable[safeIndex];
}

// Diverging Colormap (blue-black-red) - Uses lookup table
// Input: value between -1 and 1
// Output: [r, g, b] array (0-255)
function divergingColorMap(value) {
    // Generate the table on the first call if it doesn't exist
    if (!divergingLookupTable) {
        generateDivergingLookupTable();
    }

    // Clamp value to [-1, 1]
    const clampedValue = Math.max(-1, Math.min(1, value));

    // Map value (-1 to 1) to table index (0 to 255)
    // value = -1   => index = 0
    // value =  0   => index = 128
    // value =  1   => index = 255
    // We use 127.5 to center 0 correctly at 128 after rounding
    const index = Math.round((clampedValue + 1) * 127.5);

    // Ensure index is within bounds [0, 255] due to potential floating point inaccuracies
    const safeIndex = Math.max(0, Math.min(255, index)); 

    // Return precomputed color
    return divergingLookupTable[safeIndex];
}

// --- New Swap Function ---
function swapFiles() {
    console.log("Swapping visualization data...");
    // Swap spectrogram data
    [visualizationState.spectrograms.file1, visualizationState.spectrograms.file2] = 
        [visualizationState.spectrograms.file2, visualizationState.spectrograms.file1];

    // Diff spectrogram data needs recalculation, so we just clear it here.
    // The UI controller will call createDiffSpectrogram after swapping.
    visualizationState.spectrograms.diff = null; 
    
    console.log("Visualization data swapped.");
}

// Export the public API - Add swapFiles
window.SpectrogramVisualizer = {
    calculateSpectrogram,
    drawSpectrogram,
    calculateDiffSpectrogram: calculateAndDrawDiffSpectrogram,
    drawDiffSpectrogram,
    redrawAllSpectrograms,
    swapFiles, // Add swap function
    state: visualizationState,
    // REMOVED Exported constants
}; 

// Function to redraw all currently loaded spectrograms
function redrawAllSpectrograms() {
    console.log("Redrawing all spectrograms...");
    const canvas1 = document.getElementById('spectrogramCanvas1');
    const canvas2 = document.getElementById('spectrogramCanvas2');
    const diffCanvas = document.getElementById('diffSpectrogramCanvas');

    if (canvas1 && visualizationState.spectrograms.file1) {
        drawSpectrogram(visualizationState.spectrograms.file1, canvas1.getContext('2d'), canvas1);
    }
    if (canvas2 && visualizationState.spectrograms.file2) {
        drawSpectrogram(visualizationState.spectrograms.file2, canvas2.getContext('2d'), canvas2);
    }
    if (diffCanvas && visualizationState.spectrograms.diff) {
        drawDiffSpectrogram(visualizationState.spectrograms.diff, diffCanvas.getContext('2d'), diffCanvas);
    }
} 