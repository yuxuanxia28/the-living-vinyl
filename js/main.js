/* THE LIVING VINYL — main.js
   Requires: lyrics-data.js (sets window.LYRICS) */

// ─────────────────────────────────────────────────────────────────────
// PARTICLE SYSTEM
// Uses THREE (already loaded by A-Frame) on a dedicated fullscreen canvas.
// Two layers in one scene:
//   1. Snowflakes  — always drifting, white/silver, behind lyrics
//   2. Lyric particles — golden, form text shapes when music plays
// ─────────────────────────────────────────────────────────────────────

var LYRIC_PARTICLES = 4000;
var SNOW_PARTICLES  = 280;

var pRenderer, pScene, pCamera;
var lyricGeo, lyricPositions, lyricTargets;
var snowGeo, snowPositions, snowSpeeds;
var particleReady = false;

// Build a soft radial gradient sprite on a tiny canvas → Three texture
function makeSprite(innerColor, outerColor, size) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var r   = size / 2;
  var g   = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0,   innerColor);
  g.addColorStop(0.35, outerColor.replace('0)', '0.6)'));
  g.addColorStop(1,   outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function initParticleSystem() {
  if (particleReady) return;
  particleReady = true;

  var W = window.innerWidth;
  var H = window.innerHeight;

  // --- Renderer ---
  var canvas  = document.getElementById('particle-canvas');
  pRenderer   = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, powerPreference: 'low-power' });
  pRenderer.setSize(W, H);
  pRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Orthographic camera mapped 1:1 to screen pixels (origin = center)
  pScene  = new THREE.Scene();
  pCamera = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, 0.1, 100);
  pCamera.position.z = 10;

  // --- Lyric particles (golden, additive blend for glow) ---
  lyricPositions = new Float32Array(LYRIC_PARTICLES * 3);
  lyricTargets   = new Float32Array(LYRIC_PARTICLES * 3);
  for (var i = 0; i < LYRIC_PARTICLES; i++) {
    lyricPositions[i*3]   = (Math.random() - 0.5) * W * 2;
    lyricPositions[i*3+1] = (Math.random() - 0.5) * H * 2;
    lyricPositions[i*3+2] = 0;
    lyricTargets[i*3]   = lyricPositions[i*3];
    lyricTargets[i*3+1] = lyricPositions[i*3+1];
    lyricTargets[i*3+2] = 0;
  }
  lyricGeo = new THREE.BufferGeometry();
  lyricGeo.setAttribute('position', new THREE.BufferAttribute(lyricPositions, 3));

  pScene.add(new THREE.Points(lyricGeo, new THREE.PointsMaterial({
    size: 3,
    map: makeSprite('rgba(255,240,120,1)', 'rgba(255,160,0,0)', 64),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  })));

  // --- Snowflakes (white, normal blend, z = -1 so behind lyrics) ---
  snowPositions = new Float32Array(SNOW_PARTICLES * 3);
  snowSpeeds    = new Float32Array(SNOW_PARTICLES);
  for (var j = 0; j < SNOW_PARTICLES; j++) {
    snowPositions[j*3]   = (Math.random() - 0.5) * W * 1.4;
    snowPositions[j*3+1] = (Math.random() - 0.5) * H;
    snowPositions[j*3+2] = -1;
    snowSpeeds[j]        = 0.4 + Math.random() * 0.9;
  }
  snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));

  pScene.add(new THREE.Points(snowGeo, new THREE.PointsMaterial({
    size: 3.5,
    map: makeSprite('rgba(210,235,255,0.9)', 'rgba(180,220,255,0)', 32),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    opacity: 0.7
  })));

  window.addEventListener('resize', onParticleResize);
  requestAnimationFrame(tickParticles);
}

function onParticleResize() {
  var W = window.innerWidth, H = window.innerHeight;
  pRenderer.setSize(W, H);
  pCamera.left   = -W/2; pCamera.right  =  W/2;
  pCamera.top    =  H/2; pCamera.bottom = -H/2;
  pCamera.updateProjectionMatrix();
}

function tickParticles() {
  requestAnimationFrame(tickParticles);
  var W = window.innerWidth, H = window.innerHeight;
  var t = Date.now() * 0.001;

  // Lerp lyric particles toward their targets (spring feel)
  for (var i = 0; i < LYRIC_PARTICLES; i++) {
    lyricPositions[i*3]   += (lyricTargets[i*3]   - lyricPositions[i*3])   * 0.07;
    lyricPositions[i*3+1] += (lyricTargets[i*3+1] - lyricPositions[i*3+1]) * 0.07;
  }
  lyricGeo.attributes.position.needsUpdate = true;

  // Drift snowflakes down with a gentle horizontal sway
  for (var j = 0; j < SNOW_PARTICLES; j++) {
    snowPositions[j*3]   += Math.sin(t * 0.6 + j * 0.7) * 0.35;
    snowPositions[j*3+1] -= snowSpeeds[j];
    if (snowPositions[j*3+1] < -H/2 - 20) {
      snowPositions[j*3+1] = H/2 + 20;
      snowPositions[j*3]   = (Math.random() - 0.5) * W * 1.4;
    }
  }
  snowGeo.attributes.position.needsUpdate = true;

  pRenderer.render(pScene, pCamera);
}

// Rasterise text onto an offscreen 2D canvas, collect lit pixel coords
function sampleTextPositions(text) {
  var W = window.innerWidth, H = window.innerHeight;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var ctx = c.getContext('2d');

  // Responsive font size + simple word-wrap
  var fontSize = Math.min(68, Math.max(28, Math.floor(W / Math.max(text.length * 0.55, 5))));
  ctx.font      = 'bold ' + fontSize + 'px Georgia, serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var maxLineW = W * 0.82;
  var words = text.split(' ');
  var lines = [], line = '';
  words.forEach(function(w) {
    var test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxLineW && line) {
      lines.push(line); line = w;
    } else { line = test; }
  });
  if (line) lines.push(line);

  var lineH  = fontSize * 1.45;
  var startY = H / 2 - (lines.length - 1) * lineH / 2;
  lines.forEach(function(l, i) { ctx.fillText(l, W / 2, startY + i * lineH); });

  // Collect every lit pixel (step 2 for performance)
  var data = ctx.getImageData(0, 0, W, H).data;
  var pts  = [];
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 100) {
        pts.push(x - W / 2, H / 2 - y);
      }
    }
  }
  return pts; // flat [x0,y0, x1,y1, ...]
}

// Assign new target positions to all lyric particles based on text shape
function setLyricTarget(text) {
  if (!particleReady) return;
  var W = window.innerWidth, H = window.innerHeight;

  if (!text) {
    // Scatter outward to the edges
    for (var i = 0; i < LYRIC_PARTICLES; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = 0.4 + Math.random() * 0.6;
      lyricTargets[i*3]   = Math.cos(a) * W * d;
      lyricTargets[i*3+1] = Math.sin(a) * H * d;
      lyricTargets[i*3+2] = 0;
    }
    return;
  }

  var pts     = sampleTextPositions(text);
  var ptCount = pts.length / 2;
  if (ptCount === 0) return;

  for (var i = 0; i < LYRIC_PARTICLES; i++) {
    var base = Math.floor(Math.random() * ptCount) * 2;
    lyricTargets[i*3]   = pts[base]     + (Math.random() - 0.5) * 2.5;
    lyricTargets[i*3+1] = pts[base + 1] + (Math.random() - 0.5) * 2.5;
    lyricTargets[i*3+2] = 0;
  }
}


// ─────────────────────────────────────────────────────────────────────
// WEB AUDIO VISUALIZER
// ─────────────────────────────────────────────────────────────────────

var vizInitialized = false, audioCtx = null, analyser = null;
var dataArray = null, vizAnimId = null, vizCanvas = null, vizCtx = null;

function initVisualizer() {
  if (vizInitialized) return;
  vizInitialized = true;

  vizCanvas = document.getElementById('visualizer');
  vizCtx    = vizCanvas.getContext('2d');
  resizeVisualizer();
  window.addEventListener('resize', resizeVisualizer);

  var audio  = document.getElementById('album-audio');
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  var source = audioCtx.createMediaElementSource(audio);
  analyser   = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function resizeVisualizer() {
  if (!vizCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  vizCanvas.width  = window.innerWidth * dpr;
  vizCanvas.height = 96 * dpr;
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startVisualizer() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  vizCanvas = vizCanvas || document.getElementById('visualizer');
  if (vizCanvas) { vizCanvas.classList.remove('hidden'); vizCanvas.classList.add('visible'); }
  if (!vizAnimId) vizAnimId = requestAnimationFrame(drawVisualizer);
}

function stopVisualizer() {
  if (vizAnimId) { cancelAnimationFrame(vizAnimId); vizAnimId = null; }
  if (vizCtx && vizCanvas) vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  if (vizCanvas) { vizCanvas.classList.add('hidden'); vizCanvas.classList.remove('visible'); }
}

function drawVisualizer() {
  vizAnimId = requestAnimationFrame(drawVisualizer);
  if (!analyser || !vizCtx || !vizCanvas) return;
  var W = window.innerWidth, H = 96;
  analyser.getByteFrequencyData(dataArray);
  vizCtx.clearRect(0, 0, W, H);

  var useBins = Math.floor(dataArray.length * 0.55);
  var barW    = (W / useBins) * 0.72;
  var gap     = (W / useBins) * 0.28;
  var centerX = W / 2;

  for (var i = 0; i < useBins; i++) {
    var barH = Math.max(1, (dataArray[i] / 255) * H * 0.88);
    var grad = vizCtx.createLinearGradient(0, H - barH, 0, H);
    grad.addColorStop(0,   'rgba(255,230,140,0.95)');
    grad.addColorStop(0.4, 'rgba(232,180,80,0.75)');
    grad.addColorStop(1,   'rgba(200,130,30,0)');
    vizCtx.fillStyle = grad;
    var offset = i * (barW + gap);
    [centerX + offset, centerX - offset - barW].forEach(function(x) {
      vizCtx.beginPath();
      vizCtx.roundRect
        ? vizCtx.roundRect(x, H - barH, barW, barH, [2,2,0,0])
        : vizCtx.rect(x, H - barH, barW, barH);
      vizCtx.fill();
    });
  }
  vizCtx.beginPath();
  vizCtx.moveTo(0, H - 1); vizCtx.lineTo(W, H - 1);
  vizCtx.strokeStyle = 'rgba(232,201,122,0.25)';
  vizCtx.lineWidth = 1; vizCtx.stroke();
}


// ─────────────────────────────────────────────────────────────────────
// AUDIO CONTROL
// ─────────────────────────────────────────────────────────────────────

window.audioPlaying   = false;
window.userInteracted = false;
var lyricsLoopStarted = false;
var currentLyricIndex = -1;

function startAudio() {
  var audio = document.getElementById('album-audio');
  if (audio) { audio.loop = true; audio.play().catch(function(e) { console.warn(e); }); }
  window.audioPlaying = true;
  startVisualizer();
  if (!lyricsLoopStarted) { lyricsLoopStarted = true; requestAnimationFrame(lyricsLoop); }
}

function pauseAudio() {
  var audio = document.getElementById('album-audio');
  if (audio) audio.pause();
  window.audioPlaying = false;
  setLyricTarget('');   // scatter particles
  stopVisualizer();
}


// ─────────────────────────────────────────────────────────────────────
// LYRICS LOOP — reads audio.currentTime, drives particle targets
// ─────────────────────────────────────────────────────────────────────

function lyricsLoop() {
  requestAnimationFrame(lyricsLoop);
  if (!window.audioPlaying) return;

  var audio  = document.getElementById('album-audio');
  var lyrics = window.LYRICS;
  if (!audio || !lyrics) return;

  var t = audio.currentTime, idx = 0;
  for (var i = lyrics.length - 1; i >= 0; i--) {
    if (t >= lyrics[i].time) { idx = i; break; }
  }
  if (idx === currentLyricIndex) return;
  currentLyricIndex = idx;

  setLyricTarget(lyrics[idx].text);
}


// ─────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  var scene      = document.getElementById('main-scene');
  var marker     = document.getElementById('cover-marker');
  var loader     = document.querySelector('.arjs-loader');
  var startBtn   = document.getElementById('start-btn');
  var scanPrompt = document.getElementById('scan-prompt');

  // Start snowflakes immediately (no user gesture needed for Three.js canvas)
  initParticleSystem();

  // Tap to Begin — unlocks iOS AudioContext, inits Web Audio graph,
  // and starts buffering the MP3 immediately so it's ready by marker scan.
  startBtn.addEventListener('click', function() {
    window.userInteracted = true;
    startBtn.classList.add('hidden');

    // Start downloading the audio file now, in the background
    var audio = document.getElementById('album-audio');
    if (audio) audio.load();

    initVisualizer();
    if (audioCtx) {
      audioCtx.resume().then(function() {
        var osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.001);
      });
    }
    if (scanPrompt) scanPrompt.classList.remove('hidden');
  });

  // Hide loader when camera is live
  function hideLoader() {
    if (!loader || !loader.parentNode) return;
    loader.style.transition = 'opacity 0.5s';
    loader.style.opacity = '0';
    setTimeout(function() { if (loader && loader.parentNode) loader.remove(); }, 500);
  }
  scene.addEventListener('arjs-video-loaded', hideLoader);
  setTimeout(hideLoader, 8000);

  // Marker tracking
  marker.addEventListener('markerFound', function() {
    if (!window.userInteracted) return;
    startAudio();
    if (scanPrompt) scanPrompt.classList.add('hidden');
  });

  marker.addEventListener('markerLost', function() {
    pauseAudio();
    if (scanPrompt && window.userInteracted) scanPrompt.classList.remove('hidden');
  });
});
