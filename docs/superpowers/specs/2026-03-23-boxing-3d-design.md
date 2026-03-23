# Boxing 3D Design Spec

## Overview

기존 boxing 2D 앱을 Three.js 기반 3D 버전으로 별도 페이지(`boxing-3d.html`)에 구현. MediaPipe 손 추적은 동일하게 사용하고, 렌더링만 Three.js로 교체한다.

**목표:**
- 3D 샌드백: 기본 도형 조합 (Cylinder + Chain), 조명/그림자로 입체감
- 3D 파티클/이펙트: GPU 기반 파티클, 충격파 링, 카메라 셰이크
- 간단한 환경: 바닥 평면 + 스포트라이트로 공간감

**비목표:**
- 체육관/링 등 풀 3D 환경
- GLTF 외부 모델 에셋
- 빌드 시스템 도입

## Architecture

```
boxing-3d.html
├── Three.js (CDN) + MediaPipe Hands (CDN)
├── js/boxing/boxing-detection.js  ← 기존 UMD 모듈 재사용
├── js/boxing3d/boxing3d-scene.js  ← Three.js 씬, 카메라, 조명, 바닥
├── js/boxing3d/boxing3d-sandbag.js ← 3D 샌드백 모델 + 물리
├── js/boxing3d/boxing3d-effects.js ← 3D 파티클 시스템
└── js/boxing3d/boxing3d-app.js    ← 메인 루프, 라운드 관리, HUD
```

### 재사용 모듈
- `boxing-detection.js` — 100% 재사용 (주먹 감지, 속도 추적, 히트 판정)
- `noise.js` — 파티클 움직임에 활용

## Module Design

### 1. Scene (`boxing3d-scene.js`)

Three.js 씬 초기화 및 환경 설정을 담당한다.

**카메라:**
- `PerspectiveCamera` (fov: 60, near: 0.1, far: 100)
- 정면 고정 시점, 샌드백을 바라봄 (position: 0, 1.5, 4)

**조명:**
- `DirectionalLight` — 전체 환경 조명, 그림자 cast
- `SpotLight` — 샌드백에 집중, 드라마틱한 분위기
- `AmbientLight` — 최소한의 fill light

**바닥:**
- `PlaneGeometry` — 어두운 톤 (`MeshStandardMaterial`, roughness: 1)
- `receiveShadow: true`

**렌더링:**
- `WebGLRenderer` with `antialias: true`
- 배경색: `0x111111`
- `shadowMap.enabled: true`
- 윈도우 리사이즈 대응

**API:**
```javascript
window.BoxingScene = {
  init(canvas) → {scene, camera, renderer},
  resize(),
  getScene(),
  getCamera(),
  getRenderer()
}
```

### 2. Sandbag (`boxing3d-sandbag.js`)

3D 샌드백 모델 생성 및 물리 시뮬레이션.

**모델 구성:**
- 본체: `CylinderGeometry` (radius: 0.3, height: 1.2) — 가죽 느낌 갈색 `MeshStandardMaterial` (roughness: 0.8, metalness: 0.1)
- 상단 캡: `SphereGeometry` (radius: 0.3, 반구)
- 하단 캡: `SphereGeometry` (radius: 0.3, 반구)
- 체인: `TorusGeometry` 링크 3~4개를 수직 배열
- 전체를 `Group`으로 묶어 회전 적용

**물리:**
- 기존 감쇠 진자 로직 재사용 (STIFFNESS: 0.08, DAMPING: 0.95, MAX_ANGLE: 0.35)
- 3D에서는 `group.rotation.z`로 스윙 표현 (X축 방향 흔들림)
- pivot point: 체인 상단 (천장 연결점)

**타격 반응:**
- `applyHit(power, hitX)` — 기존과 동일한 impulse 로직
- flash: `material.emissive` 를 순간적으로 밝게 → 감쇠
- `castShadow: true`

**API:**
```javascript
window.BoxingSandbag3D = {
  init(scene) → group,
  update(dt),
  applyHit(power, hitX),
  draw()  // no-op, Three.js가 자동 렌더링
}
```

### 3. Effects (`boxing3d-effects.js`)

3D 파티클 시스템 및 충격파 이펙트.

**파티클 시스템:**
- `Points` + `BufferGeometry` + `PointsMaterial` — GPU 기반 렌더링
- position, velocity, lifetime을 Float32Array로 관리
- MAX_PARTICLES: 500

**일반 타격 (normal):**
- 10개 파티클
- 크기: 0.02~0.04 (3D 단위)
- 수명: 300ms
- 색상: 흰/노란 (`0xffffff`, `0xffff88`)
- 속도: 무작위 방향 방사

**강타 (strong):**
- 24개 파티클
- 크기: 0.03~0.07
- 수명: 500ms
- 색상: 오렌지/빨강 (`0xff6600`, `0xff2200`)
- 충격파: `RingGeometry` + `MeshBasicMaterial` (transparent, opacity 감쇠, scale 애니메이션 5→60 비율)

**파티클 물리:**
- 중력: y -= 0.15 * dtRatio
- 드래그: velocity *= 0.97^dtRatio
- alpha: `material.opacity` = 1 - age/lifetime

**화면 셰이크:**
- 카메라 position에 무작위 offset 추가
- shakeAmount *= 0.85로 감쇠
- 강타: 0.08 offset, 일반: 0.03 offset

**API:**
```javascript
window.BoxingEffects3D = {
  init(scene, camera),
  emit(x, y, power),  // 정규화 좌표 → 3D 좌표 변환 내부 처리
  update(dt)
}
```

### 4. App (`boxing3d-app.js`)

메인 루프 및 게임 로직. 기존 `boxing-app.js`와 동일한 구조.

**상태 머신:** `guide → countdown → round → result` (변경 없음)

**메인 루프 (라운드 중):**
1. MediaPipe로 손 랜드마크 받기
2. `boxing-detection.js`로 주먹 감지, 속도 추적, 히트 판정
3. 히트 시: `BoxingSandbag3D.applyHit()` + `BoxingEffects3D.emit()`
4. `BoxingSandbag3D.update(dt)`
5. `BoxingEffects3D.update(dt)`
6. `renderer.render(scene, camera)`

**HUD:**
- HTML DOM 오버레이 (CSS `position: absolute`, Three.js 캔버스 위)
- 타이머, 타격 수, 강타 수, 타격 속도
- 기존과 동일한 정보 표시

**웹캠 PIP:**
- 기존과 동일: 우상단 160x120px `<video>` 요소

**손 시각화:**
- 3D 씬 내에서 손 위치에 작은 `SphereGeometry` 표시 (주먹 쥔 상태일 때)
- 또는 Canvas 2D 오버레이로 기존 방식 유지 (간단함 우선)

## Coordinate Mapping

- MediaPipe 정규화 좌표 (0~1) → 히트 판정: 기존 `boxing-detection.js` 로직 그대로
- 타격 위치 → 3D 파티클 emit 위치:
  - x: `(1 - landmark.x) * sandbagWidth - sandbagWidth/2` → 샌드백 표면 좌표
  - y: `(1 - landmark.y) * sandbagHeight` → 샌드백 높이 좌표
  - z: 샌드백 표면 (radius 값)

## CDN Dependencies

```html
<!-- Three.js UMD build -->
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>

<!-- MediaPipe (기존과 동일) -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.min.js"></script>
```

## Script Loading Order

```html
<script src="three.min.js (CDN)"></script>
<script src="mediapipe hands (CDN)"></script>
<script src="mediapipe camera_utils (CDN)"></script>
<script src="js/noise.js"></script>
<script src="js/boxing/boxing-detection.js"></script>
<script src="js/boxing3d/boxing3d-scene.js"></script>
<script src="js/boxing3d/boxing3d-sandbag.js"></script>
<script src="js/boxing3d/boxing3d-effects.js"></script>
<script src="js/boxing3d/boxing3d-app.js"></script>
```

## Testing

- `boxing-detection.js` — 기존 테스트 그대로 유지
- 3D 모듈들 (scene, sandbag, effects, app) — 브라우저 전용 IIFE, `node --test` 불가
- 수동 브라우저 테스트로 검증

## Performance Considerations

- Three.js + MediaPipe 동시 실행 시 GPU 부하 주의
- 파티클 수 제한 (MAX_PARTICLES: 500)
- 그림자 맵 해상도 적절히 설정 (1024x1024)
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — 레티나 대응하되 과도한 해상도 방지
