# Tracking Smoother 설계 스펙

## 개요

모든 모드(Smoke, Boxing, Boxing 3D, Finger Gun)에서 공통으로 사용하는 추적 품질 개선 모듈.
MediaPipe 랜드마크의 떨림 제거, 추적 손실 시 외삽, 비정상 점프 필터링을 담당한다.

## 문제 정의

| 증상 | 원인 | 영향 모드 |
|------|------|-----------|
| cigTip/주먹/조준점 떨림 | 랜드마크 raw 값 직접 사용, 스무딩 없음 | 전체 |
| inhaling/exhaling 전환 지연 | 거리 계산에 노이즈 섞임 + hysteresis 보수적 | Smoke |
| 추적 손실 시 연기/조준 뚝 끊김 | 손실 즉시 상태 리셋, 예측/외삽 없음 | 전체 |
| 단일 프레임 튐 | MediaPipe 노이즈로 한 프레임만 비정상 값 | 전체 |

## 설계

### 파일 구조

```
js/tracking-smoother.js  (UMD — Node 테스트 가능)
tests/tracking-smoother.test.js
```

### API

```javascript
TrackingSmoother.createPositionSmoother(options)
TrackingSmoother.createVelocityPredictor(options)
TrackingSmoother.createConfidenceGate(options)
```

모든 팩토리는 상태를 가진 객체를 반환한다. 프레임마다 `update()`를 호출하고 보정된 값을 받는다.

---

### 1. PositionSmoother

손/입 위치의 프레임 간 떨림을 제거한다.

**알고리즘**: Exponential Moving Average (EMA) + deadzone

```
smoothed = prev + (current - prev) * alpha
단, |current - prev| < deadzone이면 prev 유지
```

**인터페이스**:
```javascript
const smoother = TrackingSmoother.createPositionSmoother({
  alpha: 0.4,       // 0~1, 높을수록 반응 빠름
  deadzone: 0.003,  // 정규화 좌표 기준, 이하 변화 무시
  dimensions: 2,    // 2 = {x,y}, 3 = {x,y,z}
});

// 매 프레임 호출
const smoothed = smoother.update({ x, y });       // → { x, y }
const smoothed3d = smoother.update({ x, y, z });  // → { x, y, z }
smoother.reset();  // 상태 초기화
```

**설계 결정**:
- alpha 0.4: finger-gun(0.22)보다 반응성 높게. Smoke cigTip은 빠른 반응이 필요.
- 모드별로 다른 alpha를 넘길 수 있으므로 기본값은 중간.
- deadzone은 정규화 좌표(0~1) 기준으로 약 2~3px 수준.

---

### 2. VelocityPredictor

추적 손실 시 마지막 속도로 위치를 외삽해 끊김을 메운다.

**알고리즘**:
```
velocity = (current - prev) / dt
손실 시: predicted = lastPosition + velocity * elapsedSinceLoss
fadeout: elapsed > maxPredictMs이면 null 반환 (더 이상 예측 안 함)
```

**인터페이스**:
```javascript
const predictor = TrackingSmoother.createVelocityPredictor({
  maxPredictMs: 120,  // 최대 예측 구간 (ms)
  velocityAlpha: 0.5, // 속도 자체의 EMA
});

// 추적 성공 시
predictor.feed(position, timestampMs);

// 추적 손실 시
const predicted = predictor.predict(timestampMs);
// → { x, y } 또는 null (maxPredictMs 초과)

predictor.reset();
```

**설계 결정**:
- maxPredictMs 120: 약 7프레임(60fps). 그 이상은 예측이 오히려 해로움.
- velocity 자체도 EMA로 평활해서 단일 프레임 속도 튐 방지.
- predict()가 null을 반환하면 호출자가 상태를 idle로 전환.

---

### 3. ConfidenceGate

비정상적 점프 필터링 + 상태 전환 hysteresis를 통합한다.

**알고리즘**:
```
jump = distance(current, prev)
jump > maxJump이면 current 무시, prev 유지

상태 전환:
  감지 → detectFrames 연속 성공 후 활성화
  손실 → lostFrames 연속 실패 후 비활성화
```

**인터페이스**:
```javascript
const gate = TrackingSmoother.createConfidenceGate({
  maxJump: 0.15,       // 정규화 좌표 기준, 이상 점프 필터
  detectFrames: 2,     // 연속 감지 프레임 수
  lostFrames: 3,       // 연속 손실 프레임 수
});

const result = gate.update(position);
// → { position, status: 'active' | 'lost' | 'pending' }
// position: 필터된 위치 (점프 시 이전 값)
// status: 현재 추적 상태

gate.reset();
```

**설계 결정**:
- maxJump 0.15: 정규화 좌표 기준 화면의 15%. 한 프레임에 이 이상 이동은 노이즈.
- detectFrames 2: 현재 Smoke 모드와 동일. 빠른 반응.
- lostFrames 3: 현재 4에서 3으로 줄여 손실 판단을 약간 빠르게. VelocityPredictor가 메워주므로.

---

## Smoke 모드 적용 계획

### cigTip (hand.js → app.js)

```
현재: raw cigTip → SmokeSystem.emit()
개선: raw cigTip → PositionSmoother → VelocityPredictor.feed()
      손실 시:      VelocityPredictor.predict() → SmokeSystem.emit()
```

### mouth (face.js)

```
현재: 3프레임 간격 감지 + 선형 보간
개선: 감지 결과 → PositionSmoother → 기존 보간과 결합
```

### 상태 전환 (interaction-core.js)

```
현재: createPoseTracker 내부 detectStreak/lostStreak
개선: ConfidenceGate로 대체하거나 래핑
      smoothed 위치 기반 거리 계산 → 전환 정확도 향상
```

### 통합 순서

1. `tracking-smoother.js` 모듈 구현 + 테스트
2. `app.js`에서 cigTip에 PositionSmoother 적용
3. `app.js`에서 추적 손실 시 VelocityPredictor 적용
4. `face.js`에서 mouth 위치에 PositionSmoother 적용
5. `interaction-core.js`에서 ConfidenceGate 적용 또는 hysteresis 튜닝
6. 브라우저 테스트 + 파라미터 튜닝

## 테스트 전략

`tests/tracking-smoother.test.js` — Node.js `node:test`로 실행.

| 테스트 | 검증 내용 |
|--------|-----------|
| PositionSmoother: 정지 입력 | 동일 위치 반복 시 출력 안정 |
| PositionSmoother: deadzone | 작은 변화 무시 확인 |
| PositionSmoother: 급격한 이동 | alpha에 따라 적절히 추종 |
| PositionSmoother: 3D 지원 | z 좌표 포함 시 정상 동작 |
| VelocityPredictor: 등속 운동 | feed 후 predict가 올바른 위치 반환 |
| VelocityPredictor: 타임아웃 | maxPredictMs 초과 시 null |
| VelocityPredictor: 속도 평활 | 튀는 프레임이 predict에 영향 최소화 |
| ConfidenceGate: 정상 추적 | detectFrames 후 active |
| ConfidenceGate: 점프 필터 | maxJump 초과 시 이전 값 유지 |
| ConfidenceGate: 손실 판정 | lostFrames 연속 null 후 lost |

## 향후 확장

- Boxing/Boxing 3D: 주먹 위치에 PositionSmoother 적용
- Finger Gun: 기존 createVectorSmoother를 TrackingSmoother로 마이그레이션
- Kalman 필터: EMA가 부족하면 업그레이드 경로로 고려
