const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

test('tracking overlay has its own canvas layered above the webcam preview', () => {
  assert.match(indexHtml, /<canvas id="trackingCanvas"><\/canvas>/);
  assert.match(styles, /#trackingCanvas\s*\{/);
  assert.match(styles, /#trackingCanvas[\s\S]*z-index:\s*11;/);
  assert.match(styles, /#webcam[\s\S]*z-index:\s*10;/);
});

test('webcam landmarks also render on a full-screen overlay separate from smoke', () => {
  assert.match(indexHtml, /<canvas id="mainTrackingCanvas"><\/canvas>/);
  assert.match(styles, /#mainTrackingCanvas\s*\{/);
  assert.match(styles, /#mainTrackingCanvas[\s\S]*position:\s*fixed;/);
  assert.match(styles, /#mainTrackingCanvas[\s\S]*pointer-events:\s*none;/);
  assert.match(appJs, /mainTrackingCanvas/);
  assert.match(appJs, /mainTrackingCtx/);
  assert.match(appJs, /TrackingOverlay\.draw\(trackingCtx,\s*trackingCanvas\.width,\s*trackingCanvas\.height/);
  assert.match(appJs, /TrackingOverlay\.draw\(mainTrackingCtx,\s*mainTrackingCanvas\.width,\s*mainTrackingCanvas\.height/);
  assert.doesNotMatch(appJs, /TrackingOverlay\.draw\(ctx,\s*canvas\.width,\s*canvas\.height/);
});
