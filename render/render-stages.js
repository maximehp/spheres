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
    this.stagesModalVisible = true;
};

CirclesGame.prototype.hideStagesModal = function () {
    // If a stage has just been completed, you must choose a different stage
    // before you are allowed to close the modal.
    if (this.requireStageChange) {
        return;
    }
    this.stagesModalVisible = false;
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
    const STEPS = 64;

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

        if (rotationOn) {
            // Local per-sphere timer: starts at 0 and only advances while rotating.
            if (typeof s.spinT !== "number") {
                s.spinT = 0;
            }

            // Use the previous value of spinT to compute orientation,
            // so the first rotating frame is exactly the base pose.
            const tLocal = s.spinT;

            // Advance timer for next frame
            s.spinT += dt;

            // Small animated offsets around the base pose, desynced per stage
            yaw = baseYaw + tLocal * 0.35;

            pitch = basePitch + Math.sin(tLocal * 0.27 + basePhase) * 0.4;

            roll = baseRoll + Math.sin(tLocal * 0.19 + basePhase * 1.3) * 0.4;
        } else {
            // If rotation is off, keep the timer reset so it starts from
            // the base pose next time it is enabled.
            s.spinT = 0;
        }

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
    if (!this.stageCompleted || !this.stageCompleted.some(Boolean)) {
        this.stagesButtonBounds = null;
        return;
    }

    const label = "Stages";
    ctx.font = '22px "Blockletter"';
    const textW = ctx.measureText(label).width;

    const paddingX = 18;
    const paddingY = 10;
    const btnW = textW + paddingX * 2;
    const btnH = 40;

    const x = (w - btnW) / 2;
    const y = h - btnH - 20;

    // Save bounds for click detection
    this.stagesButtonBounds = { x, y, w: btnW, h: btnH };

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, btnW, btnH, 10);
        ctx.fill();
    } else {
        ctx.fillRect(x, y, btnW, btnH);
    }

    // Text
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + btnW / 2, y + btnH / 2);
};

CirclesGame.prototype.drawStagesModal = function (ctx, w, h) {
    if (!this.stagesModalVisible) {
        this.stageRowBounds = [];
        this.stageModalCloseBounds = null;
        return;
    }

    // Backdrop
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    const modalW = w * 0.6;
    const modalH = h * 0.65;
    const x = (w - modalW) / 2;
    const y = (h - modalH) / 2;

    this.stagesModalBounds = { x, y, w: modalW, h: modalH };

    // Window panel
    ctx.beginPath();
    ctx.roundRect(x, y, modalW, modalH, 20);
    ctx.fillStyle = "rgba(20,20,40,0.95)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "white";
    ctx.stroke();

    // Title
    ctx.font = "32px Blockletter";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "white";
    ctx.fillText("STAGES", x + modalW / 2, y + 20);

    // Close button (only active if we are not forced to change stage)
    const closeSize = 32;
    const cxClose = x + modalW - closeSize - 12;
    const cyClose = y + 12;
    this.stageModalCloseBounds = { x: cxClose, y: cyClose, w: closeSize, h: closeSize };

    ctx.beginPath();
    ctx.roundRect(cxClose, cyClose, closeSize, closeSize, 8);
    ctx.fillStyle = this.requireStageChange
        ? "rgba(120,120,120,0.6)"
        : "rgba(255,60,60,0.8)";
    ctx.fill();

    ctx.font = "26px Blockletter";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "black";
    ctx.fillText("X", cxClose + closeSize / 2, cyClose + closeSize / 2);

    // Stage rows
    const rowH = 48;
    const startY = y + 90;

    this.stageRowBounds = [];

    const count = this.stageCount || 9;
    const completedFlags = this.stageCompleted || new Array(count).fill(false);
    const lastIndex = count - 1;
    const allBeforeLastComplete = completedFlags
        .slice(0, lastIndex)
        .every(Boolean);

    for (let i = 0; i < count; i++) {
        const ry = startY + i * (rowH + 8);

        if (ry + rowH > y + modalH - 20) break;

        const isComplete = !!completedFlags[i];
        const isActive = this.activeStageIndex === i;
        const isFinal = i === count - 1;

        let locked = false;
        let status;

        if (isComplete) {
            locked = true;
            status = "Completed (locked)";
        } else {
            status = "Not Completed";
        }

        // Final stage requires all previous stages completed
        if (isFinal && !allBeforeLastComplete) {
            locked = true;
            status = "Locked (complete all previous stages)";
        }

        // After a completion, you must choose a different stage
        if (this.requireStageChange && isActive) {
            locked = true;
            status = "Choose another stage to continue";
        }

        // Background
        ctx.beginPath();
        ctx.roundRect(x + 20, ry, modalW - 40, rowH, 12);
        ctx.fillStyle = locked
            ? "rgba(80,80,80,0.5)"
            : isActive
            ? "rgba(120,180,255,0.5)"
            : isComplete
            ? "rgba(100,255,120,0.5)"
            : "rgba(255,255,255,0.15)";
        ctx.fill();

        // Text
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "20px Blockletter";
        ctx.fillStyle = "white";

        ctx.fillText(`Stage ${i + 1} — ${status}`, x + 30, ry + rowH / 2);

        // Save clickable bounds if row is clickable
        if (!locked) {
            this.stageRowBounds.push({
                x: x + 20,
                y: ry,
                w: modalW - 40,
                h: rowH,
                index: i
            });
        }
    }
};

