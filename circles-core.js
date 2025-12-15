// circles-core.js

///////////////////////////////////////////////////////
// CORE: Ring + CirclesGame (constructor, loop, math)
///////////////////////////////////////////////////////

class Ring {
    constructor(level, baseRate) {
        this.level = level;
        this.baseRate = baseRate;

        // progress: [0, LOOP_THRESHOLD)
        // ticks: number of wraps (from base-N representation).
        this.progress = 0;
        this.ticks = 0;

        // For solid rendering + smoothed multiplier
        this.solid = false;
        this.multAverage = null;
    }

    exists() {
        // Ring 0 always exists.
        // Higher rings appear if they have any progress or ticks.
        return this.level === 0 || this.progress > 0 || this.ticks > 0;
    }
}

class CirclesGame {
    constructor(canvas, infoBox) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.infoBox = infoBox;

        // Base rate for ring 0.
        this.baseRates = [
            10
        ];

        this.rings = [];
        this.addRing();    // ring 0

        // Fractional progress of the *bottom* ring toward its next completion.
        this.rings[0].progress = 0;

        // Total number of *full* completions of ring 0.
        this.totalUnits = 0;

        this.lastTime = performance.now();
        this.lastDt = 0;
        this.loopRate0 = 0;

        // Dynamic parameters (upgradable)
        this.baseLoopThreshold = LOOP_THRESHOLD;
        this.loopThreshold = LOOP_THRESHOLD;

        this.baseBaseRate = this.baseRates[0];

        this.baseMultScale = 1.0;
        this.multScale = 1.0;

        // Keep copies of the original defaults for stage handicaps
        this.defaultBaseLoopThreshold = this.baseLoopThreshold;
        this.defaultBaseBaseRate = this.baseBaseRate;
        this.defaultBaseMultScale = this.baseMultScale;

        // Upgrades: [rate x2, threshold, mult, boost others]
        this.upgradeLevels = [0, 0, 0, 0];
        this.upgradeButtons = [null, null, null, null];

        // Top scientific notation state
        this.sciLabelAlpha = 0;

        // Stage meta
        this.stageCount = 9;
        this.stageCompleted = new Array(this.stageCount).fill(false);
        this.activeStageIndex = 0;

        this.completedStageSpheres = [];

        this.stagesModalVisible = false;
        this.stagesModalBounds = null;  // where the modal is drawn
        this.stageRowBounds = [];       // clickable rows
        this.stageModalCloseBounds = null; // X button

        // NEW: meta-upgrade UI bounds for the points panel
        this.stageMetaButtons = [];     // [{ x, y, w, h, index }]
        this.stageRespecBounds = null;  // { x, y, w, h }
        this.hoveredStageMetaIndex = null;

        // Timer for auto-opening the stages modal after a clear
        this.stageModalTimer = {
            active: false,
            t: 0,
            delay: 3.0   // seconds
        };

        // Run-complete shrink animation (sphere moves to its slot)
        this.runCompleteAnim = {
            active: false,
            t: 0,
            duration: 1.2,      // seconds
            targetOffset: 0,    // computed in draw based on canvas size
            targetRadiusScale: 0.2
        };

        // Once the run sphere is finished and parked
        this.completedSphereStatic = false;

        // Single-run completion flash (pulse from the sphere)
        this.runCompleteFlash = {
            active: false,
            timer: 0,
            duration: 2.0,       // pulse lives a bit longer
            holdTime: 1.0,       // sphere stays in place for ~1s
            startedShrink: false // new flag so we only trigger shrink once
        };

        this.pendingStageSphereStage = null;
        this.requireStageChange = false;

        this.trophyOrbitAngle = 0;

        // Total playtime for the current run (seconds)
        this.totalPlayTime = 0;

        // Win animation state (full game win, separate from run-complete)
        this.winState = {
            active: false,
            timer: 0,
            duration: 4.0
        };

        this.winClickDelay = 3;

        this.winPulses = [];            // [{ t }]

        // Track the highest ring digit to detect its wrap
        this.lastTopDigit = null;

        // NEW: track highest ring ticks so we only trigger on a real wrap
        this.lastTopTicks = null;

        // NEW: used to guard completion detection against spending
        this._totalUnitsBeforeFrame = 0;

        // Global speed scale (ArrowUp / ArrowDown)
        this.speedScale = 1.0;

        // FPS tracking
        this.showFps = false;
        this.fps = 0;
        this.fpsSmoothing = 0.999; // closer to 1 means more smoothing

        this.devUnlocked = false;
        this.devToolsEnabled = false;

        // Overall fade for completion animation (1 -> 0.6 while shrinking)
        this.completionAlpha = 1.0;

        // Default cursor; hover will switch to pointer only over buttons.
        this.canvas.style.cursor = "default";

        window.addEventListener("resize", () => this.resize());
        this.resize();

        // Click / hover for upgrades
        this.canvas.addEventListener("click", (e) => this.handleClick(e));
        this.canvas.addEventListener("mousemove", (e) => this.handleHover(e));

        // Keyboard controls: ArrowUp, ArrowDown, Enter
        window.addEventListener("keydown", (e) => this.handleKey(e));

        requestAnimationFrame((t) => this.loop(t));
    }
}

///////////////////////////////////////////////////////
// Ring management
///////////////////////////////////////////////////////

CirclesGame.prototype.addRing = function () {
    const level = this.rings.length;
    const base =
        this.baseRates[level] ||
        this.baseRates[this.baseRates.length - 1] * 0.75;

    this.rings.push(new Ring(level, base));
};

CirclesGame.prototype.ensureRings = function (count) {
    while (this.rings.length < count) {
        this.addRing();
    }
};

CirclesGame.prototype.resetAll = function () {
    // Core run state
    this.rings = [];
    this.addRing(); // ring 0 only
    this.rings[0].progress = 0;
    this.rings[0].solid = false;
    this.rings[0].multAverage = null;

    this.totalUnits = 0;
    this.lastTime = performance.now();
    this.lastDt = 0;
    this.loopRate0 = 0;

    // Dynamic params
    this.loopThreshold = this.baseLoopThreshold;
    this.multScale = this.baseMultScale;
    this.upgradeLevels = [0, 0, 0, 0];

    // Top label + win tracking
    this.sciLabelAlpha = 0;
    this.winState.active = false;
    this.winState.timer = 0;
    this.lastTopDigit = null;
    this.lastTopTicks = null;
    this.winPulses = [];

    this.trophyOrbitAngle = 0;

    // Reset playtime for a fresh run
    this.totalPlayTime = 0;

    // Run-complete animation state
    this.runCompleteAnim.active = false;
    this.runCompleteAnim.t = 0;
    this.completedSphereStatic = false;

    this.runCompleteFlash.active = false;
    this.runCompleteFlash.timer = 0;
    this.runCompleteFlash.startedShrink = false;

    // Completion fade reset
    this.completionAlpha = 1.0;

    // Global speed
    this.speedScale = 1.0;

    // Stage meta: fully wipe progress
    this.stageCount = this.stageCount || 9;
    this.stageCompleted = new Array(this.stageCount).fill(false);
    this.activeStageIndex = 0;
    this.completedStageSpheres = [];
    this.stagePoints = 0;
    this.stagePointLevels = [];

    // New flags related to stage trophies
    this.pendingStageSphereStage = null;
    this.requireStageChange = false;

    // Hide stages modal and clear click targets
    this.stagesModalVisible = false;
    this.stageRowBounds = [];
    this.stageModalCloseBounds = null;

    // NEW: clear meta UI bounds / hover
    this.stageMetaButtons = [];
    this.stageRespecBounds = null;
    this.hoveredStageMetaIndex = null;

    if (typeof this.updateStagesToggleVisibility === "function") {
        this.updateStagesToggleVisibility();
    }

    // Reset delayed stages-modal timer
    if (this.stageModalTimer) {
        this.stageModalTimer.active = false;
        this.stageModalTimer.t = 0;
    }
};

///////////////////////////////////////////////////////
// Run-complete animations (flash + shrink)
///////////////////////////////////////////////////////

CirclesGame.prototype.startRunCompleteFlash = function () {
    // Always use the current stage’s angle
    const angle = this.getStageAngle(this.activeStageIndex);

    this.runCompleteFlash = {
        active: true,
        timer: 0,
        duration: 1.5,
        holdTime: 1.5,
        targetAngle: angle,
        startedShrink: false
    };

    this.runCompleteAnim = {
        active: false,
        t: 0,
        duration: this.runCompleteAnim && this.runCompleteAnim.duration
            ? this.runCompleteAnim.duration
            : 1.2,
        angle: angle,
        targetOffset: 0,
        targetRadiusScale: STAGE_SPHERE_RADIUS_FACTOR
    };

    this.completedSphereStatic = false;
};

CirclesGame.prototype.startRunCompleteAnim = function () {
    // Always use the current stage’s angle
    const angle = this.getStageAngle(this.activeStageIndex);

    this.runCompleteAnim = {
        active: true,
        t: 0,
        duration: this.runCompleteAnim && this.runCompleteAnim.duration
            ? this.runCompleteAnim.duration
            : 1.2,
        angle: angle,
        targetOffset: 0,
        targetRadiusScale: this.runCompleteAnim && this.runCompleteAnim.targetRadiusScale
            ? this.runCompleteAnim.targetRadiusScale
            : STAGE_SPHERE_RADIUS_FACTOR
    };

    this.completedSphereStatic = false;
};

CirclesGame.prototype.startWinAnimation = function () {
    this.winState.active = true;
    this.winState.timer = 0;

    // Reset win pulses for this win sequence
    this.winPulses = [];
    this._winSpawnAccumulator = 0;
};

CirclesGame.prototype.markGameCompleted = function () {
    if (!this.devUnlocked) {
        this.devUnlocked = true;
        // Persist this so dev tools stay unlocked across reloads.
        this.saveLocal();
    }
};

///////////////////////////////////////////////////////
// Integer <-> rings mapping
///////////////////////////////////////////////////////

CirclesGame.prototype.rebuildFromTotal = function () {
    this.ensureRings(1);

    let units = this.totalUnits;
    let level = 1;

    while (units > 0) {
        this.ensureRings(level + 1);
        const ring = this.rings[level];

        const digit = units % this.loopThreshold;
        const carry = Math.floor(units / this.loopThreshold);

        ring.progress = digit;
        ring.ticks = carry;

        units = carry;
        level += 1;
    }

    // Zero out any higher rings beyond the highest used.
    for (let i = level; i < this.rings.length; i++) {
        const ring = this.rings[i];
        ring.progress = 0;
        ring.ticks = 0;
        ring.solid = false;
        ring.multAverage = null;
    }
};

///////////////////////////////////////////////////////
// Stages meta helpers (UI wiring lives in render-stages.js)
///////////////////////////////////////////////////////

// Advance the delayed stages-modal timer, if active.
CirclesGame.prototype.updateStageModalTimer = function (dt) {
    if (!this.stageModalTimer || !this.stageModalTimer.active) {
        return;
    }

    this.stageModalTimer.t += dt;
    if (this.stageModalTimer.t >= this.stageModalTimer.delay) {
        this.stageModalTimer.active = false;
        this.stageModalTimer.t = 0;

        // Only open the modal if the UI is wired
        if (typeof this.showStagesModal === "function") {
            this.showStagesModal();
        }
    }
};

// Called whenever a run is fully completed (top ring wraps from >0 to 0).
// Marks the current stage as completed and starts the delayed modal if needed.
CirclesGame.prototype.handleStageCompletion = function () {
    const count = this.stageCount || 9;

    let idx = this.activeStageIndex;
    if (idx == null || idx < 0 || idx >= count) {
        idx = 0;
        this.activeStageIndex = 0;
    }

    const wasCompleted = !!this.stageCompleted[idx];
    // Stages are only completable once
    if (wasCompleted) {
        return;
    }

    this.stageCompleted[idx] = true;

    // Final stage: no trophy sphere, just mark completion and bail.
    const finalIndex = (this.stageCount || 9) - 1;
    const isFinalStage = idx === finalIndex;

    if (isFinalStage) {
        // Still persist completion and UI state.
        this.saveLocal();
        if (typeof this.updateStagesToggleVisibility === "function") {
            this.updateStagesToggleVisibility();
        }

        // Do not create a completedStageSphere, do not start shrink.
        // Whatever win/run-complete logic you have runs elsewhere.
        return;
    }

    // Stable orbit angle for this (non-final) stage
    const angle = this.getStageAngle(idx);

    // Pick a color for this stage
    let color = "#ffffff";
    if (typeof this.ringColor === "function") {
        color = this.ringColor(idx);
    }

    const loopsAtCompletion = this.totalUnits;

    if (!this.completedStageSpheres) {
        this.completedStageSpheres = [];
    }

    let sphere = this.completedStageSpheres.find(s => s.stage === idx);
    if (sphere) {
        sphere.angle = angle;
        sphere.color = color;
        sphere.loops = loopsAtCompletion;
    } else {
        sphere = {
            stage: idx,
            angle: angle,
            color: color,
            loops: loopsAtCompletion
        };
        this.completedStageSpheres.push(sphere);
    }

    // Fresh animation state for this completed trophy
    sphere.spawned = false;              // waits for shrink to finish
    sphere.spinT = 0;                    // start from base pose at t = 0

    // Let update() know which stage’s trophy to “spawn” when shrink is done
    this.pendingStageSphereStage = idx;

    // After a completion, you must pick a different stage before resuming
    this.requireStageChange = true;

    this.saveLocal();

    if (typeof this.updateStagesToggleVisibility === "function") {
        this.updateStagesToggleVisibility();
    }

    // Always start the delayed modal for any non-final stage completion
    if (!this.stageModalTimer) {
        this.stageModalTimer = { active: false, t: 0, delay: 3.0 };
    }
    this.stageModalTimer.active = true;
    this.stageModalTimer.t = 0;
};

CirclesGame.prototype.getStageAngle = function (stageIndex) {
    // We always want 8 non-final stages
    const visibleCount = (this.stageCount || 9) - 1;   // expect 8
    if (visibleCount <= 0) {
        return 0;
    }

    // Clamp stageIndex
    let idx = stageIndex;
    if (idx == null || idx < 0 || idx >= visibleCount) {
        idx = 0;
    }

    // Even spacing: full circle / 8
    const slotAngle = (Math.PI * 2) / visibleCount;     // 45 degrees

    // Offset: half a slot (your “12:30 instead of 12” analogy)
    const offset = slotAngle * (19 / 3);                 // 15 degrees

    // Final angle:
    // idx * slotAngle so trophies increase clockwise
    // + halfOffset so the first one sits halfway between 12 and 1.
    return idx * slotAngle + offset;
};

///////////////////////////////////////////////////////
// Basic getters / spend
///////////////////////////////////////////////////////

CirclesGame.prototype.getTotalUnits = function () {
    return this.totalUnits;
};

CirclesGame.prototype.spend = function (amount) {
    amount = Math.floor(Math.max(0, amount));
    if (amount <= 0) {
        return false;
    }

    if (this.totalUnits < amount) {
        return false;
    }

    this.totalUnits -= amount;
    this.rebuildFromTotal();
    return true;
};

///////////////////////////////////////////////////////
// Core loop
///////////////////////////////////////////////////////

CirclesGame.prototype.loop = function (t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.2);
    this.lastTime = t;
    this.lastDt = dt;

    // FPS tracking: smoothed instantaneous FPS
    if (dt > 0) {
        const instantFps = 1 / dt;
        if (this.fps === 0) {
            this.fps = instantFps;
        } else {
            const a = this.fpsSmoothing != null ? this.fpsSmoothing : 0.9;
            this.fps = this.fps * a + instantFps * (1 - a);
        }
    }

    this.update(dt);
    this.draw();
    this.updateInfo();

    requestAnimationFrame((nt) => this.loop(nt));
};

CirclesGame.prototype.update = function (dt) {
    // NEW: capture starting units so completion detection can ignore spending
    this._totalUnitsBeforeFrame = this.totalUnits;

    // Track total playtime only while not in the win screen
    if (!this.winState.active) {
        this.totalPlayTime = (this.totalPlayTime || 0) + dt;
    }

    // If the win animation is playing, freeze core game logic
    // but keep the win timer and pulse system advancing.
    if (this.winState.active) {
        this.winState.timer += dt;

        const spawnDuration = this.winState.duration || 3.0;  // time window to spawn new pulses
        const pulseLifetime = 20;                            // seconds each pulse lives
        const spawnInterval = (this.winState.timer + 0.1) / 3;                           // seconds between pulse spawns

        // Spawn new pulses only while within the spawn window
        if (this.winState.timer <= spawnDuration) {
            this._winSpawnAccumulator += dt;
            while (this._winSpawnAccumulator >= spawnInterval) {
                this._winSpawnAccumulator -= spawnInterval;

                // One logical pulse per spawn; we will draw it as a pair
                this.winPulses.push({ t: 0 });
            }
        }

        // Advance existing pulses and drop the ones that are done
        for (let i = this.winPulses.length - 1; i >= 0; i--) {
            const pulse = this.winPulses[i];
            pulse.t += dt;
            if (pulse.t > pulseLifetime) {
                this.winPulses.splice(i, 1);
            }
        }

        // No other game logic while win screen is active
        return;
    }

    // Normal game logic only when not in win animation
    this.updateStageModalTimer(dt);

    const flash = this.runCompleteFlash;
    const shrink = this.runCompleteAnim;

    // Run-complete flash phase: pulse active, logic frozen
    if (flash && flash.active) {
        flash.timer += dt;

        // After holdTime, start the sphere shrink/move exactly once
        if (!flash.startedShrink && shrink && flash.timer >= flash.holdTime) {
            flash.startedShrink = true;
            this.startRunCompleteAnim(flash.targetAngle);
        }

        // While flash is active, advance shrink if it has started
        if (shrink && shrink.active) {
            shrink.t += dt;
            if (shrink.t >= shrink.duration) {
                shrink.t = shrink.duration;
                shrink.active = false;
                this.completedSphereStatic = true;

                // Shrink just finished: now the trophy for this stage is allowed to appear
                if (this.pendingStageSphereStage != null && this.completedStageSpheres) {
                    const stageIdx = this.pendingStageSphereStage;
                    const sphere = this.completedStageSpheres.find(s => s.stage === stageIdx);
                    if (sphere) {
                        sphere.spawned = true;          // now it can be drawn
                        sphere.rotationEnabled = true;  // start spinning immediately
                        sphere.spinT = 0;               // start at base yaw/pitch/roll
                    }
                    this.pendingStageSphereStage = null;
                }
            }
        }

        // End the flash after its full duration
        if (flash.timer >= flash.duration) {
            flash.active = false;
        }

        // During flash we do not advance base game logic
        return;
    }

    // After the flash is done, the shrink might still be running
    if (shrink && shrink.active) {
        shrink.t += dt;
        if (shrink.t >= shrink.duration) {
            shrink.t = shrink.duration;
            shrink.active = false;
            this.completedSphereStatic = true;

            // Same: if shrink finishes outside the flash block
            if (this.pendingStageSphereStage != null && this.completedStageSpheres) {
                const stageIdx = this.pendingStageSphereStage;
                const sphere = this.completedStageSpheres.find(s => s.stage === stageIdx);
                if (sphere) {
                    sphere.spawned = true;
                }
                this.pendingStageSphereStage = null;
            }
        }
        // Still in end-of-run animation, no game logic
        return;
    }

    // Once the sphere is parked, stop logic until a new run is started
    if (this.completedSphereStatic) {
        return;
    }

    const r0 = this.rings[0];

    // Recompute parameters from upgrades
    const newThreshold = this.computeLoopThreshold();
    if (newThreshold !== this.loopThreshold) {
        const oldThreshold = this.loopThreshold;
        if (oldThreshold > 0) {
            const ratio = newThreshold / oldThreshold;
            r0.progress *= ratio;
        }

        while (r0.progress >= newThreshold) {
            r0.progress -= newThreshold;
            this.totalUnits += 1;
        }

        this.loopThreshold = newThreshold;
        this.rebuildFromTotal();

        // Reset tracking so threshold changes do not falsely trigger a win.
        this.lastTopDigit = null;
        this.lastTopTicks = null;
    }

    this.multScale = this.computeMultScale();

    // Base rate for ring 0, then apply global speed scale.
    const baseRate0Unscaled = this.computeBaseRate();
    const baseRate0 = baseRate0Unscaled * this.speedScale;

    // Multiplier from higher rings based on their *current* progress.
    // mult_total = Π_{i>=1, ring exists} sqrt( multScale * (progress_i + 1) )
    //
    // SP 3 effect: if enabled, any higher ring with fewer than 4 loops
    // of progress is treated as if it had 4 for multiplier purposes.
    const hasMultFloor = Array.isArray(this.stagePointLevels) &&
    this.stagePointLevels[3] > 0;

    const stageIdx = this.getActiveStageIndexSafe();
    const noLoopMult = this.isNoLoopMultStage();
    const hasHighRingPenalty = this.hasHighRingPenaltyStage();

    let totalMult = 1;

    if (!noLoopMult) {
        for (let i = 1; i < this.rings.length; i++) {
            const ring = this.rings[i];
            if (!ring.exists()) {
                continue;
            }

            let effectiveProgress = ring.progress;
            if (hasMultFloor) {
                effectiveProgress = Math.max(effectiveProgress, 4);
            }

            let term = this.multScale * (effectiveProgress + 1);

            // Stage 1: higher rings contribute less (7% per ring level)
            if (hasHighRingPenalty) {
                const ringLevel = ring.level != null ? ring.level : i;
                const penalty = Math.max(0.07, 1 - 0.07 * ringLevel);
                term *= penalty;
            }

            totalMult *= Math.sqrt(Math.max(0, term));
        }
    }

    const speed0 = baseRate0 * totalMult;

    // Loops per second of ring 0, used later for "solid loop" rendering.
    this.loopRate0 = (this.loopThreshold > 0)
        ? speed0 / this.loopThreshold
        : 0;

    // Advance bottom ring's fractional progress over time.
    r0.progress += speed0 * dt;

    // Convert overshoot into integer completions in one step
    // instead of looping one-by-one (avoids lag when very fast).
    if (this.loopThreshold > 0) {
        const loops = Math.floor(r0.progress / this.loopThreshold);
        if (loops > 0) {
            r0.progress -= loops * this.loopThreshold;
            this.totalUnits += loops;
        }
    }

    // Now that totalUnits changed, rebuild rings[1..] from it.
    this.rebuildFromTotal();

    const stageSlots = this.getStageLoopSlots(this.activeStageIndex);
    const finalIndex = (this.stageCount || 9) - 1;
    const isFinalStage = (stageIdx === finalIndex);

    // On the final stage, completed trophies orbit the center.
    // Orbit speed scales with how many slots (rings) are currently filled.
    if (isFinalStage &&
        this.completedStageSpheres &&
        this.completedStageSpheres.length > 0 &&
        stageSlots > 0) {

        let usedSlots = 0;
        for (let i = 0; i < this.rings.length && usedSlots < stageSlots; i++) {
            if (this.rings[i].exists()) {
                usedSlots++;
            }
        }

        const fillRatio = usedSlots / stageSlots;  // 0..1 as you add rings
        const maxOrbitSpeed = Math.PI * 0.6;       // radians/sec at full slots

        const speed = maxOrbitSpeed * fillRatio;

        if (!this.trophyOrbitAngle) {
            this.trophyOrbitAngle = 0;
        }

        this.trophyOrbitAngle += speed * dt;

        const twoPi = Math.PI * 2;
        if (this.trophyOrbitAngle >= twoPi || this.trophyOrbitAngle <= -twoPi) {
            this.trophyOrbitAngle %= twoPi;
        }
    }

    //////////////////////////////////////////////////////
    // FIXED: Run completion detection should only trigger
    // on a real wrap (ticks increase), not "digit became 0".
    //////////////////////////////////////////////////////
    if (this.rings.length >= stageSlots && stageSlots > 0) {
        const topRing = this.rings[stageSlots - 1];

        const digit = topRing.progress;
        const topTicks = topRing.ticks;

        const canTrigger =
            !this.winState.active &&
            !(this.runCompleteAnim && this.runCompleteAnim.active) &&
            !this.completedSphereStatic;

        // If units went down (spend), we must not count it as a completion.
        const unitsIncreasedOrSame = this.totalUnits >= this._totalUnitsBeforeFrame;

        if (canTrigger &&
            unitsIncreasedOrSame &&
            this.lastTopTicks !== null &&
            topTicks > this.lastTopTicks) {

            // Stage bookkeeping
            if (typeof this.handleStageCompletion === "function") {
                this.handleStageCompletion();
            }

            if (isFinalStage) {
                // Final stage: full win
                this.markGameCompleted();
                if (typeof this.onWin === "function") {
                    this.onWin();
                } else {
                    this.startWinAnimation();
                }
            } else {
                // Non-final stages: do NOT fall back into win logic.
                this.markGameCompleted();

                if (typeof this.onRunComplete === "function") {
                    this.onRunComplete();
                } else if (typeof this.startRunCompleteFlash === "function") {
                    this.startRunCompleteFlash();
                } else if (typeof this.startRunCompleteAnim === "function") {
                    this.startRunCompleteAnim();
                } else {
                    // Hard fallback: park the run so stage picking flow still works.
                    this.completedSphereStatic = true;
                }
            }
        }

        this.lastTopDigit = digit;
        this.lastTopTicks = topTicks;
    } else {
        this.lastTopDigit = null;
        this.lastTopTicks = null;
    }

    // Auto-save current state
    this.saveLocal();
};

CirclesGame.prototype.handleClick = function (event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // If the win screen is showing, only allow reset after a delay
    if (this.winState && this.winState.active) {
        const delay = this.winClickDelay || 0;
        if (this.winState.timer >= delay) {
            this.winState.active = false;
            this.resetAll();
        }
        // Swallow all clicks while the win screen is visible
        return;
    }

    //////////////////////////////////////////////////////
    // 1) Modal open: handle clicks inside modal only
    //////////////////////////////////////////////////////
    if (this.stagesModalVisible) {

        // Close button
        if (this.stageModalCloseBounds) {
            const b = this.stageModalCloseBounds;
            if (x >= b.x && x <= b.x + b.w &&
                y >= b.y && y <= b.y + b.h) {
                // Only allow closing if we are not forced to change stage
                if (!this.requireStageChange) {
                    this.hideStagesModal();
                }
                return;
            }
        }

        // Stage meta-upgrade buttons (in points panel)
        if (Array.isArray(this.stageMetaButtons)) {
            for (let i = 0; i < this.stageMetaButtons.length; i++) {
                const b = this.stageMetaButtons[i];
                if (x >= b.x && x <= b.x + b.w &&
                    y >= b.y && y <= b.y + b.h) {

                    const idx = b.index;

                    // Make sure arrays / counters exist
                    if (typeof this._ensureStagePoints === "function") {
                        this._ensureStagePoints();
                    }

                    const sp = (typeof this.stagePoints === "number") ? this.stagePoints : 0;
                    const levels = Array.isArray(this.stagePointLevels) ? this.stagePointLevels : null;

                    // Hard fallback: if we can see cost and levels, force-buy if affordable
                    if (levels && typeof this.getStagePointUpgradeCost === "function") {
                        const cost = this.getStagePointUpgradeCost(idx);
                        const owned = levels[idx] > 0;

                        // Force it: if not owned and you have enough points, you get it
                        if (!owned && sp >= cost) {
                            this.stagePoints = sp - cost;
                            this.stagePointLevels[idx] = 1;

                            if (typeof this.saveLocal === "function") {
                                this.saveLocal();
                            }

                            // Optionally: you can trigger a redraw flag here if needed
                            return;
                        }
                    }

                    // Fallback to normal logic if for some reason the force path did not trigger
                    if (typeof this.buyStagePointUpgrade === "function") {
                        this.buyStagePointUpgrade(idx);
                    }
                    return;
                }
            }
        }

        // Respec button (also resets current stage progress)
        if (this.stageRespecBounds) {
            const b = this.stageRespecBounds;
            if (x >= b.x && x <= b.x + b.w &&
                y >= b.y && y <= b.y + b.h) {
                if (typeof this.respecStagePointUpgrades === "function") {
                    this.respecStagePointUpgrades();
                }
                // Reset the current stage run as part of respec
                if (typeof this.startStage === "function") {
                    this.startStage(this.activeStageIndex || 0);
                }
                return;
            }
        }

        // Stage cards
        if (Array.isArray(this.stageRowBounds)) {
            for (const row of this.stageRowBounds) {
                if (x >= row.x && x <= row.x + row.w &&
                    y >= row.y && y <= row.y + row.h) {

                    const idx = row.index;
                    const isCurrent = (idx === this.activeStageIndex);
                    const isComplete = this.stageCompleted &&
                        this.stageCompleted[idx];

                    if (isCurrent && !isComplete && !this.requireStageChange) {
                        this.hideStagesModal();
                        return;
                    }

                    this.startStage(idx);
                    this.hideStagesModal();
                    return;
                }
            }
        }

        // Click outside modal:
        // behave like clicking the current stage card.
        if (this.stagesModalBounds) {
            const b = this.stagesModalBounds;
            const inside =
                x >= b.x && x <= b.x + b.w &&
                y >= b.y && y <= b.y + b.h;

            if (!inside) {
                if (this.requireStageChange) {
                    return;
                }

                const idx = (typeof this.activeStageIndex === "number")
                    ? this.activeStageIndex
                    : 0;
                const isComplete = this.stageCompleted &&
                    this.stageCompleted[idx];

                if (!isComplete) {
                    this.hideStagesModal();
                    return;
                }

                this.startStage(idx);
                this.hideStagesModal();
                return;
            }
        }

        // Modal is open and click was inside the modal background only.
        return;
    }

    //////////////////////////////////////////////////////
    // 2) Stages button at bottom
    //////////////////////////////////////////////////////
    if (this.stagesButtonBounds) {
        const b = this.stagesButtonBounds;
        if (x >= b.x && x <= b.x + b.w &&
            y >= b.y && y <= b.y + b.h) {
            this.showStagesModal();
            return;
        }
    }

    //////////////////////////////////////////////////////
    // 3) Upgrade buttons
    //////////////////////////////////////////////////////
    for (let i = 0; i < this.upgradeButtons.length; i++) {
        const btn = this.upgradeButtons[i];
        if (!btn || btn.disabled) {
            continue;
        }

        if (x >= btn.x &&
            x <= btn.x + btn.size &&
            y >= btn.y &&
            y <= btn.y + btn.size) {
            this.buyUpgrade(i);
            return;
        }
    }
};

CirclesGame.prototype.handleHover = function (event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let overInteractive = false;
    let hoveredIndex = null;

    //////////////////////////////////////////////////////
    // 1) Hover inside stages modal, if visible
    //////////////////////////////////////////////////////
    if (this.stagesModalVisible) {
        // Reset hovered meta index each frame
        this.hoveredStageMetaIndex = null;

        // Close button hover
        if (this.stageModalCloseBounds) {
            const b = this.stageModalCloseBounds;
            if (x >= b.x && x <= b.x + b.w &&
                y >= b.y && y <= b.y + b.h) {
                overInteractive = true;
            }
        }

        // Stage rows hover
        if (Array.isArray(this.stageRowBounds)) {
            for (let i = 0; i < this.stageRowBounds.length; i++) {
                const row = this.stageRowBounds[i];
                if (x >= row.x && x <= row.x + row.w &&
                    y >= row.y && y <= row.y + row.h) {
                    overInteractive = true;
                    break;
                }
            }
        }

        // Meta-upgrade buttons hover
        if (Array.isArray(this.stageMetaButtons)) {
            const stagePoints = (typeof this.stagePoints === "number") ? this.stagePoints : 0;

            for (let i = 0; i < this.stageMetaButtons.length; i++) {
                const b = this.stageMetaButtons[i];
                if (x >= b.x && x <= b.x + b.w &&
                    y >= b.y && y <= b.y + b.h) {

                    this.hoveredStageMetaIndex = b.index;

                    // Pointer only if affordable and not already owned
                    let owned = Array.isArray(this.stagePointLevels) &&
                        this.stagePointLevels[b.index] > 0;
                    let cost = (typeof this.getStagePointUpgradeCost === "function")
                        ? this.getStagePointUpgradeCost(b.index)
                        : 1;
                    let affordable = stagePoints >= cost;

                    if (!owned && affordable) {
                        overInteractive = true;
                    }
                    break;
                }
            }
        }

        // Respec button hover
        if (this.stageRespecBounds) {
            const b = this.stageRespecBounds;
            if (x >= b.x && x <= b.x + b.w &&
                y >= b.y && y <= b.y + b.h) {
                overInteractive = true;
            }
        }

        this.hoveredUpgradeIndex = null;
        this.canvas.style.cursor = overInteractive ? "pointer" : "default";
        return;
    }

    //////////////////////////////////////////////////////
    // 2) Hover over stages button at bottom
    //////////////////////////////////////////////////////
    if (this.stagesButtonUnlocked && this.stagesButtonBounds) {
        const b = this.stagesButtonBounds;
        if (x >= b.x && x <= b.x + b.w &&
            y >= b.y && y <= b.y + b.h) {
            overInteractive = true;
        }
    }

    //////////////////////////////////////////////////////
    // 3) Hover over upgrade buttons (existing behavior)
    //////////////////////////////////////////////////////
    for (let i = 0; i < this.upgradeButtons.length; i++) {
        const btn = this.upgradeButtons[i];
        if (!btn) {
            continue;
        }

        if (x >= btn.x &&
            x <= btn.x + btn.size &&
            y >= btn.y &&
            y <= btn.y + btn.size) {
            hoveredIndex = i;
            if (!btn.disabled) {
                overInteractive = true;
            }
            break;
        }
    }

    this.hoveredUpgradeIndex = hoveredIndex;

    if (overInteractive) {
        this.canvas.style.cursor = "pointer";
    } else {
        this.canvas.style.cursor = "default";
    }
};

///////////////////////////////////////////////////////
// Keyboard controls
///////////////////////////////////////////////////////

CirclesGame.prototype.handleKey = function (e) {
    if (e.repeat) {
        return;
    }

    // Toggle FPS counter with "-" regardless of devUnlocked
    if (e.key === "-" || e.code === "Minus") {
        this.showFps = !this.showFps;
        e.preventDefault();
        return;
    }

    // Stage shortcuts can be allowed without dev tools, but still require that
    // the game is in a normal playable state if you want.
    if (e.key >= "1" && e.key <= "9") {
        const stageNumber = parseInt(e.key, 10);
        const targetIndex = stageNumber - 1;
        const count = this.stageCount || 9;

        if (targetIndex >= 0 &&
            targetIndex < count &&
            typeof this.startStage === "function") {
            this.startStage(targetIndex);
        }
        return;
    }

    // Dev features only appear after at least one completion
    if (!this.devUnlocked) {
        return;
    }

    // Dev commands require the toggle to be enabled
    if (!this.devToolsEnabled) {
        return;
    }

    if (e.key === "ArrowUp") {
        this.speedScale *= 2;

    } else if (e.key === "ArrowDown") {
        this.speedScale /= 2;

    } else if (e.key === "Enter") {
        if (!this.winState.active) {
            if (typeof this.onWin === "function") {
                this.onWin();
            } else {
                this.startWinAnimation();
            }
        }
    }
};

///////////////////////////////////////////////////////
// Resize
///////////////////////////////////////////////////////

CirclesGame.prototype.resize = function () {
    const dpr = window.devicePixelRatio || 1;

    // Use the *current* CSS size of the canvas
    const targetWidth = this.canvas.clientWidth;
    const targetHeight = this.canvas.clientHeight;

    // Do NOT set style.width/height here.
    // Let CSS "width: 100%; height: 100%" control the layout.

    // Only update the backing buffer if needed
    const newWidth = targetWidth * dpr;
    const newHeight = targetHeight * dpr;

    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;

        // Logical units are CSS pixels
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Clear with logical size
        this.ctx.clearRect(0, 0, targetWidth, targetHeight);
    }
};

CirclesGame.prototype.getActiveStageIndexSafe = function () {
    const count = this.stageCount || 9;
    let idx = (typeof this.activeStageIndex === "number") ? this.activeStageIndex : 0;
    if (idx < 0 || idx >= count) {
        idx = 0;
    }
    return idx;
};

CirclesGame.prototype.isNoUpgradesStage = function () {
    // Stage 7: no upgrades
    return this.getActiveStageIndexSafe() === 7;
};

CirclesGame.prototype.isNoLoopUpgradeStage = function () {
    // Stage 2: no upgrade #2
    const idx = this.getActiveStageIndexSafe();
    return idx === 2 || this.isNoUpgradesStage();
};

CirclesGame.prototype.isNoLoopMultStage = function () {
    // Stage 5: no mult bonus from loops
    const idx = this.getActiveStageIndexSafe();
    return idx === 5;
};

CirclesGame.prototype.hasHighRingPenaltyStage = function () {
    // Stage 1: higher rings penalized by 10% per ring level
    const idx = this.getActiveStageIndexSafe();
    return idx === 1;
};

///////////////////////////////////////////////////////
// SAVE / LOAD (localStorage)
///////////////////////////////////////////////////////

CirclesGame.prototype.serializeState = function () {
    return {
        totalUnits: this.totalUnits,
        loopThreshold: this.loopThreshold,
        multScale: this.multScale,
        upgradeLevels: this.upgradeLevels.slice(),
        rings: this.rings.map(r => ({
            progress: r.progress,
            ticks: r.ticks,
            solid: r.solid
        })),
        devUnlocked: this.devUnlocked,
        devToolsEnabled: !!this.devToolsEnabled,
        speedScale: (typeof this.speedScale === "number") ? this.speedScale : 1.0,

        stageCompleted: this.stageCompleted.slice(),
        activeStageIndex: this.activeStageIndex,

        // New: persist “between-runs” / UI state
        requireStageChange: !!this.requireStageChange,
        stagesModalVisible: !!this.stagesModalVisible,
        completedSphereStatic: !!this.completedSphereStatic,

        completedStageSpheres: (this.completedStageSpheres || []).map(s => ({
            stage: s.stage,
            angle: s.angle,
            color: s.color,
            loops: s.loops,
            spawned: s.spawned === undefined ? true : s.spawned,
            rotationEnabled: s.rotationEnabled === undefined ? true : s.rotationEnabled
        }))
    };
};

CirclesGame.prototype.applyState = function (s) {
    if (!s) {
        return;
    }

    this.totalUnits = s.totalUnits ?? 0;
    this.loopThreshold = s.loopThreshold ?? LOOP_THRESHOLD;
    this.multScale = s.multScale ?? 1.0;
    this.upgradeLevels = s.upgradeLevels ?? [0, 0, 0, 0];
    this.devUnlocked = !!s.devUnlocked;

    this.devToolsEnabled = !!s.devToolsEnabled;
    this.speedScale = (typeof s.speedScale === "number") ? s.speedScale : 1.0;

    if (!this.devToolsEnabled) {
        this.speedScale = 1.0;
    }

    // Restore or initialize stages
    this.stageCount = this.stageCount || 9;
    const defaultStages = new Array(this.stageCount).fill(false);
    this.stageCompleted = Array.isArray(s.stageCompleted)
        ? s.stageCompleted.slice(0, this.stageCount).concat(
            new Array(Math.max(0, this.stageCount - s.stageCompleted.length)).fill(false)
        )
        : defaultStages;
    this.activeStageIndex = (typeof s.activeStageIndex === "number")
        ? s.activeStageIndex
        : 0;

    // New: restore “between-runs” / UI state
    this.requireStageChange = !!s.requireStageChange;
    this.stagesModalVisible = !!s.stagesModalVisible;

    // If we are in "must pick a new stage" limbo, the sphere should
    // always be treated as parked, even if the old save did not
    // have completedSphereStatic set.
    this.completedSphereStatic =
        !!s.completedSphereStatic || this.requireStageChange;

    // Restore trophy spheres, but guarantee that any completed stage
    // actually has its sphere spawned, even if the save was taken
    // mid-anim (when spawned was still false).
    if (Array.isArray(s.completedStageSpheres)) {
        this.completedStageSpheres = s.completedStageSpheres.map(o => {
            const stage = o.stage;
            const stageIsComplete = Array.isArray(this.stageCompleted) && this.stageCompleted[stage];
            const savedSpawned = (o.spawned === undefined ? true : o.spawned);

            return {
                stage: stage,
                angle: o.angle,
                color: o.color,
                loops: o.loops,
                spawned: stageIsComplete ? true : savedSpawned,
                rotationEnabled: o.rotationEnabled === undefined ? true : o.rotationEnabled
            };
        });
    } else {
        this.completedStageSpheres = [];
    }

    this.rings = [];
    this.addRing();

    if (s.rings && s.rings.length > 1) {
        for (let i = 1; i < s.rings.length; i++) {
            this.addRing();
        }
        for (let i = 0; i < s.rings.length; i++) {
            this.rings[i].progress = s.rings[i].progress;
            this.rings[i].ticks = s.rings[i].ticks;
            this.rings[i].solid = s.rings[i].solid;
        }
    }

    this.rebuildFromTotal();

    // Transient flags
    this.pendingStageSphereStage = null;

    // Ensure run-complete animations are not “halfway” after load
    if (this.runCompleteFlash) {
        this.runCompleteFlash.active = false;
        this.runCompleteFlash.timer = 0;
        this.runCompleteFlash.startedShrink = false;
    }
    if (this.runCompleteAnim) {
        this.runCompleteAnim.active = false;
        this.runCompleteAnim.t = 0;
    }

    // Reset completion tracking after load so we do not trigger immediately
    this.lastTopDigit = null;
    this.lastTopTicks = null;

    // If we were in the “pick a new stage before playing” state,
    // force the stages modal to be open again.
    if (this.requireStageChange && typeof this.showStagesModal === "function") {
        this.showStagesModal();
    }

    if (typeof this.updateStagesToggleVisibility === "function") {
        this.updateStagesToggleVisibility();
    }
};

CirclesGame.prototype.saveLocal = function () {
    try {
        const json = JSON.stringify(this.serializeState());
        localStorage.setItem("spheres-save", json);
    } catch (e) {
        console.warn("Failed to save", e);
    }
};

CirclesGame.prototype.loadLocal = function () {
    const raw = localStorage.getItem("spheres-save");
    if (!raw) {
        return false;
    }
    try {
        const obj = JSON.parse(raw);
        this.applyState(obj);
        return true;
    } catch (e) {
        console.warn("Failed to load save", e);
        return false;
    }
};