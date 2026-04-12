/* THE LIVING VINYL — main.js
   Requires: lyrics-data.js (sets window.LYRICS before this runs) */

// ── Web Audio / Visualizer ─────────────────────────────────────────
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
  dataArray  = new Uint8Array(analyser.frequencyBinCount);
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
    var offset = i * (barW + gap);
    var grad   = vizCtx.createLinearGradient(0, H - barH, 0, H);
    grad.addColorStop(0,   'rgba(255,230,140,0.95)');
    grad.addColorStop(0.4, 'rgba(232,180,80,0.75)');
    grad.addColorStop(1,   'rgba(200,130,30,0)');
    vizCtx.fillStyle = grad;
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


// ── Audio control ──────────────────────────────────────────────────
window.audioPlaying   = false;
window.userInteracted = false;
var lyricsLoopStarted = false;
var currentLyricIndex = -1;

function startAudio() {
  var audio   = document.getElementById('album-audio');
  var overlay = document.getElementById('lyrics-overlay');
  if (audio) { audio.loop = true; audio.play().catch(function(e) { console.warn(e); }); }
  window.audioPlaying = true;
  if (overlay) overlay.classList.remove('hidden');
  startVisualizer();
  if (!lyricsLoopStarted) { lyricsLoopStarted = true; requestAnimationFrame(lyricsLoop); }
}

function pauseAudio() {
  var audio   = document.getElementById('album-audio');
  var overlay = document.getElementById('lyrics-overlay');
  if (audio) audio.pause();
  window.audioPlaying = false;
  if (overlay) overlay.classList.add('hidden');
  stopVisualizer();
}


// ── Rolling lyrics ──────────────────────────────────────────────────
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

  var overlay = document.getElementById('lyrics-overlay');
  if (!overlay) return;

  var newScroller = document.createElement('div');
  newScroller.id = 'lyrics-scroller';
  newScroller.className = 'lyrics-scroller';
  newScroller.textContent = lyrics[idx].text;

  var old = document.getElementById('lyrics-scroller');
  old ? overlay.replaceChild(newScroller, old) : overlay.appendChild(newScroller);
}


// ── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var scene      = document.getElementById('main-scene');
  var marker     = document.getElementById('cover-marker');
  var loader     = document.querySelector('.arjs-loader');
  var startBtn   = document.getElementById('start-btn');
  var scanPrompt = document.getElementById('scan-prompt');

  // Tap to begin — unlocks iOS AudioContext
  startBtn.addEventListener('click', function() {
    window.userInteracted = true;
    startBtn.classList.add('hidden');
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

  // Marker events
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
