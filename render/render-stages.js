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

        let label = "Stage " + (i + 1);
        let status = isComplete ? "✓ complete" : "not completed";

        let locked = false;

        // Once a stage is completed, it is locked forever
        if (isComplete) {
            locked = true;
            status = "completed (locked)";
        }

        // Final stage requires all earlier stages completed
        if (isFinalStage && !allBeforeLastComplete) {
            locked = true;
            status = "locked (complete all previous stages)";
        }

        // After a completion, you must pick a different stage;
        // the just-completed stage cannot be chosen again.
        if (this.requireStageChange && isActive) {
            locked = true;
            status = "choose another stage to continue";
        }

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

    this.loopThreshold = this.baseLoopThreshold;
    this.multScale = this.baseMultScale;
    this.upgradeLevels = [0, 0, 0, 0];

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

CirclesGame.prototype.drawCompletedStageSpheres = function (ctx, cxBase, cySphereBase, sphereRadiusBase, spinActive) {
    if (!this.completedStageSpheres || this.completedStageSpheres.length === 0) {
        return;
    }

    if (spinActive === undefined) {
        spinActive = true;
    }

    const dt = this.lastDt || 0.016; // per-frame time step

    const orbitRadius = sphereRadiusBase * STAGE_ORBIT_RADIUS_FACTOR;

    // Slightly larger than the shrink target so the fake sphere
    // visually matches the parked "real" sphere.
    const TROPHY_RADIUS_SCALE = STAGE_SPHERE_RADIUS_FACTOR * 1.2;
    const smallRadius = sphereRadiusBase * TROPHY_RADIUS_SCALE;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px 'Blockletter'";

    const maxLat = Math.PI * 0.45;
    const STEPS = 12;

    // Helper: draw one 3D-rotated ring as a polyline
    function drawRing3D(cx, cy, R, lat, yaw, pitch, roll, color) {
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        const cosPitch = Math.cos(pitch);
        const sinPitch = Math.sin(pitch);
        const cosRoll = Math.cos(roll);
        const sinRoll = Math.sin(roll);

        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);

        // Circle radius in x–z plane at this latitude
        const rLat = R * cosLat;
        const yLat = R * sinLat;

        const points = [];

        for (let i = 0; i <= STEPS; i++) {
            const phi = (i / STEPS) * Math.PI * 2;

            // Unrotated point on latitude circle
            let x = rLat * Math.cos(phi);
            let y = yLat;
            let z = rLat * Math.sin(phi);

            // Yaw (around Y axis)
            let x1 = cosYaw * x + sinYaw * z;
            let z1 = -sinYaw * x + cosYaw * z;
            let y1 = y;

            // Pitch (around X axis)
            let y2 = cosPitch * y1 - sinPitch * z1;
            let z2 = sinPitch * y1 + cosPitch * z1;
            let x2 = x1;

            // Roll (around Z axis)
            let x3 = cosRoll * x2 - sinRoll * y2;
            let y3 = sinRoll * x2 + cosRoll * y2;

            points.push({
                x: cx + x3,
                y: cy + y3
            });
        }

        // Background stroke
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.stroke();

        // Colored foreground stroke
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.lineWidth = 3.2;
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    for (const s of this.completedStageSpheres) {
        // If this flag is not set, default to already spawned (for old saves)
        const spawned = (s.spawned === undefined) ? true : s.spawned;
        if (!spawned) {
            // Newly completed stage trophy waits until shrink finishes.
            continue;
        }

        const angle = s.angle ?? 0;
        const sx = cxBase + Math.cos(angle) * orbitRadius;
        const sy = cySphereBase + Math.sin(angle) * orbitRadius;

        ctx.save();

        // Always render completed trophies at 0.6 opacity
        ctx.globalAlpha *= 0.6;

        // Base gradient sphere
        this.drawSphereBackground(ctx, sx, sy, smallRadius, 1.0);

        // Per-sphere phase so they are desynced
        const stageIndex = s.stage ?? 0;
        const basePhase = stageIndex * 0.7;

        // Rotation is on by default unless explicitly disabled
        const rotationOn = spinActive && (s.rotationEnabled !== false);

        // Static "base" pose (this is what we want at t = 0)
        const baseYaw = 0;
        const basePitch = 0.5;
        const baseRoll = 0;

        let yaw = baseYaw;
        let pitch = basePitch;
        let roll = baseRoll;

        // Local per-sphere timer: starts at 0 and only advances while rotating.
        if (typeof s.spinT !== "number") {
            s.spinT = 0;
        }

        // Advance timer first so the very first rotating frame already
        // has a tiny movement away from the pure base pose.
        s.spinT += dt;
        const tLocal = s.spinT;

        // Small animated offsets around the base pose, desynced per stage
        yaw = baseYaw + tLocal * 0.35;
        pitch = basePitch + Math.sin(tLocal * 0.27 * ((basePhase + 1) / 2)) * 0.4;
        roll = baseRoll + Math.sin(tLocal * 0.19 * ((basePhase) + 1 / 2) * 1.3) * 0.4;

        // Latitude rings: same count and thickness as main sphere
        for (let slot = 0; slot < MAX_SLOTS; slot++) {
            const tSlot = MAX_SLOTS === 1 ? 0.5 : slot / (MAX_SLOTS - 1);
            const lat = (0.5 - tSlot) * 2 * maxLat;
            if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
                continue;
            }

            const col = this.ringColor(slot);
            drawRing3D(sx, sy, smallRadius, lat, yaw, pitch, roll, col);
        }

        ctx.restore();
    }
};

// Draws the bottom “Stages” button inside the canvas.
// It appears only when at least one stage is completed.
CirclesGame.prototype.drawStagesButton = function (ctx, w, h) {
    // Only show if at least one stage is completed
    if (!this.stageCompleted || !this.stageCompleted.some(Boolean)) {
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

    // Final modal height
    const modalH =
        padding +
        titleHeight +
        titleGap +
        gridInnerHeight +
        rowGap +          // gap before Stage 9
        stage9Height +
        padding;

    // Points panel constants
    const pointsGap = 12;
    const pointsHeight = 80;

    // Center modal vertically (space added for points panel)
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

        // Two-phase animation:
        // phase 1 (0..0.5): grow width from 0 to 1, height up to thin strip
        // phase 2 (0.5..1): keep width ~1, grow height from thin strip to 1
        const phase1 = Math.min(1, dir * 2);       // 0..1
        const phase2 = Math.max(0, dir * 2 - 1);   // 0..1

        function easeOutQuad(t) {
            return t * (2 - t);
        }

        const sWidth = easeOutQuad(phase1);        // width scaling
        const thinFrac = 0.05;                     // relative thickness of the "line"
        const heightPhase1 = thinFrac * sWidth;
        const heightPhase2 = easeOutQuad(phase2);
        const sHeight = heightPhase1 + (1 - thinFrac) * heightPhase2;

        scaleX = sWidth;
        scaleY = sHeight;

        // Guard against degenerate frame
        if (scaleX < 0.001 || scaleY < 0.001) {
            return;
        }
    }

    // Everything below (modal + grid + stage 9 + points) is drawn under a scale transform
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
        let statusText = isComplete ? "Completed" : "Available";

        // Once a stage is completed, it is locked forever
        if (isComplete) {
            locked = true;
        }

        // Final stage requires all earlier stages completed
        if (idx === lastIndex && !allBeforeLastComplete) {
            locked = true;
            statusText = "Locked";
        }

        // After a completion, you must pick a different stage;
        // the just-completed stage cannot be chosen again.
        if (this.requireStageChange && isActive) {
            locked = true;
            statusText = "Pick another";
        }

        if (canResume) {
            statusText = "Resume";
        }

        let fillStyle;
        let strokeStyle;
        let titleColor = "#f6f6ff";
        let statusColor = "#d0d0ff";

        if (canResume) {
            // Active in-progress stage: green tint
            fillStyle = "rgba(10, 40, 20, 0.98)";
            strokeStyle = "rgba(140, 255, 180, 0.98)";
            titleColor = "#c8ffc8";
            statusColor = "#9cffb0";
        } else if (isComplete) {
            fillStyle = "rgba(60,60,60,0.6)";
            strokeStyle = "rgba(150,150,150,0.6)";
            titleColor = "#b0b0b0";
            statusColor = "#c0c0c0";
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

        ctx.beginPath();
        ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fillStyle = fillStyle;
        ctx.fill();

        ctx.lineWidth = isActive && !isComplete ? 2 : 1;
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.font = "20px 'Blockletter'";
        ctx.fillStyle = titleColor;
        ctx.fillText("Stage " + (idx + 1), cardX + cardW / 2, cardY + cardH * 0.35);

        ctx.font = "14px 'Blockletter'";
        ctx.fillStyle = statusColor;
        ctx.fillText(statusText, cardX + cardW / 2, cardY + cardH * 0.65);

        // Do not allow interaction while animating
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
            rowGap;       // spacing after row 2

        const stage9W = gridInnerWidth;
        const stage9H = cardSize;

        drawCard(idx, stage9X, stage9Y, stage9W, stage9H);
    }

    // ===== POINTS PANEL (same width as modal, included in scale) =====
    const pointsX = x;
    const pointsY = y + modalH + pointsGap;

    ctx.beginPath();
    ctx.rect(pointsX, pointsY, modalW, pointsHeight);
    ctx.fillStyle = "rgba(15,20,40,0.95)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(200,230,255,0.95)";
    ctx.stroke();

    // Points text
    const totalPoints = this.totalUnits || 0;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "24px 'Blockletter'";
    ctx.fillStyle = "#f6f6ff";
    ctx.fillText("POINTS", pointsX + 10, pointsY + 10);

    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = "20px 'Blockletter'";
    ctx.fillStyle = "#ffd2ff";
    ctx.fillText(
        totalPoints.toLocaleString(),
        pointsX + modalW - 10,
        pointsY + pointsHeight - 12
    );

    ctx.restore(); // end modal+points scaling block
};
