(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.TextSmokeSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const active = [];
  let nextId = 1;
  let phraseCursor = 0;
  let fragmentCursor = 0;
  let lastBurstPhrase = null;
  let lastCanvasW = 1280;
  let lastCanvasH = 720;
  let simTime = 0;
  let field = null;
  let flowBiasX = 0;
  let flowBiasY = 0;
  let renderQualityScale = 1;
  const emitBudgets = Object.create(null);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function mapEmissionType(type) {
    if (type === 'exhale-burst') return 'burst';
    if (type === 'exhale-stream') return 'stream';
    if (type === 'fingertip') return 'fingertip';
    return 'inhaling';
  }

  function getStyle(mode, phase) {
    const styles = mode && mode.textStyles ? mode.textStyles : {};
    return styles[phase] || styles.stream || { fontSize: 20, alpha: 0.4, maxTokens: 16 };
  }

  function nextPhrase(mode, options) {
    const phrases = mode && Array.isArray(mode.textPhrases) && mode.textPhrases.length
      ? mode.textPhrases
      : ['스트레스'];
    const reuseLatest = !!(options && options.reuseLatest) && lastBurstPhrase;
    if (reuseLatest) return lastBurstPhrase;

    let phrase = phrases[phraseCursor % phrases.length];
    phraseCursor += 1;
    if (phrases.length > 1 && phrase === lastBurstPhrase) {
      phrase = phrases[phraseCursor % phrases.length];
      phraseCursor += 1;
    }
    if (!options || options.remember !== false) {
      lastBurstPhrase = phrase;
    }
    return phrase;
  }

  function nextFragment(mode, phraseHint) {
    if (phraseHint) {
      return phraseHint;
    }
    return nextPhrase(mode, { remember: false });
  }

  function decomposeText(text, lifeRatio) {
    const chars = Array.from(text || '');
    if (chars.length <= 1) return text;
    if (lifeRatio < 0.2) return text;
    if (lifeRatio >= 0.85) return '';
    const fadeStart = 0.2;
    const fadeEnd = 0.85;
    const fadeT = (lifeRatio - fadeStart) / (fadeEnd - fadeStart);
    const keepCount = Math.max(1, Math.ceil(chars.length * (1 - fadeT * fadeT)));
    return chars.slice(0, keepCount).join('');
  }

  function enforcePhaseCap(mode, phase) {
    const maxTokens = getStyle(mode, phase).maxTokens;
    let count = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].phase !== phase) continue;
      count += 1;
      if (count > maxTokens) {
        active.splice(i, 1);
      }
    }
  }

  function getActivePhaseCount(phase) {
    let count = 0;
    for (let i = 0; i < active.length; i++) {
      if (active[i].phase === phase) count += 1;
    }
    return count;
  }

  function getEmissionProfile(mode, phase) {
    if (!mode || !mode.emissions) return null;
    if (phase === 'burst') return mode.emissions.exhaleBurst;
    if (phase === 'stream') return mode.emissions.exhaleStream;
    return mode.emissions.fingertip;
  }

  function getEmissionBudgetKey(mode, phase) {
    return (mode && mode.name ? mode.name : 'mode') + ':' + phase;
  }

  function getEmissionCount(mode, phase, strength, dt) {
    const profile = getEmissionProfile(mode, phase) || {};
    const baseCount = Math.max(1, profile.count || (phase === 'burst' ? 2 : 1));
    if (isFieldPhase(phase)) return phase === 'burst' ? Math.max(2, baseCount) : baseCount;

    const frameDt = Math.max(1, dt == null ? 16.6667 : dt);
    const emitRate = Math.max(
      0.01,
      profile.emitRate != null
        ? profile.emitRate
        : mode && mode.emitRate != null
          ? mode.emitRate
          : 8
    );
    const key = getEmissionBudgetKey(mode, phase);
    const currentBudget = emitBudgets[key] == null ? baseCount : emitBudgets[key];
    const nextBudget = Math.min(
      baseCount * Math.max(1, emitRate * 0.5),
      currentBudget + baseCount * emitRate * (frameDt / 1000) * (strength || 1)
    );
    let count = Math.floor(nextBudget);
    emitBudgets[key] = nextBudget - count;

    if (!count && getActivePhaseCount(phase) === 0) {
      count = 1;
    }
    return count;
  }

  function getTokenText(mode, phase, phraseOverride) {
    if (phraseOverride) return phraseOverride;
    if (phase === 'burst') return nextPhrase(mode, { remember: true });
    if (phase === 'stream') return nextPhrase(mode, { reuseLatest: true, remember: false });
    return nextPhrase(mode, { reuseLatest: true, remember: false });
  }

  function createToken(mode, phase, x, y, direction, strength, phraseOverride) {
    const style = getStyle(mode, phase);
    const text = getTokenText(mode, phase, phraseOverride);
    let dirX = direction && typeof direction.x === 'number' ? direction.x : -0.8;
    let dirY = direction && typeof direction.y === 'number' ? direction.y : -0.2;
    if (phase === 'fingertip') {
      dirX = 0;
      dirY = -1;
    } else if (phase === 'burst' || phase === 'stream') {
      dirX = dirX < 0 ? -1 : 1;
      dirY = -0.08;
    }
    const scale = clamp(strength || 1, 0.6, 1.8);
    const spreadX = phase === 'burst' ? 30 : phase === 'stream' ? 22 : phase === 'inhaling' ? 8 : 7;
    const spreadY = phase === 'burst' ? 16 : phase === 'stream' ? 14 : phase === 'inhaling' ? 6 : 5;
    const driftX = phase === 'fingertip'
      ? randomBetween(-0.025, 0.025)
      : phase === 'burst'
        ? randomBetween(-0.18, 0.18)
        : randomBetween(-0.12, 0.12);
    const driftY = phase === 'fingertip'
      ? randomBetween(-0.48, -0.16)
      : phase === 'burst'
        ? randomBetween(-0.5, -0.15)
        : randomBetween(-0.3, -0.08);

    return {
      id: nextId++,
      mode: mode,
      phase: phase,
      text: text,
      displayText: text,
      x: x + randomBetween(-spreadX, spreadX),
      y: y + randomBetween(-spreadY, spreadY),
      vx: dirX * randomBetween(
        phase === 'burst' ? 0.48 : phase === 'stream' ? 0.36 : 0.03,
        phase === 'burst' ? 0.95 : phase === 'stream' ? 0.74 : 0.11
      ) * scale + driftX,
      vy: dirY * randomBetween(
        phase === 'burst' ? 0.1 : phase === 'stream' ? 0.08 : 0.22,
        phase === 'burst' ? 0.42 : phase === 'stream' ? 0.34 : 0.58
      ) * scale + driftY,
      baseAlpha: style.alpha,
      size: style.fontSize * randomBetween(0.85, 1.15),
      sizeGrow: phase === 'burst' ? 0.012 : phase === 'stream' ? 0.008 : 0.006,
      rotation: randomBetween(-0.12, 0.12),
      spin: randomBetween(-0.003, 0.003),
      life: 0,
      maxLife: randomBetween(
        phase === 'burst' ? 2400 : phase === 'stream' ? 3600 : 1600,
        phase === 'burst' ? 3200 : phase === 'stream' ? 4800 : 2400
      ),
    };
  }

  function updateDisplayText(token, inMouth) {
    const lifeRatio = token.life / token.maxLife;
    if (token.phase === 'stream') {
      token.displayText = decomposeText(token.text, lifeRatio);
      return;
    }
    if (token.phase === 'burst') {
      token.displayText = lifeRatio < 0.32
        ? token.text
        : decomposeText(token.text, clamp((lifeRatio - 0.32) / 0.68, 0, 1));
      return;
    }
    if (token.phase === 'inhaling' && inMouth) {
      token.displayText = decomposeText(token.text, lifeRatio);
      return;
    }
    token.displayText = token.text;
  }

  function getPhaseLift(phase) {
    if (phase === 'fingertip') return 0.028;
    if (phase === 'burst') return 0.018;
    if (phase === 'stream') return 0.014;
    return 0.014;
  }

  function getPhaseFade(token, lifeRatio) {
    if (token.phase === 'burst') {
      if (lifeRatio < 0.12) return 0.58 + lifeRatio * 3.2;
      return 1 - Math.max(0, (lifeRatio - 0.18) / 0.82);
    }
    if (token.phase === 'stream') {
      return 1 - Math.max(0, (lifeRatio - 0.08) / 0.92);
    }
    return 1 - lifeRatio;
  }

  function getPretextAlpha(token) {
    if (!token.pretextVisible) return 0;
    const hold = token.pretextHold || 680;
    const fade = token.pretextFade || 520;
    const age = token.life || 0;
    const timeAlpha = age <= hold
      ? 1
      : clamp(1 - (age - hold) / Math.max(1, fade), 0, 1);
    const edgeMargin = Math.max(120, lastCanvasW * 0.12);
    const edgeAlpha = clamp(
      Math.min(token.x / edgeMargin, (lastCanvasW - token.x) / edgeMargin),
      0,
      1
    );
    return clamp(timeAlpha * edgeAlpha, 0, 1);
  }

  function shouldInjectFieldToken(token) {
    return !token.pretextVisible || token.life >= (token.fieldDelay || 0);
  }

  function getGridConfig(mode) {
    const fontSize = getStyle(mode || {}, 'stream').fontSize || 21;
    const resolutionScale = renderQualityScale < 0.75 ? 1.28 : renderQualityScale < 0.9 ? 1.12 : 1;
    const cellW = Math.max(12, Math.round(fontSize * 0.72 * resolutionScale));
    const cellH = Math.max(16, Math.round(fontSize * 0.96 * resolutionScale));
    const cols = Math.max(28, Math.round(lastCanvasW / cellW));
    const rows = Math.max(20, Math.round(lastCanvasH / cellH));
    return { cellW, cellH, cols, rows };
  }

  function ensureField(mode) {
    const config = getGridConfig(mode);
    const size = config.cols * config.rows;
    if (
      !field ||
      field.cols !== config.cols ||
      field.rows !== config.rows
    ) {
      field = {
        cols: config.cols,
        rows: config.rows,
        cellW: config.cellW,
        cellH: config.cellH,
        fontFamily: mode && mode.textFontFamily ? mode.textFontFamily : 'sans-serif',
        density: new Float32Array(size),
        tempDensity: new Float32Array(size),
        charCodes: new Uint32Array(size),
        tempCharCodes: new Uint32Array(size),
        charStrength: new Float32Array(size),
        tempCharStrength: new Float32Array(size),
      };
    } else {
      field.cellW = config.cellW;
      field.cellH = config.cellH;
      field.fontFamily = mode && mode.textFontFamily ? mode.textFontFamily : 'sans-serif';
    }
    return field;
  }

  function cellIndex(cols, row, col) {
    return row * cols + col;
  }

  function setFieldCell(row, col, amount, ch, densityCap) {
    if (!field) return;
    if (row < 0 || col < 0 || row >= field.rows || col >= field.cols || amount <= 0) return;
    const idx = cellIndex(field.cols, row, col);
    field.density[idx] = Math.min(densityCap == null ? 1 : densityCap, field.density[idx] + amount);
    if (ch) {
      const code = ch.codePointAt(0);
      if (amount >= field.charStrength[idx]) {
        field.charCodes[idx] = code;
        field.charStrength[idx] = amount;
      }
    }
  }

  function dampFieldCell(row, col, multiplier) {
    if (!field) return;
    if (row < 0 || col < 0 || row >= field.rows || col >= field.cols) return;
    const idx = cellIndex(field.cols, row, col);
    field.density[idx] *= multiplier;
    field.charStrength[idx] *= multiplier;
  }

  function injectTokenIntoField(token) {
    const text = Array.from(token.displayText || token.text || '');
    if (!text.length || !field) return;
    const lifeRatio = token.life / token.maxLife;
    const densityScale = token.fieldDensityScale != null ? token.fieldDensityScale : 1;
    const baseDensity = clamp(token.baseAlpha * getPhaseFade(token, lifeRatio) * densityScale, 0.02, 0.92);
    const densityCap = token.fieldDensityCap || 1;
    const sourceSuppress = token.phase === 'burst' || token.phase === 'stream'
      ? clamp(1 - lifeRatio * 3.1, 0.06, 1)
      : 1;
    const centerCol = clamp(Math.round(token.x / field.cellW), 0, field.cols - 1);
    const centerRow = clamp(Math.round(token.y / field.cellH), 0, field.rows - 1);
    const radius = token.phase === 'burst' ? 2 : token.phase === 'stream' ? 2 : 1;
    const scatterCols = token.fieldScatterCols || 0;
    const scatterRows = token.fieldScatterRows || 0;
    const upwardBiasRows = token.phase === 'burst'
      ? 3 + Math.min(4, Math.round(lifeRatio * 4))
      : token.phase === 'stream'
        ? 2 + Math.min(3, Math.round(lifeRatio * 3))
        : 0;
    const forwardBiasCols = token.phase === 'burst'
      ? 2 + Math.min(3, Math.round((1 - lifeRatio) * 3))
      : token.phase === 'stream'
        ? 1 + Math.min(2, Math.round((1 - lifeRatio) * 2))
        : 0;
    const dirColStep = token.vx >= 0 ? 1 : -1;
    const startCol = centerCol - Math.floor((text.length - 1) / 2) + dirColStep * forwardBiasCols;
    const plumeWave = Math.sin(token.id * 0.91 + lifeRatio * 6.4);

    if (token.phase === 'burst' || token.phase === 'stream') {
      const clearMultiplier = clamp(0.74 + lifeRatio * 0.18, 0.74, 0.96);
      for (let rowOffset = -1; rowOffset <= 3; rowOffset++) {
        for (let colOffset = -2 - scatterCols; colOffset <= text.length + 1 + scatterCols; colOffset++) {
          dampFieldCell(centerRow + rowOffset, startCol + colOffset, clearMultiplier);
        }
      }
    }

    for (let charIndex = 0; charIndex < text.length; charIndex++) {
      const ch = text[charIndex];
      if (!ch.trim()) continue;
      const scatterSeed = token.id * 1.73 + charIndex * 2.19 + lifeRatio * 3.7;
      const scatterCol = scatterCols
        ? Math.round(
          Math.sin(scatterSeed) * scatterCols +
          Math.sin(scatterSeed * 0.53) * scatterCols * 0.45
        )
        : 0;
      const scatterRow = scatterRows
        ? Math.round(Math.cos(scatterSeed * 0.83) * scatterRows - lifeRatio * scatterRows * 0.55)
        : 0;
      const targetCol = startCol + charIndex + scatterCol;
      const targetRow = centerRow + scatterRow;
      setFieldCell(targetRow, targetCol, baseDensity * 0.18 * sourceSuppress, ch, densityCap);

      for (let rise = 1; rise <= upwardBiasRows; rise++) {
        const taper = Math.max(0.35, 1 - rise / (upwardBiasRows + 2));
        const waveShift = Math.round(plumeWave * rise * 0.8 + Math.sin(charIndex * 0.8 + token.id) * 0.7);
        setFieldCell(targetRow - rise, targetCol + waveShift, baseDensity * (0.42 - rise * 0.052) * taper, ch, densityCap);
        setFieldCell(targetRow - rise, targetCol + waveShift + (token.vx >= 0 ? 1 : -1), baseDensity * (0.13 - rise * 0.011) * taper, ch, densityCap);
      }

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (!dx && !dy) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          let feather = dist === 1 ? 0.26 : dist === 2 ? 0.12 : 0.05;
          if (dy < 0) feather *= 1.65;
          if (dy >= 0) feather *= 0.32 * sourceSuppress;
          if (Math.abs(dx) === radius && dy <= 0) feather *= 0.4;
          setFieldCell(targetRow + dy, targetCol + dx, baseDensity * feather, ch, densityCap);
        }
      }
    }
  }

  function sampleDensity(sourceDensity, cols, rows, sampleRow, sampleCol) {
    const sr = clamp(sampleRow, 0, rows - 1.001);
    const sc = clamp(sampleCol, 0, cols - 1.001);
    const r0 = Math.floor(sr);
    const c0 = Math.floor(sc);
    const r1 = Math.min(rows - 1, r0 + 1);
    const c1 = Math.min(cols - 1, c0 + 1);
    const fr = sr - r0;
    const fc = sc - c0;
    const i00 = cellIndex(cols, r0, c0);
    const i10 = cellIndex(cols, r0, c1);
    const i01 = cellIndex(cols, r1, c0);
    const i11 = cellIndex(cols, r1, c1);
    return (
      sourceDensity[i00] * (1 - fc) * (1 - fr) +
      sourceDensity[i10] * fc * (1 - fr) +
      sourceDensity[i01] * (1 - fc) * fr +
      sourceDensity[i11] * fc * fr
    );
  }

  function sampleNearestChar(sourceChars, sourceStrength, cols, rows, sampleRow, sampleCol) {
    const r = clamp(Math.round(sampleRow), 0, rows - 1);
    const c = clamp(Math.round(sampleCol), 0, cols - 1);
    const idx = cellIndex(cols, r, c);
    return {
      code: sourceChars[idx],
      strength: sourceStrength[idx],
    };
  }

  function findNearbyChar(sourceChars, sourceStrength, cols, rows, row, col) {
    let bestCode = 0;
    let bestStrength = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const rr = row + dy;
        const cc = col + dx;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const idx = cellIndex(cols, rr, cc);
        const code = sourceChars[idx];
        const strength = sourceStrength[idx];
        if (code && strength >= bestStrength) {
          bestCode = code;
          bestStrength = strength;
        }
      }
    }
    return {
      code: bestCode,
      strength: bestStrength,
    };
  }

  function getVelocityAt(row, col) {
    const nx = col / Math.max(1, field.cols - 1);
    const ny = row / Math.max(1, field.rows - 1);
    // Local eddies: avoid a global left-right wind reversal and keep motion organic.
    const slowTime = simTime * 0.18;
    const curl = Math.sin(nx * 10.5 + ny * 7.2 + slowTime) * 0.055;
    const localShear =
      Math.sin(ny * 6.4 + slowTime * 0.7) * 0.045 +
      Math.cos((nx + ny) * 8.6 + slowTime * 0.43) * 0.035 +
      Math.sin(nx * 13.2 - ny * 2.6 + slowTime * 0.55) * 0.025;

    let vx = flowBiasX + localShear;
    let vy =
      (-0.34 + flowBiasY) +
      Math.cos(nx * 4.8 + slowTime * 0.4) * -0.045 +
      Math.sin((nx - ny) * 7.5 + slowTime * 0.5) * -0.035;

    // Apply small curl without letting it flip the whole plume direction.
    vx += curl * (ny - 0.4);
    vy += -curl * (nx - 0.5) * 0.38;

    // Natural rise spread: widen with altitude through small, spatially varied eddies.
    const heightSpread = Math.pow(1 - ny, 1.2);
    vx += Math.sin(slowTime * 0.72 + row * 0.37) * heightSpread * 0.045;
    vx += Math.cos(slowTime * 0.48 + col * 0.21) * heightSpread * 0.035;

    return { vx: vx, vy: vy };
  }

  function advectAndDiffuseField(dormant) {
    if (!field) return;
    const cols = field.cols;
    const rows = field.rows;
    const sourceDensity = field.density;
    const sourceChars = field.charCodes;
    const sourceStrength = field.charStrength;
    const targetDensity = field.tempDensity;
    const targetChars = field.tempCharCodes;
    const targetStrength = field.tempCharStrength;
    const decay = dormant ? 0.996 : 0.999;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = cellIndex(cols, row, col);
        const vel = getVelocityAt(row, col);
        const sampleRow = row - vel.vy;
        const sampleCol = col - vel.vx;
        let density = sampleDensity(sourceDensity, cols, rows, sampleRow, sampleCol);

        const left = sampleDensity(sourceDensity, cols, rows, sampleRow, sampleCol - 1);
        const right = sampleDensity(sourceDensity, cols, rows, sampleRow, sampleCol + 1);
        const up = sampleDensity(sourceDensity, cols, rows, sampleRow - 1, sampleCol);
        const down = sampleDensity(sourceDensity, cols, rows, sampleRow + 1, sampleCol);
        density = density * 0.78 + (left + right + up + down) * 0.055;
        density *= decay;

        const sampled = sampleNearestChar(sourceChars, sourceStrength, cols, rows, sampleRow, sampleCol);
        targetDensity[idx] = density;
        const nearby = sampled.code || sourceChars[idx]
          ? { code: sampled.code || sourceChars[idx], strength: Math.max(sampled.strength || 0, sourceStrength[idx] || 0) }
          : findNearbyChar(sourceChars, sourceStrength, cols, rows, Math.round(sampleRow), Math.round(sampleCol));
        const retainedCode = nearby.code;
        if (retainedCode && density > 0.0002) {
          const memoryStrength = Math.max(nearby.strength || 0, sourceStrength[idx] || 0);
          density = Math.max(density, Math.min(0.012, memoryStrength * 0.004));
          targetDensity[idx] = density;
        }
        targetChars[idx] = density > 0.002 ? retainedCode : 0;
        targetStrength[idx] = density > 0.002 ? Math.max((nearby.strength || 0) * 0.985, sourceStrength[idx] * 0.96, density) : 0;
      }
    }

    field.density = targetDensity;
    field.tempDensity = sourceDensity;
    field.charCodes = targetChars;
    field.tempCharCodes = sourceChars;
    field.charStrength = targetStrength;
    field.tempCharStrength = sourceStrength;
  }

  function chooseGlyph(sourceChar, density, row, col) {
    if (!sourceChar) return '';
    if (density >= 0.62) return sourceChar;
    if (density >= 0.42) return (row + col) % 3 === 0 ? sourceChar : '…';
    if (density >= 0.24) return (row + col) % 2 === 0 ? '·' : ':';
    return (row + col) % 2 === 0 ? '.' : '·';
  }

  function buildDensityGrid() {
    if (!field) {
      return {
        renderer: 'density-grid',
        fieldMode: 'fluid',
        cols: 0,
        rows: 0,
        cellW: 0,
        cellH: 0,
        fontFamily: 'sans-serif',
        cells: [],
      };
    }

    const cells = [];
    let densityTotal = 0;
    const rowStats = new Map();

    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const idx = cellIndex(field.cols, row, col);
        const density = field.density[idx];
        if (density <= 0.004 || !field.charCodes[idx]) continue;
        densityTotal += density;
        const rowInfo = rowStats.get(row) || {
          density: 0,
          weightedCol: 0,
          minCol: col,
          maxCol: col,
        };
        rowInfo.density += density;
        rowInfo.weightedCol += col * density;
        rowInfo.minCol = Math.min(rowInfo.minCol, col);
        rowInfo.maxCol = Math.max(rowInfo.maxCol, col);
        rowStats.set(row, rowInfo);
      }
    }

    for (let row = 0; row < field.rows; row++) {
      const rowInfo = rowStats.get(row);
      if (!rowInfo || !rowInfo.density) continue;
      const rowCenterCol = rowInfo.weightedCol / rowInfo.density;
      const rawHalfWidth = Math.max(1.4, (rowInfo.maxCol - rowInfo.minCol + 1) / 2);
      const rowWave = Math.sin(row * 0.72 + rowCenterCol * 0.18) * 0.55;
      const allowedHalfWidth = clamp(rawHalfWidth + 1.8 + rowWave, 3.0, 11.8);

      for (let col = 0; col < field.cols; col++) {
        const idx = cellIndex(field.cols, row, col);
        let density = field.density[idx];
        const code = field.charCodes[idx];
        if (density <= 0.0025 || !code) continue;

        const colDistance = Math.abs(col - rowCenterCol);
        if (colDistance > allowedHalfWidth + 0.5) {
          continue;
        }
        if (colDistance > allowedHalfWidth) {
          density *= 0.28;
        }
        if (density <= 0.0015) continue;

        const jitterSeed = Math.sin(row * 12.9898 + col * 78.233 + rowCenterCol * 0.37);
        const offsetX = jitterSeed * Math.min(field.cellW * 0.22, 2.4);
        const offsetY = Math.cos(row * 5.17 + col * 2.31) * Math.min(field.cellH * 0.12, 1.4);
        const densityClamped = clamp(density, 0, 1);
        cells.push({
          row: row,
          col: col,
          char: chooseGlyph(String.fromCodePoint(code), densityClamped, row, col),
          density: densityClamped,
          alpha: clamp(density * 0.92, 0, 1),
          x: col * field.cellW + field.cellW * 0.5,
          y: row * field.cellH + field.cellH * 0.5,
          offsetX: offsetX,
          offsetY: offsetY,
        });
      }
    }

    cells.sort(function (a, b) {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    return {
      renderer: 'density-grid',
      fieldMode: 'fluid',
      cols: field.cols,
      rows: field.rows,
      cellW: field.cellW,
      cellH: field.cellH,
      fontFamily: field.fontFamily,
      cells: cells,
    };
  }

  function renderDensityGrid(ctx, grid) {
    if (!grid || !grid.cells.length) return;

    function getDensityColor(density, alpha) {
      let r, g, b;
      if (density > 0.6) {
        // High density: warm white-yellow
        const t = Math.min(1, (density - 0.6) / 0.4);
        r = Math.round(210 + 45 * t);
        g = Math.round(218 + 30 * t);
        b = Math.round(230 + 5 * t);
      } else if (density > 0.3) {
        // Mid density: cool gray-blue
        const t = (density - 0.3) / 0.3;
        r = Math.round(180 + 30 * t);
        g = Math.round(190 + 28 * t);
        b = Math.round(210 + 20 * t);
      } else {
        // Low density: faint blue-gray
        r = 180;
        g = 190;
        b = 210;
      }
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(4) + ')';
    }

    for (let i = 0; i < grid.cells.length; i++) {
      const cell = grid.cells[i];
      const baseSize = grid.cellH * 0.86;
      const sizeScale = cell.density > 0.6 ? 1.15 : cell.density > 0.3 ? 1.0 : 0.75;
      const baseFontSize = Math.round(baseSize * sizeScale);
      const riseOffset = Math.min(grid.cellH * 0.45, cell.density * grid.cellH * 0.35) + (cell.offsetY || 0);
      const drawX = cell.x + (cell.offsetX || 0);
      ctx.font = `${baseFontSize}px ${grid.fontFamily || 'sans-serif'}`;
      ctx.fillStyle = getDensityColor(cell.density, cell.alpha);
      ctx.fillText(cell.char, drawX, cell.y - riseOffset);
      if (renderQualityScale < 0.75) continue;
      // Layer 2: faint afterimage above
      if (cell.alpha > 0.12) {
        ctx.fillStyle = getDensityColor(cell.density, cell.alpha * 0.22);
        ctx.fillText(cell.char, drawX - (cell.offsetX || 0) * 0.3, cell.y - riseOffset - grid.cellH * 0.28);
      }
      // Layer 3: ghost upper-left, slightly rotated
      if (cell.alpha > 0.20) {
        ctx.save();
        const gx3 = drawX - grid.cellH * 0.15;
        const gy3 = cell.y - riseOffset - grid.cellH * 0.5;
        ctx.translate(gx3, gy3);
        ctx.rotate(-0.06);
        ctx.fillStyle = getDensityColor(cell.density, cell.alpha * 0.10);
        ctx.fillText(cell.char, 0, 0);
        ctx.restore();
      }
      // Layer 4: faintest ghost high above
      if (cell.alpha > 0.30) {
        ctx.fillStyle = getDensityColor(cell.density, cell.alpha * 0.06);
        ctx.fillText(cell.char, drawX, cell.y - riseOffset - grid.cellH * 0.7);
      }
    }
  }

  function isFieldPhase(phase) {
    return phase === 'burst' || phase === 'stream';
  }

  function renderPretextTokens(ctx) {
    for (let i = 0; i < active.length; i++) {
      const token = active[i];
      if (!token.pretextVisible || !token.pretext) continue;
      const alpha = token.pretextAlpha != null ? token.pretextAlpha : getPretextAlpha(token);
      if (alpha <= 0.03) continue;

      const style = getStyle(token.mode, token.phase);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round((style.fontSize || token.size) * 1.08)}px ${token.mode.textFontFamily || 'sans-serif'}`;
      ctx.fillStyle = 'rgba(244,248,255,0.96)';
      const padding = Math.max(22, Math.min(56, lastCanvasW * 0.075));
      const measuredWidth = typeof ctx.measureText === 'function'
        ? ctx.measureText(token.pretext).width || 0
        : 0;
      const halfWidth = Math.min(Math.max(0, lastCanvasW * 0.5 - padding), measuredWidth * 0.5);
      const minX = padding + halfWidth;
      const maxX = lastCanvasW - padding - halfWidth;
      const drawX = maxX >= minX ? clamp(token.x, minX, maxX) : lastCanvasW * 0.5;
      ctx.fillText(token.pretext, drawX, token.y);
      ctx.restore();
    }
  }

  function renderEmberTokens(ctx) {
    for (let i = 0; i < active.length; i++) {
      const token = active[i];
      if (isFieldPhase(token.phase)) continue;
      const lifeRatio = token.life / token.maxLife;
      const alpha = clamp(token.baseAlpha * getPhaseFade(token, lifeRatio), 0, 0.34);
      if (alpha <= 0.01) continue;

      const glyphs = Array.from(token.displayText || token.text || '').filter(function (ch) { return ch.trim(); });
      const glyph = glyphs.length ? glyphs[token.id % glyphs.length] : '·';
      const strandLean = Math.sin(token.id * 1.7 + lifeRatio * 3.2) * 1.2;

      ctx.save();
      ctx.translate(token.x, token.y);
      ctx.rotate(token.rotation * 0.35);
      ctx.font = `${Math.round(token.size)}px ${token.mode.textFontFamily || 'sans-serif'}`;

      // Thin vertical ember wisp: separate from mouth fluid field, so it never syncs with exhale smoke.
      if (typeof ctx.beginPath === 'function') {
        ctx.beginPath();
        ctx.moveTo(0, -token.size * 0.1);
        ctx.quadraticCurveTo(
          strandLean * 0.55,
          -token.size * 1.05,
          strandLean * 0.35,
          -token.size * 2.15
        );
        ctx.lineWidth = Math.max(0.72, token.size * 0.085);
        ctx.strokeStyle = `rgba(210,216,224,${(alpha * 0.88).toFixed(4)})`;
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(210,216,224,${(alpha * 1.05).toFixed(4)})`;
      ctx.fillText(glyph, 0, 0);

      if (alpha > 0.028) {
        ctx.fillStyle = `rgba(210,216,224,${(alpha * 0.48).toFixed(4)})`;
        ctx.fillText(glyph, strandLean * 0.42, -token.size * 0.9);
      }
      if (alpha > 0.046) {
        ctx.fillStyle = `rgba(255,218,160,${(alpha * 0.16).toFixed(4)})`;
        ctx.fillText('·', strandLean * 0.28, -token.size * 1.55);
      }
      ctx.restore();
    }
  }

  function emit(normX, normY, canvasW, canvasH, mode, emission, dt) {
    if (!mode || mode.renderStyle !== 'text-smoke' || !emission || !emission.type) return;
    lastCanvasW = canvasW || lastCanvasW;
    lastCanvasH = canvasH || lastCanvasH;
    ensureField(mode);

    const x = lastCanvasW * (1 - normX);
    const y = lastCanvasH * normY;
    const phase = emission.inhaling ? 'inhaling' : mapEmissionType(emission.type);
    const strength = emission.strength || 1;
    const count = getEmissionCount(mode, phase, strength, dt);
    if (!count) return;
    const phraseOverride = phase === 'burst'
      ? nextPhrase(mode, { remember: true })
      : phase === 'stream'
        ? nextPhrase(mode, { reuseLatest: true, remember: false })
        : null;

    const dirX = emission.direction && typeof emission.direction.x === 'number' ? emission.direction.x : -0.8;
    const dirY = emission.direction && typeof emission.direction.y === 'number' ? emission.direction.y : -0.2;
    if (isFieldPhase(phase)) {
      flowBiasX = clamp((dirX < 0 ? -1 : 1) * 0.34, -0.48, 0.48);
      flowBiasY = clamp(-dirY * 0.03, -0.02, 0.06);
    }

    for (let i = 0; i < count; i++) {
      const token = createToken(mode, phase, x, y, emission.direction, strength, phraseOverride);
      if (phase === 'burst' && i === 0) {
        token.pretext = token.text;
        token.pretextVisible = true;
        token.pretextHold = 720;
        token.pretextFade = 520;
        token.fieldDelay = 520;
        token.fieldDensityScale = 0.28;
        token.fieldDensityCap = 0.86;
        token.fieldScatterCols = 7;
        token.fieldScatterRows = 3;
        token.pretextAlpha = getPretextAlpha(token);
      } else if (phase === 'burst') {
        token.fieldDensityScale = 0.38;
        token.fieldDensityCap = 0.86;
        token.fieldScatterCols = 7;
        token.fieldScatterRows = 3;
      }
      active.push(token);
      if (isFieldPhase(phase) && shouldInjectFieldToken(token)) {
        injectTokenIntoField(token);
      }
    }
    enforcePhaseCap(mode, phase);
  }

  function update(ctx, dt, options) {
    const dormant = !!(options && options.dormant);
    const inMouth = options && options.inhalingMouth;
    renderQualityScale = clamp(options && options.qualityScale != null ? options.qualityScale : 1, 0.6, 1);
    const cleanupBoost = dormant ? 1.8 : 1;
    const step = Math.max(0.7, Math.min(2.5, dt / 16.6667));
    simTime += dt / 1000;
    flowBiasX *= dormant ? 0.985 : 0.996;
    flowBiasY = flowBiasY * (dormant ? 0.96 : 0.992) + 0.0008;

    const mode = active[0] ? active[0].mode : null;
    ensureField(mode || { textFontFamily: 'sans-serif', textStyles: { stream: { fontSize: 21 } } });

    for (let i = active.length - 1; i >= 0; i--) {
      const token = active[i];
      token.life += dt * cleanupBoost;
      const lifeRatio = token.life / token.maxLife;
      if (lifeRatio >= 1) {
        active.splice(i, 1);
        continue;
      }

      if (inMouth && token.phase === 'inhaling') {
        const dx = inMouth.x - token.x;
        const dy = inMouth.y - token.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const pull = clamp(180 / dist, 0.12, 0.55) * step;
        token.vx += (dx / dist) * pull;
        token.vy += (dy / dist) * pull;
        if (dist < 28) {
          active.splice(i, 1);
          continue;
        }
      }

      token.vx *= token.phase === 'burst' ? 0.982 : 0.988;
      token.vy *= token.phase === 'fingertip' ? 0.984 : 0.99;
      token.vy -= getPhaseLift(token.phase) * step;
      token.x += token.vx * step;
      token.y += token.vy * step;
      token.rotation += token.spin * dt;
      if (token.sizeGrow) {
        token.size += token.sizeGrow * step;
      }
      updateDisplayText(token, inMouth);
      token.pretextAlpha = getPretextAlpha(token);
    }

    for (let i = 0; i < active.length; i++) {
      if (isFieldPhase(active[i].phase) && shouldInjectFieldToken(active[i])) {
        injectTokenIntoField(active[i]);
      }
    }

    advectAndDiffuseField(dormant);
    const grid = buildDensityGrid();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    renderDensityGrid(ctx, grid);
    renderPretextTokens(ctx);
    renderEmberTokens(ctx);
    ctx.restore();
  }

  function reset() {
    active.length = 0;
    simTime = 0;
    field = null;
    for (const key in emitBudgets) {
      delete emitBudgets[key];
    }
  }

  function getActiveCount() {
    return active.length;
  }

  function getDebugSnapshot() {
    const tokens = active.map(function (token) {
      return {
        id: token.id,
        phase: token.phase,
        text: token.text,
        displayText: token.displayText,
        x: token.x,
        y: token.y,
        vx: token.vx,
        vy: token.vy,
        pretext: token.pretext,
        pretextVisible: !!token.pretextVisible,
        pretextAlpha: token.pretextVisible ? getPretextAlpha(token) : 0,
      };
    });
    const grid = buildDensityGrid();
    tokens.renderer = grid.renderer;
    tokens.fieldMode = grid.fieldMode;
    tokens.cols = grid.cols;
    tokens.rows = grid.rows;
    tokens.cellW = grid.cellW;
    tokens.cellH = grid.cellH;
    tokens.cells = grid.cells;
    if (field) {
      let densityTotal = 0;
      let charCellCount = 0;
      for (let i = 0; i < field.density.length; i++) {
        densityTotal += field.density[i];
        if (field.charCodes[i]) charCellCount += 1;
      }
      tokens.fieldDensityTotal = densityTotal;
      tokens.fieldCharCellCount = charCellCount;
    }
    return tokens;
  }

  return { emit, update, reset, getActiveCount, getDebugSnapshot };
});
