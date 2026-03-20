(function () {
  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  const video = document.getElementById('webcam');
  const errorEl = document.getElementById('error');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // --- Smoke State Machine ---
  const NEAR_MOUTH_RATIO = 0.35;
  const EXHALE_MIN_MOVE = 0.15;
  const INHALE_MIN_DURATION = 300; // ms

  let smokeState = 'idle'; // idle | fingertip | inhaling | exhaling
  let inhaleStartTime = 0;
  let lastMouthDist = Infinity;
  let exhaleTriggered = false;

  function updateSmokeState(handState, mouth, faceH, now) {
    if (!handState.poseActive || !handState.cigTip) {
      smokeState = 'idle';
      inhaleStartTime = 0;
      exhaleTriggered = false;
      return { state: 'idle', emitPos: null, isExhale: false };
    }

    if (!mouth || faceH === 0) {
      smokeState = 'fingertip';
      exhaleTriggered = false;
      return { state: 'fingertip', emitPos: handState.cigTip, isExhale: false };
    }

    const tipToMouth = Math.hypot(
      handState.cigTip.x - mouth.x,
      handState.cigTip.y - mouth.y
    );
    const nearMouth = tipToMouth < NEAR_MOUTH_RATIO * faceH;

    if (nearMouth) {
      if (smokeState !== 'inhaling') {
        inhaleStartTime = now;
        lastMouthDist = tipToMouth;
      }
      smokeState = 'inhaling';
      exhaleTriggered = false;  // reset on new inhale
      return { state: 'inhaling', emitPos: null, isExhale: false };
    }

    // Hand moved away from mouth
    if (smokeState === 'inhaling' && !exhaleTriggered) {
      const moved = tipToMouth - lastMouthDist;
      const longEnough = (now - inhaleStartTime) >= INHALE_MIN_DURATION;
      const farEnough = moved > EXHALE_MIN_MOVE * faceH;

      if (longEnough && farEnough) {
        smokeState = 'exhaling';
        exhaleTriggered = true;
        return { state: 'exhaling', emitPos: mouth, isExhale: true };
      }
    }

    // Default or after exhale: fingertip smoke
    smokeState = 'fingertip';
    exhaleTriggered = false;  // reset when back to fingertip (allows next inhale-exhale cycle)
    return { state: 'fingertip', emitPos: handState.cigTip, isExhale: false };
  }

  async function mainLoop() {
    await HandDetector.send(video);
    await FaceDetector.send(video);
    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);

    const now = performance.now();
    const smokeResult = updateSmokeState(
      handState,
      FaceDetector.getMouth(),
      FaceDetector.getFaceHeight(),
      now
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Debug: draw landmarks
    if (landmarks) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      for (const lm of landmarks) {
        const x = canvas.width * (1 - lm.x);
        const y = canvas.height * lm.y;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Debug: pose status
    ctx.fillStyle = handState.poseActive ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.5)';
    ctx.font = '16px monospace';
    ctx.fillText(handState.poseActive ? 'CIG POSE DETECTED' : 'NO POSE', 20, 30);

    if (handState.cigTip) {
      const tx = canvas.width * (1 - handState.cigTip.x);
      const ty = canvas.height * handState.cigTip.y;
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Debug: mouth position
    const mouth = FaceDetector.getMouth();
    if (mouth) {
      const mx = canvas.width * (1 - mouth.x);
      const my = canvas.height * mouth.y;
      ctx.fillStyle = 'cyan';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Debug: show state (drawn after clear so it's always visible)
    ctx.fillStyle = 'white';
    ctx.font = '14px monospace';
    ctx.fillText('State: ' + smokeResult.state, 20, 50);

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

  init();

  // Export for other modules
  window.APP = { canvas, ctx, video };
})();
