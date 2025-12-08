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

        // Upgrades: [rate x2, threshold /1.5, mult root *0.9, boost others]
        this.upgradeLevels = [0, 0, 0, 0];
        this.upgradeButtons = [null, null, null, null];

        // Win animation state
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

    //////////////////////////////////////////////////////
    // Ring management
    //////////////////////////////////////////////////////

    addRing() {
        const level = this.rings.length;
        const base =
            this.baseRates[level] ||
            this.baseRates[this.baseRates.length - 1] * 0.75;

        this.rings.push(new Ring(level, base));
    }

    ensureRings(count) {
        while (this.rings.length < count) {
            this.addRing();
        }
    }

    resetAll() {
        this.rings = [];
        this.addRing(); // ring 0 only
        this.rings[0].progress = 0;
        this.rings[0].solid = false;
        this.rings[0].multAverage = null;

        this.totalUnits = 0;
        this.lastTime = performance.now();
        this.lastDt = 0;
        this.loopRate0 = 0;

        this.loopThreshold = this.baseLoopThreshold;
        this.multScale = this.baseMultScale;
        this.upgradeLevels = [0, 0, 0, 0];

        this.winState.active = false;
        this.winState.timer = 0;
        this.lastTopDigit = null;

        // Reset speed scale as well
        this.speedScale = 1.0;
    }

    startWinAnimation() {
        this.winState.active = true;
        this.winState.timer = 0;
    }

    markGameCompleted() {
        if (!this.devUnlocked) {
            this.devUnlocked = true;
            // Persist this so dev tools stay unlocked across reloads.
            this.saveLocal();
        }
    }

    //////////////////////////////////////////////////////
    // Integer <-> rings mapping
    //////////////////////////////////////////////////////

    // Rebuild rings[1..] from the current totalUnits using current loopThreshold.
    // We do not cap the number of rings here; visually we will only
    // place the first MAX_SLOTS of them on the sphere.
    rebuildFromTotal() {
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
    }

    getTotalUnits() {
        return this.totalUnits;
    }

    spend(amount) {
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
    }

    //////////////////////////////////////////////////////
    // Core loop
    //////////////////////////////////////////////////////

    loop(t) {
        const dt = Math.min((t - this.lastTime) / 1000, 0.2);
        this.lastTime = t;
        this.lastDt = dt;

        this.update(dt);
        this.draw();
        this.updateInfo();

        requestAnimationFrame((nt) => this.loop(nt));
    }

    update(dt) {
        // If we are in a win animation, advance it and freeze logic.
        if (this.winState.active) {
            this.winState.timer += dt;
            if (this.winState.timer >= this.winState.duration) {
                this.winState.active = false;
                this.resetAll();
            }
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

        // Win detection based on the 12th ring (index 11) completing a loop.
        if (this.rings.length >= 12) {
            const topRing = this.rings[11];
            const digit = topRing.progress;

            if (this.lastTopDigit !== null &&
                this.lastTopDigit > 0 &&
                digit === 0 &&
                !this.winState.active) {

                // Mark that the player has legitimately completed the game.
                this.markGameCompleted();

                if (typeof this.onWin === "function") {
                    this.onWin();
                } else {
                    this.startWinAnimation();
                }
            }

            this.lastTopDigit = digit;
        } else {
            this.lastTopDigit = null;
        }

        // Auto-save current state
        this.saveLocal();
    }

    //////////////////////////////////////////////////////
    // Keyboard controls
    //////////////////////////////////////////////////////

    handleKey(e) {
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
    }

    //////////////////////////////////////////////////////
    // Resize
    //////////////////////////////////////////////////////
    resize() {
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
    }

    //////////////////////////////////////////////////////
    // SAVE / LOAD (localStorage)
    //////////////////////////////////////////////////////

    serializeState() {
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
            devUnlocked: this.devUnlocked
        };
    }

    applyState(s) {
        if (!s) {
            return;
        }

        this.totalUnits = s.totalUnits ?? 0;
        this.loopThreshold = s.loopThreshold ?? LOOP_THRESHOLD;
        this.multScale = s.multScale ?? 1.0;
        this.upgradeLevels = s.upgradeLevels ?? [0, 0, 0, 0];
        this.devUnlocked = !!s.devUnlocked;

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
    }

    saveLocal() {
        try {
            const json = JSON.stringify(this.serializeState());
            localStorage.setItem("spheres-save", json);
        } catch (e) {
            console.warn("Failed to save", e);
        }
    }

    loadLocal() {
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
    }
}
