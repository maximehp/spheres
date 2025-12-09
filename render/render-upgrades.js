// render-upgrades.js

CirclesGame.prototype.drawUpgradeButtons = function (ctx, cx, cySphere, sphereRadius) {
    const size = 120;
    const offset = sphereRadius * 1.25;

    const positions = [
        { x: cx - offset - size / 2, y: cySphere - offset - size / 2 },
        { x: cx + offset - size / 2, y: cySphere - offset - size / 2 },
        { x: cx - offset - size / 2, y: cySphere + offset - size / 2 },
        { x: cx + offset - size / 2, y: cySphere + offset - size / 2 }
    ];

    const total = this.totalUnits;

    const stageIdx = this.getActiveStageIndexSafe();
    const noUpgradesStage = this.isNoUpgradesStage();
    const noLoopUpgradeStage = this.isNoLoopUpgradeStage();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const globalLock =
        (this.runCompleteAnim && this.runCompleteAnim.active) ||
        this.completedSphereStatic;

    for (let i = 0; i < 4; i++) {
        const pos = positions[i];

        let isMax = false;

        // Stage-based locks
        let lockedByStage = false;
        if (noUpgradesStage) {
            // All upgrades disabled in stage 7
            lockedByStage = true;
        } else if (noLoopUpgradeStage && i === 1) {
            // Upgrade #2 disabled in stage 2
            lockedByStage = true;
        }

        if (i === 1) {
            const currentLevel = this.upgradeLevels[1];
            const current = this.computeLoopThresholdForLevel(currentLevel);
            const next = this.computeLoopThresholdForLevel(currentLevel + 1);

            if (current <= 8 || next === current) {
                isMax = true;
            }
        } else if (i === 3) {
            if (this.upgradeLevels[3] >= 2) {
                isMax = true;
            }
        }

        // Once the run is complete or shrinking, all upgrades show as MAX
        if (globalLock) {
            isMax = true;
        }

        if (lockedByStage) {
            isMax = true;
        }

        const cost = isMax ? 0 : this.getUpgradeCost(i);
        const affordable = !isMax && total >= cost;
        const label = this.getUpgradeLabel(i);

        this.upgradeButtons[i] = {
            x: pos.x,
            y: pos.y,
            size: size,
            disabled: isMax || lockedByStage
        };

        ctx.beginPath();
        ctx.rect(pos.x, pos.y, size, size);

        if (lockedByStage && !globalLock) {
            ctx.fillStyle = "rgba(30, 20, 20, 0.85)";
        } else if (isMax) {
            ctx.fillStyle = "rgba(60, 60, 60, 0.6)";
        } else if (affordable) {
            ctx.fillStyle = "rgba(15, 20, 40, 0.95)";
        } else {
            ctx.fillStyle = "rgba(10, 10, 20, 0.7)";
        }
        ctx.fill();

        ctx.lineWidth = affordable && !lockedByStage ? 2 : 1;
        if (lockedByStage && !globalLock) {
            ctx.strokeStyle = "rgba(200, 120, 120, 0.9)";
        } else if (isMax) {
            ctx.strokeStyle = "rgba(150,150,150,0.6)";
        } else if (affordable) {
            ctx.strokeStyle = "rgba(200, 230, 255, 0.95)";
        } else {
            ctx.strokeStyle = "rgba(120, 140, 170, 0.7)";
        }
        ctx.stroke();

        ctx.font = "18px 'Blockletter'";
        ctx.fillStyle = isMax ? "#b0b0b0" : affordable ? "#f6f6ff" : "#a0a0ba";
        const cxBtn = pos.x + size / 2;
        const cyBtn = pos.y + size / 2 - 20;
        ctx.fillText(label, cxBtn, cyBtn);

        let costText;
        if (lockedByStage && !globalLock) {
            costText = "LOCKED";
        } else {
            costText = isMax ? "MAX" : this.formatCost(cost);
        }

        ctx.font = "30px 'Blockletter'";
        ctx.fillText(costText, cxBtn, cyBtn + 40);
    }

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

    const buttonCenterX = btn.x + btn.size / 2;
    let x;

    if (buttonCenterX < centerX) {
        x = btn.x + btn.size + padding;
    } else {
        x = btn.x - boxWidth - padding;
    }

    let y = btn.y;

    if (x + boxWidth > canvasWidth - 10) {
        x = canvasWidth - 10 - boxWidth;
    }
    if (x < 10) {
        x = 10;
    }

    if (y + boxHeight > canvasHeight - 10) {
        y = canvasHeight - 10 - boxHeight;
    }
    if (y < 10) {
        y = 10;
    }

    const total = this.totalUnits;
    const cost = info.isMax ? 0 : this.getUpgradeCost(index);
    const affordable = !info.isMax && total >= cost;

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

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "18px 'Blockletter'";
    ctx.fillStyle = info.isMax ? "#f0f0f0" : "#f6f6ff";
    ctx.fillText(info.title, innerX, innerY);

    ctx.font = "14px 'Blockletter'";
    ctx.fillStyle = "#d0d0ff";
    let lineY = innerY + 26;

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

        if (rawLine === "") {
            lineY += 10;
            continue;
        }

        if (rawLine == null) {
            continue;
        }

        const colonIndex = rawLine.indexOf(":");

        if (colonIndex !== -1 && colonIndex < rawLine.length - 1) {
            const labelPart = rawLine.slice(0, colonIndex + 1);
            const valuePart = rawLine.slice(colonIndex + 1).trim();

            const maxLabelWidth = innerWidth - 60;

            const labelLines = wrapText(ctx, labelPart, maxLabelWidth);

            for (let j = 0; j < labelLines.length; j++) {
                const isLast = j === labelLines.length - 1;

                ctx.textAlign = "left";
                ctx.fillText(labelLines[j], innerX, lineY);

                if (isLast) {
                    ctx.textAlign = "right";
                    ctx.fillText(valuePart, x + boxWidth - 10, lineY);
                }

                lineY += 18;
            }

            ctx.textAlign = "left";
        } else {
            const wrappedLines = wrapText(ctx, rawLine, innerWidth);
            for (let j = 0; j < wrappedLines.length; j++) {
                ctx.textAlign = "left";
                ctx.fillText(wrappedLines[j], innerX, lineY);
                lineY += 18;
            }
        }
    }

    ctx.font = "12px 'Blockletter'";
    ctx.textAlign = "left";
    ctx.fillStyle = info.isMax ? "#c0c0c0" : "#ffd2ff";
    const hintText = info.isMax ? "MAXED" : "click to buy";
    ctx.fillText(hintText, innerX, y + boxHeight - 18);
};
