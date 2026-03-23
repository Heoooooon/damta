const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BoxingDetection = require('../js/boxing/boxing-detection.js');

// Helper: create landmarks array with 21 points, all at default {x:0.5, y:0.5, z:0}
function makeLandmarks(overrides = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [idx, pos] of Object.entries(overrides)) {
    Object.assign(lm[Number(idx)], pos);
  }
  return lm;
}

// ── Task 1: Fist detection ──

describe('isFist', () => {
  it('returns true when all 4 fingers folded (tip.y > pip.y)', () => {
    // Folded: tip.y > pip.y for each finger
    const lm = makeLandmarks({
      6: { y: 0.4 }, 8: { y: 0.6 },   // index pip, tip
      10: { y: 0.4 }, 12: { y: 0.6 },  // middle
      14: { y: 0.4 }, 16: { y: 0.6 },  // ring
      18: { y: 0.4 }, 20: { y: 0.6 },  // pinky
    });
    assert.equal(BoxingDetection.isFist(lm), true);
  });

  it('returns false for open hand (tips above pips)', () => {
    // Open: tip.y < pip.y (tips above pips in image coords)
    const lm = makeLandmarks({
      6: { y: 0.6 }, 8: { y: 0.4 },
      10: { y: 0.6 }, 12: { y: 0.4 },
      14: { y: 0.6 }, 16: { y: 0.4 },
      18: { y: 0.6 }, 20: { y: 0.4 },
    });
    assert.equal(BoxingDetection.isFist(lm), false);
  });

  it('returns false for null landmarks', () => {
    assert.equal(BoxingDetection.isFist(null), false);
  });

  it('returns false for invalid landmarks (too short)', () => {
    assert.equal(BoxingDetection.isFist([{ x: 0, y: 0 }]), false);
  });
});

describe('getFistPosition', () => {
  it('returns midpoint of wrist(0) and middle MCP(9)', () => {
    const lm = makeLandmarks({
      0: { x: 0.2, y: 0.8 },
      9: { x: 0.4, y: 0.4 },
    });
    const pos = BoxingDetection.getFistPosition(lm);
    assert.ok(Math.abs(pos.x - 0.3) < 1e-9);
    assert.ok(Math.abs(pos.y - 0.6) < 1e-9);
  });
});

describe('isValidLandmarks', () => {
  it('returns true for array with 21+ elements', () => {
    assert.equal(BoxingDetection.isValidLandmarks(makeLandmarks()), true);
  });

  it('returns false for non-array', () => {
    assert.equal(BoxingDetection.isValidLandmarks(null), false);
    assert.equal(BoxingDetection.isValidLandmarks('string'), false);
  });

  it('returns false for short array', () => {
    assert.equal(BoxingDetection.isValidLandmarks([]), false);
  });
});

// ── Task 2: Velocity tracking, hit detection, cooldown ──

describe('createPunchTracker', () => {
  it('returns 0 displacement on first frame', () => {
    const tracker = BoxingDetection.createPunchTracker();
    const result = tracker.update({ x: 0.5, y: 0.5 });
    assert.equal(result.displacement, 0);
  });

  it('tracks displacement between frames', () => {
    const tracker = BoxingDetection.createPunchTracker();
    tracker.update({ x: 0.5, y: 0.5 });
    const result = tracker.update({ x: 0.8, y: 0.9 });
    // displacement = sqrt((0.3)^2 + (0.4)^2) = 0.5
    assert.ok(Math.abs(result.displacement - 0.5) < 1e-9);
  });
});

describe('checkHit', () => {
  const hitbox = { x: 0.5, y: 0.5, halfW: 0.1, halfH: 0.1 };

  it('returns strong hit for high velocity (>= 0.04)', () => {
    const result = BoxingDetection.checkHit({ x: 0.5, y: 0.5 }, 0.05, hitbox);
    assert.equal(result.hit, true);
    assert.equal(result.power, 'strong');
  });

  it('returns normal hit for moderate velocity (>= 0.015)', () => {
    const result = BoxingDetection.checkHit({ x: 0.5, y: 0.5 }, 0.02, hitbox);
    assert.equal(result.hit, true);
    assert.equal(result.power, 'normal');
  });

  it('returns no hit when outside hitbox', () => {
    const result = BoxingDetection.checkHit({ x: 0.9, y: 0.9 }, 0.05, hitbox);
    assert.equal(result.hit, false);
  });

  it('returns no hit when too slow (< 0.015)', () => {
    const result = BoxingDetection.checkHit({ x: 0.5, y: 0.5 }, 0.01, hitbox);
    assert.equal(result.hit, false);
  });
});

describe('createHitCooldown', () => {
  it('blocks hits within 200ms window', () => {
    const cooldown = BoxingDetection.createHitCooldown(200);
    assert.equal(cooldown.canHit(1000), true);
    cooldown.recordHit(1000);
    assert.equal(cooldown.canHit(1100), false);  // 100ms later, still blocked
    assert.equal(cooldown.canHit(1200), true);    // 200ms later, allowed
  });
});
