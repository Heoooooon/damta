# Boxing Sandbag Training — Design Spec

## Overview

웹캠 기반 가상 샌드백 권투 연습 앱. 기존 담타(damta) 프로젝트에 별도 페이지(`boxing.html`)로 추가. 기존 코드 변경 없음.

## Core Features

### 1. 가상 샌드백
- 검은 배경 위 미니멀 샌드백 (심플 도형/아웃라인, 화면 중앙)
- 타격 시 네온/불꽃 파티클 이펙트
- 샌드백 흔들림 애니메이션 (타격 강도에 비례)

### 2. 펀치 감지
- **기본 타격:** 주먹(손 랜드마크)이 샌드백 영역에 진입하면 타격 판정
- **강타 감지:** 프레임 간 주먹 위치 변화(속도)를 계산, 임계값 이상이면 강타
- **이펙트 차등:** 기본 타격 → 작은 불꽃, 강타 → 큰 충격파 + 화면 셰이크
- **쿨다운:** 동일 주먹의 연속 판정 방지 (디바운스)

### 3. 주먹 인식 (MediaPipe Hands)
- 기존 `@mediapipe/hands` CDN 재사용
- 주먹 상태: 손가락이 접혀있는지 확인 (tip < pip for all fingers)
- 주먹 위치: 손목(landmark 0) + 중지 MCP(landmark 9) 중점
- 양손 지원 (`maxNumHands: 2`)

### 4. 30초 라운드제
- 시작 버튼 → 3초 카운트다운 → 30초 라운드
- 라운드 중 실시간 HUD 표시
- 종료 시 결과 화면

### 5. 실시간 HUD
- 남은 시간 (타이머 바 + 초)
- 타격 수 (총 / 강타)
- 현재 분당 타격 속도 (hits/min)

### 6. 라운드 종료 결과 화면
- 총 타격 수
- 강타 수
- 분당 타격 속도 (평균)
- "다시 하기" 버튼

## Architecture

### File Structure
```
boxing.html                 — 페이지 (독립)
js/boxing/
  boxing-app.js             — 메인 루프, 라운드 관리, HUD
  boxing-detection.js       — 주먹 감지, 속도 계산, 타격 판정 (UMD)
  boxing-sandbag.js         — 샌드백 렌더링, 흔들림 물리
  boxing-effects.js         — 타격 이펙트 파티클 시스템
```

### Module Patterns
- **UMD** (Node 테스트 가능): `boxing-detection.js`
- **IIFE** (브라우저 전용): `boxing-app.js`, `boxing-sandbag.js`, `boxing-effects.js`

### Script Loading Order (boxing.html)
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.min.js"></script>
<script src="js/noise.js"></script>
<script src="js/boxing/boxing-detection.js"></script>
<script src="js/boxing/boxing-sandbag.js"></script>
<script src="js/boxing/boxing-effects.js"></script>
<script src="js/boxing/boxing-app.js"></script>
```

### Shared Dependencies (기존 파일, 변경 없음)
- `js/noise.js` — 파티클 터뷸런스 (충격파 링 왜곡에 사용)
- MediaPipe Hands CDN — 손 추적

### MediaPipe & Webcam 초기화
`boxing-app.js`에서 직접 처리 (기존 `hand.js`/`app.js`와 독립):
- `navigator.mediaDevices.getUserMedia()` → video 엘리먼트
- `new Hands({ locateFile })` → `onResults` 콜백에서 landmarks 수신
- 웹캠 PIP: 우상단 작은 미러 비디오 (담타와 동일 스타일)

### Data Flow
```
1. boxing-app.js: getUserMedia → video → MediaPipe Hands → 21 landmarks per hand
2. boxing-detection.js:
   - 주먹 상태 판별 (fingers folded)
   - 프레임 간 속도 계산 (position delta / dt)
   - 샌드백 히트박스 충돌 판정
   - → { hit: bool, power: 'normal'|'strong', position, velocity }
3. boxing-sandbag.js:
   - 히트 시 흔들림 업데이트 (감쇠 진자)
   - 샌드백 렌더링 (Canvas 2D)
4. boxing-effects.js:
   - 히트 위치에 파티클 생성
   - power에 따라 이펙트 강도 차등
5. boxing-app.js:
   - 라운드 타이머 관리
   - HUD 업데이트
   - 통계 집계
```

### Punch Detection Details

**주먹 판별:**
- 4개 손가락(검지~소지): `tip.y > pip.y` (MediaPipe 좌표계에서 y 증가 = 아래) → 주먹 쥔 상태
- 엄지는 무시 (접힘 기준이 다름)

**속도 계산:**
- 이전 프레임 주먹 위치와 현재 위치의 유클리드 거리 (정규화 좌표 0~1)
- 프레임당 변위(per-frame displacement) 기준 임계값: normal > 0.015, strong > 0.04 (60fps 기준, 튜닝 필요)

**히트 판정:**
- 주먹이 샌드백 바운딩 영역 내에 있을 때
- 속도가 최소 임계값 이상일 때 (느린 접근은 무시)
- 히트 후 200ms 쿨다운

**샌드백 히트박스:**
- 화면 중앙, 폭 canvas의 ~20%, 높이 ~50%
- 좌표 미러링: `x = canvasWidth * (1 - landmark.x)`

### Sandbag Rendering

- 둥근 직사각형 + 상단 체인
- 기본: 흰색 아웃라인 (stroke)
- 히트 시: 밝아짐 + 흔들림
- 흔들림: 감쇠 진자 (damped pendulum), 타격 강도에 비례한 초기 각도

### Impact Effects

**기본 타격:**
- 타격 지점에서 작은 불꽃 파티클 8~12개
- 짧은 수명 (300ms), 방사형 확산
- 색상: 밝은 흰색/노란색

**강타:**
- 파티클 20~30개 + 충격파 링
- 긴 수명 (500ms), 넓은 확산
- 색상: 네온 오렌지/빨강
- 화면 셰이크 효과 (canvas translate 흔들림)

### Round System

```
[시작 화면] → 시작 버튼 클릭
  → [카운트다운] 3, 2, 1
  → [라운드] 30초, HUD 표시
  → [결과 화면] 통계 + 다시하기
```

### HUD Layout
```
┌─────────────────────────────────────┐
│  ⏱ 00:24          87 hits  12 강타  │  ← 상단
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░                │  ← 타이머 바
│                                     │
│            ┌─────┐                  │
│            │     │  ← 샌드백        │
│            │     │                  │
│            └─────┘                  │
│                                     │
│                     174 hits/min    │  ← 하단
└─────────────────────────────────────┘
```

## UI/UX

### 시작 화면
- 가이드 모달 (담타와 동일 스타일)
- "주먹을 쥐고 샌드백을 때려보세요" 설명
- "시작" 버튼

### 결과 화면
- 모달 형태
- 통계 표시: 총 타격, 강타, hits/min
- "다시 하기" 버튼

### 스타일
- 기존 담타와 동일한 디자인 언어 (검은 배경, 흰색 UI, 둥근 모서리)
- 폰트: `-apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif`

## Performance Considerations
- Face Mesh 불필요 — 제거하여 성능 확보
- 파티클 풀: 최대 500개 (타격 이펙트는 수명이 짧아 적은 수로 충분)
- 손 감지: 매 프레임 (복싱은 빠른 반응 필요)

## Error Handling
- **웹캠 거부:** "웹캠 접근이 필요합니다" 에러 메시지 표시
- **MediaPipe 로드 실패:** "페이지를 새로고침해주세요" 에러 메시지
- **손 미감지:** 라운드 중 5초 이상 손이 감지되지 않으면 "주먹을 카메라에 보여주세요" 안내 표시

## Navigation
- `boxing.html` 좌하단에 "← 담타" 링크 (index.html로 이동)
- `index.html` 좌하단 모드 버튼 옆에 "🥊" 링크 (boxing.html로 이동) — 기존 코드 변경 최소화를 위해 boxing-app.js에서 동적 삽입

## Testing
- `boxing-detection.js`를 UMD로 작성하여 Node.js 테스트 가능
- 테스트 항목: 주먹 판별, 속도 계산, 히트 판정, 쿨다운
