const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  getEmissionProfile,
  getParticleAlpha,
  getParticleRenderState,
} = require('../js/smoke-core.js');

function loadSmokeModes() {
  const source = fs.readFileSync(path.join(__dirname, '../js/modes.js'), 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(`${source}\nglobalThis.__SmokeModes = SmokeModes;`, context);
  return context.globalThis.__SmokeModes;
}

function getRealisticMode() {
  const smokeModes = loadSmokeModes();
  return smokeModes.get().name === 'Realistic' ? smokeModes.get() : smokeModes.toggle();
}

test('realistic mode keeps ember smoke subtle while exhale remains dense', () => {
  const realistic = getRealisticMode();

  assert.ok(realistic.maxParticles >= 4300);
  assert.ok(realistic.emissions.fingertip.count <= 4);
  assert.ok(realistic.emissions.fingertip.alphaMultiplier <= 0.55);
  assert.ok(realistic.emissions.exhaleBurst.count >= 100);
  assert.ok(realistic.emissions.exhaleStream.count >= 60);
});

test('realistic mode keeps smoke alive longer before hard deletion', () => {
  const realistic = getRealisticMode();

  assert.ok(realistic.lifetime.min >= 8000);
  assert.ok(realistic.lifetime.max >= 15000);
  assert.ok(realistic.emissions.fingertip.lifeMultiplier <= 1.35);
  assert.ok(realistic.emissions.exhaleBurst.lifeMultiplier >= 1.75);
  assert.ok(realistic.emissions.exhaleStream.lifeMultiplier >= 1.65);
});

test('realistic mode lets exhale smoke climb while ember smoke dissolves early', () => {
  const realistic = getRealisticMode();
  const fingertip = realistic.emissions.fingertip;
  const exhaleStream = realistic.emissions.exhaleStream;

  assert.ok(fingertip.velocityY.min <= -1.45);
  assert.ok(fingertip.riseAccel <= 0.003);
  assert.ok(fingertip.dissolveStartDistance <= 140);
  assert.ok(fingertip.dissolveEndDistance <= 420);
  assert.ok(exhaleStream.dissolveStartDistance >= 620);
  assert.ok(exhaleStream.dissolveEndDistance >= 1400);
  assert.ok(exhaleStream.riseAccel >= 0.0038);
  assert.ok(exhaleStream.spreadAccel >= 0.4);
  assert.ok(exhaleStream.alphaMultiplier <= 0.8);
});

test('realistic fingertip smoke stays subtle but readable near the ember', () => {
  const realistic = getRealisticMode();
  const fingertip = getEmissionProfile(realistic, 'fingertip', 0);
  const particleAlpha = getParticleAlpha(
    fingertip,
    realistic.maxAlpha * fingertip.alphaMultiplier,
    0.22
  );
  const renderState = getParticleRenderState(fingertip, particleAlpha, 0.22);

  assert.ok(renderState.veilAlpha >= 0.02);
  assert.ok(renderState.spriteAlpha >= 0.006);
  assert.ok(renderState.spriteAlpha < renderState.veilAlpha);
});

test('smoke renderer hard cap does not choke the denser realistic mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/smoke.js'), 'utf8');
  const match = source.match(/const MAX_PARTICLES = (\d+);/);

  assert.ok(match, 'MAX_PARTICLES constant should exist');
  assert.ok(Number(match[1]) >= 4300);
});


test('realistic fingertip smoke is configured as a thin vertical strand', () => {
  const realistic = getRealisticMode();
  const fingertip = realistic.emissions.fingertip;

  assert.ok(fingertip.spreadX <= 2.2);
  assert.ok(fingertip.velocityX <= 0.08);
  assert.ok(fingertip.trailWidth <= 1.25);
  assert.ok(fingertip.turbulence <= 0.16);
  assert.ok(fingertip.spreadAccel <= 0.1);
  assert.ok(Math.abs(fingertip.velocityY.min) > fingertip.velocityX * 14);
});
