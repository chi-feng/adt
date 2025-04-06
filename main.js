// main.js - Main application entry point that coordinates all modules

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initApp);

// Main initialization function
function initApp() {
    console.log('Initializing Spectrogram Diff Tool...');
    
    // Initialize UI first (sets up DOM references)
    window.UIController.init();
    
    // Initialize Audio Engine (sets up audio context)
    window.AudioEngine.init();
    
    // Initialize Spectrum Analyzer if available
    if (window.SpectrumAnalyzer) {
        window.SpectrumAnalyzer.init();
    }
    
    console.log('Initialization complete');
}

// Optional: Error handling and recovery
window.addEventListener('error', function(event) {
    console.error('Application error:', event.error);
    
    // Try to recover if possible
    if (window.AudioEngine && window.AudioEngine.state.isPlaying) {
        try {
            window.AudioEngine.stopPlayback();
        } catch (e) {
            console.error('Failed to stop playback during error recovery', e);
        }
    }
    
    // Show error to user
    if (window.UIController) {
        window.UIController.showStatus('An error occurred. Try refreshing the page.');
    }
}); 