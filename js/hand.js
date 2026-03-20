const HandDetector = (function () {
  let latestLandmarks = null;
  let initError = null;

  // --- MediaPipe Hands setup ---
  let hands;
  try {
    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        latestLandmarks = results.multiHandLandmarks[0];
      } else {
        latestLandmarks = null;
      }
    });
  } catch (err) {
    initError = 'MediaPipe Hands 로딩 실패: ' + err.message;
  }

  // --- Gesture detection ---
  const CIG_GAP_MIN = 0.03;
  const CIG_GAP_MAX = 0.12;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function palmWidth(landmarks) {
    return dist(landmarks[0], landmarks[9]);
  }

  function isFingerExtended(landmarks, tipIdx, pipIdx) {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  }

  function isCigPose(landmarks) {
    const pw = palmWidth(landmarks);
    if (pw === 0) return false;

    const gap = dist(landmarks[8], landmarks[12]) / pw;
    if (gap < CIG_GAP_MIN || gap > CIG_GAP_MAX) return false;

    if (!isFingerExtended(landmarks, 8, 6)) return false;
    if (!isFingerExtended(landmarks, 12, 10)) return false;

    if (isFingerExtended(landmarks, 16, 14)) return false;
    if (isFingerExtended(landmarks, 20, 18)) return false;

    const thumbDist = dist(landmarks[4], landmarks[5]) / pw;
    if (thumbDist > 0.8) return false;

    return true;
  }

  // --- Stability: 3-frame consecutive ---
  let consecutiveDetect = 0;
  let consecutiveLost = 0;
  let poseActive = false;

  function getCigTipPosition(landmarks) {
    return {
      x: (landmarks[8].x + landmarks[12].x) / 2,
      y: (landmarks[8].y + landmarks[12].y) / 2,
    };
  }

  function update(landmarks) {
    if (landmarks && isCigPose(landmarks)) {
      consecutiveDetect++;
      consecutiveLost = 0;
      if (consecutiveDetect >= 3) poseActive = true;
    } else {
      consecutiveLost++;
      consecutiveDetect = 0;
      if (consecutiveLost >= 3) poseActive = false;
    }

    return {
      poseActive,
      cigTip: landmarks && poseActive ? getCigTipPosition(landmarks) : null,
    };
  }

  async function send(videoEl) {
    if (!hands) return;
    try {
      await hands.send({ image: videoEl });
    } catch (err) {
      // MediaPipe send error — ignore and retry next frame
    }
  }

  function getLandmarks() {
    return latestLandmarks;
  }

  function getError() {
    return initError;
  }

  return { send, getLandmarks, update, getError };
})();
