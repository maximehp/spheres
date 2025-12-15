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

    function isSafariBrowser() {
        const ua = navigator.userAgent;
        return ua.includes("Safari") &&
            !ua.includes("Chrome") &&
            !ua.includes("Chromium") &&
            !ua.includes("Edg") &&
            !ua.includes("Firefox");
    }

    const autoplayMutedOnReady = isSafariBrowser(); // the one key difference
    const widget = SC.Widget(iframe);

    let widgetReady = false;
    let playing = false;

    let volume = 0;
    let lastVolume = 50;

    // If the user interacts before READY, we queue intent and replay on READY.
    let pendingVolume = null;      // number | null
    let pendingToggle = false;     // boolean
    let pendingStart = false;      // boolean

    function renderFill() {
        track.style.setProperty("--fillWidth", volume + "%");
    }

    function updateThumbIcon() {
        thumb.textContent = "♫";
        if (volume === 0) {
            thumb.classList.add("music-muted");
        } else {
            thumb.classList.remove("music-muted");
        }
    }

    function clampVolume(v) {
        return Math.max(0, Math.min(100, v));
    }

    function setVolumeUI(v) {
        volume = clampVolume(v);
        if (volume > 0) {
            lastVolume = volume;
        }
        renderFill();
        updateThumbIcon();

        if (widgetReady && playing) {
            widget.setVolume(volume);
        }
    }

    function startIfNeeded() {
        if (!widgetReady) {
            pendingStart = true;
            return;
        }
        if (playing) {
            return;
        }

        playing = true;
        widget.play();

        // When non-safari starts, do not force lastVolume.
        // Volume will be applied by whoever called startIfNeeded().
        // Safari already autoplays on READY.
    }

    function applyPending() {
        if (!widgetReady) {
            return;
        }

        if (pendingStart) {
            pendingStart = false;
            startIfNeeded();
        }

        if (pendingToggle) {
            pendingToggle = false;
            toggleMute();
            return;
        }

        if (pendingVolume !== null) {
            const v = pendingVolume;
            pendingVolume = null;
            startIfNeeded();
            setVolumeUI(v);
            if (playing) {
                widget.setVolume(v);
            }
        }
    }

    widget.bind(SC.Widget.Events.READY, () => {
        widgetReady = true;

        widget.setVolume(0);

        if (autoplayMutedOnReady) {
            // Safari behavior preserved: muted autoplay on READY
            widget.play();
            playing = true;
        } else {
            widget.pause();
            playing = false;
        }

        updateThumbIcon();
        renderFill();

        applyPending();
    });

    function getClientX(event) {
        if (event.touches && event.touches.length > 0) {
            return event.touches[0].clientX;
        }
        if (event.changedTouches && event.changedTouches.length > 0) {
            return event.changedTouches[0].clientX;
        }
        return event.clientX;
    }

    function volumeFromEvent(event) {
        const rect = track.getBoundingClientRect();
        const x = getClientX(event) - rect.left;
        const width = rect.width > 0 ? rect.width : 1;
        const pct = Math.max(0, Math.min(1, x / width));
        return Math.round(pct * 100);
    }

    function setVolumeFromInteraction(event) {
        const v = volumeFromEvent(event);

        // Always update UI immediately so the first click never feels "ignored".
        setVolumeUI(v);

        if (!widgetReady) {
            pendingStart = true;
            pendingVolume = v;
            return;
        }

        startIfNeeded();
        setVolumeUI(v);
        if (playing) {
            widget.setVolume(v);
        }
    }

    // One unified slider implementation via pointer events
    sliderElem.addEventListener("pointerdown", event => {
        if (event.target === thumb) {
            return;
        }

        setVolumeFromInteraction(event);

        const move = ev => setVolumeFromInteraction(ev);
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    });

    sliderElem.addEventListener("click", event => {
        if (event.target === thumb) {
            return;
        }
        setVolumeFromInteraction(event);
    });

    function toggleMute() {
        if (!widgetReady) {
            pendingStart = true;
            pendingToggle = true;
            return;
        }

        startIfNeeded();

        if (volume > 0) {
            setVolumeUI(0);
            if (playing) {
                widget.setVolume(0);
            }
        } else {
            const target = lastVolume > 0 ? lastVolume : 50;
            setVolumeUI(target);
            if (playing) {
                widget.setVolume(target);
            }
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
    }, { passive: false });

    // Start muted, UI consistent
    setVolumeUI(0);
});
