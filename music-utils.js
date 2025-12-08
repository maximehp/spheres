document.addEventListener("DOMContentLoaded", () => {
    const iframe = document.getElementById("scPlayer");
    const track = document.getElementById("musicTrack");
    const thumb = document.getElementById("musicThumb");
    const sliderElem = document.getElementById("musicControls");

    const widget = SC.Widget(iframe);

    let initialized = false;
    let volume = 0;
    let lastVolume = 50;

    widget.setVolume(0);

    function initMusic() {
        if (!initialized) {
            initialized = true;
            widget.play();
        }
    }

    function updateThumbIcon() {
        thumb.textContent = "♫";

        if (volume === 0) {
            thumb.classList.add("music-muted");
        } else {
            thumb.classList.remove("music-muted");
        }
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(100, v));
        widget.setVolume(volume);
        track.style.setProperty("--fillWidth", volume + "%");

        if (volume > 0) {
            lastVolume = volume;
        }

        updateThumbIcon();
    }

    function handleBarInteraction(event) {
        initMusic();
        const rect = track.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const newVol = Math.round(pct * 100);
        setVolume(newVol);
    }

    // click and drag on bar
    sliderElem.addEventListener("mousedown", event => {
        // let thumb handle its own toggle click
        if (event.target === thumb) {
            return;
        }

        handleBarInteraction(event);

        const move = ev => handleBarInteraction(ev);
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };

        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    });

    // thumb toggles mute / unmute
    thumb.addEventListener("click", event => {
        event.stopPropagation();
        initMusic();

        if (volume > 0) {
            setVolume(0);
        } else {
            setVolume(lastVolume);
        }
    });

    setVolume(0);
});