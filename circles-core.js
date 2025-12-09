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

        // Win animation state (full game win, separate from run-complete)
        this.winState = {
            active: false,
            timer: 0,
            duration: 4.0
        };

        // Track the highest ring digit to detect its wrap
        this.lastTopDigit = null;

        // Global speed scale (ArrowUp / ArrowDown)
        this.speedScale = 1.0;

        this.devUnlocked = false;

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

    // Run-complete animation state
    this.runCompleteAnim.active = false;
    this.runCompleteAnim.t = 0;
    this.completedSphereStatic = false;

    this.runCompleteFlash.active = false;
    this.runCompleteFlash.timer = 0;
    this.runCompleteFlash.startedShrink = false;

    // Global speed
    this.speedScale = 1.0;

    // Stage meta: fully wipe progress
    this.stageCount = this.stageCount || 9;
    this.stageCompleted = new Array(this.stageCount).fill(false);
    this.activeStageIndex = 0;
    this.completedStageSpheres = [];

    // New flags related to stage trophies
    this.pendingStageSphereStage = null;
    this.requireStageChange = false;

    // Hide stages modal and clear click targets
    this.stagesModalVisible = false;
    this.stageRowBounds = [];
    this.stageModalCloseBounds = null;

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
        duration: 1.2,
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

    // Stable orbit angle for this stage
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
        sphere.spawned = false;
        sphere.rotationEnabled = false;
    } else {
        sphere = {
            stage: idx,
            angle: angle,
            color: color,
            loops: loopsAtCompletion,
            // The trophy will not be drawn until shrink finishes
            spawned: false,
            // Rotation will only start after we move on to a new stage
            rotationEnabled: false
        };
        this.completedStageSpheres.push(sphere);
    }

    // Let update() know which stage’s trophy to “spawn” when shrink is done
    this.pendingStageSphereStage = idx;

    // After a completion, you must pick a different stage before resuming
    this.requireStageChange = true;

    this.saveLocal();

    if (typeof this.updateStagesToggleVisibility === "function") {
        this.updateStagesToggleVisibility();
    }

    const isFirstStage = idx === 0;
    if (isFirstStage) {
        if (!this.stageModalTimer) {
            this.stageModalTimer = { active: false, t: 0, delay: 3.0 };
        }
        this.stageModalTimer.active = true;
        this.stageModalTimer.t = 0;
    }
};

CirclesGame.prototype.getStageAngle = function (stageIndex) {
    const count = this.stageCount - 1 || 8;
    let idx = stageIndex;

    if (idx == null || idx < 0 || idx >= count) {
        idx = 0;
    }

    // Evenly spaced around the circle
    return (idx / count) * Math.PI * 2;
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

    this.update(dt);
    this.draw();
    this.updateInfo();

    requestAnimationFrame((nt) => this.loop(nt));
};

CirclesGame.prototype.update = function (dt) {
    // Always tick the delayed stages-modal timer
    this.updateStageModalTimer(dt);

    // Full win animation: freeze logic while playing
    if (this.winState.active) {
        this.winState.timer += dt;
        if (this.winState.timer >= this.winState.duration) {
            this.winState.active = false;
            this.resetAll();
        }
        return;
    }

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
                        // rotationEnabled stays false until we start a new stage
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
    }

    this.multScale = this.computeMultScale();

    // Base rate for ring 0, then apply global speed scale.
    const baseRate0Unscaled = this.computeBaseRate();
    const baseRate0 = baseRate0Unscaled * this.speedScale;

    // Multiplier from higher rings based on their *current* progress.
    // mult_total = Π_{i>=1, ring exists} sqrt( multScale * (progress_i + 1) )
    let totalMult = 1;
    for (let i = 1; i < this.rings.length; i++) {
        const ring = this.rings[i];
        if (!ring.exists()) {
            continue;
        }
        const term = this.multScale * (ring.progress + 1);
        totalMult *= Math.sqrt(Math.max(0, term));
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

    // Run completion detection based on the 12th ring (index 11) completing a loop.
    if (this.rings.length >= 12) {
        const topRing = this.rings[11];
        const digit = topRing.progress;

        if (this.lastTopDigit !== null &&
            this.lastTopDigit > 0 &&
            digit === 0 &&
            !this.winState.active &&
            !this.runCompleteAnim.active &&
            !this.completedSphereStatic) {

            // Stage bookkeeping
            if (typeof this.handleStageCompletion === "function") {
                this.handleStageCompletion();
            }

            // Prefer a run-complete handler if present (meta layer),
            // otherwise fall back to the old "final win" behavior.
            if (typeof this.onRunComplete === "function") {
                this.onRunComplete();
            } else {
                this.markGameCompleted();
                if (typeof this.onWin === "function") {
                    this.onWin();
                } else {
                    this.startWinAnimation();
                }
            }
        }

        this.lastTopDigit = digit;
    } else {
        this.lastTopDigit = null;
    }

    // Auto-save current state
    this.saveLocal();
};

///////////////////////////////////////////////////////
// Keyboard controls
///////////////////////////////////////////////////////

CirclesGame.prototype.handleKey = function (e) {
    if (e.repeat) {
        return;
    }

    // Dev tools only available once the player has beaten the game at least once.
    if (!this.devUnlocked) {
        return;
    }

    if (e.key === "ArrowUp") {
        // Double base speed
        this.speedScale *= 2;
    } else if (e.key === "ArrowDown") {
        // Half base speed
        this.speedScale /= 2;
    } else if (e.key === "Enter") {
        // Trigger an instant win
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
        stageCompleted: this.stageCompleted.slice(),
        activeStageIndex: this.activeStageIndex,
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

    // Restore trophy spheres
    if (Array.isArray(s.completedStageSpheres)) {
        this.completedStageSpheres = s.completedStageSpheres.map(o => ({
            stage: o.stage,
            angle: o.angle,
            color: o.color,
            loops: o.loops,
            // Old saves will have these missing; default to "already spawned and spinning"
            spawned: o.spawned === undefined ? true : o.spawned,
            rotationEnabled: o.rotationEnabled === undefined ? true : o.rotationEnabled
        }));
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

    // Reset transient flags
    this.pendingStageSphereStage = null;
    this.requireStageChange = false;

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
