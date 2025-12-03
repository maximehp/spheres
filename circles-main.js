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
        aboutModal.classList.add("hidden");
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



