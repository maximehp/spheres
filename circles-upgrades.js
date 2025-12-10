// circles-upgrades.js

///////////////////////////////////////////////////////
// STAGE POINTS CORE HELPERS
///////////////////////////////////////////////////////

CirclesGame.prototype._ensureStagePoints = function () {
    if (!Array.isArray(this.stagePointLevels)) {
        // 8 meta upgrades, each 0 or 1
        this.stagePointLevels = [0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (typeof this.stagePoints !== "number") {
        this.stagePoints = 0;
    }
};

CirclesGame.prototype.getStagePointsForStage = function (stageIndex) {
    // Stage-specific rewards defined in circles-config.js
    // Example there: const STAGE_POINTS = [1,1,2,2,3,3,4,4,0];
    if (typeof STAGE_POINTS !== "undefined" &&
        Array.isArray(STAGE_POINTS) &&
        stageIndex >= 0 &&
        stageIndex < STAGE_POINTS.length) {
        return STAGE_POINTS[stageIndex];
    }
    // Fallback: 1 SP per non-final stage
    return 1;
};

CirclesGame.prototype.addStagePoints = function (amount) {
    this._ensureStagePoints();
    const v = Math.floor(amount);
    if (!Number.isFinite(v) || v <= 0) {
        return;
    }
    this.stagePoints += v;
    this.saveLocal();
};

///////////////////////////////////////////////////////
// WRAP SAVE / LOAD TO PERSIST STAGE POINTS
///////////////////////////////////////////////////////

// Wrap existing serializeState
CirclesGame.prototype._serializeStateBase = CirclesGame.prototype.serializeState;

CirclesGame.prototype.serializeState = function () {
    const base = this._serializeStateBase ? this._serializeStateBase() : {};
    this._ensureStagePoints();

    base.stagePoints = this.stagePoints;
    base.stagePointLevels = this.stagePointLevels.slice();

    return base;
};

// Wrap existing applyState
CirclesGame.prototype._applyStateBase = CirclesGame.prototype.applyState;

CirclesGame.prototype.applyState = function (s) {
    if (this._applyStateBase) {
        this._applyStateBase(s);
    }

    this._ensureStagePoints();

    if (s && typeof s.stagePoints === "number") {
        this.stagePoints = s.stagePoints;
    }

    if (s && Array.isArray(s.stagePointLevels)) {
        for (let i = 0; i < this.stagePointLevels.length; i++) {
            this.stagePointLevels[i] = s.stagePointLevels[i] ? 1 : 0;
        }
    }
};

///////////////////////////////////////////////////////
// WRAP STAGE COMPLETION TO AWARD STAGE POINTS
///////////////////////////////////////////////////////

CirclesGame.prototype._handleStageCompletionBase = CirclesGame.prototype.handleStageCompletion;

CirclesGame.prototype.handleStageCompletion = function () {
    const count = this.stageCount || 9;

    let idx = this.activeStageIndex;
    if (idx == null || idx < 0 || idx >= count) {
        idx = 0;
    }

    const alreadyComplete =
        Array.isArray(this.stageCompleted) &&
        this.stageCompleted[idx];

    // Run original logic (trophies, flags, modal timer, etc.)
    if (this._handleStageCompletionBase) {
        this._handleStageCompletionBase();
    }

    // If it just became completed now, award SP
    const nowComplete =
        Array.isArray(this.stageCompleted) &&
        this.stageCompleted[idx];

    if (!alreadyComplete && nowComplete) {
        const gain = this.getStagePointsForStage(idx);
        if (gain > 0) {
            this.addStagePoints(gain);
        }
    }
};

///////////////////////////////////////////////////////
// META: STAGE POINT UPGRADES DEFINITIONS
///////////////////////////////////////////////////////
//
// Index mapping:
// 0: x2 speed
// 1: threshold tweak (-1 after everything, can reach 7)
// 2: -1 loops required for stage completion
// 3: mult floor (treat <4 as 4)
// 4: x3 speed
// 5: upgrades 50% cheaper
// 6: loop mult *1.3
// 7: +1 free level to all upgrades (ignores cap on upgrade 4)
//

CirclesGame.prototype.getStagePointUpgradeLabel = function (index) {
    switch (index) {
        case 0: return "x3 speed";
        case 1: return "threshold -2";
        case 2: return "loops -1";
        case 3: return "min mult";
        case 4: return "x5 speed";
        case 5: return "-75% cost";
        case 6: return "mult x1.3";
        case 7: return "all +1";
    }
    return "";
};

CirclesGame.prototype.getStagePointUpgradeCost = function (index) {
    // Costs:
    switch (index) {
        case 0: return 1; // x2 speed
        case 1: return 1; // -1 threshold
        case 2: return 1; // -1 loops
        case 3: return 1; // safe mult
        case 4: return 2; // x3 speed
        case 5: return 1; // cheap ups
        case 6: return 3; // loop x1.3
        case 7: return 3; // +1 all
        default:
            return 1;
    }
};

CirclesGame.prototype.getStagePointTooltipInfo = function (index) {
    this._ensureStagePoints();

    const info = {
        title: "",
        lines: [],
        isMax: this.stagePointLevels[index] > 0
    };

    switch (index) {
        case 0:
            info.title = "x3 speed";
            info.lines.push("Triples base progression.");
            break;

        case 1:
            info.title = "Threshold -2";
            info.lines.push("Subtracts 2 from the threshold.");
            info.lines.push("Can break the cap of 8.");
            break;

        case 2:
            info.title = "Loops required -1";
            info.lines.push("Reduces the number of loops required");
            info.lines.push("for a stage completion by 1.");
            break;

        case 3:
            info.title = "Multiplier floor";
            info.lines.push("If a ring has fewer than 4 loops of progress, it");
            info.lines.push("counts as if it had 4 for the multiplier calculation.");
            break;

        case 4:
            info.title = "x5 speed";
            info.lines.push("Quintuples base progression.");
            break;

        case 5:
            info.title = "-75% Cost";
            info.lines.push("Quarters the cost of regular upgrades.");
            break;

        case 6:
            info.title = "loop multiplier x1.3";
            info.lines.push("Increases the per-loop multiplier by 30 percent.");
            break;

        case 7:
            info.title = "all +1";
            info.lines.push("Grants 1 free level to all upgrades.");
            info.lines.push("Doesn't count towards the cap of upgrade 4.");
            break;
    }

    return info;
};

CirclesGame.prototype.buyStagePointUpgrade = function (index) {
    this._ensureStagePoints();

    if (index < 0 || index >= this.stagePointLevels.length) {
        return;
    }

    // Already bought
    if (this.stagePointLevels[index] > 0) {
        return;
    }

    const cost = this.getStagePointUpgradeCost(index);
    if (this.stagePoints < cost) {
        return;
    }

    this.stagePoints -= cost;
    this.stagePointLevels[index] = 1;

    this.saveLocal();
};

CirclesGame.prototype.respecStagePointUpgrades = function () {
    this._ensureStagePoints();

    let refund = 0;
    for (let i = 0; i < this.stagePointLevels.length; i++) {
        const level = this.stagePointLevels[i];
        if (level > 0) {
            // Each meta upgrade is binary (0 or 1), but we still multiply by level
            // in case you ever allow >1 in the future.
            const cost = this.getStagePointUpgradeCost(i);
            refund += cost * level;
            this.stagePointLevels[i] = 0;
        }
    }

    this.stagePoints += refund;
    this.saveLocal();
};

///////////////////////////////////////////////////////
// MAIN UPGRADES (existing system) + META EFFECTS
///////////////////////////////////////////////////////

// Helper: effective level for effect calculations
// (raw level + free +1 from SP upgrade 7)
CirclesGame.prototype.getEffectiveUpgradeLevel = function (index) {
    this._ensureStagePoints();
    const raw = this.upgradeLevels[index] || 0;
    if (this.stagePointLevels[7]) {
        return raw + 1;
    }
    return raw;
};

// Costs (affected by SP upgrade 5: cheap ups)
CirclesGame.prototype.getUpgradeCost = function (index) {
    this._ensureStagePoints();

    const baseCosts = [5, 80, 250, 1000];
    const growth = [10.0, 5.0, 100.0, 1000.0];
    const level = this.upgradeLevels[index];

    // Stage 4: increase cost scaling by 1.5x
    const scale = (typeof this.stageSpecialCostScale === "number")
        ? this.stageSpecialCostScale
        : 1.0;

    let cost = Math.floor(baseCosts[index] * Math.pow(growth[index] * scale, level));

    // SP upgrade 5: upgrades 75% cheaper
    if (this.stagePointLevels[5]) {
        cost = Math.floor(cost * 0.25);
        if (cost < 1) {
            cost = 1;
        }
    }

    return cost;
};

// Format large costs: if >= 10,000,000 show in XeX style (e.g. 3e7),
// otherwise use normal thousands separators.
CirclesGame.prototype.formatCost = function (value) {
    if (value < 10000000) {
        return value.toLocaleString();
    }

    const exp = Math.floor(Math.log10(value));
    let mant = Math.round(value / Math.pow(10, exp) * 100) / 100;

    // In rare cases rounding could give 10eX; normalize that to 1e(X+1)
    if (mant >= 10) {
        mant = 1;
        return mant + "e" + (exp + 1);
    }

    return mant + "e" + exp;
};

// Meta boost (upgrade index 3) with SP "+1 all" allowed to go past old cap
CirclesGame.prototype.getMetaBoostFactor = function () {
    this._ensureStagePoints();

    let rawLevel = this.upgradeLevels[3] || 0;
    if (this.stagePointLevels[7]) {
        rawLevel += 1; // free extra meta level
    }

    const maxMeta = this.stagePointLevels[7] ? 3 : 2;
    const metaLevel = Math.min(maxMeta, rawLevel);

    return 1.0 + 0.10 * metaLevel; // 1.0, 1.1, 1.2, 1.3
};

// Helper: compute loop threshold for a specific level of the loop-upgrade,
// using multiply-by-0.8^boost and floor per level.
//
// New rules:
//  - Threshold has a hard minimum of 8 from all normal effects.
//  - SP 1 applies a static -1 AFTER this, letting it reach 7.
//  - SP 2 no longer affects threshold (it changes stage loops instead).
CirclesGame.prototype.computeLoopThresholdForLevel = function (level) {
    this._ensureStagePoints();

    let base = this.baseLoopThreshold;

    const boost = this.getMetaBoostFactor();
    const perLevelMultiplier = Math.pow(0.8, boost);

    let threshold = base;

    // Note: the free +1 from SP 7 is applied in computeLoopThreshold
    // when passing "level".
    for (let i = 0; i < level; i++) {
        threshold = Math.floor(threshold * perLevelMultiplier);
    }

    // Hard minimum from all normal effects
    if (threshold < 8) {
        threshold = 8;
    }

    return threshold;
};

// Base rate (upgrade index 0) with:
//  - SP 0: x2 speed
//  - SP 4: x3 speed
//  - SP 7: +1 free level
CirclesGame.prototype.computeBaseRate = function () {
    this._ensureStagePoints();

    const base = this.baseBaseRate;

    // If this stage disables all upgrades, pretend level 0.
    if (this.isNoUpgradesStage()) {
        let factor = 1.0;

        // Stage-point speed boosts still apply
        if (this.stagePointLevels[0]) {
            factor *= 3;
        }
        if (this.stagePointLevels[4]) {
            factor *= 5;
        }
        return base * factor;
    }

    // effective level includes +1 from SP 7
    const level = this.getEffectiveUpgradeLevel(0);
    const boost = this.getMetaBoostFactor();

    let factor = Math.pow(2, level * boost);

    // SP 0: x2 speed
    if (this.stagePointLevels[0]) {
        factor *= 3;
    }

    // SP 4: x3 speed
    if (this.stagePointLevels[4]) {
        factor *= 5;
    }

    return base * factor;
};

// New behavior: loop threshold is derived from discrete levels using
// computeLoopThresholdForLevel.
// Here we also apply SP 1's static -1 AFTER everything else.
CirclesGame.prototype.computeLoopThreshold = function () {
    this._ensureStagePoints();

    // Here we apply SP 7 free +1 level first
    const rawLevel = this.upgradeLevels[1] || 0;

    let effectiveLevel;
    if (this.isNoUpgradesStage() || this.isNoLoopUpgradeStage()) {
        effectiveLevel = 0;
    } else {
        effectiveLevel = this.stagePointLevels[7] ? rawLevel + 1 : rawLevel;
    }

    let threshold = this.computeLoopThresholdForLevel(effectiveLevel);

    // SP 1: static -1 after everything, can bring 8 down to 7
    if (this.stagePointLevels[1]) {
        threshold = Math.max(6, threshold - 2);
    }

    // Stage 9 (final stage): enforce minimum threshold 12
    const count = this.stageCount || 9;
    const lastIndex = count - 1;
    if (this.activeStageIndex === lastIndex) {
        threshold = 50;
    }

    return threshold;
};

// Multiplier scaling (upgrade index 2) with:
//  - SP 6: x1.3 to scaling
//  - SP 7: +1 free level
CirclesGame.prototype.computeMultScale = function () {
    this._ensureStagePoints();

    const base = this.baseMultScale;

    const level = this.getEffectiveUpgradeLevel(2);
    const boost = this.getMetaBoostFactor();

    if (level === 0 && boost === 1.0 && !this.stagePointLevels[6]) {
        return base;
    }

    const power = level * boost;
    let scale = 1 + (0.25 * power);

    // SP 6: loop mult *1.3
    if (this.stagePointLevels[6]) {
        scale *= 1.3;
    }

    return Math.max(0.05, scale);
};

///////////////////////////////////////////////////////
// UPGRADE LABELS + TOOLTIPS (updated to use new math)
///////////////////////////////////////////////////////

CirclesGame.prototype.getUpgradeLabel = function (index) {
    if (index === 0) {
        return "rate x2";
    } else if (index === 1) {
        return "loop *0.80";
    } else if (index === 2) {
        return "mult x1.25";
    } else if (index === 3) {
        return "boost others";
    }
    return "";
};

CirclesGame.prototype.getUpgradeTooltipInfo = function (index) {
    this._ensureStagePoints();

    const info = {
        title: "",
        lines: [],
        isMax: false
    };

    if (index === 0) {
        // Rate *X
        const rawLevel = this.upgradeLevels[0] || 0;

        const computeRateAtLevel = (lvl) => {
            const saved = this.upgradeLevels[0];
            this.upgradeLevels[0] = lvl;
            const r = this.computeBaseRate();
            this.upgradeLevels[0] = saved;
            return r;
        };

        const currentRate = computeRateAtLevel(rawLevel);
        const nextRate = computeRateAtLevel(rawLevel + 1);

        const currentThreshold = this.computeLoopThreshold();
        const currentLoopsPerSec =
            currentThreshold > 0 ? currentRate / currentThreshold : 0;
        const nextLoopsPerSec =
            currentThreshold > 0 ? nextRate / currentThreshold : 0;

        info.title = "Base rate x2";
        info.lines.push("Doubles the base loops per second.");
        info.lines.push("");
        info.lines.push(`Current base rate : ${currentLoopsPerSec.toFixed(2)} /s`);
        info.lines.push(`Next level : ${nextLoopsPerSec.toFixed(2)} /s`);

    } else if (index === 1) {
        // Loop *0.X
        const rawLevel = this.upgradeLevels[1] || 0;

        const current = this.computeLoopThreshold();
        // Simulate next by temporarily bumping level
        const saved = this.upgradeLevels[1];
        this.upgradeLevels[1] = rawLevel + 1;
        const next = this.computeLoopThreshold();
        this.upgradeLevels[1] = saved;

        const isMax = (next >= current);
        info.isMax = isMax;

        info.title = "Loop threshold *0.8";
        info.lines.push("Reduces loops needed for each wrap.");
        info.lines.push("");
        info.lines.push(`Current threshold : ${current}`);

        if (isMax) {
            info.lines.push("Already at minimum effective threshold.");
        } else if (this.isNoLoopUpgradeStage() || this.activeStageIndex === 8) {
            info.lines.push("Locked.");
        } else {
            info.lines.push(`Next level : ${next}`);
        }

    } else if (index === 2) {
        // Mult *X
        const rawLevel = this.upgradeLevels[2] || 0;

        const computeMultAtLevel = (lvl) => {
            const saved = this.upgradeLevels[2];
            this.upgradeLevels[2] = lvl;
            const m = this.computeMultScale();
            this.upgradeLevels[2] = saved;
            return m;
        };

        const currentScale = computeMultAtLevel(rawLevel);
        const nextScale = computeMultAtLevel(rawLevel + 1);

        info.title = "Multiplier x1.2";
        info.lines.push("Increases speed bonus from higher rings.");
        info.lines.push("");
        info.lines.push(`Current scale : x${currentScale.toFixed(2)}`);
        info.lines.push(`Next level : x${nextScale.toFixed(2)}`);

    } else if (index === 3) {
        // Boost others by *X
        const rawLevel = this.upgradeLevels[3] || 0;
        const maxMetaLevel = this.stagePointLevels[7] ? 3 : 2;

        const currentFactor = this.getMetaBoostFactor();

        info.title = "Boost others";
        info.lines.push("Strengthens all other upgrades.");
        info.lines.push("");
        info.lines.push(`Current boost factor : x${currentFactor.toFixed(2)}`);

        if (rawLevel >= maxMetaLevel) {
            info.isMax = true;
            info.lines.push("Maximum meta boost reached for this run.");
        } else {
            const saved = this.upgradeLevels[3];
            this.upgradeLevels[3] = rawLevel + 1;
            const nextFactor = this.getMetaBoostFactor();
            this.upgradeLevels[3] = saved;
            info.lines.push(`Next level : x${nextFactor.toFixed(2)}`);
        }
    }

    return info;
};

///////////////////////////////////////////////////////
// SNAPSHOT + BUY (unchanged except for new math)
///////////////////////////////////////////////////////

// Snapshot current ring state for smooth spend animation
CirclesGame.prototype._snapshotRingsForSpendAnim = function () {
    const ringsSnap = this.rings.map(r => ({
        exists: r.exists(),
        progress: r.progress,
        solid: !!r.solid,
        multAverage: r.multAverage == null ? null : r.multAverage
    }));

    return {
        totalUnits: this.totalUnits,
        loopThreshold: this.loopThreshold,
        multScale: this.multScale,
        rings: ringsSnap
    };
};

CirclesGame.prototype.buyUpgrade = function (index) {
    this._ensureStagePoints();

    // Stage 7: no upgrades at all
    if (this.isNoUpgradesStage()) {
        return;
    }

    // Stage 2: no mult-upgrade (#2)
    if (this.isNoLoopUpgradeStage() && index === 1) {
        return;
    }

    const cost = this.getUpgradeCost(index);

    // For the loop-threshold upgrade, block purchases that would not
    // actually lower the effective threshold any further.
    if (index === 1) {
        const rawLevel = this.upgradeLevels[1] || 0;
        const current = this.computeLoopThreshold();

        const saved = this.upgradeLevels[1];
        this.upgradeLevels[1] = rawLevel + 1;
        const next = this.computeLoopThreshold();
        this.upgradeLevels[1] = saved;

        if (next >= current) {
            return;
        }
    }

    // Cap "boost others" (index 3) at 2 purchases (raw),
    // the SP "+1 all" can push its effective level higher.
    if (index === 3 && this.upgradeLevels[3] >= 2) {
        return;
    }

    if (this.totalUnits < cost) {
        return;
    }

    // Snapshot BEFORE spending for animation "from" state
    const beforeSnapshot = this._snapshotRingsForSpendAnim();

    this.totalUnits -= cost;
    this.upgradeLevels[index] += 1;

    // Apply threshold change safely when index 1 or meta affects it.
    const newThreshold = this.computeLoopThreshold();
    if (newThreshold !== this.loopThreshold) {
        const oldThreshold = this.loopThreshold;
        const r0 = this.rings[0];

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
    }

    this.multScale = this.computeMultScale();
    this.rebuildFromTotal();

    // Start spend animation: from "before", toward the live state
    this.spendAnim = {
        active: true,
        t: 0,
        duration: 0.25,
        from: beforeSnapshot
    };

    this.saveLocal();
};

// Stage completion slots (how many loops for a completion)
// SP 2: reduce loops required for a completion by 1 (but not below 1)
CirclesGame.prototype.getStageLoopSlots = function (stageIndex) {
    // Use the given stage index or fall back to the active stage
    let idx = (typeof stageIndex === "number") ? stageIndex : this.activeStageIndex;

    if (idx == null || idx < 0 || idx >= LOOPS.length) {
        idx = 0;
    }

    const n = LOOPS[idx];

    // Always at least 1 slot so we do not divide by zero
    let slots = Math.max(1, n || 1);

    // SP 2: -1 loops required for completion
    if (Array.isArray(this.stagePointLevels) && this.stagePointLevels[2] > 0) {
        slots = Math.max(1, slots - 1);
    }

    return slots;
};
