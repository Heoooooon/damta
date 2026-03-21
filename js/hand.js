const HandDetector = (function () {
  let allHandLandmarks = [];
  let initError = null;
  const poseTrackers = [
    InteractionCore.createPoseTracker(),
    InteractionCore.createPoseTracker(),
  ];

  // --- MediaPipe Hands setup ---
  let hands;
  try {
    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        allHandLandmarks = results.multiHandLandmarks;
      } else {
        allHandLandmarks = [];
      }
    });
  } catch (err) {
    initError = 'MediaPipe Hands 로딩 실패: ' + err.message;
  }

  function updateAll() {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const landmarks = allHandLandmarks[i] || null;
      const state = poseTrackers[i].update(landmarks);
      results.push(state);
    }
    return results;
  }

  // Legacy single-hand API (returns first hand)
  function update(landmarks) {
    return poseTrackers[0].update(landmarks);
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
    return allHandLandmarks[0] || null;
  }

  function getAllLandmarks() {
    return allHandLandmarks;
  }

  function getError() {
    return initError;
  }

  function getLastAnalysis() {
    return poseTrackers[0].getLastAnalysis();
  }

  return { send, getLandmarks, getAllLandmarks, update, updateAll, getError, getLastAnalysis };
})();
