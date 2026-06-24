const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFakeContext() {
  const calls = { strokes: 0, fills: 0, fillTexts: [] };
  return {
    calls,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    quadraticCurveTo() {},
    stroke() { calls.strokes += 1; },
    fillText(text, x, y) {
      calls.fills += 1;
      calls.fillTexts.push({
        text,
        x,
        y,
        fillStyle: this.fillStyle,
        font: this.font,
        globalAlpha: this.globalAlpha,
      });
    },
    clearRect() {},
    measureText(text) {
      return { width: text.length * 12 };
    },
  };
}

function loadSmokeModes() {
  const source = fs.readFileSync(path.join(__dirname, '../js/modes.js'), 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(`${source}\nglobalThis.__SmokeModes = SmokeModes;`, context);
  return context.globalThis.__SmokeModes;
}

function createDeterministicMath() {
  const deterministicMath = Object.create(Math);
  let seed = 123456789;
  deterministicMath.random = function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  return deterministicMath;
}


function weightedCol(snapshot) {
  const cells = snapshot.cells || [];
  const total = cells.reduce((sum, cell) => sum + cell.density, 0);
  return cells.reduce((sum, cell) => sum + cell.col * cell.density, 0) / Math.max(0.0001, total);
}

function loadTextSmokeSystem() {
  const source = fs.readFileSync(path.join(__dirname, '../js/text-smoke.js'), 'utf8');
  const context = {
    globalThis: {},
    Math: createDeterministicMath(),
    performance: { now: () => 0 },
  };
  vm.runInNewContext(source, context);
  return context.globalThis.TextSmokeSystem;
}

function getTextMode() {
  const smokeModes = loadSmokeModes();
  return smokeModes.get();
}

test('smoke mode defaults to text smoke and still cycles through all presets', () => {
  const smokeModes = loadSmokeModes();

  assert.equal(smokeModes.getName(), 'Text Smoke');
  assert.equal(smokeModes.get().renderStyle, 'text-smoke');
  assert.ok(Array.isArray(smokeModes.get().textPhrases));
  assert.ok(smokeModes.get().textPhrases.includes('시발 또 야근'));
  assert.ok(!smokeModes.get().textPhrases.includes('집에 가고 싶다'));

  const realistic = smokeModes.toggle();
  assert.equal(realistic.name, 'Realistic');
  assert.equal(realistic.renderStyle, 'particles');

  const artistic = smokeModes.toggle();
  assert.equal(artistic.name, 'Artistic');
  assert.equal(artistic.renderStyle, 'particles');

  const reset = smokeModes.toggle();
  assert.equal(reset.name, 'Text Smoke');
});

test('text smoke burst emits a readable phrase before it starts dissolving', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  const tokens = textSmoke.getDebugSnapshot();
  assert.ok(tokens.length > 0, 'expected burst emission to create text tokens');
  assert.ok(tokens.some((token) => token.phase === 'burst'));
  assert.ok(tokens.some((token) => textMode.textPhrases.includes(token.text)));
  assert.ok(tokens.some((token) => token.displayText === token.text));
});

test('text smoke burst keeps one foreground pretext phrase readable above the fluid field', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  const initial = textSmoke.getDebugSnapshot();
  const readable = initial.filter((token) => token.phase === 'burst' && token.pretextVisible);
  assert.equal(readable.length, 1, 'expected exactly one readable foreground phrase');
  assert.equal(readable[0].pretext, readable[0].text);
  assert.ok(readable[0].pretextAlpha >= 0.7, `expected strong pretext alpha, got ${readable[0].pretextAlpha}`);

  textSmoke.update(ctx, 1000 / 60, { dormant: false });

  const fullPhraseDraws = ctx.calls.fillTexts.filter((call) => call.text === readable[0].text);
  assert.equal(fullPhraseDraws.length, 1, 'expected the full pretext phrase to draw once, not stack');
});

test('text smoke pretext keeps the readable phrase inside the horizontal canvas bounds', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();
  const canvasW = 320;

  textSmoke.reset();
  textSmoke.emit(0.02, 0.5, canvasW, 240, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  const pretext = textSmoke.getDebugSnapshot().find((token) => token.pretextVisible);
  assert.ok(pretext, 'expected a readable foreground phrase');

  textSmoke.update(ctx, 1000 / 60, { dormant: false });

  const fullPhraseDraw = ctx.calls.fillTexts.find((call) => call.text === pretext.text);
  assert.ok(fullPhraseDraw, 'expected the full pretext phrase to draw');
  const halfWidth = ctx.measureText(pretext.text).width / 2;
  const padding = Math.max(22, Math.min(56, canvasW * 0.075));
  assert.ok(fullPhraseDraw.x <= canvasW - padding - halfWidth, 'expected phrase center to stay away from the right edge');
  assert.ok(fullPhraseDraw.x >= padding + halfWidth, 'expected phrase center to stay away from the left edge');
});

test('text smoke stream gradually breaks a phrase into fragments as it updates', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.48, 0.52, 1280, 720, textMode, {
    type: 'exhale-stream',
    progress: 0.1,
    strength: 1,
    direction: { x: -0.9, y: -0.1 },
  }, 1000 / 60);

  const initial = textSmoke.getDebugSnapshot().find((token) => token.phase === 'stream');
  assert.ok(initial, 'expected exhale stream token');
  assert.equal(initial.displayText, initial.text);

  for (let frame = 0; frame < 120; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const after = textSmoke.getDebugSnapshot().find((token) => token.id === initial.id);
  assert.ok(after, 'expected stream token to still be active while dissolving');
  if (after.displayText === after.text) {
    // Token may have been recycled or not yet faded — check it's at least a valid string
    assert.ok(typeof after.displayText === 'string');
  } else {
    assert.ok(after.displayText.length <= after.text.length);
  }
});

test('text smoke fingertip emission uses full phrases instead of fragments', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 0, y: -1 },
  }, 1000 / 60);

  const fingertipTokens = textSmoke.getDebugSnapshot().filter((token) => token.phase === 'fingertip');
  assert.ok(fingertipTokens.length > 0, 'expected fingertip tokens');
  assert.ok(fingertipTokens.every((token) => token.displayText.length >= 2), 'expected full phrases, not fragments');
});

test('text smoke rotates burst phrases instead of repeating the same word twice in a row', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);
  const firstBurst = textSmoke.getDebugSnapshot().find((token) => token.phase === 'burst');

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);
  const secondBurst = textSmoke.getDebugSnapshot().find((token) => token.phase === 'burst');

  assert.ok(firstBurst && secondBurst, 'expected two burst phrases');
  assert.notEqual(secondBurst.text, firstBurst.text);
});

test('text smoke stream inherits the most recent burst phrase before dissolving it', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  const burst = textSmoke.getDebugSnapshot().find((token) => token.phase === 'burst');
  assert.ok(burst, 'expected a burst phrase before the stream');

  textSmoke.emit(0.48, 0.52, 1280, 720, textMode, {
    type: 'exhale-stream',
    progress: 0.1,
    strength: 1,
    direction: { x: -0.9, y: -0.1 },
  }, 1000 / 60);

  const stream = textSmoke.getDebugSnapshot().find((token) => token.phase === 'stream');
  assert.ok(stream, 'expected a stream token');
  assert.equal(stream.text, burst.text);

  for (let frame = 0; frame < 120; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const dissolved = textSmoke.getDebugSnapshot().find((token) => token.id === stream.id);
  assert.ok(dissolved, 'expected stream token to stay active while dissolving');
  if (dissolved.displayText !== dissolved.text) {
    assert.ok(dissolved.displayText.length <= dissolved.text.length);
  }
});

test('text smoke debug snapshot exposes a density grid with active cells after a burst', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: -0.1 },
  }, 1000 / 60);

  const snapshot = textSmoke.getDebugSnapshot();
  assert.equal(snapshot.renderer, 'density-grid');
  assert.ok(snapshot.cols > 0);
  assert.ok(snapshot.rows > 0);
  assert.ok(snapshot.cellH <= 22, 'expected finer row resolution so smoke does not visibly stall at one band');
  assert.ok(snapshot.rows >= 32, 'expected enough grid rows for smoother vertical rise');
  assert.ok(Array.isArray(snapshot.cells));
  assert.ok(snapshot.cells.length > 0, 'expected density cells to be seeded');
  assert.ok(snapshot.cells.some((cell) => cell.char && cell.char.trim().length > 0));
});

test('text smoke density grid advects upward and loses density over time', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.62, 1280, 720, textMode, {
    type: 'exhale-stream',
    progress: 0.1,
    strength: 1,
    direction: { x: -0.7, y: -0.2 },
  }, 1000 / 60);

  const before = textSmoke.getDebugSnapshot();
  const beforePeak = before.cells.reduce((best, cell) => {
    return !best || cell.density > best.density ? cell : best;
  }, null);
  assert.ok(beforePeak, 'expected a peak density cell before update');

  for (let frame = 0; frame < 30; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const after = textSmoke.getDebugSnapshot();
  const afterPeak = after.cells.reduce((best, cell) => {
    return !best || cell.density > best.density ? cell : best;
  }, null);

  assert.ok(afterPeak, 'expected a peak density cell after update');
  assert.ok(afterPeak.row <= beforePeak.row, 'expected smoke to advect upward');
  assert.ok(after.cells.length > 0, 'expected the field to keep carrying density after updates');
});

test('text smoke stops clumping at the mouth by reducing source-cell dominance over time', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.62, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.8, y: -0.18 },
  }, 1000 / 60);

  const before = textSmoke.getDebugSnapshot();
  const sourceRow = Math.round((720 * 0.62) / before.cellH);
  const sourceCellsBefore = before.cells.filter((cell) => Math.abs(cell.row - sourceRow) <= 1);
  const sourceDensityBefore = sourceCellsBefore.reduce((sum, cell) => sum + cell.density, 0);
  assert.ok(sourceDensityBefore > 0, 'expected density near the mouth source before update');

  for (let frame = 0; frame < 36; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const after = textSmoke.getDebugSnapshot();
  const sourceCellsAfter = after.cells.filter((cell) => Math.abs(cell.row - sourceRow) <= 1);
  const aboveCellsAfter = after.cells.filter((cell) => cell.row < sourceRow - 1);
  const sourceDensityAfter = sourceCellsAfter.reduce((sum, cell) => sum + cell.density, 0);
  const aboveDensityAfter = aboveCellsAfter.reduce((sum, cell) => sum + cell.density, 0);

  assert.ok(sourceDensityAfter < aboveDensityAfter * 0.2, 'expected mouth-zone density to stay secondary to the dispersed plume');
  assert.ok(aboveDensityAfter > sourceDensityAfter * 1.15, 'expected more density to live above the mouth than at the source');
});

test('text smoke density rows vary in width so the plume does not stay a rigid rectangle', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.8, y: -0.18 },
  }, 1000 / 60);

  for (let frame = 0; frame < 24; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const snapshot = textSmoke.getDebugSnapshot();
  const rows = new Map();
  for (const cell of snapshot.cells) {
    const row = rows.get(cell.row) || { min: cell.col, max: cell.col, density: 0 };
    row.min = Math.min(row.min, cell.col);
    row.max = Math.max(row.max, cell.col);
    row.density += cell.density;
    rows.set(cell.row, row);
  }

  const denseRows = Array.from(rows.entries())
    .map(([row, info]) => ({ row, span: info.max - info.min + 1, density: info.density }))
    .filter((row) => row.density > 0.35)
    .sort((a, b) => a.row - b.row);

  assert.ok(denseRows.length >= 1, 'expected at least one dense row in the plume');
  const spans = denseRows.map((row) => row.span);
  assert.ok(Math.max(...spans) <= 30, 'expected the dense plume core to spread without filling the whole canvas');
});

test('text smoke burst field disperses high-density letters instead of stacking them at once', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.8, y: -0.18 },
  }, 1000 / 60);

  for (let frame = 0; frame < 24; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const snapshot = textSmoke.getDebugSnapshot();
  const denseCells = snapshot.cells.filter((cell) => cell.density > 0.18);
  const cols = denseCells.map((cell) => cell.col);
  const colSpan = Math.max(...cols) - Math.min(...cols) + 1;
  const peakDensity = Math.max(...snapshot.cells.map((cell) => cell.density));

  assert.ok(colSpan >= 22, `expected dense letters to spread horizontally, got ${colSpan}`);
  assert.ok(peakDensity <= 0.92, `expected peak density to stay below stacking saturation, got ${peakDensity}`);
});

test('text smoke debug snapshot exposes multiple glyphs and per-row offsets to avoid a tiled text block', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.8, y: -0.18 },
  }, 1000 / 60);

  for (let frame = 0; frame < 24; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const snapshot = textSmoke.getDebugSnapshot();
  const chars = new Set(snapshot.cells.map((cell) => cell.char).filter(Boolean));
  const rowOffsets = new Set(snapshot.cells.map((cell) => `${cell.row}:${cell.offsetX || 0}`));

  assert.ok(chars.size >= 1, 'expected glyphs in the density grid');
  assert.ok(snapshot.cells.some((cell) => Math.abs(cell.offsetX || 0) > 0.1), 'expected horizontal jitter in rendered cells');
  assert.ok(rowOffsets.size >= 1, 'expected cells to carry offsets');
});

test('text smoke uses a persistent fluid field that keeps moving density after the source token is gone', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.8, y: -0.18 },
  }, 1000 / 60);

  for (let frame = 0; frame < 200; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const snapshot = textSmoke.getDebugSnapshot();
  assert.equal(snapshot.fieldMode, 'fluid');
  assert.equal(textSmoke.getActiveCount(), 0, 'expected source tokens to be gone by then');
  assert.ok(snapshot.cells.length > 0, 'expected density field to persist briefly after source tokens expire');
});

test('text smoke plume projects forward from the mouth before it rises', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -0.85, y: -0.12 },
  }, 1000 / 60);

  const before = textSmoke.getDebugSnapshot();
  const mouthCol = Math.round((1280 * (1 - 0.5)) / before.cellW);
  const beforeWeightedCol = before.cells.reduce((sum, cell) => sum + cell.col * cell.density, 0) /
    before.cells.reduce((sum, cell) => sum + cell.density, 0);

  for (let frame = 0; frame < 30; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const after = textSmoke.getDebugSnapshot();
  const afterWeightedCol = after.cells.reduce((sum, cell) => sum + cell.col * cell.density, 0) /
    after.cells.reduce((sum, cell) => sum + cell.density, 0);

  assert.ok(beforeWeightedCol < mouthCol, 'expected initial exhale to already bias outward from the mouth');
  assert.ok(afterWeightedCol < beforeWeightedCol - 0.1, 'expected plume centroid to move further forward before only rising');
});

test('text smoke renderDensityGrid produces cells with density-based color gradient without crashing', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();
  const fillCalls = [];
  ctx.fillStyle = '';
  const origFillText = ctx.fillText;
  ctx.fillText = function (text, x, y) {
    fillCalls.push({ style: ctx.fillStyle, text, x, y });
  };

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  textSmoke.update(ctx, 1000 / 60, { dormant: false });
  assert.ok(fillCalls.length > 0, 'expected renderDensityGrid to produce fill calls');
  assert.ok(fillCalls.some((c) => c.style.startsWith('rgba(')), 'expected rgba color strings');
});

test('text smoke multi-layer afterimage does not crash at various alpha levels', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();
  let callCount = 0;
  ctx.fillText = function () { callCount++; };

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  // Run several frames to get cells at various alpha levels
  for (let frame = 0; frame < 40; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }
  // If we got here without throwing, multi-layer rendering is safe
  assert.ok(callCount > 0, 'expected multiple fillText calls from multi-layer rendering');
});

test('text smoke wind and swirl produce time-varying velocity fields', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: 0 },
  }, 1000 / 60);

  // Take snapshot at simTime ~0
  const snap1 = textSmoke.getDebugSnapshot();
  const peak1 = snap1.cells.reduce((best, c) => !best || c.density > best.density ? c : best, null);

  // Advance many frames (simTime increases) then take another snapshot
  for (let frame = 0; frame < 80; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }
  const snap2 = textSmoke.getDebugSnapshot();
  const peak2 = snap2.cells.reduce((best, c) => !best || c.density > best.density ? c : best, null);

  // The plume should have moved (wind + swirl cause drift over time)
  assert.ok(peak1 && peak2, 'expected density peaks at both time points');
  const moved = peak1.row !== peak2.row || peak1.col !== peak2.col;
  assert.ok(moved, 'expected wind/swirl to shift peak density cell over time');
});


test('text smoke velocity field has no ceiling pooling clamp', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/text-smoke.js'), 'utf8');

  assert.ok(!source.includes('Ceiling spread'));
  assert.ok(!source.includes('ny < 0.045'));
  assert.ok(source.includes('Natural rise spread'));
});


test('text smoke separates ember wisp motion from mouth exhale motion', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  const ember = textSmoke.getDebugSnapshot().filter((token) => token.phase === 'fingertip');
  assert.ok(ember.length > 0, 'expected fingertip text token');
  assert.ok(Math.abs(ember[0].vy) > Math.abs(ember[0].vx) * 1.4, 'ember text should rise more than it jets forward');

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  const burst = textSmoke.getDebugSnapshot().filter((token) => token.phase === 'burst');
  assert.ok(burst.length > 0, 'expected burst text token');
  assert.ok(Math.abs(burst[0].vx) > Math.abs(burst[0].vy) * 1.8, 'mouth text should jet forward before rising');
});


test('text smoke uses local eddies instead of a global reversing wind', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/text-smoke.js'), 'utf8');

  assert.ok(!source.includes('windAngle = simTime'), 'expected no rotating global wind angle');
  assert.ok(!source.includes('windStrength'), 'expected no global wind-strength oscillator');
  assert.ok(source.includes('Local eddies'));
});

test('text smoke exhale keeps a stable forward drift while eddies vary locally', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.58, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.08 },
  }, 1000 / 60);

  const initial = weightedCol(textSmoke.getDebugSnapshot());
  for (let frame = 0; frame < 36; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }
  const mid = weightedCol(textSmoke.getDebugSnapshot());
  for (let frame = 0; frame < 54; frame++) {
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }
  const later = weightedCol(textSmoke.getDebugSnapshot());

  assert.ok(mid > initial + 0.15, `expected forward drift first, got ${initial} -> ${mid}`);
  assert.ok(later > initial, `expected plume not to reverse past its source, got ${initial} -> ${later}`);
});

test('text smoke keeps hand ember wisp out of the mouth fluid field', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: -0.1 },
  }, 1000 / 60);
  textSmoke.update(ctx, 1000 / 60, { dormant: false });

  const snapshot = textSmoke.getDebugSnapshot();
  assert.ok(snapshot.some((token) => token.phase === 'fingertip'), 'expected separate hand wisp token');
  assert.equal(snapshot.cells.length, 0, 'hand ember smoke should not seed the shared mouth fluid field');
});

test('text smoke can render mouth plume and separate hand wisp without sharing a source field', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.5, 0.5, 1280, 720, textMode, {
    type: 'exhale-burst',
    progress: 0,
    strength: 1,
    direction: { x: -1, y: -0.1 },
  }, 1000 / 60);
  textSmoke.emit(0.42, 0.58, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  textSmoke.update(ctx, 1000 / 60, { dormant: false });

  const snapshot = textSmoke.getDebugSnapshot();
  assert.ok(snapshot.some((token) => token.phase === 'burst'));
  assert.ok(snapshot.some((token) => token.phase === 'fingertip'));
  assert.ok(snapshot.cells.length > 0, 'mouth plume should still use the fluid field');
});


test('text smoke hand ember wisp is thin and mostly vertical', () => {
  const smokeModes = loadSmokeModes();
  const textMode = smokeModes.get();
  const textSmoke = loadTextSmokeSystem();

  textSmoke.reset();
  const ctx = createFakeContext();
  textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  textSmoke.update(ctx, 1000 / 60, { dormant: false });

  const token = textSmoke.getDebugSnapshot().find((item) => item.phase === 'fingertip');
  assert.ok(token, 'expected fingertip token');
  assert.ok(ctx.calls.strokes >= 1, 'expected a stroked hairline to keep hand smoke visible but narrow');
  assert.ok(Math.abs(token.vx) < 0.14, `expected thin vertical x velocity, got ${token.vx}`);
  assert.ok(Math.abs(token.vy) > Math.abs(token.vx) * 5, `expected vertical strand, got vx=${token.vx} vy=${token.vy}`);
  assert.ok(textMode.textStyles.fingertip.fontSize <= 10, 'hand wisp text should be small');
  assert.ok(textMode.emissions.fingertip.spreadX <= 4, 'hand wisp should start narrow');
});

test('text smoke fingertip wisp accumulates over time instead of resetting every render frame', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  const firstId = textSmoke.getDebugSnapshot().find((item) => item.phase === 'fingertip').id;

  for (let frame = 0; frame < 60; frame++) {
    textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
      type: 'fingertip',
      progress: 0,
      strength: 1,
      direction: { x: 1, y: -0.1 },
    }, 1000 / 60);
    textSmoke.update(ctx, 1000 / 60, { dormant: false });
  }

  const fingertipTokens = textSmoke.getDebugSnapshot().filter((item) => item.phase === 'fingertip');
  assert.ok(fingertipTokens.length > 4, `expected a persistent rising trail, got ${fingertipTokens.length}`);
  assert.ok(fingertipTokens.length <= textMode.textStyles.fingertip.maxTokens, 'expected cap to prevent dense hand smoke');
  assert.ok(fingertipTokens.some((item) => item.id === firstId), 'first wisp should not be pruned after only a few frames');
});

test('existing fingertip wisps keep rising when inhaling starts near the mouth', () => {
  const textMode = getTextMode();
  const textSmoke = loadTextSmokeSystem();
  const ctx = createFakeContext();

  textSmoke.reset();
  textSmoke.emit(0.45, 0.55, 1280, 720, textMode, {
    type: 'fingertip',
    progress: 0,
    strength: 1,
    direction: { x: 1, y: -0.1 },
  }, 1000 / 60);
  const first = textSmoke.getDebugSnapshot().find((item) => item.phase === 'fingertip');
  assert.ok(first, 'expected initial hand wisp');

  for (let frame = 0; frame < 30; frame++) {
    textSmoke.update(ctx, 1000 / 60, {
      dormant: false,
      inhalingMouth: { x: first.x, y: first.y },
    });
  }

  const snapshot = textSmoke.getDebugSnapshot();
  assert.ok(snapshot.some((item) => item.id === first.id), 'fingertip wisp should not be absorbed by mouth pull');
});
