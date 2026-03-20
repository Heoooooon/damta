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

  async function mainLoop() {
    await HandDetector.send(video);
    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);

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

    requestAnimationFrame(mainLoop);
  }

  async function init() {
    // Check MediaPipe loading
    const handErr = HandDetector.getError();
    if (handErr) {
      errorEl.textContent = handErr + '\n페이지를 새로고침해주세요.';
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
