document.addEventListener('DOMContentLoaded', () => {
    const musicFileElement = document.getElementById('music-file');
    const scoreElement = document.getElementById('score');
    const multiplierElement = document.getElementById('multiplier');
    const instrumentSelectElement = document.getElementById('instrument-select');
    const tracks = [
        document.getElementById('track-1'),
        document.getElementById('track-2'),
        document.getElementById('track-3'),
        document.getElementById('track-4'),
    ];

    let audioContext;
    let audioBuffer;
    let audioSource;

    let currentInstrument = instrumentSelectElement.value; // Initialize with default value
    let score = 0;
    let multiplier = 1;
    const MAX_MULTIPLIER = 4;
    const BASE_SCORE_PER_HIT = 10;
    const NOTE_HEIGHT = 30; // Added constant for note height
    const NOTE_FALL_DURATION_MS = 2500; // Adjusted fall duration

    // Meyda variables
    let meyda;
    let lastSpectralFlux = 0;
    let lastNoteTimeMs = 0;
    const FLUX_THRESHOLD = 0.4; // Initial guess, needs tuning
    const MIN_TIME_BETWEEN_NOTES_MS = 200; // Minimum time between generated notes

    // let noteGenerationInterval; // Will be replaced by Meyda
    let playButton; // Declare playButton here to access it in handleMusicFile

    // --- Audio Loading and Playback ---
    musicFileElement.addEventListener('change', handleMusicFile);

    function handleMusicFile(event) {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = function(e) {
                // Ensure play button is disabled while loading new audio
                if (playButton) {
                    playButton.disabled = true;
                    playButton.textContent = 'Loading Audio...';
                }
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                audioContext.decodeAudioData(e.target.result)
                    .then(buffer => {
                        audioBuffer = buffer;
                        console.log('Audio loaded successfully');
                        if (!playButton) { // Create button if it doesn't exist
                           createPlayButton();
                        }
                        playButton.disabled = false; // Enable button
                        playButton.textContent = 'Play Music';
                    })
                    .catch(error => {
                        console.error('Error decoding audio data:', error);
                        if (playButton) {
                            playButton.textContent = 'Load Failed'; // Keep disabled
                        }
                    });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    function createPlayButton() {
        // playButton is already declared in the outer scope
        if (!document.getElementById('play-music-button')) { // Check if it's already in DOM
            playButton = document.createElement('button');
            playButton.id = 'play-music-button';
            playButton.textContent = 'Load Music First';
            playButton.disabled = true; // Initially disabled
            musicFileElement.parentElement.appendChild(playButton);
            playButton.addEventListener('click', playMusic);
        } else {
            playButton = document.getElementById('play-music-button'); // Get existing one
        }
    }

    function playMusic() {
        if (audioBuffer && audioContext) {
            if (audioSource) {
                audioSource.stop();
            }
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            // Connect source to Meyda and destination
            audioSource.connect(audioContext.destination);

            // Initialize Meyda
            if (typeof Meyda === "undefined") {
                console.error("Meyda library not loaded!");
                return;
            }
            
            meyda = new Meyda({
                audioContext: audioContext,
                source: audioSource,
                bufferSize: 512, // Standard buffer size
                featureExtractors: ['spectralFlux', 'rms'], // Specify features
                callback: (features) => {
                    // Beat detection logic
                    const currentTimeMs = audioContext.currentTime * 1000;
                    if (features.spectralFlux > lastSpectralFlux + FLUX_THRESHOLD &&
                        (currentTimeMs - lastNoteTimeMs) > MIN_TIME_BETWEEN_NOTES_MS) {
                        
                        console.log('Beat detected! Flux:', features.spectralFlux.toFixed(3), 'RMS:', features.rms.toFixed(3));
                        // Generate note on a random track (0-3)
                        generateNote(Math.floor(Math.random() * tracks.length)); 
                        lastNoteTimeMs = currentTimeMs;
                    }
                    lastSpectralFlux = features.spectralFlux;
                }
            });
            
            audioSource.start(0);
            meyda.start(); // Start Meyda feature extraction
            console.log('Music playback started with Meyda.');
            // startNoteGeneration(); // Old method, replaced by Meyda callback
        } else {
            console.log('No audio loaded to play.');
        }
    }

    // --- Note Generation (Now driven by Meyda) ---
    // const NOTE_GENERATION_INTERVAL_MS = 1500; // No longer needed
    // NOTE_FALL_DURATION_MS is now a global const

    function generateNote(trackNumber) { // trackNumber is 0-indexed
        if (trackNumber < 0 || trackNumber >= tracks.length) {
            console.error('Invalid track number for generateNote:', trackNumber);
            return;
        }

        const trackElement = tracks[trackNumber];
        const noteElement = document.createElement('div');
        noteElement.classList.add('note');
        // Note starts at top:0 by default due to position:absolute in .track
        // No need to set .style.bottom or .style.top here if that's the case.
        // The old line: noteElement.style.bottom = (trackElement.clientHeight) + 'px';
        // has been removed as it was commented out and notes are appended then transformed.
        // If notes need to appear from *above* the track, this might need adjustment,
        // but current transform logic assumes they start at top:0 of the track.

        trackElement.appendChild(noteElement);

        // Animate falling using translateY
        let startTime = Date.now();
        function animateFall() {
            const elapsedTime = Date.now() - startTime;
            const progress = elapsedTime / NOTE_FALL_DURATION_MS;

            if (progress < 1) {
                // Note appears to fall from top to bottom of the track
                noteElement.style.transform = `translateY(${progress * (trackElement.clientHeight - NOTE_HEIGHT)}px)`;
                requestAnimationFrame(animateFall);
            } else {
                // Note reached bottom - consider it a miss if not hit
                if (noteElement.parentElement === trackElement) { // Check if still on track (not hit)
                    console.log('Note missed (reached bottom)');
                    handleMiss();
                    noteElement.remove();
                }
            }
        }
        requestAnimationFrame(animateFall);


        // Auto-remove after duration if not hit (backup for the animation based removal)
        setTimeout(() => {
            if (noteElement.parentElement === trackElement) {
                // This check is a bit redundant if animateFall's miss logic is robust
                // but good as a fallback.
                // handleMiss(); // Avoid double miss calls if animateFall handles it
                noteElement.remove();
            }
        }, NOTE_FALL_DURATION_MS + 200); // A bit longer than fall duration
    }

    function startNoteGeneration() {
        if (noteGenerationInterval) {
            clearInterval(noteGenerationInterval);
        }
        noteGenerationInterval = setInterval(() => {
            const randomTrack = Math.floor(Math.random() * tracks.length);
            generateNote(randomTrack);
        }, NOTE_GENERATION_INTERVAL_MS);
        // console.log('Note generation started.'); // No longer relevant as a standalone process
    }

    // function stopNoteGeneration() { // No longer needed as interval is removed
        // clearInterval(noteGenerationInterval);
        // console.log('Note generation stopped.');
    // }

    // Call this when audio stops or is paused
    function stopMeydaAndNotes() {
        if (meyda) {
            meyda.stop();
            console.log('Meyda stopped.');
        }
        // Clear any existing notes on tracks if needed (optional)
        tracks.forEach(track => {
            // track.innerHTML = ''; // This would remove all notes instantly
        });
    }

    // Modify playMusic to handle stopping previous Meyda instance
    // And also to stop Meyda when audio ends
    function playMusic() {
        if (audioBuffer && audioContext) {
            if (audioSource) {
                audioSource.stop();
                if (meyda) meyda.stop(); // Stop previous Meyda instance
            }
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(audioContext.destination);

            if (typeof Meyda === "undefined") {
                console.error("Meyda library not loaded!");
                playButton.textContent = 'Meyda Error';
                return;
            }
            
            meyda = new Meyda({
                audioContext: audioContext,
                source: audioSource,
                bufferSize: 512,
                featureExtractors: ['spectralFlux', 'rms'],
                callback: (features) => {
                    const currentTimeMs = audioContext.currentTime * 1000;
                    if (features.spectralFlux > lastSpectralFlux + FLUX_THRESHOLD &&
                        (currentTimeMs - lastNoteTimeMs) > MIN_TIME_BETWEEN_NOTES_MS) {
                        console.log('Beat! Flux:', features.spectralFlux.toFixed(3), 'RMS:', features.rms.toFixed(3), 'Track:', Math.floor(Math.random() * tracks.length));
                        generateNote(Math.floor(Math.random() * tracks.length));
                        lastNoteTimeMs = currentTimeMs;
                    }
                    lastSpectralFlux = features.spectralFlux;
                }
            });
            
            audioSource.onended = () => {
                console.log("Audio source ended.");
                if (meyda) meyda.stop();
                // Potentially reset lastSpectralFlux and lastNoteTimeMs here if desired
                lastSpectralFlux = 0;
                lastNoteTimeMs = 0;
            };

            audioSource.start(0);
            meyda.start();
            console.log('Music playback started with Meyda.');
            playButton.textContent = 'Playing...'; // Update play button text
        } else {
            console.log('No audio loaded to play.');
            playButton.textContent = 'Load Music First';
        }
    }


    // --- User Input Handling ---
    const KEY_TO_TRACK = {
        '1': 0, // Key '1' for Track 1
        '2': 1, // Key '2' for Track 2
        '3': 2, // Key '3' for Track 3
        '4': 3  // Key '4' for Track 4
    };

    window.addEventListener('keydown', handleKeyPress);

    function handleKeyPress(event) {
        const trackNumber = KEY_TO_TRACK[event.key];
        if (trackNumber !== undefined) {
            // Visual feedback for key press
            tracks[trackNumber].classList.add('active');
            setTimeout(() => tracks[trackNumber].classList.remove('active'), 100);

            checkHit(trackNumber);
        }
    }

    // --- Hit/Miss Detection (Basic) ---
    const HITTABLE_ZONE_BOTTOM_PERCENT = 5; // 5% from bottom
    const HITTABLE_ZONE_TOP_PERCENT = 20;   // 20% from bottom

    function checkHit(trackNumber) {
        const trackElement = tracks[trackNumber];
        const notesInTrack = trackElement.getElementsByClassName('note');
        const trackHeight = trackElement.clientHeight;

        const hittableLowerBound = trackHeight * (HITTABLE_ZONE_BOTTOM_PERCENT / 100);
        const hittableUpperBound = trackHeight * (HITTABLE_ZONE_TOP_PERCENT / 100);

        let hitOccurred = false;

        for (let i = notesInTrack.length - 1; i >= 0; i--) { // Iterate backwards as removing elements
            const note = notesInTrack[i];
            const noteRect = note.getBoundingClientRect();
            const trackRect = trackElement.getBoundingClientRect();

            // Calculate note's bottom position relative to its track's bottom
            const noteBottomRelativeToTrack = trackRect.bottom - noteRect.bottom;

            if (noteBottomRelativeToTrack >= hittableLowerBound && noteBottomRelativeToTrack <= hittableUpperBound) {
                console.log('Hit on track', trackNumber + 1);
                note.classList.add('hit-animation'); // Add CSS animation class
                setTimeout(() => note.remove(), 200); // Remove after animation
                handleHit();
                hitOccurred = true;
                
                // Visual feedback for hit on track
                trackElement.classList.add('hit');
                setTimeout(() => trackElement.classList.remove('hit'), 100);
                break; // Process only one hit per key press for now
            }
        }

        if (!hitOccurred) {
            // No note was in the hittable zone for that track press
            // This is not necessarily a "miss" of a note, but a "mistimed press"
            // Misses are handled when notes pass the zone or reach the bottom.
            // However, some games penalize mistimed presses by resetting multiplier.
            // For now, let's not penalize empty presses to be more lenient.
            // console.log('Mistimed press on track', trackNumber + 1);
        }
    }


    // --- Score and Multiplier Update ---
    function updateScoreDisplay() {
        scoreElement.textContent = score;
        multiplierElement.textContent = `${multiplier}x`;
    }

    function handleHit() {
        score += BASE_SCORE_PER_HIT * multiplier;
        if (multiplier < MAX_MULTIPLIER) {
            multiplier++;
        }
        updateScoreDisplay();
    }

    function handleMiss() {
        multiplier = 1;
        updateScoreDisplay();
        // Add visual feedback for a miss if desired (e.g., screen flash red)
    }

    // Initialize display
    updateScoreDisplay();
    createPlayButton(); // Create the play button on initial load (will be disabled)

    // --- Instrument Selection ---
    instrumentSelectElement.addEventListener('change', (event) => {
        currentInstrument = event.target.value;
        console.log('Instrument changed to:', currentInstrument);
        // Future logic:
        // - Potentially stop/restart note generation for the new instrument
        // - Or change which track data is used for note generation
    });

    // Initialize with the default selected instrument
    console.log('Initial instrument:', currentInstrument);


    // --- Initial Setup ---
    // Example: Start note generation for testing without music
    // Comment out if you want notes to start only with music
    // startNoteGeneration();
});
