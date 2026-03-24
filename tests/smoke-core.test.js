const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getEmissionProfile,
  getEmberProfile,
  getParticleAlpha,
  getLateralSpreadForce,
  getParticleRenderState,
  getAltitudeFade,
} = require('../js/smoke-core.js');

const mode = {
  emissions: {
    fingertip: {
      count: 4,
      spreadX: 10,
      spreadY: 6,
      velocityX: 0.45,
      velocityY: { min: -1.2, max: -0.4 },
      lifeMultiplier: 0.85,
      sizeMultiplier: 0.7,
      alphaMultiplier: 0.75,
      turbulence: 0.45,
      riseAccel: 0.0015,
    },
    exhaleBurst: {
      count: 26,
      spreadX: 44,
      spreadY: 18,
      velocityX: 2.8,
      velocityY: { min: -3.8, max: -1.4 },
      lifeMultiplier: 1.15,
      sizeMultiplier: 1.2,
      alphaMultiplier: 1.1,
      turbulence: 1.1,
      riseAccel: 0.0028,
    },
    exhaleStream: {
      count: 12,
      spreadX: 28,
      spreadY: 12,
      velocityX: 1.2,
      velocityY: { min: -2.4, max: -0.9 },
      lifeMultiplier: 1,
      sizeMultiplier: 1,
      alphaMultiplier: 0.95,
      turbulence: 0.75,
      riseAccel: 0.0022,
    },
  },
};

const realisticMode = {
  emissions: {
    fingertip: {
      count: 3,
      spreadX: 4,
      spreadY: 2,
      velocityX: 0.18,
      velocityY: { min: -1.65, max: -0.92 },
      lifeMultiplier: 1.28,
      sizeMultiplier: 0.55,
      alphaMultiplier: 0.56,
      turbulence: 0.3,
      riseAccel: 0.0026,
      drag: 0.992,
      lateralDamping: 0.94,
      trailWidth: 2.2,
      trailAlpha: 0.42,
      strandiness: 0.94,
      unravel: 0.92,
      curlStrength: 0.3,
      spreadAccel: 0.34,
      fadeOutStart: 0.42,
      fadeOutPower: 1.6,
    },
    exhaleBurst: {
      count: 38,
      spreadX: 58,
      spreadY: 22,
      velocityX: 3.6,
      velocityY: { min: -3.2, max: -1.05 },
      lifeMultiplier: 1.35,
      sizeMultiplier: 1.48,
      alphaMultiplier: 1.18,
      turbulence: 1.24,
      riseAccel: 0.0035,
      drag: 0.993,
      lateralDamping: 0.971,
      trailWidth: 3.6,
      trailAlpha: 0.18,
      strandiness: 0.35,
      unravel: 0.46,
      curlStrength: 0.14,
      spreadAccel: 0.16,
      fadeOutStart: 0.48,
      fadeOutPower: 1.24,
    },
    exhaleStream: {
      count: 19,
      spreadX: 38,
      spreadY: 16,
      velocityX: 1.55,
      velocityY: { min: -2.2, max: -0.78 },
      lifeMultiplier: 1.14,
      sizeMultiplier: 1.16,
      alphaMultiplier: 1,
      turbulence: 0.92,
      riseAccel: 0.0025,
      drag: 0.99,
      lateralDamping: 0.963,
      trailWidth: 2.8,
      trailAlpha: 0.22,
      strandiness: 0.48,
      unravel: 0.58,
      curlStrength: 0.18,
      spreadAccel: 0.22,
      fadeOutStart: 0.5,
      fadeOutPower: 1.32,
    },
  },
};

test('exhale burst profile is much stronger than fingertip smoke', () => {
  const fingertip = getEmissionProfile(mode, 'fingertip', 0);
  const burst = getEmissionProfile(mode, 'exhale-burst', 0);

  assert.ok(burst.count > fingertip.count);
  assert.ok(burst.spreadX > fingertip.spreadX);
  assert.ok(burst.velocityY.min < fingertip.velocityY.min);
  assert.ok(burst.alphaMultiplier > fingertip.alphaMultiplier);
});

test('exhale stream decays after the initial burst but remains more expressive than fingertip smoke', () => {
  const fingertip = getEmissionProfile(mode, 'fingertip', 0);
  const stream = getEmissionProfile(mode, 'exhale-stream', 0.65);

  assert.ok(stream.count > fingertip.count);
  assert.ok(stream.count < mode.emissions.exhaleBurst.count);
  assert.ok(stream.riseAccel > fingertip.riseAccel);
  assert.ok(stream.turbulence > fingertip.turbulence);
});

test('realistic mode keeps enough density to read as visible smoke when exhaling', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const burst = getEmissionProfile(realisticMode, 'exhale-burst', 0);

  assert.ok(fingertip.count <= 4);
  assert.ok(fingertip.alphaMultiplier <= 0.6);
  assert.ok(burst.count >= 38);
  assert.ok(burst.sizeMultiplier >= 1.45);
});

test('fingertip smoke stays vertically biased so it rises instead of drifting sideways', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);

  assert.ok(fingertip.velocityY.max < 0);
  assert.ok(Math.abs(fingertip.velocityY.min) > fingertip.velocityX * 2);
});

test('fingertip smoke damps sideways drift faster than its upward motion', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);

  assert.ok(fingertip.lateralDamping < fingertip.drag);
});

test('fingertip smoke starts as a thin strand before it unravels', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);

  assert.ok(fingertip.trailWidth <= 2.5);
  assert.ok(fingertip.trailAlpha >= 0.35);
  assert.ok(fingertip.strandiness >= 0.9);
  assert.ok(fingertip.unravel >= 0.85);
  assert.ok(fingertip.curlStrength >= 0.25);
});

test('fingertip smoke gains lateral spread aggressively as it rises', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);

  assert.ok(fingertip.spreadAccel >= 0.34);
  assert.ok(fingertip.unravel >= 0.9);
});

test('lateral spread recenters early smoke instead of forcing a V split', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const leftForce = getLateralSpreadForce(fingertip, {
    drift: 0,
    shear: 0,
    wobblePhase: 0,
    centerOffset: 12,
    lifeRatio: 0.16,
    step: 1,
  });
  const rightForce = getLateralSpreadForce(fingertip, {
    drift: 0,
    shear: 0,
    wobblePhase: 0,
    centerOffset: -12,
    lifeRatio: 0.16,
    step: 1,
  });

  assert.ok(leftForce > 0);
  assert.ok(rightForce < 0);
});

test('lateral spread can still wander left or right as smoke rises', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const wanderLeft = getLateralSpreadForce(fingertip, {
    drift: -0.7,
    shear: -0.2,
    wobblePhase: Math.PI * 1.5,
    centerOffset: 0,
    lifeRatio: 0.78,
    step: 1,
  });
  const wanderRight = getLateralSpreadForce(fingertip, {
    drift: 0.7,
    shear: 0.2,
    wobblePhase: Math.PI * 0.5,
    centerOffset: 0,
    lifeRatio: 0.78,
    step: 1,
  });

  assert.ok(wanderLeft < 0);
  assert.ok(wanderRight > 0);
});

test('fingertip smoke fades out earlier and faster than exhale smoke', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const exhale = getEmissionProfile(realisticMode, 'exhale-stream', 0.35);

  assert.ok(fingertip.fadeOutStart <= 0.42);
  assert.ok(fingertip.fadeOutPower >= 1.6);
  assert.ok(getParticleAlpha(fingertip, 1, 0.72) < 0.35);
  assert.ok(getParticleAlpha(exhale, 1, 0.72) > getParticleAlpha(fingertip, 1, 0.72));
});

test('fingertip render suppresses bright particle heads and favors a soft veil', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const fresh = getParticleRenderState(fingertip, 0.42, 0.12);
  const unraveled = getParticleRenderState(fingertip, 0.42, 0.48);

  assert.ok(fresh.spriteAlpha < fresh.veilAlpha);
  assert.ok(unraveled.spriteAlpha < 0.06);
  assert.ok(unraveled.veilAlpha > unraveled.spriteAlpha * 3);
  assert.ok(unraveled.veilScale > fresh.veilScale);
});

test('realistic fingertip smoke reads as edge-lit mist rather than chalky white particles', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const state = getParticleRenderState(fingertip, 0.42, 0.34);

  assert.ok(fingertip.trailSoftness >= 3);
  assert.ok(fingertip.lightOffsetX < 0);
  assert.ok(fingertip.lightOffsetY < 0);
  assert.ok(state.lightAlpha > state.spriteAlpha);
});

test('aged fingertip smoke diffuses instead of ending in a dense cap', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const mid = getParticleRenderState(fingertip, 0.34, 0.42);
  const late = getParticleRenderState(fingertip, 0.34, 0.84);

  assert.ok(late.veilScale > mid.veilScale);
  assert.ok(late.veilAlpha < mid.veilAlpha);
  assert.ok(late.lightAlpha < mid.lightAlpha);
});

test('fingertip smoke dissolves away as it climbs instead of surviving to the top of the frame', () => {
  const fingertip = getEmissionProfile(realisticMode, 'fingertip', 0);
  const exhale = getEmissionProfile(realisticMode, 'exhale-stream', 0.35);

  assert.ok(getAltitudeFade(fingertip, 80) > 0.85);
  assert.ok(getAltitudeFade(fingertip, 280) < 0.2);
  assert.ok(getAltitudeFade(exhale, 280) > getAltitudeFade(fingertip, 280));
});

test('ember profile is visible and becomes stronger while inhaling', () => {
  const fingertip = getEmberProfile(realisticMode, 'fingertip', 0.25);
  const inhaling = getEmberProfile(realisticMode, 'inhaling', 0.25);

  assert.equal(fingertip.visible, true);
  assert.ok(inhaling.coreAlpha > fingertip.coreAlpha);
  assert.ok(inhaling.haloRadius > fingertip.haloRadius);
});

test('exhale-burst has dense concentrated profile', () => {
  const profile = getEmissionProfile(null, 'exhale-burst', 0);
  assert.ok(profile.count >= 28, 'count should be >= 28, got ' + profile.count);
  assert.ok(profile.alphaMultiplier >= 1.2, 'alpha should be >= 1.2');
  assert.ok(profile.sizeMultiplier >= 1.3, 'size should be >= 1.3');
  assert.ok(profile.spreadX <= 36, 'spreadX should be tighter');
});

test('exhale-stream at progress=0 is close to burst density', () => {
  const burst = getEmissionProfile(null, 'exhale-burst', 0);
  const streamStart = getEmissionProfile(null, 'exhale-stream', 0);
  assert.ok(streamStart.count >= burst.count * 0.75, 'stream start count should be near burst');
  assert.ok(streamStart.alphaMultiplier >= burst.alphaMultiplier * 0.75, 'stream start alpha should be near burst');
});

test('exhale-stream fades out more smoothly in later phase', () => {
  // progress=0에서 stream 기본값 확인 (burst blend이 있으므로 0.3 이후가 stream 기본)
  const streamMid = getEmissionProfile(null, 'exhale-stream', 0.3);
  assert.ok(streamMid.fadeOutPower >= 1.3, 'fadeOutPower should be >= 1.3, got ' + streamMid.fadeOutPower);
  assert.ok(streamMid.fadeOutStart <= 0.5, 'fadeOutStart should be <= 0.5, got ' + streamMid.fadeOutStart);
});
