///////////////////////////////////////////////////////
// VANTA BACKGROUND PREFERENCE
///////////////////////////////////////////////////////

const BG_MOUSE_KEY = "spheres-bg-mouse"; // if you do not already have this
let vantaEffect = null;

function getBgMouseEnabled() {
    const stored = localStorage.getItem(BG_MOUSE_KEY);
    return stored !== "off";
}

function setBgMouseEnabled(enabled) {
    localStorage.setItem(BG_MOUSE_KEY, enabled ? "on" : "off");
}

// Create or recreate Vanta with current preference
function initVanta() {
    const bgMouseEnabled = getBgMouseEnabled();

    if (vantaEffect && typeof vantaEffect.destroy === "function") {
        vantaEffect.destroy();
        vantaEffect = null;
    }

    vantaEffect = VANTA.WAVES({
        el: "#background",
        color: 0x020315,
        shininess: 50,
        waveHeight: 25,
        waveSpeed: 0.35,
        zoom: 1.0,
        mouseControls: bgMouseEnabled,
        touchControls: bgMouseEnabled,
        gyroControls: false
    });

    window.vantaEffect = vantaEffect;
}

///////////////////////////////////////////////////////
// BOOTSTRAP
///////////////////////////////////////////////////////

window.addEventListener("DOMContentLoaded", () => {
    const bgMouseEnabled = getBgMouseEnabled();

    // Initialize VANTA with current preference
    initVanta();

    // Expose globally if you want to poke it from console
    window.vantaEffect = vantaEffect;

    const canvas = document.getElementById("circlesCanvas");
    const info = document.getElementById("infoBox");
    const game = new CirclesGame(canvas, info);

    // Try loading from localStorage on start
    game.loadLocal();

    // Modal elements
    const aboutBtn = document.getElementById("aboutBtn");
    const aboutModal = document.getElementById("aboutModal");
    const resetBtn = document.getElementById("resetBtn");
    const closeBtn = document.getElementById("closeAbout");

    const stagesModal = document.getElementById("stagesModal");
    const stagesList = document.getElementById("stagesList");
    const closeStages = document.getElementById("closeStages");
    const stagesToggleBtn = document.getElementById("stagesToggleBtn");

    game.attachStagesUI(stagesModal, stagesList, closeStages, stagesToggleBtn);

    game.onRunComplete = function () {
        const angle = -Math.PI / 3;  // where this finished sphere should go
        game.startRunCompleteFlash(angle);
    };

    // Win handler: trigger the win animation
    game.onWin = function () {
        game.startWinAnimation();
    };

    aboutBtn.addEventListener("click", () => {
        aboutModal.classList.remove("hidden");
    });

    closeBtn.addEventListener("click", () => {
        aboutModal.classList.add("hidden");
    });

    resetBtn.addEventListener("click", () => {
        game.resetAll();
        game.saveLocal();
        aboutModal.classList.add("hidden");
    });

    ///////////////////////////////////////////////////////
    // IMPORT / EXPORT USING CLIPBOARD
    ///////////////////////////////////////////////////////

    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");

    const PASSWORD = "spheres-secret-1"; // same as before

    // EXPORT -> copy encrypted save to clipboard
    exportBtn.addEventListener("click", async () => {
        try {
            const state = game.serializeState();
            const encoded = await encryptState(state, PASSWORD);

            await navigator.clipboard.writeText(encoded);

            alert("Save copied to clipboard.");
        } catch (e) {
            alert("Failed to export save.");
            console.error(e);
        }
    });

    // IMPORT -> read clipboard text and decode it
    importBtn.addEventListener("click", async () => {
        try {
            const txt = await navigator.clipboard.readText();
            if (!txt.trim()) {
                alert("Clipboard is empty or contains no save data.");
                return;
            }

            const decoded = await decryptState(txt.trim(), PASSWORD);
            game.applyState(decoded);
            game.saveLocal();

            alert("Save imported successfully.");
        } catch (e) {
            alert("Clipboard does not contain valid save data.");
            console.error(e);
        }
    });

    ///////////////////////////////////////////////////////
    // BACKGROUND MOUSE MOVEMENT TOGGLE (ABOUT MODAL)
    ///////////////////////////////////////////////////////

    const bgMouseToggle = document.getElementById("bgMouseToggle");
    if (bgMouseToggle) {
        // sync initial UI with stored preference
        bgMouseToggle.checked = getBgMouseEnabled();

        bgMouseToggle.addEventListener("change", () => {
            const enabled = bgMouseToggle.checked;
            setBgMouseEnabled(enabled);
            initVanta();   // destroy old effect and recreate with new mouseControls
        });
    }

    // For console
    window.circlesGame = game;
});
