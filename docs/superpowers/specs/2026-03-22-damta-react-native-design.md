# damta React Native App — Design Spec

## Overview

Rebuild the webcam-based cigarette smoking gesture detection app as a cross-platform React Native app (iOS + Android). Detects hand poses (V-pose and thumb-index pinch), renders smoke particle effects, and draws hand/face tracking overlays on a full-screen camera preview.

## Tech Stack

| Area | Library |
|------|---------|
| Framework | React Native (bare workflow, no Expo) |
| Camera | react-native-vision-camera v4 |
| Hand Detection | react-native-vision-camera + MediaPipe Hands native SDK |
| Face Detection | react-native-vision-camera-face-detector |
| Rendering | @shopify/react-native-skia |
| Animation/Shared State | react-native-reanimated v3 (Shared Values) |
| Noise | JS Simplex noise (ported from current codebase) |

## Architecture

### Data Flow

```
Camera Frame
  → Frame Processor (native thread, Worklet)
    → MediaPipe Hands: 21 landmarks × up to 2 hands
    → Face Detection: 468 face landmarks
  → Shared Values (Reanimated bridge)
    → JS thread: interaction-core (pose analysis + smoke state machine)
    → Output: {poseActive, cigTip, smokeState, emitPos, poseType}
  → Skia Canvas (UI thread)
    → Particle system update + render
    → Hand/face overlay render
    → Ember glow render
```

### Project Structure

```
damta-app/
├── src/
│   ├── App.tsx                    # Camera permissions + navigation
│   ├── screens/
│   │   └── SmokeScreen.tsx        # Camera + Skia overlay composition
│   ├── components/
│   │   ├── CameraView.tsx         # VisionCamera + Frame Processor setup
│   │   ├── SmokeCanvas.tsx        # Skia Canvas particle rendering
│   │   ├── TrackingOverlay.tsx    # Skia hand/face wireframe overlay
│   │   └── ModeToggle.tsx         # Realistic/Artistic toggle + camera flip
│   ├── core/
│   │   ├── interaction-core.ts    # Pose analysis + smoke state machine
│   │   ├── smoke-core.ts          # Emission profiles, alpha, fade curves
│   │   └── noise.ts               # Simplex noise generator
│   ├── systems/
│   │   ├── smoke-system.ts        # Particle pool, physics, lifecycle
│   │   └── frame-processor.ts     # VisionCamera frame processor (Worklet)
│   └── types/
│       └── index.ts               # Shared type definitions
├── android/
├── ios/
├── package.json
└── tsconfig.json
```

## Module Details

### core/interaction-core.ts

Direct TypeScript port of the current `js/interaction-core.js`. No API changes.

Exports:
- `analyzeHandPose(landmarks, options)` — V-pose + pinch pose detection
- `computeCigaretteTipPosition(landmarks, poseType)` — ember position
- `createPoseTracker(options)` — per-hand pose state with hysteresis
- `createSmokeStateMachine(options)` — idle → fingertip → inhaling → exhaling
- `dist(a, b)` — utility

### core/smoke-core.ts

Direct TypeScript port of `js/smoke-core.js`.

Exports:
- `getEmissionProfile(mode, type, progress)` — particle spawn parameters
- `getParticleAlpha(particle, maxAlpha, lifeRatio)` — fade curves
- `getAltitudeFade(particle, riseDistance)` — altitude-based fade
- `getParticleRenderState(particle, alpha, lifeRatio)` — sprite/veil/halo alpha
- `getLateralSpreadForce(particle, context)` — lateral drift
- `getEmberProfile(mode, state, pulse)` — ember glow parameters

### core/noise.ts

Port of `js/noise.js`. Simplex 2D noise function.

### systems/frame-processor.ts

VisionCamera Frame Processor Worklet.

- Runs MediaPipe Hands (maxNumHands: 2) and face detection on native thread
- Writes landmarks to Reanimated Shared Values
- Face detection runs every 3rd frame (same optimization as web version)
- Shared Values structure:
  ```ts
  handLandmarks: SharedValue<Landmark[][] | null>  // up to 2 hands
  faceLandmarks: SharedValue<Landmark[] | null>
  faceHeight: SharedValue<number>
  mouthPos: SharedValue<Point | null>
  ```

### systems/smoke-system.ts

Rewrite of `js/smoke.js` particle system, adapted for Skia rendering.

- Object pool with max 2000 particles (reduced from 4320 for mobile)
- Physics update loop called from Skia's `useFrameCallback`
- Instead of Canvas 2D `drawImage`, uses Skia `drawCircle` with `RadialGradient` and `BlendMode.Screen`
- Trail rendering uses Skia `Path` with quadratic curves
- Ember rendering uses Skia radial gradients

### components/CameraView.tsx

- VisionCamera with front-facing camera (default)
- Frame processor from `frame-processor.ts`
- Camera flip button (front/back toggle)
- Full-screen preview, mirrored for selfie mode

### components/SmokeCanvas.tsx

- Skia `Canvas` overlay positioned above camera
- `useFrameCallback` drives the main loop:
  1. Read landmarks from Shared Values
  2. Run pose tracker + smoke state machine (interaction-core)
  3. Emit particles (smoke-system)
  4. Update physics + render particles
- Transparent background, `BlendMode.Screen` for smoke

### components/TrackingOverlay.tsx

- Skia `Canvas` drawing hand/face wireframes
- Same polyline indices as current `tracking-overlay.js`
- Hand: warm tones (active: gold, idle: soft white)
- Face: cool blue tones
- Upper + lower lip polylines included

### components/ModeToggle.tsx

- Bottom bar with touch buttons:
  - Mode toggle (Realistic / Artistic)
  - Camera flip (front / back)
- Semi-transparent background, safe area aware

### screens/SmokeScreen.tsx

Composition layer:
```tsx
<View style={{ flex: 1 }}>
  <CameraView />
  <SmokeCanvas />       {/* absolute overlay */}
  <TrackingOverlay />    {/* absolute overlay */}
  <ModeToggle />         {/* bottom bar */}
</View>
```

## Porting Strategy

### Reuse as-is (TS conversion only)
- `interaction-core.js` → `interaction-core.ts`
- `smoke-core.js` → `smoke-core.ts`
- `noise.js` → `noise.ts`

### Rewrite required
- `smoke.js` → `smoke-system.ts` + `SmokeCanvas.tsx` (Canvas 2D → Skia)
- `hand.js` → `frame-processor.ts` (MediaPipe CDN → native SDK)
- `face.js` → integrated into `frame-processor.ts`
- `tracking-overlay.js` → `TrackingOverlay.tsx` (Canvas 2D → Skia Path)
- `app.js` → `SmokeScreen.tsx` (requestAnimationFrame → useFrameCallback)
- `modes.js` → embedded in `smoke-core.ts` or separate `modes.ts`

## Mobile Considerations

### Performance
- MediaPipe Hands detection: every frame (native thread, no JS bridge cost)
- Face detection: every 3rd frame (same as web)
- Particle cap: 2000 (vs 4320 on desktop)
- Skia renders on GPU — no JS bridge for drawing

### UX
- Portrait orientation locked
- Touch buttons instead of keyboard shortcuts
- Camera flip (front/back)
- No debug text overlay in production (dev-only toggle)

### Battery / Lifecycle
- Pause camera + detection on app background (AppState listener)
- Resume on foreground
- No background processing needed

### Platform-specific
- iOS: camera permission via Info.plist (`NSCameraUsageDescription`)
- Android: camera permission via AndroidManifest + runtime request
- Both: MediaPipe native SDK bundled in the app binary

## Testing Strategy

- `core/` modules (interaction-core, smoke-core, noise): Jest unit tests, same test cases as current `tests/` directory
- Components: React Native Testing Library for component rendering
- E2E: manual testing on physical devices (camera required)
- Frame processor: tested via integration on device

## Smoke Modes

Two visual modes carried over from web:
- **Realistic**: wispy white smoke, strand-based trails, edge-lit mist
- **Artistic**: neon colors, swirl patterns, more particles

Mode config objects remain the same structure as `js/modes.js`.
