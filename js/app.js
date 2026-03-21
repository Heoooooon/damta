(function () {
  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  const video = document.getElementById('webcam');
  const trackingCanvas = document.getElementById('trackingCanvas');
  const trackingCtx = trackingCanvas.getContext('2d');
  const errorEl = document.getElementById('error');
  const smokeStateMachine = InteractionCore.createSmokeStateMachine();

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  function resizeTrackingCanvas() {
    const rect = video.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (trackingCanvas.width !== width || trackingCanvas.height !== height) {
      trackingCanvas.width = width;
      trackingCanvas.height = height;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('resize', resizeTrackingCanvas);
  resizeCanvas();
  resizeTrackingCanvas();

  let lastTime = 0;

  async function mainLoop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    await HandDetector.send(video);
    await FaceDetector.send(video);

    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);
    const mouth = FaceDetector.getMouth();
    const faceH = FaceDetector.getFaceHeight();
    const faceLandmarks = FaceDetector.getLandmarks();

    const now = performance.now();
    const smokeResult = smokeStateMachine.update({
      poseActive: handState.poseActive,
      cigTip: handState.cigTip,
      mouth,
      faceHeight: faceH,
    }, now);

    if (smokeResult.emitPos && smokeResult.emission.type) {
      SmokeSystem.emit(
        smokeResult.emitPos.x,
        smokeResult.emitPos.y,
        canvas.width,
        canvas.height,
        SmokeModes.get(),
        smokeResult.emission,
        dt
      );
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    trackingCtx.clearRect(0, 0, trackingCanvas.width, trackingCanvas.height);
    SmokeSystem.update(ctx, dt, Noise.noise2D, {
      dormant: smokeResult.state === 'idle',
    });
    TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
      handLandmarks: landmarks,
      faceLandmarks,
      poseActive: handState.poseActive,
      mirrored: false,
    });
    if (handState.poseActive && handState.cigTip) {
      SmokeSystem.drawEmber(
        ctx,
        handState.cigTip.x,
        handState.cigTip.y,
        canvas.width,
        canvas.height,
        SmokeModes.get(),
        smokeResult.state,
        now
      );
    }

    const analysis = handState.analysis || HandDetector.getLastAnalysis();
    let debugGap = null;
    let debugScore = null;
    let mouthDistDebug = null;
    let thresholdDebug = null;
    if (handState.cigTip && mouth && faceH > 0) {
      mouthDistDebug = InteractionCore.dist(handState.cigTip, mouth).toFixed(3);
      if (smokeResult.thresholds) {
        thresholdDebug =
          smokeResult.thresholds.enter.toFixed(3) +
          ' -> ' +
          smokeResult.thresholds.exit.toFixed(3);
      }
    }
    if (analysis) {
      debugGap = analysis.gapRatio ? analysis.gapRatio.toFixed(3) : null;
      debugScore = analysis.score != null ? analysis.score.toFixed(3) : null;
    }
    _lastDebug = {
      landmarks: landmarks ? landmarks.length : 0,
      pose: handState.poseActive,
      poseScore: debugScore,
      state: smokeResult.state,
      emission: smokeResult.emission.type,
      particles: SmokeSystem.getActiveCount(),
      gapPalm: debugGap,
      mouthDist: mouthDistDebug,
      mouthThreshold: thresholdDebug,
      faceHeight: faceH ? faceH.toFixed(3) : null,
      fingers: landmarks ? {
        idx: landmarks[8].y < landmarks[6].y,
        mid: landmarks[12].y < landmarks[10].y,
        ring: landmarks[16].y < landmarks[14].y,
        pinky: landmarks[20].y < landmarks[18].y,
      } : null,
    };

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '14px monospace';
    ctx.fillText('Landmarks: ' + (_lastDebug.landmarks || 'NO'), 20, 30);
    ctx.fillText('Pose: ' + (_lastDebug.pose ? 'ACTIVE' : 'inactive'), 20, 50);
    ctx.fillText('State: ' + _lastDebug.state + ' / ' + (_lastDebug.emission || 'none'), 20, 70);
    ctx.fillText('Particles: ' + _lastDebug.particles, 20, 90);
    if (debugGap) {
      ctx.fillText('Gap/Palm: ' + debugGap + ' | Score: ' + debugScore, 20, 110);
      const f = _lastDebug.fingers;
      ctx.fillText('idx=' + f.idx + ' mid=' + f.mid + ' ring=' + f.ring + ' pinky=' + f.pinky, 20, 130);
    }
    if (mouthDistDebug) {
      ctx.fillText('MouthDist: ' + mouthDistDebug + ' / Threshold: ' + thresholdDebug, 20, 150);
    }
    ctx.fillText('Snapshots: ' + _snapshots.length + ' (press P)', 20, 170);

    requestAnimationFrame(mainLoop);
  }

  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      errorEl.textContent = '웹캠 접근이 필요합니다.\n브라우저에서 카메라 권한을 허용해주세요.';
      errorEl.hidden = false;
      return false;
    }
  }

  async function init() {
    // Check MediaPipe loading
    const handErr = HandDetector.getError();
    if (handErr) {
      errorEl.textContent = handErr + '\n페이지를 새로고침해주세요.';
      errorEl.hidden = false;
      return;
    }

    const faceErr = FaceDetector.getError();
    if (faceErr) {
      errorEl.textContent = faceErr + '\n페이지를 새로고침해주세요.';
      errorEl.hidden = false;
      return;
    }

    const camReady = await initWebcam();
    if (camReady) {
      requestAnimationFrame(mainLoop);
    }
  }

  // --- Debug snapshots ---
  let _lastDebug = {};
  const _snapshots = [];

  // --- Keyboard shortcuts ---
  const modeBtn = document.getElementById('modeBtn');
  modeBtn.textContent = SmokeModes.getName();

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyM') {
      e.preventDefault();
      const mode = SmokeModes.toggle();
      modeBtn.textContent = mode.name;
    } else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } else if (e.code === 'KeyP') {
      const snap = JSON.parse(JSON.stringify(_lastDebug));
      snap.time = new Date().toISOString();
      _snapshots.push(snap);
      navigator.clipboard.writeText(JSON.stringify(_snapshots, null, 2)).then(() => {
        console.log('Snapshot #' + _snapshots.length + ' copied to clipboard');
      });
    } else if (e.code === 'KeyH') {
      video.classList.toggle('hidden');
    }
  });

  modeBtn.addEventListener('click', () => {
    const mode = SmokeModes.toggle();
    modeBtn.textContent = mode.name;
  });

  init();

  // Export for other modules
  window.APP = { canvas, ctx, video };
})();
