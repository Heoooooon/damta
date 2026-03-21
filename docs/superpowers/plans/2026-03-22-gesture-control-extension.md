# Gesture Control Browser Extension — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that uses MediaPipe hand tracking to control browser actions (cursor, click, scroll) via hand gestures, with a shared hand-tracking library extracted from the damta project.

**Architecture:** Monorepo with 3 projects: `hand-tracking-core/` (shared UMD library), `gesture-control/` (Chrome extension), and existing `damta/` (unchanged for now). Side Panel runs camera + ML, Service Worker routes messages, Content Script executes browser actions.

**Tech Stack:** Vanilla JS (UMD), MediaPipe Hands, Chrome Extension Manifest V3, Node.js test runner (`node:test`)

**Spec:** `docs/superpowers/specs/2026-03-22-gesture-control-extension-design.md`

---

## Chunk 1: hand-tracking-core Library

### Task 1: landmark-utils.js

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/hand-tracking-core/landmark-utils.js`
- Test: `/Users/gwon-yeheon/CMORE/hand-tracking-core/tests/landmark-utils.test.js`
- Reference: `/Users/gwon-yeheon/CMORE/damta/js/interaction-core.js:34-76`

- [ ] **Step 1: Write failing tests for distance, midpoint, palmWidth**

```javascript
// tests/landmark-utils.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LandmarkUtils = require('../landmark-utils.js');

describe('distance', () => {
  it('returns 0 for same point', () => {
    assert.equal(LandmarkUtils.distance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }), 0);
  });

  it('returns correct euclidean distance', () => {
    const d = LandmarkUtils.distance({ x: 0, y: 0 }, { x: 3, y: 4 });
    assert.ok(Math.abs(d - 5) < 0.0001);
  });
});

describe('midpoint', () => {
  it('returns midpoint of two points', () => {
    const m = LandmarkUtils.midpoint({ x: 0, y: 0 }, { x: 1, y: 1 });
    assert.deepStrictEqual(m, { x: 0.5, y: 0.5 });
  });
});

describe('palmWidth', () => {
  it('returns distance from wrist(0) to middle MCP(9)', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    landmarks[0] = { x: 0, y: 0 };
    landmarks[9] = { x: 0.3, y: 0.4 };
    const w = LandmarkUtils.palmWidth(landmarks);
    assert.ok(Math.abs(w - 0.5) < 0.0001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/landmark-utils.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement distance, midpoint, palmWidth**

```javascript
// landmark-utils.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LandmarkUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function palmWidth(landmarks) {
    return distance(landmarks[0], landmarks[9]);
  }

  return { distance, midpoint, palmWidth };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/landmark-utils.test.js`
Expected: 3 tests PASS

- [ ] **Step 5: Write failing tests for fingerExtension, angle, mirrorX**

```javascript
// Append to tests/landmark-utils.test.js

describe('fingerExtension', () => {
  it('returns ~1 for fully extended index finger', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    landmarks[0] = { x: 0.5, y: 0.8 }; // wrist
    landmarks[6] = { x: 0.5, y: 0.5 }; // index PIP
    landmarks[8] = { x: 0.5, y: 0.2 }; // index tip (far from wrist)
    const ext = LandmarkUtils.fingerExtension(landmarks, 'index');
    assert.ok(ext > 0.7, `Expected >0.7 but got ${ext}`);
  });

  it('returns ~0 for curled finger', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    landmarks[0] = { x: 0.5, y: 0.8 }; // wrist
    landmarks[6] = { x: 0.5, y: 0.5 }; // index PIP
    landmarks[8] = { x: 0.5, y: 0.55 }; // index tip (near PIP, curled)
    const ext = LandmarkUtils.fingerExtension(landmarks, 'index');
    assert.ok(ext < 0.3, `Expected <0.3 but got ${ext}`);
  });
});

describe('angle', () => {
  it('returns 90 degrees for right angle', () => {
    const a = { x: 1, y: 0 };
    const b = { x: 0, y: 0 }; // vertex
    const c = { x: 0, y: 1 };
    const deg = LandmarkUtils.angle(a, b, c);
    assert.ok(Math.abs(deg - 90) < 0.1);
  });

  it('returns 180 degrees for straight line', () => {
    const a = { x: -1, y: 0 };
    const b = { x: 0, y: 0 };
    const c = { x: 1, y: 0 };
    const deg = LandmarkUtils.angle(a, b, c);
    assert.ok(Math.abs(deg - 180) < 0.1);
  });
});

describe('mirrorX', () => {
  it('mirrors x coordinate', () => {
    const result = LandmarkUtils.mirrorX({ x: 0.3, y: 0.7 });
    assert.deepStrictEqual(result, { x: 0.7, y: 0.7 });
  });
});
```

- [ ] **Step 6: Run test to verify new tests fail**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/landmark-utils.test.js`
Expected: New tests FAIL

- [ ] **Step 7: Implement fingerExtension, angle, mirrorX**

Add to `landmark-utils.js` before the `return` statement:

```javascript
  // Finger index → [tip, pip] landmark indices
  const FINGER_MAP = {
    thumb:  [4, 2],
    index:  [8, 6],
    middle: [12, 10],
    ring:   [16, 14],
    pinky:  [20, 18],
  };

  function fingerExtension(landmarks, fingerName) {
    const mapping = FINGER_MAP[fingerName];
    if (!mapping) return 0;
    const [tipIdx, pipIdx] = mapping;
    const wrist = landmarks[0];
    const tipDist = distance(wrist, landmarks[tipIdx]);
    const pipDist = distance(wrist, landmarks[pipIdx]);
    if (!pipDist) return 0;
    const ratio = tipDist / pipDist;
    return Math.max(0, Math.min(1, (ratio - 1.08) / 0.28));
  }

  function angle(a, b, c) {
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const dot = ba.x * bc.x + ba.y * bc.y;
    const magBA = Math.hypot(ba.x, ba.y);
    const magBC = Math.hypot(bc.x, bc.y);
    if (!magBA || !magBC) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  function mirrorX(landmark) {
    return { x: 1 - landmark.x, y: landmark.y };
  }
```

Update the return statement to include `fingerExtension, angle, mirrorX, FINGER_MAP`.

- [ ] **Step 8: Run all tests**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/landmark-utils.test.js`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/hand-tracking-core
git init
git add landmark-utils.js tests/landmark-utils.test.js
git commit -m "feat: add landmark-utils with distance, midpoint, palmWidth, fingerExtension, angle, mirrorX"
```

---

### Task 2: gesture-smoother.js

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/hand-tracking-core/gesture-smoother.js`
- Test: `/Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-smoother.test.js`
- Reference: `/Users/gwon-yeheon/CMORE/damta/js/interaction-core.js:267-330` (hysteresis/streak pattern)

- [ ] **Step 1: Write failing tests for createEMAFilter**

```javascript
// tests/gesture-smoother.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GestureSmoother = require('../gesture-smoother.js');

describe('createEMAFilter', () => {
  it('returns input on first update', () => {
    const filter = GestureSmoother.createEMAFilter(0.3);
    const result = filter.update({ x: 0.5, y: 0.5 });
    assert.deepStrictEqual(result, { x: 0.5, y: 0.5 });
  });

  it('smooths values toward new input', () => {
    const filter = GestureSmoother.createEMAFilter(0.5);
    filter.update({ x: 0, y: 0 });
    const result = filter.update({ x: 1, y: 1 });
    assert.ok(Math.abs(result.x - 0.5) < 0.01);
    assert.ok(Math.abs(result.y - 0.5) < 0.01);
  });

  it('converges toward steady input', () => {
    const filter = GestureSmoother.createEMAFilter(0.3);
    filter.update({ x: 0, y: 0 });
    let result;
    for (let i = 0; i < 20; i++) {
      result = filter.update({ x: 1, y: 1 });
    }
    assert.ok(Math.abs(result.x - 1) < 0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-smoother.test.js`
Expected: FAIL

- [ ] **Step 3: Implement createEMAFilter**

```javascript
// gesture-smoother.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GestureSmoother = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function createEMAFilter(alpha) {
    let prev = null;
    let _alpha = alpha;
    return {
      update(point) {
        if (!prev) {
          prev = { x: point.x, y: point.y };
          return { x: point.x, y: point.y };
        }
        prev = {
          x: _alpha * point.x + (1 - _alpha) * prev.x,
          y: _alpha * point.y + (1 - _alpha) * prev.y,
        };
        return { x: prev.x, y: prev.y };
      },
      reset() { prev = null; },
      setAlpha(a) { _alpha = a; },
    };
  }

  return { createEMAFilter };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-smoother.test.js`
Expected: PASS

- [ ] **Step 5: Write failing tests for createHysteresis, createDeadzone, createFrameStreak**

```javascript
// Append to tests/gesture-smoother.test.js

describe('createHysteresis', () => {
  it('activates above onThreshold', () => {
    const hyst = GestureSmoother.createHysteresis(0.6, 0.4);
    assert.equal(hyst.update(0.7), true);
  });

  it('stays active between off and on threshold', () => {
    const hyst = GestureSmoother.createHysteresis(0.6, 0.4);
    hyst.update(0.7); // activate
    assert.equal(hyst.update(0.5), true); // between thresholds — stays active
  });

  it('deactivates below offThreshold', () => {
    const hyst = GestureSmoother.createHysteresis(0.6, 0.4);
    hyst.update(0.7); // activate
    assert.equal(hyst.update(0.3), false); // below off
  });
});

describe('createDeadzone', () => {
  it('returns zero for small changes', () => {
    const dz = GestureSmoother.createDeadzone(0.05);
    assert.equal(dz.filter(0.01), 0);
    assert.equal(dz.filter(-0.03), 0);
  });

  it('passes through values above threshold', () => {
    const dz = GestureSmoother.createDeadzone(0.05);
    assert.equal(dz.filter(0.1), 0.1);
    assert.equal(dz.filter(-0.08), -0.08);
  });
});

describe('createFrameStreak', () => {
  it('does not activate before required frames', () => {
    const streak = GestureSmoother.createFrameStreak(3);
    assert.equal(streak.update(true), false);
    assert.equal(streak.update(true), false);
  });

  it('activates after required consecutive frames', () => {
    const streak = GestureSmoother.createFrameStreak(3);
    streak.update(true);
    streak.update(true);
    assert.equal(streak.update(true), true);
  });

  it('resets on false input', () => {
    const streak = GestureSmoother.createFrameStreak(3);
    streak.update(true);
    streak.update(true);
    streak.update(false); // reset
    assert.equal(streak.update(true), false);
  });
});
```

- [ ] **Step 6: Run test to verify new tests fail**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-smoother.test.js`
Expected: New tests FAIL

- [ ] **Step 7: Implement createHysteresis, createDeadzone, createFrameStreak**

Add to `gesture-smoother.js` before the `return`:

```javascript
  function createHysteresis(onThreshold, offThreshold) {
    let active = false;
    return {
      update(value) {
        if (active) {
          if (value < offThreshold) active = false;
        } else {
          if (value >= onThreshold) active = true;
        }
        return active;
      },
      reset() { active = false; },
      isActive() { return active; },
    };
  }

  function createDeadzone(threshold) {
    return {
      filter(value) {
        return Math.abs(value) < threshold ? 0 : value;
      },
    };
  }

  function createFrameStreak(requiredFrames) {
    let count = 0;
    return {
      update(detected) {
        if (detected) {
          count++;
        } else {
          count = 0;
        }
        return count >= requiredFrames;
      },
      reset() { count = 0; },
    };
  }
```

Update return to include all four functions.

- [ ] **Step 8: Run all tests**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-smoother.test.js`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/hand-tracking-core
git add gesture-smoother.js tests/gesture-smoother.test.js
git commit -m "feat: add gesture-smoother with EMA filter, hysteresis, deadzone, frame streak"
```

---

### Task 3: gesture-detector.js

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/hand-tracking-core/gesture-detector.js`
- Test: `/Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
- Depends on: `landmark-utils.js`

- [ ] **Step 1: Write failing tests for detectPinch**

```javascript
// tests/gesture-detector.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GestureDetector = require('../gesture-detector.js');

// Helper: create 21 landmarks with all fingers at a default position
function makeLandmarks(overrides = {}) {
  const lm = Array.from({ length: 21 }, (_, i) => ({ x: 0.5, y: 0.5 }));
  // Wrist
  lm[0] = { x: 0.5, y: 0.85 };
  // Thumb: base to tip
  lm[1] = { x: 0.58, y: 0.75 }; lm[2] = { x: 0.62, y: 0.65 };
  lm[3] = { x: 0.64, y: 0.55 }; lm[4] = { x: 0.65, y: 0.48 };
  // Index: base to tip
  lm[5] = { x: 0.55, y: 0.6 }; lm[6] = { x: 0.55, y: 0.5 };
  lm[7] = { x: 0.55, y: 0.4 }; lm[8] = { x: 0.55, y: 0.3 };
  // Middle: base to tip
  lm[9] = { x: 0.5, y: 0.58 }; lm[10] = { x: 0.5, y: 0.48 };
  lm[11] = { x: 0.5, y: 0.38 }; lm[12] = { x: 0.5, y: 0.28 };
  // Ring: curled
  lm[13] = { x: 0.45, y: 0.6 }; lm[14] = { x: 0.44, y: 0.55 };
  lm[15] = { x: 0.43, y: 0.58 }; lm[16] = { x: 0.43, y: 0.62 };
  // Pinky: curled
  lm[17] = { x: 0.4, y: 0.63 }; lm[18] = { x: 0.39, y: 0.6 };
  lm[19] = { x: 0.38, y: 0.63 }; lm[20] = { x: 0.38, y: 0.66 };

  for (const [idx, pos] of Object.entries(overrides)) {
    lm[Number(idx)] = pos;
  }
  return lm;
}

describe('detectPinch', () => {
  it('detects pinch when thumb and index tips are close', () => {
    const lm = makeLandmarks({
      4: { x: 0.55, y: 0.35 },  // thumb tip near index tip
      8: { x: 0.55, y: 0.33 },  // index tip
    });
    const result = GestureDetector.detectPinch(lm);
    assert.equal(result.active, true);
    assert.ok(result.pinchPos);
    assert.ok(result.gap < 0.1, `gap ${result.gap} should be < 0.1`);
  });

  it('does not detect pinch when fingers are apart', () => {
    const lm = makeLandmarks(); // default — thumb and index far apart
    const result = GestureDetector.detectPinch(lm);
    assert.equal(result.active, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
Expected: FAIL

- [ ] **Step 3: Implement detectPinch**

```javascript
// gesture-detector.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GestureDetector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Inline minimal utils to avoid cross-module dependency in <script> tag loading
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function palmW(lm) { return dist(lm[0], lm[9]); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function extRatio(lm, tipIdx, pipIdx) {
    const wrist = lm[0];
    const tipD = dist(wrist, lm[tipIdx]);
    const pipD = dist(wrist, lm[pipIdx]);
    return pipD ? tipD / pipD : 0;
  }
  function extScore(lm, tipIdx, pipIdx) {
    return clamp01((extRatio(lm, tipIdx, pipIdx) - 1.08) / 0.28);
  }

  function detectPinch(landmarks) {
    if (!landmarks || landmarks.length < 21) return { active: false, pinchPos: null, gap: 1 };
    const w = palmW(landmarks);
    if (!w) return { active: false, pinchPos: null, gap: 1 };
    const gap = dist(landmarks[4], landmarks[8]) / w;
    const thumbDist = dist(landmarks[4], landmarks[0]) / w;
    const indexDist = dist(landmarks[8], landmarks[0]) / w;
    const awayFromPalm = thumbDist > 0.5 && indexDist > 0.5;
    const active = gap < 0.1 && awayFromPalm;
    return {
      active,
      pinchPos: active ? mid(landmarks[4], landmarks[8]) : null,
      gap,
    };
  }

  return { detectPinch };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
Expected: PASS

- [ ] **Step 5: Write failing tests for detectPointing**

```javascript
// Append to tests/gesture-detector.test.js

describe('detectPointing', () => {
  it('detects pointing when only index is extended', () => {
    const lm = makeLandmarks(); // index+middle extended by default
    // Curl middle finger
    lm[12] = { x: 0.5, y: 0.55 };
    const result = GestureDetector.detectPointing(lm);
    assert.equal(result.active, true);
    assert.ok(result.tipPos);
  });

  it('does not detect pointing when multiple fingers extended', () => {
    const lm = makeLandmarks(); // both index and middle extended
    const result = GestureDetector.detectPointing(lm);
    assert.equal(result.active, false);
  });
});
```

- [ ] **Step 6: Run to verify fail, then implement detectPointing**

```javascript
  function detectPointing(landmarks) {
    if (!landmarks || landmarks.length < 21) return { active: false, tipPos: null };
    const indexExt = extScore(landmarks, 8, 6);
    const middleExt = extScore(landmarks, 12, 10);
    const ringExt = extScore(landmarks, 16, 14);
    const pinkyExt = extScore(landmarks, 20, 18);
    const active = indexExt > 0.7 && middleExt < 0.4 && ringExt < 0.4 && pinkyExt < 0.4;
    return {
      active,
      tipPos: active ? { x: landmarks[8].x, y: landmarks[8].y } : null,
    };
  }
```

Add `detectPointing` to the return object.

- [ ] **Step 7: Run tests, verify pass**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
Expected: All PASS

- [ ] **Step 8: Write failing tests for detectTwoFingerSlide**

```javascript
describe('detectTwoFingerSlide', () => {
  it('detects vertical slide with two fingers extended', () => {
    const prev = makeLandmarks();
    const curr = makeLandmarks();
    // Move index and middle tips up (Y decreases)
    curr[8] = { x: 0.55, y: 0.2 };
    curr[12] = { x: 0.5, y: 0.18 };
    const result = GestureDetector.detectTwoFingerSlide(curr, prev);
    assert.equal(result.active, true);
    assert.ok(result.deltaY < 0, 'deltaY should be negative for upward motion');
  });

  it('does not detect when only one finger extended', () => {
    const prev = makeLandmarks();
    const curr = makeLandmarks();
    curr[12] = { x: 0.5, y: 0.55 }; // curl middle
    const result = GestureDetector.detectTwoFingerSlide(curr, prev);
    assert.equal(result.active, false);
  });
});
```

- [ ] **Step 9: Implement detectTwoFingerSlide**

```javascript
  function detectTwoFingerSlide(landmarks, prevLandmarks) {
    if (!landmarks || landmarks.length < 21 || !prevLandmarks || prevLandmarks.length < 21) {
      return { active: false, deltaY: 0 };
    }
    const indexExt = extScore(landmarks, 8, 6);
    const middleExt = extScore(landmarks, 12, 10);
    const ringExt = extScore(landmarks, 16, 14);
    const pinkyExt = extScore(landmarks, 20, 18);
    const twoFingers = indexExt > 0.7 && middleExt > 0.7 && ringExt < 0.4 && pinkyExt < 0.4;
    if (!twoFingers) return { active: false, deltaY: 0 };

    const currMid = mid(landmarks[8], landmarks[12]);
    const prevMid = mid(prevLandmarks[8], prevLandmarks[12]);
    const deltaY = currMid.y - prevMid.y;
    return { active: true, deltaY };
  }
```

- [ ] **Step 10: Run all tests, verify pass**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
Expected: All PASS

- [ ] **Step 11: Write failing test for detectOpenPalm**

```javascript
describe('detectOpenPalm', () => {
  it('detects when all 5 fingers extended', () => {
    const lm = makeLandmarks();
    // Extend all fingers
    lm[4] = { x: 0.68, y: 0.3 };   // thumb tip extended
    lm[8] = { x: 0.55, y: 0.2 };   // index
    lm[12] = { x: 0.5, y: 0.18 };  // middle
    lm[16] = { x: 0.45, y: 0.22 }; // ring
    lm[20] = { x: 0.4, y: 0.28 };  // pinky
    // Adjust PIPs so extension ratio is good
    lm[14] = { x: 0.44, y: 0.42 }; // ring PIP
    lm[18] = { x: 0.39, y: 0.45 }; // pinky PIP
    const result = GestureDetector.detectOpenPalm(lm);
    assert.equal(result.active, true);
  });
});
```

- [ ] **Step 12: Implement detectOpenPalm**

```javascript
  function detectOpenPalm(landmarks) {
    if (!landmarks || landmarks.length < 21) return { active: false };
    const indexExt = extScore(landmarks, 8, 6);
    const middleExt = extScore(landmarks, 12, 10);
    const ringExt = extScore(landmarks, 16, 14);
    const pinkyExt = extScore(landmarks, 20, 18);
    // Thumb uses different landmarks
    const thumbExt = extScore(landmarks, 4, 2);
    const active = thumbExt > 0.5 && indexExt > 0.6 && middleExt > 0.6 && ringExt > 0.6 && pinkyExt > 0.6;
    return { active };
  }
```

- [ ] **Step 13: Run all tests, verify pass**

Run: `node --test /Users/gwon-yeheon/CMORE/hand-tracking-core/tests/gesture-detector.test.js`
Expected: All PASS

- [ ] **Step 14: Add detectSwipe stub for Phase 2**

```javascript
  // Phase 2: Swipe detection (not used in MVP, placeholder for future)
  // Requires landmark history buffer to calculate velocity
  function detectSwipe(landmarks, history) {
    // TODO: Phase 2 implementation
    // Will track palm center velocity over history buffer
    // Active when: all 5 fingers extended + horizontal speed > threshold
    return { active: false, direction: null };
  }
```

Add `detectSwipe` to the return object. This is a documented placeholder — the interface is defined so panel.js can call it in Phase 2 without changing gesture-detector.js's API.

- [ ] **Step 15: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/hand-tracking-core
git add gesture-detector.js tests/gesture-detector.test.js
git commit -m "feat: add gesture-detector with detectPinch, detectPointing, detectTwoFingerSlide, detectOpenPalm, detectSwipe stub"
```

---

### Task 4: mediapipe-loader.js

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/hand-tracking-core/mediapipe-loader.js`
- Reference: `/Users/gwon-yeheon/CMORE/damta/js/hand.js`

This module depends on MediaPipe (browser-only), so it cannot be Node-tested. Manual test only.

- [ ] **Step 1: Write mediapipe-loader.js**

```javascript
// mediapipe-loader.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MediaPipeLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function createHandTracker(options) {
    const opts = Object.assign({
      maxHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
      locateFile: null,
    }, options);

    // Requires MediaPipe Hands to be loaded (CDN or bundled)
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands not loaded. Include the script before calling createHandTracker.');
    }

    const locateFile = opts.locateFile || function (file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file;
    };

    const hands = new Hands({ locateFile: locateFile });
    hands.setOptions({
      maxNumHands: opts.maxHands,
      modelComplexity: opts.modelComplexity,
      minDetectionConfidence: opts.minDetectionConfidence,
      minTrackingConfidence: opts.minTrackingConfidence,
    });

    let onResultsCallback = null;
    hands.onResults(function (results) {
      if (onResultsCallback) {
        onResultsCallback(results.multiHandLandmarks || []);
      }
    });

    return {
      send: function (videoElement) { return hands.send({ image: videoElement }); },
      onResults: function (cb) { onResultsCallback = cb; },
      setOptions: function (newOpts) { hands.setOptions(newOpts); },
    };
  }

  function connectCamera(videoElement, tracker, options) {
    const constraints = Object.assign({
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    }, options);

    return navigator.mediaDevices.getUserMedia({ video: constraints })
      .then(function (stream) {
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = function () { videoElement.play(); };

        var busy = false;
        function processFrame() {
          if (videoElement.readyState >= 2 && !busy) {
            busy = true;
            tracker.send(videoElement).then(function () {
              busy = false;
            }).catch(function () {
              busy = false;
            });
          }
          requestAnimationFrame(processFrame);
        }
        requestAnimationFrame(processFrame);

        return stream;
      });
  }

  return { createHandTracker, connectCamera };
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/hand-tracking-core
git add mediapipe-loader.js
git commit -m "feat: add mediapipe-loader for browser-based hand tracking initialization"
```

---

## Chunk 2: Chrome Extension Scaffold

### Task 5: Extension manifest and file structure

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/manifest.json`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/shared/messages.js`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/content/cursor.css`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/background/service-worker.js`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/content/content-script.js`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/side-panel/panel.html`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/side-panel/panel.js`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /Users/gwon-yeheon/CMORE/gesture-control/{background,content,side-panel,shared,lib/mediapipe,icons}
```

- [ ] **Step 2: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Gesture Control",
  "version": "0.1.0",
  "description": "Control your browser with hand gestures using your webcam",
  "minimum_chrome_version": "114",
  "permissions": ["sidePanel", "tabs", "scripting"],
  "host_permissions": ["<all_urls>"],
  "side_panel": {
    "default_path": "side-panel/panel.html"
  },
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["shared/messages.js", "content/content-script.js"],
    "css": ["content/cursor.css"],
    "run_at": "document_idle"
  }],
  "web_accessible_resources": [{
    "resources": ["lib/mediapipe/*"],
    "matches": ["<all_urls>"]
  }],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 3: Create shared/messages.js**

```javascript
// Message type constants and factory functions
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Messages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const TYPES = {
    GESTURE_MOVE: 'GESTURE_MOVE',
    GESTURE_CLICK: 'GESTURE_CLICK',
    GESTURE_SCROLL: 'GESTURE_SCROLL',
    GESTURE_NAVIGATE: 'GESTURE_NAVIGATE',
    CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
    CONTENT_SCRIPT_LIMITED: 'CONTENT_SCRIPT_LIMITED',
    TOGGLE_ACTIVE: 'TOGGLE_ACTIVE',
  };

  function move(nx, ny) {
    return { type: TYPES.GESTURE_MOVE, nx: nx, ny: ny };
  }

  function click(nx, ny) {
    return { type: TYPES.GESTURE_CLICK, nx: nx, ny: ny };
  }

  function scroll(deltaY) {
    return { type: TYPES.GESTURE_SCROLL, deltaY: deltaY };
  }

  function navigate(direction) {
    return { type: TYPES.GESTURE_NAVIGATE, direction: direction };
  }

  return { TYPES, move, click, scroll, navigate };
});
```

- [ ] **Step 4: Commit scaffold**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git init
git add manifest.json shared/messages.js
git commit -m "feat: add extension scaffold with manifest.json and message protocol"
```

---

### Task 6: Content Script — cursor overlay and actions

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/content/content-script.js`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/content/cursor.css`

- [ ] **Step 1: Create cursor.css**

```css
.gesture-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(66, 133, 244, 0.7);
  border: 2px solid rgba(255, 255, 255, 0.9);
  pointer-events: none;
  z-index: 2147483647;
  transform: translate(-50%, -50%);
  transition: opacity 0.15s;
  will-change: transform;
  display: none;
}

.gesture-cursor--active {
  display: block;
}

.gesture-cursor--clicking {
  background: rgba(234, 67, 53, 0.8);
  transform: translate(-50%, -50%) scale(1.4);
  transition: transform 0.1s, background 0.1s;
}

.gesture-cursor--scrolling {
  background: rgba(52, 168, 83, 0.7);
}
```

- [ ] **Step 2: Create content-script.js**

```javascript
(function () {
  'use strict';

  var cursor = null;
  var active = false;
  var M = typeof Messages !== 'undefined' ? Messages.TYPES : {};

  function initCursor() {
    try {
      // Guard against duplicate cursors (e.g., extension update re-injection)
      var existing = document.querySelector('.gesture-cursor');
      if (existing) {
        cursor = existing;
        return true;
      }
      cursor = document.createElement('div');
      cursor.className = 'gesture-cursor';
      document.documentElement.appendChild(cursor);
      return true;
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_LIMITED',
        reason: 'csp',
      });
      return false;
    }
  }

  function moveCursor(nx, ny) {
    if (!cursor) return;
    var x = window.innerWidth * (1 - nx);
    var y = window.innerHeight * ny;
    cursor.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%)';
  }

  function performClick(nx, ny) {
    if (!cursor) return;
    var x = window.innerWidth * (1 - nx);
    var y = window.innerHeight * ny;

    cursor.classList.add('gesture-cursor--clicking');
    setTimeout(function () {
      cursor.classList.remove('gesture-cursor--clicking');
    }, 200);

    var el = document.elementFromPoint(x, y);
    if (el) {
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }));
    }
  }

  function performScroll(deltaY) {
    var scrollAmount = deltaY * window.innerHeight * 3;
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'TOGGLE_ACTIVE') {
      active = msg.active;
      if (cursor) {
        cursor.classList.toggle('gesture-cursor--active', active);
      }
      return;
    }

    if (!active || !cursor) return;

    switch (msg.type) {
      case 'GESTURE_MOVE':
        moveCursor(msg.nx, msg.ny);
        break;
      case 'GESTURE_CLICK':
        moveCursor(msg.nx, msg.ny);
        performClick(msg.nx, msg.ny);
        break;
      case 'GESTURE_SCROLL':
        if (cursor) cursor.classList.add('gesture-cursor--scrolling');
        performScroll(msg.deltaY);
        setTimeout(function () {
          if (cursor) cursor.classList.remove('gesture-cursor--scrolling');
        }, 300);
        break;
    }
  });

  var ready = initCursor();
  if (ready) {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
  }
})();
```

- [ ] **Step 3: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git add content/content-script.js content/cursor.css
git commit -m "feat: add content script with virtual cursor, click, and scroll"
```

---

### Task 7: Service Worker — stateless message router

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/background/service-worker.js`

- [ ] **Step 1: Write service-worker.js**

```javascript
// Track whether gesture control is active (set by side panel toggle)
var gestureActive = false;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // Track active state for tab switch re-notification
  if (msg.type === 'TOGGLE_ACTIVE') {
    gestureActive = msg.active;
  }

  if (msg.type === 'GESTURE_NAVIGATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return;
      if (msg.direction === 'back') {
        chrome.tabs.goBack(tabs[0].id);
      } else if (msg.direction === 'forward') {
        chrome.tabs.goForward(tabs[0].id);
      }
    });
    return;
  }

  // Route content script status messages back to side panel
  if (msg.type === 'CONTENT_SCRIPT_READY' || msg.type === 'CONTENT_SCRIPT_LIMITED') {
    // Forward to all extension pages (side panel will pick it up)
    chrome.runtime.sendMessage(msg).catch(function () {});
    return;
  }

  // Route gesture messages from side panel to active tab's content script
  if (msg.type === 'GESTURE_MOVE' || msg.type === 'GESTURE_CLICK' ||
      msg.type === 'GESTURE_SCROLL' || msg.type === 'TOGGLE_ACTIVE') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, msg).catch(function () {
        // Content script not available on this page — ignore
      });
    });
    return;
  }
});

// When user switches tabs, notify new tab of current active state
chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.tabs.sendMessage(activeInfo.tabId, {
    type: 'TOGGLE_ACTIVE',
    active: gestureActive,
  }).catch(function () {});
});

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git add background/service-worker.js
git commit -m "feat: add stateless service worker for message routing"
```

---

### Task 8: Side Panel — camera + gesture detection UI

**Files:**
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/side-panel/panel.html`
- Create: `/Users/gwon-yeheon/CMORE/gesture-control/side-panel/panel.js`

- [ ] **Step 1: Create panel.html**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Gesture Control</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 12px; }
    .video-container { position: relative; width: 100%; border-radius: 8px; overflow: hidden; background: #000; }
    video { width: 100%; display: block; transform: scaleX(-1); }
    .controls { margin-top: 12px; }
    .toggle-btn {
      width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px;
      cursor: pointer; font-weight: 600; transition: background 0.2s;
    }
    .toggle-btn--off { background: #4CAF50; color: white; }
    .toggle-btn--on { background: #f44336; color: white; }
    .status { margin-top: 10px; padding: 8px; background: #16213e; border-radius: 6px; font-size: 13px; }
    .gesture-label { font-weight: 600; color: #64b5f6; }
    .slider-row { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .slider-row input { flex: 1; }
  </style>
</head>
<body>
  <div class="video-container">
    <video id="video" playsinline></video>
  </div>

  <div class="controls">
    <button id="toggleBtn" class="toggle-btn toggle-btn--off">Start</button>

    <div class="slider-row">
      <span>감도</span>
      <input type="range" id="sensitivity" min="10" max="80" value="30">
      <span id="sensitivityVal">0.30</span>
    </div>

    <div class="status">
      상태: <span id="gestureStatus" class="gesture-label">대기중</span>
    </div>
  </div>

  <!-- Shared modules -->
  <script src="../shared/messages.js"></script>

  <!-- hand-tracking-core scripts -->
  <script src="../lib/hand-tracking-core/landmark-utils.js"></script>
  <script src="../lib/hand-tracking-core/gesture-detector.js"></script>
  <script src="../lib/hand-tracking-core/gesture-smoother.js"></script>
  <script src="../lib/hand-tracking-core/mediapipe-loader.js"></script>

  <!-- MediaPipe Hands (bundled locally) -->
  <script src="../lib/mediapipe/hands.js"></script>

  <script src="panel.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create panel.js**

```javascript
(function () {
  'use strict';

  var video = document.getElementById('video');
  var toggleBtn = document.getElementById('toggleBtn');
  var gestureStatus = document.getElementById('gestureStatus');
  var sensitivitySlider = document.getElementById('sensitivity');
  var sensitivityVal = document.getElementById('sensitivityVal');

  var running = false;
  var tracker = null;
  var cursorFilter = GestureSmoother.createEMAFilter(0.3);
  var scrollFilter = GestureSmoother.createEMAFilter(0.5);
  var pinchStreak = GestureSmoother.createFrameStreak(2);
  var scrollDeadzone = GestureSmoother.createDeadzone(0.02);
  var prevLandmarks = null;

  var GESTURE_LABELS = {
    pointing: '포인팅 (커서)',
    pinch: '핀치 (클릭)',
    scroll: '스크롤',
    openPalm: '정지',
    none: '인식 없음',
  };

  function sendMessage(msg) {
    chrome.runtime.sendMessage(msg).catch(function () {});
  }

  function processLandmarks(allHands) {
    if (!running || !allHands.length) {
      gestureStatus.textContent = '손 감지 안됨';
      prevLandmarks = null;
      return;
    }

    var landmarks = allHands[0];

    // Priority: pinch > twoFingerSlide > pointing > openPalm
    var pinch = GestureDetector.detectPinch(landmarks);
    var isPinchActive = pinchStreak.update(pinch.active);

    if (isPinchActive) {
      var smoothed = cursorFilter.update(pinch.pinchPos);
      gestureStatus.textContent = GESTURE_LABELS.pinch;
      sendMessage({ type: 'GESTURE_CLICK', nx: smoothed.x, ny: smoothed.y });
      prevLandmarks = landmarks;
      return;
    }

    var slide = GestureDetector.detectTwoFingerSlide(landmarks, prevLandmarks);
    if (slide.active) {
      var filteredDelta = scrollDeadzone.filter(slide.deltaY);
      if (filteredDelta !== 0) {
        var smoothedScroll = scrollFilter.update({ x: 0, y: filteredDelta });
        gestureStatus.textContent = GESTURE_LABELS.scroll;
        sendMessage({ type: 'GESTURE_SCROLL', deltaY: smoothedScroll.y });
      }
      prevLandmarks = landmarks;
      return;
    }

    var pointing = GestureDetector.detectPointing(landmarks);
    if (pointing.active) {
      var smoothedTip = cursorFilter.update(pointing.tipPos);
      gestureStatus.textContent = GESTURE_LABELS.pointing;
      sendMessage({ type: 'GESTURE_MOVE', nx: smoothedTip.x, ny: smoothedTip.y });
      prevLandmarks = landmarks;
      return;
    }

    var palm = GestureDetector.detectOpenPalm(landmarks);
    if (palm.active) {
      gestureStatus.textContent = GESTURE_LABELS.openPalm;
    } else {
      gestureStatus.textContent = GESTURE_LABELS.none;
    }

    prevLandmarks = landmarks;
  }

  function start() {
    tracker = MediaPipeLoader.createHandTracker({
      locateFile: function (file) {
        return chrome.runtime.getURL('lib/mediapipe/' + file);
      },
      maxHands: 1,
      modelComplexity: 0,
    });

    tracker.onResults(processLandmarks);

    MediaPipeLoader.connectCamera(video, tracker).then(function () {
      running = true;
      toggleBtn.textContent = 'Stop';
      toggleBtn.className = 'toggle-btn toggle-btn--on';
      gestureStatus.textContent = '감지 중...';
      sendMessage({ type: 'TOGGLE_ACTIVE', active: true });
    }).catch(function (err) {
      gestureStatus.textContent = '카메라 오류: ' + err.message;
    });
  }

  function stop() {
    running = false;
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(function (t) { t.stop(); });
      video.srcObject = null;
    }
    toggleBtn.textContent = 'Start';
    toggleBtn.className = 'toggle-btn toggle-btn--off';
    gestureStatus.textContent = '대기중';
    sendMessage({ type: 'TOGGLE_ACTIVE', active: false });
    prevLandmarks = null;
    pinchStreak.reset();
    cursorFilter.reset();
  }

  toggleBtn.addEventListener('click', function () {
    if (running) { stop(); } else { start(); }
  });

  sensitivitySlider.addEventListener('input', function () {
    var alpha = Number(sensitivitySlider.value) / 100;
    sensitivityVal.textContent = alpha.toFixed(2);
    cursorFilter.setAlpha(alpha);
  });
})();
```

- [ ] **Step 3: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git add side-panel/panel.html side-panel/panel.js
git commit -m "feat: add side panel with camera feed and gesture detection UI"
```

---

### Task 9: Bundle hand-tracking-core into extension

**Files:**
- Copy: `hand-tracking-core/*.js` → `gesture-control/lib/hand-tracking-core/`

- [ ] **Step 1: Copy library files into extension**

```bash
mkdir -p /Users/gwon-yeheon/CMORE/gesture-control/lib/hand-tracking-core
cp /Users/gwon-yeheon/CMORE/hand-tracking-core/landmark-utils.js \
   /Users/gwon-yeheon/CMORE/hand-tracking-core/gesture-detector.js \
   /Users/gwon-yeheon/CMORE/hand-tracking-core/gesture-smoother.js \
   /Users/gwon-yeheon/CMORE/hand-tracking-core/mediapipe-loader.js \
   /Users/gwon-yeheon/CMORE/gesture-control/lib/hand-tracking-core/
```

- [ ] **Step 2: Download MediaPipe Hands bundle**

Download the MediaPipe Hands JS + WASM files into `gesture-control/lib/mediapipe/`. The specific files needed:

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control/lib/mediapipe
# Download from npm package @mediapipe/hands
npm pack @mediapipe/hands --pack-destination /tmp
tar -xf /tmp/mediapipe-hands-*.tgz -C /tmp
cp /tmp/package/hands.js /tmp/package/hands_solution_packed_assets_loader.js .
cp /tmp/package/*.wasm /tmp/package/*.binarypb /tmp/package/*.data . 2>/dev/null || true
rm -rf /tmp/package /tmp/mediapipe-hands-*.tgz
```

Note: The exact files may vary by MediaPipe version. Verify that `hands.js` exists and the `Hands` constructor works.

- [ ] **Step 3: Create placeholder icons**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control/icons
# Create simple SVG-based placeholder PNGs (replace with real icons later)
# For now create empty placeholder files
touch icon16.png icon48.png icon128.png
```

Note: Replace with actual icon files before publishing. For local development, empty files or simple colored squares work.

- [ ] **Step 4: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git add lib/ icons/
git commit -m "feat: bundle hand-tracking-core library and MediaPipe assets"
```

---

## Chunk 3: Integration Testing & Manual Verification

### Task 10: Messages unit test

**Files:**
- Test: `/Users/gwon-yeheon/CMORE/gesture-control/tests/messages.test.js`

- [ ] **Step 1: Write failing tests for message factories**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Messages = require('../shared/messages.js');

describe('Messages', () => {
  it('creates move message', () => {
    const msg = Messages.move(0.5, 0.3);
    assert.deepStrictEqual(msg, { type: 'GESTURE_MOVE', nx: 0.5, ny: 0.3 });
  });

  it('creates click message', () => {
    const msg = Messages.click(0.4, 0.6);
    assert.deepStrictEqual(msg, { type: 'GESTURE_CLICK', nx: 0.4, ny: 0.6 });
  });

  it('creates scroll message', () => {
    const msg = Messages.scroll(-0.05);
    assert.deepStrictEqual(msg, { type: 'GESTURE_SCROLL', deltaY: -0.05 });
  });

  it('creates navigate message', () => {
    const msg = Messages.navigate('back');
    assert.deepStrictEqual(msg, { type: 'GESTURE_NAVIGATE', direction: 'back' });
  });

  it('exports all type constants', () => {
    assert.ok(Messages.TYPES.GESTURE_MOVE);
    assert.ok(Messages.TYPES.GESTURE_CLICK);
    assert.ok(Messages.TYPES.GESTURE_SCROLL);
    assert.ok(Messages.TYPES.GESTURE_NAVIGATE);
    assert.ok(Messages.TYPES.CONTENT_SCRIPT_READY);
    assert.ok(Messages.TYPES.CONTENT_SCRIPT_LIMITED);
    assert.ok(Messages.TYPES.TOGGLE_ACTIVE);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `node --test /Users/gwon-yeheon/CMORE/gesture-control/tests/messages.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/gwon-yeheon/CMORE/gesture-control
git add tests/messages.test.js
git commit -m "test: add unit tests for message protocol"
```

---

### Task 11: Manual integration test in Chrome

- [ ] **Step 1: Load the extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `/Users/gwon-yeheon/CMORE/gesture-control/`
5. Verify extension loads without errors

- [ ] **Step 2: Open Side Panel and test camera**

1. Click extension icon → Side Panel opens
2. Click "Start" button
3. Allow camera permission
4. Verify camera feed shows in the panel
5. Verify gesture status shows "손 감지 안됨" or "감지 중..."

- [ ] **Step 3: Test cursor movement**

1. Point index finger at camera (other fingers curled)
2. Verify blue cursor dot appears on the active tab
3. Move hand around — cursor should follow smoothly

- [ ] **Step 4: Test click**

1. Point and move cursor to a clickable element (e.g., a link)
2. Pinch thumb and index finger together
3. Verify cursor turns red briefly and element is clicked

- [ ] **Step 5: Test scroll**

1. Extend index and middle fingers (peace sign)
2. Move hand up and down
3. Verify page scrolls correspondingly

- [ ] **Step 6: Test stop/start toggle**

1. Click "Stop" in Side Panel
2. Verify cursor disappears and gestures stop working
3. Click "Start" — verify everything resumes

- [ ] **Step 7: Document any issues and iterate**

Record bugs/observations and fix as needed. Common issues:
- MediaPipe WASM files not loading → check `web_accessible_resources` paths
- Cursor not appearing → check Content Script injection and CSP
- Click not working on certain sites → expected (`isTrusted: false` limitation)
