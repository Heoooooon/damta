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

  function mainLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // TODO: MediaPipe 처리, 파티클 업데이트/렌더링
    requestAnimationFrame(mainLoop);
  }

  async function init() {
    const camReady = await initWebcam();
    if (camReady) {
      requestAnimationFrame(mainLoop);
    }
  }

  init();

  // Export for other modules
  window.APP = { canvas, ctx, video };
})();
