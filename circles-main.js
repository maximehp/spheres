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

    window.circlesGame = game;
});
