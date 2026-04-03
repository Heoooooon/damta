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

test('realistic mode is configured dense enough to visibly increase smoke volume', () => {
  const realistic = getRealisticMode();

  assert.ok(realistic.maxParticles >= 4300);
  assert.ok(realistic.emissions.fingertip.count >= 16);
  assert.ok(realistic.emissions.exhaleBurst.count >= 136);
  assert.ok(realistic.emissions.exhaleStream.count >= 80);
});

test('realistic mode keeps smoke alive longer before hard deletion', () => {
  const realistic = getRealisticMode();

  assert.ok(realistic.lifetime.min >= 8000);
  assert.ok(realistic.lifetime.max >= 15000);
  assert.ok(realistic.emissions.fingertip.lifeMultiplier >= 2.1);
  assert.ok(realistic.emissions.exhaleBurst.lifeMultiplier >= 1.95);
  assert.ok(realistic.emissions.exhaleStream.lifeMultiplier >= 1.75);
});

test('realistic mode lets smoke climb higher before it dissolves away', () => {
  const realistic = getRealisticMode();
  const fingertip = realistic.emissions.fingertip;
  const exhaleStream = realistic.emissions.exhaleStream;

  assert.ok(fingertip.velocityY.min <= -1.45);
  assert.ok(fingertip.riseAccel >= 0.0034);
  assert.ok(fingertip.dissolveStartDistance >= 520);
  assert.ok(fingertip.dissolveEndDistance >= 1200);
  assert.ok(exhaleStream.dissolveStartDistance >= 560);
  assert.ok(exhaleStream.dissolveEndDistance >= 1250);
});

test('realistic fingertip smoke stays visibly readable near the ember', () => {
  const realistic = getRealisticMode();
  const fingertip = getEmissionProfile(realistic, 'fingertip', 0);
  const particleAlpha = getParticleAlpha(
    fingertip,
    realistic.maxAlpha * fingertip.alphaMultiplier,
    0.22
  );
  const renderState = getParticleRenderState(fingertip, particleAlpha, 0.22);

  assert.ok(renderState.veilAlpha >= 0.05);
  assert.ok(renderState.spriteAlpha >= 0.015);
});

test('smoke renderer hard cap does not choke the denser realistic mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/smoke.js'), 'utf8');
  const match = source.match(/const MAX_PARTICLES = (\d+);/);

  assert.ok(match, 'MAX_PARTICLES constant should exist');
  assert.ok(Number(match[1]) >= 4300);
});
