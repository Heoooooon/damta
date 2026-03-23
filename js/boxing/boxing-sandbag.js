(function () {
  'use strict';

  var angle = 0;
  var angularVelocity = 0;
  var flash = 0;

  var STIFFNESS = 0.08;
  var DAMPING = 0.95;
  var MAX_ANGLE = 0.35;
  var FLASH_DECAY = 0.92;

  var HITBOX = { x: 0.5, y: 0.45, halfW: 0.1, halfH: 0.25 };

  function applyHit(power, hitX) {
    var impulse = power === 'strong' ? 0.15 : 0.06;
    var direction = hitX < HITBOX.x ? 1 : -1;
    angularVelocity += impulse * direction;
    flash = 1;
  }

  function update() {
    var restoring = -STIFFNESS * angle;
    angularVelocity += restoring;
    angularVelocity *= DAMPING;
    angle += angularVelocity;

    if (angle > MAX_ANGLE) { angle = MAX_ANGLE; angularVelocity *= -0.3; }
    if (angle < -MAX_ANGLE) { angle = -MAX_ANGLE; angularVelocity *= -0.3; }

    if (flash > 0.01) {
      flash *= FLASH_DECAY;
    } else {
      flash = 0;
    }
  }

  function draw(ctx, canvasW, canvasH) {
    var cx = canvasW * HITBOX.x;
    var topY = canvasH * 0.05;
    var bagW = canvasW * HITBOX.halfW * 2;
    var bagH = canvasH * HITBOX.halfH * 2;
    var bagCY = canvasH * HITBOX.y;
    var bagTopY = bagCY - bagH / 2;
    var radius = bagW * 0.2;

    ctx.save();
    ctx.translate(cx, topY);
    ctx.rotate(angle);

    // Chain
    var chainLen = bagTopY - topY;
    ctx.strokeStyle = 'rgba(180,180,180,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, chainLen);
    ctx.stroke();

    // Bag body (rounded rectangle)
    var baseAlpha = 0.15 + flash * 0.45;
    var strokeAlpha = 0.7 + flash * 0.3;
    var bx = -bagW / 2;
    var by = chainLen;

    ctx.fillStyle = 'rgba(255,255,255,' + baseAlpha + ')';
    ctx.strokeStyle = 'rgba(255,255,255,' + strokeAlpha + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bagW - radius, by);
    ctx.arcTo(bx + bagW, by, bx + bagW, by + radius, radius);
    ctx.lineTo(bx + bagW, by + bagH - radius);
    ctx.arcTo(bx + bagW, by + bagH, bx + bagW - radius, by + bagH, radius);
    ctx.lineTo(bx + radius, by + bagH);
    ctx.arcTo(bx, by + bagH, bx, by + bagH - radius, radius);
    ctx.lineTo(bx, by + radius);
    ctx.arcTo(bx, by, bx + radius, by, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function getHitbox() {
    return { x: HITBOX.x, y: HITBOX.y, halfW: HITBOX.halfW, halfH: HITBOX.halfH };
  }

  function reset() {
    angle = 0;
    angularVelocity = 0;
    flash = 0;
  }

  var api = {
    applyHit: applyHit,
    update: update,
    draw: draw,
    getHitbox: getHitbox,
    reset: reset
  };

  if (typeof window !== 'undefined') {
    window.BoxingSandbag = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
