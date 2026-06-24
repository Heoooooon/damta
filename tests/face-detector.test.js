const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createLandmarks(mouth = { x: 0.52, y: 0.48 }) {
  const lm = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  lm[13] = mouth;
  lm[10] = { x: 0.5, y: 0.2 };
  lm[152] = { x: 0.5, y: 0.8 };
  return lm;
}

function loadFaceDetector() {
  const source = fs.readFileSync(path.join(__dirname, '../js/face.js'), 'utf8');
  const instances = [];
  class FakeFaceMesh {
    constructor() {
      this.options = null;
      this.callback = null;
      instances.push(this);
    }
    setOptions(options) { this.options = options; }
    onResults(callback) { this.callback = callback; }
    async send() {}
  }
  const context = { globalThis: {}, FaceMesh: FakeFaceMesh };
  vm.runInNewContext(`${source}\nglobalThis.__FaceDetector = FaceDetector;`, context);
  return { detector: context.globalThis.__FaceDetector, faceMesh: instances[0] };
}

test('FaceDetector holds the last mouth position through short face dropouts', async () => {
  const { detector, faceMesh } = loadFaceDetector();
  const landmarks = createLandmarks({ x: 0.52, y: 0.48 });

  faceMesh.callback({ multiFaceLandmarks: [landmarks] });
  await detector.send({});
  assert.equal(detector.getMouth().x, 0.52);
  assert.equal(detector.getMouth().y, 0.48);

  for (let i = 0; i < 7; i++) {
    faceMesh.callback({ multiFaceLandmarks: [] });
    await detector.send({});
    assert.equal(detector.getMouth().x, 0.52);
  assert.equal(detector.getMouth().y, 0.48);
    assert.equal(detector.getFaceHeight() > 0, true);
    assert.equal(detector.getDebugInfo().mouthHeld, true);
  }
});

test('FaceDetector clears mouth after sustained face loss', async () => {
  const { detector, faceMesh } = loadFaceDetector();

  faceMesh.callback({ multiFaceLandmarks: [createLandmarks()] });
  await detector.send({});
  assert.ok(detector.getMouth());

  for (let i = 0; i < 8; i++) {
    faceMesh.callback({ multiFaceLandmarks: [] });
    await detector.send({});
  }

  assert.equal(detector.getMouth(), null);
  assert.equal(detector.getFaceHeight(), 0);
  assert.equal(detector.getLandmarks(), null);
});
