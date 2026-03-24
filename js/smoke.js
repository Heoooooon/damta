const SmokeSystem = (function () {
  const MAX_PARTICLES = 4320;
  const pool = [];
  const active = [];
  const emitBudgets = Object.create(null);
  let dormantTime = 0;

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
    grad.addColorStop(0, color + '0.55)');
    grad.addColorStop(0.22, color + '0.22)');
    grad.addColorStop(0.62, color + '0.06)');
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
      growTo: 0,
      color: '', sprite: null, mode: null,
      originX: 0, originY: 0,
      riseAccel: 0,
      turbulence: 0,
      drag: 0.99,
      lateralDamping: 0.96,
      trailWidth: 0,
      trailAlpha: 0,
      strandiness: 0,
      unravel: 0,
      curlStrength: 0,
      spreadAccel: 0,
      fadeInEnd: 0.14,
      fadeOutStart: 0.58,
      fadeOutPower: 1,
      spriteAlphaMultiplier: 0.3,
      spriteFadeStart: 0.14,
      spriteFadePower: 1,
      veilAlphaMultiplier: 0.4,
      veilScale: 1.5,
      haloAlphaMultiplier: 0.12,
      haloScale: 2,
      trailSoftness: 2,
      lightAlphaMultiplier: 0.18,
      lightScale: 1.8,
      lightOffsetX: -0.08,
      lightOffsetY: -0.16,
      history: [],
      wobbleOffset: 0,
      lightSprite: null,
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
    p.history.length = 0;
    pool.push(p);
  }

  function colorWithAlpha(colorPrefix, alpha) {
    return colorPrefix + Math.max(0, Math.min(1, alpha)) + ')';
  }

  function getEmissionBudgetKey(mode, emission) {
    return (mode && mode.name ? mode.name : 'mode') + ':' + emission.type;
  }

  function getEmissionCount(mode, profile, emission, dt) {
    const frameDt = Math.max(1, dt == null ? 16.6667 : dt);
    const emitRate = Math.max(
      0.01,
      profile && profile.emitRate != null
        ? profile.emitRate
        : mode && mode.emitRate != null
          ? mode.emitRate
          : 60
    );
    const key = getEmissionBudgetKey(mode, emission);
    const nextBudget = Math.min(
      profile.count * Math.max(1, emitRate * 0.4),
      (emitBudgets[key] || 0) +
        profile.count * emitRate * (frameDt / 1000) * (emission.strength || 1)
    );
    const count = Math.floor(nextBudget);

    emitBudgets[key] = nextBudget - count;
    return count;
  }

  function strokePath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  }

  function drawTrail(ctx, p, currentSize, lifeRatio) {
    if (!p.trailAlpha || p.history.length < 2) return;

    const points = p.history.concat({ x: p.x, y: p.y });
    const lineWidth = Math.max(
      0.6,
      p.trailWidth * (0.84 + lifeRatio * p.unravel * 1.7)
    );
    const alpha = Math.max(0, Math.min(1, p.alpha * p.trailAlpha));
    if (alpha < 0.015) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Soft glow pass — cheap alternative to shadowBlur
    const softWidth = lineWidth * p.trailSoftness;
    if (softWidth > lineWidth + 0.5) {
      ctx.strokeStyle = colorWithAlpha(p.color, alpha * 0.22);
      ctx.lineWidth = softWidth;
      strokePath(ctx, points);
    }

    // Main trail stroke
    ctx.strokeStyle = colorWithAlpha(p.color, alpha);
    ctx.lineWidth = lineWidth;
    strokePath(ctx, points);

    const tail = points[points.length - 1];

    if (p.strandiness > 0.8 && lifeRatio > 0.22) {
      const branchAlpha = alpha * 0.36 * Math.min(1, lifeRatio * p.unravel * 1.3);
      const branchOffset = Math.sin(p.wobbleOffset + p.life * 0.003) * currentSize * 0.22;
      if (branchAlpha > 0.012 && Math.abs(branchOffset) > 0.2) {
        ctx.strokeStyle = colorWithAlpha(p.color, branchAlpha);
        ctx.lineWidth = Math.max(0.4, lineWidth * 0.58);
        ctx.beginPath();
        ctx.moveTo(points[0].x + branchOffset * 0.1, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const offset = branchOffset * (i / points.length);
          const xc = (points[i].x + points[i + 1].x) / 2 + offset;
          const yc = (points[i].y + points[i + 1].y) / 2 - offset * 0.08;
          ctx.quadraticCurveTo(points[i].x + offset, points[i].y, xc, yc);
        }
        ctx.lineTo(tail.x + branchOffset, tail.y - branchOffset * 0.08);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // --- Emit ---
  function emit(normX, normY, canvasW, canvasH, mode, emission, dt) {
    if (!emission || !emission.type) return;

    const profile = SmokeCore.getEmissionProfile(mode, emission.type, emission.progress);
    if (!profile) return;

    const colors = mode.colors || [];
    const maxParticles = Math.min(MAX_PARTICLES, mode.maxParticles || MAX_PARTICLES);
    const cx = canvasW * (1 - normX);
    const cy = canvasH * normY;
    const count = getEmissionCount(mode, profile, emission, dt);
    if (!count) return;

    for (let i = 0; i < count; i++) {
      if (active.length >= maxParticles) break;

      const p = acquire();
      if (!p) break;

      p.x = cx + (Math.random() - 0.5) * profile.spreadX;
      p.y = cy + (Math.random() - 0.5) * profile.spreadY;

      var dir = emission && emission.direction;
      if (dir) {
        // 방향성 속도: direction 기반 + cone spread
        var bias = 0.7;
        if (emission.type === 'exhale-stream') {
          bias = 0.7 - (emission.progress || 0) * 0.4;
        }
        var speed = Math.abs(profile.velocityY.min) * 1.2;
        var coneAngle = (Math.random() - 0.5) * 0.7;
        var cosA = Math.cos(coneAngle);
        var sinA = Math.sin(coneAngle);
        var rotX = dir.x * cosA - dir.y * sinA;
        var rotY = dir.x * sinA + dir.y * cosA;
        p.vx = rotX * speed * bias + (Math.random() - 0.5) * profile.velocityX * (1 - bias);
        p.vy = rotY * speed * bias + (profile.velocityY.min + Math.random() * (profile.velocityY.max - profile.velocityY.min)) * (1 - bias);
      } else {
        p.vx = (Math.random() - 0.5) * profile.velocityX;
        p.vy = profile.velocityY.min + Math.random() * (profile.velocityY.max - profile.velocityY.min);
      }
      p.originX = p.x;
      p.originY = p.y;

      p.size = mode.startSize * profile.sizeMultiplier * (0.72 + Math.random() * 0.35);
      p.growTo = mode.maxSize * profile.sizeMultiplier * (0.7 + Math.random() * 0.4);
      p.alpha = mode.startAlpha;
      p.maxAlpha = mode.maxAlpha * profile.alphaMultiplier * (0.82 + Math.random() * 0.28);
      p.life = 0;
      p.maxLife =
        (mode.lifetime.min + Math.random() * (mode.lifetime.max - mode.lifetime.min)) *
        profile.lifeMultiplier;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.sprite = createSprite(p.color, Math.ceil(Math.max(mode.maxSize, p.growTo)));
      p.mode = mode;
      p.riseAccel = profile.riseAccel * (0.8 + Math.random() * 0.45);
      p.turbulence = profile.turbulence * (0.7 + Math.random() * 0.65);
      p.drag = profile.drag;
      p.lateralDamping = profile.lateralDamping;
      p.trailWidth = profile.trailWidth;
      p.trailAlpha = profile.trailAlpha;
      p.strandiness = profile.strandiness;
      p.unravel = profile.unravel;
      p.curlStrength = profile.curlStrength;
      p.spreadAccel = profile.spreadAccel;
      p.fadeInEnd = profile.fadeInEnd;
      p.fadeOutStart = profile.fadeOutStart;
      p.fadeOutPower = profile.fadeOutPower;
      p.spriteAlphaMultiplier = profile.spriteAlphaMultiplier;
      p.spriteFadeStart = profile.spriteFadeStart;
      p.spriteFadePower = profile.spriteFadePower;
      p.veilAlphaMultiplier = profile.veilAlphaMultiplier;
      p.veilScale = profile.veilScale;
      p.haloAlphaMultiplier = profile.haloAlphaMultiplier;
      p.haloScale = profile.haloScale;
      p.trailSoftness = profile.trailSoftness;
      p.lightAlphaMultiplier = profile.lightAlphaMultiplier;
      p.lightScale = profile.lightScale;
      p.lightOffsetX = profile.lightOffsetX;
      p.lightOffsetY = profile.lightOffsetY;
      p.history.length = 0;
      p.wobbleOffset = Math.random() * 1000;
      p.lightSprite = createSprite(mode.lightColor || 'rgba(255,244,228,', Math.ceil(Math.max(mode.maxSize, p.growTo)));

      active.push(p);
    }
  }

  // --- Update + Render ---
  function update(ctx, dt, noiseFunc, options) {
    const dormant = !!(options && options.dormant);
    dormantTime = dormant ? dormantTime + dt : 0;
    const cleanupBoost = dormant
      ? Math.min(18, 1 + dormantTime / 120)
      : 1;
    const step = Math.max(0.7, Math.min(2.5, dt / 16.6667));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.life += dt * cleanupBoost;

      if (p.life >= p.maxLife) {
        active.splice(i, 1);
        release(p);
        continue;
      }

      const lifeRatio = p.life / p.maxLife;
      const unravelFactor = Math.pow(lifeRatio, 1.25) * p.unravel;
      const sizeEase = 1 - Math.pow(1 - lifeRatio, 2);
      const currentSize = p.size + (p.growTo - p.size) * sizeEase;
      const riseDistance = Math.max(0, p.originY - p.y);

      p.alpha = SmokeCore.getParticleAlpha(p, p.maxAlpha, lifeRatio);
      p.alpha *= SmokeCore.getAltitudeFade(p, riseDistance);

      if (
        dormantTime > 220 &&
        (p.alpha < 0.012 || lifeRatio > 0.9)
      ) {
        active.splice(i, 1);
        release(p);
        continue;
      }

      if (noiseFunc) {
        const drift = noiseFunc(
          p.x * 0.0022 + p.wobbleOffset,
          p.y * 0.0018 + p.life * 0.00045
        );
        const shear = noiseFunc(
          p.y * 0.0016 - p.life * 0.00035,
          p.x * 0.0016 + p.wobbleOffset
        );
        const turbulence = p.turbulence * (0.22 + unravelFactor * 1.1);
        p.vx += drift * turbulence * 0.08 * step;
        p.vx += shear * (0.03 + unravelFactor * 0.12) * p.turbulence * step;
        const wobblePhase = p.life * 0.003 + p.wobbleOffset;
        p.vx += Math.sin(wobblePhase) * p.curlStrength * (0.06 + unravelFactor * 0.22) * step;
        p.vx += SmokeCore.getLateralSpreadForce(p, {
          drift,
          shear,
          wobblePhase,
          centerOffset: p.originX - p.x,
          lifeRatio,
          step,
        });
        p.vy -= (Math.abs(drift) + Math.abs(shear)) * p.turbulence * 0.012 * step;
      }

      if (p.mode.swirlStrength > 0) {
        const angle = p.life * p.mode.swirlFrequency;
        p.vx += Math.cos(angle + p.wobbleOffset) * p.mode.swirlStrength * 0.012 * step;
        p.vy += Math.sin(angle + p.wobbleOffset) * p.mode.swirlStrength * 0.004 * step;
        const pulse = 1 + Math.sin(p.life * 0.005) * 0.15;
        p.alpha *= pulse;
      }

      const prevX = p.x;
      const prevY = p.y;
      p.vy -= p.riseAccel * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vx *= Math.pow(p.lateralDamping, step);
      p.vy *= Math.pow(p.drag, step);

      p.history.push({ x: prevX, y: prevY });
      const maxHistory = Math.max(3, Math.min(8, Math.round(3 + p.strandiness * 4)));
      if (p.history.length > maxHistory) {
        p.history.shift();
      }

      drawTrail(ctx, p, currentSize, lifeRatio);

      const renderState = SmokeCore.getParticleRenderState(p, p.alpha, lifeRatio);

      if (renderState.veilAlpha > 0.012) {
        const veilSize = currentSize * renderState.veilScale;
        ctx.globalAlpha = Math.max(0, Math.min(1, renderState.veilAlpha));
        ctx.drawImage(
          p.sprite,
          p.x - veilSize,
          p.y - veilSize,
          veilSize * 2,
          veilSize * 2
        );
      }

      if (renderState.lightAlpha > 0.012 && p.lightSprite) {
        const lightSize = currentSize * renderState.lightScale;
        ctx.globalAlpha = Math.max(0, Math.min(1, renderState.lightAlpha));
        ctx.drawImage(
          p.lightSprite,
          p.x + currentSize * renderState.lightOffsetX - lightSize,
          p.y + currentSize * renderState.lightOffsetY - lightSize,
          lightSize * 2,
          lightSize * 2
        );
      }

      if (renderState.spriteAlpha > 0.01) {
        const spriteSize = currentSize * renderState.spriteScale;
        ctx.globalAlpha = Math.max(0, Math.min(1, renderState.spriteAlpha));
        ctx.drawImage(
          p.sprite,
          p.x - spriteSize,
          p.y - spriteSize,
          spriteSize * 2,
          spriteSize * 2
        );
      }

      if (renderState.haloAlpha > 0.01) {
        const haloSize = currentSize * renderState.haloScale;
        ctx.globalAlpha = Math.max(0, Math.min(1, renderState.haloAlpha));
        ctx.drawImage(
          p.sprite,
          p.x - haloSize,
          p.y - haloSize,
          haloSize * 2,
          haloSize * 2
        );
      }
    }

    ctx.restore();
  }

  function getActiveCount() {
    return active.length;
  }

  function drawEmber(ctx, normX, normY, canvasW, canvasH, mode, state, timeMs) {
    const ember = SmokeCore.getEmberProfile(mode, state, (timeMs * 0.002) % 1);
    if (!ember.visible) return;

    const x = canvasW * (1 - normX);
    const y = canvasH * normY;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const halo = ctx.createRadialGradient(x, y, 0, x, y, ember.haloRadius);
    halo.addColorStop(0, `rgba(255, 220, 120, ${ember.haloAlpha})`);
    halo.addColorStop(0.45, `rgba(255, 120, 20, ${ember.haloAlpha * 0.7})`);
    halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, ember.haloRadius, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(x, y, 0, x, y, ember.coreRadius);
    core.addColorStop(0, `rgba(255, 252, 240, ${ember.coreAlpha})`);
    core.addColorStop(0.4, `rgba(255, 215, 110, ${ember.coreAlpha * 0.95})`);
    core.addColorStop(1, `rgba(255, 90, 10, ${ember.coreAlpha * 0.18})`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, ember.coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = ember.sparkAlpha;
    ctx.fillStyle = 'rgba(255, 245, 215, 1)';
    ctx.beginPath();
    ctx.arc(x + ember.sparkRadius * 0.3, y - ember.sparkRadius * 0.4, ember.sparkRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  return { emit, update, drawEmber, getActiveCount };
})();
