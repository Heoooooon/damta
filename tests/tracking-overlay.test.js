const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getHandPolylines,
  getFacePolylines,
  getOverlayStyle,
} = require('../js/tracking-overlay.js');

function createHandLandmarks() {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.3 + (index % 4) * 0.05,
    y: 0.2 + Math.floor(index / 4) * 0.05,
  }));
}

function createFaceLandmarks() {
  return Array.from({ length: 468 }, (_, index) => ({
    x: 0.25 + (index % 24) * 0.01,
    y: 0.18 + Math.floor(index / 24) * 0.01,
  }));
}

test('hand overlay exposes palm and finger polylines', () => {
  const polylines = getHandPolylines(createHandLandmarks());

  assert.ok(polylines.length >= 6);
  assert.ok(polylines.every((line) => line.length >= 2));
  assert.deepEqual(polylines[0][0], { x: 0.3, y: 0.2 });
});

test('face overlay exposes subtle contour polylines from face mesh landmarks', () => {
  const polylines = getFacePolylines(createFaceLandmarks());

  assert.ok(polylines.length >= 5);
  assert.ok(polylines.every((line) => line.length >= 2));
  assert.ok(polylines.some((line) => line.length >= 8));
});

test('overlay style stays visible enough to read on a dark canvas', () => {
  const style = getOverlayStyle();

  assert.ok(style.face.strokeAlpha >= 0.22);
  assert.ok(style.hand.strokeAlpha >= 0.28);
  assert.ok(style.face.pointAlpha >= 0.16);
  assert.ok(style.hand.pointAlpha >= 0.22);
  assert.ok(style.hand.pointRadius >= 1.4);
});
