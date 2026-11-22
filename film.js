(() => {
  "use strict";

  const cinema = document.getElementById("cinema");
  const video = document.getElementById("picture");
  const filmInterface = document.getElementById("interface");
  const seek = document.getElementById("seek");
  const play = document.getElementById("play");
  const centerPlay = document.getElementById("center-play");
  const sound = document.getElementById("sound");
  const soundLabel = document.getElementById("sound-label");
  const fullscreen = document.getElementById("fullscreen");
  const framing = document.getElementById("framing");
  const chapter = document.getElementById("chapter");
  const elapsed = document.getElementById("elapsed");
  const duration = document.getElementById("duration");
  const status = document.getElementById("status");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const chapters = [
    [0, "Atış"], [2, "Cadde"], [6.5, "Pembe balon"], [9.3, "Tramvay"],
    [13, "Ateş çemberi"], [15.8, "Taksi"], [19.3, "Çiçek pazarı"],
    [24, "Ara sokak"], [26.6, "Hedef"]
  ];

  let hideTimer;
  let bufferTimer;
  let drag;
  let resumeAfterScrub = false;
  let sliderDragging = false;

  function getDuration() {
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 29;
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds + .04));
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }

  function updateTimeline() {
    const end = getDuration();
    const current = Math.min(video.currentTime, end);
    let active = chapters[0][1];
    for (const [start, name] of chapters) {
      if (current < start) break;
      active = name;
    }
    const timestamp = formatTime(current);
    seek.max = String(end);
    seek.value = String(current);
    seek.style.setProperty("--progress", (current / end) * 100 + "%");
    seek.setAttribute("aria-valuetext", timestamp + ", " + active);
    elapsed.textContent = timestamp;
    duration.textContent = formatTime(end);
    chapter.textContent = active;
  }

  function setStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function label(button, value) {
    button.setAttribute("aria-label", value);
    button.title = value;
  }

  function showChrome() {
    cinema.setAttribute("data-chrome", "");
    clearTimeout(hideTimer);
    if (video.paused) return;
    hideTimer = setTimeout(() => {
      if (!filmInterface.matches(":focus-within")) cinema.removeAttribute("data-chrome");
    }, 1750);
  }

  function updatePlayback() {
    const running = !video.paused && !video.ended;
    cinema.toggleAttribute("data-playing", running);
    const name = running ? "Filmi duraklat" : video.ended ? "Yeniden izle" : "Filmi oynat";
    const icon = running ? "pause" : video.ended ? "replay" : "play";
    for (const button of [play, centerPlay]) {
      label(button, name);
      button.firstElementChild.className = "symbol symbol-" + icon;
    }
    showChrome();
    if (video.ended) updateTimeline();
  }

  function updateSound() {
    const audible = !video.muted && video.volume > 0;
    const name = audible ? "Sesi kapat" : "Sesi aç";
    cinema.toggleAttribute("data-audible", audible);
    soundLabel.textContent = name;
    label(sound, name);
  }

  function clearBuffering() {
    clearTimeout(bufferTimer);
    if (!video.error) setStatus("");
  }

  async function start() {
    if (video.error) video.load();
    if (video.ended) video.currentTime = 0;
    try {
      await video.play();
    } catch (error) {
      if (!["NotAllowedError", "AbortError"].includes(error.name)) {
        setStatus("Film yüklenemedi. Yeniden denemek için oynat düğmesine dokun.");
      }
      updatePlayback();
    }
  }

  function togglePlay() {
    if (video.paused || video.ended) {
      if (document.activeElement === centerPlay) centerPlay.blur();
      start();
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    showChrome();
  }

  function jump(seconds) {
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) return;
    video.currentTime = Math.max(0, Math.min(getDuration(), seconds));
    updateTimeline();
    showChrome();
  }

  async function changeFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (cinema.requestFullscreen) await cinema.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {
      showChrome();
    }
  }

  function onControlClick(button, action) {
    button.addEventListener("click", (event) => {
      if (event.detail > 0) button.blur();
      action();
    });
  }

  onControlClick(play, togglePlay);
  onControlClick(centerPlay, togglePlay);
  onControlClick(sound, toggleSound);
  onControlClick(fullscreen, changeFullscreen);
  onControlClick(framing, () => {
    const wide = cinema.toggleAttribute("data-wide");
    framing.setAttribute("aria-pressed", String(wide));
    label(framing, wide ? "Ekranı doldur" : "Tam kadrajı göster");
    showChrome();
  });
  fullscreen.hidden = !cinema.requestFullscreen && !video.webkitEnterFullscreen;
  document.addEventListener("fullscreenchange", () => {
    label(fullscreen, document.fullscreenElement ? "Tam ekrandan çık" : "Tam ekran");
  });

  seek.addEventListener("pointerdown", () => {
    sliderDragging = true;
    resumeAfterScrub = !video.paused;
    if (resumeAfterScrub) video.pause();
  });
  seek.addEventListener("input", () => jump(seek.valueAsNumber));
  function endScrub() {
    if (!sliderDragging) return;
    sliderDragging = false;
    seek.blur();
    if (resumeAfterScrub) start();
    resumeAfterScrub = false;
  }
  window.addEventListener("pointerup", endScrub);
  window.addEventListener("pointercancel", endScrub);

  video.addEventListener("focus", showChrome);
  video.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag = { y: event.clientY, start: video.currentTime, used: false };
    video.setPointerCapture(event.pointerId);
  });
  video.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") showChrome();
    if (event.pointerType === "mouse" || !drag || !event.isPrimary) return;
    const distance = drag.y - event.clientY;
    if (!drag.used && Math.abs(distance) < 13) return;
    drag.used = true;
    video.pause();
    jump(drag.start + distance * .021);
  });
  video.addEventListener("pointerup", (event) => {
    if (!drag || !event.isPrimary) return;
    if (!drag.used) {
      if (event.pointerType === "mouse" || video.paused) togglePlay();
      else if (cinema.hasAttribute("data-chrome")) cinema.removeAttribute("data-chrome");
      else showChrome();
    }
    drag = null;
  });
  video.addEventListener("pointercancel", () => { drag = null; });
  filmInterface.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") showChrome();
  });
  filmInterface.addEventListener("focusin", showChrome);
  filmInterface.addEventListener("focusout", showChrome);

  cinema.addEventListener("wheel", (event) => {
    if (event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? cinema.clientHeight : 1;
    video.pause();
    jump(video.currentTime + event.deltaY * scale * .011);
  }, { passive: false });

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.target.closest("button, input, a, textarea")) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      jump(video.currentTime + (event.key === "ArrowRight" ? 3 : -3));
    } else if (event.key.toLowerCase() === "m") toggleSound();
    else if (event.key.toLowerCase() === "f") changeFullscreen();
  });

  for (const event of ["loadedmetadata", "timeupdate", "seeked"]) {
    video.addEventListener(event, updateTimeline);
  }
  for (const event of ["play", "pause", "ended", "seeked"]) {
    video.addEventListener(event, updatePlayback);
  }
  for (const event of ["playing", "canplay", "seeked"]) {
    video.addEventListener(event, clearBuffering);
  }
  video.addEventListener("volumechange", updateSound);
  video.addEventListener("waiting", () => {
    clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => setStatus("Film yükleniyor…"), 900);
  });
  video.addEventListener("error", () => {
    clearTimeout(bufferTimer);
    setStatus("Film yüklenemedi. Yeniden denemek için oynat düğmesine dokun.");
    updatePlayback();
  });
  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) video.pause();
  });

  video.controls = false;
  filmInterface.hidden = false;
  video.muted = true;
  updateTimeline();
  updateSound();
  updatePlayback();
  if (!reduceMotion.matches && !navigator.connection?.saveData) start();
})();
