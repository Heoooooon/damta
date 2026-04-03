const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FingerGunDetection = require('../js/finger-gun/finger-gun-detection.js');

function makeLandmarks(overrides = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [idx, pos] of Object.entries(overrides)) {
    Object.assign(lm[Number(idx)], pos);
  }
  return lm;
}

describe('isFingerGunPose', () => {
  it('returns true for index and middle extended with ring and pinky folded', () => {
    const lm = makeLandmarks({
      0: { x: 0.45, y: 0.82 },
      2: { x: 0.38, y: 0.68 },
      4: { x: 0.22, y: 0.6 },
      5: { x: 0.45, y: 0.64 },
      6: { x: 0.42, y: 0.52 },
      8: { x: 0.35, y: 0.36 },
      9: { x: 0.5, y: 0.64 },
      10: { x: 0.47, y: 0.52 }, 12: { x: 0.4, y: 0.34 },
      14: { y: 0.56 }, 16: { y: 0.7 },
      18: { y: 0.58 }, 20: { y: 0.72 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), true);
  });

  it('returns true when index and middle point forward horizontally', () => {
    const lm = makeLandmarks({
      5: { x: 0.62, y: 0.58 },
      6: { x: 0.48, y: 0.57 },
      8: { x: 0.28, y: 0.56 },
      9: { x: 0.63, y: 0.66 },
      10: { x: 0.49, y: 0.65 },
      12: { x: 0.31, y: 0.64 },
      13: { x: 0.6, y: 0.72 },
      14: { x: 0.56, y: 0.75 },
      16: { x: 0.53, y: 0.79 },
      17: { x: 0.6, y: 0.79 },
      18: { x: 0.57, y: 0.82 },
      20: { x: 0.55, y: 0.86 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), true);
  });

  it('returns true when index and middle point straight toward the camera', () => {
    const lm = makeLandmarks({
      5: { x: 0.52, y: 0.58, z: 0.02 },
      6: { x: 0.5, y: 0.58, z: -0.12 },
      8: { x: 0.49, y: 0.57, z: -0.34 },
      9: { x: 0.56, y: 0.64, z: 0.03 },
      10: { x: 0.54, y: 0.64, z: -0.1 },
      12: { x: 0.52, y: 0.63, z: -0.3 },
      13: { x: 0.58, y: 0.73 },
      14: { x: 0.56, y: 0.77 },
      16: { x: 0.55, y: 0.83 },
      17: { x: 0.62, y: 0.8 },
      18: { x: 0.6, y: 0.84 },
      20: { x: 0.58, y: 0.88 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), true);
  });

  it('returns true when support fingers are folded in depth while the barrel points at the camera', () => {
    const lm = makeLandmarks({
      5: { x: 0.52, y: 0.58, z: 0.02 },
      6: { x: 0.5, y: 0.58, z: -0.12 },
      8: { x: 0.49, y: 0.57, z: -0.34 },
      9: { x: 0.56, y: 0.64, z: 0.03 },
      10: { x: 0.54, y: 0.64, z: -0.1 },
      12: { x: 0.52, y: 0.63, z: -0.3 },
      13: { x: 0.58, y: 0.73, z: 0.0 },
      14: { x: 0.56, y: 0.77, z: -0.08 },
      16: { x: 0.555, y: 0.78, z: -0.01 },
      17: { x: 0.62, y: 0.8, z: 0.01 },
      18: { x: 0.6, y: 0.84, z: -0.07 },
      20: { x: 0.595, y: 0.85, z: 0.0 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), true);
  });

  it('returns false when the middle finger is folded', () => {
    const lm = makeLandmarks({
      2: { x: 0.38, y: 0.68 },
      4: { x: 0.22, y: 0.6 },
      5: { x: 0.45, y: 0.64 },
      6: { x: 0.42, y: 0.52 },
      8: { x: 0.35, y: 0.36 },
      10: { y: 0.54 }, 12: { y: 0.68 },
      14: { y: 0.56 }, 16: { y: 0.7 },
      18: { y: 0.58 }, 20: { y: 0.72 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), false);
  });

  it('returns false when the ring finger is also extended', () => {
    const lm = makeLandmarks({
      5: { x: 0.45, y: 0.64 },
      6: { x: 0.42, y: 0.52 },
      8: { x: 0.35, y: 0.36 },
      9: { x: 0.5, y: 0.64 },
      10: { x: 0.47, y: 0.52 }, 12: { x: 0.4, y: 0.34 },
      14: { y: 0.52 }, 16: { y: 0.36 },
      18: { y: 0.58 }, 20: { y: 0.72 },
    });
    assert.equal(FingerGunDetection.isFingerGunPose(lm), false);
  });
});

describe('getAimPoint', () => {
  it('projects the aim point beyond the averaged index-middle barrel direction', () => {
    const lm = makeLandmarks({
      5: { x: 0.55, y: 0.6 },
      9: { x: 0.6, y: 0.62 },
      8: { x: 0.4, y: 0.35 },
      12: { x: 0.44, y: 0.37 },
    });
    const aim = FingerGunDetection.getAimPoint(lm);
    assert.ok(aim.x < 0.42);
    assert.ok(aim.y < 0.36);
  });

  it('clamps the aim point to the normalized viewport', () => {
    const lm = makeLandmarks({
      5: { x: 0.2, y: 0.8 },
      8: { x: -0.1, y: -0.05 },
      9: { x: 0.24, y: 0.82 },
      12: { x: -0.05, y: -0.02 },
    });
    const aim = FingerGunDetection.getAimPoint(lm);
    assert.equal(aim.x >= 0 && aim.x <= 1, true);
    assert.equal(aim.y >= 0 && aim.y <= 1, true);
  });

  it('keeps the aim point stable near the muzzle when the barrel points straight at the camera', () => {
    const lm = makeLandmarks({
      5: { x: 0.52, y: 0.58, z: 0.02 },
      8: { x: 0.49, y: 0.57, z: -0.34 },
      9: { x: 0.56, y: 0.64, z: 0.03 },
      12: { x: 0.52, y: 0.63, z: -0.3 },
    });
    const aim = FingerGunDetection.getAimPoint(lm);
    assert.ok(Math.abs(aim.x - 0.505) < 0.05);
    assert.ok(Math.abs(aim.y - 0.6) < 0.05);
  });
});

describe('createManualFireController', () => {
  it('fires when the barrel tips upward across consecutive frames', () => {
    const fire = FingerGunDetection.createManualFireController(220, 0.035);
    fire.update(true, { x: 0.1, y: -0.12 }, 1000);
    assert.equal(fire.update(true, { x: 0.09, y: -0.145 }, 1016), false);
    assert.equal(fire.update(true, { x: 0.08, y: -0.175 }, 1032), true);
  });

  it('does not fire for a steady aim without an upward flick', () => {
    const fire = FingerGunDetection.createManualFireController(220, 0.035);
    fire.update(true, { x: 0.1, y: -0.12 }, 1000);
    assert.equal(fire.update(true, { x: 0.09, y: -0.125 }, 1016), false);
  });

  it('respects cooldown between upward flicks', () => {
    const fire = FingerGunDetection.createManualFireController(220, 0.035);
    fire.update(true, { x: 0.1, y: -0.12 }, 1000);
    fire.update(true, { x: 0.09, y: -0.145 }, 1016);
    fire.update(true, { x: 0.08, y: -0.175 }, 1032);
    assert.equal(fire.update(true, { x: 0.06, y: -0.22 }, 1100), false);
    fire.update(true, { x: 0.08, y: -0.16 }, 1224);
    assert.equal(fire.update(true, { x: 0.05, y: -0.205 }, 1240), false);
    assert.equal(fire.update(true, { x: 0.04, y: -0.245 }, 1256), true);
  });

  it('resets the trigger state after pose release', () => {
    const fire = FingerGunDetection.createManualFireController(220, 0.035);
    fire.update(true, { x: 0.1, y: -0.12 }, 1000);
    fire.update(false, null, 1030);
    fire.update(true, { x: 0.09, y: -0.13 }, 1040);
    assert.equal(fire.update(true, { x: 0.08, y: -0.15 }, 1056), false);
    assert.equal(fire.update(true, { x: 0.06, y: -0.185 }, 1072), true);
  });

  it('does not fire from a single-frame jitter spike', () => {
    const fire = FingerGunDetection.createManualFireController(220, 0.035);
    fire.update(true, { x: 0.1, y: -0.12 }, 1000);
    assert.equal(fire.update(true, { x: 0.08, y: -0.165 }, 1016), false);
    assert.equal(fire.update(true, { x: 0.1, y: -0.125 }, 1032), false);
  });
});

describe('createVectorSmoother', () => {
  it('dampens sudden jitter spikes in the tracked vector', () => {
    const smoother = FingerGunDetection.createVectorSmoother(0.3);
    assert.deepEqual(smoother.update({ x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
    const next = smoother.update({ x: 0.8, y: 0.2 });
    assert.ok(next.x < 0.8 && next.x > 0.55);
    assert.ok(next.y > 0.2 && next.y < 0.45);
  });

  it('returns null on reset and accepts a fresh baseline', () => {
    const smoother = FingerGunDetection.createVectorSmoother(0.25);
    smoother.update({ x: 0.5, y: 0.5 });
    smoother.reset();
    assert.equal(smoother.update(null), null);
    assert.deepEqual(smoother.update({ x: 0.3, y: 0.4 }), { x: 0.3, y: 0.4 });
  });

  it('holds the previous vector for tiny hand jitter inside the deadzone', () => {
    const smoother = FingerGunDetection.createVectorSmoother(0.3, 0.01);
    assert.deepEqual(smoother.update({ x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
    assert.deepEqual(smoother.update({ x: 0.506, y: 0.494 }), { x: 0.5, y: 0.5 });
  });
});
