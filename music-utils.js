document.addEventListener("DOMContentLoaded", () => {
    const iframe = document.getElementById("scPlayer");
    const track = document.getElementById("musicTrack");
    const thumb = document.getElementById("musicThumb");
    const sliderElem = document.getElementById("musicControls");

    if (!iframe || !track || !thumb || !sliderElem) {
        return;
    }

    if (!window.SC || !SC.Widget) {
        console.warn("SoundCloud Widget API not available");
        return;
    }

    const widget = SC.Widget(iframe);

    let widgetReady = false;
    let initialized = false;
    let volume = 0;
    let lastVolume = 50;

    widget.bind(SC.Widget.Events.READY, () => {
        widgetReady = true;
        // stay muted until the first real gesture
        widget.setVolume(0);
    });

    function initMusic() {
        // Only allow starting audio once the widget is ready
        if (!widgetReady) {
            return;
        }
        if (!initialized) {
            initialized = true;
            widget.play();  // this is called directly from a user event
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
        if (widgetReady) {
            widget.setVolume(volume);
        }
        track.style.setProperty("--fillWidth", volume + "%");
        if (volume > 0) {
            lastVolume = volume;
        }
        updateThumbIcon();
    }

    function getClientXFromEvent(event) {
        if (event.touches && event.touches.length > 0) {
            return event.touches[0].clientX;
        }
        if (event.changedTouches && event.changedTouches.length > 0) {
            return event.changedTouches[0].clientX;
        }
        return event.clientX;
    }

    function handleBarInteraction(event) {
        initMusic();  // first user drag/tap starts audio

        const rect = track.getBoundingClientRect();
        const clientX = getClientXFromEvent(event);
        const x = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const newVol = Math.round(pct * 100);
        setVolume(newVol);
    }

    // Desktop: mouse drag
    sliderElem.addEventListener("mousedown", event => {
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

    // Mobile: touch drag
    sliderElem.addEventListener("touchstart", event => {
        if (event.target === thumb) {
            return;
        }

        event.preventDefault();
        handleBarInteraction(event);

        const move = ev => {
            ev.preventDefault();
            handleBarInteraction(ev);
        };

        const up = () => {
            window.removeEventListener("touchmove", move);
            window.removeEventListener("touchend", up);
        };

        window.addEventListener("touchmove", move, { passive: false });
        window.addEventListener("touchend", up);
    }, { passive: false });

    // Thumb: mute / unmute
    function toggleMute() {
        initMusic();
        if (volume > 0) {
            setVolume(0);
        } else {
            setVolume(lastVolume);
        }
    }

    thumb.addEventListener("click", event => {
        event.stopPropagation();
        toggleMute();
    });

    thumb.addEventListener("touchend", event => {
        event.stopPropagation();
        event.preventDefault();
        toggleMute();
    });

    // Start muted, UI consistent
    setVolume(0);
});
