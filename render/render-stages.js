// render-stages.js

// Attach the DOM elements used for the Stages UI to this game instance.
// Call this once from bootstrap:
//
//   const stagesModal     = document.getElementById("stagesModal");
//   const stagesList      = document.getElementById("stagesList");
//   const closeStages     = document.getElementById("closeStages");
//   const stagesToggleBtn = document.getElementById("stagesToggleBtn"); // bottom button
//   game.attachStagesUI(stagesModal, stagesList, closeStages, stagesToggleBtn);
//
// render-stages.js

CirclesGame.prototype.attachStagesUI = function (modalElement, listElement, closeButtonElement) {
    this.stagesModal = modalElement || null;
    this.stagesListEl = listElement || null;
    this.stagesCloseBtn = closeButtonElement || null;

    // Render initial list if elements are present
    this.renderStagesList();
    this.updateStagesToggleVisibility();

    const game = this;

    // Click on a stage row to start that stage
    if (this.stagesListEl) {
        this.stagesListEl.addEventListener("click", function (e) {
            const target = e.target.closest("[data-stage-index]");
            if (!target) {
                return;
            }
            const idx = parseInt(target.dataset.stageIndex, 10);
            if (Number.isNaN(idx)) {
                return;
            }

            // Locked rows should already be disabled, but guard anyway
            if (target.disabled || target.classList.contains("stage-locked")) {
                return;
            }

            game.startStage(idx);
            game.hideStagesModal();
        });
    }

    // Close X on the modal
    if (this.stagesCloseBtn) {
        this.stagesCloseBtn.addEventListener("click", function () {
            game.hideStagesModal();
        });
    }
};

// Show / hide the bottom “Stages” button depending on whether
// any stage has been completed at least once.
CirclesGame.prototype.updateStagesToggleVisibility = function () {
    if (!this.stagesToggleBtn) {
        return;
    }

    const flags = this.stageCompleted || [];
    const anyComplete = flags.some(Boolean);

    if (anyComplete) {
        this.stagesToggleBtn.classList.remove("hidden");
    } else {
        this.stagesToggleBtn.classList.add("hidden");
    }
};

// Build or refresh the list of stage buttons inside the modal.
// Expects this.stageCount, this.stageCompleted, this.activeStageIndex
// to exist on the CirclesGame instance (set in the core file).
CirclesGame.prototype.renderStagesList = function () {
    if (!this.stagesListEl) {
        return;
    }

    const container = this.stagesListEl;
    container.innerHTML = "";

    const count = this.stageCount || 9;   // 0–7 normal, 8 = final
    const completedFlags = this.stageCompleted || new Array(count).fill(false);

    const lastIndex = count - 1;
    const allBeforeLastComplete = completedFlags
        .slice(0, lastIndex)
        .every(Boolean);

    for (let i = 0; i < count; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stage-row";
        btn.dataset.stageIndex = String(i);

        const isComplete = !!completedFlags[i];
        const isActive = this.activeStageIndex === i;
        const isFinalStage = i === lastIndex;

        const label = "Stage " + (i + 1);

        let locked = false;

        // Once a stage is completed, it is locked forever
        if (isComplete) {
            locked = true;
        }

        // Final stage requires all earlier stages completed
        if (isFinalStage && !allBeforeLastComplete) {
            locked = true;
        }

        // After a completion, you must pick a different stage;
        // the just-completed stage cannot be chosen again.
        if (this.requireStageChange && isActive) {
            locked = true;
        }

        // Description + point reward
        const desc = (typeof this.getStageDescription === "function")
            ? this.getStageDescription(i)
            : (isFinalStage ? "Final challenge." : "Stage challenge.");

        let pts = 0;
        if (typeof this.getStagePointsForStage === "function") {
            pts = this.getStagePointsForStage(i) || 0;
        }

        let statusParts = [desc];

        if (pts > 0) {
            statusParts.push(`+${pts} pts`);
        }

        if (isFinalStage && !allBeforeLastComplete) {
            statusParts.push("locked (complete all previous stages)");
        } else if (this.requireStageChange && isActive) {
            statusParts.push("choose another stage to continue");
        } else if (isComplete) {
            statusParts.push("completed");
        }

        const status = statusParts.join(" · ");

        btn.textContent = label + "  -  " + status;

        if (isComplete) {
            btn.classList.add("stage-complete");
        }
        if (isActive) {
            btn.classList.add("stage-active");
        }
        if (locked) {
            btn.classList.add("stage-locked");
            btn.disabled = true;
        }

        container.appendChild(btn);
    }
};

CirclesGame.prototype.showStagesModal = function () {
    // Do not restart a running opening animation
    if (this.stagesModalAnim && this.stagesModalAnim.active && this.stagesModalAnim.opening) {
        return;
    }

    this.stagesModalVisible = true;
    this.stageRowBounds = [];

    this.stagesModalAnim = {
        active: true,
        opening: true,
        t: 0,
        duration: 0.2   // total time for open animation
    };
};

CirclesGame.prototype.hideStagesModal = function () {
    // If a stage has just been completed, you must choose a different stage
    // before you are allowed to close the modal.
    if (this.requireStageChange) {
        return;
    }

    if (!this.stagesModalVisible) {
        return;
    }

    this.stageRowBounds = [];

    this.stagesModalAnim = {
        active: true,
        opening: false,
        t: 0,
        duration: 0.2   // total time for close animation
    };
};

// Start or restart a given stage index.
// This resets the run state but keeps stage metadata and devUnlocked.
// Plug stage specific handicaps inside the switch if you want them.
CirclesGame.prototype.startStage = function (stageIndex) {
    const count = this.stageCount || 9;
    if (stageIndex < 0 || stageIndex >= count) {
        return;
    }

    // Do not allow starting a stage that is already completed
    if (this.stageCompleted && this.stageCompleted[stageIndex]) {
        return;
    }

    const prevIndex = this.activeStageIndex;

    // If we are in the "must change stage" state, you cannot pick the same stage again
    if (this.requireStageChange && stageIndex === prevIndex) {
        return;
    }

    this.activeStageIndex = stageIndex;

    // Reset run state
    this.rings = [];
    this.addRing();
    this.rings[0].progress = 0;
    this.rings[0].solid = false;
    this.rings[0].multAverage = null;

        this.totalUnits = 0;
    this.lastTime = performance.now();
    this.lastDt = 0;
    this.loopRate0 = 0;

    // Reset bases to global defaults first
    this.baseLoopThreshold = this.defaultBaseLoopThreshold;
    this.baseBaseRate = this.defaultBaseBaseRate;
    this.baseMultScale = this.defaultBaseMultScale;

    this.loopThreshold = this.baseLoopThreshold;
    this.multScale = this.baseMultScale;
    this.upgradeLevels = [0, 0, 0, 0];

    // Clear any per-stage flags that might matter later
    this.stageSpecialCostScale = 1.0;

    // Stage specific handicaps
    switch (stageIndex) {
        case 0:
            // Nothing special, perfectly normal
            break;

        case 1:
            // Stage 1: handled in update() via hasHighRingPenaltyStage()
            // (higher rings have reduced multiplier contribution)
            break;

        case 2:
            // Stage 2: no upgrade 2 (mult upgrade)
            // Enforced in isNoMultUpgradeStage(), buyUpgrade, and computeMultScale
            break;

        case 3:
            // Stage 3: 50 loops to complete (handled in getStageLoopSlots)
            break;

        case 4:
            // Stage 4: increased cost scaling on all upgrades by 1.5x
            this.stageSpecialCostScale = 1.5;
            break;

        case 5:
            // Stage 5: no mult bonus from loops (handled in update())
            break;

        case 6:
            // Stage 6: threshold starts at 100
            this.baseLoopThreshold = 100;
            this.loopThreshold = 100;
            break;

        case 7:
            // Stage 7: no upgrades at all
            // Enforced in isNoUpgradesStage() and drawUpgradeButtons/buyUpgrade
            break;

        case 8:
            // Stage 8: 100 loops to complete (handled in getStageLoopSlots)
            break;
    }

    // Clear run-complete animation state
    if (this.runCompleteAnim) {
        this.runCompleteAnim.active = false;
        this.runCompleteAnim.t = 0;
    }
    if (this.runCompleteFlash) {
        this.runCompleteFlash.active = false;
        this.runCompleteFlash.timer = 0;
        this.runCompleteFlash.startedShrink = false;
    }
    this.completedSphereStatic = false;

    this.lastTopDigit = null;
    this.speedScale = 1.0;

    // Once a new stage starts, all spawned trophies are allowed to rotate
    if (this.completedStageSpheres) {
        for (const s of this.completedStageSpheres) {
            if (s.spawned === undefined || s.spawned) {
                s.rotationEnabled = true;
            }
        }
    }

    this.pendingStageSphereStage = null;
    this.requireStageChange = false;

    // Stage specific handicaps or modifiers go here.
    // Example placeholder layout:
    //
    // switch (stageIndex) {
    //     case 0:
    //         // basic stage, no changes
    //         break;
    //     case 1:
    //         // higher threshold handicap
    //         this.loopThreshold = Math.floor(this.baseLoopThreshold * 1.5);
    //         break;
    //     case 2:
    //         // weaker multiplier
    //         this.baseMultScale = 0.8;
    //         this.multScale = this.baseMultScale;
    //         break;
    //     // etc...
    // }

    this.saveLocal();
    this.renderStagesList();
    this.updateStagesToggleVisibility();
};

// Precomputed unit circle angles for trophy rings
const TROPHY_STEPS = 12;  // bump down / up for quality vs speed

const TROPHY_ANGLES = (function () {
    const arr = [];
    for (let i = 0; i <= TROPHY_STEPS; i++) {
        const phi = (i / TROPHY_STEPS) * Math.PI * 2;
        arr.push({
            cos: Math.cos(phi),
            sin: Math.sin(phi)
        });
    }
    return arr;
})();

CirclesGame.prototype.drawCompletedStageSpheres = function (ctx, cxBase, cySphereBase, sphereRadiusBase, spinActive) {
    if (!this.completedStageSpheres || this.completedStageSpheres.length === 0) {
        return;
    }

    if (spinActive === undefined) {
        spinActive = true;
    }

    const dt = this.lastDt || 0.016;

    const orbitRadius = sphereRadiusBase * STAGE_ORBIT_RADIUS_FACTOR;

    const TROPHY_RADIUS_SCALE = STAGE_SPHERE_RADIUS_FACTOR * 1.2;
    const smallRadius = sphereRadiusBase * TROPHY_RADIUS_SCALE;

    const finalIndex = (this.stageCount || 9) - 1;
    const isFinalStageActive = (typeof this.getActiveStageIndexSafe === "function")
        ? (this.getActiveStageIndexSafe() === finalIndex)
        : (this.activeStageIndex === finalIndex);

    const orbitOffset = (isFinalStageActive && this.trophyOrbitAngle)
        ? this.trophyOrbitAngle
        : 0;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px 'Blockletter'";

    const maxLat = Math.PI * 0.45;

    // Optional: cap how many trophies we actually render
    const MAX_TROPHIES = 24;
    const spheres = this.completedStageSpheres;
    const startIndex = Math.max(0, spheres.length - MAX_TROPHIES);

    // ==============================
    // Launch setup when win happens
    // ==============================
    const winActive = this.winState && this.winState.active;

    // First frame where win is active: compute launch vectors for all spawned trophies
    if (winActive && !this.trophyLaunchTriggered) {
        this.trophyLaunchTriggered = true;

        // Speed scales with sphere size so it looks good at any resolution
        const baseSpeed = sphereRadiusBase * 3.0;

        for (let sIdx = startIndex; sIdx < spheres.length; sIdx++) {
            const s = spheres[sIdx];

            const spawned = (s.spawned === undefined) ? true : s.spawned;
            if (!spawned) {
                continue;
            }

            const baseAngle = s.angle ?? 0;
            const angle = baseAngle + orbitOffset;

            const sx = cxBase + Math.cos(angle) * orbitRadius;
            const sy = cySphereBase + Math.sin(angle) * orbitRadius;

            // Tangent to the orbit: direction of travel if orbiting CCW
            const dirX = -Math.sin(angle);
            const dirY = Math.cos(angle);

            s.launching = true;
            s.launchX = sx;
            s.launchY = sy;
            s.vx = dirX * baseSpeed;
            s.vy = dirY * baseSpeed;
            s.launchAge = 0;
            s.launchMaxLife = 2.0; // seconds until fully faded
        }
    }

    // If win is no longer active, allow future launches (for a new run)
    if (!winActive && this.trophyLaunchTriggered) {
        this.trophyLaunchTriggered = false;
    }

    for (let sIdx = startIndex; sIdx < spheres.length; sIdx++) {
        const s = spheres[sIdx];

        // If this flag is not set, default to already spawned (for old saves)
        const spawned = (s.spawned === undefined) ? true : s.spawned;
        if (!spawned) {
            continue;
        }

        ctx.save();

        // Position and alpha factor are now split by whether the trophy has launched
        let sx, sy;
        let alphaFactor = 0.6;

        if (s.launching && this.trophyLaunchTriggered) {
            // Update launched position
            s.launchAge = (s.launchAge || 0) + dt;
            const maxLife = s.launchMaxLife || 2.0;

            s.launchX += (s.vx || 0) * dt;
            s.launchY += (s.vy || 0) * dt;

            sx = s.launchX;
            sy = s.launchY;

            // Fade out over lifetime
            const lifeFrac = Math.max(0, Math.min(1, s.launchAge / maxLife));
            alphaFactor *= (1 - lifeFrac);

            if (alphaFactor <= 0.001) {
                ctx.restore();
                continue;
            }
        } else {
            // Normal orbiting behavior
            const baseAngle = s.angle ?? 0;
            const angle = baseAngle + orbitOffset;

            sx = cxBase + Math.cos(angle) * orbitRadius;
            sy = cySphereBase + Math.sin(angle) * orbitRadius;
        }

        // Always render completed trophies at some base opacity, modulated by launch fade
        ctx.globalAlpha *= alphaFactor;

        // Base gradient sphere
        this.drawSphereBackground(ctx, sx, sy, smallRadius, 1.0);

        const stageIndex = s.stage ?? 0;
        const basePhase = stageIndex * 0.7;

        const rotationOn = spinActive && (s.rotationEnabled !== false);

        const baseYaw = 0;
        const basePitch = 0.5;
        const baseRoll = 0;

        if (typeof s.spinT !== "number") {
            s.spinT = 0;
        }

        // Only advance spin when rotation is on
        if (rotationOn) {
            s.spinT += dt;
        }

        const tLocal = s.spinT;

        let yaw = baseYaw;
        let pitch = basePitch;
        let roll = baseRoll;

        if (rotationOn) {
            yaw = baseYaw + tLocal * 0.35;
            pitch = basePitch + Math.sin(tLocal * 0.27 * ((basePhase + 1) / 2)) * 0.4;
            roll = baseRoll + Math.sin(tLocal * 0.19 * ((basePhase) + 1 / 2) * 1.3) * 0.4;
        }

        // Precompute rotation matrix for this sphere
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        const cosPitch = Math.cos(pitch);
        const sinPitch = Math.sin(pitch);
        const cosRoll = Math.cos(roll);
        const sinRoll = Math.sin(roll);

        function rotatePoint(x, y, z) {
            // Yaw (Y axis)
            let x1 = cosYaw * x + sinYaw * z;
            let z1 = -sinYaw * x + cosYaw * z;
            let y1 = y;

            // Pitch (X axis)
            let y2 = cosPitch * y1 - sinPitch * z1;
            let z2 = sinPitch * y1 + cosPitch * z1;
            let x2 = x1;

            // Roll (Z axis)
            let x3 = cosRoll * x2 - sinRoll * y2;
            let y3 = sinRoll * x2 + cosRoll * y2;
            let z3 = z2;

            return { x: sx + x3, y: sy + y3 };
        }

        const loopCount = LOOPS[stageIndex] || 0;
        if (loopCount <= 0) {
            ctx.restore();
            continue;
        }

        for (let slot = 0; slot < loopCount; slot++) {
            const tSlot = loopCount === 1 ? 0.5 : slot / (loopCount - 1);
            const lat = (0.5 - tSlot) * 2 * maxLat;

            if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
                continue;
            }

            const sinLat = Math.sin(lat);
            const cosLat = Math.cos(lat);

            const rLat = smallRadius * cosLat;
            const yLat = smallRadius * sinLat;

            const col = this.ringColor(slot, stageIndex);

            // Draw one ring using precomputed circle angles
            ctx.beginPath();
            let first = true;

            for (let i = 0; i < TROPHY_ANGLES.length; i++) {
                const a = TROPHY_ANGLES[i];

                const x = rLat * a.cos;
                const y = yLat;
                const z = rLat * a.sin;

                const p = rotatePoint(x, y, z);
                if (first) {
                    ctx.moveTo(p.x, p.y);
                    first = false;
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }

            // Background stroke
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(0,0,0,0.65)";
            ctx.stroke();

            // Colored foreground stroke
            ctx.beginPath();
            first = true;
            for (let i = 0; i < TROPHY_ANGLES.length; i++) {
                const a = TROPHY_ANGLES[i];

                const x = rLat * a.cos;
                const y = yLat;
                const z = rLat * a.sin;

                const p = rotatePoint(x, y, z);
                if (first) {
                    ctx.moveTo(p.x, p.y);
                    first = false;
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }
            ctx.lineWidth = 3.2;
            ctx.lineCap = "round";
            ctx.strokeStyle = col;
            ctx.stroke();
        }

        ctx.restore();
    }
};

// Draws the bottom “Stages” button inside the canvas.
// It appears only when at least one stage is completed.
CirclesGame.prototype.drawStagesButton = function (ctx, w, h) {
    // Only show if at least one stage is completed
    if (!this.stageCompleted || !this.stageCompleted.some(Boolean) || this.requireStageChange) {
        this.stagesButtonBounds = null;
        this.stagesButtonUnlocked = false;
        return;
    }

    const label = "STAGES";

    // Match modal title font
    ctx.font = "20px 'Blockletter'";
    const textW = ctx.measureText(label).width;

    const btnW = Math.max(150, textW * 2);
    const btnH = 50;

    const x = (w - btnW) / 2;
    const y = h - btnH - 24;

    // Save bounds for click + hover detection
    this.stagesButtonBounds = { x, y, w: btnW, h: btnH };
    this.stagesButtonUnlocked = true;

    // Panel, same vibe as modal and cards
    ctx.beginPath();
    ctx.rect(x, y, btnW, btnH);
    ctx.fillStyle = "rgba(15,20,40,0.95)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(200,230,255,0.95)";
    ctx.stroke();

    // Label
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6f6ff";
    ctx.fillText(label, x + btnW / 2, y + btnH / 2);
};

CirclesGame.prototype.drawStagesModal = function (ctx, w, h) {
    // If neither visible nor animating, nothing to draw
    let anim = (this.stagesModalAnim && this.stagesModalAnim.active) ? this.stagesModalAnim : null;

    if (!this.stagesModalVisible && !anim) {
        this.stageRowBounds = [];
        this.stageModalCloseBounds = null;
        this.stageMetaButtons = [];
        this.stageRespecBounds = null;
        this.hoveredStageMetaIndex = null;
        return;
    }

    const dt = this.lastDt || 0.016;

    // Advance animation timer if present
    if (anim) {
        anim.t += dt;
        if (anim.t >= anim.duration) {
            anim.t = anim.duration;
            anim.active = false;

            // When closing finishes, actually hide the modal
            if (!anim.opening) {
                this.stagesModalVisible = false;
            }

            anim = null;
        }
    }

    // If still not visible (finished closing), stop
    if (!this.stagesModalVisible && !anim) {
        this.stageRowBounds = [];
        this.stageModalCloseBounds = null;
        this.stageMetaButtons = [];
        this.stageRespecBounds = null;
        this.hoveredStageMetaIndex = null;
        return;
    }

    const animActive = !!anim;

    // Backdrop (always full screen, not scaled)
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    // Layout constants
    const padding = 15;
    const titleGap = 0;
    const rowGap = 10;

    // Dynamic card size relative to screen width
    const cardSize = Math.max(90, Math.min(140, w * 0.10));

    const cols = 4;
    const rows = 2;

    // Width of 4 cards + gaps
    const gridInnerWidth = cols * cardSize + (cols - 1) * rowGap;
    const modalW = gridInnerWidth + padding * 2;

    // Title block height
    const titleHeight = 40;

    // Two rows of cards
    const gridInnerHeight = cardSize + rowGap + cardSize;

    // Stage 9 (full-width) height
    const stage9Height = cardSize;

    // Modal height (stage grid + final card)
    const modalH =
        padding +
        titleHeight +
        titleGap +
        gridInnerHeight +
        rowGap +
        stage9Height +
        padding;

    // Points panel constants
    const pointsGap = 12;

    // Meta layout (we use this to compute the points panel height)
    const metaCols = 4;
    const metaRows = 2;
    const metaGap = 10;

    // We have 4 upgrade columns and a respec area 2 columns wide
    // Total inner width = 6 * metaSize + 5 * metaGap
    const availableWidthForMeta = modalW - padding * 2;
    const metaSize = Math.max(
        30,
        Math.floor((availableWidthForMeta - 5 * metaGap) / 6)
    );

    const metaGridHeight = metaRows * metaSize + (metaRows - 1) * metaGap;

    const pointsTitleBlockHeight = 60;
    const pointsBottomPadding = padding;

    const pointsHeight = pointsTitleBlockHeight + metaGridHeight + pointsBottomPadding;

    // Center modal+points vertically
    const x = (w - modalW) / 2;
    const y = (h - (modalH + pointsHeight + pointsGap)) / 2;

    this.stagesModalBounds = {
        x: x,
        y: y,
        w: modalW,
        h: modalH
    };

    // Compute animation-based scale factors
    let scaleX = 1;
    let scaleY = 1;

    if (animActive) {
        const raw = Math.max(0, Math.min(1, anim.t / anim.duration));
        const dir = anim.opening ? raw : 1 - raw; // 0 -> 1 opening, 1 -> 0 closing

        function easeOutQuad(t) {
            return t * (2 - t);
        }

        const phase1 = Math.min(1, dir * 2);       // 0..1
        const phase2 = Math.max(0, dir * 2 - 1);   // 0..1

        const sWidth = easeOutQuad(phase1);
        const thinFrac = 0.05;
        const heightPhase1 = thinFrac * sWidth;
        const heightPhase2 = easeOutQuad(phase2);
        const sHeight = heightPhase1 + (1 - thinFrac) * heightPhase2;

        scaleX = sWidth;
        scaleY = sHeight;

        if (scaleX < 0.001 || scaleY < 0.001) {
            return;
        }
    }

    const cx = x + modalW / 2;
    const cy = y + (modalH + pointsGap + pointsHeight) / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-cx, -cy);

    // Draw modal panel
    ctx.beginPath();
    ctx.rect(x, y, modalW, modalH);
    ctx.fillStyle = "rgba(10, 10, 20, 0.95)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(200,230,255,0.95)";
    ctx.stroke();

    // Title
    ctx.font = "32px 'Blockletter'";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f6f6ff";
    ctx.fillText("STAGES", x + modalW / 2, y + padding);

    this.stageModalCloseBounds = null;
    this.stageRowBounds = [];
    this.stageMetaButtons = [];
    this.stageRespecBounds = null;

    // Grid origin
    const gridX = x + padding;
    const gridY = y + padding + titleHeight + titleGap;

    const count = this.stageCount || 9;
    const completedFlags = this.stageCompleted || new Array(count).fill(false);
    const lastIndex = count - 1;

    const allBeforeLastComplete = completedFlags
        .slice(0, lastIndex)
        .every(Boolean);

    const allowClicks = !animActive;

    // Helper to draw a card
    const drawCard = (idx, cardX, cardY, cardW, cardH) => {
        const isComplete = !!completedFlags[idx];
        const isActive = this.activeStageIndex === idx;
        const canResume = isActive && !isComplete && !this.requireStageChange;

        let locked = false;
        if (isComplete) locked = true;
        if (idx === lastIndex && !allBeforeLastComplete) locked = true;
        if (this.requireStageChange && isActive) locked = true;

        // Stage description (wrapped)
        const desc = (typeof this.getStageDescription === "function")
            ? this.getStageDescription(idx)
            : (idx === lastIndex ? "Final challenge." : "Stage challenge.");

        // Point reward
        let pts = 0;
        if (typeof this.getStagePointsForStage === "function") {
            pts = this.getStagePointsForStage(idx) || 0;
        }

        // ==== NEW RULE ====
        // Line A: points ONLY
        // Line B: status ONLY (complete / locked / resume)
        let lineA = pts > 0 ? `+${pts} pts` : "";
        let lineB = "";

        if (isComplete) {
            lineB = "complete";
        } else if (idx === lastIndex && !allBeforeLastComplete) {
            lineB = "locked";
        } else if (canResume) {
            lineB = "resume";
        } else if (locked) {
            lineB = "locked";
        }

        // Coloring rules
        let fillStyle, strokeStyle, titleColor = "#f6f6ff", descColor = "#d0d0ff", bottomColor = "#d0d0ff";
        if (canResume) {
            fillStyle = "rgba(10, 40, 20, 0.98)";
            strokeStyle = "rgba(140, 255, 180, 0.98)";
            titleColor = "#c8ffc8";
            descColor = "#9cffb0";
            bottomColor = "#9cffb0";
        } else if (isComplete) {
            fillStyle = "rgba(60,60,60,0.6)";
            strokeStyle = "rgba(150,150,150,0.6)";
            titleColor = "#b0b0b0";
            descColor = "#c0c0c0";
            bottomColor = "#c0c0c0";
        } else if (locked) {
            fillStyle = "rgba(10,10,20,0.7)";
            strokeStyle = "rgba(120,140,170,0.8)";
        } else if (isActive) {
            fillStyle = "rgba(15,20,40,0.98)";
            strokeStyle = "rgba(200,230,255,0.98)";
        } else {
            fillStyle = "rgba(15,20,40,0.95)";
            strokeStyle = "rgba(200,230,255,0.9)";
        }

        // Draw background
        ctx.beginPath();
        ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.lineWidth = isActive && !isComplete ? 2 : 1;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Title
        ctx.font = "28px 'Blockletter'";
        ctx.fillStyle = titleColor;
        ctx.fillText("Stage " + (idx + 1), cardX + cardW / 2, cardY + cardH * 0.20);

        // ==== WRAPPED DESCRIPTION ====
        ctx.font = "16px 'Blockletter'";
        ctx.fillStyle = descColor;

        function wrapText(text, maxWidth) {
            const words = text.split(" ");
            const lines = [];
            let cur = "";

            for (let w of words) {
                const test = cur.length ? cur + " " + w : w;
                if (ctx.measureText(test).width > maxWidth) {
                    lines.push(cur);
                    cur = w;
                } else {
                    cur = test;
                }
            }
            if (cur.length) lines.push(cur);
            return lines;
        }

        const descLines = wrapText(desc, cardW * 0.80);
        const descStartY = cardY + cardH * 0.40;

        for (let i = 0; i < descLines.length; i++) {
            ctx.fillText(descLines[i], cardX + cardW / 2, descStartY + i * 18);
        }

        // ==== BOTTOM TEXT ====
        const baseY = cardY + cardH * 0.72;

        // Line A: points
        if (lineA) {
            ctx.font = "18px 'Blockletter'";
            ctx.fillStyle = bottomColor;
            ctx.fillText(lineA, cardX + cardW / 2, baseY);
        }

        // Line B: status
        if (lineB) {
            ctx.font = "16px 'Blockletter'";
            ctx.fillStyle = bottomColor;
            ctx.fillText(lineB, cardX + cardW / 2, baseY + 20);
        }

        // Add clickable bounds
        if (!locked && allowClicks) {
            this.stageRowBounds.push({
                x: cardX,
                y: cardY,
                w: cardW,
                h: cardH,
                index: idx
            });
        }
    };

    // Draw stages 1–8 (grid)
    for (let i = 0; i < 8 && i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;

        const cardX = gridX + col * (cardSize + rowGap);
        const cardY = gridY + row * (cardSize + rowGap);

        drawCard(i, cardX, cardY, cardSize, cardSize);
    }

    // Draw Stage 9 full-width
    if (count === 9) {
        const idx = 8;

        const stage9X = gridX;
        const stage9Y =
            gridY +
            (rows * cardSize) +
            ((rows - 1) * rowGap) +
            rowGap;

        const stage9W = gridInnerWidth;
        const stage9H = cardSize;

        drawCard(idx, stage9X, stage9Y, stage9W, stage9H);
    }

    // ===== POINTS PANEL (meta-upgrades + big respec) =====
    const pointsX = x;
    const pointsY = y + modalH + pointsGap;

    ctx.beginPath();
    ctx.rect(pointsX, pointsY, modalW, pointsHeight);
    ctx.fillStyle = "rgba(15,20,40,0.95)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(200,230,255,0.95)";
    ctx.stroke();

    const stagePoints = (typeof this.stagePoints === "number") ? this.stagePoints : 0;

    // Centered title + value
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "22px 'Blockletter'";
    ctx.fillStyle = "#f6f6ff";
    ctx.fillText("POINTS", pointsX + modalW / 2, pointsY + 8);

    ctx.font = "20px 'Blockletter'";
    ctx.fillStyle = "#ffd2ff";
    ctx.fillText(
        stagePoints.toLocaleString(),
        pointsX + modalW / 2,
        pointsY + 8 + 26
    );

    // Meta-upgrade buttons grid + big respec on the right

    // Width of the 4-column upgrade grid
    const metaGridWidth = metaCols * metaSize + (metaCols - 1) * metaGap;
    const metaGridHeightDraw = metaGridHeight; // same as computed earlier

    // Respec spans 2 columns and both rows
    const respecW = metaSize * 2 + metaGap;
    const respecH = metaGridHeightDraw;

    const totalInnerWidth = metaGridWidth + metaGap + respecW;

    // Center all content horizontally, tuck it under the title/value
    const metaGridX = pointsX + (modalW - totalInnerWidth) / 2;
    const metaGridY = pointsY + pointsTitleBlockHeight; // under title + value

    const hasMetaMethods = typeof this.getStagePointUpgradeLabel === "function";

        this.stageMetaButtons = [];
    this.stageRespecBounds = null;

    for (let i = 0; i < 8; i++) {
        const row = Math.floor(i / metaCols);
        const col = i % metaCols;

        const bx = metaGridX + col * (metaSize + metaGap);
        const by = metaGridY + row * (metaSize + metaGap);

        const owned = Array.isArray(this.stagePointLevels) && this.stagePointLevels[i] > 0;
        const cost = (typeof this.getStagePointUpgradeCost === "function")
            ? this.getStagePointUpgradeCost(i)
            : 1;
        const affordable = stagePoints >= cost;

        let fillStyle;
        let strokeStyle;
        let labelColor;

        if (owned) {
            fillStyle = "rgba(40,70,40,0.95)";
            strokeStyle = "rgba(150,255,180,0.95)";
            labelColor = "#c8ffc8";
        } else if (affordable) {
            fillStyle = "rgba(20,30,45,0.95)";
            strokeStyle = "rgba(200,230,255,0.95)";
            labelColor = "#f6f6ff";
        } else {
            fillStyle = "rgba(15,15,25,0.85)";
            strokeStyle = "rgba(120,130,150,0.7)";
            labelColor = "#a0a0b0";
        }

        ctx.beginPath();
        ctx.rect(bx, by, metaSize, metaSize);
        ctx.fillStyle = fillStyle;
        ctx.fill();

        ctx.lineWidth = owned ? 2 : 1;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();

        // Short label + cost inside

        const cxBtn = bx + metaSize / 2;
        const labelY = by + metaSize * 0.33;
        const costY = by + metaSize * 0.68;

        const label = hasMetaMethods
            ? this.getStagePointUpgradeLabel(i)
            : ("U" + (i + 1));

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Main text: label
        ctx.font = "16px 'Blockletter'";
        ctx.fillStyle = labelColor;
        ctx.fillText(label, cxBtn, labelY);

        // Cost, same font size + color as label
        const costText = cost.toString();
        ctx.font = "26px 'Blockletter'";
        ctx.fillStyle = labelColor;
        ctx.fillText(costText, cxBtn, costY);

        this.stageMetaButtons.push({
            x: bx,
            y: by,
            w: metaSize,
            h: metaSize,
            index: i
        });
    }

    // Big RESPEC button: 2 columns wide, spans both rows
    const respecX = metaGridX + metaGridWidth + metaGap;
    const respecY = metaGridY;

    ctx.beginPath();
    ctx.rect(respecX, respecY, respecW, respecH);
    ctx.fillStyle = "rgba(40,20,20,0.95)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,160,160,0.95)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "22px 'Blockletter'";
    ctx.fillStyle = "#ffd0d0";
    ctx.fillText(
        "RESPEC",
        respecX + respecW / 2,
        respecY + respecH / 2
    );

    ctx.font = "14px 'Blockletter'";
    ctx.fillStyle = "#ffb4b4";
    ctx.fillText(
        "(Resets current stage)",
        respecX + respecW / 2,
        respecY + respecH / 2 + 20
    )

    this.stageRespecBounds = {
        x: respecX,
        y: respecY,
        w: respecW,
        h: respecH
    };

    // Tooltip for hovered meta-upgrade
    if (typeof this.hoveredStageMetaIndex === "number" &&
        this.hoveredStageMetaIndex >= 0 &&
        this.hoveredStageMetaIndex < 8 &&
        typeof this.getStagePointTooltipInfo === "function") {

        const tip = this.getStagePointTooltipInfo(this.hoveredStageMetaIndex);
        const lines = Array.isArray(tip.lines) ? tip.lines : [];
        const title = tip.title || "";

        // Find the corresponding button bounds for positioning
        const btn = this.stageMetaButtons &&
            this.stageMetaButtons.find(b => b.index === this.hoveredStageMetaIndex);

            // Tooltip for hovered meta-upgrade
        if (typeof this.hoveredStageMetaIndex === "number" &&
            this.hoveredStageMetaIndex >= 0 &&
            this.hoveredStageMetaIndex < 8 &&
            typeof this.getStagePointTooltipInfo === "function") {

            const idx = this.hoveredStageMetaIndex;
            const tip = this.getStagePointTooltipInfo(idx);
            const lines = Array.isArray(tip.lines) ? tip.lines : [];
            const title = tip.title || "";

            // Ownership / cost / affordability
            const owned = Array.isArray(this.stagePointLevels) &&
                this.stagePointLevels[idx] > 0;
            const cost = (typeof this.getStagePointUpgradeCost === "function")
                ? this.getStagePointUpgradeCost(idx)
                : 1;

            // We treat meta as single-purchase, so "purchased" once owned
            const hintText = owned ? "purchased" : "click to buy";

            // Find the corresponding button bounds for positioning
            const btn = this.stageMetaButtons &&
                this.stageMetaButtons.find(b => b.index === idx);

            if (btn) {
                ctx.font = "14px 'Blockletter'";
                let maxWidth = ctx.measureText(title).width;
                for (let i = 0; i < lines.length; i++) {
                    const wLine = ctx.measureText(lines[i]).width;
                    if (wLine > maxWidth) {
                        maxWidth = wLine;
                    }
                }

                const paddingXTip = 10;
                const paddingYTip = 8;
                const lineHeight = 18;

                // Extra space for "Cost: X" and hint line
                const extraLines = 2;
                const tipW = maxWidth + paddingXTip * 2;
                const tipH = (lines.length + 1 + extraLines) * lineHeight + paddingYTip * 2;

                const margin = 8;

                // Start to the right of the button, vertically centered on it
                let tipX = btn.x + btn.w + margin;
                let tipY = btn.y + (btn.h - tipH) / 2;

                const panelLeft = pointsX + 4;
                const panelRight = pointsX + modalW - 4;
                const panelTop = pointsY + 4;
                const panelBottom = pointsY + pointsHeight - 4;

                if (tipX + tipW > panelRight) {
                    tipX = btn.x - tipW - margin;
                }
                if (tipX < panelLeft) {
                    tipX = panelLeft;
                }

                if (tipY < panelTop) {
                    tipY = panelTop;
                }
                if (tipY + tipH > panelBottom) {
                    tipY = panelBottom - tipH;
                }

                ctx.beginPath();
                ctx.rect(tipX, tipY, tipW, tipH);
                ctx.fillStyle = "rgba(5, 8, 20, 0.98)";
                ctx.fill();

                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(210,230,255,0.95)";
                ctx.stroke();

                ctx.textAlign = "left";
                ctx.textBaseline = "top";

                let dy = tipY + paddingYTip;

                // Title
                ctx.font = "16px 'Blockletter'";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(title, tipX + paddingXTip, dy);

                // Body lines
                ctx.font = "14px 'Blockletter'";
                ctx.fillStyle = "#d0e0ff";
                for (let i = 0; i < lines.length; i++) {
                    dy += lineHeight;
                    const line = lines[i];
                    if (!line) {
                        continue;
                    }
                    ctx.fillText(line, tipX + paddingXTip, dy);
                }

                // Hint line near bottom: "click to buy" / "purchased"
                ctx.font = "12px 'Blockletter'";
                ctx.fillStyle = owned ? "#a8f0a8" : "#ffd2ff";
                ctx.fillText(
                    hintText,
                    tipX + paddingXTip,
                    tipY + tipH - paddingYTip - 12
                );
            }
        }
    }

    ctx.restore();
};

CirclesGame.prototype.getStageDescription = function (idx) {
    switch (idx) {
        case 0: return "";
        case 1: return "Higher rings give less mult.";
        case 2: return "No loop upgrade";
        case 3: return "40 loops";
        case 4: return "Cost scaling increased";
        case 5: return "No loop multiplier";
        case 6: return "Threshold starts at 100";
        case 7: return "No upgrades";
        case 8: return "100 loops at threshold 50";
        default: return "Stage challenge.";
    }
};

