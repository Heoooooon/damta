(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BoxingDetection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const THRESHOLD_NORMAL = 0.015;
  const THRESHOLD_STRONG = 0.04;

  // Finger tip/pip index pairs: [tip, pip]
  const FINGER_PAIRS = [
    [8, 6],   // index
    [12, 10], // middle
    [16, 14], // ring
    [20, 18], // pinky
  ];

  function isValidLandmarks(landmarks) {
    return Array.isArray(landmarks) && landmarks.length >= 21;
  }

  function isFist(landmarks) {
    if (!isValidLandmarks(landmarks)) return false;
    return FINGER_PAIRS.every(([tip, pip]) => landmarks[tip].y > landmarks[pip].y);
  }

  function getFistPosition(landmarks) {
    const w = landmarks[0];
    const m = landmarks[9];
    return { x: (w.x + m.x) / 2, y: (w.y + m.y) / 2 };
  }

  function createPunchTracker() {
    let prev = null;
    return {
      update(pos) {
        if (!prev) {
          prev = { x: pos.x, y: pos.y };
          return { displacement: 0 };
        }
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        const displacement = Math.sqrt(dx * dx + dy * dy);
        prev = { x: pos.x, y: pos.y };
        return { displacement };
      },
    };
  }

  function checkHit(fistPos, displacement, hitbox) {
    const insideX = Math.abs(fistPos.x - hitbox.x) <= hitbox.halfW;
    const insideY = Math.abs(fistPos.y - hitbox.y) <= hitbox.halfH;
    if (!insideX || !insideY || displacement < THRESHOLD_NORMAL) {
      return { hit: false };
    }
    const power = displacement >= THRESHOLD_STRONG ? 'strong' : 'normal';
    return { hit: true, power, position: { x: fistPos.x, y: fistPos.y } };
  }

  function createHitCooldown(durationMs) {
    let lastHitTime = -Infinity;
    return {
      canHit(now) {
        return (now - lastHitTime) >= durationMs;
      },
      recordHit(now) {
        lastHitTime = now;
      },
    };
  }

  return {
    isFist,
    getFistPosition,
    isValidLandmarks,
    createPunchTracker,
    checkHit,
    createHitCooldown,
    THRESHOLD_NORMAL,
    THRESHOLD_STRONG,
  };
});
