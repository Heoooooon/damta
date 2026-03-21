const HandDetector = (function () {
  let latestLandmarks = null;
  let initError = null;
  const poseTracker = InteractionCore.createPoseTracker();

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

  function update(landmarks) {
    return poseTracker.update(landmarks);
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

  function getLastAnalysis() {
    return poseTracker.getLastAnalysis();
  }

  return { send, getLandmarks, update, getError, getLastAnalysis };
})();
