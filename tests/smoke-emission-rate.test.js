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
  assert.ok(lingeringBeforeIdle > 60, `expected a meaningful lingering cloud, got ${lingeringBeforeIdle}`);

  for (let frame = 0; frame < 180; frame++) {
    smokeSystem.update(ctx, 1000 / 60, null, { dormant: true });
  }

  assert.ok(
    smokeSystem.getActiveCount() < 20,
    `expected idle cleanup to nearly clear lingering smoke, got ${smokeSystem.getActiveCount()} active particles`
  );
});
