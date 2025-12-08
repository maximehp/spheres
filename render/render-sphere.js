// render-sphere.js

CirclesGame.prototype.drawSphereBackground = function (ctx, cx, cy, R, opacityFactor) {
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
