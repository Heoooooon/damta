(function () {
  'use strict';

  // --- DOM refs ---
  var canvas = document.getElementById('boxing3dCanvas');
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

  // --- Three.js init ---
  BoxingScene.init(canvas);
  BoxingSandbag3D.init(BoxingScene.getScene());
  BoxingEffects3D.init(BoxingScene.getScene(), BoxingScene.getCamera());
  window.addEventListener('resize', BoxingScene.resize);

  // --- 주먹 글로우 (3D 씬 내 표시) ---
  var fistGlows = [];
  var glowMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  });
  for (var g = 0; g < 2; g++) {
    var glowGeo = new THREE.SphereGeometry(0.08, 16, 16);
    var glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.visible = false;
    BoxingScene.getScene().add(glowMesh);
    fistGlows.push(glowMesh);
  }

  // --- State ---
  var state = 'guide';
  var ROUND_DURATION = 30;

  var multiHandLandmarks = null;
  var roundStartTime = 0;
  var hits = 0;
  var strongHits = 0;
  var lastFrameTime = 0;
  var lastHandDetectedTime = 0;
  var noHandWarningShown = false;
  var countdownTimer = null;

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

  // --- Webcam ---
  var webcamReady = false;

  navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' }
  }).then(function (stream) {
    video.srcObject = stream;
    return video.play();
  }).then(function () {
    webcamReady = true;
    feedMediaPipe();
  }).catch(function () {
    errorDiv.textContent = '웹캠 접근이 필요합니다.\n브라우저에서 카메라 권한을 허용해주세요.';
    errorDiv.style.display = 'block';
  });

  async function feedMediaPipe() {
    if (!webcamReady) return;
    try {
      await hands.send({ image: video });
    } catch (e) { /* ignore */ }
    requestAnimationFrame(feedMediaPipe);
  }

  // --- State transitions ---
  function startCountdown() {
    state = 'countdown';
    guideModal.classList.add('hidden');
    resultModal.classList.add('hidden');
    hud.classList.add('hidden');
    noHandWarning.classList.add('hidden');
    countdownOverlay.classList.remove('hidden');

    hits = 0;
    strongHits = 0;
    noHandWarningShown = false;
    punchTrackers = [null, null];
    hitCooldowns = [
      BoxingDetection.createHitCooldown(200),
      BoxingDetection.createHitCooldown(200)
    ];
    BoxingSandbag3D.reset();
    BoxingEffects3D.reset();

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

  // --- 주먹 위치 → 3D 글로우 좌표 ---
  function updateFistGlow(index, nx, ny, visible) {
    var glow = fistGlows[index];
    if (!glow) return;
    if (!visible) {
      glow.visible = false;
      return;
    }
    glow.position.x = (nx - 0.5) * 4.0;
    glow.position.y = (1 - ny) * 3.0;
    glow.position.z = 2.0;
    glow.visible = true;
  }

  // --- Hand detection ---
  function detectHands(now) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      for (var g = 0; g < fistGlows.length; g++) {
        fistGlows[g].visible = false;
      }

      if (state === 'round' && now - lastHandDetectedTime > 5000 && !noHandWarningShown) {
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

    var hitbox = BoxingSandbag3D.getHitbox();

    for (var i = 0; i < multiHandLandmarks.length && i < 2; i++) {
      var landmarks = multiHandLandmarks[i];
      var fistState = BoxingDetection.isFist(landmarks);

      if (!fistState) {
        punchTrackers[i] = null;
        updateFistGlow(i, 0, 0, false);
        continue;
      }

      var pos = BoxingDetection.getFistPosition(landmarks);
      pos.x = 1 - pos.x; // Mirror X

      updateFistGlow(i, pos.x, pos.y, true);

      if (!punchTrackers[i]) {
        punchTrackers[i] = BoxingDetection.createPunchTracker();
      }

      var trackResult = punchTrackers[i].update(pos);

      if (state !== 'round') continue;

      var hitResult = BoxingDetection.checkHit(pos, trackResult.displacement, hitbox);

      if (hitResult.hit && hitCooldowns[i].canHit(now)) {
        hitCooldowns[i].recordHit(now);
        hits++;
        if (hitResult.power === 'strong') {
          strongHits++;
        }

        // 정규화 좌표로 emit (3D 변환은 effects 내부에서)
        BoxingEffects3D.emit(hitResult.position.x, hitResult.position.y, hitResult.power);
        BoxingSandbag3D.applyHit(hitResult.power, hitResult.position.x);
      }
    }

    // 감지되지 않은 손의 글로우 숨기기
    for (var g = multiHandLandmarks.length; g < 2; g++) {
      updateFistGlow(g, 0, 0, false);
    }
  }

  // --- Main loop ---
  function loop(timestamp) {
    requestAnimationFrame(loop);

    var dt = lastFrameTime ? timestamp - lastFrameTime : 16.667;
    lastFrameTime = timestamp;

    // 손 감지 (항상)
    detectHands(performance.now());

    // 라운드 로직
    if (state === 'round') {
      var elapsed = (performance.now() - roundStartTime) / 1000;
      var remaining = Math.max(0, ROUND_DURATION - elapsed);
      updateHUD(remaining);
      if (remaining <= 0) {
        endRound();
      }
    }

    // 3D 업데이트 + 렌더
    BoxingSandbag3D.update(dt);
    BoxingEffects3D.update(dt);
    BoxingScene.getRenderer().render(BoxingScene.getScene(), BoxingScene.getCamera());
  }

  // --- Event listeners ---
  guideStartBtn.addEventListener('click', startCountdown);
  resultRetryBtn.addEventListener('click', startCountdown);

  // --- Start ---
  requestAnimationFrame(loop);
})();
