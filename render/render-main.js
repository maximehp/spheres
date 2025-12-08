// render-main.js

CirclesGame.prototype.ringColor = function (i) {
    const palette = [
        "#70ffa3",
        "#6ef4ff",
        "#a98bff",
        "#ff7bd9",
        "#ffc857",
        "#f25f5c"
    ];
    return palette[i % palette.length];
};

CirclesGame.prototype.draw = function () {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

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
    ctx.strokeText(totalStr, cx, 8);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(totalStr, cx, 8);

    // Sphere radius; slightly larger now.
    const sphereRadius = Math.min(w, h) * 0.32;
    const cySphere = cy + 10;

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

    const usedSlots = Math.min(visibleIndices.length, MAX_SLOTS);

    // Sphere opacity: 0 at zero, up to 1 when 16 slots filled
    const opacityFactor = usedSlots > 0
        ? (usedSlots / MAX_SLOTS)
        : 0.0;

    this.drawSphereBackground(ctx, cx, cySphere, sphereRadius, opacityFactor);

    if (usedSlots === 0) {
        // Win overlay can still run, but there is nothing to draw for rings.
        if (this.winState && this.winState.active) {
            // fall through to overlay
        } else {
            return;
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

    for (let slot = 0; slot < usedSlots; slot++) {
        const ringIndex = visibleIndices[slot];
        const ring = this.rings[ringIndex];

        // t = slot position in [0, MAX_SLOTS-1]
        const t = MAX_SLOTS === 1 ? 0.5 : slot / (MAX_SLOTS - 1);
        const lat = (0.5 - t) * 2 * maxLat;

        if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
            continue;
        }

        const yOffset = Math.sin(lat) * sphereRadius;
        const k = Math.cos(lat);
        const rx = sphereRadius * 1.1 * Math.abs(k);
        const ry = sphereRadius * 0.55 * Math.abs(k);

        const centerY = cySphere + yOffset;
        const col = this.ringColor(ringIndex);

        // Background ellipse
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        this.drawEllipseArc(ctx, cx, centerY, rx, ry, 0, Math.PI * 2);

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
            // If the old ring was solid, keep it visually solid during the blend
            if (fromRings[ringIndex].solid) {
                isSolid = true;
            }
        }

        // Progress arc: solid vs fractional
        let frac = 0;
        if (winActive) {
            // During win animation, render all rings as fully complete
            frac = 1;
        } else if (isSolid) {
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
            this.drawEllipseArc(ctx, cx, centerY, rx, ry, start, end);
        }

        // Multiplier label for higher rings with nonzero progress
        if (ringIndex > 0 && displayProgress > 0) {
            const term = displayMultScale * (displayProgress + 1);
            const instMult = Math.sqrt(Math.max(0, term));

            let displayMult;

            if (!winActive && isSolid && !(spendAnim && fromRings && fromRings[ringIndex])) {
                // For solid rings without spend animation affecting them, smooth over about 1 second using EMA
                if (ring.multAverage == null) {
                    ring.multAverage = instMult;
                } else {
                    ring.multAverage += (instMult - ring.multAverage) * alpha;
                }
                displayMult = ring.multAverage;
            } else {
                // For non-solid, animating, or win-state rings, show the raw multiplier
                ring.multAverage = null;
                displayMult = instMult;
            }

            const label = `${displayMult.toFixed(2)}x`;

            const thetaTop = -Math.PI / 2;
            const labelX = cx + rx * Math.cos(thetaTop);
            const labelY = centerY + ry * Math.sin(thetaTop) - 4;

            ctx.lineWidth = 3;
            ctx.strokeStyle = col;
            ctx.strokeText(label, labelX, labelY);

            ctx.fillStyle = "#000000";
            ctx.fillText(label, labelX, labelY);
        }
    }

    // Upgrade buttons in four corners around the circle (and tooltip)
    this.drawUpgradeButtons(ctx, cx, cySphere, sphereRadius);

    // ===========================
    // WIN ANIMATION OVERLAY
    // ===========================
    if (this.winState && this.winState.active) {
        const tWin = this.winState.timer;
        const D = this.winState.duration;

        const alphaIn = Math.min(1, tWin * 2.4);
        const alphaOut = Math.max(0, 1 - (tWin - 1.0) / 2.2);
        const alpha = Math.min(alphaIn, alphaOut);

        // Brightness wash
        ctx.fillStyle = "rgba(255,255,255," + (0.28 * alpha) + ")";
        ctx.fillRect(0, 0, w, h);

        // Expanding pulse rings
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

        // Final message
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
