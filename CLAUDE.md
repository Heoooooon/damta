# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Webcam-based cigarette smoking gesture detection app that renders smoke particle effects on a full-screen black canvas. Uses MediaPipe Hands/Face Mesh (CDN) for tracking and Canvas 2D for rendering. Korean-language project targeting desktop Chrome/Edge.

## Running

No build step. Vanilla HTML + JS with CDN dependencies.

```bash
# Local dev server (required — file:// breaks CORS/getUserMedia)
python3 -m http.server 8000
# or
npx serve .
```

## Testing

Uses Node.js built-in test runner (`node:test` + `node:assert/strict`). No npm dependencies needed.

```bash
# Run all tests
node --test tests/

# Run a single test file
node --test tests/smoke-core.test.js
```

Only UMD-exported modules are testable in Node: `interaction-core.js`, `smoke-core.js`, `tracking-overlay.js`. Browser-only IIFEs (`smoke.js`, `hand.js`, `face.js`, `modes.js`, `app.js`, `noise.js`) depend on DOM/MediaPipe and cannot be tested with `node --test`.

## Architecture

All JS files are in `js/` and loaded as plain `<script>` tags in `index.html` (order matters). No module bundler.

**Two module patterns coexist:**
- **UMD** (`interaction-core.js`, `smoke-core.js`, `tracking-overlay.js`): Export via `module.exports` for Node tests and attach to `globalThis` for browser use
- **IIFE** (all others): Attach to `window` directly, browser-only

**Data flow (main loop in `app.js`):**
1. `HandDetector.send(video)` + `FaceDetector.send(video)` — feed webcam frames to MediaPipe
2. `HandDetector.update(landmarks)` — runs `InteractionCore.createPoseTracker` to detect cigarette pose, returns `{poseActive, cigTip}`
3. `InteractionCore.createSmokeStateMachine().update(...)` — state machine: `idle → fingertip → inhaling → exhaling → idle`
4. `SmokeSystem.emit(...)` — creates particles using `SmokeCore.getEmissionProfile()` for the current emission type
5. `SmokeSystem.update(ctx, dt, Noise.noise2D)` — physics + rendering with `SmokeCore` helpers for alpha/fade/render state
6. `TrackingOverlay.draw(...)` — draws hand/face wireframe on a small overlay canvas

**Key domain concepts:**
- Landmarks are normalized (0–1). Canvas mapping mirrors X: `canvasX = canvasWidth * (1 - landmark.x)`
- `FaceDetector` runs every 3rd frame for performance, interpolates mouth position between detections
- Smoke state machine transitions: fingertip smoke (idle wisp) → inhaling (near mouth, no smoke) → exhaling (burst then stream from mouth)
- Two visual modes: Realistic (wispy white, strand-based) and Artistic (neon colors, swirl patterns), toggled with Space/M key

**Emission types and their profiles (in `smoke-core.js` and `modes.js`):**
- `fingertip` — thin wisp rising from cigarette tip
- `exhale-burst` — initial dense cloud from mouth
- `exhale-stream` — sustained exhale that lerps toward fingertip profile over time

## Obsidian Vault

- 경로: /Users/gwon-yeheon/gwon-vault
- 온보딩: Memory.md
- 프로젝트별 현황: CMORE/{프로젝트명}/{프로젝트명} 현황.md
- 세션 로그: CMORE/{프로젝트명}/sessions/
- 라우팅 규칙: Memory.md 하단 참고
