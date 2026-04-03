const MouseController = (function () {
  let mousePos = null;
  let poseActive = false;
  let mouthPos = { x: 0.5, y: 0.42 };
  let faceHeight = 0.35;
  let active = false;

  function init() {
    document.addEventListener('mousemove', function (e) {
      if (!active) return;
      mousePos = {
        x: 1 - e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    });

    document.addEventListener('mousedown', function (e) {
      if (!active) return;
      if (e.button === 0) poseActive = true;
      if (e.button === 2) {
        mouthPos = {
          x: 1 - e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        };
      }
    });

    document.addEventListener('mouseup', function (e) {
      if (!active) return;
      if (e.button === 0) poseActive = false;
    });

    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
      if (!active) return;
      if (e.code === 'ArrowUp') mouthPos.y = Math.max(0.1, mouthPos.y - 0.02);
      if (e.code === 'ArrowDown') mouthPos.y = Math.min(0.9, mouthPos.y + 0.02);
      if (e.code === 'ArrowLeft') mouthPos.x = Math.min(0.9, mouthPos.x + 0.02);
      if (e.code === 'ArrowRight') mouthPos.x = Math.max(0.1, mouthPos.x - 0.02);
    });

    active = true;
  }

  function getHandStates() {
    if (!active || !mousePos) {
      return [
        { poseActive: false, cigTip: null, analysis: null },
        { poseActive: false, cigTip: null, analysis: null },
      ];
    }

    return [
      {
        poseActive: poseActive,
        cigTip: poseActive ? { x: mousePos.x, y: mousePos.y } : null,
        analysis: {
          isPose: poseActive,
          score: poseActive ? 0.8 : 0,
          gapRatio: 0.15,
          poseType: 'pinch',
        },
      },
      { poseActive: false, cigTip: null, analysis: null },
    ];
  }

  function getAllLandmarks() {
    return [];
  }

  function getMouth() {
    return active ? mouthPos : null;
  }

  function getFaceHeight() {
    return active ? faceHeight : 0;
  }

  function getLandmarks() {
    return null;
  }

  function getError() {
    return null;
  }

  function getLastAnalysis() {
    return null;
  }

  async function send() {}

  function isActive() {
    return active;
  }

  function getDebugInfo() {
    return {
      mode: 'mouse',
      mousePos: mousePos,
      poseActive: poseActive,
      mouthPos: mouthPos,
    };
  }

  return {
    init,
    send,
    getHandStates,
    getAllLandmarks,
    getMouth,
    getFaceHeight,
    getLandmarks,
    getError,
    getLastAnalysis,
    isActive,
    getDebugInfo,
  };
})();
