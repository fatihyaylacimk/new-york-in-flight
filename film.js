(() => {
  "use strict";

  const LENGTH = 28;
  const BALLOON_IMPACT = .68;
  const BOARD_IMPACT = .62;
  const shots = [
    {
      id: "launch", label: "Atış", start: 0, jump: 0, place: "Manhattan, 1936",
      title: "Atış", description: "Dart avuçtan çıkıp caddeye süzülüyor.",
      focus: [.59, .48], portrait: .681, zoom: [1, 1.23], pan: -.022
    },
    {
      id: "avenue", label: "Cadde", start: .177, jump: .235, place: "Manhattan Bulvarı",
      title: "Cadde boyunca", description: "Dart, taksilerle ıslak rayların arasından geçiyor.",
      focus: [.596, .535], zoom: [1.015, 1.29], pan: .032
    },
    {
      id: "market", label: "Pazar", start: .35, jump: .408, place: "Sokak pazarı",
      title: "Kırmızı balon", description: "Çiçek tezgâhının önünde bir balon okun yoluna çıkıyor.",
      focus: [.547, .48], zoom: [1, 1.21], pan: -.03
    },
    {
      id: "tram", label: "Tramvay", start: .528, jump: .587, place: "Tramvay hattı",
      title: "Açık kapı", description: "Dart, tramvayın koridorunu boydan boya geçiyor.",
      focus: [.512, .46], zoom: [1, 1.39], pan: -.014
    },
    {
      id: "alley", label: "Ara sokak", start: .707, jump: .763, place: "Ara sokak",
      title: "Son viraj", description: "Dart, buharın içinden atölyenin ışığına yöneliyor.",
      focus: [.571, .49], zoom: [1.01, 1.38], pan: .02
    },
    {
      id: "target", label: "Hedef", start: .867, jump: .955, place: "Atölye",
      title: "Hedef tahtası", description: "Dart, tahtanın kırmızı merkezine yaklaşıyor.",
      focus: [.629, .494], zoom: [1.01, 1.105], anchor: .63, pan: .008
    }
  ];

  const byId = (id) => document.getElementById(id);
  const root = document.documentElement;
  const flight = byId("flight");
  const stage = byId("stage");
  const screen = byId("screen");
  const context = screen.getContext("2d", { alpha: false });
  if (!context) return;

  const cover = byId("cover");
  const intro = byId("intro");
  const caption = byId("caption");
  const place = byId("scene-place");
  const title = byId("scene-title");
  const description = byId("scene-description");
  const restart = byId("restart");
  const status = byId("load-status");
  const rail = byId("rail-fill");
  const seek = byId("seek");
  const time = byId("time");
  const playback = byId("playback");
  const playbackLabel = byId("playback-label");
  const chapters = Array.from(document.querySelectorAll("[data-scene]"));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const unit = (value) => clamp(value, 0, 1);
  const mix = (start, end, amount) => start + (end - start) * amount;
  function ease(start, end, value) {
    const amount = unit((value - start) / (end - start));
    return amount * amount * (3 - 2 * amount);
  }

  let width = 1;
  let height = 1;
  let distance = 1;
  let viewProgress = 0;
  let playbackOrigin = 0;
  let playbackStartedAt = 0;
  let playing = false;
  let frameRequest = 0;
  let previousFrame = 0;
  let lastChapter = -1;
  let lastCue = "";
  let lastTime = "";
  let loadMessage = "";

  const plates = shots.map((shot, index) => {
    if (!index) return cover;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = index === 1 ? "auto" : "low";
    image.src = "assets/scenes/" + shot.id + ".webp";
    return image;
  });
  for (const plate of plates) {
    plate.addEventListener("load", queueFrame);
    plate.addEventListener("error", queueFrame);
  }

  function measuredProgress() {
    return unit(window.scrollY / distance);
  }

  function scrollToProgress(progress, behavior) {
    window.scrollTo({ top: unit(progress) * distance, behavior });
  }

  function resize() {
    const previousProgress = measuredProgress();
    width = stage.clientWidth;
    height = stage.clientHeight;
    distance = Math.max(1, flight.offsetHeight - stage.offsetHeight);
    const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3_200_000 / (width * height)));
    screen.width = Math.round(width * density);
    screen.height = Math.round(height * density);
    context.setTransform(screen.width / width, 0, 0, screen.height / height, 0, 0);
    context.imageSmoothingQuality = "high";
    if (previousProgress > 0) scrollToProgress(previousProgress, "instant");
    viewProgress = measuredProgress();
    queueFrame();
  }

  function getShot(progress) {
    let index = shots.length - 1;
    while (index > 0 && shots[index].start > progress) index--;
    const shot = shots[index];
    const end = shots[index + 1]?.start ?? 1;
    return { index, shot, within: unit((progress - shot.start) / (end - shot.start)) };
  }

  function framing(shot, image, within) {
    const portrait = width / height < .83;
    const zoom = mix(...shot.zoom, within);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    const focusX = portrait ? (shot.portrait ?? shot.focus[0]) : shot.focus[0];
    const anchorX = portrait ? .5 : (shot.anchor ?? .55);
    const drift = width * shot.pan * within;
    return {
      x: clamp(width * anchorX - w * focusX + drift, width - w, 0),
      y: clamp(height * .485 - h * shot.focus[1], height - h, 0),
      w, h
    };
  }

  function paintPlate(index, within, opacity) {
    const image = plates[index];
    if (!image.naturalWidth) return null;
    const rect = framing(shots[index], image, within);
    context.globalAlpha = opacity;
    context.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    context.globalAlpha = 1;
    return rect;
  }

  function point(x, y) {
    return { x: x * width, y: y * height };
  }

  function project(rect, x, y) {
    return { x: rect.x + x * rect.w, y: rect.y + y * rect.h };
  }

  function curve(path, fraction) {
    const t = unit(fraction);
    const s = 1 - t;
    const weights = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
    return path.reduce((p, v, i) => ({
      x: p.x + v.x * weights[i],
      y: p.y + v.y * weights[i]
    }), { x: 0, y: 0 });
  }

  function polygon(points, color) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) context.lineTo(x, y);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function dart(tip, angle, size, opacity) {
    context.save();
    context.globalAlpha = opacity;
    context.translate(tip.x, tip.y);
    context.rotate(angle);
    context.scale(size / 120, size / 120);
    context.shadowColor = "#180b06a0";
    context.shadowBlur = 7;
    context.shadowOffsetY = 3;

    const metal = context.createLinearGradient(0, -5, 0, 4);
    metal.addColorStop(0, "#6c5040");
    metal.addColorStop(.4, "#f9d4a1");
    metal.addColorStop(.58, "#fff1d8");
    metal.addColorStop(1, "#5d4338");

    polygon([[-62, -4], [-21, -3], [0, 0], [-21, 3], [-62, 4]], metal);
    context.shadowBlur = 0;
    polygon([[-110, -2], [-117, -18], [-96, -13], [-72, 0], [-116, 15]], "#72271e");
    polygon([[-110, -2], [-117, -18], [-96, -13], [-72, 0]], "#bd6550");
    polygon([[-114, 0], [-79, -3], [-59, -1], [-79, 3]], "#f2b980");
    context.restore();
  }

  function fly(path, fraction, startSize, endSize, opacity) {
    const t = unit(fraction);
    const head = curve(path, t);
    const before = curve(path, Math.max(0, t - .01));
    const after = curve(path, Math.min(1, t + .01));
    const length = mix(startSize, endSize, t);

    if (t > .055) {
      const trail = curve(path, t - .075);
      const shine = context.createLinearGradient(trail.x, trail.y, head.x, head.y);
      shine.addColorStop(0, "#fdd29d00");
      shine.addColorStop(1, "#fdd29d80");
      context.globalAlpha = opacity * .67;
      context.lineWidth = Math.max(1, length / 53);
      context.strokeStyle = shine;
      context.beginPath();
      context.moveTo(trail.x, trail.y);
      context.lineTo(head.x, head.y);
      context.stroke();
      context.globalAlpha = 1;
    }
    dart(head, Math.atan2(after.y - before.y, after.x - before.x), length, opacity);
  }

  function balloon(center, radius, opacity) {
    const { x, y } = center;
    context.save();
    context.globalAlpha = opacity;
    context.translate(x, y);

    context.beginPath();
    context.moveTo(1, radius);
    context.bezierCurveTo(8, radius * 1.23, -9, radius * 1.42, 3, radius * 1.72);
    context.lineWidth = 1;
    context.strokeStyle = "#efe1beaa";
    context.stroke();

    const skin = context.createRadialGradient(-radius * .38, -radius * .42, 0, 0, 0, radius * 1.22);
    skin.addColorStop(0, "#ffe0be");
    skin.addColorStop(.135, "#ee8971");
    skin.addColorStop(.42, "#bc4838");
    skin.addColorStop(.79, "#862921");
    skin.addColorStop(1, "#471e1a");

    context.beginPath();
    context.ellipse(0, 0, .81 * radius, radius, -.065, 0, 2 * Math.PI);
    context.fillStyle = skin;
    context.fill();
    polygon([[0, radius * .96], [-5, radius * 1.1], [6, radius * 1.1]], "#8d301f");
    context.restore();
  }

  function flakes(center, age, opacity, count, palette, distanceScale) {
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963;
      const speed = distanceScale * (.43 + (i % 11) * .065);
      const x = center.x + Math.cos(angle) * speed * age;
      const y = center.y + Math.sin(angle) * speed * age + 105 * age * age;
      const size = (3 + i % 7) * (1 - age * .52);
      context.save();
      context.translate(x, y);
      context.rotate(angle + age * (i % 2 ? 7 : -8));
      context.globalAlpha = opacity * (1 - age) * (.52 + (i % 5) * .1);
      polygon([[0, 0], [size * 1.6, -size * .35], [size * .32, size * .6]], palette[i % palette.length]);
      context.restore();
    }
  }

  function market(rect, within, size, opacity, still) {
    const center = project(rect, .55, .455);
    center.y += still ? 0 : Math.sin(within * 3.1) * height * .019;
    const radius = Math.min(width * .137, height * .118) * mix(.54, 1, ease(0, BALLOON_IMPACT, within));
    if (within < BALLOON_IMPACT) {
      balloon(center, radius, opacity);
      const edge = { x: center.x - radius * .36, y: center.y + radius * .08 };
      if (!still) fly(
        [point(-.07, .59), point(.13, .36), point(.33, .44), edge],
        within / BALLOON_IMPACT, size, size * .50, opacity
      );
    } else if (!still) {
      const age = unit((within - BALLOON_IMPACT) / (1 - BALLOON_IMPACT));
      const edge = { x: center.x - radius * .36, y: center.y + radius * .08 };
      flakes(center, age, opacity, 32, ["#a63225", "#df6d54", "#ed9d7e", "#7e2924"], Math.min(width, height) * .53);
      fly([edge, point(.68, .45), point(.77, .38), point(1.01, .43)], age, size * .5, size * .32, opacity);
    }
  }

  function target(rect, within, size, opacity, still) {
    const bull = project(rect, .629, .494);
    if (within < BOARD_IMPACT) {
      if (!still) fly(
        [point(1.12, .36), point(.92, .36), { x: bull.x + width * .12, y: bull.y - height * .072 }, bull],
        within / BOARD_IMPACT, size * 1.1, size * .67, opacity
      );
      return;
    }

    const age = (within - BOARD_IMPACT) / (1 - BOARD_IMPACT);
    const wobble = still ? 0 : Math.sin(age * 22) * .16 * Math.exp(-age * 8);
    dart(bull, 2.86 + wobble, size * .67, opacity);
    if (!still && age < .55) {
      flakes(bull, age / .55, opacity * .74, 17, ["#efc298", "#b98053", "#f4d2a6"], Math.min(width, height) * .23);
    }
  }

  function effects(index, rect, within, opacity, still) {
    const size = clamp(width * .10, 64, 142);
    if (index === 2) {
      market(rect, within, size, opacity, still);
      return;
    }
    if (index === 5) {
      target(rect, within, size, opacity, still);
      return;
    }
    if (still) return;

    if (index === 0 && within > .31) {
      const t = ease(.31, 1, within);
      fly(
        [point(.9, .515), point(.77, .38), point(.69, .41), point(.56, .524)],
        t, size * 1.05, size * .28, opacity * ease(.31, .38, within)
      );
    } else if (index === 1) {
      fly(
        [point(-.14, .72), point(.24, .19), point(.63, .29), project(rect, .594, .544)],
        within, size, size * .36, opacity
      );
    } else if (index === 3) {
      fly(
        [point(.91, .74), point(.81, .47), point(.59, .38), project(rect, .513, .508)],
        within, size, size * .26, opacity
      );
    } else if (index === 4) {
      const door = project(rect, .593, .512);
      fly([point(-.12, .47), point(.27, .29), point(.39, .65), door], within, size * .94, size * .23, opacity);
      flakes(point(.64, .39), .12 + within * .57, opacity * .46, 21, ["#e4b278", "#ad7544", "#edd3a4"], Math.min(width, height) * .58);
    }
  }

  function paint(beat) {
    const { index, within } = beat;
    const still = reducedMotion.matches;
    const plateTime = still ? (index === 0 ? 0 : .35) : within;
    const effectsTime = still ? (index === 5 && within >= BOARD_IMPACT ? .88 : .42) : within;
    const nextIndex = index + 1;
    const blend = !still && plates[nextIndex]?.naturalWidth ? ease(.85, 1, within) : 0;
    const usable = plates[index].naturalWidth || plates[0].naturalWidth;
    if (!usable) {
      delete stage.dataset.drawn;
      return;
    }

    const rect = paintPlate(index, plateTime, 1);
    if (!rect) paintPlate(0, .08, 1);
    if (rect) effects(index, rect, effectsTime, 1 - blend, still);
    if (blend > 0) paintPlate(nextIndex, 0, blend);
    stage.dataset.drawn = "";
  }

  function syncInterface(progress, beat) {
    const { index, shot, within } = beat;
    const introAlpha = 1 - ease(.026, .103, progress);
    const resolved = index === 5 && within >= BOARD_IMPACT;
    const showCaption = index !== 0 || progress > .106;
    const enter = index === 0 ? ease(.105, .143, progress) : ease(0, .14, within);
    const leave = index < shots.length - 1 ? 1 - ease(.89, 1, within) : 1;
    const captionAlpha = reducedMotion.matches ? Number(showCaption) : enter * leave;

    stage.style.setProperty("--intro-alpha", introAlpha);
    stage.style.setProperty("--intro-shift", (reducedMotion.matches ? 0 : -20 * (1 - introAlpha)) + "px");
    stage.style.setProperty("--caption-alpha", captionAlpha);
    stage.style.setProperty("--caption-shift", (reducedMotion.matches ? 0 : 11 * (1 - captionAlpha)) + "px");
    intro.hidden = introAlpha < .005;
    intro.inert = introAlpha < .33;
    caption.hidden = !showCaption;
    restart.hidden = !resolved;

    const cue = shot.id + (resolved ? "-impact" : "");
    if (cue !== lastCue) {
      place.textContent = shot.place;
      title.textContent = resolved ? "Tam isabet" : shot.title;
      description.textContent = resolved ? "Dart, tahtanın kırmızı merkezine ulaştı." : shot.description;
      lastCue = cue;
    }
    if (index !== lastChapter) {
      chapters[lastChapter]?.removeAttribute("aria-current");
      chapters[index].setAttribute("aria-current", "step");
      lastChapter = index;
    }

    const seconds = Math.min(LENGTH, Math.floor(progress * LENGTH + .035));
    const timestamp = "00:" + String(seconds).padStart(2, "0");
    if (timestamp !== lastTime) {
      time.textContent = timestamp;
      lastTime = timestamp;
    }
    seek.setAttribute("aria-valuetext", timestamp + ", " + shot.label);
    if (document.activeElement !== seek || !seek.matches(":active")) {
      seek.value = String(Math.round(progress * 1000));
    }
    rail.style.setProperty("--progress", progress);
    const message = plates[index].naturalWidth ? "" : (
      plates[index].complete ? "Sahne yüklenemedi. Sayfayı yenileyerek tekrar dene." : "Sahne yükleniyor…"
    );
    if (message !== loadMessage) {
      status.textContent = message;
      status.hidden = !message;
      loadMessage = message;
    }
  }

  function setPlaying(next) {
    playing = next;
    playback.toggleAttribute("data-playing", next);
    playbackLabel.textContent = next ? "Duraklat" : "Oynat";
    playback.setAttribute("aria-label", next ? "Yolculuğu duraklat" : "Yolculuğu oynat");
    if (next) queueFrame();
  }

  function startPlayback(rewind = false) {
    const current = measuredProgress();
    playbackOrigin = rewind || current > .997 ? 0 : current;
    playbackStartedAt = performance.now();
    scrollToProgress(playbackOrigin, "instant");
    viewProgress = playbackOrigin;
    previousFrame = 0;
    setPlaying(true);
  }

  function go(progress, smooth = true) {
    setPlaying(false);
    scrollToProgress(progress, smooth && !reducedMotion.matches ? "smooth" : "instant");
    queueFrame();
  }

  function queueFrame() {
    if (!frameRequest) frameRequest = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameRequest = 0;
    const delta = previousFrame ? Math.min((now - previousFrame) / 1000, .05) : 1 / 60;
    previousFrame = now;
    if (playing) {
      const progress = unit(playbackOrigin + (now - playbackStartedAt) / (1000 * LENGTH));
      scrollToProgress(progress, "instant");
      if (progress >= 1) setPlaying(false);
    }

    const targetProgress = measuredProgress();
    viewProgress = reduceLag(targetProgress, delta);
    const beat = getShot(viewProgress);
    paint(beat);
    syncInterface(viewProgress, beat);
    if (playing || Math.abs(viewProgress - targetProgress) > .00008) queueFrame();
    else previousFrame = 0;
  }

  function reduceLag(targetProgress, delta) {
    if (reducedMotion.matches || Math.abs(viewProgress - targetProgress) < .00018) return targetProgress;
    return mix(viewProgress, targetProgress, 1 - Math.exp(-delta * 23));
  }

  byId("home").addEventListener("click", () => go(0));
  byId("begin").addEventListener("click", () => {
    stage.focus({ preventScroll: true });
    go(.144);
  });
  restart.addEventListener("click", () => {
    stage.focus({ preventScroll: true });
    startPlayback(true);
  });
  playback.addEventListener("click", () => playing ? setPlaying(false) : startPlayback());
  chapters.forEach((button, index) => button.addEventListener("click", () => go(shots[index].jump)));
  seek.addEventListener("input", () => go(Number(seek.value) / 1000, false));

  window.addEventListener("scroll", queueFrame, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("wheel", () => { if (playing) setPlaying(false); }, { passive: true });
  window.addEventListener("touchstart", (event) => {
    if (playing && !event.target.closest("button")) setPlaying(false);
  }, { passive: true });
  reducedMotion.addEventListener("change", queueFrame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPlaying(false); });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.target.closest("button, input, a, [contenteditable]")) return;
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const index = getShot(measuredProgress()).index;
    const next = clamp(index + direction, 0, shots.length - 1);
    go(shots[next].jump);
  });

  root.classList.add("film-ready");
  resize();
})();
