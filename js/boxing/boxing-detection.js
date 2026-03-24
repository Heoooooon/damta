(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BoxingDetection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const THRESHOLD_NORMAL = 0.015;
  const THRESHOLD_STRONG = 0.04;
  const FORWARD_POWER_SCALE = 0.3;
  const MAX_FORWARD_BONUS = 0.03;
  const MAX_IMPACT_SCALE = 1.8;

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

  function getFistDepth(landmarks) {
    const w = landmarks[0];
    const m = landmarks[9];
    return ((w.z || 0) + (m.z || 0)) / 2;
  }

  function createPunchTracker() {
    let prev = null;
    let baselineZ = null;
    return {
      update(pos) {
        const hasDepth = typeof pos.z === 'number';

        if (!prev) {
          prev = { x: pos.x, y: pos.y, z: typeof pos.z === 'number' ? pos.z : null };
          baselineZ = hasDepth ? pos.z : null;
          return { displacement: 0, forwardMotion: 0, extension: 0 };
        }
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        const displacement = Math.sqrt(dx * dx + dy * dy);
        let forwardMotion = 0;
        let extension = 0;
        if (typeof pos.z === 'number' && typeof prev.z === 'number') {
          forwardMotion = Math.max(0, prev.z - pos.z);
        }
        if (hasDepth) {
          if (baselineZ === null) {
            baselineZ = pos.z;
          } else if (pos.z > baselineZ) {
            baselineZ = baselineZ * 0.8 + pos.z * 0.2;
          } else {
            baselineZ = baselineZ * 0.98 + pos.z * 0.02;
          }
          extension = Math.max(0, baselineZ - pos.z);
        }
        prev = { x: pos.x, y: pos.y, z: typeof pos.z === 'number' ? pos.z : null };
        return { displacement, forwardMotion, extension };
      },
    };
  }

  function checkHit(fistPos, displacement, hitbox, depthState) {
    const insideX = Math.abs(fistPos.x - hitbox.x) <= hitbox.halfW;
    const insideY = Math.abs(fistPos.y - hitbox.y) <= hitbox.halfH;
    if (!insideX || !insideY || displacement < THRESHOLD_NORMAL) {
      return { hit: false };
    }
    if (depthState && (typeof depthState.minExtension === 'number' || typeof depthState.minForwardMotion === 'number')) {
      const extension = Math.max(0, depthState.extension || 0);
      const forwardMotion = Math.max(0, depthState.forwardMotion || 0);
      const depthReached =
        extension >= (depthState.minExtension || 0) ||
        forwardMotion >= (depthState.minForwardMotion || 0);
      if (!depthReached) {
        return { hit: false };
      }
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

  function resolveHitPower(displacement, forwardMotion) {
    const clampedForward = Math.max(0, forwardMotion || 0);
    const forwardBonus = Math.min(MAX_FORWARD_BONUS, clampedForward * FORWARD_POWER_SCALE);
    const boostedImpact = displacement + forwardBonus;
    const power = boostedImpact >= THRESHOLD_STRONG ? 'strong' : 'normal';
    const impactScale = power === 'strong'
      ? 1 + (forwardBonus / MAX_FORWARD_BONUS) * (MAX_IMPACT_SCALE - 1)
      : 1;
    return {
      power,
      boostedImpact,
      forwardBonus,
      impactScale
    };
  }

  return {
    isFist,
    getFistPosition,
    getFistDepth,
    isValidLandmarks,
    createPunchTracker,
    checkHit,
    createHitCooldown,
    resolveHitPower,
    THRESHOLD_NORMAL,
    THRESHOLD_STRONG,
  };
});
