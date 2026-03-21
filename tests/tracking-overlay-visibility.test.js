const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');

test('tracking overlay has its own canvas layered above the webcam preview', () => {
  assert.match(indexHtml, /<canvas id="trackingCanvas"><\/canvas>/);
  assert.match(styles, /#trackingCanvas\s*\{/);
  assert.match(styles, /#trackingCanvas[\s\S]*z-index:\s*11;/);
  assert.match(styles, /#webcam[\s\S]*z-index:\s*10;/);
});
