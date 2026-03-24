# 연기 흡입/배출 디테일 개선 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smoke 모드의 inhaling/exhaling 상태에서 파티클의 흡입 효과, 배출 방향성, 밀도 그라데이션을 구현한다.

**Architecture:** 3개 독립 변경을 순서대로 적용. (1) smoke-core.js의 exhale 프로필 값 튜닝 (2) interaction-core.js에서 배출 방향 벡터 계산 후 emission에 포함 (3) smoke.js에서 방향성 emit + 흡입력 update 로직 추가. app.js는 새로운 데이터를 전달하는 통로 역할.

**Tech Stack:** Vanilla JS (UMD + IIFE), Node.js `node:test`

---

## 파일 구조

| 파일 | 역할 | 동작 |
|------|------|------|
| `js/smoke-core.js` | exhale-burst/stream 프로필 값 튜닝 | 수정 |
| `js/interaction-core.js` | exhaling 시 direction 계산, inhaling 시 mouth 좌표 전달 | 수정 |
| `js/smoke.js` | 방향성 emit + 흡입력 update | 수정 |
| `js/app.js` | 새 데이터 전달 (direction, inhalingMouth) | 수정 |
| `tests/smoke-core.test.js` | 프로필 값/direction 테스트 | 수정 |

---

## Chunk 1: 밀도/텍스처 그라데이션 (smoke-core.js)

가장 독립적이고 테스트 가능한 부분부터 시작.

### Task 1: exhale-burst 프로필 값 강화

**Files:**
- Modify: `js/smoke-core.js:49-86` (DEFAULT_EMISSIONS.exhaleBurst)
- Test: `tests/smoke-core.test.js`

- [ ] **Step 1: 테스트 작성**

`tests/smoke-core.test.js` 하단에 추가:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SmokeCore = require('../js/smoke-core.js');

// 기존 테스트에 추가
it('exhale-burst has denser profile than before', () => {
  const profile = SmokeCore.getEmissionProfile(null, 'exhale-burst', 0);
  assert.ok(profile.count >= 28, 'count should be >= 28');
  assert.ok(profile.alphaMultiplier >= 1.2, 'alpha should be >= 1.2');
  assert.ok(profile.sizeMultiplier >= 1.3, 'size should be >= 1.3');
  assert.ok(profile.spreadX <= 36, 'spreadX should be tighter');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/smoke-core.test.js`
Expected: FAIL — count is 24, alpha is 1.08

- [ ] **Step 3: smoke-core.js exhale-burst 값 수정**

`js/smoke-core.js`의 `exhaleBurst` 프로필 변경:

```javascript
    exhaleBurst: {
      count: 28,             // 24 → 28
      spreadX: 34,           // 42 → 34 (더 모아서 밀도감)
      spreadY: 14,           // 18 → 14
      velocityX: 2.6,
      velocityY: { min: -3.4, max: -1.3 },
      lifeMultiplier: 1.15,
      sizeMultiplier: 1.4,   // 1.2 → 1.4
      alphaMultiplier: 1.25, // 1.08 → 1.25
      // ... 나머지 동일
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/smoke-core.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add js/smoke-core.js tests/smoke-core.test.js
git commit -m "feat(smoke): exhale-burst 밀도 강화

- count 24→28, alpha 1.08→1.25, size 1.2→1.4
- spreadX/Y 축소로 초기 밀집도 증가"
```

---

### Task 2: exhale-stream 전환 부드럽게 + 후반 감쇠

**Files:**
- Modify: `js/smoke-core.js:87-124` (DEFAULT_EMISSIONS.exhaleStream)
- Modify: `js/smoke-core.js:380-425` (getEmissionProfile exhale-stream 분기)
- Test: `tests/smoke-core.test.js`

- [ ] **Step 6: 테스트 작성**

```javascript
it('exhale-stream at progress=0 is close to burst density', () => {
  const burst = SmokeCore.getEmissionProfile(null, 'exhale-burst', 0);
  const streamStart = SmokeCore.getEmissionProfile(null, 'exhale-stream', 0);
  // progress=0일 때 burst의 80% 이상
  assert.ok(streamStart.count >= burst.count * 0.75, 'stream start count should be near burst');
  assert.ok(streamStart.alphaMultiplier >= burst.alphaMultiplier * 0.75, 'stream start alpha should be near burst');
});

it('exhale-stream fades out more smoothly in later phase', () => {
  const streamEnd = SmokeCore.getEmissionProfile(null, 'exhale-stream', 1.0);
  assert.ok(streamEnd.fadeOutPower >= 1.3, 'fadeOutPower should be >= 1.3');
  assert.ok(streamEnd.fadeOutStart <= 0.5, 'fadeOutStart should be <= 0.5');
});
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `node --test tests/smoke-core.test.js`

- [ ] **Step 8: exhaleStream 기본값 수정**

`js/smoke-core.js`의 `exhaleStream` 변경:

```javascript
    exhaleStream: {
      count: 13,
      spreadX: 28,
      spreadY: 12,
      velocityX: 1.15,
      velocityY: { min: -2.3, max: -0.85 },
      lifeMultiplier: 1,
      sizeMultiplier: 1,
      alphaMultiplier: 0.94,
      turbulence: 0.75,
      riseAccel: 0.0022,
      drag: 0.989,
      lateralDamping: 0.965,
      trailWidth: 2.9,
      trailAlpha: 0.2,
      strandiness: 0.42,
      unravel: 0.5,
      curlStrength: 0.16,
      spreadAccel: 0.1,
      fadeInEnd: 0.14,
      fadeOutStart: 0.48,     // 0.54 → 0.48
      fadeOutPower: 1.35,     // 1.1 → 1.35
      // ... 나머지 동일
```

- [ ] **Step 9: getEmissionProfile에서 burst→stream lerp 추가**

`js/smoke-core.js`의 `getEmissionProfile` 함수 내 `exhale-stream` 분기 수정.

현재는 `stream` 값에서 시작하여 `fingertip`으로 lerp하는데, progress 0~0.3 구간에서 burst→stream 보간을 추가:

```javascript
    if (type === 'exhale-stream') {
      const burst = getBaseProfile(mode, 'exhaleBurst');
      const stream = getBaseProfile(mode, 'exhaleStream');
      const fingertip = getBaseProfile(mode, 'fingertip');

      // progress 0~0.3: burst → stream 전환
      // progress 0.3~1.0: stream → fingertip 전환 (기존)
      var burstBlend = t < 0.3 ? 1 - (t / 0.3) : 0;
      var decayT = t < 0.3 ? 0 : (t - 0.3) / 0.7;

      // burst→stream 보간된 기본값
      var baseCount = lerp(stream.count, burst.count, burstBlend);
      var baseAlpha = lerp(stream.alphaMultiplier, burst.alphaMultiplier, burstBlend);
      var baseSize = lerp(stream.sizeMultiplier, burst.sizeMultiplier, burstBlend);
      var baseSpreadX = lerp(stream.spreadX, burst.spreadX, burstBlend);
      var baseSpreadY = lerp(stream.spreadY, burst.spreadY, burstBlend);

      return {
        count: Math.max(fingertip.count + 2, Math.round(lerp(baseCount, baseCount * 0.72, decayT))),
        spreadX: lerp(baseSpreadX, Math.max(fingertip.spreadX + 8, baseSpreadX * 0.82), decayT),
        spreadY: lerp(baseSpreadY, Math.max(fingertip.spreadY + 4, baseSpreadY * 0.84), decayT),
        // velocityX 이하: stream 기준 유지 (burst와 동일할 필요 없음)
        velocityX: lerp(stream.velocityX, Math.max(fingertip.velocityX * 1.5, stream.velocityX * 0.8), decayT),
        // ... 나머지는 기존 lerp 그대로, t를 decayT로 교체
```

핵심: `count`, `alphaMultiplier`, `sizeMultiplier`, `spreadX`, `spreadY` 5개 값만 burst 보간. 나머지는 기존 stream→fingertip lerp를 `decayT`로 교체.

- [ ] **Step 10: 테스트 통과 확인**

Run: `node --test tests/smoke-core.test.js`
Expected: PASS

- [ ] **Step 11: 커밋**

```bash
git add js/smoke-core.js tests/smoke-core.test.js
git commit -m "feat(smoke): exhale-stream 전환 부드럽게 + 후반 감쇠 개선

- progress 0~0.3에서 burst→stream 보간 추가
- fadeOutStart 0.54→0.48, fadeOutPower 1.1→1.35"
```

---

## Chunk 2: 배출 방향성 (interaction-core.js + smoke.js)

### Task 3: interaction-core에서 exhale direction 계산

**Files:**
- Modify: `js/interaction-core.js:340-496` (createSmokeStateMachine)
- Test: `tests/smoke-core.test.js`

- [ ] **Step 12: 테스트 작성**

```javascript
it('smoke state machine includes direction when transitioning to exhale', () => {
  const InteractionCore = require('../js/interaction-core.js');
  const sm = InteractionCore.createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.4 };
  const faceHeight = 0.3;
  const now = 1000;

  // fingertip → inhaling
  sm.update({ poseActive: true, cigTip: { x: 0.52, y: 0.42 }, mouth, faceHeight }, now);
  sm.update({ poseActive: true, cigTip: { x: 0.51, y: 0.41 }, mouth, faceHeight }, now + 50);

  // inhaling (near mouth)
  const nearTip = { x: 0.5, y: 0.4 };
  sm.update({ poseActive: true, cigTip: nearTip, mouth, faceHeight }, now + 100);
  sm.update({ poseActive: true, cigTip: nearTip, mouth, faceHeight }, now + 300);

  // move away → exhale
  const awayTip = { x: 0.7, y: 0.35 };
  const result = sm.update({ poseActive: true, cigTip: awayTip, mouth, faceHeight }, now + 500);

  if (result.state === 'exhaling') {
    assert.ok(result.emission.direction, 'should have direction');
    assert.ok(typeof result.emission.direction.x === 'number');
    assert.ok(typeof result.emission.direction.y === 'number');
    // direction은 mouth→cigTip 방향
    assert.ok(result.emission.direction.x > 0, 'should point away from mouth');
  }
});
```

- [ ] **Step 13: 테스트 실패 확인**

Run: `node --test tests/smoke-core.test.js`

- [ ] **Step 14: interaction-core.js에서 direction 계산 추가**

`js/interaction-core.js`의 `createSmokeStateMachine` 내 exhaling 전환 지점 수정.

현재 코드 (약 456-473행):
```javascript
        if (...) {
          smokeState = 'exhaling';
          exhaleStartTime = now;
          ...
          return {
            state: 'exhaling',
            emitPos: mouth,
            isExhale: true,
            emission: createEmission('exhale-burst'),
```

변경:
```javascript
        if (...) {
          smokeState = 'exhaling';
          exhaleStartTime = now;
          // 배출 방향: mouth → cigTip
          var dir = null;
          if (cigTip && mouth) {
            var ddx = cigTip.x - mouth.x;
            var ddy = cigTip.y - mouth.y;
            var dlen = Math.hypot(ddx, ddy);
            if (dlen > 0.001) {
              dir = { x: ddx / dlen, y: ddy / dlen };
            }
          }
          exhaleDirection = dir;
          ...
          var em = createEmission('exhale-burst');
          em.direction = exhaleDirection;
          return {
            state: 'exhaling',
            emitPos: mouth,
            isExhale: true,
            emission: em,
```

상단에 `let exhaleDirection = null;` 추가.

exhaling 지속 구간에서도 direction 유지:
```javascript
          var em = createEmission(emissionType, progress, ...);
          em.direction = exhaleDirection;
          return { ..., emission: em };
```

- [ ] **Step 15: 테스트 통과 확인**

Run: `node --test tests/smoke-core.test.js`
Expected: PASS

- [ ] **Step 16: 커밋**

```bash
git add js/interaction-core.js tests/smoke-core.test.js
git commit -m "feat(smoke): exhaling 시 mouth→cigTip 방향 벡터 계산

- createSmokeStateMachine에서 exhale 전환 시 direction 캡처
- emission.direction으로 전달"
```

---

### Task 4: smoke.js에서 방향성 emit 구현

**Files:**
- Modify: `js/smoke.js:180-249` (emit 함수)

- [ ] **Step 17: emit()에서 direction 기반 초기 속도 적용**

`js/smoke.js`의 `emit` 함수 내, 파티클 초기 속도 설정 부분 수정.

현재 코드 (약 202-203행):
```javascript
      p.vx = (Math.random() - 0.5) * profile.velocityX;
      p.vy = profile.velocityY.min + Math.random() * (profile.velocityY.max - profile.velocityY.min);
```

변경:
```javascript
      var dir = emission && emission.direction;
      if (dir) {
        // 방향성 속도: direction 기반 + cone spread
        var bias = emission.type === 'exhale-burst' ? 0.7 : 0.3;
        if (emission.type === 'exhale-stream' && emission.progress != null) {
          bias = 0.7 - emission.progress * 0.4; // 0.7 → 0.3
        }
        var speed = Math.abs(profile.velocityY.min) * 1.2;
        var coneAngle = (Math.random() - 0.5) * 0.7; // ±0.35 rad spread
        var cosA = Math.cos(coneAngle);
        var sinA = Math.sin(coneAngle);
        var rotX = dir.x * cosA - dir.y * sinA;
        var rotY = dir.x * sinA + dir.y * cosA;
        p.vx = rotX * speed * bias + (Math.random() - 0.5) * profile.velocityX * (1 - bias);
        p.vy = rotY * speed * bias + (profile.velocityY.min + Math.random() * (profile.velocityY.max - profile.velocityY.min)) * (1 - bias);
      } else {
        p.vx = (Math.random() - 0.5) * profile.velocityX;
        p.vy = profile.velocityY.min + Math.random() * (profile.velocityY.max - profile.velocityY.min);
      }
```

- [ ] **Step 18: 브라우저 테스트**

Run: `python3 -m http.server 8000` → localhost:8000
Expected: 입에서 cigTip 벗어나는 방향으로 연기가 뿜어져 나감

- [ ] **Step 19: 커밋**

```bash
git add js/smoke.js
git commit -m "feat(smoke): 배출 방향성 구현 (mouth→cigTip 벡터 기반)

- emission.direction이 있으면 cone spread + directional bias
- burst 0.7 → stream 0.3으로 방향성 감쇠"
```

---

## Chunk 3: 흡입 시 빨려 들어가는 연기

### Task 5: app.js에서 inhaling 데이터 전달

**Files:**
- Modify: `js/app.js`

- [ ] **Step 20: SmokeSystem.update에 inhaling 데이터 전달**

`js/app.js`의 mainLoop 내, `SmokeSystem.update()` 호출 부분 수정.

현재:
```javascript
    SmokeSystem.update(ctx, dt, Noise.noise2D, {
      dormant: !anyActive,
    });
```

변경 — smokeResults에서 inhaling 상태인 것이 있으면 mouth 캔버스 좌표 전달:

```javascript
    // inhaling 중인 손이 있으면 mouth 좌표를 캔버스 좌표로 변환
    let inhalingMouth = null;
    for (let h = 0; h < smokeResults.length; h++) {
      if (smokeResults[h].state === 'inhaling' && mouthSmoothed) {
        inhalingMouth = {
          x: canvas.width * (1 - mouthSmoothed.x),
          y: canvas.height * mouthSmoothed.y,
        };
        break;
      }
    }

    SmokeSystem.update(ctx, dt, Noise.noise2D, {
      dormant: !anyActive,
      inhalingMouth: inhalingMouth,
    });
```

- [ ] **Step 21: 커밋**

```bash
git add js/app.js
git commit -m "feat(smoke): inhaling 시 mouth 캔버스 좌표를 SmokeSystem에 전달"
```

---

### Task 6: smoke.js에서 흡입력 구현

**Files:**
- Modify: `js/smoke.js:252-391` (update 함수)

- [ ] **Step 22: update()에서 inhaling attraction force 적용**

`js/smoke.js`의 `update` 함수 내, 파티클 물리 업데이트 전에 흡입력 추가.

`const step = ...` 줄 이후, for 루프 시작 전에 inhaling 파라미터 추출:

```javascript
    var inMouth = options && options.inhalingMouth;
```

for 루프 내, `p.vy -= p.riseAccel * step;` 줄 위에 추가:

```javascript
      // 흡입력: inhaling 중이면 mouth 방향으로 끌어당김
      if (inMouth) {
        var adx = inMouth.x - p.x;
        var ady = inMouth.y - p.y;
        var adist = Math.sqrt(adx * adx + ady * ady);
        if (adist > 1) {
          var strength = 0.15 * Math.min(1, 80 / adist);
          p.vx += (adx / adist) * strength * step;
          p.vy += (ady / adist) * strength * step;
          // mouth 근처에서 빠르게 소멸
          p.life += dt * 0.8;
          // 크기 축소
          p.growTo *= 0.992;
          p.size *= 0.992;
        }
        // 매우 가까우면 즉시 소멸
        if (adist < 12) {
          p.life = p.maxLife;
        }
      }
```

- [ ] **Step 23: 브라우저 테스트**

Run: `python3 -m http.server 8000` → localhost:8000
Expected:
- 입에 가져가면 떠다니던 fingertip 연기가 입 방향으로 빨려들어감
- 파티클이 축소되면서 mouth 근처에서 소멸
- 입에서 뗀 후 exhale하면 cigTip 방향으로 연기 뿜어짐

- [ ] **Step 24: 커밋**

```bash
git add js/smoke.js
git commit -m "feat(smoke): 흡입 시 파티클 mouth 방향 흡인 효과

- mouth 방향 attraction force (거리 반비례)
- 가까울수록 life 단축 + 크기 축소
- 12px 이내 도달 시 즉시 소멸"
```

---

## Chunk 4: 통합 테스트 + 최종 확인

### Task 7: 전체 테스트 확인

- [ ] **Step 25: 전체 테스트 통과 확인**

Run: `node --test tests/*.test.js`
Expected: 전체 PASS

- [ ] **Step 26: 브라우저 통합 테스트**

checklist:
- [ ] fingertip 연기 → 입에 가져감 → 빨려들어감
- [ ] 입에서 뗌 → cigTip 방향으로 연기 뿜어짐
- [ ] burst 초반 두텁고, stream으로 자연스럽게 감쇠
- [ ] Smoother ON/OFF(S키) 전환 시 정상 동작
- [ ] Artistic 모드에서도 정상 동작

- [ ] **Step 27: 최종 커밋 (파라미터 조정 필요 시)**

```bash
git add js/smoke-core.js js/smoke.js
git commit -m "tune(smoke): 흡입/배출 파라미터 조정"
```
