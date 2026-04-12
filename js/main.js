/**
 * THE LIVING VINYL — main.js
 *
 * All A-Frame custom components and interaction logic.
 * This file must be loaded BEFORE the <a-scene> HTML is parsed,
 * so it lives in <head>, not at the bottom of <body>.
 *
 * Requires: lyrics-data.js (loaded first, sets window.LYRICS)
 */

/* ═══════════════════════════════════════════════════════════
   1. ORBIT-TEXT COMPONENT
   Animates a-text entities in a slow elliptical orbit
   around the album cover center, always facing the camera.
   ═══════════════════════════════════════════════════════════ */
AFRAME.registerComponent('orbit-text', {
  schema: {
    radius:  { type: 'number', default: 0.8 },   // orbit radius (world units = meters at 1:1)
    speed:   { type: 'number', default: 0.4 },   // radians per second
    phase:   { type: 'number', default: 0 },      // starting angle (radians) — spread entities evenly
    height:  { type: 'number', default: 0 },      // vertical offset from cover center
    bob:     { type: 'number', default: 0.04 }    // gentle vertical bob amplitude
  },

  init: function () {
    this.angle = this.data.phase;
  },

  tick: function (time, timeDelta) {
    // timeDelta is ms since last frame — convert to seconds for frame-rate independence
    var dt = timeDelta / 1000;
    this.angle += this.data.speed * dt;

    var d = this.data;
    // Elliptical orbit: full radius on X, compressed on Z for perspective readability
    var x = Math.cos(this.angle) * d.radius;
    var z = Math.sin(this.angle) * d.radius * 0.35;
    // Slow bob on Y using half the angular speed for a gentle wave
    var y = d.height + Math.sin(this.angle * 0.5) * d.bob;

    this.el.object3D.position.set(x, y, z);

    // Billboard: text always faces the camera.
    // In AR.js the camera stays at world origin; the scene is moved.
    // lookAt a point far down the +Z axis keeps the text facing forward.
    this.el.object3D.lookAt(new THREE.Vector3(
      this.el.object3D.position.x,
      this.el.object3D.position.y,
      1000
    ));
  }
});


/* ═══════════════════════════════════════════════════════════
   2. B-SIDE-TOGGLE COMPONENT
   Tap the element to flip between day and night palette.
   Affects: body class, scene background, ambient light,
            orbit text colors, and lyrics overlay glow.
   ═══════════════════════════════════════════════════════════ */
AFRAME.registerComponent('b-side-toggle', {
  init: function () {
    this.nightMode = false;
    // Use 'click' — AR.js cursor maps touch to click via raycaster
    this.el.addEventListener('click', this.onTap.bind(this));

    // Visual pulse on the tap target so user knows it's interactive
    this.el.setAttribute('animation__pulse', {
      property: 'material.opacity',
      from: 0.9,
      to: 0.3,
      dir: 'alternate',
      loop: true,
      dur: 2000,
      easing: 'easeInOutSine'
    });
  },

  onTap: function () {
    this.nightMode = !this.nightMode;
    this.applyPalette(this.nightMode);
  },

  applyPalette: function (isNight) {
    var body  = document.body;
    var scene = document.getElementById('main-scene');

    if (isNight) {
      body.classList.add('night-mode');
      scene.setAttribute('background', 'color: #07071a');

      // Ambient light — deep indigo
      var ambient = document.getElementById('ambient-light');
      if (ambient) ambient.setAttribute('light', 'color: #2a1a6e; intensity: 0.7');

      // Orbit text → purple
      document.querySelectorAll('[orbit-text]').forEach(function (el) {
        el.setAttribute('color', '#c0a0ff');
      });

      // Vinyl disc center label tint
      var disc = document.getElementById('vinyl-disc');
      if (disc) disc.setAttribute('material', 'color: #3d2060; metalness: 0.7; roughness: 0.2');

    } else {
      body.classList.remove('night-mode');
      scene.setAttribute('background', 'color: #0a0a1a');

      var ambient = document.getElementById('ambient-light');
      if (ambient) ambient.setAttribute('light', 'color: #ffffff; intensity: 1.0');

      document.querySelectorAll('[orbit-text]').forEach(function (el) {
        el.setAttribute('color', '#e8c97a');
      });

      var disc = document.getElementById('vinyl-disc');
      if (disc) disc.setAttribute('material', 'color: #ffffff; metalness: 0.6; roughness: 0.3');
    }
  }
});


/* ═══════════════════════════════════════════════════════════
   3. WAVEFORM VISUALIZER
   Uses Web Audio API AnalyserNode to read frequency data from
   the audio element every frame and draw mirrored bar charts
   on a 2D canvas overlay.

   Architecture:
     AudioContext → MediaElementSource → AnalyserNode → destination
                                              ↓
                                       getByteFrequencyData()
                                              ↓
                                        drawVisualizer()

   Key decisions:
   • createMediaElementSource() can only be called ONCE per
     audio element — we guard with vizInitialized flag.
   • AnalyserNode is created on first user interaction, not at
     load time, so the AudioContext starts in a resumed state.
   • fftSize 256 → 128 frequency bins. Enough resolution for
     visible bar movement without being CPU heavy.
   • Bars are mirrored left/right from center for visual symmetry.
   • Bar color uses a vertical gradient: bright at top (peak),
     fading to transparent at bottom (baseline). Night mode
     shifts the palette from gold to purple automatically.
   • Canvas is resized to match window on every resize event
     to stay crisp on retina displays (devicePixelRatio).
   ═══════════════════════════════════════════════════════════ */

var vizInitialized  = false;
var audioCtx        = null;
var analyser        = null;
var dataArray       = null;
var vizAnimId       = null;       // rAF id so we can cancel cleanly
var vizCanvas       = null;
var vizCtx          = null;

function initVisualizer () {
  if (vizInitialized) return;
  vizInitialized = true;

  vizCanvas = document.getElementById('visualizer');
  vizCtx    = vizCanvas.getContext('2d');

  // Size the canvas to match physical pixels (retina-aware)
  resizeVisualizer();
  window.addEventListener('resize', resizeVisualizer);

  var audio = document.getElementById('album-audio');

  // Create AudioContext — must happen after a user gesture
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Connect: audio element → analyser → speakers
  var source = audioCtx.createMediaElementSource(audio);
  analyser   = audioCtx.createAnalyser();

  analyser.fftSize             = 256;   // 128 frequency bins
  analyser.smoothingTimeConstant = 0.78; // 0=instant, 1=frozen; 0.78 feels fluid

  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  dataArray = new Uint8Array(analyser.frequencyBinCount); // 128 values, 0–255
}

function resizeVisualizer () {
  if (!vizCanvas) return;
  var dpr    = window.devicePixelRatio || 1;
  var width  = window.innerWidth;
  var height = 96; // matches CSS height
  vizCanvas.width  = width  * dpr;
  vizCanvas.height = height * dpr;
  // Scale context so drawing coords match CSS pixels (no manual dpr math later)
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startVisualizer () {
  // Resume AudioContext if suspended (can happen after tab switch on iOS)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  vizCanvas = vizCanvas || document.getElementById('visualizer');
  if (vizCanvas) {
    vizCanvas.classList.remove('hidden');
    vizCanvas.classList.add('visible');
  }

  if (!vizAnimId) {
    vizAnimId = requestAnimationFrame(drawVisualizer);
  }
}

function stopVisualizer () {
  if (vizAnimId) {
    cancelAnimationFrame(vizAnimId);
    vizAnimId = null;
  }

  // Clear canvas with a quick fade — achieved by drawing a transparent fill
  if (vizCtx && vizCanvas) {
    vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  }

  if (vizCanvas) {
    vizCanvas.classList.add('hidden');
    vizCanvas.classList.remove('visible');
  }
}

function drawVisualizer () {
  vizAnimId = requestAnimationFrame(drawVisualizer);

  if (!analyser || !vizCtx || !vizCanvas) return;

  var W = window.innerWidth;
  var H = 96; // CSS canvas height

  // Pull latest frequency data into dataArray (0–255 per bin)
  analyser.getByteFrequencyData(dataArray);

  // Clear with a semi-transparent fill → leaves a subtle motion trail
  vizCtx.clearRect(0, 0, W, H);

  var isNight   = document.body.classList.contains('night-mode');
  var binCount  = dataArray.length;          // 128

  // We only use the lower half of bins — upper half is mostly silence
  // in music and showing it wastes screen space with flat bars.
  var useBins   = Math.floor(binCount * 0.55); // ~70 bins of useful range

  // Bars are mirrored: left half mirrors right half from center.
  // Total bars drawn = useBins, spread across full width.
  var barW      = (W / useBins) * 0.72;      // bar width with small gap
  var gap       = (W / useBins) * 0.28;
  var centerX   = W / 2;

  for (var i = 0; i < useBins; i++) {
    var value   = dataArray[i];               // 0–255
    var barH    = (value / 255) * (H * 0.88); // scale to 88% of canvas height

    if (barH < 1) barH = 1;                   // always draw at least 1px so canvas isn't empty

    // X positions: mirror around center
    // Right side: center + offset
    // Left side:  center - offset (mirrored)
    var offset  = i * (barW + gap);
    var xRight  = centerX + offset;
    var xLeft   = centerX - offset - barW;

    // Vertical gradient: bright solid color at top, fades to transparent
    var grad = vizCtx.createLinearGradient(0, H - barH, 0, H);
    if (isNight) {
      // Night mode — purple/violet
      grad.addColorStop(0,   'rgba(200, 170, 255, 0.95)');
      grad.addColorStop(0.4, 'rgba(160, 100, 255, 0.75)');
      grad.addColorStop(1,   'rgba(100,  50, 200, 0.0)');
    } else {
      // Day mode — warm gold
      grad.addColorStop(0,   'rgba(255, 230, 140, 0.95)');
      grad.addColorStop(0.4, 'rgba(232, 180,  80, 0.75)');
      grad.addColorStop(1,   'rgba(200, 130,  30, 0.0)');
    }

    vizCtx.fillStyle = grad;

    // Draw right bar
    vizCtx.beginPath();
    vizCtx.roundRect
      ? vizCtx.roundRect(xRight, H - barH, barW, barH, [2, 2, 0, 0])
      : vizCtx.rect(xRight, H - barH, barW, barH);
    vizCtx.fill();

    // Draw left bar (mirror)
    vizCtx.beginPath();
    vizCtx.roundRect
      ? vizCtx.roundRect(xLeft, H - barH, barW, barH, [2, 2, 0, 0])
      : vizCtx.rect(xLeft, H - barH, barW, barH);
    vizCtx.fill();
  }

  // Subtle horizontal baseline glow line
  vizCtx.beginPath();
  vizCtx.moveTo(0, H - 1);
  vizCtx.lineTo(W, H - 1);
  vizCtx.strokeStyle = isNight
    ? 'rgba(192, 160, 255, 0.25)'
    : 'rgba(232, 201, 122, 0.25)';
  vizCtx.lineWidth   = 1;
  vizCtx.stroke();
}


/* ═══════════════════════════════════════════════════════════
   4. SCENE READY — audio, tracking events, lyrics loop
   ═══════════════════════════════════════════════════════════ */
window.audioPlaying  = false;
window.userInteracted = false;
var lyricsLoopStarted = false;
var currentLyricIndex = -1;

document.addEventListener('DOMContentLoaded', function () {

  var scene          = document.getElementById('main-scene');
  var nft            = document.getElementById('cover-nft');
  var lyricsOverlay  = document.getElementById('lyrics-overlay');
  var startBtn       = document.getElementById('start-btn');
  var scanPrompt     = document.getElementById('scan-prompt');
  var loader         = document.querySelector('.arjs-loader');

  // ── 4a. Tap-to-start (iOS AudioContext unlock + visualizer init) ──
  startBtn.addEventListener('click', function () {
    window.userInteracted = true;
    startBtn.classList.add('hidden');

    // Initialize Web Audio graph (needs a user gesture first)
    initVisualizer();

    // Unlock AudioContext on iOS using a silent 1ms oscillator.
    // This avoids accidentally starting the album track — unlike audio.play(),
    // a silent oscillator burst unlocks the context with zero audible output.
    if (audioCtx) {
      audioCtx.resume().then(function () {
        var osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.001);
      });
    }

    if (scanPrompt) scanPrompt.classList.remove('hidden');
  });

  // ── 3b. Pattern marker loaded — hide the spinner ─────────────
  // Pattern markers load instantly (tiny .patt file, no WASM parsing).
  // 'arjs-video-loaded' fires when the camera feed is live and tracking starts.
  scene.addEventListener('arjs-video-loaded', function () {
    if (loader && loader.parentNode) {
      loader.style.transition = 'opacity 0.5s';
      loader.style.opacity = '0';
      setTimeout(function () { if (loader && loader.parentNode) loader.remove(); }, 500);
    }
  });

  // Fallback: hide loader after 8 s if event never fires
  setTimeout(function () {
    if (loader && loader.parentNode) {
      loader.style.transition = 'opacity 0.5s';
      loader.style.opacity = '0';
      setTimeout(function () { if (loader && loader.parentNode) loader.remove(); }, 500);
    }
  }, 8000);

  // ── 3c. NFT tracking events ─────────────────────────────────
  nft.addEventListener('markerFound', function () {
    if (!window.userInteracted) return;
    startAudio();
    if (scanPrompt) scanPrompt.classList.add('hidden');
  });

  nft.addEventListener('markerLost', function () {
    pauseAudio();
    if (scanPrompt && window.userInteracted) scanPrompt.classList.remove('hidden');
  });

});


/* ═══════════════════════════════════════════════════════════
   5. AUDIO CONTROL
   ═══════════════════════════════════════════════════════════ */
function startAudio () {
  var audio         = document.getElementById('album-audio');
  var lyricsOverlay = document.getElementById('lyrics-overlay');
  var disc          = document.getElementById('vinyl-disc');
  var gramophone    = document.getElementById('gramophone-overlay');

  // Play directly via the HTML audio element
  if (audio) {
    audio.loop = true;
    audio.play().catch(function (e) {
      console.warn('Audio play blocked:', e);
    });
  }

  window.audioPlaying = true;

  // Spin the vinyl disc
  if (disc) disc.emit('vinyl-play');

  // Show lyrics overlay
  if (lyricsOverlay) lyricsOverlay.classList.remove('hidden');

  // Show gramophone
  if (gramophone) gramophone.classList.remove('hidden');

  // Start waveform visualizer
  startVisualizer();

  // Start the lyrics rAF loop (only once)
  if (!lyricsLoopStarted) {
    lyricsLoopStarted = true;
    requestAnimationFrame(lyricsLoop);
  }
}

function pauseAudio () {
  var audio         = document.getElementById('album-audio');
  var lyricsOverlay = document.getElementById('lyrics-overlay');
  var disc          = document.getElementById('vinyl-disc');
  var gramophone    = document.getElementById('gramophone-overlay');

  // Pause directly via the HTML audio element
  if (audio) audio.pause();

  window.audioPlaying = false;

  // Stop the vinyl spin
  if (disc) disc.emit('vinyl-pause');

  // Hide lyrics
  if (lyricsOverlay) lyricsOverlay.classList.add('hidden');

  // Hide gramophone
  if (gramophone) gramophone.classList.add('hidden');

  // Stop and clear the waveform visualizer
  stopVisualizer();
}


/* ═══════════════════════════════════════════════════════════
   5. ROLLING LYRICS LOOP
   Runs every animation frame while the experience is active.
   Reads audio.currentTime, finds the matching lyric line,
   and swaps in a new DOM node to re-trigger the CSS animation.
   ═══════════════════════════════════════════════════════════ */
function lyricsLoop () {
  requestAnimationFrame(lyricsLoop);

  if (!window.audioPlaying) return;

  var audio = document.getElementById('album-audio');
  if (!audio) return;

  var t      = audio.currentTime;
  var lyrics = window.LYRICS;
  if (!lyrics || !lyrics.length) return;

  // Find highest index whose time <= currentTime (linear scan backward)
  var idx = 0;
  for (var i = lyrics.length - 1; i >= 0; i--) {
    if (t >= lyrics[i].time) {
      idx = i;
      break;
    }
  }

  // Only update DOM when the index actually changes
  if (idx === currentLyricIndex) return;
  currentLyricIndex = idx;

  var line = lyrics[idx].text;
  var overlay = document.getElementById('lyrics-overlay');
  if (!overlay) return;

  // Remove the old scroller and insert a fresh one.
  // Replacing the node (rather than setting textContent) forces the browser
  // to restart the CSS @keyframes animation on the new element.
  var oldScroller = document.getElementById('lyrics-scroller');
  var newScroller = document.createElement('div');
  newScroller.id = 'lyrics-scroller';
  newScroller.className = 'lyrics-scroller';
  newScroller.textContent = line;

  if (oldScroller) {
    overlay.replaceChild(newScroller, oldScroller);
  } else {
    overlay.appendChild(newScroller);
  }
}
