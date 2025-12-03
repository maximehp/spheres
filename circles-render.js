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
    // Bigger buttons, spaced a bit farther from the circle.
    const size = 120;
    const offset = sphereRadius * 1.25;

    const positions = [
        {
            // top left
            x: cx - offset - size / 2,
            y: cySphere - offset - size / 2
        },
        {
            // top right
            x: cx + offset - size / 2,
            y: cySphere - offset - size / 2
        },
        {
            // bottom left
            x: cx - offset - size / 2,
            y: cySphere + offset - size / 2
        },
        {
            // bottom right
            x: cx + offset - size / 2,
            y: cySphere + offset - size / 2
        }
    ];

    const total = this.totalUnits;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < 4; i++) {
        const pos = positions[i];
        const cost = this.getUpgradeCost(i);
        const affordable = total >= cost;
        const label = this.getUpgradeLabel(i);

        this.upgradeButtons[i] = {
            x: pos.x,
            y: pos.y,
            size: size
        };

        ctx.beginPath();
        ctx.rect(pos.x, pos.y, size, size);
        ctx.fillStyle = affordable
            ? "rgba(15, 20, 40, 0.95)"
            : "rgba(10, 10, 20, 0.7)";
        ctx.fill();

        ctx.lineWidth = affordable ? 2 : 1;
        ctx.strokeStyle = affordable
            ? "rgba(200, 230, 255, 0.95)"
            : "rgba(120, 140, 170, 0.7)";
        ctx.stroke();

        ctx.font = "18px 'Blockletter'";
        ctx.fillStyle = affordable ? "#f6f6ff" : "#a0a0ba";

        const cxBtn = pos.x + size / 2;
        const cyBtn = pos.y + size / 2 - 20;
        ctx.fillText(label, cxBtn, cyBtn);

        const costText = `${cost}`;
        ctx.font = "30px 'Blockletter'";
        ctx.fillText(costText, cxBtn, cyBtn + 40);
    }
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

    // ===========================
    // Top-center total number
    // ===========================
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = '32px "Blockletter"';

    const totalStr = this.totalUnits.toLocaleString();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(totalStr, cx, 8);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(totalStr, cx, 8);

    // Sphere radius; slightly larger now.
    const sphereRadius = Math.min(w, h) * 0.32;
    const cySphere = cy + 10;

    // Collect indices of rings that exist.
    const visibleIndices = [];
    for (let i = 0; i < this.rings.length; i++) {
        if (this.rings[i].exists()) {
            visibleIndices.push(i);
        }
    }

    const usedSlots = Math.min(visibleIndices.length, MAX_SLOTS);

    // Sphere opacity: 0 at zero, up to 1 when 16 slots filled
    const opacityFactor = usedSlots > 0
        ? (usedSlots / MAX_SLOTS)
        : 0.0;

    this.drawSphereBackground(ctx, cx, cySphere, sphereRadius, opacityFactor);

    // Upgrade buttons in four corners around the circle
    this.drawUpgradeButtons(ctx, cx, cySphere, sphereRadius);

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

    // Fixed 16-slot mapping:
    // slot s in [0, MAX_SLOTS-1] -> lat in [maxLat, -maxLat]
    const maxLat = Math.PI * 0.45;

    for (let slot = 0; slot < usedSlots; slot++) {
        const ringIndex = visibleIndices[slot];
        const ring = this.rings[ringIndex];

        // t = slot position in [0, MAX_SLOTS-1]
        const t = MAX_SLOTS === 1 ? 0.5 : slot / (MAX_SLOTS - 1);
        // lat: t=0 is north pole-ish, t=1 is south pole-ish
        const lat = (0.5 - t) * 2 * maxLat;

        // If latitude is beyond ±90°, that ring would be on the backside;
        // with maxLat < π/2 this should not happen, but keep the check.
        if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) {
            continue;
        }

        // Position and shape of the band
        const yOffset = Math.sin(lat) * sphereRadius;
        const k = Math.cos(lat);
        const rx = sphereRadius * Math.abs(k);
        const ry = sphereRadius * 0.55 * Math.abs(k);

        const centerY = cySphere + yOffset;
        const col = this.ringColor(ringIndex);

        // Background ellipse
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        this.drawEllipseArc(ctx, cx, centerY, rx, ry, 0, Math.PI * 2);

        // Progress arc
        const frac = Math.max(0, Math.min(1, ring.progress / this.loopThreshold));
        if (frac > 0) {
            const start = -Math.PI / 2;
            const end = start + frac * Math.PI * 2;

            ctx.lineWidth = 3.2;
            ctx.strokeStyle = col;
            ctx.lineCap = "round";
            this.drawEllipseArc(ctx, cx, centerY, rx, ry, start, end);
        }

        // Multiplier label for higher rings with nonzero progress
        if (ringIndex > 0 && ring.progress > 0) {
            const term = this.multScale * (ring.progress + 1);
            const mult = Math.sqrt(Math.max(0, term));
            const label = `${mult.toFixed(2)}x`;

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

    // ===========================
    // WIN ANIMATION OVERLAY
    // ===========================
    if (this.winState && this.winState.active) {
        const t = this.winState.timer;
        const D = this.winState.duration;

        const alphaIn = Math.min(1, t * 2.4);
        const alphaOut = Math.max(0, 1 - (t - 1.0) / 2.2);
        const alpha = Math.min(alphaIn, alphaOut);

        // Brightness wash
        ctx.fillStyle = "rgba(255,255,255," + (0.28 * alpha) + ")";
        ctx.fillRect(0, 0, w, h);

        // Expanding pulse rings
        const cxMid = w / 2;
        const cyMid = h / 2 + 10;
        const baseR = Math.min(w, h) * 0.35;

        for (let i = 0; i < 6; i++) {
            const p = (t * 1.3 + i * 0.12) % 1;
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
        ctx.strokeText("You\'re pretty good at circles", w / 2, h / 2);

        ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
        ctx.fillText("You\'re pretty good at circles", w / 2, h / 2);
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
