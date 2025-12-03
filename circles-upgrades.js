///////////////////////////////////////////////////////
// UPGRADES: costs, effects, click handling, hover
///////////////////////////////////////////////////////

CirclesGame.prototype.getUpgradeCost = function (index) {
    const baseCosts = [5, 100, 1000, 5000];
    const growth = [10.0, 5.0, 50.0, 200.0];
    const level = this.upgradeLevels[index];
    return Math.floor(baseCosts[index] * Math.pow(growth[index], level));
};

CirclesGame.prototype.getMetaBoostFactor = function () {
    const metaLevel = this.upgradeLevels[3];
    return 1.0 + 0.20 * metaLevel; // 1.0, 1.5, 2.0, ...
};

CirclesGame.prototype.computeBaseRate = function () {
    const base = this.baseBaseRate;
    const level = this.upgradeLevels[0];
    const boost = this.getMetaBoostFactor();

    const factor = Math.pow(2, level * boost);
    return base * factor;
};

CirclesGame.prototype.computeLoopThreshold = function () {
    const base = this.baseLoopThreshold;
    const level = this.upgradeLevels[1];
    const boost = this.getMetaBoostFactor();

    if (level === 0 && boost === 1.0) {
        return base;
    }

    const divisor = Math.pow(1.5, level * boost);
    const target = base / divisor;

    return Math.max(5, Math.round(target));
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
        return `loop /1.5`;
    } else if (index === 2) {
        return `mult x1.2`;
    } else if (index === 3) {
        return `boost others`;
    }
    return "";
};

CirclesGame.prototype.buyUpgrade = function (index) {
    const cost = this.getUpgradeCost(index);
    if (this.totalUnits < cost) {
        return;
    }

    this.totalUnits -= cost;
    this.upgradeLevels[index] += 1;

    // Apply threshold change safely
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
            overButton = true;
            break;
        }
    }

    this.canvas.style.cursor = overButton ? "pointer" : "default";
};
