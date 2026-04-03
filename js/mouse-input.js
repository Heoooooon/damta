const MouseController = (function () {
  let mousePos = null;
  let poseActive = false;
  let mouthPos = { x: 0.5, y: 0.42 };
  let faceHeight = 0.35;
  let active = false;
  let faceCenterX = 0.78;
  let faceCenterY = 0.38;

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

  function generateFaceLandmarks() {
    const cx = faceCenterX;
    const cy = faceCenterY;
    const fh = faceHeight;
    const fw = fh * 0.72;

    const landmarks = new Array(478);
    for (let i = 0; i < 478; i++) landmarks[i] = { x: cx, y: cy, z: 0 };

    const set = function (idx, ox, oy) {
      if (idx >= 0 && idx < 478) {
        landmarks[idx] = { x: cx + ox * fw, y: cy + oy * fh, z: 0 };
      }
    };

    set(10, 0, -0.42);
    set(152, 0, 0.42);
    set(13, 0.02, 0.18);
    set(14, -0.02, 0.18);
    set(78, 0.06, 0.18);
    set(308, -0.06, 0.18);
    set(61, 0.08, 0.12);
    set(291, -0.08, 0.12);
    set(405, -0.06, 0.12);
    set(185, 0.06, 0.12);
    set(0, 0, -0.46);
    set(17, 0.14, -0.22);
    set(264, -0.14, -0.22);
    set(33, 0.08, -0.28);
    set(263, -0.08, -0.28);
    set(133, 0.07, -0.18);
    set(362, -0.07, -0.18);
    set(23, 0.18, -0.1);
    set(253, -0.18, -0.1);
    set(454, -0.16, 0.05);
    set(224, 0.16, 0.05);
    set(116, 0.12, 0.02);
    set(345, -0.12, 0.02);
    set(58, 0.1, -0.06);
    set(288, -0.1, -0.06);
    set(153, 0.04, 0.38);
    set(382, -0.04, 0.38);
    set(207, 0.06, 0.32);
    set(427, -0.06, 0.32);
    set(172, 0.02, 0.36);
    set(402, -0.02, 0.36);
    set(149, 0.04, 0.28);
    set(378, -0.04, 0.28);
    set(93, 0.1, 0.2);
    set(322, -0.1, 0.2);
    set(127, 0.06, -0.22);
    set(356, -0.06, -0.22);
    set(21, 0.12, -0.14);
    set(251, -0.12, -0.14);
    set(205, 0.14, 0.1);
    set(425, -0.14, 0.1);

    return landmarks;
  }

  function generateHandLandmarks() {
    if (!mousePos || !poseActive) return null;

    const cx = mousePos.x;
    const cy = mousePos.y;
    const scale = 0.06;

    const landmarks = [
      { x: cx, y: cy + scale * 0.3, z: 0 },
      { x: cx - scale * 0.3, y: cy + scale * 0.1, z: 0 },
      { x: cx - scale * 0.15, y: cy - scale * 0.05, z: 0 },
      { x: cx + scale * 0.15, y: cy - scale * 0.15, z: 0 },
      { x: cx + scale * 0.35, y: cy - scale * 0.25, z: 0 },
      { x: cx - scale * 0.35, y: cy, z: 0 },
      { x: cx - scale * 0.3, y: cy - scale * 0.15, z: 0 },
      { x: cx - scale * 0.25, y: cy - scale * 0.3, z: 0 },
      { x: cx - scale * 0.2, y: cy - scale * 0.5, z: 0 },
      { x: cx - scale * 0.1, y: cy - scale * 0.1, z: 0 },
      { x: cx - scale * 0.05, y: cy - scale * 0.25, z: 0 },
      { x: cx, y: cy - scale * 0.4, z: 0 },
      { x: cx + scale * 0.05, y: cy - scale * 0.6, z: 0 },
      { x: cx + scale * 0.05, y: cy - scale * 0.05, z: 0 },
      { x: cx + scale * 0.1, y: cy - scale * 0.2, z: 0 },
      { x: cx + scale * 0.15, y: cy - scale * 0.35, z: 0 },
      { x: cx + scale * 0.2, y: cy - scale * 0.5, z: 0 },
      { x: cx + scale * 0.15, y: cy + scale * 0.05, z: 0 },
      { x: cx + scale * 0.2, y: cy - scale * 0.1, z: 0 },
      { x: cx + scale * 0.25, y: cy - scale * 0.25, z: 0 },
      { x: cx + scale * 0.3, y: cy - scale * 0.4, z: 0 },
    ];

    return landmarks;
  }

  function getHandStates() {
    if (!active || !mousePos) {
      return [
        { poseActive: false, cigTip: null, analysis: null },
        { poseActive: false, cigTip: null, analysis: null },
      ];
    }

    const handLandmarks = generateHandLandmarks();

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
        landmarks: handLandmarks,
      },
      { poseActive: false, cigTip: null, analysis: null, landmarks: null },
    ];
  }

  function getAllLandmarks() {
    if (!active || !mousePos) return [];
    const handLandmarks = generateHandLandmarks();
    return handLandmarks ? [handLandmarks] : [];
  }

  function getMouth() {
    return active ? mouthPos : null;
  }

  function getFaceHeight() {
    return active ? faceHeight : 0;
  }

  function getLandmarks() {
    return active ? generateFaceLandmarks() : null;
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
