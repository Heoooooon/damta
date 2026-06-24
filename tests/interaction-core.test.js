const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeHandPose,
  computeCigaretteTipPosition,
  createSmokeStateMachine,
} = require('../js/interaction-core.js');

function createLandmarks() {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));

  landmarks[0] = { x: 0.5, y: 0.9 };
  landmarks[5] = { x: 0.44, y: 0.76 };
  landmarks[6] = { x: 0.45, y: 0.54 };
  landmarks[8] = { x: 0.46, y: 0.33 };
  landmarks[9] = { x: 0.51, y: 0.75 };
  landmarks[10] = { x: 0.5, y: 0.53 };
  landmarks[12] = { x: 0.48, y: 0.32 };
  landmarks[14] = { x: 0.56, y: 0.68 };
  landmarks[16] = { x: 0.57, y: 0.74 };
  landmarks[18] = { x: 0.61, y: 0.72 };
  landmarks[20] = { x: 0.63, y: 0.79 };

  return landmarks;
}

test('analyzeHandPose ignores thumb position when the pinch shape is valid', () => {
  const landmarks = createLandmarks();
  landmarks[4] = { x: 0.2, y: 0.25 };

  const result = analyzeHandPose(landmarks);

  assert.equal(result.isPose, true);
  assert.ok(result.score >= 0.75);
});

test('analyzeHandPose rejects wide finger gaps that are not cigarette-like', () => {
  const landmarks = createLandmarks();
  landmarks[12] = { x: 0.62, y: 0.31 };

  const result = analyzeHandPose(landmarks);

  assert.equal(result.isPose, false);
  assert.ok(result.gapRatio > 0.24);
});

test('analyzeHandPose accepts a wider V-like smoking pose when index and middle stay parallel', () => {
  const landmarks = createLandmarks();
  landmarks[10] = { x: 0.54, y: 0.53 };
  landmarks[12] = { x: 0.55, y: 0.32 };

  const result = analyzeHandPose(landmarks);

  assert.equal(result.isPose, true);
  assert.ok(result.gapRatio > 0.5);
});

test('computeCigaretteTipPosition pushes the emission point beyond the fingertips like an ember', () => {
  const landmarks = createLandmarks();
  const tipMid = {
    x: (landmarks[8].x + landmarks[12].x) / 2,
    y: (landmarks[8].y + landmarks[12].y) / 2,
  };

  const ember = computeCigaretteTipPosition(landmarks);

  assert.ok(ember.y < tipMid.y);
  assert.ok(Math.hypot(ember.x - tipMid.x, ember.y - tipMid.y) > 0.02);
});

test('smoke state machine holds exhale long enough to feel like a breath', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  const fingertip = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.2 },
    mouth,
    faceHeight: 0.4,
  }, 0);
  assert.equal(fingertip.state, 'fingertip');
  assert.equal(fingertip.emission.type, 'fingertip');

  // Build proximity over multiple frames near mouth
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 16);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 32);
  const inhaling = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 48);
  assert.equal(inhaling.state, 'inhaling');
  // inhaling 중에도 소량 fingertip 파티클 생성 (흡인 효과용)
  assert.equal(inhaling.emission.type, 'fingertip');
  assert.ok(inhaling.emission.strength <= 0.5, 'inhaling emission should be weak');

  const exhaleBurst = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.76 },
    mouth,
    faceHeight: 0.4,
  }, 120);
  assert.equal(exhaleBurst.state, 'exhaling');
  assert.equal(exhaleBurst.emission.type, 'exhale-burst');
  assert.deepEqual(exhaleBurst.emitPos, mouth);

  const exhaleStream = machine.update({
    poseActive: false,
    cigTip: null,
    mouth,
    faceHeight: 0.4,
  }, 700);
  assert.equal(exhaleStream.state, 'exhaling');
  assert.equal(exhaleStream.emission.type, 'exhale-stream');
  assert.deepEqual(exhaleStream.emitPos, mouth);

  const settled = machine.update({
    poseActive: false,
    cigTip: null,
    mouth,
    faceHeight: 0.4,
  }, 1400);
  assert.equal(settled.state, 'idle');
  assert.equal(settled.emission.type, null);
});

test('smoke state machine is forgiving enough when the hand is close to the mouth but not perfectly aligned', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.58 },
    mouth,
    faceHeight: 0.4,
  }, 0);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.58 },
    mouth,
    faceHeight: 0.4,
  }, 16);

  const inhaling = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.58 },
    mouth,
    faceHeight: 0.4,
  }, 32);

  assert.equal(inhaling.state, 'inhaling');
});

test('smoke state machine keeps exhaling past the initial burst window', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  // Multiple frames near mouth to accumulate proximity
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 100);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.51 },
    mouth,
    faceHeight: 0.4,
  }, 116);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.52 },
    mouth,
    faceHeight: 0.4,
  }, 132);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.53 },
    mouth,
    faceHeight: 0.4,
  }, 148);

  // Move hand away to trigger exhale
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.76 },
    mouth,
    faceHeight: 0.4,
  }, 220);

  const sustained = machine.update({
    poseActive: false,
    cigTip: null,
    mouth,
    faceHeight: 0.4,
  }, 1130);

  assert.equal(sustained.state, 'exhaling');
  assert.equal(sustained.emission.type, 'exhale-stream');
});

test('smoke state machine does not exhale from tiny jitter while still near the mouth', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 0);
  machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.505 },
    mouth,
    faceHeight: 0.4,
  }, 40);
  const result = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.512 },
    mouth,
    faceHeight: 0.4,
  }, 90);

  assert.equal(result.state, 'inhaling');
  assert.equal(result.emission.type, 'fingertip');
});

test('smoke exhale direction is expressed in mirrored canvas coordinates', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 0);
  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 32);
  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 64);

  const exhale = machine.update({
    poseActive: true,
    cigTip: { x: 0.68, y: 0.43 },
    mouth,
    faceHeight: 0.4,
  }, 140);

  assert.equal(exhale.state, 'exhaling');
  assert.equal(exhale.emission.type, 'exhale-burst');
  assert.ok(exhale.emission.direction.x < 0, 'normalized x right of mouth should render as screen-left exhale');
});

test('smoke inhale direction is expressed in mirrored canvas coordinates', () => {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  machine.update({ poseActive: true, cigTip: { x: 0.48, y: 0.5 }, mouth, faceHeight: 0.4 }, 0);
  machine.update({ poseActive: true, cigTip: { x: 0.48, y: 0.5 }, mouth, faceHeight: 0.4 }, 32);
  const inhaling = machine.update({ poseActive: true, cigTip: { x: 0.48, y: 0.5 }, mouth, faceHeight: 0.4 }, 64);

  assert.equal(inhaling.state, 'inhaling');
  assert.equal(inhaling.emission.type, 'fingertip');
  assert.ok(inhaling.emission.direction.x < 0, 'smoke at screen-right should be pulled screen-left toward the mouth');
});

function exhaleAfterHeldInhale(frameInterval) {
  const machine = createSmokeStateMachine();
  const mouth = { x: 0.5, y: 0.48 };

  for (let now = 0; now <= 640; now += frameInterval) {
    machine.update({
      poseActive: true,
      cigTip: { x: 0.5, y: 0.5 },
      mouth,
      faceHeight: 0.4,
    }, now);
  }

  return machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.73 },
    mouth,
    faceHeight: 0.4,
  }, 760);
}

test('smoke inhale strength is based on held time instead of render frame count', () => {
  const fastFrames = exhaleAfterHeldInhale(16);
  const sparseFrames = exhaleAfterHeldInhale(120);

  assert.equal(fastFrames.state, 'exhaling');
  assert.equal(sparseFrames.state, 'exhaling');
  assert.equal(fastFrames.emission.type, 'exhale-burst');
  assert.equal(sparseFrames.emission.type, 'exhale-burst');
  assert.ok(sparseFrames.emission.strength >= 0.65, `expected charged exhale strength, got ${sparseFrames.emission.strength}`);
  assert.ok(
    Math.abs(fastFrames.emission.strength - sparseFrames.emission.strength) <= 0.2,
    `expected similar strength across frame rates, got ${fastFrames.emission.strength} vs ${sparseFrames.emission.strength}`
  );
});

test('smoke state machine observes cooldown before starting another inhale', () => {
  const machine = createSmokeStateMachine({
    exhaleHoldDuration: 260,
    exhaleBurstDuration: 90,
    cooldownDuration: 220,
  });
  const mouth = { x: 0.5, y: 0.48 };

  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 0);
  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 80);
  machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.5 }, mouth, faceHeight: 0.4 }, 160);
  const exhale = machine.update({ poseActive: true, cigTip: { x: 0.5, y: 0.73 }, mouth, faceHeight: 0.4 }, 260);

  assert.equal(exhale.state, 'exhaling');

  const cooldownStart = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 540);
  const stillCooling = machine.update({
    poseActive: true,
    cigTip: { x: 0.5, y: 0.5 },
    mouth,
    faceHeight: 0.4,
  }, 620);

  assert.equal(cooldownStart.state, 'fingertip');
  assert.equal(stillCooling.state, 'fingertip');
  assert.notEqual(stillCooling.state, 'inhaling');
});
