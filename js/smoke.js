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
      originX: 0, originY: 0,
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
