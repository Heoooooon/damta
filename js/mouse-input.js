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
    const fw = fh * 0.7;

    const lm = new Array(478);
    const set = function (idx, ox, oy) {
      if (idx >= 0 && idx < 478) {
        lm[idx] = { x: cx + ox * fw, y: cy + oy * fh, z: 0 };
      }
    };

    // Face outline — FACE_POLYLINE_INDICES[0]
    // Path: 10(top) → right side → chin → left side → 10(top)
    // Right side of face (viewer's right = positive ox)
    set(10, 0, -0.5);
    set(338, 0.04, -0.48);
    set(297, 0.08, -0.44);
    set(332, 0.12, -0.38);
    set(284, 0.15, -0.3);
    set(251, 0.17, -0.2);
    set(389, 0.17, -0.08);
    set(356, 0.16, 0.04);
    set(454, 0.14, 0.16);
    set(323, 0.11, 0.26);
    set(361, 0.07, 0.34);
    set(288, 0.04, 0.4);
    set(397, 0.01, 0.44);
    // Chin
    set(365, 0.02, 0.46);
    set(379, 0.04, 0.48);
    set(378, 0.06, 0.46);
    set(400, 0.03, 0.44);
    set(377, 0.01, 0.4);
    set(152, 0, 0.5);
    // Left side of face (viewer's left = negative ox)
    set(148, -0.01, 0.44);
    set(176, -0.03, 0.4);
    set(149, -0.06, 0.34);
    set(150, -0.08, 0.28);
    set(136, -0.1, 0.22);
    set(172, -0.12, 0.16);
    set(58, -0.13, 0.1);
    set(132, -0.14, 0.04);
    set(93, -0.15, -0.02);
    set(234, -0.16, -0.08);
    set(127, -0.16, -0.16);
    set(162, -0.15, -0.24);
    set(21, -0.13, -0.32);
    set(54, -0.1, -0.38);
    set(103, -0.07, -0.42);
    set(67, -0.04, -0.46);
    set(109, -0.02, -0.48);

    // Left eyebrow [70, 63, 105, 66, 107] — viewer's left
    set(70, -0.1, -0.28);
    set(63, -0.07, -0.3);
    set(105, -0.05, -0.29);
    set(66, -0.03, -0.28);
    set(107, -0.01, -0.27);

    // Right eyebrow [336, 296, 334, 293, 300] — viewer's right
    set(336, 0.1, -0.28);
    set(296, 0.07, -0.3);
    set(334, 0.05, -0.29);
    set(293, 0.03, -0.28);
    set(300, 0.01, -0.27);

    // Left eye [33, 160, 158, 133, 153, 144]
    set(33, -0.08, -0.2);
    set(160, -0.06, -0.22);
    set(158, -0.04, -0.22);
    set(133, -0.02, -0.2);
    set(153, -0.04, -0.18);
    set(144, -0.06, -0.18);

    // Right eye [362, 385, 387, 263, 373, 380]
    set(362, 0.08, -0.2);
    set(385, 0.06, -0.22);
    set(387, 0.04, -0.22);
    set(263, 0.02, -0.2);
    set(373, 0.04, -0.18);
    set(380, 0.06, -0.18);

    // Nose bridge [168, 6, 195, 5, 4, 1, 19, 94, 2, 98]
    set(168, 0, -0.36);
    set(6, 0, -0.3);
    set(195, 0, -0.2);
    set(5, 0, -0.1);
    set(4, 0, -0.02);
    set(1, 0, 0.04);
    set(19, 0, 0.08);
    set(94, 0.03, 0.08);
    set(2, 0.05, 0.06);
    set(98, 0.06, 0.04);

    // Upper lip [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
    set(61, -0.08, 0.08);
    set(146, -0.05, 0.1);
    set(91, -0.03, 0.11);
    set(181, -0.01, 0.12);
    set(84, 0, 0.12);
    set(17, 0.01, 0.12);
    set(314, 0.03, 0.11);
    set(405, 0.05, 0.1);
    set(321, 0.08, 0.08);
    set(375, 0.06, 0.06);
    set(291, 0.04, 0.04);

    // Lower lip [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
    set(185, -0.06, 0.14);
    set(40, -0.04, 0.16);
    set(39, -0.03, 0.17);
    set(37, -0.01, 0.18);
    set(0, 0, 0.18);
    set(267, 0.01, 0.18);
    set(269, 0.03, 0.17);
    set(270, 0.04, 0.16);
    set(409, 0.06, 0.14);

    // Fill all remaining with center
    for (let i = 0; i < 478; i++) {
      if (!lm[i]) lm[i] = { x: cx, y: cy, z: 0 };
    }

    return lm;
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
