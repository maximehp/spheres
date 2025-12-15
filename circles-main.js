///////////////////////////////////////////////////////
// VANTA BACKGROUND MODE (Follows Mouse / Static / None)
///////////////////////////////////////////////////////

const BG_MODE_KEY = "spheres-bg-mode";
let vantaEffect = null;

const BgMode = {
    FOLLOWS_MOUSE: "mouse",
    STATIC: "static",
    NONE: "none"
};

function getBgMode() {
    const stored = localStorage.getItem(BG_MODE_KEY);
    if (stored === BgMode.FOLLOWS_MOUSE ||
        stored === BgMode.STATIC ||
        stored === BgMode.NONE) {
        return stored;
    }
    return BgMode.STATIC;
}

function setBgMode(mode) {
    localStorage.setItem(BG_MODE_KEY, mode);
}

function modeLabel(mode) {
    if (mode === BgMode.FOLLOWS_MOUSE) {
        return "Background mode: Follows Mouse";
    }
    if (mode === BgMode.NONE) {
        return "Background mode: None";
    }
    return "Background mode: Static";
}

function destroyVanta() {
    if (vantaEffect && typeof vantaEffect.destroy === "function") {
        vantaEffect.destroy();
    }
    vantaEffect = null;
}

function applyBgVisibility(mode) {
    const bg = document.getElementById("background");
    if (!bg) {
        return;
    }

    if (mode === BgMode.NONE) {
        bg.classList.add("bg-hidden");
    } else {
        bg.classList.remove("bg-hidden");
    }
}

function initVanta() {
    const mode = getBgMode();

    destroyVanta();
    applyBgVisibility(mode);

    if (mode === BgMode.NONE) {
        return;
    }

    const mouseEnabled = mode === BgMode.FOLLOWS_MOUSE;

    vantaEffect = VANTA.WAVES({
        el: "#background",
        color: 0x020315,
        shininess: 50,
        waveHeight: 25,
        waveSpeed: 0.35,
        zoom: 1.0,
        mouseControls: mouseEnabled,
        touchControls: mouseEnabled,
        gyroControls: false
    });

    window.vantaEffect = vantaEffect;
}

function nextBgMode(mode) {
    if (mode === BgMode.FOLLOWS_MOUSE) {
        return BgMode.STATIC;
    }
    if (mode === BgMode.STATIC) {
        return BgMode.NONE;
    }
    return BgMode.FOLLOWS_MOUSE;
}

///////////////////////////////////////////////////////
// BOOTSTRAP (SINGLE ENTRY POINT)
///////////////////////////////////////////////////////

window.addEventListener("DOMContentLoaded", () => {
    initVanta();

    const canvas = document.getElementById("circlesCanvas");
    const infoBox = document.getElementById("infoBox");

    const game = new CirclesGame(canvas, infoBox);
    game.loadLocal();

    /////////////////////////////////////////////////////
    // DOM ELEMENTS
    /////////////////////////////////////////////////////

    const aboutBtn = document.getElementById("aboutBtn");
    const aboutModal = document.getElementById("aboutModal");
    const closeAbout = document.getElementById("closeAbout");
    const resetBtn = document.getElementById("resetBtn");

    const devToolsRow = document.getElementById("devToolsRow");
    const devToolsToggle = document.getElementById("devToolsToggle");
    const devHud = document.getElementById("devHud");

    const bgModeBtn = document.getElementById("bgModeBtn");

    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");

    /////////////////////////////////////////////////////
    // DEV HUD + TOGGLE
    /////////////////////////////////////////////////////

    function updateDevHud() {
        if (!devHud) {
            return;
        }

        if (game.devUnlocked && game.devToolsEnabled) {
            devHud.classList.remove("hidden");

            const scale = typeof game.speedScale === "number"
                ? game.speedScale
                : 1.0;

            let label = scale.toFixed(2);
            if (scale >= 10 || Number.isInteger(scale)) {
                label = String(scale);
            }

            devHud.textContent = "DEV SPEED x" + label;
        } else {
            devHud.classList.add("hidden");
            devHud.textContent = "";
        }
    }

    function updateDevToolsUI() {
        if (!devToolsRow || !devToolsToggle) {
            return;
        }

        if (game.devUnlocked) {
            devToolsRow.classList.remove("hidden");
            devToolsToggle.disabled = false;
            devToolsToggle.checked = !!game.devToolsEnabled;
        } else {
            devToolsRow.classList.add("hidden");
            devToolsToggle.disabled = true;
            devToolsToggle.checked = false;
        }

        updateDevHud();
    }

    if (devToolsToggle) {
        devToolsToggle.addEventListener("change", (e) => {
            e.stopPropagation();

            if (!game.devUnlocked) {
                devToolsToggle.checked = false;
                return;
            }

            game.devToolsEnabled = devToolsToggle.checked;

            if (!game.devToolsEnabled) {
                game.speedScale = 1.0;
            }

            game.saveLocal();
            updateDevToolsUI();
        });
    }

    /////////////////////////////////////////////////////
    // ABOUT MODAL
    /////////////////////////////////////////////////////

    aboutBtn.addEventListener("click", () => {
        aboutModal.classList.remove("hidden");
        updateDevToolsUI();
    });

    closeAbout.addEventListener("click", () => {
        aboutModal.classList.add("hidden");
    });

    resetBtn.addEventListener("click", () => {
        game.resetAll();
        game.saveLocal();
        aboutModal.classList.add("hidden");
        updateDevToolsUI();
    });

    /////////////////////////////////////////////////////
    // IMPORT / EXPORT
    /////////////////////////////////////////////////////

    const PASSWORD = "spheres-secret-1";

    exportBtn.addEventListener("click", async () => {
        try {
            const state = game.serializeState();
            const encoded = await encryptState(state, PASSWORD);
            await navigator.clipboard.writeText(encoded);
            alert("Save copied to clipboard.");
        } catch (e) {
            console.error(e);
            alert("Failed to export save.");
        }
    });

    importBtn.addEventListener("click", async () => {
        try {
            const txt = await navigator.clipboard.readText();
            if (!txt.trim()) {
                alert("Clipboard is empty.");
                return;
            }

            const decoded = await decryptState(txt.trim(), PASSWORD);
            game.applyState(decoded);
            game.saveLocal();
            updateDevToolsUI();

            alert("Save imported successfully.");
        } catch (e) {
            console.error(e);
            alert("Invalid save data.");
        }
    });

    /////////////////////////////////////////////////////
    // BACKGROUND MODE BUTTON
    /////////////////////////////////////////////////////

    if (bgModeBtn) {
        bgModeBtn.textContent = modeLabel(getBgMode());

        bgModeBtn.addEventListener("click", () => {
            const next = nextBgMode(getBgMode());
            setBgMode(next);
            bgModeBtn.textContent = modeLabel(next);
            initVanta();
        });
    }

    /////////////////////////////////////////////////////
    // KEEP HUD IN SYNC WITH GAME SPEED
    /////////////////////////////////////////////////////

    const originalUpdate = game.update.bind(game);
    game.update = function (dt) {
        originalUpdate(dt);
        updateDevHud();
    };

    updateDevToolsUI();

    window.circlesGame = game;
});
