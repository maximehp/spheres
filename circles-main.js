///////////////////////////////////////////////////////
// BOOTSTRAP
///////////////////////////////////////////////////////

window.addEventListener("DOMContentLoaded", () => {
    VANTA.WAVES({
        el: "#background",
        color: 0x020315,
        shininess: 50,
        waveHeight: 25,
        waveSpeed: 0.35,
        zoom: 1.0
    });

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

    //////////////////////////////////////////////////////
    // MUSIC — SoundCloud Mini Player (hidden)
    //////////////////////////////////////////////////////

    const scPlayer = document.getElementById("scPlayer");

    // Put the URL into the iframe safely
    scPlayer.src =
        "https://w.soundcloud.com/player/?url=" +
        encodeURIComponent("https://soundcloud.com/boo-moo-shoo/my-lofi-collection-1-hour-of-aesthetic-calm-lofi-music-free-no-copyright-music") +
        "&auto_play=false&hide_related=true&show_comments=false&show_reposts=false&visual=false";

    const musicBtn = document.getElementById("musicBtn");
    let musicOn = false;

    function updateMusicButton() {
        musicBtn.textContent = musicOn ? "♫" : "♩";
    }

    // API interface to the SoundCloud iframe
    // Sends commands through postMessage()
    function scCommand(cmd) {
        scPlayer.contentWindow.postMessage(JSON.stringify(cmd), "*");
    }

    musicBtn.addEventListener("click", () => {
        if (!musicOn) {
            // Play
            scCommand({ method: "play" });
            musicOn = true;
        } else {
            // Pause
            scCommand({ method: "pause" });
            musicOn = false;
        }
        updateMusicButton();
    });

    // Set initial icon
    updateMusicButton();

    // For console
    window.circlesGame = game;
});
