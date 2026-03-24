const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrackingSmoother = require('../js/tracking-smoother.js');

describe('createPositionSmoother', () => {
  it('returns the first input unchanged', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    const result = s.update({ x: 0.5, y: 0.3 });
    assert.deepStrictEqual(result, { x: 0.5, y: 0.3 });
  });

  it('smooths toward the new position', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    s.update({ x: 0.0, y: 0.0 });
    const result = s.update({ x: 1.0, y: 1.0 });
    // EMA: 0 + (1-0)*0.4 = 0.4
    assert.ok(Math.abs(result.x - 0.4) < 1e-9);
    assert.ok(Math.abs(result.y - 0.4) < 1e-9);
  });

  it('ignores changes within deadzone', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.01 });
    s.update({ x: 0.5, y: 0.5 });
    const result = s.update({ x: 0.505, y: 0.503 });
    // distance ~0.0058 < deadzone 0.01 → unchanged
    assert.deepStrictEqual(result, { x: 0.5, y: 0.5 });
  });

  it('applies smoothing when change exceeds deadzone', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.01 });
    s.update({ x: 0.5, y: 0.5 });
    const result = s.update({ x: 0.6, y: 0.5 });
    // distance 0.1 > deadzone → smoothed
    assert.ok(Math.abs(result.x - 0.54) < 1e-9);
  });

  it('supports 3D positions', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.5 });
    s.update({ x: 0.0, y: 0.0, z: 0.0 });
    const result = s.update({ x: 1.0, y: 1.0, z: 1.0 });
    assert.ok(Math.abs(result.z - 0.5) < 1e-9);
  });

  it('resets state', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    s.update({ x: 0.5, y: 0.5 });
    s.reset();
    const result = s.update({ x: 0.8, y: 0.8 });
    assert.deepStrictEqual(result, { x: 0.8, y: 0.8 });
  });
});

describe('createVelocityPredictor', () => {
  it('returns null when no data has been fed', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    assert.equal(p.predict(1000), null);
  });

  it('returns null after only one feed (no velocity yet)', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    p.feed({ x: 0.5, y: 0.5 }, 0);
    assert.equal(p.predict(16), null);
  });

  it('predicts position based on velocity', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 1.0 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);
    // velocity = 0.1/100 = 0.001 per ms
    // predict at 200ms → 0.1 + 0.001 * 100 = 0.2
    const result = p.predict(200);
    assert.ok(Math.abs(result.x - 0.2) < 1e-6);
    assert.ok(Math.abs(result.y - 0.0) < 1e-6);
  });

  it('returns null when prediction exceeds maxPredictMs', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 1.0 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);
    // 100 + 120 = 220ms 이후 null
    assert.equal(p.predict(300), null);
  });

  it('smooths velocity with alpha', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);  // raw v = 0.001
    p.feed({ x: 0.1, y: 0.0 }, 200);  // raw v = 0.0, smoothed = 0.001*0.5 = 0.0005
    const result = p.predict(250);
    // 0.1 + 0.0005 * 50 = 0.125
    assert.ok(Math.abs(result.x - 0.125) < 1e-6);
  });

  it('resets state', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    p.feed({ x: 0.5, y: 0.5 }, 0);
    p.feed({ x: 0.6, y: 0.5 }, 100);
    p.reset();
    assert.equal(p.predict(200), null);
  });
});
