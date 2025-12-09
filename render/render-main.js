// render-main.js

CirclesGame.prototype.ringColor = function (ringIndex, stageIndex) {
    // Default to the current active stage if none provided
    if (typeof stageIndex !== "number") {
        stageIndex = (typeof this.activeStageIndex === "number")
            ? this.activeStageIndex
            : 0;
    }

    // If per stage palettes exist, use them
    if (typeof STAGE_PALETTES !== "undefined" &&
        Array.isArray(STAGE_PALETTES) &&
        STAGE_PALETTES[stageIndex] &&
        STAGE_PALETTES[stageIndex].length > 0) {

        const palette = STAGE_PALETTES[stageIndex];
        return palette[ringIndex % palette.length];
    }

    // Fallback global palette
    const fallback = [
        "#70ffa3",
        "#6ef4ff",
        "#a98bff",
        "#ff7bd9",
        "#ffc857",
        "#f25f5c"
    ];
    return fallback[ringIndex % fallback.length];
};


CirclesGame.prototype.draw = function () {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const cxBase = w / 2;
    const cyBase = h / 2;

    const dt = this.lastDt || 0.016;

    // ==================================
    // Spend animation: timing + factor f
    // ==================================
    let spendAnim = this.spendAnim && this.spendAnim.active ? this.spendAnim : null;
    let spendF = 0;

    if (spendAnim) {
        spendAnim.t += dt;
        if (spendAnim.t >= spendAnim.duration) {
            spendAnim.t = spendAnim.duration;
            spendAnim.active = false;
        }
        const raw = spendAnim.t / spendAnim.duration;
        // ease-out curve: f in [0,1]
        spendF = raw * (2 - raw);
    } else {
        this.spendAnim = null;
    }

    // Display values: blend snapshot "from" -> LIVE state
    let displayTotalUnits = this.totalUnits;
    let displayLoopThreshold = this.loopThreshold;
    let displayMultScale = this.multScale;

    if (spendAnim && spendAnim.from) {
        const from = spendAnim.from;

        displayTotalUnits =
            from.totalUnits +
            (this.totalUnits - from.totalUnits) * spendF;

        displayLoopThreshold =
            from.loopThreshold +
            (this.loopThreshold - from.loopThreshold) * spendF;

        displayMultScale =
            from.multScale +
            (this.multScale - from.multScale) * spendF;
    }

    // ===========================
    // Top-center total number
    // ===========================
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = '32px "Blockletter"';

    const totalStr = Math.floor(displayTotalUnits).toLocaleString();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(totalStr, cxBase, 8);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(totalStr, cxBase, 8);

    // Scientific notation version under the big number, with threshold + fade
    if (this.sciLabelAlpha == null) {
        this.sciLabelAlpha = 0;
    }

    const wantsSci = displayTotalUnits >= 1e6;
    const targetAlpha = wantsSci ? 1 : 0;
    const fadeSpeed = 1 / 0.5; // reach target in ~0.5s

    if (this.sciLabelAlpha < targetAlpha) {
        this.sciLabelAlpha = Math.min(targetAlpha, this.sciLabelAlpha + fadeSpeed * dt);
    } else if (this.sciLabelAlpha > targetAlpha) {
        this.sciLabelAlpha = Math.max(targetAlpha, this.sciLabelAlpha - fadeSpeed * dt);
    }

    if (this.sciLabelAlpha > 0.001) {
        const sci = displayTotalUnits.toExponential(2).replace("+", "");

        ctx.font = '18px "Blockletter"';
        ctx.textBaseline = "top";

        const strokeAlpha = 0.65 * this.sciLabelAlpha;
        const fillAlpha = 1.0 * this.sciLabelAlpha;

        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0," + strokeAlpha + ")";
        ctx.strokeText("(" + sci + ")", cxBase, 44);

        ctx.fillStyle = "rgba(160,160,160," + fillAlpha + ")";
        ctx.fillText("(" + sci + ")", cxBase, 44);
    }

    // Base sphere geometry (unanimated)
    const sphereRadiusBase = Math.min(w, h) * 0.32;
    const cySphereBase = cyBase + 10;

    // Animated sphere center and radius (for run-complete shrink)
    let cxSphere = cxBase;
    let cySphere = cySphereBase;
    let sphereRadius = sphereRadiusBase;

    const runAnimActive = this.runCompleteAnim && this.runCompleteAnim.active;
    const flashActive = this.runCompleteFlash && this.runCompleteFlash.active;
    const runAnimOrStatic = runAnimActive || this.completedSphereStatic || flashActive;

    // Smoothly fade the whole sphere cluster from 1.0 to 0.6
    // over the course of the shrink animation. Flash alone does not change alpha.
    let completionAlpha = 1.0;
    if (this.runCompleteAnim && (this.runCompleteAnim.active || this.completedSphereStatic)) {
        const anim = this.runCompleteAnim;
        const fRaw = anim.duration > 0 ? Math.min(anim.t / anim.duration, 1) : 1;
        const target = 0.6;
        completionAlpha = 1 - (1 - target) * fRaw; // 1 -> 0.6
    }
    this.completionAlpha = completionAlpha;

    // Show the main sphere during play, flash and shrink.
    // Once the shrink has completed and the sphere is parked,
    // hide it so only the orbit trophy remains.
    const showMainSphere =
        !this.completedSphereStatic || runAnimActive || flashActive;

    // Ellipse quality for latitude arcs:
    // during shrink, smoothly drop from 64 segments down to 12,
    // then stay low while the sphere is parked.
    let ellipseSteps = 48;

    if (this.runCompleteAnim && (this.runCompleteAnim.active || this.runCompleteAnim.t > 0)) {
        const anim = this.runCompleteAnim;
        const fRaw = anim.duration > 0 ? anim.t / anim.duration : 1;
        const f = Math.max(0, Math.min(1, fRaw));

        const baseOffset = sphereRadiusBase * STAGE_ORBIT_RADIUS_FACTOR;
        const offset = baseOffset * f;

        const angle = anim.angle || this.getStageAngle(this.activeStageIndex);
        const targetCx = cxBase + Math.cos(angle) * offset;
        const targetCy = cySphereBase + Math.sin(angle) * offset;

        cxSphere = cxBase + (targetCx - cxBase) * f;
        cySphere = cySphereBase + (targetCy - cySphereBase) * f;

        const minRadius = sphereRadiusBase * (anim.targetRadiusScale || STAGE_SPHERE_RADIUS_FACTOR);
        sphereRadius = sphereRadiusBase + (minRadius - sphereRadiusBase) * f;

        const maxSteps = 36;
        const minSteps = 10;
        ellipseSteps = Math.round(maxSteps - (maxSteps - minSteps) * f);
    } else if (this.completedSphereStatic) {
        ellipseSteps = 12;
    }

    // Collect indices of rings that exist (for animation, treat rings that used to
    // exist OR currently exist as visible).
    const visibleIndices = [];
    const fromRings = spendAnim && spendAnim.from ? spendAnim.from.rings : null;

    for (let i = 0; i < this.rings.length; i++) {
        const nowExists = this.rings[i].exists();
        const fromExists = fromRings && fromRings[i] && fromRings[i].exists;
        if (nowExists || fromExists) {
            visibleIndices.push(i);
        }
    }

    const stageSlots = this.getStageLoopSlots(this.activeStageIndex);
    const usedSlots = Math.min(visibleIndices.length, stageSlots);

    // Sphere opacity: 0 at zero, up to 1 when all slots filled
    const opacityFactor = usedSlots > 0
        ? (usedSlots / stageSlots)
        : 0.0;

    // ===========================
    // TROPHY SPHERES (independent alpha)
    // ===========================
    this.drawCompletedStageSpheres(ctx, cxBase, cySphereBase, sphereRadiusBase, true);

    // ===========================
    // MAIN SPHERE + RINGS CLUSTER
    // (fades with completionAlpha)
    // ===========================
    ctx.save();
    if (this.completionAlpha < 1.0) {
        ctx.globalAlpha *= this.completionAlpha;
    }

    if (showMainSphere) {
        this.drawSphereBackground(ctx, cxSphere, cySphere, sphereRadius, opacityFactor);
    }

    if (showMainSphere && usedSlots === 0) {
        if (this.winState && this.winState.active) {
            // fall through to overlay
        } else {
            // Draw upgrade buttons anyway, anchored to base sphere
            this.drawUpgradeButtons(ctx, cxBase, cySphereBase, sphereRadiusBase);
        }
    }

    // ===========================
    // Rings as latitudes
    // ===========================

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "14px 'Blockletter'";

    const maxLat = Math.PI * 0.45;

    // Ring 0 loop rate was computed in update; default to 0 if not set.
    const loopRate0 = this.loopRate0 || 0;

    // Hysteresis thresholds
    const solidOnThreshold = 10;  // become solid when >= 10 loops/sec
    const solidOffThreshold = 4;  // stop being solid when <= 4 loops/sec

    const smoothingWindow = 1.0;  // about 1 second
    const alpha = Math.min(1, dt / smoothingWindow);

    const winActive = this.winState && this.winState.active;

    if (showMainSphere) {
        if (runAnimOrStatic) {
            // During flash/shrink/park: visually fill ALL latitude bands.
            for (let slot = 0; slot < stageSlots; slot++) {
                const tSlot = stageSlots === 1 ? 0.5 : slot / (stageSlots - 1);
                const lat = (0.5 - tSlot) * 2 * maxLat;

                if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
                    continue;
                }

                const yOffset = Math.sin(lat) * sphereRadius;
                const k = Math.cos(lat);
                const rx = sphereRadius * 1.1 * Math.abs(k);
                const ry = sphereRadius * 0.55 * Math.abs(k);

                const centerY = cySphere + yOffset;
                const col = this.ringColor(slot, this.activeStageIndex);

                // Background ellipse
                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(0,0,0,0.65)";
                this.drawEllipseArc(ctx, cxSphere, centerY, rx, ry, 0, Math.PI * 2, ellipseSteps);

                // Full progress arc
                const start = -Math.PI / 2;
                const end = start + Math.PI * 2;

                ctx.lineWidth = 3.2;
                ctx.strokeStyle = col;
                ctx.lineCap = "round";
                this.drawEllipseArc(ctx, cxSphere, centerY, rx, ry, start, end, ellipseSteps);
            }
        } else {
            // Normal rendering: only for rings that exist / are visible.
            for (let slot = 0; slot < usedSlots; slot++) {
                const ringIndex = visibleIndices[slot];
                const ring = this.rings[ringIndex];

                const t = stageSlots === 1 ? 0.5 : slot / (stageSlots - 1);
                const lat = (0.5 - t) * 2 * maxLat;

                if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
                    continue;
                }

                const yOffset = Math.sin(lat) * sphereRadius;
                const k = Math.cos(lat);
                const rx = sphereRadius * 1.1 * Math.abs(k);
                const ry = sphereRadius * 0.55 * Math.abs(k);

                const centerY = cySphere + yOffset;
                const col = this.ringColor(ringIndex, this.activeStageIndex);

                // Background ellipse
                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(0,0,0,0.65)";
                this.drawEllipseArc(ctx, cxSphere, centerY, rx, ry, 0, Math.PI * 2, ellipseSteps);

                // Approximate loops/sec for this ring, use REAL threshold for logic
                let ringLoopRate = 0;
                if (this.loopThreshold > 0) {
                    ringLoopRate = loopRate0 / Math.pow(this.loopThreshold, ringIndex);
                }

                // Hysteresis: latch solid on at 10, release at 4 (on the real state)
                if (!ring.solid && ringLoopRate >= solidOnThreshold) {
                    ring.solid = true;
                } else if (ring.solid && ringLoopRate <= solidOffThreshold) {
                    ring.solid = false;
                }
                let isSolid = ring.solid;

                // Display progress: blend from snapshot progress -> live progress
                let displayProgress = ring.progress;
                if (spendAnim && fromRings && fromRings[ringIndex] && fromRings[ringIndex].exists) {
                    const fromProg = fromRings[ringIndex].progress;
                    displayProgress = fromProg + (ring.progress - fromProg) * spendF;
                    if (fromRings[ringIndex].solid) {
                        isSolid = true;
                    }
                }

                // Progress arc: solid vs fractional
                let frac = 0;
                if (isSolid) {
                    frac = 1;
                } else {
                    frac = Math.max(0, Math.min(1, displayProgress / displayLoopThreshold));
                }

                if (frac > 0) {
                    const start = -Math.PI / 2;
                    const end = start + frac * Math.PI * 2;

                    ctx.lineWidth = 3.2;
                    ctx.strokeStyle = col;
                    ctx.lineCap = "round";
                    this.drawEllipseArc(ctx, cxSphere, centerY, rx, ry, start, end, ellipseSteps);
                }

                // Multiplier label for higher rings with nonzero progress
                if (!runAnimOrStatic && ringIndex > 0 && displayProgress > 0) {
                    // Mirror safe-mult logic here so the label matches the real math.
                    const hasMultFloor = Array.isArray(this.stagePointLevels) &&
                        this.stagePointLevels[3] > 0;

                    let loopsHere = displayProgress + 1;
                    if (hasMultFloor && loopsHere < 4) {
                        loopsHere = 4;
                    }

                    const term = displayMultScale * loopsHere;
                    const instMult = Math.sqrt(Math.max(0, term));

                    let displayMult;

                    if (!winActive && isSolid && !(spendAnim && fromRings && fromRings[ringIndex])) {
                        if (ring.multAverage == null) {
                            ring.multAverage = instMult;
                        } else {
                            ring.multAverage += (instMult - ring.multAverage) * alpha;
                        }
                        displayMult = ring.multAverage;
                    } else {
                        ring.multAverage = null;
                        displayMult = instMult;
                    }

                    const label = `${displayMult.toFixed(2)}x`;

                    const thetaTop = -Math.PI / 2;
                    const labelX = cxSphere + rx * Math.cos(thetaTop);
                    const labelY = centerY + ry * Math.sin(thetaTop) - 4;

                    ctx.lineWidth = 3;
                    ctx.strokeStyle = col;
                    ctx.strokeText(label, labelX, labelY);

                    ctx.fillStyle = "#000000";
                    ctx.fillText(label, labelX, labelY);
                }
            }
        }
    }

    ctx.restore(); // end of completionAlpha fade for main sphere + rings

    // Stages button and upgrades (UI, not affected by completionAlpha)
    this.drawStagesButton(ctx, w, h);
    this.drawUpgradeButtons(ctx, cxBase, cySphereBase, sphereRadiusBase);

    // ===========================
    // RUN-COMPLETE FLASH OVERLAY
    // ===========================
    if (this.runCompleteFlash && this.runCompleteFlash.active) {
        const tF = this.runCompleteFlash.timer;
        const Df = this.runCompleteFlash.duration;

        const phase = Math.max(0, Math.min(1, tF / Df));

        // Mild brightness wash
        const flashAlpha = (1 - Math.abs(phase * 2 - 1)) * 0.35;
        ctx.fillStyle = "rgba(255,255,255," + flashAlpha + ")";
        ctx.fillRect(0, 0, w, h);

        // Single expanding pulse ring from the sphere's current position.
        const baseR = Math.min(w, h) * 0.35;
        const p = phase;
        const r = baseR + p * baseR * 1.4;

        ctx.beginPath();
        ctx.arc(cxSphere, cySphere, r, 0, Math.PI * 2);
        ctx.lineWidth = 4 * (1 - p);
        ctx.strokeStyle = "rgba(255,255,255," + ((1 - p) * 0.7) + ")";
        ctx.stroke();
    }

    this.drawStagesModal(ctx, w, h);      // modal (if open)

    // ===========================
    // WIN ANIMATION OVERLAY
    // ===========================
    if (this.winState && this.winState.active) {
        const tWin = this.winState.timer;
        const D = this.winState.duration;

        const alphaIn = Math.min(1, tWin * 2.4);
        const alphaOut = Math.max(0, 1 - (tWin - 1.0) / 2.2);
        const alpha = Math.min(alphaIn, alphaOut);

        ctx.fillStyle = "rgba(255,255,255," + (0.28 * alpha) + ")";
        ctx.fillRect(0, 0, w, h);

        const cxMid = w / 2;
        const cyMid = h / 2 + 10;
        const baseR = Math.min(w, h) * 0.35;

        for (let i = 0; i < 6; i++) {
            const p = (tWin * 1.3 + i * 0.15) % 1;
            const r = baseR + p * baseR * 1.2;

            ctx.beginPath();
            ctx.arc(cxMid, cyMid, r, 0, Math.PI * 2);
            ctx.lineWidth = 4 * (1 - p);
            ctx.strokeStyle = "rgba(255,255,255," + ((1 - p) * 0.55 * alpha) + ")";
            ctx.stroke();
        }

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '48px "Blockletter"';

        ctx.lineWidth = 6 * alpha;
        ctx.strokeStyle = "rgba(0,0,0," + (0.9 * alpha) + ")";
        ctx.strokeText("You\'re pretty good at spheres", w / 2, h / 2);

        ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
        ctx.fillText("You\'re pretty good at spheres", w / 2, h / 2);
    }
};

CirclesGame.prototype.updateInfo = function () {
    if (!this.infoBox) {
        return;
    }

    const total = this.getTotalUnits();
    const baseRate0 = this.computeBaseRate();

    this.infoBox.innerHTML = `
        <div style="font-size: 14px; color: #ffd2ff;">
            total loops: <strong>${total.toLocaleString()}</strong><br>
            loop threshold: <strong>${this.loopThreshold}</strong><br>
            base rate: <strong>${baseRate0.toFixed(2)}</strong><br>
            mult scale: <strong>${this.multScale.toFixed(3)}</strong>
        </div>
    `;
};
