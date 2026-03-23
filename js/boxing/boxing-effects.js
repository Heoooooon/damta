(function () {
  'use strict';

  var MAX_PARTICLES = 500;
  var particles = [];
  var rings = [];
  var shakeAmount = 0;
  var shakeDecay = 0.85;

  var NORMAL = {
    count: 10,
    sizeMin: 2, sizeMax: 4,
    lifetime: 300,
    lifetimeVar: 0.3,
    speed: 4,
    gravity: 0.15,
    drag: 0.97,
    shake: 3,
    colors: [
      'rgba(255,255,255,',
      'rgba(255,240,200,'
    ]
  };

  var STRONG = {
    count: 24,
    sizeMin: 3, sizeMax: 7,
    lifetime: 500,
    lifetimeVar: 0.3,
    speed: 8,
    gravity: 0.15,
    drag: 0.97,
    shake: 8,
    colors: [
      'rgba(255,120,20,',
      'rgba(255,80,30,',
      'rgba(255,180,60,'
    ]
  };

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle(x, y, cfg) {
    var angle = Math.random() * Math.PI * 2;
    var speed = cfg.speed * (0.5 + Math.random() * 0.5);
    var lifetimeVariance = 1 - cfg.lifetimeVar + Math.random() * cfg.lifetimeVar * 2;
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: randRange(cfg.sizeMin, cfg.sizeMax),
      lifetime: cfg.lifetime * lifetimeVariance,
      age: 0,
      gravity: cfg.gravity,
      drag: cfg.drag,
      color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
      active: true
    };
  }

  function createRing(x, y) {
    return {
      x: x,
      y: y,
      radius: 5,
      maxRadius: 60,
      expandRate: 3,
      alpha: 1,
      lineWidth: 3,
      active: true
    };
  }

  function emit(canvasX, canvasY, power) {
    var cfg = power === 'strong' ? STRONG : NORMAL;

    for (var i = 0; i < cfg.count; i++) {
      if (particles.length >= MAX_PARTICLES) {
        // Recycle oldest inactive or just skip
        var recycled = false;
        for (var j = 0; j < particles.length; j++) {
          if (!particles[j].active) {
            particles[j] = createParticle(canvasX, canvasY, cfg);
            recycled = true;
            break;
          }
        }
        if (!recycled) break;
      } else {
        particles.push(createParticle(canvasX, canvasY, cfg));
      }
    }

    if (power === 'strong') {
      rings.push(createRing(canvasX, canvasY));
    }

    shakeAmount = cfg.shake;
  }

  function update(ctx, dt) {
    // Apply screen shake
    var sx = 0;
    var sy = 0;
    if (shakeAmount > 0.5) {
      sx = (Math.random() - 0.5) * 2 * shakeAmount;
      sy = (Math.random() - 0.5) * 2 * shakeAmount;
      ctx.save();
      ctx.translate(sx, sy);
      shakeAmount *= shakeDecay;
    } else {
      shakeAmount = 0;
    }

    var dtRatio = dt / 16.667; // normalize to ~60fps step

    // Update and render particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.lifetime) {
        p.active = false;
        continue;
      }

      // Physics per step
      p.vy += p.gravity * dtRatio;
      p.vx *= Math.pow(p.drag, dtRatio);
      p.vy *= Math.pow(p.drag, dtRatio);
      p.x += p.vx * dtRatio;
      p.y += p.vy * dtRatio;

      // Render
      var lifeRatio = 1 - p.age / p.lifetime;
      var alpha = lifeRatio;
      ctx.fillStyle = p.color + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
    }

    // Update and render rings
    for (var r = rings.length - 1; r >= 0; r--) {
      var ring = rings[r];
      if (!ring.active) continue;

      ring.radius += ring.expandRate * dtRatio;
      ring.alpha -= 0.03 * dtRatio;
      ring.lineWidth -= 0.05 * dtRatio;

      if (ring.alpha <= 0 || ring.lineWidth <= 0 || ring.radius >= ring.maxRadius) {
        ring.active = false;
        continue;
      }

      ctx.strokeStyle = 'rgba(255,160,40,' + ring.alpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(ring.lineWidth, 0.1);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Restore shake transform
    if (sx !== 0 || sy !== 0) {
      ctx.restore();
    }

    // Cleanup dead particles periodically
    if (particles.length > MAX_PARTICLES * 0.8) {
      particles = particles.filter(function (p) { return p.active; });
    }
    rings = rings.filter(function (r) { return r.active; });
  }

  function getActiveCount() {
    var count = 0;
    for (var i = 0; i < particles.length; i++) {
      if (particles[i].active) count++;
    }
    return count;
  }

  function reset() {
    particles = [];
    rings = [];
    shakeAmount = 0;
  }

  var api = {
    emit: emit,
    update: update,
    getActiveCount: getActiveCount,
    reset: reset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.BoxingEffects = api;
  }
})();
