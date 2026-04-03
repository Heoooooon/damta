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
    if (lifeRatio < 0.3) return text;
    const fadeStart = 0.3;
    const fadeEnd = 0.85;
    if (lifeRatio >= fadeEnd) return '';
    const fadeT = (lifeRatio - fadeStart) / (fadeEnd - fadeStart);
    const keepCount = Math.max(1, Math.ceil(chars.length * (1 - fadeT)));
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

  function getTokenText(mode, phase, phraseOverride) {
    if (phraseOverride) return phraseOverride;
    if (phase === 'burst') return nextPhrase(mode, { remember: true });
    if (phase === 'stream') return nextPhrase(mode, { reuseLatest: true, remember: false });
    return nextPhrase(mode, { reuseLatest: true, remember: false });
  }

  function createToken(mode, phase, x, y, direction, strength, phraseOverride) {
    const style = getStyle(mode, phase);
    const text = getTokenText(mode, phase, phraseOverride);
    const dirX = direction && typeof direction.x === 'number' ? direction.x : -0.8;
    const dirY = direction && typeof direction.y === 'number' ? direction.y : -0.2;
    const scale = clamp(strength || 1, 0.6, 1.8);
    const spreadX = phase === 'burst' ? 26 : phase === 'stream' ? 20 : 10;
    const spreadY = phase === 'burst' ? 14 : phase === 'stream' ? 12 : 7;
    const driftX = phase === 'fingertip'
      ? randomBetween(-0.42, 0.42)
      : phase === 'burst'
        ? randomBetween(-0.28, 0.28)
        : randomBetween(-0.2, 0.2);
    const driftY = phase === 'fingertip'
      ? randomBetween(-1.0, -0.3)
      : phase === 'burst'
        ? randomBetween(-0.72, -0.18)
        : randomBetween(-0.44, -0.1);

    return {
      id: nextId++,
      mode: mode,
      phase: phase,
      text: text,
      displayText: text,
      x: x + randomBetween(-spreadX, spreadX),
      y: y + randomBetween(-spreadY, spreadY),
      vx: dirX * randomBetween(0.95, 2.9) * scale + driftX,
      vy: dirY * randomBetween(0.8, 1.9) * scale + driftY,
      baseAlpha: style.alpha,
      size: style.fontSize * randomBetween(0.94, 1.08),
      rotation: randomBetween(-0.08, 0.08),
      spin: randomBetween(-0.0015, 0.0015),
      life: 0,
      maxLife: randomBetween(
        phase === 'burst' ? 1800 : phase === 'stream' ? 2600 : 1000,
        phase === 'burst' ? 2500 : phase === 'stream' ? 3600 : 1600
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
    if (phase === 'fingertip') return 0.02;
    if (phase === 'burst') return 0.014;
    if (phase === 'stream') return 0.012;
    return 0.012;
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

  function getGridConfig(mode) {
    const fontSize = getStyle(mode || {}, 'stream').fontSize || 21;
    const cellW = Math.max(12, Math.round(fontSize * 0.72));
    const cellH = Math.max(16, Math.round(fontSize * 0.96));
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

  function setFieldCell(row, col, amount, ch) {
    if (!field) return;
    if (row < 0 || col < 0 || row >= field.rows || col >= field.cols || amount <= 0) return;
    const idx = cellIndex(field.cols, row, col);
    field.density[idx] = Math.min(1, field.density[idx] + amount);
    if (ch) {
      const code = ch.codePointAt(0);
      if (amount >= field.charStrength[idx]) {
        field.charCodes[idx] = code;
        field.charStrength[idx] = amount;
      }
    }
  }

  function injectTokenIntoField(token) {
    const text = Array.from(token.displayText || token.text || '');
    if (!text.length || !field) return;
    const lifeRatio = token.life / token.maxLife;
    const baseDensity = clamp(token.baseAlpha * getPhaseFade(token, lifeRatio), 0.03, 1);
    const centerCol = clamp(Math.round(token.x / field.cellW), 0, field.cols - 1);
    const centerRow = clamp(Math.round(token.y / field.cellH), 0, field.rows - 1);
    const radius = token.phase === 'burst' ? 3 : token.phase === 'stream' ? 2 : 1;
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

    for (let charIndex = 0; charIndex < text.length; charIndex++) {
      const ch = text[charIndex];
      if (!ch.trim()) continue;
      const targetCol = startCol + charIndex;
      setFieldCell(centerRow, targetCol, baseDensity * 0.24, ch);

      for (let rise = 1; rise <= upwardBiasRows; rise++) {
        const taper = Math.max(0.35, 1 - rise / (upwardBiasRows + 2));
        const waveShift = Math.round(plumeWave * rise * 0.8 + Math.sin(charIndex * 0.8 + token.id) * 0.7);
        setFieldCell(centerRow - rise, targetCol + waveShift, baseDensity * (0.56 - rise * 0.07) * taper, ch);
        setFieldCell(centerRow - rise, targetCol + waveShift + (token.vx >= 0 ? 1 : -1), baseDensity * (0.18 - rise * 0.015) * taper, ch);
      }

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (!dx && !dy) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          let feather = dist === 1 ? 0.26 : dist === 2 ? 0.12 : 0.05;
          if (dy < 0) feather *= 1.65;
          if (dy > 0) feather *= 0.32;
          if (Math.abs(dx) === radius && dy <= 0) feather *= 0.4;
          setFieldCell(centerRow + dy, targetCol + dx, baseDensity * feather, ch);
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

  function getVelocityAt(row, col) {
    const nx = col / Math.max(1, field.cols - 1);
    const ny = row / Math.max(1, field.rows - 1);
    // Time-varying wind
    const windAngle = simTime * 0.08;
    const windStrength = 0.05 + Math.sin(simTime * 0.3) * 0.03;

    // Vortex / curl noise
    const curl = Math.sin(nx * 12 + ny * 8 + simTime * 1.2) * 0.12;

    let vx =
      flowBiasX +
      Math.sin(ny * 7.4 + simTime * 0.9) * 0.18 +
      Math.cos((nx + ny) * 9.3 + simTime * 0.42) * 0.08 +
      Math.sin(nx * 15.4 - ny * 3.2 + simTime * 0.65) * 0.04;
    let vy =
      (-0.62 + flowBiasY) +
      Math.cos(nx * 4.8 + simTime * 0.35) * -0.07 +
      Math.sin((nx - ny) * 7.5 + simTime * 0.47) * -0.05;

    // Apply wind
    vx += Math.cos(windAngle) * windStrength;
    vy += Math.sin(windAngle) * windStrength * 0.3;

    // Apply swirl
    vx += curl * (ny - 0.4);
    vy += -curl * (nx - 0.5) * 0.5;

    // Ceiling spread: smoke pools at top
    if (ny < 0.15) {
      vy *= 0.3;
      vx *= 1.8;
    }

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
    const decay = dormant ? 0.992 : 0.996;

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
        targetChars[idx] = density > 0.005 ? sampled.code : 0;
        targetStrength[idx] = density > 0.005 ? Math.max(sampled.strength * 0.96, density) : 0;
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
    let rowWeighted = 0;
    let colWeighted = 0;
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;

    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const idx = cellIndex(field.cols, row, col);
        const density = field.density[idx];
        if (density <= 0.006 || !field.charCodes[idx]) continue;
        densityTotal += density;
        rowWeighted += row * density;
        colWeighted += col * density;
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
      }
    }

    const centerRow = densityTotal > 0 ? rowWeighted / densityTotal : 0;
    const centerCol = densityTotal > 0 ? colWeighted / densityTotal : 0;
    const plumeHalfWidth = Math.max(2, (maxCol - minCol + 1) / 2);
    const plumeHeight = Math.max(1, maxRow - minRow + 1);

    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const idx = cellIndex(field.cols, row, col);
        let density = field.density[idx];
        const code = field.charCodes[idx];
        if (density <= 0.03 || !code) continue;

        const upward = clamp((centerRow - row) / plumeHeight, -0.5, 1);
        const downward = clamp((row - centerRow) / plumeHeight, 0, 1);
        const wave = Math.sin(row * 0.72 + centerCol * 0.18) * 0.45;
        const allowedHalfWidth = Math.max(
          1.2,
          plumeHalfWidth * (1 - upward * 1.18 - downward * 0.72) + wave
        );
        const colDistance = Math.abs(col - centerCol);
        if (colDistance > allowedHalfWidth + 0.25) {
          continue;
        }
        if (colDistance > allowedHalfWidth) {
          density *= 0.18;
        }
        if (density <= 0.007) continue;

        const jitterSeed = Math.sin(row * 12.9898 + col * 78.233 + centerCol * 0.37);
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

  function emit(normX, normY, canvasW, canvasH, mode, emission) {
    if (!mode || mode.renderStyle !== 'text-smoke' || !emission || !emission.type) return;
    lastCanvasW = canvasW || lastCanvasW;
    lastCanvasH = canvasH || lastCanvasH;
    ensureField(mode);

    const x = lastCanvasW * (1 - normX);
    const y = lastCanvasH * normY;
    const phase = mapEmissionType(emission.type);
    const strength = emission.strength || 1;
    const count = phase === 'burst' ? 2 : 1;
    const phraseOverride = phase === 'burst'
      ? nextPhrase(mode, { remember: true })
      : phase === 'stream'
        ? nextPhrase(mode, { reuseLatest: true, remember: false })
        : null;

    const dirX = emission.direction && typeof emission.direction.x === 'number' ? emission.direction.x : -0.8;
    const dirY = emission.direction && typeof emission.direction.y === 'number' ? emission.direction.y : -0.2;
    flowBiasX = clamp(dirX * 0.32, -0.42, 0.42);
    flowBiasY = clamp(-dirY * 0.08, -0.04, 0.14);

    for (let i = 0; i < count; i++) {
      const token = createToken(mode, phase, x, y, emission.direction, strength, phraseOverride);
      active.push(token);
      injectTokenIntoField(token);
    }
    enforcePhaseCap(mode, phase);
  }

  function update(ctx, dt, options) {
    const dormant = !!(options && options.dormant);
    const inMouth = options && options.inhalingMouth;
    const cleanupBoost = dormant ? 1.8 : 1;
    const step = Math.max(0.7, Math.min(2.5, dt / 16.6667));
    simTime += dt / 1000;
    flowBiasX *= dormant ? 0.94 : 0.988;
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

      if (inMouth && (token.phase === 'inhaling' || token.phase === 'fingertip')) {
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

      token.vx *= token.phase === 'burst' ? 0.986 : 0.992;
      token.vy *= token.phase === 'fingertip' ? 0.988 : 0.994;
      token.vy -= getPhaseLift(token.phase) * step;
      token.x += token.vx * step;
      token.y += token.vy * step;
      token.rotation += token.spin * dt;
      updateDisplayText(token, inMouth);
    }

    for (let i = 0; i < active.length; i++) {
      injectTokenIntoField(active[i]);
    }

    advectAndDiffuseField(dormant);
    const grid = buildDensityGrid();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    renderDensityGrid(ctx, grid);
    ctx.restore();
  }

  function reset() {
    active.length = 0;
    simTime = 0;
    field = null;
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
    return tokens;
  }

  return { emit, update, reset, getActiveCount, getDebugSnapshot };
});
