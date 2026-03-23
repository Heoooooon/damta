# Boxing Sandbag Training Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a webcam-based virtual sandbag boxing trainer as a standalone page (`boxing.html`) with punch detection, impact effects, 30-second rounds, and stats — without modifying any existing damta code.

**Architecture:** Separate `boxing.html` page with its own MediaPipe Hands init, Canvas 2D rendering, and 4 new JS files in `js/boxing/`. Reuses `js/noise.js` from existing project. `boxing-detection.js` is UMD for Node testing; all others are IIFE.

**Tech Stack:** MediaPipe Hands CDN, Canvas 2D, vanilla JS, `node:test` for testing

**Spec:** `docs/superpowers/specs/2026-03-23-boxing-sandbag-design.md`

---

## Chunk 1: Core Detection Logic (TDD)

### Task 1: boxing-detection.js — Fist Detection

**Files:**
- Create: `js/boxing/boxing-detection.js`
- Create: `tests/boxing-detection.test.js`

- [ ] **Step 1: Write failing tests for fist detection**

```js
// tests/boxing-detection.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const BoxingDetection = require('../js/boxing/boxing-detection.js');

// Helper: create 21 landmarks with all fingers extended (open hand)
function createOpenHand() {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  // Wrist
  lm[0] = { x: 0.5, y: 0.8 };
  // Middle MCP (landmark 9)
  lm[9] = { x: 0.5, y: 0.6 };
  // Index: tip(8) above pip(6) — extended
  lm[6] = { x: 0.45, y: 0.5 };
  lm[8] = { x: 0.45, y: 0.3 };
  // Middle: tip(12) above pip(10) — extended
  lm[10] = { x: 0.5, y: 0.5 };
  lm[12] = { x: 0.5, y: 0.3 };
  // Ring: tip(16) above pip(14) — extended
  lm[14] = { x: 0.55, y: 0.5 };
  lm[16] = { x: 0.55, y: 0.3 };
  // Pinky: tip(20) above pip(18) — extended
  lm[18] = { x: 0.6, y: 0.5 };
  lm[20] = { x: 0.6, y: 0.3 };
  return lm;
}

// Helper: create fist (all fingertips below pip joints)
function createFist() {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.8 };
  lm[9] = { x: 0.5, y: 0.6 };
  // Index: tip(8) below pip(6) — folded
  lm[6] = { x: 0.45, y: 0.55 };
  lm[8] = { x: 0.45, y: 0.62 };
  // Middle: tip(12) below pip(10) — folded
  lm[10] = { x: 0.5, y: 0.55 };
  lm[12] = { x: 0.5, y: 0.62 };
  // Ring: tip(16) below pip(14) — folded
  lm[14] = { x: 0.55, y: 0.55 };
  lm[16] = { x: 0.55, y: 0.62 };
  // Pinky: tip(20) below pip(18) — folded
  lm[18] = { x: 0.6, y: 0.55 };
  lm[20] = { x: 0.6, y: 0.62 };
  return lm;
}

test('isFist returns true when all 4 fingers are folded', () => {
  assert.equal(BoxingDetection.isFist(createFist()), true);
});

test('isFist returns false when fingers are extended (open hand)', () => {
  assert.equal(BoxingDetection.isFist(createOpenHand()), false);
});

test('isFist returns false for null/invalid landmarks', () => {
  assert.equal(BoxingDetection.isFist(null), false);
  assert.equal(BoxingDetection.isFist([]), false);
});

test('getFistPosition returns midpoint of wrist(0) and middle MCP(9)', () => {
  const lm = createFist();
  const pos = BoxingDetection.getFistPosition(lm);
  assert.ok(Math.abs(pos.x - 0.5) < 0.001);
  assert.ok(Math.abs(pos.y - 0.7) < 0.001);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/boxing-detection.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fist detection**

```js
// js/boxing/boxing-detection.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BoxingDetection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function isValidLandmarks(landmarks) {
    return Array.isArray(landmarks) && landmarks.length >= 21;
  }

  // Fist: all 4 finger tips (index, middle, ring, pinky) below their PIP joints
  // MediaPipe y increases downward, so tip.y > pip.y means folded
  function isFist(landmarks) {
    if (!isValidLandmarks(landmarks)) return false;
    const fingers = [
      [8, 6],   // index: tip, pip
      [12, 10], // middle
      [16, 14], // ring
      [20, 18], // pinky
    ];
    return fingers.every(([tip, pip]) => landmarks[tip].y > landmarks[pip].y);
  }

  // Fist position: midpoint of wrist(0) and middle MCP(9)
  function getFistPosition(landmarks) {
    if (!isValidLandmarks(landmarks)) return null;
    return {
      x: (landmarks[0].x + landmarks[9].x) / 2,
      y: (landmarks[0].y + landmarks[9].y) / 2,
    };
  }

  return { isFist, getFistPosition, isValidLandmarks };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/boxing-detection.test.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add js/boxing/boxing-detection.js tests/boxing-detection.test.js
git commit -m "feat(boxing): add fist detection with tests"
```

---

### Task 2: boxing-detection.js — Velocity & Hit Detection

**Files:**
- Modify: `js/boxing/boxing-detection.js`
- Modify: `tests/boxing-detection.test.js`

- [ ] **Step 1: Write failing tests for velocity and hit detection**

Append to `tests/boxing-detection.test.js`:

```js
test('createPunchTracker tracks velocity between frames', () => {
  const tracker = BoxingDetection.createPunchTracker();
  const pos1 = { x: 0.5, y: 0.5 };
  const pos2 = { x: 0.5, y: 0.3 }; // moved 0.2 in one frame
  tracker.update(pos1);
  const result = tracker.update(pos2);
  assert.ok(result.displacement > 0.15);
});

test('createPunchTracker returns zero displacement on first frame', () => {
  const tracker = BoxingDetection.createPunchTracker();
  const result = tracker.update({ x: 0.5, y: 0.5 });
  assert.equal(result.displacement, 0);
});

test('checkHit returns hit when fist is inside hitbox and moving fast', () => {
  const hitbox = { x: 0.5, y: 0.5, halfW: 0.1, halfH: 0.25 };
  const result = BoxingDetection.checkHit(
    { x: 0.5, y: 0.5 }, // fist position (inside hitbox)
    0.03,                // displacement (above normal threshold 0.015)
    hitbox
  );
  assert.equal(result.hit, true);
  assert.equal(result.power, 'normal');
});

test('checkHit returns strong power for high velocity', () => {
  const hitbox = { x: 0.5, y: 0.5, halfW: 0.1, halfH: 0.25 };
  const result = BoxingDetection.checkHit(
    { x: 0.5, y: 0.5 },
    0.05, // above strong threshold 0.04
    hitbox
  );
  assert.equal(result.hit, true);
  assert.equal(result.power, 'strong');
});

test('checkHit returns no hit when fist is outside hitbox', () => {
  const hitbox = { x: 0.5, y: 0.5, halfW: 0.1, halfH: 0.25 };
  const result = BoxingDetection.checkHit(
    { x: 0.1, y: 0.1 }, // outside
    0.05,
    hitbox
  );
  assert.equal(result.hit, false);
});

test('checkHit returns no hit when moving too slowly', () => {
  const hitbox = { x: 0.5, y: 0.5, halfW: 0.1, halfH: 0.25 };
  const result = BoxingDetection.checkHit(
    { x: 0.5, y: 0.5 },
    0.005, // below minimum threshold
    hitbox
  );
  assert.equal(result.hit, false);
});

test('createHitCooldown blocks hits within cooldown window', () => {
  const cooldown = BoxingDetection.createHitCooldown(200);
  assert.equal(cooldown.canHit(1000), true);
  cooldown.recordHit(1000);
  assert.equal(cooldown.canHit(1100), false); // 100ms later, still in cooldown
  assert.equal(cooldown.canHit(1201), true);  // 201ms later, cooldown expired
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/boxing-detection.test.js`
Expected: FAIL — createPunchTracker, checkHit, createHitCooldown not defined

- [ ] **Step 3: Implement velocity tracking, hit detection, and cooldown**

Add to `boxing-detection.js` return object:

```js
  var THRESHOLD_NORMAL = 0.015;
  var THRESHOLD_STRONG = 0.04;

  function createPunchTracker() {
    var prevPos = null;
    function update(pos) {
      if (!prevPos) {
        prevPos = { x: pos.x, y: pos.y };
        return { displacement: 0 };
      }
      var dx = pos.x - prevPos.x;
      var dy = pos.y - prevPos.y;
      var displacement = Math.hypot(dx, dy);
      prevPos = { x: pos.x, y: pos.y };
      return { displacement: displacement };
    }
    function reset() { prevPos = null; }
    return { update: update, reset: reset };
  }

  function checkHit(fistPos, displacement, hitbox) {
    var inside =
      Math.abs(fistPos.x - hitbox.x) <= hitbox.halfW &&
      Math.abs(fistPos.y - hitbox.y) <= hitbox.halfH;
    if (!inside || displacement < THRESHOLD_NORMAL) {
      return { hit: false, power: null, position: fistPos };
    }
    var power = displacement >= THRESHOLD_STRONG ? 'strong' : 'normal';
    return { hit: true, power: power, position: fistPos, displacement: displacement };
  }

  function createHitCooldown(durationMs) {
    var lastHitTime = -Infinity;
    return {
      canHit: function (now) { return now - lastHitTime > durationMs; },
      recordHit: function (now) { lastHitTime = now; },
    };
  }
```

Update return statement to include new exports:
```js
  return {
    isFist, getFistPosition, isValidLandmarks,
    createPunchTracker, checkHit, createHitCooldown,
    THRESHOLD_NORMAL, THRESHOLD_STRONG,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/boxing-detection.test.js`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add js/boxing/boxing-detection.js tests/boxing-detection.test.js
git commit -m "feat(boxing): add velocity tracking, hit detection, and cooldown"
```

---

## Chunk 2: Sandbag Rendering & Impact Effects

### Task 3: boxing-sandbag.js — Sandbag Rendering & Swing Physics

**Files:**
- Create: `js/boxing/boxing-sandbag.js`

- [ ] **Step 1: Create sandbag renderer with damped pendulum physics**

```js
// js/boxing/boxing-sandbag.js
const BoxingSandbag = (function () {
  // Damped pendulum state
  var angle = 0;        // current swing angle (radians)
  var angularVel = 0;   // angular velocity
  var DAMPING = 0.95;
  var STIFFNESS = 0.08; // spring constant (restoring force)
  var NORMAL_IMPULSE = 0.06;
  var STRONG_IMPULSE = 0.15;

  // Hitbox (normalized 0-1, set by getHitbox)
  var hitbox = { x: 0.5, y: 0.45, halfW: 0.1, halfH: 0.25 };

  // Flash state
  var flashAlpha = 0;

  function applyHit(power, hitX) {
    // Determine swing direction based on hit position relative to center
    var direction = hitX < hitbox.x ? 1 : -1;
    var impulse = power === 'strong' ? STRONG_IMPULSE : NORMAL_IMPULSE;
    angularVel += direction * impulse;
    flashAlpha = power === 'strong' ? 1.0 : 0.6;
  }

  function update(dt) {
    var step = dt / 16.6667;
    // Spring restoring force
    angularVel -= angle * STIFFNESS * step;
    // Damping
    angularVel *= Math.pow(DAMPING, step);
    // Integrate
    angle += angularVel * step;
    // Clamp angle
    if (Math.abs(angle) > 0.35) {
      angle = 0.35 * Math.sign(angle);
      angularVel *= -0.3;
    }
    // Fade flash
    flashAlpha = Math.max(0, flashAlpha - 0.04 * step);
  }

  function draw(ctx, canvasW, canvasH) {
    var cx = canvasW * hitbox.x;
    var bagW = canvasW * hitbox.halfW * 2;
    var bagH = canvasH * hitbox.halfH * 2;
    var bagTop = canvasH * (hitbox.y - hitbox.halfH);
    var pivotY = bagTop - 20;

    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(angle);

    // Chain
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 20);
    ctx.stroke();

    // Bag body (rounded rect)
    var bx = -bagW / 2;
    var by = 20;
    var radius = 16;
    var alpha = 0.25 + flashAlpha * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bagW - radius, by);
    ctx.quadraticCurveTo(bx + bagW, by, bx + bagW, by + radius);
    ctx.lineTo(bx + bagW, by + bagH - radius);
    ctx.quadraticCurveTo(bx + bagW, by + bagH, bx + bagW - radius, by + bagH);
    ctx.lineTo(bx + radius, by + bagH);
    ctx.quadraticCurveTo(bx, by + bagH, bx, by + bagH - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.stroke();

    // Flash fill on hit
    if (flashAlpha > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashAlpha * 0.15) + ')';
      ctx.fill();
    }

    ctx.restore();
  }

  function getHitbox() {
    return hitbox;
  }

  function reset() {
    angle = 0;
    angularVel = 0;
    flashAlpha = 0;
  }

  return { applyHit: applyHit, update: update, draw: draw, getHitbox: getHitbox, reset: reset };
})();
```

- [ ] **Step 2: Verify file is syntactically valid**

Run: `node -e "require('./js/boxing/boxing-sandbag.js'); console.log('OK')"`
Expected: OK (IIFE attaches to globalThis but no error)
Note: This will output OK because the IIFE runs but `BoxingSandbag` attaches to `globalThis`.

- [ ] **Step 3: Commit**

```bash
git add js/boxing/boxing-sandbag.js
git commit -m "feat(boxing): add sandbag renderer with swing physics"
```

---

### Task 4: boxing-effects.js — Impact Particle System

**Files:**
- Create: `js/boxing/boxing-effects.js`

- [ ] **Step 1: Create impact effects system**

```js
// js/boxing/boxing-effects.js
const BoxingEffects = (function () {
  var MAX_PARTICLES = 500;
  var particles = [];
  var shakeAmount = 0;

  function emit(canvasX, canvasY, power) {
    var count = power === 'strong' ? 24 : 10;
    var speed = power === 'strong' ? 8 : 4;
    var life = power === 'strong' ? 500 : 300;
    var colors = power === 'strong'
      ? ['rgba(255,120,20,', 'rgba(255,80,30,', 'rgba(255,180,60,']
      : ['rgba(255,255,255,', 'rgba(255,240,200,'];

    for (var i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      var angle = Math.random() * Math.PI * 2;
      var v = speed * (0.5 + Math.random() * 0.5);
      particles.push({
        x: canvasX,
        y: canvasY,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 0,
        maxLife: life * (0.7 + Math.random() * 0.6),
        size: power === 'strong' ? 3 + Math.random() * 4 : 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Shockwave ring for strong hits
    if (power === 'strong') {
      particles.push({
        x: canvasX,
        y: canvasY,
        vx: 0, vy: 0,
        life: 0,
        maxLife: 400,
        size: 10,
        color: 'ring',
        ringRadius: 0,
      });
      shakeAmount = 8;
    } else {
      shakeAmount = Math.max(shakeAmount, 3);
    }
  }

  function update(ctx, dt) {
    // Screen shake
    if (shakeAmount > 0.5) {
      var sx = (Math.random() - 0.5) * shakeAmount;
      var sy = (Math.random() - 0.5) * shakeAmount;
      ctx.translate(sx, sy);
      shakeAmount *= 0.88;
    } else {
      shakeAmount = 0;
    }

    var step = dt / 16.6667;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      var ratio = p.life / p.maxLife;
      var alpha = 1 - ratio;

      if (p.color === 'ring') {
        // Shockwave ring
        p.ringRadius += 3 * step;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,160,40,' + (alpha * 0.6) + ')';
        ctx.lineWidth = Math.max(0.5, 3 * (1 - ratio));
        ctx.stroke();
      } else {
        // Spark particle
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vy += 0.15 * step; // gravity
        p.vx *= 0.97;
        p.vy *= 0.97;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color + '1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - ratio * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function getActiveCount() {
    return particles.length;
  }

  function reset() {
    particles.length = 0;
    shakeAmount = 0;
  }

  return { emit: emit, update: update, getActiveCount: getActiveCount, reset: reset };
})();
```

- [ ] **Step 2: Verify syntax**

Run: `node -e "require('./js/boxing/boxing-effects.js'); console.log('OK')"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add js/boxing/boxing-effects.js
git commit -m "feat(boxing): add impact particle effects system"
```

---

## Chunk 3: Main App, Page & UI

### Task 5: boxing.html — Page Structure & Styles

**Files:**
- Create: `boxing.html`

- [ ] **Step 1: Create boxing.html with full page structure**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boxing Training</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      font-family: -apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif;
    }
    #boxingCanvas {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
    }
    #webcam {
      position: fixed;
      top: 16px; right: 16px;
      width: 160px; height: 120px;
      border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.2);
      object-fit: cover;
      transform: scaleX(-1);
      z-index: 10;
    }
    #error {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      color: rgba(255,255,255,0.7);
      font-size: 14px;
      text-align: center;
      white-space: pre-line;
      z-index: 20;
      display: none;
    }

    /* Navigation */
    .nav-link {
      position: fixed;
      bottom: 20px; left: 20px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.6);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      font-size: 12px;
      text-decoration: none;
      z-index: 10;
      transition: background 0.2s;
    }
    .nav-link:hover { background: rgba(255,255,255,0.2); }

    /* HUD */
    .hud {
      position: fixed;
      top: 0; left: 0; right: 0;
      padding: 16px 24px;
      z-index: 15;
      pointer-events: none;
      display: none;
    }
    .hud-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .hud-timer-bar {
      width: 100%;
      height: 4px;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      overflow: hidden;
    }
    .hud-timer-fill {
      height: 100%;
      background: #fff;
      border-radius: 2px;
      transition: width 0.1s linear;
    }
    .hud-bottom {
      position: fixed;
      bottom: 60px; right: 24px;
      color: rgba(255,255,255,0.7);
      font-size: 16px;
      z-index: 15;
      pointer-events: none;
      display: none;
    }

    /* No-hand warning */
    .no-hand-warning {
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255,255,255,0.6);
      font-size: 14px;
      z-index: 15;
      display: none;
    }

    /* Countdown */
    .countdown {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      color: #fff;
      font-size: 120px;
      font-weight: 700;
      z-index: 30;
      display: none;
    }

    /* Guide Modal */
    .guide-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .guide-overlay.hidden { display: none; }
    .guide-modal {
      background: #fff;
      border-radius: 20px;
      width: 340px;
      padding: 32px 28px 28px;
      text-align: center;
      animation: guideIn 0.3s ease-out;
    }
    @keyframes guideIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .guide-title {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 16px;
    }
    .guide-desc {
      font-size: 14px;
      line-height: 1.6;
      color: #666;
      margin-bottom: 24px;
    }
    .guide-start {
      width: 100%;
      padding: 14px 0;
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }
    .guide-start:hover { background: #333; }

    /* Result Modal */
    .result-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .result-overlay.hidden { display: none; }
    .result-modal {
      background: #fff;
      border-radius: 20px;
      width: 340px;
      padding: 32px 28px 28px;
      text-align: center;
      animation: guideIn 0.3s ease-out;
    }
    .result-title {
      font-size: 20px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 24px;
    }
    .result-stats {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 28px;
    }
    .result-stat {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      color: #333;
      padding: 0 8px;
    }
    .result-stat-value {
      font-weight: 700;
    }
    .result-btn {
      width: 100%;
      padding: 14px 0;
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }
    .result-btn:hover { background: #333; }
  </style>
</head>
<body>
  <canvas id="boxingCanvas"></canvas>
  <video id="webcam" autoplay playsinline></video>
  <div id="error"></div>
  <a href="index.html" class="nav-link">&larr; 담타</a>

  <!-- HUD -->
  <div class="hud" id="hud">
    <div class="hud-top">
      <span id="hudTimer">00:30</span>
      <span><span id="hudHits">0</span> hits &nbsp; <span id="hudStrong">0</span> 강타</span>
    </div>
    <div class="hud-timer-bar">
      <div class="hud-timer-fill" id="hudTimerFill" style="width:100%"></div>
    </div>
  </div>
  <div class="hud-bottom" id="hudBottom">
    <span id="hudHPM">0</span> hits/min
  </div>
  <div class="no-hand-warning" id="noHandWarning">주먹을 카메라에 보여주세요</div>

  <!-- Countdown -->
  <div class="countdown" id="countdown"></div>

  <!-- Guide Modal -->
  <div class="guide-overlay" id="guideModal">
    <div class="guide-modal">
      <h2 class="guide-title">샌드백 연습을 시작할까요?</h2>
      <p class="guide-desc">
        주먹을 쥐고 화면의 샌드백을 때려보세요.<br>
        빠르게 치면 강타로 인정돼요!<br>
        30초 라운드가 끝나면 기록을 확인할 수 있어요.
      </p>
      <button class="guide-start" id="guideStart">시작</button>
    </div>
  </div>

  <!-- Result Modal -->
  <div class="result-overlay hidden" id="resultModal">
    <div class="result-modal">
      <h2 class="result-title">라운드 종료!</h2>
      <div class="result-stats">
        <div class="result-stat">
          <span>총 타격</span>
          <span class="result-stat-value" id="resultHits">0</span>
        </div>
        <div class="result-stat">
          <span>강타</span>
          <span class="result-stat-value" id="resultStrong">0</span>
        </div>
        <div class="result-stat">
          <span>타격 속도</span>
          <span class="result-stat-value" id="resultHPM">0 hits/min</span>
        </div>
      </div>
      <button class="result-btn" id="resultRetry">다시 하기</button>
    </div>
  </div>

  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.min.js"></script>
  <script src="js/noise.js"></script>
  <script src="js/boxing/boxing-detection.js"></script>
  <script src="js/boxing/boxing-sandbag.js"></script>
  <script src="js/boxing/boxing-effects.js"></script>
  <script src="js/boxing/boxing-app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML is well-formed**

Open `boxing.html` in browser or run: `python3 -c "from html.parser import HTMLParser; HTMLParser().feed(open('boxing.html').read()); print('OK')"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add boxing.html
git commit -m "feat(boxing): add boxing page with UI structure"
```

---

### Task 6: boxing-app.js — Main Loop & Round Management

**Files:**
- Create: `js/boxing/boxing-app.js`

- [ ] **Step 1: Create the main app orchestrator**

```js
// js/boxing/boxing-app.js
(function () {
  var canvas = document.getElementById('boxingCanvas');
  var ctx = canvas.getContext('2d');
  var video = document.getElementById('webcam');
  var errorEl = document.getElementById('error');

  // UI elements
  var guideModal = document.getElementById('guideModal');
  var guideStart = document.getElementById('guideStart');
  var resultModal = document.getElementById('resultModal');
  var resultRetry = document.getElementById('resultRetry');
  var countdownEl = document.getElementById('countdown');
  var hud = document.getElementById('hud');
  var hudBottom = document.getElementById('hudBottom');
  var hudTimer = document.getElementById('hudTimer');
  var hudTimerFill = document.getElementById('hudTimerFill');
  var hudHits = document.getElementById('hudHits');
  var hudStrong = document.getElementById('hudStrong');
  var hudHPM = document.getElementById('hudHPM');
  var noHandWarning = document.getElementById('noHandWarning');
  var resultHits = document.getElementById('resultHits');
  var resultStrong = document.getElementById('resultStrong');
  var resultHPM = document.getElementById('resultHPM');

  // State
  var ROUND_DURATION = 30000; // 30 seconds
  var state = 'guide'; // guide | countdown | round | result
  var roundStartTime = 0;
  var totalHits = 0;
  var strongHits = 0;
  var lastHandTime = 0;
  var handDetected = false;

  // MediaPipe
  var allHandLandmarks = [];
  var hands;
  var initError = null;

  try {
    hands = new Hands({
      locateFile: function (file) {
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file;
      },
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(function (results) {
      allHandLandmarks = results.multiHandLandmarks && results.multiHandLandmarks.length > 0
        ? results.multiHandLandmarks
        : [];
    });
  } catch (err) {
    initError = 'MediaPipe Hands 로딩 실패: ' + err.message;
  }

  // Per-hand trackers (2 hands max)
  var punchTrackers = [
    BoxingDetection.createPunchTracker(),
    BoxingDetection.createPunchTracker(),
  ];
  var hitCooldowns = [
    BoxingDetection.createHitCooldown(200),
    BoxingDetection.createHitCooldown(200),
  ];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  var lastTime = 0;

  function mainLoop(timestamp) {
    var dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state === 'round') {
      updateRound(dt, timestamp);
    }

    // Always draw sandbag and effects (even during countdown for visual continuity)
    BoxingSandbag.update(dt);
    BoxingSandbag.draw(ctx, canvas.width, canvas.height);

    ctx.save();
    BoxingEffects.update(ctx, dt);
    ctx.restore();

    requestAnimationFrame(mainLoop);
  }

  function updateRound(dt, timestamp) {
    var elapsed = timestamp - roundStartTime;
    var remaining = Math.max(0, ROUND_DURATION - elapsed);

    // Update HUD
    var secs = Math.ceil(remaining / 1000);
    hudTimer.textContent = '00:' + (secs < 10 ? '0' : '') + secs;
    hudTimerFill.style.width = (remaining / ROUND_DURATION * 100) + '%';
    hudHits.textContent = totalHits;
    hudStrong.textContent = strongHits;

    var elapsedSecs = elapsed / 1000;
    var hpm = elapsedSecs > 0 ? Math.round(totalHits / elapsedSecs * 60) : 0;
    hudHPM.textContent = hpm;

    // Check round end
    if (remaining <= 0) {
      endRound(hpm);
      return;
    }

    // Process hand detection
    var now = performance.now();
    var anyHand = false;

    for (var h = 0; h < allHandLandmarks.length; h++) {
      var landmarks = allHandLandmarks[h];
      if (!BoxingDetection.isValidLandmarks(landmarks)) continue;

      anyHand = true;
      lastHandTime = now;

      if (!BoxingDetection.isFist(landmarks)) continue;

      var fistPos = BoxingDetection.getFistPosition(landmarks);
      if (!fistPos) continue;

      // Mirror X for canvas coordinate system
      var mirroredPos = { x: 1 - fistPos.x, y: fistPos.y };

      var trackResult = punchTrackers[h].update(mirroredPos);
      var hitbox = BoxingSandbag.getHitbox();
      var hitResult = BoxingDetection.checkHit(mirroredPos, trackResult.displacement, hitbox);

      if (hitResult.hit && hitCooldowns[h].canHit(now)) {
        hitCooldowns[h].recordHit(now);
        totalHits++;
        if (hitResult.power === 'strong') strongHits++;

        // Convert to canvas pixels for effects
        var cx = canvas.width * mirroredPos.x;
        var cy = canvas.height * mirroredPos.y;
        BoxingEffects.emit(cx, cy, hitResult.power);
        BoxingSandbag.applyHit(hitResult.power, mirroredPos.x);
      }
    }

    // No-hand warning
    handDetected = anyHand;
    if (!anyHand && now - lastHandTime > 5000) {
      noHandWarning.style.display = 'block';
    } else {
      noHandWarning.style.display = 'none';
    }
  }

  function endRound(hpm) {
    state = 'result';
    hud.style.display = 'none';
    hudBottom.style.display = 'none';
    noHandWarning.style.display = 'none';
    resultHits.textContent = totalHits;
    resultStrong.textContent = strongHits;
    resultHPM.textContent = hpm + ' hits/min';
    resultModal.classList.remove('hidden');
  }

  function startCountdown() {
    state = 'countdown';
    guideModal.classList.add('hidden');
    resultModal.classList.add('hidden');

    var count = 3;
    countdownEl.textContent = count;
    countdownEl.style.display = 'block';

    var interval = setInterval(function () {
      count--;
      if (count > 0) {
        countdownEl.textContent = count;
      } else {
        clearInterval(interval);
        countdownEl.style.display = 'none';
        startRound();
      }
    }, 1000);
  }

  function startRound() {
    state = 'round';
    totalHits = 0;
    strongHits = 0;
    lastHandTime = performance.now();
    roundStartTime = performance.now();
    BoxingSandbag.reset();
    BoxingEffects.reset();
    punchTrackers.forEach(function (t) { t.reset(); });

    hud.style.display = 'block';
    hudBottom.style.display = 'block';
  }

  // Webcam init
  async function initWebcam() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      errorEl.textContent = '웹캠 접근이 필요합니다.\n브라우저에서 카메라 권한을 허용해주세요.';
      errorEl.style.display = 'block';
      return false;
    }
  }

  // Feed frames to MediaPipe
  async function feedLoop() {
    if (hands && video.readyState >= 2) {
      try {
        await hands.send({ image: video });
      } catch (e) { /* ignore */ }
    }
    requestAnimationFrame(feedLoop);
  }

  async function init() {
    if (initError) {
      errorEl.textContent = initError + '\n페이지를 새로고침해주세요.';
      errorEl.style.display = 'block';
      return;
    }

    var camReady = await initWebcam();
    if (camReady) {
      feedLoop();
      requestAnimationFrame(mainLoop);
    }
  }

  // Inject boxing link into damta page (if loaded from index.html context — no-op here)
  // For boxing.html → index.html, the nav-link in HTML handles it.
  // For index.html → boxing.html, inject a link dynamically if on that page.
  (function injectBoxingLink() {
    if (window.location.pathname.indexOf('boxing') >= 0) return;
    var modeBtn = document.getElementById('modeBtn');
    if (!modeBtn) return;
    var link = document.createElement('a');
    link.href = 'boxing.html';
    link.textContent = '🥊';
    link.style.cssText =
      'position:fixed;bottom:20px;left:80px;padding:8px 12px;' +
      'background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);' +
      'border:1px solid rgba(255,255,255,0.2);border-radius:6px;' +
      'font-size:14px;text-decoration:none;z-index:10;transition:background 0.2s;';
    link.addEventListener('mouseenter', function () { link.style.background = 'rgba(255,255,255,0.2)'; });
    link.addEventListener('mouseleave', function () { link.style.background = 'rgba(255,255,255,0.1)'; });
    document.body.appendChild(link);
  })();

  // Event listeners
  guideStart.addEventListener('click', function () {
    startCountdown();
  });

  resultRetry.addEventListener('click', function () {
    startCountdown();
  });

  init();
})();
```

- [ ] **Step 2: Test manually in browser**

Run: `python3 -m http.server 8000` then open `http://localhost:8000/boxing.html`
Expected: Guide modal appears → click start → countdown → round starts with sandbag visible → HUD shows timer

- [ ] **Step 3: Commit**

```bash
git add js/boxing/boxing-app.js
git commit -m "feat(boxing): add main app with round management and MediaPipe integration"
```

---

## Chunk 4: Integration & Polish

### Task 7: Run All Tests & Fix Issues

**Files:**
- All boxing files

- [ ] **Step 1: Run existing tests to verify nothing is broken**

Run: `node --test tests/`
Expected: All existing tests still pass

- [ ] **Step 2: Run boxing-specific tests**

Run: `node --test tests/boxing-detection.test.js`
Expected: All boxing tests pass

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(boxing): test fixes"
```

---

### Task 8: Manual Browser Testing & Adjustments

**Files:**
- May modify any `js/boxing/*.js` file

- [ ] **Step 1: Test full flow in browser**

Open `http://localhost:8000/boxing.html`:
1. Guide modal appears with description
2. Click "시작" → 3-2-1 countdown
3. Sandbag renders in center
4. Raise fist to camera → fist detected
5. Punch toward sandbag → hit detected, sparks appear, sandbag swings
6. Fast punch → strong hit, shockwave + screen shake
7. HUD updates: hits, strong hits, timer countdown
8. 30 seconds → result modal with stats
9. "다시 하기" → new round
10. "← 담타" link works

- [ ] **Step 2: Tune detection thresholds if needed**

Adjust in `boxing-detection.js`:
- `THRESHOLD_NORMAL` (default 0.015)
- `THRESHOLD_STRONG` (default 0.04)
- Hitbox size in `boxing-sandbag.js`

- [ ] **Step 3: Commit tuning changes**

```bash
git add js/boxing/
git commit -m "fix(boxing): tune detection thresholds"
```

---

### Task 9: Final Commit & Deploy

- [ ] **Step 1: Verify all tests pass**

Run: `node --test tests/`
Expected: All pass

- [ ] **Step 2: Verify existing damta app still works**

Open `http://localhost:8000/index.html`
Expected: Smoke detection works normally, no regressions

- [ ] **Step 3: Deploy to Vercel**

Run: `vercel --prod`
Expected: Both `index.html` and `boxing.html` accessible on Vercel
