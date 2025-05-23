document.addEventListener('DOMContentLoaded', () => {
    const musicFileElement = document.getElementById('music-file');
    const scoreElement = document.getElementById('score');
    const multiplierElement = document.getElementById('multiplier');
    const instrumentSelectElement = document.getElementById('instrument-select');
    const gameContainerElement = document.getElementById('game-container'); // For Overdrive BG
    const overdriveFillElement = document.getElementById('overdrive-fill');
    const tracks = [
        document.getElementById('track-1'),
        document.getElementById('track-2'),
        document.getElementById('track-3'),
        document.getElementById('track-4'),
    ];

    // Overdrive Variables
    let overdriveMeterValue = 0;
    const OVERDRIVE_MAX_VALUE = 100;
    const OVERDRIVE_FILL_PER_NOTE = 25; // Fill 1/4 of the meter
    let isOverdriveActive = false;
    let overdriveDepletionInterval = null;
    const OVERDRIVE_DEPLETION_RATE = 10; // Deplete 10% per second (adjust for desired duration e.g. 10s)
    const OVERDRIVE_ACTIVATION_KEY = ' '; // Spacebar

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

    // Note: noteGenerationInterval related code is being removed as it's no longer used.
    let playButton; // Declare playButton here to access it in handleMusicFile

    // --- Overdrive Display Update ---
    function updateOverdriveDisplay() {
        if (overdriveFillElement) {
            overdriveFillElement.style.width = overdriveMeterValue + '%';
        }
    }

    // --- Audio Loading and Playback ---
    musicFileElement.addEventListener('change', handleMusicFile);

    // Ensure AudioContext is resumed on user interaction (e.g., file selection or play button click)
    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            }).catch(e => console.error('Error resuming AudioContext:', e));
        }
    }

    function handleMusicFile(event) {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = function(e) {
                if (playButton) {
                    playButton.disabled = true;
                    playButton.textContent = 'Loading Audio...';
                }
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.log('AudioContext created. State:', audioContext.state);
                }
                resumeAudioContext(); // Attempt to resume if suspended

                audioContext.decodeAudioData(e.target.result)
                    .then(buffer => {
                        audioBuffer = buffer;
                        console.log('Audio decoded successfully. Buffer:', audioBuffer);
                        if (!playButton) {
                           createPlayButton();
                        }
                        playButton.disabled = false;
                        playButton.textContent = 'Play Music';
                    })
                    .catch(error => {
                        console.error('Error decoding audio data:', error);
                        audioBuffer = null; // Ensure buffer is null on error
                        if (playButton) {
                            playButton.textContent = 'Load Failed';
                        }
                    });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    function createPlayButton() {
        if (!document.getElementById('play-music-button')) {
            playButton = document.createElement('button');
            playButton.id = 'play-music-button';
            playButton.textContent = 'Load Music First';
            playButton.disabled = true;
            musicFileElement.parentElement.appendChild(playButton);
            playButton.addEventListener('click', () => {
                resumeAudioContext(); // Ensure context is active on play click
                playMusic();
            });
        } else {
            playButton = document.getElementById('play-music-button');
        }
    }

    // This is the first, simpler playMusic function that should be REMOVED.
    // function playMusic() {
    //     if (audioBuffer && audioContext) {
    //         if (audioSource) {
    //             audioSource.stop();
    //         }
    //         audioSource = audioContext.createBufferSource();
    //         audioSource.buffer = audioBuffer;
    //         // Connect source to Meyda and destination
    //         audioSource.connect(audioContext.destination);

    //         // Initialize Meyda
    //         if (typeof Meyda === "undefined") {
    //             console.error("Meyda library not loaded!");
    //             return;
    //         }
            
    //         meyda = new Meyda({
    //             audioContext: audioContext,
    //             source: audioSource,
    //             bufferSize: 512, // Standard buffer size
    //             featureExtractors: ['spectralFlux', 'rms'], // Specify features
    //             callback: (features) => {
    //                 // Beat detection logic
    //                 const currentTimeMs = audioContext.currentTime * 1000;
    //                 if (features.spectralFlux > lastSpectralFlux + FLUX_THRESHOLD &&
    //                     (currentTimeMs - lastNoteTimeMs) > MIN_TIME_BETWEEN_NOTES_MS) {
                        
    //                     console.log('Beat detected! Flux:', features.spectralFlux.toFixed(3), 'RMS:', features.rms.toFixed(3));
    //                     // Generate note on a random track (0-3)
    //                     generateNote(Math.floor(Math.random() * tracks.length)); 
    //                     lastNoteTimeMs = currentTimeMs;
    //                 }
    //                 lastSpectralFlux = features.spectralFlux;
    //             }
    //         });
            
    //         audioSource.start(0);
    //         meyda.start(); // Start Meyda feature extraction
    //         console.log('Music playback started with Meyda.');
    //         // startNoteGeneration(); // Old method, replaced by Meyda callback
    //     } else {
    //         console.log('No audio loaded to play.');
    //     }
    // }

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

        // Designate Overdrive Notes (20% chance)
        if (Math.random() < 0.2) {
            noteElement.classList.add('note-overdrive');
        }

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

    // Removing startNoteGeneration as it's dead code.
    // function startNoteGeneration() {
    //     if (noteGenerationInterval) {
    //         clearInterval(noteGenerationInterval);
    //     }
    //     noteGenerationInterval = setInterval(() => {
    //         const randomTrack = Math.floor(Math.random() * tracks.length);
    //         generateNote(randomTrack);
    //     }, NOTE_GENERATION_INTERVAL_MS);
    // }


    // Call this when audio stops or is paused (This function seems fine)
    function stopMeydaAndNotes() {
        if (meyda) {
            meyda.stop();
            console.log('Meyda stopped.');
        }
        // Optional: Clear notes
    }

    // This is the CONSOLIDATED and CORRECTED playMusic function
    function playMusic() {
        resumeAudioContext(); // Ensure context is active

        if (!audioBuffer) {
            console.error('No audio buffer available to play.');
            playButton.textContent = 'Load Music First';
            return;
        }
        if (!audioContext) {
            console.error('AudioContext not initialized.');
            playButton.textContent = 'Audio Error';
            return;
        }

        console.log('Attempting to play music. AudioContext state:', audioContext.state);

        if (audioSource) {
            try {
                audioSource.stop();
                console.log('Previous audioSource stopped.');
            } catch (e) {
                console.warn('Error stopping previous audioSource (might have already finished):', e);
            }
        }
        if (meyda) {
            meyda.stop();
            console.log('Previous Meyda instance stopped.');
        }

        audioSource = audioContext.createBufferSource();
        console.log('New AudioBufferSourceNode created.');
        audioSource.buffer = audioBuffer;
        console.log('AudioBuffer assigned to source. Duration:', audioBuffer.duration.toFixed(2) + 's');

        // Standard connection: source -> destination (for playback)
        // Meyda analyzes the source in parallel.
        audioSource.connect(audioContext.destination);
        console.log('AudioSource connected to AudioContext.destination.');

        // Step 1: Verify Meyda Library Loaded
        if (typeof Meyda === 'undefined') {
            console.error("Meyda library is not loaded!");
            playButton.textContent = "Meyda Load Error"; // Updated button text
            return;
        }
        
        // Step 2: Review Meyda Initialization (audioContext and audioSource should be valid here based on prior checks)
        console.log('Initializing Meyda...');
        try {
            meyda = new Meyda({
                audioContext: audioContext,
                source: audioSource, 
                bufferSize: 512,
                featureExtractors: ['spectralFlux', 'rms'], 
                callback: (features) => {
                    if (!features) {
                        return;
                    }
                    const currentTimeMs = audioContext.currentTime * 1000;
                    if (features.spectralFlux > lastSpectralFlux + FLUX_THRESHOLD &&
                        (currentTimeMs - lastNoteTimeMs) > MIN_TIME_BETWEEN_NOTES_MS) {
                        console.log('Beat! Flux:', features.spectralFlux.toFixed(3), 'RMS:', features.rms.toFixed(3));
                        generateNote(Math.floor(Math.random() * tracks.length));
                        lastNoteTimeMs = currentTimeMs;
                    }
                    lastSpectralFlux = features.spectralFlux;
                }
            });
            console.log("Meyda instance created successfully.");
        } catch (e) {
            console.error("Error creating Meyda instance:", e);
            playButton.textContent = "Meyda Init Error"; // Updated button text
            return; // Stop further execution if Meyda fails to initialize
        }
        
        audioSource.onended = () => {
            console.log("Audio source playback ended.");
            if (meyda) {
                try {
                    meyda.stop();
                    console.log("Meyda stopped due to audio source end.");
                } catch (e) {
                    console.error("Error stopping Meyda on audio end:", e);
                }
            }
            playButton.textContent = 'Play Music'; 
            lastSpectralFlux = 0;
            lastNoteTimeMs = 0;
        };
        
        try {
            console.log('Starting audioSource.start(0)...');
            audioSource.start(0); // Start audio playback
            console.log('AudioSource started.');

            if (meyda) { // Check if Meyda instance was successfully created
                meyda.start(); // Start Meyda feature extraction
                console.log("Meyda started successfully.");
            }
            playButton.textContent = 'Playing...';
            console.log('Music playback initiated.');
        } catch (e) {
            console.error('Error starting audioSource or Meyda:', e);
            playButton.textContent = 'Playback/Meyda Start Error'; // General error for this block
            // Attempt to stop Meyda if it was started before an error in audioSource.start() or vice-versa (though less likely here)
            if (meyda && typeof meyda.stop === 'function') {
                try {
                    meyda.stop();
                } catch (stopErr) {
                    console.error('Nested error stopping Meyda after start error:', stopErr);
                }
            }
        }
    }

    // --- User Input Handling ---
    const KEY_TO_TRACK = {
        '1': 0, 'd': 0, // Key '1' or 'd' for Track 1
        '2': 1, 'f': 1, // Key '2' or 'f' for Track 2
        '3': 2, 'j': 2, // Key '3' or 'j' for Track 3
        '4': 3, 'k': 3  // Key '4' or 'k' for Track 4
    };

    window.addEventListener('keydown', handleKeyPress);

    function handleKeyPress(event) {
        // Handle Overdrive Activation
        if (event.key === OVERDRIVE_ACTIVATION_KEY) {
            if (overdriveMeterValue === OVERDRIVE_MAX_VALUE && !isOverdriveActive) {
                activateOverdrive();
            }
            event.preventDefault(); // Prevent spacebar from scrolling page etc.
            return;
        }

        const trackNumber = KEY_TO_TRACK[event.key.toLowerCase()];
        if (trackNumber !== undefined) {
            tracks[trackNumber].classList.add('active');
            setTimeout(() => tracks[trackNumber].classList.remove('active'), 100);
            checkHit(trackNumber);
        }
    }

    // --- Overdrive Logic ---
    function activateOverdrive() {
        isOverdriveActive = true;
        console.log("OVERDRIVE ACTIVATED!");
        if (gameContainerElement) gameContainerElement.classList.add('overdrive-active-bg');
        
        // Start depletion
        if (overdriveDepletionInterval) clearInterval(overdriveDepletionInterval); // Clear any existing
        overdriveDepletionInterval = setInterval(depleteOverdrive, 1000); // Depletes every second
        
        updateScoreDisplay(); // Update multiplier display immediately
    }

    function depleteOverdrive() {
        overdriveMeterValue -= OVERDRIVE_DEPLETION_RATE;
        updateOverdriveDisplay();
        if (overdriveMeterValue <= 0) {
            deactivateOverdrive();
        }
    }

    function deactivateOverdrive() {
        isOverdriveActive = false;
        overdriveMeterValue = 0; 
        updateOverdriveDisplay();
        if (overdriveDepletionInterval) clearInterval(overdriveDepletionInterval);
        overdriveDepletionInterval = null;
        console.log("OVERDRIVE DEACTIVATED!");
        if (gameContainerElement) gameContainerElement.classList.remove('overdrive-active-bg');
        updateScoreDisplay(); // Update multiplier display
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
                
                // Check for Overdrive note hit
                if (note.classList.contains('note-overdrive') && !isOverdriveActive) {
                    overdriveMeterValue = Math.min(OVERDRIVE_MAX_VALUE, overdriveMeterValue + OVERDRIVE_FILL_PER_NOTE);
                    updateOverdriveDisplay();
                    console.log('Overdrive note hit! Meter:', overdriveMeterValue);
                }

                note.classList.add('hit-animation');
                setTimeout(() => note.remove(), 200);
                handleHit(); // Pass trackElement for hit feedback
                hitOccurred = true;
                
                // Visual feedback for hit on track
                trackElement.classList.add('hit');
                setTimeout(() => trackElement.classList.remove('hit'), 100);

                break; 
            }
        }

        // No penalty for mistimed presses for now
    }


    // --- Score and Multiplier Update ---
    function updateScoreDisplay() {
        scoreElement.textContent = score;
        let displayMultiplier = multiplier;
        if (isOverdriveActive) {
            displayMultiplier *= 2;
        }
        multiplierElement.textContent = `${displayMultiplier}x`;
    }

    function handleHit() { // Now only updates score and base multiplier
        let currentHitScore = BASE_SCORE_PER_HIT;
        let actualMultiplier = multiplier;

        if (isOverdriveActive) {
            actualMultiplier *= 2;
        }
        score += currentHitScore * actualMultiplier;
        
        if (!isOverdriveActive && multiplier < MAX_MULTIPLIER) { // Multiplier only increases if Overdrive is NOT active
            multiplier++;
        }
        updateScoreDisplay();
    }

    function handleMiss() {
        multiplier = 1; // Reset base multiplier
        if (isOverdriveActive) {
            deactivateOverdrive(); // Deactivate Overdrive on miss
        }
        updateScoreDisplay();
    }

    // Initialize display
    updateScoreDisplay();
    updateOverdriveDisplay(); // Initial call for Overdrive meter
    createPlayButton(); 

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
