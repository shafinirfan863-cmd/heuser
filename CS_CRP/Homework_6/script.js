/**
 * Mochi's Pet Care — Stage 1: Core Logic
 *
 * Game states: IDLE → RUNNING ↔ PAUSED → GAME_OVER
 * All tuning constants live in CONFIG.
 * Entry point: DOMContentLoaded at the bottom.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── CONFIG (single source of truth for all tuning numbers) ──
    const CONFIG = {
        TICK_INTERVAL_MS  : 1000,

        // Decay per tick (while RUNNING)
        HUNGER_DECAY      : 2,
        HAPPINESS_DECAY   : 1.5,
        ENERGY_DECAY      : 1,

        // Action effects (applied once per click)
        FEED_HUNGER       :  15,
        FEED_ENERGY       : -5,
        PLAY_HAPPINESS    :  15,
        PLAY_ENERGY       : -10,
        SLEEP_ENERGY      :  20,
        SLEEP_HUNGER      : -5,

        // Stat boundaries
        STAT_MIN          : 0,
        STAT_MAX          : 100,
        INITIAL_HUNGER    : 50,
        INITIAL_HAPPINESS : 50,
        INITIAL_ENERGY    : 50,

        // Cooldowns (ms)
        FEED_COOLDOWN     : 2000,
        PLAY_COOLDOWN     : 3000,
        SLEEP_COOLDOWN    : 4000,
    };

    // ── STATE ───────────────────────────────────────
    let gameState  = 'IDLE';   // IDLE | RUNNING | PAUSED | GAME_OVER
    let stats      = { hunger: 0, happiness: 0, energy: 0 };
    let intervalId = null;
    let elapsedSec = 0;

    // Cooldown tracking for each action
    let cooldownState = {
        feed  : { timeoutId: null, endTime: null, pausedRemaining: null },
        play  : { timeoutId: null, endTime: null, pausedRemaining: null },
        sleep : { timeoutId: null, endTime: null, pausedRemaining: null },
    };

    // ── DOM REFS (cached once) ──────────────────────
    const startScreen      = document.getElementById('start-screen');
    const gameScreen        = document.getElementById('game-screen');
    const gameOverScreen    = document.getElementById('game-over-screen');
    const gameOverMessage   = document.getElementById('game-over-message');

    const hungerBar         = document.getElementById('hunger-bar');
    const happinessBar      = document.getElementById('happiness-bar');
    const energyBar         = document.getElementById('energy-bar');
    const hungerValue       = document.getElementById('hunger-value');
    const happinessValue    = document.getElementById('happiness-value');
    const energyValue       = document.getElementById('energy-value');
    const timerDisplay      = document.getElementById('timer-display');

    const btnStart          = document.getElementById('btn-start');
    const btnFeed           = document.getElementById('btn-feed');
    const btnPlay           = document.getElementById('btn-play');
    const btnSleep          = document.getElementById('btn-sleep');
    const btnPause          = document.getElementById('btn-pause');
    const btnResume         = document.getElementById('btn-resume');
    const btnRestart        = document.getElementById('btn-restart');
    const btnRestartGameover = document.getElementById('btn-restart-gameover');

    // Default button labels (used to reset text after cooldown)
    const BUTTON_LABELS = {
        feed  : '\u{1F356} Feed',
        play  : '\u{1F3BE} Play',
        sleep : '\u{1F4A4} Sleep',
    };

    // Map action names to their button elements
    const ACTION_BUTTONS = {
        feed  : btnFeed,
        play  : btnPlay,
        sleep : btnSleep,
    };

    // ── UTILITIES ───────────────────────────────────

    /** Clamp a number to [min, max]. */
    function clamp(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }

    /** Format seconds as mm:ss. */
    function formatTime(totalSec) {
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    /** Clamp all stats to [STAT_MIN, STAT_MAX]. */
    function clampAllStats() {
        stats.hunger    = clamp(stats.hunger,    CONFIG.STAT_MIN, CONFIG.STAT_MAX);
        stats.happiness = clamp(stats.happiness, CONFIG.STAT_MIN, CONFIG.STAT_MAX);
        stats.energy    = clamp(stats.energy,    CONFIG.STAT_MIN, CONFIG.STAT_MAX);
    }

    // ── STATE TRANSITIONS ───────────────────────────

    function startGame() {
        stats.hunger    = CONFIG.INITIAL_HUNGER;
        stats.happiness = CONFIG.INITIAL_HAPPINESS;
        stats.energy    = CONFIG.INITIAL_ENERGY;
        elapsedSec      = 0;
        gameState       = 'RUNNING';
        startLoop();
        updateUI();
    }

    function pauseGame() {
        if (gameState !== 'RUNNING') return;
        gameState = 'PAUSED';
        stopLoop();
        freezeCooldowns();
        updateUI();
    }

    function resumeGame() {
        if (gameState !== 'PAUSED') return;
        gameState = 'RUNNING';
        startLoop();
        restoreCooldowns();
        updateUI();
    }

    function triggerGameOver(causeStat) {
        gameState = 'GAME_OVER';
        stopLoop();
        clearAllCooldowns();
        gameOverMessage.textContent =
            "Mochi's " + causeStat + " reached zero! You survived " + formatTime(elapsedSec) + ".";
        updateUI();
    }

    function restartGame() {
        stopLoop();
        clearAllCooldowns();
        gameState = 'IDLE';
        updateUI();
    }

    // ── GAME LOOP ───────────────────────────────────

    function startLoop() {
        // Guard against double intervals
        if (intervalId !== null) {
            clearInterval(intervalId);
        }
        intervalId = setInterval(tick, CONFIG.TICK_INTERVAL_MS);
    }

    function stopLoop() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    function tick() {
        if (gameState !== 'RUNNING') return;   // safety guard

        // Decay stats
        stats.hunger    -= CONFIG.HUNGER_DECAY;
        stats.happiness -= CONFIG.HAPPINESS_DECAY;
        stats.energy    -= CONFIG.ENERGY_DECAY;

        clampAllStats();

        elapsedSec++;

        updateUI();

        // Check game-over AFTER UI update so the player sees the final state
        checkGameOver();
    }

    /**
     * Check if any stat has reached zero.
     * Priority order: hunger → happiness → energy.
     */
    function checkGameOver() {
        if (gameState !== 'RUNNING') return;

        if (stats.hunger <= 0) {
            triggerGameOver('hunger');
        } else if (stats.happiness <= 0) {
            triggerGameOver('happiness');
        } else if (stats.energy <= 0) {
            triggerGameOver('energy');
        }
    }

    // ── PLAYER ACTIONS ──────────────────────────────

    function feedPet() {
        if (gameState !== 'RUNNING') return;
        if (cooldownState.feed.timeoutId !== null) return;

        stats.hunger += CONFIG.FEED_HUNGER;
        stats.energy += CONFIG.FEED_ENERGY;
        clampAllStats();

        startCooldown('feed', CONFIG.FEED_COOLDOWN);
        updateUI();
        checkGameOver();   // action may have zeroed a stat
    }

    function playWithPet() {
        if (gameState !== 'RUNNING') return;
        if (cooldownState.play.timeoutId !== null) return;

        stats.happiness += CONFIG.PLAY_HAPPINESS;
        stats.energy    += CONFIG.PLAY_ENERGY;
        clampAllStats();

        startCooldown('play', CONFIG.PLAY_COOLDOWN);
        updateUI();
        checkGameOver();
    }

    function putPetToSleep() {
        if (gameState !== 'RUNNING') return;
        if (cooldownState.sleep.timeoutId !== null) return;

        stats.energy += CONFIG.SLEEP_ENERGY;
        stats.hunger += CONFIG.SLEEP_HUNGER;
        clampAllStats();

        startCooldown('sleep', CONFIG.SLEEP_COOLDOWN);
        updateUI();
        checkGameOver();
    }

    // ── COOLDOWN MANAGEMENT ─────────────────────────

    /**
     * Start a cooldown timer for the given action.
     * Disables the button and shows remaining seconds.
     */
    function startCooldown(action, durationMs) {
        const btn = ACTION_BUTTONS[action];
        const cd  = cooldownState[action];

        cd.endTime         = Date.now() + durationMs;
        cd.pausedRemaining = null;
        btn.disabled       = true;

        updateCooldownDisplay(action);

        cd.timeoutId = setTimeout(() => {
            cd.timeoutId = null;
            cd.endTime   = null;
            // Only re-enable if game is still RUNNING
            if (gameState === 'RUNNING') {
                btn.disabled    = false;
                btn.textContent = BUTTON_LABELS[action];
            }
        }, durationMs);
    }

    /**
     * Update a single action button's text to show cooldown countdown.
     */
    function updateCooldownDisplay(action) {
        const cd  = cooldownState[action];
        const btn = ACTION_BUTTONS[action];

        if (cd.timeoutId !== null && cd.endTime !== null) {
            // Active cooldown (running)
            const remaining = Math.max(0, Math.ceil((cd.endTime - Date.now()) / 1000));
            if (remaining > 0) {
                btn.textContent = BUTTON_LABELS[action] + ' (' + remaining + 's)';
            }
        } else if (cd.pausedRemaining !== null) {
            // Frozen cooldown (paused)
            const remaining = Math.max(0, Math.ceil(cd.pausedRemaining / 1000));
            if (remaining > 0) {
                btn.textContent = BUTTON_LABELS[action] + ' (' + remaining + 's)';
            }
        }
    }

    /**
     * Freeze all active cooldowns — store remaining ms and clear timeouts.
     * Called when pausing.
     */
    function freezeCooldowns() {
        for (const action in cooldownState) {
            const cd = cooldownState[action];
            if (cd.timeoutId !== null) {
                const remaining = cd.endTime - Date.now();
                cd.pausedRemaining = Math.max(0, remaining);
                clearTimeout(cd.timeoutId);
                cd.timeoutId = null;
                cd.endTime   = null;
            }
        }
    }

    /**
     * Restore frozen cooldowns with their remaining durations.
     * Called when resuming.
     */
    function restoreCooldowns() {
        for (const action in cooldownState) {
            const cd = cooldownState[action];
            if (cd.pausedRemaining !== null && cd.pausedRemaining > 0) {
                startCooldown(action, cd.pausedRemaining);
            } else if (cd.pausedRemaining !== null) {
                // Cooldown effectively expired while paused (0 ms remaining)
                cd.pausedRemaining = null;
                ACTION_BUTTONS[action].disabled    = false;
                ACTION_BUTTONS[action].textContent = BUTTON_LABELS[action];
            }
        }
    }

    /**
     * Clear all cooldowns — cancel timeouts, enable buttons, reset state.
     * Called on game over and restart.
     */
    function clearAllCooldowns() {
        for (const action in cooldownState) {
            const cd = cooldownState[action];
            if (cd.timeoutId !== null) {
                clearTimeout(cd.timeoutId);
            }
            cd.timeoutId       = null;
            cd.endTime         = null;
            cd.pausedRemaining = null;
            ACTION_BUTTONS[action].disabled    = false;
            ACTION_BUTTONS[action].textContent = BUTTON_LABELS[action];
        }
    }

    // ── UI UPDATE ───────────────────────────────────

    /**
     * Single function that refreshes the entire UI based on current gameState.
     * Called after every state change, action, and tick.
     */
    function updateUI() {
        // ── Screen visibility ──
        startScreen.classList.toggle('hidden',    gameState !== 'IDLE');
        gameScreen.classList.toggle('hidden',      gameState !== 'RUNNING' && gameState !== 'PAUSED');
        gameOverScreen.classList.toggle('hidden',  gameState !== 'GAME_OVER');

        // ── Game screen updates (RUNNING or PAUSED) ──
        if (gameState === 'RUNNING' || gameState === 'PAUSED') {
            // Stat bars and numeric labels
            hungerBar.value      = Math.round(stats.hunger);
            happinessBar.value   = Math.round(stats.happiness);
            energyBar.value      = Math.round(stats.energy);

            hungerValue.textContent    = Math.round(stats.hunger)    + '/100';
            happinessValue.textContent = Math.round(stats.happiness) + '/100';
            energyValue.textContent    = Math.round(stats.energy)    + '/100';

            // Timer
            timerDisplay.textContent = formatTime(elapsedSec);

            // Pause / Resume button visibility
            btnPause.classList.toggle('hidden',  gameState !== 'RUNNING');
            btnResume.classList.toggle('hidden',  gameState !== 'PAUSED');

            // Cooldown countdown text
            for (const action in cooldownState) {
                updateCooldownDisplay(action);
            }

            // Action button enabled state
            if (gameState === 'PAUSED') {
                // All action buttons disabled when paused
                btnFeed.disabled  = true;
                btnPlay.disabled  = true;
                btnSleep.disabled = true;
            } else {
                // RUNNING: enable buttons that are NOT on cooldown
                for (const action in cooldownState) {
                    const cd = cooldownState[action];
                    if (cd.timeoutId === null && cd.pausedRemaining === null) {
                        ACTION_BUTTONS[action].disabled    = false;
                        ACTION_BUTTONS[action].textContent = BUTTON_LABELS[action];
                    }
                }
            }
        }
    }

    // ── EVENT LISTENERS ─────────────────────────────
    btnStart.addEventListener('click', startGame);
    btnFeed.addEventListener('click', feedPet);
    btnPlay.addEventListener('click', playWithPet);
    btnSleep.addEventListener('click', putPetToSleep);
    btnPause.addEventListener('click', pauseGame);
    btnResume.addEventListener('click', resumeGame);
    btnRestart.addEventListener('click', restartGame);
    btnRestartGameover.addEventListener('click', restartGame);

    // ── INIT ────────────────────────────────────────
    updateUI();   // Render initial IDLE state

});
