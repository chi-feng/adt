// config.js - Shared application configuration

const AppConfig = {
    // --- Analysis Settings ---
    ANALYSIS_MAX_FREQ: 22000,     // Target max frequency for analysis/display (Hz)
    TARGET_MAX_TIME_STEPS: 4800,  // Target max number of time steps in spectrogram
    BASE_FFT_SIZE: 2048,          // Base FFT size for 44.1kHz reference
    BASE_SAMPLE_RATE: 44100,      // Reference sample rate for FFT calculation

    // --- Visualization Settings ---
    MIN_DB_FLOOR: -90,      // Floor for dB normalization in spectrograms

    // --- Spectrum Analyzer Settings ---
    SPECTRUM_MIN_FREQ: 50,      // Min frequency for spectrum chart x-axis
    // Max freq now comes from ANALYSIS_MAX_FREQ
    SPECTRUM_MIN_DB: -90,       // Min dB for spectrum chart y-axis
    SPECTRUM_MAX_DB: -10,         // Max dB for spectrum chart y-axis
    SPECTRUM_DIFF_MIN_DB: -10,  // Min dB for difference chart y-axis
    SPECTRUM_DIFF_MAX_DB: 10,   // Max dB for difference chart y-axis
};

// Expose globally (keeping with simple pattern for this demo)
window.AppConfig = AppConfig; 