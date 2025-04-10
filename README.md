# Audio Diff Tool

<img width="1714" alt="Screenshot 2025-04-10 at 3 57 06 PM" src="https://github.com/user-attachments/assets/03faee73-2ae1-49ba-b178-5b14c4681d4e" />

A web-based tool designed to load, visualize, and compare two audio files side-by-side. It provides spectrogram displays, audio playback, and frequency spectrum analysis capabilities.

## Features

*   **Load Audio:** Load two audio files (e.g., WAV, MP3, OGG) using the file input controls.
*   **Spectrogram Visualization:**
    *   Displays individual spectrograms for each loaded audio file.
    *   Calculates and displays a difference spectrogram, highlighting variations between the two files.
    *   Uses a Mel frequency scale for perceptually relevant visualization.
    *   Hover over spectrograms to view time and frequency information.
*   **Audio Playback:**
    *   Play/pause audio playback.
    *   Switch playback focus between File 1 and File 2 using tabs or keyboard shortcuts.
    *   Visual indicator on the active tab shows which file is currently playing.
*   **Time Range Selection & Looping:**
    *   Click and drag on any spectrogram to select a specific time range.
    *   The selected range is visually highlighted.
    *   Playback automatically loops within the selected range if a drag selection is made.
*   **Spectrum Analysis:**
    *   Displays the average frequency spectrum (dBFS vs. Frequency) for the selected time range in a comparison chart (File 1 vs. File 2).
    *   Displays the difference between the two spectra in a separate chart.
    *   Uses Chart.js for interactive spectrum plots with logarithmic frequency scale.
*   **File Swapping:** Easily swap the positions of File 1 and File 2 with a dedicated button.
*   **Keyboard Shortcuts:**
    *   `Space`: Toggle Play/Pause
    *   `1`: Switch to File 1 Tab/Playback
    *   `2`: Switch to File 2 Tab/Playback
    *   `3`: Switch to Difference Spectrogram Tab

## Technologies Used

*   HTML5
*   CSS3
*   JavaScript (ES6+)
*   Web Audio API (for audio processing and playback)
*   Canvas API (for spectrogram rendering)
*   Chart.js (for spectrum analysis plots)

## How to Use

1.  Open the `index.html` file in a modern web browser that supports the Web Audio API (Chrome, Firefox, Edge, Safari).
2.  Use the "File 1" input to select the first audio file, or select two files simultaneously using this input.
3.  If only one file was selected, use the "File 2" input to select the second audio file.
4.  Once loaded, the spectrograms and initial full-range spectrum charts will appear.
5.  Use the tabs ("File 1", "File 2", "Difference") or keys `1`, `2`, `3` to switch between spectrogram views.
6.  Click the play button (`▶` / `❚❚`) or press `Space` to toggle audio playback. The tab for the currently playing file will show a pulsing green dot.
7.  Click and drag horizontally on any of the spectrograms to select a time range.
    *   The selected range will be highlighted.
    *   The spectrum analysis charts below will update to reflect the average spectrum within this range.
    *   If playback is active or started after selection, it will loop within this range.
8.  Use the "Swap Files" button if you wish to interchange the loaded audio files and their corresponding analyses.
