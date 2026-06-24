const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFakeGradient() {
  return {
    addColorStop() {},
  };
}

function createFakeContext() {
  return {
    createRadialGradient() {
      return createFakeGradient();
    },
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    quadraticCurveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
    drawImage() {},
    clearRect() {},
    fillText() {},
  };
}

function loadSmokeModes() {
  const source = fs.readFileSync(path.join(__dirname, '../js/modes.js'), 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(`${source}\nglobalThis.__SmokeModes = SmokeModes;`, context);
  return context.globalThis.__SmokeModes;
}

function loadSmokeSystem() {
  const source = fs.readFileSync(path.join(__dirname, '../js/smoke.js'), 'utf8');
  const context = {
    globalThis: {},
    Math,
    SmokeCore: require('../js/smoke-core.js'),
    document: {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext() {
            return createFakeContext();
          },
        };
      },
    },
  };

  vm.runInNewContext(`${source}\nglobalThis.__SmokeSystem = SmokeSystem;`, context);
  return context.globalThis.__SmokeSystem;
}



function avgAbs(items, key) {
  return items.reduce((sum, item) => sum + Math.abs(item[key]), 0) / Math.max(1, items.length);
}

function getRealisticMode() {
  const smokeModes = loadSmokeModes();
  return smokeModes.get().name === 'Realistic' ? smokeModes.get() : smokeModes.toggle();
}

test('continuous fingertip emission respects emitRate instead of filling the particle cap in a second', () => {
  const smokeSystem = loadSmokeSystem();
  const realistic = getRealisticMode();

  for (let frame = 0; frame < 60; frame++) {
    smokeSystem.emit(
      0.5,
      0.5,
      1280,
      720,
      realistic,
      { type: 'fingertip', progress: 0, strength: 1 },
      1000 / 60
    );
  }

  assert.ok(
    smokeSystem.getActiveCount() < 260,
    `expected rate-limited emission, got ${smokeSystem.getActiveCount()} active particles`
  );
});

test('idle smoke cleanup drains lingering particles instead of keeping the active count stuck', () => {
  const smokeSystem = loadSmokeSystem();
  const realistic = getRealisticMode();
  const ctx = createFakeContext();

  for (let frame = 0; frame < 60; frame++) {
    smokeSystem.emit(
      0.5,
      0.5,
      1280,
      720,
      realistic,
      { type: 'fingertip', progress: 0, strength: 1 },
      1000 / 60
    );
  }

  const lingeringBeforeIdle = smokeSystem.getActiveCount();
  assert.ok(lingeringBeforeIdle > 24, `expected a subtle but visible ember wisp, got ${lingeringBeforeIdle}`);

  for (let frame = 0; frame < 180; frame++) {
    smokeSystem.update(ctx, 1000 / 60, null, { dormant: true });
  }

  assert.ok(
    smokeSystem.getActiveCount() < 20,
    `expected idle cleanup to nearly clear lingering smoke, got ${smokeSystem.getActiveCount()} active particles`
  );
});


test('particle smoke separates ember wisp motion from mouth exhale jet', () => {
  const smokeSystem = loadSmokeSystem();
  const realistic = getRealisticMode();

  smokeSystem.emit(
    0.5,
    0.5,
    1280,
    720,
    realistic,
    { type: 'fingertip', progress: 0, strength: 1 },
    1000
  );
  const ember = smokeSystem.getDebugSnapshot();
  assert.ok(ember.length > 0, 'expected ember particles');
  assert.ok(avgAbs(ember, 'vy') > avgAbs(ember, 'vx') * 2.4, 'ember should mostly rise in place');

  smokeSystem.reset();
  smokeSystem.emit(
    0.5,
    0.5,
    1280,
    720,
    realistic,
    { type: 'exhale-burst', progress: 0, strength: 1, direction: { x: 1, y: -0.1 } },
    1000
  );
  const exhale = smokeSystem.getDebugSnapshot();
  assert.ok(exhale.length > 0, 'expected exhale particles');
  assert.ok(avgAbs(exhale, 'vx') > avgAbs(exhale, 'vy') * 1.8, 'mouth exhale should project forward before rising while ember stays vertical');
});


test('particle exhale turbulence does not recenter the mouth jet like reversing wind', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/smoke.js'), 'utf8');

  assert.ok(source.includes('isExhaleParticle ? 0 : p.originX - p.x'));
});
