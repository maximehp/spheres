///////////////////////////////////////////////////////
// RENDER: sphere, rings, buttons, info
///////////////////////////////////////////////////////

CirclesGame.prototype.drawSphereBackground = function (ctx, cx, cy, R, opacityFactor) {
    // opacityFactor in [0,1]; scale the gradient alphas
    const o = Math.max(0, Math.min(1, opacityFactor));

    const grad = ctx.createRadialGradient(
        cx - R * 0.4, cy - R * 0.4, R * 0.2,
        cx, cy, R
    );
    grad.addColorStop(0, `rgba(255,255,255,${0.4 * o})`);
    grad.addColorStop(0.5, `rgba(80,110,180,${0.9 * o})`);
    grad.addColorStop(1, `rgba(5,10,30,${1.0 * o})`);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2 * o;
    ctx.strokeStyle = `rgba(0,0,0,${0.7 * o})`;
    ctx.stroke();
};

// Approximate an ellipse arc by sampling.
CirclesGame.prototype.drawEllipseArc = function (ctx, cx, cy, rx, ry, startAngle, endAngle) {
    const steps = 48;
    const dir = endAngle >= startAngle ? 1 : -1;
    const total = Math.abs(endAngle - startAngle);
    const step = (total / steps) * dir;

    let angle = startAngle;

    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= steps; i++) {
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);
        if (first) {
            ctx.moveTo(x, y);
            first = false;
        } else {
            ctx.lineTo(x, y);
        }
        angle += step;
    }
    ctx.stroke();
};

CirclesGame.prototype.drawUpgradeButtons = function (ctx, cx, cySphere, sphereRadius) {
    const size = 120;
    const offset = sphereRadius * 1.25;

    const positions = [
        { x: cx - offset - size / 2, y: cySphere - offset - size / 2 }, // TL
        { x: cx + offset - size / 2, y: cySphere - offset - size / 2 }, // TR
        { x: cx - offset - size / 2, y: cySphere + offset - size / 2 }, // BL
        { x: cx + offset - size / 2, y: cySphere + offset - size / 2 }  // BR
    ];

    const total = this.totalUnits;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < 4; i++) {
        const pos = positions[i];

        // special case: loop /1.3 upgrade max detection
        let isMax = false;
        if (i === 1) {
            const currentLevel = this.upgradeLevels[1];
            const current = this.computeLoopThresholdForLevel(currentLevel);
            const next = this.computeLoopThresholdForLevel(currentLevel + 1);

            // If we are already at the minimum (5) or an extra level does not
            // change the threshold, treat as maxed.
            if (current <= 5 || next === current) {
                isMax = true;
            }
        }

        const cost = isMax ? 0 : this.getUpgradeCost(i);
        const affordable = !isMax && total >= cost;
        const label = this.getUpgradeLabel(i);

        this.upgradeButtons[i] = {
            x: pos.x,
            y: pos.y,
            size: size,
            disabled: isMax
        };

        // draw button box
        ctx.beginPath();
        ctx.rect(pos.x, pos.y, size, size);
        ctx.fillStyle = isMax
            ? "rgba(60, 60, 60, 0.6)"
            : affordable
                ? "rgba(15, 20, 40, 0.95)"
                : "rgba(10, 10, 20, 0.7)";
        ctx.fill();

        ctx.lineWidth = affordable ? 2 : 1;
        ctx.strokeStyle = isMax
            ? "rgba(150,150,150,0.6)"
            : affordable
                ? "rgba(200, 230, 255, 0.95)"
                : "rgba(120, 140, 170, 0.7)";
        ctx.stroke();

        // Label
        ctx.font = "18px 'Blockletter'";
        ctx.fillStyle = isMax ? "#b0b0b0" : affordable ? "#f6f6ff" : "#a0a0ba";
        const cxBtn = pos.x + size / 2;
        const cyBtn = pos.y + size / 2 - 20;
        ctx.fillText(label, cxBtn, cyBtn);

        // Cost or MAX
        const costText = isMax ? "MAX" : this.formatCost(cost);
        ctx.font = "30px 'Blockletter'";
        ctx.fillText(costText, cxBtn, cyBtn + 40);
    }

    // Tooltip overlay for hovered upgrade (relies on handleHover + getUpgradeTooltipInfo)
    if (this.hoveredUpgradeIndex !== null && this.hoveredUpgradeIndex !== undefined) {
        this.drawUpgradeTooltip(ctx);
    }
};

CirclesGame.prototype.drawUpgradeTooltip = function (ctx) {
    const index = this.hoveredUpgradeIndex;
    if (index == null) {
        return;
    }

    const btn = this.upgradeButtons[index];
    if (!btn) {
        return;
    }

    const info = this.getUpgradeTooltipInfo(index);

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = this.canvas.width / dpr;
    const canvasHeight = this.canvas.height / dpr;
    const centerX = canvasWidth / 2;

    const padding = 12;
    const boxWidth = 280;
    const boxHeight = 140;

    // Decide side based on whether the button is left or right of the sphere center.
    const buttonCenterX = btn.x + btn.size / 2;
    let x;

    if (buttonCenterX < centerX) {
        // Button is on the left of the sphere, put tooltip to the RIGHT of the button.
        x = btn.x + btn.size + padding;
    } else {
        // Button is on the right of the sphere, put tooltip to the LEFT of the button.
        x = btn.x - boxWidth - padding;
    }

    let y = btn.y;

    // Clamp horizontally so we do not go off edges.
    if (x + boxWidth > canvasWidth - 10) {
        x = canvasWidth - 10 - boxWidth;
    }
    if (x < 10) {
        x = 10;
    }

    // Clamp vertically inside canvas
    if (y + boxHeight > canvasHeight - 10) {
        y = canvasHeight - 10 - boxHeight;
    }
    if (y < 10) {
        y = 10;
    }

    const total = this.totalUnits;
    const cost = info.isMax ? 0 : this.getUpgradeCost(index);
    const affordable = !info.isMax && total >= cost;

    // Background style similar to button
    ctx.beginPath();
    ctx.rect(x, y, boxWidth, boxHeight);
    ctx.fillStyle = info.isMax
        ? "rgba(60, 60, 60, 0.9)"
        : affordable
            ? "rgba(15, 20, 40, 0.98)"
            : "rgba(10, 10, 20, 0.9)";
    ctx.fill();

    ctx.lineWidth = affordable ? 2 : 1;
    ctx.strokeStyle = info.isMax
        ? "rgba(150,150,150,0.8)"
        : affordable
            ? "rgba(200, 230, 255, 0.98)"
            : "rgba(120, 140, 170, 0.8)";
    ctx.stroke();

    const innerX = x + 10;
    const innerY = y + 8;
    const innerWidth = boxWidth - 20;

    // Title
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "18px 'Blockletter'";
    ctx.fillStyle = info.isMax ? "#f0f0f0" : "#f6f6ff";
    ctx.fillText(info.title, innerX, innerY);

    // Description + stats
    ctx.font = "14px 'Blockletter'";
    ctx.fillStyle = "#d0d0ff";
    let lineY = innerY + 26;

    // Helper: wrap text inside given width
    function wrapText(ctx, text, maxWidth) {
        const words = text.split(" ");
        const lines = [];
        let line = "";

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testLine = line.length > 0 ? line + " " + word : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line.length > 0) {
                lines.push(line);
                line = word;
            } else {
                line = testLine;
            }
        }
        if (line.length > 0) {
            lines.push(line);
        }
        return lines;
    }

    for (let i = 0; i < info.lines.length; i++) {
        const rawLine = info.lines[i];

        // Treat empty string as a vertical spacer line
        if (rawLine === "") {
            lineY += 10;  // extra gap
            continue;
        }

        if (rawLine == null) {
            continue;
        }

        const colonIndex = rawLine.indexOf(":");

        if (colonIndex !== -1 && colonIndex < rawLine.length - 1) {
            // label: value pattern
            const labelPart = rawLine.slice(0, colonIndex + 1);
            const valuePart = rawLine.slice(colonIndex + 1).trim();

            // Leave room on the right for the value
            const maxLabelWidth = innerWidth - 60;

            const labelLines = wrapText(ctx, labelPart, maxLabelWidth);

            for (let j = 0; j < labelLines.length; j++) {
                const isLast = (j === labelLines.length - 1);

                // Draw label on the left
                ctx.textAlign = "left";
                ctx.fillText(labelLines[j], innerX, lineY);

                if (isLast) {
                    // Draw value on the right on the same baseline
                    ctx.textAlign = "right";
                    ctx.fillText(valuePart, x + boxWidth - 10, lineY);
                }

                lineY += 18;
            }

            ctx.textAlign = "left"; // reset
        } else {
            // Plain text, wrap as a normal paragraph
            const wrappedLines = wrapText(ctx, rawLine, innerWidth);
            for (let j = 0; j < wrappedLines.length; j++) {
                ctx.textAlign = "left";
                ctx.fillText(wrappedLines[j], innerX, lineY);
                lineY += 18;
            }
        }
    }

    // Small hint at bottom
    ctx.font = "12px 'Blockletter'";
    ctx.textAlign = "left";
    ctx.fillStyle = info.isMax ? "#c0c0c0" : "#ffd2ff";
    const hintText = info.isMax ? "MAXED" : "click to buy";
    ctx.fillText(hintText, innerX, y + boxHeight - 18);
};

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
