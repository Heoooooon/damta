# 연기 흡입/배출 디테일 개선 설계 스펙

## 개요

Smoke 모드의 inhaling/exhaling 상태에서 연기 파티클의 시각적 품질을 개선한다. 3가지 변경:
1. 흡입 시 기존 파티클이 입 방향으로 빨려 들어감
2. 배출 시 cigTip이 벗어나는 방향으로 연기가 뿜어져 나감
3. 배출 초반→후반으로 밀도/텍스처가 자연스럽게 변화

## 1. 흡입 시 빨려 들어가는 연기

### 현재 동작
- inhaling 상태에서 새 파티클 생성 없음 (emission = null)
- 이미 떠다니는 fingertip 파티클은 무시하고 그냥 자연 소멸

### 변경 동작
- inhaling 진입 시, 기존 active 파티클들에 **mouth 방향 흡입력** 적용
- 흡입력 = `mouth 방향 단위벡터 * attractionStrength / distance`
- 거리에 반비례하여 가까울수록 강하게 빨려듦
- 동시에 파티클 maxLife를 단축 → mouth 근처에서 빠르게 소멸
- 파티클 크기도 mouth에 가까워질수록 축소 (빨려들어가는 느낌)

### 구현 위치
- `smoke.js` — `update()` 루프 내에서 inhaling 상태 파라미터를 받아 force 적용

### 인터페이스 변경
- `SmokeSystem.update(ctx, dt, noiseFunc, options)` — options에 추가:
  - `inhalingMouth: { x, y } | null` — inhaling 중일 때 mouth 캔버스 좌표
  - `inhalingStrength: number` — 흡입 강도 (0~1)

### 파라미터
```
attractionBase: 0.15      // 기본 흡입 가속도
attractionDistScale: 80   // 이 거리(px) 이내에서 강하게 빨림
lifeShrinkRate: 1.8       // inhaling 중 life 소모 가속 배율
sizeShrinkFactor: 0.92    // 프레임당 크기 축소 비율
```

## 2. 배출 방향성 (mouth→cigTip 방향)

### 현재 동작
- exhale-burst/stream 파티클의 초기 velocityX가 `(Math.random() - 0.5) * velocityX`
- 사방으로 랜덤 확산

### 변경 동작
- exhaling 진입 시 `mouth→cigTip` 방향 벡터를 캡처
- 이 벡터를 정규화하여 `emission.direction`으로 전달
- `smoke.js`의 `emit()`에서:
  - `vx = direction.x * speed * directionalBias + random * (1 - directionalBias)`
  - `vy = direction.y * speed * directionalBias + randomRise * (1 - directionalBias)`
- directionalBias는 burst(0.7)에서 stream 후반(0.3)으로 감쇠 → 처음엔 방향성 강하고 점점 퍼짐
- direction이 없으면 기존 랜덤 방향 fallback

### 구현 위치
- `interaction-core.js` — `createSmokeStateMachine()` 내 exhaling 전환 시:
  - `direction = normalize(cigTip - mouth)` 계산
  - smokeResult에 `direction` 포함
- `app.js` — emission 객체에 direction 전달
- `smoke.js` — `emit()` 시그니처에 direction 파라미터 추가

### 인터페이스 변경
- `emission` 객체에 `direction: { x, y } | null` 추가
- `SmokeSystem.emit()` — emission.direction이 있으면 방향성 속도, 없으면 기존 로직

### 파라미터
```
directionalBias_burst: 0.7    // burst 시 방향성 비중
directionalBias_stream: 0.3   // stream 후반 방향성 비중 (lerp)
speedMultiplier: 1.2          // 방향성 있을 때 속도 배율
spreadCone: 0.35              // 방향 주변 확산 각도 (라디안)
```

## 3. 연기 밀도/텍스처 그라데이션

### 현재 동작
- exhale-burst: count 24, alpha 1.08, size 1.2
- exhale-stream: count 13, alpha 0.94, size 1.0
- burst→stream 전환이 불연속적

### 변경 동작

#### exhale-burst 강화
```
count: 24 → 28
alphaMultiplier: 1.08 → 1.25
sizeMultiplier: 1.2 → 1.4
spreadX: 42 → 34          // 더 모아서 밀도감
spreadY: 18 → 14
```

#### burst→stream 전환 부드럽게
- exhale-stream의 `getEmissionProfile()`에서 progress=0일 때 burst 값에 더 가까운 시작점
- 현재: stream 고정값에서 시작
- 변경: progress 0~0.3 구간에서 burst→stream lerp 추가

#### stream 후반 감쇠
```
fadeOutPower: 1.1 → 1.35    // 더 부드러운 꼬리
fadeOutStart: 0.54 → 0.48   // 약간 일찍 시작
```

### 구현 위치
- `smoke-core.js` — DEFAULT_EMISSIONS 값 조정 + getEmissionProfile 내 exhale-stream lerp 로직

## 데이터 흐름 변경

```
현재:
  interaction-core → { state, emitPos, emission: { type, progress } }
  app.js → SmokeSystem.emit(x, y, w, h, mode, emission, dt)
  app.js → SmokeSystem.update(ctx, dt, noise, { dormant })

변경:
  interaction-core → { state, emitPos, emission: { type, progress, direction }, inhalingMouth }
  app.js → SmokeSystem.emit(x, y, w, h, mode, emission, dt)  // emission.direction 포함
  app.js → SmokeSystem.update(ctx, dt, noise, { dormant, inhalingMouth, inhalingStrength })
```

## 테스트 전략

기존 `smoke-core.test.js` 테스트에 추가:

| 테스트 | 검증 내용 |
|--------|-----------|
| exhale-burst 밀도 증가 | burst의 alphaMultiplier >= 1.2, sizeMultiplier >= 1.3 |
| exhale-stream 초반이 burst에 가까움 | progress=0일 때 count/alpha가 burst의 80% 이상 |
| exhale-stream 후반 감쇠 | progress=1일 때 count/alpha가 fingertip 수준으로 수렴 |
| direction이 있으면 emission에 포함 | smokeResult.emission.direction 존재 확인 |

`smoke.js`는 브라우저 전용(IIFE)이므로 흡입력/방향성은 브라우저 수동 테스트로 검증.

## 향후 확장
- 흡입 강도를 입 벌림 정도(face mesh)로 동적 조절
- 배출 속도를 입~cigTip 이동 속도에 비례시킴
- Artistic 모드에서 방향성 연기에 색상 그라데이션
