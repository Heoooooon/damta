# Tracking Smoother 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 모드에서 공통 사용하는 추적 품질 개선 모듈을 만들고, Smoke 모드에 우선 적용한다.

**Architecture:** UMD 모듈 `tracking-smoother.js`에 PositionSmoother, VelocityPredictor, ConfidenceGate 3개 팩토리를 구현. 각각 상태를 가진 객체를 반환하며 프레임마다 `update()`로 보정된 값을 받는다. Smoke 모드의 `app.js`에서 cigTip, mouth 위치에 적용하고, `interaction-core.js`의 hysteresis는 기존 구조를 유지하되 파라미터만 튜닝한다.

**Tech Stack:** Vanilla JS (UMD), Node.js `node:test`

---

## 파일 구조

| 파일 | 역할 | 동작 |
|------|------|------|
| `js/tracking-smoother.js` | 공통 스무딩 모듈 (UMD) | 신규 생성 |
| `tests/tracking-smoother.test.js` | 모듈 단위 테스트 | 신규 생성 |
| `js/app.js` | Smoke 메인 루프에 smoother 적용 | 수정 |
| `index.html` | script 태그 추가 | 수정 |

---

## Chunk 1: PositionSmoother

### Task 1: PositionSmoother 테스트 작성

**Files:**
- Create: `tests/tracking-smoother.test.js`

- [ ] **Step 1: 테스트 파일 생성**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrackingSmoother = require('../js/tracking-smoother.js');

describe('createPositionSmoother', () => {
  it('returns the first input unchanged', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    const result = s.update({ x: 0.5, y: 0.3 });
    assert.deepStrictEqual(result, { x: 0.5, y: 0.3 });
  });

  it('smooths toward the new position', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    s.update({ x: 0.0, y: 0.0 });
    const result = s.update({ x: 1.0, y: 1.0 });
    // EMA: 0 + (1-0)*0.4 = 0.4
    assert.ok(Math.abs(result.x - 0.4) < 1e-9);
    assert.ok(Math.abs(result.y - 0.4) < 1e-9);
  });

  it('ignores changes within deadzone', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.01 });
    s.update({ x: 0.5, y: 0.5 });
    const result = s.update({ x: 0.505, y: 0.503 });
    // distance ~0.0058 < deadzone 0.01 → unchanged
    assert.deepStrictEqual(result, { x: 0.5, y: 0.5 });
  });

  it('applies smoothing when change exceeds deadzone', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.01 });
    s.update({ x: 0.5, y: 0.5 });
    const result = s.update({ x: 0.6, y: 0.5 });
    // distance 0.1 > deadzone → smoothed
    assert.ok(Math.abs(result.x - 0.54) < 1e-9);
  });

  it('supports 3D positions', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.5 });
    s.update({ x: 0.0, y: 0.0, z: 0.0 });
    const result = s.update({ x: 1.0, y: 1.0, z: 1.0 });
    assert.ok(Math.abs(result.z - 0.5) < 1e-9);
  });

  it('resets state', () => {
    const s = TrackingSmoother.createPositionSmoother({ alpha: 0.4 });
    s.update({ x: 0.5, y: 0.5 });
    s.reset();
    const result = s.update({ x: 0.8, y: 0.8 });
    assert.deepStrictEqual(result, { x: 0.8, y: 0.8 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: FAIL — `Cannot find module '../js/tracking-smoother.js'`

---

### Task 2: PositionSmoother 구현

**Files:**
- Create: `js/tracking-smoother.js`

- [ ] **Step 3: 모듈 스캐폴딩 + PositionSmoother 구현**

```javascript
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.TrackingSmoother = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function createPositionSmoother(options) {
    var alpha = (options && options.alpha) || 0.4;
    var deadzone = (options && options.deadzone) || 0;
    var prev = null;

    function update(pos) {
      if (!prev) {
        prev = { x: pos.x, y: pos.y };
        if (typeof pos.z === 'number') prev.z = pos.z;
        return { x: prev.x, y: prev.y, z: prev.z };
      }

      var dx = pos.x - prev.x;
      var dy = pos.y - prev.y;
      var dz = typeof pos.z === 'number' && typeof prev.z === 'number' ? pos.z - prev.z : 0;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (deadzone > 0 && dist < deadzone) {
        var result = { x: prev.x, y: prev.y };
        if (typeof prev.z === 'number') result.z = prev.z;
        return result;
      }

      prev.x = prev.x + dx * alpha;
      prev.y = prev.y + dy * alpha;
      if (typeof pos.z === 'number') {
        if (typeof prev.z !== 'number') prev.z = pos.z;
        else prev.z = prev.z + dz * alpha;
      }

      var result = { x: prev.x, y: prev.y };
      if (typeof prev.z === 'number') result.z = prev.z;
      return result;
    }

    function reset() {
      prev = null;
    }

    return { update: update, reset: reset };
  }

  return {
    createPositionSmoother: createPositionSmoother,
  };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add js/tracking-smoother.js tests/tracking-smoother.test.js
git commit -m "feat(tracking): PositionSmoother 구현 + 테스트"
```

---

## Chunk 2: VelocityPredictor

### Task 3: VelocityPredictor 테스트 작성

**Files:**
- Modify: `tests/tracking-smoother.test.js`

- [ ] **Step 6: 테스트 추가**

`tests/tracking-smoother.test.js` 하단에 추가:

```javascript
describe('createVelocityPredictor', () => {
  it('returns null when no data has been fed', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    assert.equal(p.predict(1000), null);
  });

  it('returns null after only one feed (no velocity yet)', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    p.feed({ x: 0.5, y: 0.5 }, 0);
    assert.equal(p.predict(16), null);
  });

  it('predicts position based on velocity', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 1.0 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);
    // velocity = 0.1/100 = 0.001 per ms
    // predict at 200ms → 0.1 + 0.001 * 100 = 0.2
    const result = p.predict(200);
    assert.ok(Math.abs(result.x - 0.2) < 1e-6);
    assert.ok(Math.abs(result.y - 0.0) < 1e-6);
  });

  it('returns null when prediction exceeds maxPredictMs', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 1.0 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);
    // 100 + 120 = 220ms 이후 null
    assert.equal(p.predict(300), null);
  });

  it('smooths velocity with alpha', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 });
    p.feed({ x: 0.0, y: 0.0 }, 0);
    p.feed({ x: 0.1, y: 0.0 }, 100);  // raw v = 0.001
    p.feed({ x: 0.1, y: 0.0 }, 200);  // raw v = 0.0, smoothed = 0.001*0.5 = 0.0005
    const result = p.predict(250);
    // 0.1 + 0.0005 * 50 = 0.125
    assert.ok(Math.abs(result.x - 0.125) < 1e-6);
  });

  it('resets state', () => {
    const p = TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120 });
    p.feed({ x: 0.5, y: 0.5 }, 0);
    p.feed({ x: 0.6, y: 0.5 }, 100);
    p.reset();
    assert.equal(p.predict(200), null);
  });
});
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: VelocityPredictor 테스트 FAIL — `createVelocityPredictor is not a function`

---

### Task 4: VelocityPredictor 구현

**Files:**
- Modify: `js/tracking-smoother.js`

- [ ] **Step 8: VelocityPredictor 구현**

`js/tracking-smoother.js`의 return 문 위에 추가:

```javascript
  function createVelocityPredictor(options) {
    var maxPredictMs = (options && options.maxPredictMs) || 120;
    var velocityAlpha = (options && options.velocityAlpha) || 0.5;
    var lastPos = null;
    var lastTime = null;
    var velocity = null;

    function feed(pos, timestampMs) {
      if (lastPos !== null && lastTime !== null) {
        var dt = timestampMs - lastTime;
        if (dt > 0) {
          var rawVx = (pos.x - lastPos.x) / dt;
          var rawVy = (pos.y - lastPos.y) / dt;
          if (velocity === null) {
            velocity = { x: rawVx, y: rawVy };
          } else {
            velocity.x = velocity.x + (rawVx - velocity.x) * velocityAlpha;
            velocity.y = velocity.y + (rawVy - velocity.y) * velocityAlpha;
          }
        }
      }
      lastPos = { x: pos.x, y: pos.y };
      lastTime = timestampMs;
    }

    function predict(timestampMs) {
      if (!lastPos || !velocity || lastTime === null) return null;
      var elapsed = timestampMs - lastTime;
      if (elapsed > maxPredictMs) return null;
      return {
        x: lastPos.x + velocity.x * elapsed,
        y: lastPos.y + velocity.y * elapsed,
      };
    }

    function reset() {
      lastPos = null;
      lastTime = null;
      velocity = null;
    }

    return { feed: feed, predict: predict, reset: reset };
  }
```

return 문에 추가:
```javascript
    createVelocityPredictor: createVelocityPredictor,
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: 전체 PASS

- [ ] **Step 10: 커밋**

```bash
git add js/tracking-smoother.js tests/tracking-smoother.test.js
git commit -m "feat(tracking): VelocityPredictor 구현 + 테스트"
```

---

## Chunk 3: ConfidenceGate

### Task 5: ConfidenceGate 테스트 작성

**Files:**
- Modify: `tests/tracking-smoother.test.js`

- [ ] **Step 11: 테스트 추가**

```javascript
describe('createConfidenceGate', () => {
  it('starts in pending status', () => {
    const g = TrackingSmoother.createConfidenceGate({ detectFrames: 2, lostFrames: 3 });
    const result = g.update({ x: 0.5, y: 0.5 });
    assert.equal(result.status, 'pending');
  });

  it('becomes active after detectFrames consecutive inputs', () => {
    const g = TrackingSmoother.createConfidenceGate({ detectFrames: 2, lostFrames: 3 });
    g.update({ x: 0.5, y: 0.5 });
    const result = g.update({ x: 0.51, y: 0.5 });
    assert.equal(result.status, 'active');
  });

  it('filters jumps exceeding maxJump', () => {
    const g = TrackingSmoother.createConfidenceGate({ maxJump: 0.15, detectFrames: 1, lostFrames: 3 });
    g.update({ x: 0.5, y: 0.5 });
    const result = g.update({ x: 0.9, y: 0.5 }); // jump 0.4 > 0.15
    assert.ok(Math.abs(result.position.x - 0.5) < 1e-9);
  });

  it('becomes lost after lostFrames consecutive nulls', () => {
    const g = TrackingSmoother.createConfidenceGate({ detectFrames: 1, lostFrames: 3 });
    g.update({ x: 0.5, y: 0.5 });  // active
    g.update(null);  // lost streak 1
    g.update(null);  // lost streak 2
    const result = g.update(null);  // lost streak 3
    assert.equal(result.status, 'lost');
  });

  it('recovers from lost to active', () => {
    const g = TrackingSmoother.createConfidenceGate({ detectFrames: 2, lostFrames: 1 });
    g.update({ x: 0.5, y: 0.5 });
    g.update({ x: 0.51, y: 0.5 }); // active
    g.update(null); // lost
    g.update({ x: 0.6, y: 0.5 }); // pending
    const result = g.update({ x: 0.61, y: 0.5 }); // active again
    assert.equal(result.status, 'active');
  });

  it('resets state', () => {
    const g = TrackingSmoother.createConfidenceGate({ detectFrames: 1, lostFrames: 3 });
    g.update({ x: 0.5, y: 0.5 }); // active
    g.reset();
    const result = g.update({ x: 0.6, y: 0.6 });
    assert.equal(result.status, 'pending');
  });
});
```

- [ ] **Step 12: 테스트 실패 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: ConfidenceGate 테스트 FAIL

---

### Task 6: ConfidenceGate 구현

**Files:**
- Modify: `js/tracking-smoother.js`

- [ ] **Step 13: ConfidenceGate 구현**

`js/tracking-smoother.js`의 return 문 위에 추가:

```javascript
  function createConfidenceGate(options) {
    var maxJump = (options && options.maxJump) || 0.15;
    var detectFrames = (options && options.detectFrames) || 2;
    var lostFrames = (options && options.lostFrames) || 3;
    var prev = null;
    var detectStreak = 0;
    var lostStreak = 0;
    var status = 'pending'; // 'pending' | 'active' | 'lost'

    function update(pos) {
      if (!pos) {
        detectStreak = 0;
        lostStreak++;
        if (lostStreak >= lostFrames) {
          status = 'lost';
        }
        return { position: prev, status: status };
      }

      lostStreak = 0;

      // 점프 필터
      if (prev) {
        var dx = pos.x - prev.x;
        var dy = pos.y - prev.y;
        var jump = Math.sqrt(dx * dx + dy * dy);
        if (jump > maxJump) {
          // 비정상 점프 — 이전 값 유지, streak 리셋하지 않음
          return { position: { x: prev.x, y: prev.y }, status: status };
        }
      }

      prev = { x: pos.x, y: pos.y };
      detectStreak++;

      if (detectStreak >= detectFrames) {
        status = 'active';
      } else if (status === 'lost') {
        status = 'pending';
      }

      return { position: { x: prev.x, y: prev.y }, status: status };
    }

    function reset() {
      prev = null;
      detectStreak = 0;
      lostStreak = 0;
      status = 'pending';
    }

    return { update: update, reset: reset };
  }
```

return 문에 추가:
```javascript
    createConfidenceGate: createConfidenceGate,
```

- [ ] **Step 14: 테스트 통과 확인**

Run: `node --test tests/tracking-smoother.test.js`
Expected: 전체 PASS

- [ ] **Step 15: 커밋**

```bash
git add js/tracking-smoother.js tests/tracking-smoother.test.js
git commit -m "feat(tracking): ConfidenceGate 구현 + 테스트"
```

---

## Chunk 4: Smoke 모드 적용

### Task 7: index.html에 script 태그 추가

**Files:**
- Modify: `index.html`

- [ ] **Step 16: script 태그 추가**

`index.html`에서 `<script src="js/noise.js">` 아래, `<script src="js/interaction-core.js">` 위에 추가:

```html
<script src="js/tracking-smoother.js"></script>
```

참고: `index.html`의 현재 script 순서를 확인하고, `interaction-core.js` 이전이면서 다른 의존성 없는 위치에 삽입.

- [ ] **Step 17: 커밋**

```bash
git add index.html
git commit -m "chore: index.html에 tracking-smoother.js 스크립트 추가"
```

---

### Task 8: app.js에 smoother 적용

**Files:**
- Modify: `js/app.js` (lines 1-12, 40-70, 113-127)

- [ ] **Step 18: smoother 인스턴스 생성**

`js/app.js` 상단, `smokeStateMachines` 배열 아래에 추가:

```javascript
  // 손별 위치 스무더 + 예측기
  const cigTipSmoothers = [
    TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.003 }),
    TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.003 }),
  ];
  const cigTipPredictors = [
    TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 }),
    TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 }),
  ];
  const mouthSmoother = TrackingSmoother.createPositionSmoother({ alpha: 0.35, deadzone: 0.002 });
```

- [ ] **Step 19: cigTip 스무딩 적용**

`js/app.js`의 `mainLoop` 내, `handStates`를 순회하는 for 루프에서 cigTip을 smoother에 통과시킨다.

현재 코드 (약 49-57행):
```javascript
    for (let h = 0; h < handStates.length; h++) {
      const handState = handStates[h];
      const smokeResult = smokeStateMachines[h].update({
        poseActive: handState.poseActive,
        cigTip: handState.cigTip,
        mouth,
        faceHeight: faceH,
      }, now);
```

변경:
```javascript
    for (let h = 0; h < handStates.length; h++) {
      const handState = handStates[h];

      // cigTip 스무딩 + 예측
      let smoothedTip = null;
      if (handState.cigTip) {
        smoothedTip = cigTipSmoothers[h].update(handState.cigTip);
        cigTipPredictors[h].feed(smoothedTip, now);
      } else {
        smoothedTip = cigTipPredictors[h].predict(now);
        if (!smoothedTip) {
          cigTipSmoothers[h].reset();
          cigTipPredictors[h].reset();
        }
      }

      const smokeResult = smokeStateMachines[h].update({
        poseActive: handState.poseActive || !!smoothedTip,
        cigTip: smoothedTip,
        mouth: mouthSmoothed,
        faceHeight: faceH,
      }, now);
```

- [ ] **Step 20: mouth 스무딩 적용**

`mainLoop` 내, `mouth` 변수 사용 직후에 스무딩 추가:

```javascript
    const mouth = FaceDetector.getMouth();
    const mouthSmoothed = mouth ? mouthSmoother.update(mouth) : null;
    if (!mouth) mouthSmoother.reset();
```

이후 코드에서 `mouth` 대신 `mouthSmoothed`를 사용. 단, `faceH`와 `faceLandmarks`는 그대로.

- [ ] **Step 21: ember 그리기에도 smoothedTip 반영**

현재 ember 루프 (약 113-127행)에서 `hs.cigTip` 대신 smoothedTip을 사용해야 한다. smoothedTip 배열을 루프 밖에서 저장:

루프 전에:
```javascript
    const smoothedTips = [];
```

cigTip 스무딩 루프 안에서:
```javascript
      smoothedTips.push(smoothedTip);
```

ember 루프에서:
```javascript
    for (let h = 0; h < handStates.length; h++) {
      const hs = handStates[h];
      const tip = smoothedTips[h];
      if ((hs.poseActive || tip) && tip) {
        SmokeSystem.drawEmber(
          ctx,
          tip.x,
          tip.y,
          canvas.width,
          canvas.height,
          SmokeModes.get(),
          smokeResults[h].state,
          now
        );
      }
    }
```

- [ ] **Step 22: 브라우저 동작 확인**

Run: `python3 -m http.server 8000` → 브라우저에서 `localhost:8000` 확인
Expected:
- cigTip 위치가 부드럽게 이동 (떨림 감소)
- 손을 잠깐 가려도 연기가 ~120ms간 이어짐
- 상태 전환(fingertip→inhaling→exhaling)이 정상 동작

- [ ] **Step 23: 커밋**

```bash
git add js/app.js
git commit -m "feat(smoke): cigTip/mouth에 tracking smoother 적용

- PositionSmoother로 위치 떨림 제거
- VelocityPredictor로 추적 손실 시 120ms 외삽
- mouth 위치도 EMA 스무딩 적용"
```

---

## Chunk 5: 파라미터 튜닝 가이드

### Task 9: 튜닝 포인트 정리

이 태스크는 코드 변경이 아닌, 브라우저 테스트 후 조정할 파라미터 목록이다.

| 파라미터 | 현재값 | 조정 방향 | 위치 |
|----------|--------|-----------|------|
| cigTip alpha | 0.4 | 올리면 반응↑ 떨림↑, 내리면 부드러움↑ 지연↑ | `app.js` |
| cigTip deadzone | 0.003 | 올리면 미세 떨림 제거, 내리면 정밀 | `app.js` |
| mouth alpha | 0.35 | cigTip보다 낮게 (입은 덜 빠르게 이동) | `app.js` |
| maxPredictMs | 120 | 올리면 긴 손실 메움, 오예측 위험↑ | `app.js` |
| velocityAlpha | 0.5 | 올리면 최근 속도 반영↑, 노이즈↑ | `app.js` |
| interaction-core lostFrames | 4 | 3으로 줄이면 상태 전환 빨라짐 | `interaction-core.js` |

- [ ] **Step 24: 브라우저 테스트 후 필요시 파라미터 조정**

- [ ] **Step 25: 최종 커밋 (파라미터 변경 시)**

```bash
git add js/app.js
git commit -m "tune(smoke): tracking smoother 파라미터 조정"
```
