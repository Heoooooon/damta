# Webcam Smoke Effect Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹캠으로 담배 피는 손 제스처를 감지하고 검정 배경 위에 연기 파티클 효과를 렌더링하는 웹앱 구현

**Architecture:** 단일 페이지 웹앱 (빌드 도구 없음). MediaPipe Hands/Face Mesh로 제스처 감지, Canvas 2D 사전 렌더링 스프라이트 파티클 시스템으로 연기 효과. 노이즈는 인라인 Perlin noise 구현 (외부 의존성 없음).

**Tech Stack:** MediaPipe Hands/Face Mesh (CDN, 버전 고정), Canvas 2D, 인라인 Perlin noise, 순수 HTML/JS/CSS

**Spec:** `docs/superpowers/specs/2026-03-20-webcam-smoke-effect-design.md`

---

## File Structure

```
.gitignore          ← OS 파일, .superpowers 제외
index.html          ← 메인 페이지, CDN 스크립트 로드, 캔버스/PIP/UI 요소
style.css           ← 전체 화면 검정 배경, PIP 스타일, 모드 버튼
js/
├── noise.js        ← 인라인 Perlin noise 2D 구현
├── modes.js        ← 사실적/아트 모드 프리셋 (색상, 속도, 크기, 소용돌이 파라미터)
├── hand.js         ← 담배 포즈 감지 로직 (랜드마크 분석, 안정성 처리)
├── face.js         ← Face Mesh 입 위치 추출, 3프레임 간격 추론, 선형 보간
├── smoke.js        ← 파티클 풀, 스프라이트 생성, 물리 업데이트, 렌더링, 아트 모드 소용돌이
└── app.js          ← 웹캠 초기화, MediaPipe 에러 처리, 메인 루프, 상태 머신, 키보드 이벤트
```

**스크립트 로드 순서:** index.html에서는 JS 파일을 생성된 순서대로 추가한다. 아직 생성되지 않은 파일은 포함하지 않고, 해당 Task에서 index.html에 `<script>` 태그를 추가한다.

---

## Chunk 1: 프로젝트 뼈대 + 웹캠

### Task 1: 프로젝트 초기화 + HTML/CSS

**Files:**
- Create: `.gitignore`
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: .gitignore 작성**

```
.DS_Store
.superpowers/
node_modules/
```

- [ ] **Step 2: index.html 작성 (CDN + 빈 구조, JS 파일은 아직 없음)**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smoke Effect</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="smokeCanvas"></canvas>
  <video id="webcam" autoplay playsinline></video>
  <div id="modeBtn" class="mode-btn">Realistic</div>
  <div id="error" class="error-msg" hidden></div>

  <!-- CDN Dependencies (version pinned) -->
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.min.js"></script>

  <!-- App scripts (added as files are created) -->
</body>
</html>
```

- [ ] **Step 3: style.css 작성**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #000;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
}

#smokeCanvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

#webcam {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 160px;
  height: 120px;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  object-fit: cover;
  transform: scaleX(-1);
  z-index: 10;
}

#webcam.hidden { display: none; }

.mode-btn {
  position: fixed;
  bottom: 20px;
  left: 20px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
  z-index: 10;
  user-select: none;
  transition: background 0.2s;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.error-msg {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.7);
  font-family: monospace;
  font-size: 14px;
  text-align: center;
  white-space: pre-line;
  z-index: 20;
}
```

- [ ] **Step 4: 로컬 서버로 확인**

Run: `cd /Users/gwon-yeheon/CMORE/damta && python3 -m http.server 8080`
브라우저에서 `http://localhost:8080` 열기.
Expected: 검정 화면 + 좌측 하단 "Realistic" 버튼. 콘솔에 JS 404 에러 없음 (아직 JS 파일 미포함).

- [ ] **Step 5: Commit**

```bash
git init
git add .gitignore index.html style.css
git commit -m "feat: add project skeleton with HTML/CSS and CDN dependencies"
```

### Task 2: noise.js + app.js — 웹캠 초기화 + 메인 루프

**Files:**
- Create: `js/noise.js`
- Create: `js/app.js`
- Modify: `index.html` (스크립트 태그 추가)

- [ ] **Step 1: js/noise.js 작성 — 인라인 Perlin noise 2D**

```javascript
/**
 * Minimal Perlin noise 2D implementation.
 * No external dependencies.
 */
const Noise = (function () {
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const a = perm[xi] + yi;
    const b = perm[xi + 1] + yi;
    return lerp(
      lerp(grad(perm[a], xf, yf), grad(perm[b], xf - 1, yf), u),
      lerp(grad(perm[a + 1], xf, yf - 1), grad(perm[b + 1], xf - 1, yf - 1), u),
      v
    );
  }

  return { noise2D };
})();
```

- [ ] **Step 2: js/app.js 작성 — 웹캠 초기화 + 캔버스 리사이즈 + 메인 루프 스켈레톤**

```javascript
(function () {
  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  const video = document.getElementById('webcam');
  const errorEl = document.getElementById('error');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      errorEl.textContent = '웹캠 접근이 필요합니다.\n브라우저에서 카메라 권한을 허용해주세요.';
      errorEl.hidden = false;
      return false;
    }
  }

  function mainLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // TODO: MediaPipe 처리, 파티클 업데이트/렌더링
    requestAnimationFrame(mainLoop);
  }

  async function init() {
    const camReady = await initWebcam();
    if (camReady) {
      requestAnimationFrame(mainLoop);
    }
  }

  init();

  // Export for other modules
  window.APP = { canvas, ctx, video };
})();
```

- [ ] **Step 3: index.html에 스크립트 태그 추가**

`<!-- App scripts -->` 주석 아래에 추가:

```html
  <script src="js/noise.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 4: 브라우저에서 확인**

브라우저 새로고침.
Expected: 웹캠 권한 요청 → 허용 → 우측 상단에 미러링된 웹캠 PIP 표시. 콘솔 에러 없음.

- [ ] **Step 5: Commit**

```bash
mkdir -p js
git add js/noise.js js/app.js index.html
git commit -m "feat: add Perlin noise, webcam init, and main loop skeleton"
```

---

## Chunk 2: 손 제스처 감지

### Task 3: hand.js — MediaPipe Hands 초기화 + 랜드마크

**Files:**
- Create: `js/hand.js`
- Modify: `js/app.js`
- Modify: `index.html`

- [ ] **Step 1: js/hand.js 작성 — 전체 파일 (초기화 + 포즈 감지 + 안정성)**

```javascript
const HandDetector = (function () {
  let latestLandmarks = null;
  let initError = null;

  // --- MediaPipe Hands setup ---
  let hands;
  try {
    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        latestLandmarks = results.multiHandLandmarks[0];
      } else {
        latestLandmarks = null;
      }
    });
  } catch (err) {
    initError = 'MediaPipe Hands 로딩 실패: ' + err.message;
  }

  // --- Gesture detection ---
  const CIG_GAP_MIN = 0.03;
  const CIG_GAP_MAX = 0.12;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function palmWidth(landmarks) {
    return dist(landmarks[0], landmarks[9]);
  }

  function isFingerExtended(landmarks, tipIdx, pipIdx) {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  }

  function isCigPose(landmarks) {
    const pw = palmWidth(landmarks);
    if (pw === 0) return false;

    // 1) Index-middle fingertip gap within range
    const gap = dist(landmarks[8], landmarks[12]) / pw;
    if (gap < CIG_GAP_MIN || gap > CIG_GAP_MAX) return false;

    // 2) Index and middle fingers extended
    if (!isFingerExtended(landmarks, 8, 6)) return false;
    if (!isFingerExtended(landmarks, 12, 10)) return false;

    // 3) Ring and pinky folded
    if (isFingerExtended(landmarks, 16, 14)) return false;
    if (isFingerExtended(landmarks, 20, 18)) return false;

    // 4) Thumb not extended outward (prevent open-hand false positive)
    const thumbDist = dist(landmarks[4], landmarks[5]) / pw;
    if (thumbDist > 0.8) return false;

    return true;
  }

  // --- Stability: 3-frame consecutive ---
  let consecutiveDetect = 0;
  let consecutiveLost = 0;
  let poseActive = false;

  function getCigTipPosition(landmarks) {
    return {
      x: (landmarks[8].x + landmarks[12].x) / 2,
      y: (landmarks[8].y + landmarks[12].y) / 2,
    };
  }

  function update(landmarks) {
    if (landmarks && isCigPose(landmarks)) {
      consecutiveDetect++;
      consecutiveLost = 0;
      if (consecutiveDetect >= 3) poseActive = true;
    } else {
      consecutiveLost++;
      consecutiveDetect = 0;
      if (consecutiveLost >= 3) poseActive = false;
    }

    return {
      poseActive,
      cigTip: landmarks && poseActive ? getCigTipPosition(landmarks) : null,
    };
  }

  async function send(videoEl) {
    if (!hands) return;
    try {
      await hands.send({ image: videoEl });
    } catch (err) {
      // MediaPipe send error — ignore and retry next frame
    }
  }

  function getLandmarks() {
    return latestLandmarks;
  }

  function getError() {
    return initError;
  }

  return { send, getLandmarks, update, getError };
})();
```

- [ ] **Step 2: app.js mainLoop 수정 — Hand 연결 + 디버그 표시**

`js/app.js`의 `mainLoop` 함수를 다음으로 교체. (`function mainLoop()` 부터 닫는 `}` 까지를 교체):

```javascript
  async function mainLoop() {
    await HandDetector.send(video);
    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Debug: draw landmarks
    if (landmarks) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      for (const lm of landmarks) {
        const x = canvas.width * (1 - lm.x);
        const y = canvas.height * lm.y;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Debug: pose status
    ctx.fillStyle = handState.poseActive ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.5)';
    ctx.font = '16px monospace';
    ctx.fillText(handState.poseActive ? 'CIG POSE DETECTED' : 'NO POSE', 20, 30);

    if (handState.cigTip) {
      const tx = canvas.width * (1 - handState.cigTip.x);
      const ty = canvas.height * handState.cigTip.y;
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(mainLoop);
  }
```

또한 `init` 함수에 MediaPipe 에러 체크 추가:

```javascript
  async function init() {
    // Check MediaPipe loading
    const handErr = HandDetector.getError();
    if (handErr) {
      errorEl.textContent = handErr + '\n페이지를 새로고침해주세요.';
      errorEl.hidden = false;
      return;
    }

    const camReady = await initWebcam();
    if (camReady) {
      requestAnimationFrame(mainLoop);
    }
  }
```

- [ ] **Step 3: index.html에 hand.js 스크립트 추가**

`app.js` 스크립트 태그 **앞에** 추가:

```html
  <script src="js/hand.js"></script>
```

- [ ] **Step 4: 브라우저에서 확인**

Expected: 손을 웹캠에 보여주면 초록색 랜드마크 21개 표시. 담배 포즈 → "CIG POSE DETECTED" + 노란 점. 다른 손 모양 → "NO POSE".

- [ ] **Step 5: Commit**

```bash
git add js/hand.js js/app.js index.html
git commit -m "feat: add hand detection with cigarette pose recognition"
```

---

## Chunk 3: 얼굴 감지 + 상태 머신

### Task 4: face.js — Face Mesh + 입 위치 보간

**Files:**
- Create: `js/face.js`
- Modify: `js/app.js`
- Modify: `index.html`

- [ ] **Step 1: js/face.js 작성 — Face Mesh + 3프레임 간격 + 선형 보간**

```javascript
const FaceDetector = (function () {
  let mouthPos = null;     // latest detected {x, y}
  let prevMouthPos = null;  // previous detection for interpolation
  let interpMouthPos = null; // interpolated position returned to caller
  let faceHeight = 0;
  let frameCount = 0;
  let initError = null;
  const DETECT_INTERVAL = 3;

  let faceMesh;
  try {
    faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const lm = results.multiFaceLandmarks[0];
        prevMouthPos = mouthPos ? { x: mouthPos.x, y: mouthPos.y } : null;
        mouthPos = { x: lm[13].x, y: lm[13].y };
        faceHeight = Math.hypot(lm[10].x - lm[152].x, lm[10].y - lm[152].y);
      } else {
        mouthPos = null;
        prevMouthPos = null;
        faceHeight = 0;
      }
    });
  } catch (err) {
    initError = 'MediaPipe Face Mesh 로딩 실패: ' + err.message;
  }

  async function send(videoEl) {
    if (!faceMesh) return;
    frameCount++;
    const isDetectFrame = frameCount % DETECT_INTERVAL === 0;

    if (isDetectFrame) {
      try {
        await faceMesh.send({ image: videoEl });
      } catch (err) {
        // ignore, retry next interval
      }
    }

    // Interpolate mouth position between detection frames
    if (mouthPos) {
      if (prevMouthPos && !isDetectFrame) {
        const frameInInterval = frameCount % DETECT_INTERVAL;
        const t = frameInInterval / DETECT_INTERVAL;
        interpMouthPos = {
          x: prevMouthPos.x + (mouthPos.x - prevMouthPos.x) * t,
          y: prevMouthPos.y + (mouthPos.y - prevMouthPos.y) * t,
        };
      } else {
        interpMouthPos = { x: mouthPos.x, y: mouthPos.y };
      }
    } else {
      interpMouthPos = null;
    }
  }

  function getMouth() {
    return interpMouthPos;
  }

  function getFaceHeight() {
    return faceHeight;
  }

  function getError() {
    return initError;
  }

  return { send, getMouth, getFaceHeight, getError };
})();
```

- [ ] **Step 2: app.js에 Face Mesh 추가**

mainLoop에서 `await HandDetector.send(video);` 직후에 추가:

```javascript
    await FaceDetector.send(video);
```

디버그 표시 (기존 디버그 코드 뒤에 추가):

```javascript
    // Debug: mouth position
    const mouth = FaceDetector.getMouth();
    if (mouth) {
      const mx = canvas.width * (1 - mouth.x);
      const my = canvas.height * mouth.y;
      ctx.fillStyle = 'cyan';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.fill();
    }
```

init 함수에 Face Mesh 에러 체크 추가 (handErr 체크 후):

```javascript
    const faceErr = FaceDetector.getError();
    if (faceErr) {
      errorEl.textContent = faceErr + '\n페이지를 새로고침해주세요.';
      errorEl.hidden = false;
      return;
    }
```

- [ ] **Step 3: index.html에 face.js 스크립트 추가**

`hand.js` 스크립트 태그 **뒤**, `app.js` **앞에** 추가:

```html
  <script src="js/face.js"></script>
```

- [ ] **Step 4: 브라우저에서 확인**

Expected: 얼굴 보이면 입 위치에 시안색 점 표시. 3프레임 간격 감지이지만 보간으로 부드럽게 움직임.

- [ ] **Step 5: Commit**

```bash
git add js/face.js js/app.js index.html
git commit -m "feat: add Face Mesh with mouth position interpolation"
```

### Task 5: 상태 머신 — 흡입/내뿜기 감지

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: 상태 머신 함수 추가**

app.js IIFE 내부, `resizeCanvas()` 호출 뒤, `mainLoop` 정의 **앞에** 다음 코드를 삽입:

```javascript
  // --- Smoke State Machine ---
  const NEAR_MOUTH_RATIO = 0.35;
  const EXHALE_MIN_MOVE = 0.15;
  const INHALE_MIN_DURATION = 300; // ms

  let smokeState = 'idle'; // idle | fingertip | inhaling | exhaling
  let inhaleStartTime = 0;
  let lastMouthDist = Infinity;
  let exhaleTriggered = false;

  function updateSmokeState(handState, mouth, faceH, now) {
    if (!handState.poseActive || !handState.cigTip) {
      smokeState = 'idle';
      inhaleStartTime = 0;
      exhaleTriggered = false;
      return { state: 'idle', emitPos: null, isExhale: false };
    }

    if (!mouth || faceH === 0) {
      smokeState = 'fingertip';
      exhaleTriggered = false;
      return { state: 'fingertip', emitPos: handState.cigTip, isExhale: false };
    }

    const tipToMouth = Math.hypot(
      handState.cigTip.x - mouth.x,
      handState.cigTip.y - mouth.y
    );
    const nearMouth = tipToMouth < NEAR_MOUTH_RATIO * faceH;

    if (nearMouth) {
      if (smokeState !== 'inhaling') {
        inhaleStartTime = now;
        lastMouthDist = tipToMouth;
      }
      smokeState = 'inhaling';
      exhaleTriggered = false;  // reset on new inhale
      return { state: 'inhaling', emitPos: null, isExhale: false };
    }

    // Hand moved away from mouth
    if (smokeState === 'inhaling' && !exhaleTriggered) {
      const moved = tipToMouth - lastMouthDist;
      const longEnough = (now - inhaleStartTime) >= INHALE_MIN_DURATION;
      const farEnough = moved > EXHALE_MIN_MOVE * faceH;

      if (longEnough && farEnough) {
        smokeState = 'exhaling';
        exhaleTriggered = true;
        return { state: 'exhaling', emitPos: mouth, isExhale: true };
      }
    }

    // Default or after exhale: fingertip smoke
    smokeState = 'fingertip';
    exhaleTriggered = false;  // reset when back to fingertip (allows next inhale-exhale cycle)
    return { state: 'fingertip', emitPos: handState.cigTip, isExhale: false };
  }
```

- [ ] **Step 2: mainLoop에서 상태 머신 호출 + 디버그 표시**

mainLoop 내부, `const handState = ...` 뒤에 추가:

```javascript
    const now = performance.now();
    const smokeResult = updateSmokeState(
      handState,
      FaceDetector.getMouth(),
      FaceDetector.getFaceHeight(),
      now
    );

    // Debug: show state
    ctx.fillStyle = 'white';
    ctx.font = '14px monospace';
    ctx.fillText('State: ' + smokeResult.state, 20, 50);
```

- [ ] **Step 3: 브라우저에서 확인**

Expected:
- 담배 포즈 + 손 아래 → `State: fingertip`
- 손을 입 근처로 가져감 → `State: inhaling`
- 0.3초 후 입에서 떼면 → `State: exhaling` (1프레임)
- 이후 → `State: fingertip` (다시 반복 가능)
- 포즈 해제 → `State: idle`

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: add smoke state machine with exhale trigger on mouth departure"
```

---

## Chunk 4: 파티클 시스템

### Task 6: modes.js — 모드 프리셋

**Files:**
- Create: `js/modes.js`
- Modify: `index.html`

- [ ] **Step 1: js/modes.js 작성**

아트 모드에 소용돌이 관련 파라미터 (`swirlStrength`, `swirlFrequency`) 추가:

```javascript
const SmokeModes = (function () {
  let current = 'realistic';

  const presets = {
    realistic: {
      name: 'Realistic',
      colors: [
        'rgba(255,255,255,',
        'rgba(220,220,220,',
        'rgba(200,200,200,',
      ],
      startAlpha: 0.04,
      maxAlpha: 0.08,
      startSize: 4,
      maxSize: 40,
      speed: { min: 0.3, max: 0.8 },
      lifetime: { min: 2000, max: 4000 },
      drift: 0.15,
      swirlStrength: 0,    // no swirl in realistic
      swirlFrequency: 0,
      maxParticles: 100,
      exhaleMultiplier: 3,
    },
    artistic: {
      name: 'Artistic',
      colors: [
        'rgba(0,255,255,',
        'rgba(255,0,255,',
        'rgba(128,0,255,',
        'rgba(255,100,200,',
      ],
      startAlpha: 0.06,
      maxAlpha: 0.12,
      startSize: 3,
      maxSize: 50,
      speed: { min: 0.5, max: 1.2 },
      lifetime: { min: 2500, max: 5000 },
      drift: 0.4,
      swirlStrength: 2.0,   // swirl/spiral force
      swirlFrequency: 0.003, // swirl oscillation frequency
      maxParticles: 200,
      exhaleMultiplier: 4,
    },
  };

  function get() {
    return presets[current];
  }

  function toggle() {
    current = current === 'realistic' ? 'artistic' : 'realistic';
    return presets[current];
  }

  function getName() {
    return presets[current].name;
  }

  return { get, toggle, getName };
})();
```

- [ ] **Step 2: index.html에 modes.js 스크립트 추가**

`noise.js` 스크립트 태그 **뒤**, `hand.js` **앞에** 추가:

```html
  <script src="js/modes.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add js/modes.js index.html
git commit -m "feat: add smoke mode presets with swirl parameters for artistic mode"
```

### Task 7: smoke.js — 파티클 시스템 (스프라이트 + 풀 + 소용돌이)

**Files:**
- Create: `js/smoke.js`
- Modify: `index.html`

- [ ] **Step 1: js/smoke.js 작성**

아트 모드의 소용돌이/나선형 운동을 `swirlStrength`와 `swirlFrequency`로 구현:

```javascript
const SmokeSystem = (function () {
  const MAX_PARTICLES = 300;
  const pool = [];
  const active = [];

  // --- Pre-rendered sprites ---
  const spriteCache = {};

  function createSprite(color, size) {
    const key = color + size;
    if (spriteCache[key]) return spriteCache[key];

    const off = document.createElement('canvas');
    off.width = size * 2;
    off.height = size * 2;
    const octx = off.getContext('2d');
    const grad = octx.createRadialGradient(size, size, 0, size, size, size);
    grad.addColorStop(0, color + '1)');
    grad.addColorStop(0.4, color + '0.3)');
    grad.addColorStop(1, color + '0)');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, size * 2, size * 2);

    spriteCache[key] = off;
    return off;
  }

  // --- Particle pool ---
  function createParticle() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      size: 0, alpha: 0, maxAlpha: 0,
      life: 0, maxLife: 0,
      color: '', sprite: null, mode: null,
      originX: 0, originY: 0, // for swirl calculation
    };
  }

  for (let i = 0; i < MAX_PARTICLES; i++) {
    pool.push(createParticle());
  }

  function acquire() {
    if (pool.length > 0) return pool.pop();
    if (active.length >= MAX_PARTICLES) return null;
    return createParticle();
  }

  function release(p) {
    pool.push(p);
  }

  // --- Emit ---
  function emit(normX, normY, canvasW, canvasH, mode, isExhale) {
    const count = isExhale ? mode.exhaleMultiplier * 5 : 2;
    const colors = mode.colors;
    const cx = canvasW * (1 - normX);
    const cy = canvasH * normY;

    for (let i = 0; i < count; i++) {
      const p = acquire();
      if (!p) break;

      p.x = cx + (Math.random() - 0.5) * 10;
      p.y = cy + (Math.random() - 0.5) * 10;
      p.originX = p.x;
      p.originY = p.y;

      if (isExhale) {
        p.vx = (Math.random() - 0.5) * 2;
        p.vy = -(Math.random() * mode.speed.max + mode.speed.min);
      } else {
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = -(Math.random() * mode.speed.min + 0.1);
      }

      p.size = mode.startSize + Math.random() * 4;
      p.alpha = mode.startAlpha;
      p.maxAlpha = mode.maxAlpha;
      p.life = 0;
      p.maxLife = mode.lifetime.min + Math.random() * (mode.lifetime.max - mode.lifetime.min);
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.sprite = createSprite(p.color, Math.ceil(mode.maxSize));
      p.mode = mode;

      active.push(p);
    }
  }

  // --- Update + Render ---
  function update(ctx, dt, noiseFunc) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        active.splice(i, 1);
        release(p);
        continue;
      }

      const lifeRatio = p.life / p.maxLife;
      const currentSize = p.size + (p.mode.maxSize - p.size) * lifeRatio;

      // Alpha: fade in then fade out
      if (lifeRatio < 0.1) {
        p.alpha = p.maxAlpha * (lifeRatio / 0.1);
      } else {
        p.alpha = p.maxAlpha * (1 - (lifeRatio - 0.1) / 0.9);
      }

      // Noise drift (both modes, stronger in artistic)
      if (noiseFunc) {
        const n = noiseFunc(p.x * 0.005, p.y * 0.005 + p.life * 0.001);
        p.vx += n * p.mode.drift * 0.1;
      }

      // Artistic mode: swirl/spiral motion
      if (p.mode.swirlStrength > 0) {
        const angle = p.life * p.mode.swirlFrequency;
        p.vx += Math.cos(angle) * p.mode.swirlStrength * 0.01;
        p.vy += Math.sin(angle) * p.mode.swirlStrength * 0.005;
        // Pulsating size in artistic mode
        const pulse = 1 + Math.sin(p.life * 0.005) * 0.15;
        p.alpha *= pulse;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.vy *= 0.995;

      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.drawImage(
        p.sprite,
        p.x - currentSize,
        p.y - currentSize,
        currentSize * 2,
        currentSize * 2
      );
    }

    ctx.restore();
  }

  function getActiveCount() {
    return active.length;
  }

  return { emit, update, getActiveCount };
})();
```

- [ ] **Step 2: index.html에 smoke.js 스크립트 추가**

`face.js` 스크립트 태그 **뒤**, `app.js` **앞에** 추가:

```html
  <script src="js/smoke.js"></script>
```

- [ ] **Step 3: 간단한 테스트 — 클릭으로 파티클 방출**

app.js의 mainLoop 직전에 임시 테스트 코드 추가:

```javascript
  // TEMP: click to test particles
  canvas.addEventListener('click', (e) => {
    const mode = SmokeModes.get();
    SmokeSystem.emit(
      1 - e.clientX / canvas.width,  // reverse the mirror mapping
      e.clientY / canvas.height,
      canvas.width, canvas.height, mode, false
    );
  });
```

mainLoop 내부, `ctx.clearRect` 뒤에 추가:

```javascript
    SmokeSystem.update(ctx, 16, Noise.noise2D);
```

- [ ] **Step 4: 브라우저에서 확인**

화면 아무 곳이나 클릭.
Expected: 클릭 위치에서 흰 연기 파티클이 위로 상승하며 서서히 사라짐.

- [ ] **Step 5: 임시 테스트 코드 제거**

app.js에서 `// TEMP: click to test particles` 블록과 mainLoop 내의 `SmokeSystem.update` 줄 제거.

- [ ] **Step 6: Commit**

```bash
git add js/smoke.js index.html js/app.js
git commit -m "feat: add particle system with sprite rendering, pooling, and swirl motion"
```

---

## Chunk 5: 통합 + 최종 완성

### Task 8: app.js — 파티클 시스템 연결

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: mainLoop에 파티클 emit + update 연결**

mainLoop 함수를 수정. 기존 `function mainLoop()` → `async function mainLoop(timestamp)` 로 변경하고, 전체를 다음으로 교체:

```javascript
  let lastTime = 0;

  async function mainLoop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    await HandDetector.send(video);
    await FaceDetector.send(video);

    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);

    const now = performance.now();
    const smokeResult = updateSmokeState(
      handState,
      FaceDetector.getMouth(),
      FaceDetector.getFaceHeight(),
      now
    );

    // Emit particles
    if (smokeResult.emitPos) {
      SmokeSystem.emit(
        smokeResult.emitPos.x,
        smokeResult.emitPos.y,
        canvas.width,
        canvas.height,
        SmokeModes.get(),
        smokeResult.isExhale
      );
    }

    // Clear and render
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    SmokeSystem.update(ctx, dt, Noise.noise2D);

    // Debug: state + particle count
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px monospace';
    ctx.fillText('State: ' + smokeResult.state + ' | Particles: ' + SmokeSystem.getActiveCount(), 20, 30);

    requestAnimationFrame(mainLoop);
  }
```

- [ ] **Step 2: 브라우저에서 확인**

Expected:
1. 담배 포즈 → 손끝에서 잔잔한 흰 연기 상승
2. 손을 입 근처로 → 연기 멈춤
3. 입에서 떼면 → 입에서 많은 연기 내뿜기
4. 화면 좌상단에 `State: fingertip | Particles: 42` 같은 디버그 정보

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: connect particle system to gesture detection pipeline"
```

### Task 9: app.js — 키보드 단축키 + 모드 전환 + 디버그 제거

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: 키보드 단축키 + 모드 버튼 추가**

app.js IIFE 내부, `init()` 호출 **앞에** 추가:

```javascript
  // --- Keyboard shortcuts ---
  const modeBtn = document.getElementById('modeBtn');
  modeBtn.textContent = SmokeModes.getName();

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyM') {
      e.preventDefault();
      const mode = SmokeModes.toggle();
      modeBtn.textContent = mode.name;
    } else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } else if (e.code === 'KeyH') {
      video.classList.toggle('hidden');
    }
  });

  modeBtn.addEventListener('click', () => {
    const mode = SmokeModes.toggle();
    modeBtn.textContent = mode.name;
  });
```

- [ ] **Step 2: 디버그 코드 제거**

mainLoop에서 다음 디버그 코드들을 모두 제거:
- 랜드마크 초록색 점 그리기 (`if (landmarks) { ... }`)
- 포즈 상태 텍스트 (`'CIG POSE DETECTED'` / `'NO POSE'`)
- 노란 점 (`handState.cigTip` 표시)
- 시안색 입 위치 점 (`FaceDetector.getMouth()` 표시)
- State/Particles 디버그 텍스트

디버그 제거 후 mainLoop는 다음만 남아야 함:

```javascript
  let lastTime = 0;

  async function mainLoop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    await HandDetector.send(video);
    await FaceDetector.send(video);

    const landmarks = HandDetector.getLandmarks();
    const handState = HandDetector.update(landmarks);

    const now = performance.now();
    const smokeResult = updateSmokeState(
      handState,
      FaceDetector.getMouth(),
      FaceDetector.getFaceHeight(),
      now
    );

    if (smokeResult.emitPos) {
      SmokeSystem.emit(
        smokeResult.emitPos.x,
        smokeResult.emitPos.y,
        canvas.width,
        canvas.height,
        SmokeModes.get(),
        smokeResult.isExhale
      );
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    SmokeSystem.update(ctx, dt, Noise.noise2D);

    requestAnimationFrame(mainLoop);
  }
```

- [ ] **Step 3: 브라우저에서 확인**

Expected:
1. 검정 화면 + 웹캠 PIP (우측 상단, 미러링) — 디버그 텍스트 없음
2. 담배 포즈 → 손끝에서 연기
3. 흡입 → 연기 멈춤
4. 내뿜기 → 입에서 연기
5. `Space` → 아트 모드 (컬러 + 소용돌이 연기)
6. `Space` 다시 → 사실적 모드 복귀
7. `H` → PIP 숨기기/보이기
8. `F` → 풀스크린
9. 모드 전환 시 기존 파티클은 유지되고 새 파티클만 새 모드 적용

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: add keyboard shortcuts, mode switching, remove debug overlays"
```

### Task 10: 최종 확인

- [ ] **Step 1: 전체 기능 체크리스트**

브라우저에서 다음을 모두 확인:
- [ ] 검정 배경 + 웹캠 PIP (우측 상단, 미러링)
- [ ] 담배 포즈 감지 → 손끝 연기
- [ ] 입 근처 → 흡입 (연기 없음)
- [ ] 입에서 떼기 → 내뿜기 (입에서 연기)
- [ ] 반복 흡입-내뿜기 가능
- [ ] Space/M → 모드 전환 (사실적 ↔ 아트)
- [ ] 아트 모드에서 소용돌이/나선형 움직임
- [ ] F → 풀스크린
- [ ] H → PIP 숨기기
- [ ] 웹캠 거부 시 에러 메시지
- [ ] 콘솔 에러 없음
- [ ] Chrome DevTools Performance: 60fps 유지

- [ ] **Step 2: 최종 Commit**

```bash
git add -A
git commit -m "feat: webcam smoke effect v1.0 - gesture detection + particle system"
```
