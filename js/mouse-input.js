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

    const lm = new Array(478);
    const set = function (idx, ox, oy) {
      if (idx >= 0 && idx < 478) {
        lm[idx] = { x: cx + ox * fw, y: cy + oy * fh, z: 0 };
      }
    };

    // Face outline — exact indices from FACE_POLYLINE_INDICES[0]
    // These positions follow the actual MediaPipe face mesh topology
    set(10, 0, -0.48);
    set(338, -0.08, -0.46);
    set(297, -0.12, -0.4);
    set(332, -0.15, -0.32);
    set(284, -0.17, -0.22);
    set(251, -0.18, -0.12);
    set(389, -0.18, 0);
    set(356, -0.17, 0.1);
    set(454, -0.15, 0.2);
    set(323, -0.12, 0.3);
    set(361, -0.08, 0.36);
    set(288, -0.04, 0.4);
    set(397, 0, 0.44);
    set(365, 0.04, 0.44);
    set(379, 0.08, 0.42);
    set(378, 0.12, 0.38);
    set(400, 0.1, 0.34);
    set(377, 0.06, 0.3);
    set(152, 0, 0.46);
    set(148, -0.06, 0.4);
    set(176, -0.1, 0.34);
    set(149, -0.12, 0.28);
    set(150, -0.14, 0.24);
    set(136, -0.16, 0.18);
    set(172, -0.14, 0.12);
    set(58, -0.16, 0.08);
    set(132, -0.18, 0.02);
    set(93, -0.2, -0.04);
    set(234, -0.22, -0.1);
    set(127, -0.22, -0.18);
    set(162, -0.2, -0.26);
    set(21, -0.18, -0.34);
    set(54, -0.14, -0.4);
    set(103, -0.1, -0.44);
    set(67, -0.04, -0.46);
    set(109, 0.02, -0.44);

    // Left eyebrow [70, 63, 105, 66, 107]
    set(70, -0.14, -0.26);
    set(63, -0.1, -0.28);
    set(105, -0.07, -0.27);
    set(66, -0.05, -0.26);
    set(107, -0.03, -0.25);

    // Right eyebrow [336, 296, 334, 293, 300]
    set(336, 0.14, -0.26);
    set(296, 0.1, -0.28);
    set(334, 0.07, -0.27);
    set(293, 0.05, -0.26);
    set(300, 0.03, -0.25);

    // Left eye [33, 160, 158, 133, 153, 144]
    set(33, -0.1, -0.18);
    set(160, -0.08, -0.2);
    set(158, -0.06, -0.2);
    set(133, -0.04, -0.18);
    set(153, -0.06, -0.16);
    set(144, -0.08, -0.16);

    // Right eye [362, 385, 387, 263, 373, 380]
    set(362, 0.1, -0.18);
    set(385, 0.08, -0.2);
    set(387, 0.06, -0.2);
    set(263, 0.04, -0.18);
    set(373, 0.06, -0.16);
    set(380, 0.08, -0.16);

    // Nose bridge [168, 6, 195, 5, 4, 1, 19, 94, 2, 98]
    set(168, 0, -0.36);
    set(6, 0, -0.3);
    set(195, 0, -0.2);
    set(5, 0, -0.1);
    set(4, 0, -0.02);
    set(1, 0, 0.04);
    set(19, 0, 0.08);
    set(94, 0.04, 0.08);
    set(2, 0.06, 0.06);
    set(98, 0.08, 0.04);

    // Upper lip [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
    set(61, -0.1, 0.08);
    set(146, -0.07, 0.1);
    set(91, -0.04, 0.11);
    set(181, -0.02, 0.12);
    set(84, 0, 0.12);
    set(17, 0.02, 0.12);
    set(314, 0.04, 0.11);
    set(405, 0.07, 0.1);
    set(321, 0.1, 0.08);
    set(375, 0.08, 0.06);
    set(291, 0.06, 0.04);

    // Lower lip [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
    set(185, -0.08, 0.14);
    set(40, -0.06, 0.16);
    set(39, -0.04, 0.17);
    set(37, -0.02, 0.18);
    set(0, 0, 0.18);
    set(267, 0.02, 0.18);
    set(269, 0.04, 0.17);
    set(270, 0.06, 0.16);
    set(409, 0.08, 0.14);

    // Fill all remaining with center
    for (let i = 0; i < 478; i++) {
      if (!lm[i]) lm[i] = { x: cx, y: cy, z: 0 };
    }

    return lm;
  }

  function generateHandLandmarks() {
    if (!mousePos || !poseActive) return null;

    const cx = mousePos.x;
    const cy = mousePos.y;
    const s = 0.06;

    return [
      { x: cx, y: cy + s * 0.35, z: 0 },
      { x: cx - s * 0.35, y: cy + s * 0.15, z: 0 },
      { x: cx - s * 0.25, y: cy - s * 0.05, z: 0 },
      { x: cx - s * 0.1, y: cy - s * 0.2, z: 0 },
      { x: cx + s * 0.05, y: cy - s * 0.35, z: 0 },
      { x: cx - s * 0.3, y: cy + s * 0.05, z: 0 },
      { x: cx - s * 0.25, y: cy - s * 0.1, z: 0 },
      { x: cx - s * 0.2, y: cy - s * 0.25, z: 0 },
      { x: cx - s * 0.15, y: cy - s * 0.45, z: 0 },
      { x: cx - s * 0.1, y: cy + s * 0.05, z: 0 },
      { x: cx - s * 0.05, y: cy - s * 0.1, z: 0 },
      { x: cx, y: cy - s * 0.25, z: 0 },
      { x: cx + s * 0.05, y: cy - s * 0.45, z: 0 },
      { x: cx + s * 0.05, y: cy + s * 0.05, z: 0 },
      { x: cx + s * 0.1, y: cy - s * 0.05, z: 0 },
      { x: cx + s * 0.15, y: cy - s * 0.2, z: 0 },
      { x: cx + s * 0.2, y: cy - s * 0.35, z: 0 },
      { x: cx + s * 0.2, y: cy + s * 0.1, z: 0 },
      { x: cx + s * 0.25, y: cy + s * 0.02, z: 0 },
      { x: cx + s * 0.3, y: cy - s * 0.1, z: 0 },
      { x: cx + s * 0.35, y: cy - s * 0.25, z: 0 },
    ];
  }
    };

    // FACE_POLYLINE_INDICES[0]: Face outline (37 points)
    const outline = [
      [10, 0, -0.48], [338, -0.1, -0.46], [297, -0.14, -0.4],
      [332, -0.17, -0.32], [284, -0.19, -0.22], [251, -0.2, -0.12],
      [389, -0.2, 0], [356, -0.19, 0.12], [454, -0.17, 0.22],
      [323, -0.14, 0.32], [361, -0.1, 0.38], [288, -0.06, 0.42],
      [397, -0.02, 0.46], [365, 0.02, 0.46], [379, 0.06, 0.44],
      [378, 0.1, 0.4], [400, 0.08, 0.36], [377, 0.04, 0.32],
      [152, 0, 0.46], [148, -0.04, 0.4], [176, -0.08, 0.36],
      [149, -0.1, 0.32], [150, -0.12, 0.28], [136, -0.14, 0.22],
      [172, -0.12, 0.16], [58, -0.14, 0.12], [132, -0.16, 0.06],
      [93, -0.18, 0], [234, -0.2, -0.06], [127, -0.2, -0.14],
      [162, -0.18, -0.22], [21, -0.16, -0.3], [54, -0.12, -0.36],
      [103, -0.08, -0.4], [67, -0.04, -0.42], [109, 0, -0.4],
      [10, 0, -0.48],
    ];
    outline.forEach(function (p) { set(p[0], p[1], p[2]); });

    // FACE_POLYLINE_INDICES[1]: Left eyebrow
    set(70, -0.14, -0.26);
    set(63, -0.1, -0.28);
    set(105, -0.08, -0.27);
    set(66, -0.06, -0.26);
    set(107, -0.04, -0.25);

    // FACE_POLYLINE_INDICES[2]: Right eyebrow
    set(336, 0.14, -0.26);
    set(296, 0.1, -0.28);
    set(334, 0.08, -0.27);
    set(293, 0.06, -0.26);
    set(300, 0.04, -0.25);

    // FACE_POLYLINE_INDICES[3]: Left eye
    set(33, -0.1, -0.2);
    set(160, -0.08, -0.22);
    set(158, -0.06, -0.22);
    set(133, -0.04, -0.2);
    set(153, -0.06, -0.18);
    set(144, -0.08, -0.18);

    // FACE_POLYLINE_INDICES[4]: Right eye
    set(362, 0.1, -0.2);
    set(385, 0.08, -0.22);
    set(387, 0.06, -0.22);
    set(263, 0.04, -0.2);
    set(373, 0.06, -0.18);
    set(380, 0.08, -0.18);

    // FACE_POLYLINE_INDICES[5]: Nose
    set(168, 0, -0.34);
    set(6, 0, -0.28);
    set(195, 0, -0.18);
    set(5, 0, -0.08);
    set(4, 0, 0);
    set(1, 0, 0.04);
    set(19, 0, 0.08);
    set(94, 0.04, 0.08);
    set(2, 0.06, 0.06);
    set(98, 0.08, 0.04);

    // FACE_POLYLINE_INDICES[6]: Upper lip
    set(61, -0.1, 0.1);
    set(146, -0.07, 0.12);
    set(91, -0.04, 0.13);
    set(181, -0.02, 0.14);
    set(84, 0, 0.14);
    set(17, 0.02, 0.14);
    set(314, 0.04, 0.13);
    set(405, 0.07, 0.12);
    set(321, 0.1, 0.1);
    set(375, 0.08, 0.08);
    set(291, 0.06, 0.06);

    // FACE_POLYLINE_INDICES[7]: Lower lip
    set(185, -0.08, 0.16);
    set(40, -0.06, 0.18);
    set(39, -0.04, 0.19);
    set(37, -0.02, 0.2);
    set(0, 0, 0.2);
    set(267, 0.02, 0.2);
    set(269, 0.04, 0.19);
    set(270, 0.06, 0.18);
    set(409, 0.08, 0.16);

    // Fill all remaining with center
    for (let i = 0; i < 478; i++) {
      if (!lm[i]) lm[i] = { x: cx, y: cy, z: 0 };
    }

    return lm;
  }

  function generateHandLandmarks() {
    if (!mousePos || !poseActive) return null;

    const cx = mousePos.x;
    const cy = mousePos.y;
    const s = 0.06;

    return [
      { x: cx, y: cy + s * 0.35, z: 0 },
      { x: cx - s * 0.35, y: cy + s * 0.15, z: 0 },
      { x: cx - s * 0.25, y: cy - s * 0.05, z: 0 },
      { x: cx - s * 0.1, y: cy - s * 0.2, z: 0 },
      { x: cx + s * 0.05, y: cy - s * 0.35, z: 0 },
      { x: cx - s * 0.3, y: cy + s * 0.05, z: 0 },
      { x: cx - s * 0.25, y: cy - s * 0.1, z: 0 },
      { x: cx - s * 0.2, y: cy - s * 0.25, z: 0 },
      { x: cx - s * 0.15, y: cy - s * 0.45, z: 0 },
      { x: cx - s * 0.1, y: cy + s * 0.05, z: 0 },
      { x: cx - s * 0.05, y: cy - s * 0.1, z: 0 },
      { x: cx, y: cy - s * 0.25, z: 0 },
      { x: cx + s * 0.05, y: cy - s * 0.45, z: 0 },
      { x: cx + s * 0.05, y: cy + s * 0.05, z: 0 },
      { x: cx + s * 0.1, y: cy - s * 0.05, z: 0 },
      { x: cx + s * 0.15, y: cy - s * 0.2, z: 0 },
      { x: cx + s * 0.2, y: cy - s * 0.35, z: 0 },
      { x: cx + s * 0.2, y: cy + s * 0.1, z: 0 },
      { x: cx + s * 0.25, y: cy + s * 0.02, z: 0 },
      { x: cx + s * 0.3, y: cy - s * 0.1, z: 0 },
      { x: cx + s * 0.35, y: cy - s * 0.25, z: 0 },
    ];
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
