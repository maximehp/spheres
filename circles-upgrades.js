///////////////////////////////////////////////////////
// UPGRADES: costs, effects, click handling, hover
///////////////////////////////////////////////////////

CirclesGame.prototype.getUpgradeCost = function (index) {
    const baseCosts = [5, 80, 250, 5000];
    const growth = [10.0, 5.0, 100.0, 200.0];
    const level = this.upgradeLevels[index];
    return Math.floor(baseCosts[index] * Math.pow(growth[index], level));
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

CirclesGame.prototype.getMetaBoostFactor = function () {
    const metaLevel = this.upgradeLevels[3];
    return 1.0 + 0.20 * metaLevel; // 1.0, 1.2, 1.4, ...
};

// Helper: compute loop threshold for a specific level of the loop-upgrade,
// using divide-by-1.3 and floor per level, capped at 5.
CirclesGame.prototype.computeLoopThresholdForLevel = function (level) {
    const base = this.baseLoopThreshold;
    const boost = this.getMetaBoostFactor();

    // Each level divides by 1.3^boost, then floors, then clamps to 5.
    const perLevelMultiplier = Math.pow(0.75, boost);

    let threshold = base;
    for (let i = 0; i < level; i++) {
        threshold = Math.max(5, Math.floor(threshold * perLevelMultiplier));
    }
    return threshold;
};

CirclesGame.prototype.computeBaseRate = function () {
    const base = this.baseBaseRate;
    const level = this.upgradeLevels[0];
    const boost = this.getMetaBoostFactor();

    const factor = Math.pow(2, level * boost);
    return base * factor;
};

// New behavior: loop threshold is derived from discrete levels using
// computeLoopThresholdForLevel, with *0.75 and floor, min 5.
CirclesGame.prototype.computeLoopThreshold = function () {
    const level = this.upgradeLevels[1];
    return this.computeLoopThresholdForLevel(level);
};

CirclesGame.prototype.computeMultScale = function () {
    const base = this.baseMultScale;
    const level = this.upgradeLevels[2];
    const boost = this.getMetaBoostFactor();

    if (level === 0 && boost === 1.0) {
        return base;
    }

    const power = level * boost;
    const scale = Math.pow(1.2, power);
    return Math.max(0.05, scale);
};

CirclesGame.prototype.getUpgradeLabel = function (index) {
    if (index === 0) {
        return `rate x2`;
    } else if (index === 1) {
        return `loop *0.75`;
    } else if (index === 2) {
        return `mult x1.2`;
    } else if (index === 3) {
        return `boost others`;
    }
    return "";
};

CirclesGame.prototype.getUpgradeTooltipInfo = function (index) {
    const info = {
        title: "",
        lines: [],
        isMax: false
    };

    if (index === 0) {
        // Rate x2
        const base = this.baseBaseRate;
        const level = this.upgradeLevels[0];
        const boost = this.getMetaBoostFactor();

        const factor = Math.pow(2, level * boost);
        const currentRate = base * factor;
        const nextFactor = Math.pow(2, (level + 1) * boost);
        const nextRate = base * nextFactor;

        const currentThreshold = this.computeLoopThresholdForLevel(this.upgradeLevels[1]);
        const currentLoopsPerSec = currentThreshold > 0 ? currentRate / currentThreshold : 0;
        const nextLoopsPerSec = currentThreshold > 0 ? nextRate / currentThreshold : 0;

        info.title = "Base rate x2";
        info.lines.push("Doubles the base loops per second.");

        // insert blank line
        info.lines.push("");

        info.lines.push(`Current base rate : ${currentLoopsPerSec.toFixed(2)} /s`);
        info.lines.push(`Next level : ${nextLoopsPerSec.toFixed(2)} /s`);

    } else if (index === 1) {
        // Loop *0.75
        const level = this.upgradeLevels[1];
        const current = this.computeLoopThresholdForLevel(level);
        const next = this.computeLoopThresholdForLevel(level + 1);

        const isMax = (current <= 5 || next === current);
        info.isMax = isMax;

        info.title = "Loop threshold *0.75";
        info.lines.push("Reduces loops needed for each wrap.");

        info.lines.push("");

        info.lines.push(`Current threshold : ${current}`);

        if (isMax) {
            info.lines.push("Already at minimum threshold (5).");
        } else {
            info.lines.push(`Next level : ${next}`);
        }

    } else if (index === 2) {
        // Mult x1.2
        const currentScale = this.computeMultScale();
        const level = this.upgradeLevels[2];
        const boost = this.getMetaBoostFactor();

        const nextPower = (level + 1) * boost;
        const nextScaleRaw = Math.pow(1.2, nextPower);
        const nextScale = Math.max(0.05, nextScaleRaw);

        info.title = "Multiplier x1.2";
        info.lines.push("Increases speed bonus from higher rings.");

        info.lines.push("");

        info.lines.push(`Current scale : x${currentScale.toFixed(2)}`);
        info.lines.push(`Next level : x${nextScale.toFixed(2)}`);

    } else if (index === 3) {
        // Boost others
        const currentFactor = this.getMetaBoostFactor();
        const nextFactor = currentFactor + 0.20;

        info.title = "Boost others";
        info.lines.push("Strengthens all other upgrades.");

        info.lines.push("");

        info.lines.push(`Current boost factor : x${currentFactor.toFixed(2)}`);
        info.lines.push(`Next level : x${nextFactor.toFixed(2)}`);
    }

    return info;
};

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
    const cost = this.getUpgradeCost(index);

    // If loop threshold is already at minimum, block purchases of that upgrade.
    if (index === 1 && this.loopThreshold <= 5) {
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
};

CirclesGame.prototype.handleClick = function (event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (let i = 0; i < this.upgradeButtons.length; i++) {
        const btn = this.upgradeButtons[i];
        if (!btn) {
            continue;
        }

        // Do not allow clicks on disabled (MAX) buttons.
        if (btn.disabled) {
            continue;
        }

        if (
            x >= btn.x &&
            x <= btn.x + btn.size &&
            y >= btn.y &&
            y <= btn.y + btn.size
        ) {
            this.buyUpgrade(i);
            break;
        }
    }
};

CirclesGame.prototype.handleHover = function (event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let overButton = false;
    let hoveredIndex = null;

    for (let i = 0; i < this.upgradeButtons.length; i++) {
        const btn = this.upgradeButtons[i];
        if (!btn) {
            continue;
        }
        if (
            x >= btn.x &&
            x <= btn.x + btn.size &&
            y >= btn.y &&
            y <= btn.y + btn.size
        ) {
            hoveredIndex = i;
            // Pointer cursor only for non-disabled buttons
            if (!btn.disabled) {
                overButton = true;
            }
            break;
        }
    }

    this.hoveredUpgradeIndex = hoveredIndex;
    this.canvas.style.cursor = overButton ? "pointer" : "default";
};