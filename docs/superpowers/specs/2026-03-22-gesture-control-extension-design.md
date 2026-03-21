# Gesture Control Browser Extension — Design Spec

## Overview

MediaPipe Hands 기반 손 제스처로 웹 브라우저를 조작하는 크롬 확장프로그램.
기존 damta 프로젝트의 손 추적 로직에서 범용 부분을 공유 라이브러리로 추출하고,
이를 활용해 커서 이동, 클릭, 스크롤 등 브라우저 조작을 수행한다.

### Goals

- 접근성, 편의, 프레젠테이션 등 범용 제스처 컨트롤러
- MVP: 커서 이동 + 클릭 + 스크롤
- 향후: 드래그, 뒤로/앞으로, 탭 전환, 확대/축소, 텍스트 선택

### Non-Goals

- 모바일 브라우저 지원
- 음성 인식 연동
- 외부 서버 통신

---

## Architecture

### Project Structure (Monorepo)

```
/Users/gwon-yeheon/CMORE/
├── hand-tracking-core/          ← 공유 라이브러리 (새로 추출)
│   ├── mediapipe-loader.js      # MediaPipe Hands 초기화 + 카메라 연결
│   ├── landmark-utils.js        # 거리, 각도, 정규화, 미러링 유틸
│   ├── gesture-detector.js      # 범용 제스처 감지 (핀치, 포인팅, 스와이프, 오픈팜)
│   └── gesture-smoother.js      # 떨림 필터, 히스테리시스, EMA 스무딩
│
├── damta/                       ← 기존 프로젝트 (담배 연기 이펙트)
│   └── js/
│       ├── hand.js              → mediapipe-loader.js 사용하도록 리팩터 (향후)
│       ├── interaction-core.js  → 담배 포즈 전용 로직만 남김 (향후)
│       └── ...
│
└── gesture-control/             ← 크롬 확장프로그램 (새 프로젝트)
    ├── manifest.json
    ├── lib/                     # hand-tracking-core 번들 복사본
    │   └── mediapipe/           # MediaPipe WASM + JS 번들 (로컬)
    ├── side-panel/
    │   ├── panel.html           # 카메라 피드 + 제스처 상태 UI
    │   └── panel.js             # MediaPipe 구동, 제스처 감지
    ├── background/
    │   └── service-worker.js    # 메시지 라우팅, 탭 조작 API
    ├── content/
    │   ├── content-script.js    # 커서 오버레이, 클릭/스크롤 실행
    │   └── cursor.css           # 가상 커서 스타일 (inline style 대신 class)
    └── shared/
        └── messages.js          # 메시지 타입 정의
```

### Module Pattern

- `hand-tracking-core/`: UMD 패턴 (damta의 `interaction-core.js`와 동일한 래퍼)
  ```javascript
  (function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.ModuleName = factory();
  })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    // ...
  });
  ```
- Node 테스트 + 브라우저 `<script>` 모두 동작
- 빌드 도구 없이 vanilla JS 유지

### MediaPipe 로딩 전략

**확장프로그램에서는 MediaPipe를 로컬 번들로 사용한다.**

Manifest V3의 기본 CSP가 외부 CDN 스크립트를 차단하므로:
- MediaPipe Hands WASM + JS 파일을 `gesture-control/lib/mediapipe/`에 번들
- `mediapipe-loader.js`에서 `locateFile` 옵션으로 경로 지정
- 확장프로그램: `chrome.runtime.getURL('lib/mediapipe/')`
- damta (향후): 기존 CDN 방식 유지

```javascript
// 확장프로그램용 로더 호출 예시
createHandTracker({
  locateFile: (file) => chrome.runtime.getURL(`lib/mediapipe/${file}`),
  maxHands: 1,
  modelComplexity: 0  // 확장프로그램은 경량 모델 사용
});
```

---

## Shared Library: hand-tracking-core

### 기존 코드 매핑

damta `interaction-core.js`에서 추출할 함수들:

| 기존 함수 (interaction-core.js) | 새 모듈 | 새 함수명 | 변경사항 |
|------|---------|-----------|----------|
| `dist(a, b)` (line 20) | landmark-utils.js | `distance(a, b)` | 이름만 변경 |
| `midpoint(a, b)` (line 24) | landmark-utils.js | `midpoint(a, b)` | 동일 |
| `palmWidth(lm)` (line 28) | landmark-utils.js | `palmWidth(landmarks)` | 동일 |
| `extensionScore(lm, tip, base)` (line 32) | landmark-utils.js | `fingerExtension(landmarks, fingerIndex)` | 인터페이스 단순화, fingerIndex로 tip/base 자동 매핑 |
| `analyzePinchPose(lm)` (line 121) | gesture-detector.js | `detectPinch(landmarks)` | 담배팁 계산 제거, 범용 pinch 반환 |
| `createPoseTracker()` 내 히스테리시스 (line 267) | gesture-smoother.js | `createHysteresis(on, off)` | 범용화 |
| `createPoseTracker()` 내 프레임 streak (line 280) | gesture-smoother.js | `createFrameStreak(n)` | 범용화 |

**새로 작성하는 함수:**
- `landmark-utils.js`: `angle()`, `mirrorX()`
- `gesture-detector.js`: `detectPointing()`, `detectTwoFingerSlide()`, `detectSwipe()`, `detectOpenPalm()`
- `gesture-smoother.js`: `createEMAFilter()`, `createDeadzone()`

**damta와의 관계:** Phase 3에서 damta가 `hand-tracking-core`를 import하도록 리팩터링. 그 전까지 damta는 기존 코드 유지, 공유 라이브러리는 독립적으로 동작.

### mediapipe-loader.js

MediaPipe Hands 초기화와 카메라 연결을 래핑한다.

- `createHandTracker(options)`: MediaPipe Hands 인스턴스 생성
  - options: `maxHands`, `modelComplexity`, `detectionConfidence`, `trackingConfidence`, `locateFile`
- `connectCamera(videoElement, tracker)`: getUserMedia → 비디오 피드 연결
- 콜백 기반: `onResults(landmarks)` → 호출자가 랜드마크 처리

### landmark-utils.js

랜드마크 연산 유틸리티.

- `distance(a, b)`: 두 랜드마크 간 유클리드 거리
- `midpoint(a, b)`: 두 랜드마크 중점
- `angle(a, b, c)`: 세 랜드마크 간 각도
- `palmWidth(landmarks)`: 손바닥 너비 (정규화 기준)
- `fingerExtension(landmarks, fingerIndex)`: 특정 손가락 펴짐 정도 (0~1)
- `mirrorX(landmark)`: X좌표 미러링 (1 - x)

### gesture-detector.js

범용 제스처 판별기.

- `detectPointing(landmarks)`: 검지만 펴짐 → `{ active, tipPos }`
- `detectPinch(landmarks)`: 엄지+검지 맞닿음 → `{ active, pinchPos, gap }`
  - `gap`은 palmWidth로 정규화된 비율 (damta의 pinchGap과 동일 단위)
  - 활성화 threshold: `gap < 0.1` (palmWidth 대비, damta의 0.45보다 엄격 — 의도적 클릭만 감지)
- `detectTwoFingerSlide(landmarks, prevLandmarks)`: 검지+중지 수직 이동 → `{ active, deltaY }`
- `detectSwipe(landmarks, history)`: 손바닥 수평 빠른 이동 → `{ active, direction }`
- `detectOpenPalm(landmarks)`: 5개 손가락 모두 펴짐 → `{ active }`

각 감지 함수는 독립적이며 합성 가능하다.

**제스처 우선순위 (gesture-control에서 적용):**
1. 핀치 (클릭) — 가장 높음, 의도적 동작
2. 투핑거 슬라이드 (스크롤)
3. 포인팅 (커서 이동)
4. 스와이프 (네비게이션) — 가장 낮음
5. 오픈 팜 — 일시정지/비활성 (제스처 없음 상태)

### gesture-smoother.js

떨림 방지와 상태 안정화.

- `createEMAFilter(alpha)`: 지수 이동 평균 필터
  - `filter.update({x, y})` → 스무딩된 좌표 반환
- `createHysteresis(onThreshold, offThreshold)`: 히스테리시스 on/off
  - damta의 `createPoseTracker` 패턴에서 추출
- `createDeadzone(threshold)`: 작은 변화 무시
- `createFrameStreak(requiredFrames)`: N프레임 연속 감지 시 활성화

---

## Chrome Extension: gesture-control

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Gesture Control",
  "version": "0.1.0",
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
    "js": ["content/content-script.js"],
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

**변경사항 (리뷰 반영):**
- `content_scripts` 정적 선언 추가 (동적 주입의 activeTab 제약 회피)
- `web_accessible_resources`에 MediaPipe 번들 등록
- `activeTab` 권한 제거 (host_permissions + 정적 content_scripts로 충분)

### Side Panel (panel.html + panel.js)

카메라를 구동하고 제스처를 감지하는 메인 엔진.

**UI 구성:**
- 카메라 미리보기 (작은 비디오)
- 현재 감지 제스처 텍스트 표시
- ON/OFF 토글 버튼 (글로벌 — 모든 탭에 적용)
- 감도 조절 슬라이더 (EMA alpha)

**처리 루프 (~30fps):**
1. MediaPipe에 비디오 프레임 전달 (modelComplexity: 0, maxHands: 1)
2. 랜드마크 수신 → `gesture-detector`로 제스처 판별
3. `gesture-smoother`로 좌표 스무딩
4. 정규화 좌표(0~1)를 메시지로 Background에 전달

**성능 예산:**
- modelComplexity: 0 (경량, damta의 1보다 낮음)
- maxHands: 1 (단일 손만)
- 타겟: 30fps, 프레임 처리 < 25ms
- 프레임 스킵: 처리 지연 시 다음 프레임 건너뜀 (`requestAnimationFrame` 기반)

### Service Worker (service-worker.js)

Side Panel과 Content Script 사이의 **무상태** 메시지 라우터.

**설계 원칙:** Manifest V3 Service Worker는 30초 비활성 후 종료될 수 있으므로, 상태를 유지하지 않는다. 모든 메시지는 `chrome.runtime.onMessage` (stateless)로 처리.

**메시지 라우팅:**
- `GESTURE_MOVE` → 활성 탭의 Content Script로 전달
- `GESTURE_CLICK` → 활성 탭의 Content Script로 전달
- `GESTURE_SCROLL` → 활성 탭의 Content Script로 전달
- `GESTURE_NAVIGATE` → Service Worker에서 직접 처리 (`chrome.tabs.goBack/goForward`)

**탭 관리:**
- 매 메시지마다 `chrome.tabs.query({active: true, currentWindow: true})`로 활성 탭 조회 (상태 캐싱 없음)
- Content Script는 정적 선언으로 자동 주입되므로 수동 주입 불필요

### Content Script (content-script.js)

활성 탭에서 실제 브라우저 조작을 수행.

**좌표 매핑 (Content Script 측에서 수행):**
- Side Panel에서 정규화 좌표(0~1)만 수신
- Content Script가 자체적으로 `window.innerWidth/Height`로 픽셀 좌표 계산
- `screenX = innerWidth × (1 - normalizedX)` (미러링)
- `screenY = innerHeight × normalizedY`
- 윈도우 리사이즈 자동 반영 (매 프레임 현재 viewport 사용)

**가상 커서:**
- `position: fixed` div, `pointer-events: none`, 높은 z-index
- `cursor.css`에 class 정의 (inline style 대신 — CSP 호환)
- CSS `transform: translate()`로 이동 (repaint 최소화)
- 클릭 시 ripple 애니메이션 피드백

**조작 실행:**
- 커서 이동: `transform: translate(x, y)` 업데이트
- 클릭: `document.elementFromPoint(x, y)` → `dispatchEvent(new MouseEvent('click', { bubbles: true }))`
- 스크롤: `window.scrollBy({ top: deltaY, behavior: 'smooth' })`

**에러 처리 & 디그레이데이션:**
- `elementFromPoint` null 반환 시: 무시, 커서만 표시 유지
- 메시지 포트 끊김 (페이지 이동 중): Content Script 재주입은 정적 선언이 자동 처리
- 가상 커서 div 생성 실패 (엄격한 CSP): `try/catch`로 감지, Side Panel에 `CONTENT_SCRIPT_LIMITED` 메시지 → UI에서 "이 페이지에서는 제한적으로 동작합니다" 안내
- `chrome://` 등 제한 페이지: Content Script 미주입 → 메시지 전달 실패 시 Side Panel UI에서 비활성 표시

### 메시지 프로토콜 (messages.js)

```javascript
// Side Panel → Background → Content Script (정규화 좌표)
{ type: 'GESTURE_MOVE', nx: 0.45, ny: 0.32 }
{ type: 'GESTURE_CLICK', nx: 0.45, ny: 0.32 }
{ type: 'GESTURE_SCROLL', deltaY: -0.05 }  // 정규화된 이동량

// Side Panel → Background (직접 처리)
{ type: 'GESTURE_NAVIGATE', direction: 'back' | 'forward' }

// Content Script → Background → Side Panel (상태)
{ type: 'CONTENT_SCRIPT_READY' }
{ type: 'CONTENT_SCRIPT_LIMITED', reason: 'csp' | 'restricted_page' }
```

---

## Gesture Mapping

### Phase 1 (MVP)

| 제스처 | 감지 방법 | 브라우저 동작 | 활성화 조건 |
|--------|-----------|---------------|-------------|
| 포인팅 | 검지만 펴짐 | 커서 이동 | `fingerExtension(index) > 0.7`, 나머지 접힘 |
| 핀치 | 엄지+검지 맞닿음 | 클릭 | `pinchGap < 0.1` (palmWidth 정규화), 2프레임 유지 |
| 투핑거 슬라이드 | 검지+중지 펴고 Y 이동 | 스크롤 | 두 손가락 펴짐 + deltaY > deadzone |

### Phase 2

| 제스처 | 감지 방법 | 브라우저 동작 | 활성화 조건 |
|--------|-----------|---------------|-------------|
| 핀치 홀드+이동 | 핀치 유지 + 이동 | 드래그 | 핀치 5프레임 이상 유지 + 이동량 > deadzone |
| 스와이프 | 손바닥 X 빠른 이동 | 뒤로/앞으로 | 5손가락 펴짐 + 수평 속도 > threshold |

### 떨림 방지 파라미터

| 파라미터 | 값 | 용도 |
|----------|-----|------|
| EMA alpha (커서) | 0.3 | 커서 이동 스무딩 |
| EMA alpha (스크롤) | 0.5 | 스크롤 반응성 |
| 핀치 프레임 streak | 2 | 클릭 오발동 방지 |
| 스크롤 deadzone | 0.02 | 미세 움직임 무시 |
| 스와이프 속도 threshold | 0.15/frame | 의도적 스와이프만 감지 |

---

## Security & Constraints

- 카메라 권한은 Side Panel에서만 요청 (Content Script는 카메라 접근 안 함)
- 랜드마크 데이터 로컬 처리만, 외부 전송 없음
- `chrome://`, `chrome-extension://`, `chrome-web-store` 페이지에서는 Content Script 주입 불가 → UI에서 비활성 안내
- Content Script의 `dispatchEvent`는 `isTrusted: false` → 일부 사이트에서 `click` 무시 가능 (알려진 제약)
- 가상 커서 스타일은 `cursor.css` class 사용 (inline style 아님 — 엄격한 CSP 호환)
- MediaPipe 번들은 확장프로그램 내 로컬 파일 (외부 CDN 의존 없음)

---

## Phased Rollout

### Phase 1 (MVP)
- `hand-tracking-core/` 라이브러리 추출
- 크롬 확장프로그램 기본 구조 (manifest, side panel, content script, service worker)
- 포인팅(커서), 핀치(클릭), 투핑거(스크롤)

### Phase 2
- 드래그 (핀치 홀드+이동)
- 스와이프 (뒤로/앞으로)
- Side Panel UI 개선 (감도 설정, 제스처 가이드)

### Phase 3
- 탭 전환 제스처
- 확대/축소 (양손 핀치)
- damta 리팩터링 (공유 라이브러리 전환)

### Phase 4 (향후)
- 텍스트 선택
- 커스텀 제스처 매핑 설정
- 개발 가이드 Claude Code skill 작성

---

## Testing Strategy

### hand-tracking-core (Node 테스트)
- UMD 모듈 → `node --test` 로 직접 테스트
- 랜드마크 유틸: 거리, 각도, 정규화 정확성
- 제스처 감지: 모의 랜드마크로 핀치/포인팅/스와이프 판별
- 스무더: EMA, 히스테리시스, deadzone 동작 검증

### gesture-control

**메시지 프로토콜 테스트 (Node):**
- `messages.js`를 UMD로 작성하여 메시지 생성/검증 로직 단위 테스트
- mock chrome API로 service-worker 라우팅 로직 테스트

**수동 테스트:**
- Side Panel: 카메라 연동, 제스처 감지 동작
- Content Script: 커서 이동, 클릭, 스크롤 동작
- 메시지 흐름: Side Panel → Background → Content Script 연동
- 제한 페이지 (chrome://) 접근 시 디그레이데이션 확인
