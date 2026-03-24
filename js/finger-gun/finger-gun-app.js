(function () {
  'use strict';

  var canvas = document.getElementById('fingerGunCanvas');
  var video = document.getElementById('webcam');
  var errorDiv = document.getElementById('error');

  var hud = document.getElementById('hud');
  var hudTimer = document.getElementById('hudTimer');
  var hudScore = document.getElementById('hudScore');
  var hudHits = document.getElementById('hudHits');
  var hudAccuracy = document.getElementById('hudAccuracy');
  var timerFill = document.getElementById('timerFill');

  var aimReticle = document.getElementById('aimReticle');
  var noHandWarning = document.getElementById('noHandWarning');
  var countdownOverlay = document.getElementById('countdown');
  var countdownNumber = document.getElementById('countdownNumber');

  var guideModal = document.getElementById('guideModal');
  var guideStartBtn = document.getElementById('guideStart');

  var resultModal = document.getElementById('resultModal');
  var resultScore = document.getElementById('resultScore');
  var resultHits = document.getElementById('resultHits');
  var resultShots = document.getElementById('resultShots');
  var resultAccuracy = document.getElementById('resultAccuracy');
  var resultRetryBtn = document.getElementById('resultRetry');

  BoxingScene.init(canvas);
  FingerGunTarget.init(BoxingScene.getScene());
  FingerGunEffects.init(BoxingScene.getScene(), BoxingScene.getCamera());
  window.addEventListener('resize', BoxingScene.resize);

  var HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
  ];

  var handSkeletons = [];
  var jointMat = new THREE.MeshBasicMaterial({
    color: 0x7ad6ff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  var boneMat = new THREE.LineBasicMaterial({
    color: 0xb7ecff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false
  });

  for (var h = 0; h < 2; h++) {
    var skelGroup = new THREE.Group();
    skelGroup.visible = false;
    var joints = [];
    var bones = [];

    for (var j = 0; j < 21; j++) {
      var jGeo = new THREE.SphereGeometry(0.018, 8, 8);
      var jMesh = new THREE.Mesh(jGeo, jointMat);
      skelGroup.add(jMesh);
      joints.push(jMesh);
    }

    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
      var line = new THREE.Line(lineGeo, boneMat);
      skelGroup.add(line);
      bones.push(line);
    }

    BoxingScene.getScene().add(skelGroup);
    handSkeletons.push({ joints: joints, bones: bones, group: skelGroup });
  }

  var state = 'guide';
  var ROUND_DURATION = 30;

  var multiHandLandmarks = null;
  var roundStartTime = 0;
  var shots = 0;
  var hits = 0;
  var score = 0;
  var lastFrameTime = 0;
  var lastPoseDetectedTime = 0;
  var noHandWarningShown = false;
  var countdownTimer = null;

  var fireControllers = [
    FingerGunDetection.createManualFireController(220, 0.035),
    FingerGunDetection.createManualFireController(220, 0.035)
  ];
  var aimSmoothers = [
    FingerGunDetection.createVectorSmoother(0.22, 0.008),
    FingerGunDetection.createVectorSmoother(0.22, 0.008)
  ];
  var directionSmoothers = [
    FingerGunDetection.createVectorSmoother(0.18, 0.012),
    FingerGunDetection.createVectorSmoother(0.18, 0.012)
  ];

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

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getAccuracy() {
    return shots > 0 ? Math.round((hits / shots) * 100) : 0;
  }

  function updateHUD(remaining) {
    hudTimer.textContent = formatTime(remaining);
    hudScore.textContent = score;
    hudHits.textContent = hits + ' / ' + shots;
    hudAccuracy.textContent = getAccuracy() + '%';
    timerFill.style.width = ((remaining / ROUND_DURATION) * 100) + '%';
  }

  function hideReticle() {
    aimReticle.style.opacity = '0';
  }

  function updateReticle(aimPoint) {
    aimReticle.style.opacity = '1';
    aimReticle.style.left = (aimPoint.x * window.innerWidth) + 'px';
    aimReticle.style.top = (aimPoint.y * window.innerHeight) + 'px';
  }

  function getMuzzlePoint(landmarks) {
    return landmarkTo3D({
      x: (landmarks[8].x + landmarks[12].x) / 2,
      y: (landmarks[8].y + landmarks[12].y) / 2,
      z: ((landmarks[8].z || 0) + (landmarks[12].z || 0)) / 2
    });
  }

  function landmarkTo3D(lm) {
    return {
      x: (1 - lm.x - 0.5) * 4.0,
      y: (1 - lm.y) * 3.0,
      z: 1.8 - (lm.z || 0) * 1.8
    };
  }

  function updateHandSkeleton(handIndex, landmarks) {
    var skel = handSkeletons[handIndex];
    if (!skel) return;

    if (!landmarks) {
      skel.group.visible = false;
      return;
    }

    skel.group.visible = true;

    for (var j = 0; j < 21; j++) {
      var pos3d = landmarkTo3D(landmarks[j]);
      skel.joints[j].position.set(pos3d.x, pos3d.y, pos3d.z);
    }

    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var conn = HAND_CONNECTIONS[c];
      var p1 = skel.joints[conn[0]].position;
      var p2 = skel.joints[conn[1]].position;
      var posAttr = skel.bones[c].geometry.attributes.position;
      posAttr.setXYZ(0, p1.x, p1.y, p1.z);
      posAttr.setXYZ(1, p2.x, p2.y, p2.z);
      posAttr.needsUpdate = true;
    }
  }

  function startCountdown() {
    state = 'countdown';
    guideModal.classList.add('hidden');
    resultModal.classList.add('hidden');
    hud.classList.add('hidden');
    noHandWarning.classList.add('hidden');
    countdownOverlay.classList.remove('hidden');
    hideReticle();

    shots = 0;
    hits = 0;
    score = 0;
    noHandWarningShown = false;
    lastPoseDetectedTime = 0;
    fireControllers = [
      FingerGunDetection.createManualFireController(220, 0.035),
      FingerGunDetection.createManualFireController(220, 0.035)
    ];
    aimSmoothers = [
      FingerGunDetection.createVectorSmoother(0.22, 0.008),
      FingerGunDetection.createVectorSmoother(0.22, 0.008)
    ];
    directionSmoothers = [
      FingerGunDetection.createVectorSmoother(0.18, 0.012),
      FingerGunDetection.createVectorSmoother(0.18, 0.012)
    ];
    FingerGunTarget.reset();
    FingerGunEffects.reset();

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
    lastPoseDetectedTime = performance.now();
    hud.classList.remove('hidden');
    updateHUD(ROUND_DURATION);
  }

  function endRound() {
    state = 'result';
    hud.classList.add('hidden');
    noHandWarning.classList.add('hidden');
    hideReticle();

    resultScore.textContent = score;
    resultHits.textContent = hits;
    resultShots.textContent = shots;
    resultAccuracy.textContent = getAccuracy() + '%';
    resultModal.classList.remove('hidden');
  }

  function detectFingerGun(now) {
    var activePose = false;

    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      hideReticle();
      for (var hideIdx = 0; hideIdx < handSkeletons.length; hideIdx++) {
        updateHandSkeleton(hideIdx, null);
      }
      for (var resetIdx = 0; resetIdx < fireControllers.length; resetIdx++) {
        fireControllers[resetIdx].update(false, null, now);
        aimSmoothers[resetIdx].reset();
        directionSmoothers[resetIdx].reset();
      }
      if (state === 'round' && now - lastPoseDetectedTime > 2500 && !noHandWarningShown) {
        noHandWarning.classList.remove('hidden');
        noHandWarningShown = true;
      }
      return;
    }

    for (var i = 0; i < multiHandLandmarks.length && i < 2; i++) {
      var landmarks = multiHandLandmarks[i];
      updateHandSkeleton(i, landmarks);
      var poseActive = FingerGunDetection.isFingerGunPose(landmarks);

      if (!poseActive) {
        fireControllers[i].update(false, null, now);
        aimSmoothers[i].reset();
        directionSmoothers[i].reset();
        continue;
      }

      activePose = true;
      lastPoseDetectedTime = now;
      if (noHandWarningShown) {
        noHandWarning.classList.add('hidden');
        noHandWarningShown = false;
      }

      var aimPoint = FingerGunDetection.getAimPoint(landmarks);
      var barrelDirection = FingerGunDetection.getBarrelDirection(landmarks);
      var smoothedAim = aimSmoothers[i].update({
        x: 1 - aimPoint.x,
        y: aimPoint.y
      });
      var smoothedDirection = directionSmoothers[i].update({
        x: -barrelDirection.x,
        y: barrelDirection.y
      });

      if (!smoothedAim || !smoothedDirection) {
        break;
      }

      updateReticle(smoothedAim);

      if (state !== 'round') {
        fireControllers[i].update(true, smoothedDirection, now);
        break;
      }

      if (fireControllers[i].update(true, smoothedDirection, now)) {
        shots++;
        var hitResult = FingerGunTarget.checkHit(smoothedAim);
        var muzzlePoint = getMuzzlePoint(landmarks);

        if (hitResult.hit) {
          hits++;
          score += hitResult.score;
        }

        FingerGunEffects.emitShot(muzzlePoint, hitResult.scenePoint, hitResult.hit ? hitResult.tier : null);
      }

      break;
    }

    if (!activePose) {
      hideReticle();
      for (var j = 0; j < fireControllers.length; j++) {
        fireControllers[j].update(false, null, now);
        aimSmoothers[j].reset();
        directionSmoothers[j].reset();
      }
      if (state === 'round' && now - lastPoseDetectedTime > 2500 && !noHandWarningShown) {
        noHandWarning.classList.remove('hidden');
        noHandWarningShown = true;
      }
    }

    for (var k = multiHandLandmarks.length; k < handSkeletons.length; k++) {
      updateHandSkeleton(k, null);
    }
  }

  function loop(timestamp) {
    requestAnimationFrame(loop);

    var dt = lastFrameTime ? timestamp - lastFrameTime : 16.667;
    lastFrameTime = timestamp;
    var now = performance.now();

    detectFingerGun(now);

    if (state === 'round') {
      var elapsed = (now - roundStartTime) / 1000;
      var remaining = Math.max(0, ROUND_DURATION - elapsed);
      updateHUD(remaining);
      if (remaining <= 0) {
        endRound();
      }
    }

    FingerGunTarget.update(dt);
    FingerGunEffects.update(dt);
    BoxingScene.getRenderer().render(BoxingScene.getScene(), BoxingScene.getCamera());
  }

  guideStartBtn.addEventListener('click', startCountdown);
  resultRetryBtn.addEventListener('click', startCountdown);

  requestAnimationFrame(loop);
})();
