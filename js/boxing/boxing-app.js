(function () {
  'use strict';

  // --- DOM refs ---
  var canvas = document.getElementById('boxingCanvas');
  var ctx = canvas.getContext('2d');
  var video = document.getElementById('webcam');
  var errorDiv = document.getElementById('error');

  var hud = document.getElementById('hud');
  var hudTimer = document.getElementById('hudTimer');
  var hudHits = document.getElementById('hudHits');
  var hudStrong = document.getElementById('hudStrong');
  var hudHPM = document.getElementById('hudHPM');
  var timerFill = document.getElementById('timerFill');

  var noHandWarning = document.getElementById('noHandWarning');
  var countdownOverlay = document.getElementById('countdown');
  var countdownNumber = document.getElementById('countdownNumber');

  var guideModal = document.getElementById('guideModal');
  var guideStartBtn = document.getElementById('guideStart');

  var resultModal = document.getElementById('resultModal');
  var resultHits = document.getElementById('resultHits');
  var resultStrong = document.getElementById('resultStrong');
  var resultHPM = document.getElementById('resultHPM');
  var resultRetryBtn = document.getElementById('resultRetry');

  // --- Canvas sizing ---
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- State ---
  var state = 'guide'; // guide | countdown | round | result
  var ROUND_DURATION = 30; // seconds

  var multiHandLandmarks = null;
  var roundStartTime = 0;
  var hits = 0;
  var strongHits = 0;
  var lastFrameTime = 0;
  var lastHandDetectedTime = 0;
  var noHandWarningShown = false;
  var countdownTimer = null;

  // Per-hand trackers (indexed by hand index)
  var punchTrackers = [null, null];
  var hitCooldowns = [
    BoxingDetection.createHitCooldown(200),
    BoxingDetection.createHitCooldown(200)
  ];

  // --- MediaPipe Hands init ---
  var hands = new Hands({
    locateFile: function (file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file;
    }
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
  });

  hands.onResults(function (results) {
    multiHandLandmarks = results.multiHandLandmarks || null;
  });

  // --- Webcam init ---
  navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' }
  }).then(function (stream) {
    video.srcObject = stream;
  }).catch(function () {
    errorDiv.textContent = '웹캠 접근이 필요합니다';
    errorDiv.hidden = false;
  });

  // --- State transitions ---
  function startCountdown() {
    state = 'countdown';
    guideModal.classList.add('hidden');
    resultModal.classList.add('hidden');
    hud.classList.add('hidden');
    noHandWarning.classList.add('hidden');
    countdownOverlay.classList.remove('hidden');

    // Reset everything
    hits = 0;
    strongHits = 0;
    noHandWarningShown = false;
    punchTrackers = [null, null];
    hitCooldowns = [
      BoxingDetection.createHitCooldown(200),
      BoxingDetection.createHitCooldown(200)
    ];
    BoxingSandbag.reset();
    BoxingEffects.reset();

    var count = 3;
    countdownNumber.textContent = count;

    countdownTimer = setInterval(function () {
      count--;
      if (count <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownOverlay.classList.add('hidden');
        startRound();
      } else {
        countdownNumber.textContent = count;
      }
    }, 1000);
  }

  function startRound() {
    state = 'round';
    roundStartTime = performance.now();
    lastHandDetectedTime = performance.now();
    hud.classList.remove('hidden');
    updateHUD(ROUND_DURATION);
  }

  function endRound() {
    state = 'result';
    hud.classList.add('hidden');
    noHandWarning.classList.add('hidden');

    var hpm = Math.round(hits * (60 / ROUND_DURATION));
    resultHits.textContent = hits;
    resultStrong.textContent = strongHits;
    resultHPM.textContent = hpm;
    resultModal.classList.remove('hidden');
  }

  // --- HUD ---
  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateHUD(remaining) {
    hudTimer.textContent = formatTime(remaining);
    hudHits.textContent = hits;
    hudStrong.textContent = strongHits;

    var elapsed = ROUND_DURATION - remaining;
    var hpm = elapsed > 0 ? Math.round(hits * (60 / elapsed)) : 0;
    hudHPM.textContent = hpm;

    var pct = (remaining / ROUND_DURATION) * 100;
    timerFill.style.width = pct + '%';
  }

  // --- Hit processing ---
  function processHands(now) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      // No-hand warning after 5s
      if (now - lastHandDetectedTime > 5000 && !noHandWarningShown) {
        noHandWarning.classList.remove('hidden');
        noHandWarningShown = true;
      }
      return;
    }

    lastHandDetectedTime = now;
    if (noHandWarningShown) {
      noHandWarning.classList.add('hidden');
      noHandWarningShown = false;
    }

    var hitbox = BoxingSandbag.getHitbox();

    for (var i = 0; i < multiHandLandmarks.length; i++) {
      var landmarks = multiHandLandmarks[i];

      if (!BoxingDetection.isFist(landmarks)) {
        punchTrackers[i] = null;
        continue;
      }

      var pos = BoxingDetection.getFistPosition(landmarks);
      // Mirror X
      pos.x = 1 - pos.x;

      if (!punchTrackers[i]) {
        punchTrackers[i] = BoxingDetection.createPunchTracker();
      }

      var trackResult = punchTrackers[i].update(pos);
      var hitResult = BoxingDetection.checkHit(pos, trackResult.displacement, hitbox);

      if (hitResult.hit && hitCooldowns[i].canHit(now)) {
        hitCooldowns[i].recordHit(now);
        hits++;
        if (hitResult.power === 'strong') {
          strongHits++;
        }

        var canvasX = hitResult.position.x * canvas.width;
        var canvasY = hitResult.position.y * canvas.height;
        BoxingEffects.emit(canvasX, canvasY, hitResult.power);
        BoxingSandbag.applyHit(hitResult.power, hitResult.position.x);
      }
    }
  }

  // --- Main loop ---
  function loop(timestamp) {
    requestAnimationFrame(loop);

    var dt = lastFrameTime ? timestamp - lastFrameTime : 16.667;
    lastFrameTime = timestamp;

    // Feed video to MediaPipe
    if (video.readyState >= 2) {
      hands.send({ image: video });
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Round logic
    if (state === 'round') {
      var elapsed = (performance.now() - roundStartTime) / 1000;
      var remaining = Math.max(0, ROUND_DURATION - elapsed);

      processHands(performance.now());
      updateHUD(remaining);

      if (remaining <= 0) {
        endRound();
      }
    }

    // Always draw sandbag and effects (visible during countdown too)
    BoxingSandbag.update();
    BoxingSandbag.draw(ctx, canvas.width, canvas.height);
    BoxingEffects.update(ctx, dt);
  }

  // --- Event listeners ---
  guideStartBtn.addEventListener('click', startCountdown);
  resultRetryBtn.addEventListener('click', startCountdown);

  // --- Start ---
  requestAnimationFrame(loop);
})();
