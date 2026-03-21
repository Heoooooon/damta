const FaceDetector = (function () {
  let mouthPos = null;
  let prevMouthPos = null;
  let interpMouthPos = null;
  let latestLandmarks = null;
  let faceHeight = 0;
  let frameCount = 0;
  let initError = null;
  const DETECT_INTERVAL = 3;

  let faceMesh;
  try {
    faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const lm = results.multiFaceLandmarks[0];
        latestLandmarks = lm;
        prevMouthPos = mouthPos ? { x: mouthPos.x, y: mouthPos.y } : null;
        mouthPos = { x: lm[13].x, y: lm[13].y };
        faceHeight = Math.hypot(lm[10].x - lm[152].x, lm[10].y - lm[152].y);
      } else {
        latestLandmarks = null;
        mouthPos = null;
        prevMouthPos = null;
        faceHeight = 0;
      }
    });
  } catch (err) {
    initError = 'MediaPipe Face Mesh 로딩 실패: ' + err.message;
  }

  async function send(videoEl) {
    if (!faceMesh) return;
    frameCount++;
    const isDetectFrame = frameCount % DETECT_INTERVAL === 0;

    if (isDetectFrame) {
      try {
        await faceMesh.send({ image: videoEl });
      } catch (err) {
        // ignore, retry next interval
      }
    }

    if (mouthPos) {
      if (prevMouthPos && !isDetectFrame) {
        const frameInInterval = frameCount % DETECT_INTERVAL;
        const t = frameInInterval / DETECT_INTERVAL;
        interpMouthPos = {
          x: prevMouthPos.x + (mouthPos.x - prevMouthPos.x) * t,
          y: prevMouthPos.y + (mouthPos.y - prevMouthPos.y) * t,
        };
      } else {
        interpMouthPos = { x: mouthPos.x, y: mouthPos.y };
      }
    } else {
      interpMouthPos = null;
    }
  }

  function getMouth() {
    return interpMouthPos;
  }

  function getFaceHeight() {
    return faceHeight;
  }

  function getLandmarks() {
    return latestLandmarks;
  }

  function getError() {
    return initError;
  }

  return { send, getMouth, getFaceHeight, getLandmarks, getError };
})();
