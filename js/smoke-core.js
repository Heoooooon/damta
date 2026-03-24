(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SmokeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_EMISSIONS = {
    fingertip: {
      count: 4,
      spreadX: 10,
      spreadY: 6,
      velocityX: 0.45,
      velocityY: { min: -1.2, max: -0.4 },
      lifeMultiplier: 0.85,
      sizeMultiplier: 0.7,
      alphaMultiplier: 0.75,
      turbulence: 0.45,
      riseAccel: 0.0015,
      drag: 0.985,
      lateralDamping: 0.955,
      trailWidth: 2.4,
      trailAlpha: 0.36,
      strandiness: 0.88,
      unravel: 0.72,
      curlStrength: 0.18,
      spreadAccel: 0.12,
      fadeInEnd: 0.14,
      fadeOutStart: 0.5,
      fadeOutPower: 1.2,
      spriteAlphaMultiplier: 0.22,
      spriteFadeStart: 0.1,
      spriteFadePower: 1.9,
      veilAlphaMultiplier: 0.58,
      veilScale: 1.9,
      haloAlphaMultiplier: 0.14,
      haloScale: 2.6,
      trailSoftness: 3.2,
      lightAlphaMultiplier: 0.26,
      lightScale: 2.2,
      lightOffsetX: -0.18,
      lightOffsetY: -0.26,
      dissolveStartDistance: 88,
      dissolveEndDistance: 252,
      dissolvePower: 1.65,
    },
    exhaleBurst: {
      count: 28,
      spreadX: 34,
      spreadY: 14,
      velocityX: 2.6,
      velocityY: { min: -3.4, max: -1.3 },
      lifeMultiplier: 1.15,
      sizeMultiplier: 1.4,
      alphaMultiplier: 1.25,
      turbulence: 1.05,
      riseAccel: 0.0028,
      drag: 0.992,
      lateralDamping: 0.972,
      trailWidth: 3.6,
      trailAlpha: 0.16,
      strandiness: 0.28,
      unravel: 0.42,
      curlStrength: 0.12,
      spreadAccel: 0.08,
      fadeInEnd: 0.14,
      fadeOutStart: 0.56,
      fadeOutPower: 1.08,
      spriteAlphaMultiplier: 0.34,
      spriteFadeStart: 0.18,
      spriteFadePower: 1.35,
      veilAlphaMultiplier: 0.42,
      veilScale: 1.55,
      haloAlphaMultiplier: 0.12,
      haloScale: 2.1,
      trailSoftness: 1.8,
      lightAlphaMultiplier: 0.17,
      lightScale: 1.7,
      lightOffsetX: -0.08,
      lightOffsetY: -0.16,
      dissolveStartDistance: 128,
      dissolveEndDistance: 360,
      dissolvePower: 1.16,
    },
    exhaleStream: {
      count: 13,
      spreadX: 28,
      spreadY: 12,
      velocityX: 1.15,
      velocityY: { min: -2.3, max: -0.85 },
      lifeMultiplier: 1,
      sizeMultiplier: 1,
      alphaMultiplier: 0.94,
      turbulence: 0.75,
      riseAccel: 0.0022,
      drag: 0.989,
      lateralDamping: 0.965,
      trailWidth: 2.9,
      trailAlpha: 0.2,
      strandiness: 0.42,
      unravel: 0.5,
      curlStrength: 0.16,
      spreadAccel: 0.1,
      fadeInEnd: 0.14,
      fadeOutStart: 0.48,
      fadeOutPower: 1.35,
      spriteAlphaMultiplier: 0.28,
      spriteFadeStart: 0.16,
      spriteFadePower: 1.45,
      veilAlphaMultiplier: 0.46,
      veilScale: 1.7,
      haloAlphaMultiplier: 0.13,
      haloScale: 2.25,
      trailSoftness: 2.2,
      lightAlphaMultiplier: 0.2,
      lightScale: 1.9,
      lightOffsetX: -0.1,
      lightOffsetY: -0.18,
      dissolveStartDistance: 112,
      dissolveEndDistance: 308,
      dissolvePower: 1.22,
    },
  };

  const DEFAULT_EMBER = {
    coreRadius: 4.6,
    haloRadius: 16,
    sparkRadius: 1.3,
    coreAlpha: 0.94,
    haloAlpha: 0.28,
    sparkAlpha: 0.82,
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mergeVelocity(baseVelocity, customVelocity) {
    return {
      min: customVelocity && customVelocity.min != null ? customVelocity.min : baseVelocity.min,
      max: customVelocity && customVelocity.max != null ? customVelocity.max : baseVelocity.max,
    };
  }

  function getBaseProfile(mode, key) {
    const modeEmissions = mode && mode.emissions ? mode.emissions : {};
    const custom = modeEmissions[key] || {};
    const defaults = DEFAULT_EMISSIONS[key];

    return {
      count: custom.count != null ? custom.count : defaults.count,
      spreadX: custom.spreadX != null ? custom.spreadX : defaults.spreadX,
      spreadY: custom.spreadY != null ? custom.spreadY : defaults.spreadY,
      velocityX: custom.velocityX != null ? custom.velocityX : defaults.velocityX,
      velocityY: mergeVelocity(defaults.velocityY, custom.velocityY),
      lifeMultiplier: custom.lifeMultiplier != null ? custom.lifeMultiplier : defaults.lifeMultiplier,
      sizeMultiplier: custom.sizeMultiplier != null ? custom.sizeMultiplier : defaults.sizeMultiplier,
      alphaMultiplier: custom.alphaMultiplier != null ? custom.alphaMultiplier : defaults.alphaMultiplier,
      turbulence: custom.turbulence != null ? custom.turbulence : defaults.turbulence,
      riseAccel: custom.riseAccel != null ? custom.riseAccel : defaults.riseAccel,
      drag: custom.drag != null ? custom.drag : defaults.drag,
      lateralDamping: custom.lateralDamping != null ? custom.lateralDamping : defaults.lateralDamping,
      trailWidth: custom.trailWidth != null ? custom.trailWidth : defaults.trailWidth,
      trailAlpha: custom.trailAlpha != null ? custom.trailAlpha : defaults.trailAlpha,
      strandiness: custom.strandiness != null ? custom.strandiness : defaults.strandiness,
      unravel: custom.unravel != null ? custom.unravel : defaults.unravel,
      curlStrength: custom.curlStrength != null ? custom.curlStrength : defaults.curlStrength,
      spreadAccel: custom.spreadAccel != null ? custom.spreadAccel : defaults.spreadAccel,
      fadeInEnd: custom.fadeInEnd != null ? custom.fadeInEnd : defaults.fadeInEnd,
      fadeOutStart: custom.fadeOutStart != null ? custom.fadeOutStart : defaults.fadeOutStart,
      fadeOutPower: custom.fadeOutPower != null ? custom.fadeOutPower : defaults.fadeOutPower,
      spriteAlphaMultiplier: custom.spriteAlphaMultiplier != null ? custom.spriteAlphaMultiplier : defaults.spriteAlphaMultiplier,
      spriteFadeStart: custom.spriteFadeStart != null ? custom.spriteFadeStart : defaults.spriteFadeStart,
      spriteFadePower: custom.spriteFadePower != null ? custom.spriteFadePower : defaults.spriteFadePower,
      veilAlphaMultiplier: custom.veilAlphaMultiplier != null ? custom.veilAlphaMultiplier : defaults.veilAlphaMultiplier,
      veilScale: custom.veilScale != null ? custom.veilScale : defaults.veilScale,
      haloAlphaMultiplier: custom.haloAlphaMultiplier != null ? custom.haloAlphaMultiplier : defaults.haloAlphaMultiplier,
      haloScale: custom.haloScale != null ? custom.haloScale : defaults.haloScale,
      trailSoftness: custom.trailSoftness != null ? custom.trailSoftness : defaults.trailSoftness,
      lightAlphaMultiplier: custom.lightAlphaMultiplier != null ? custom.lightAlphaMultiplier : defaults.lightAlphaMultiplier,
      lightScale: custom.lightScale != null ? custom.lightScale : defaults.lightScale,
      lightOffsetX: custom.lightOffsetX != null ? custom.lightOffsetX : defaults.lightOffsetX,
      lightOffsetY: custom.lightOffsetY != null ? custom.lightOffsetY : defaults.lightOffsetY,
      dissolveStartDistance: custom.dissolveStartDistance != null ? custom.dissolveStartDistance : defaults.dissolveStartDistance,
      dissolveEndDistance: custom.dissolveEndDistance != null ? custom.dissolveEndDistance : defaults.dissolveEndDistance,
      dissolvePower: custom.dissolvePower != null ? custom.dissolvePower : defaults.dissolvePower,
    };
  }

  function getParticleAlpha(profile, maxAlpha, lifeRatio) {
    const t = clamp01(lifeRatio);
    const fadeInEnd = clamp01(profile && profile.fadeInEnd != null ? profile.fadeInEnd : 0.14);
    const fadeOutStart = clamp01(profile && profile.fadeOutStart != null ? profile.fadeOutStart : 0.58);
    const fadeOutPower = Math.max(0.2, profile && profile.fadeOutPower != null ? profile.fadeOutPower : 1);

    if (fadeInEnd > 0 && t < fadeInEnd) {
      return maxAlpha * (t / fadeInEnd);
    }

    if (fadeOutStart >= 1 || t < fadeOutStart) {
      return maxAlpha;
    }

    const fadeWindow = Math.max(0.001, 1 - fadeOutStart);
    const fadeT = clamp01((t - fadeOutStart) / fadeWindow);
    return maxAlpha * Math.pow(1 - fadeT, fadeOutPower);
  }

  function getLateralSpreadForce(profile, options) {
    const drift = options && options.drift != null ? options.drift : 0;
    const shear = options && options.shear != null ? options.shear : 0;
    const wobblePhase = options && options.wobblePhase != null ? options.wobblePhase : 0;
    const centerOffset = options && options.centerOffset != null ? options.centerOffset : 0;
    const step = options && options.step != null ? options.step : 1;
    const lifeRatio = clamp01(options && options.lifeRatio != null ? options.lifeRatio : 0);
    const spreadAccel = profile && profile.spreadAccel != null ? profile.spreadAccel : 0;
    const unravel = profile && profile.unravel != null ? profile.unravel : 0;
    const unravelFactor = Math.pow(lifeRatio, 1.25) * unravel;

    const wanderSignal =
      Math.sin(wobblePhase) * 0.55 +
      Math.sin(wobblePhase * 0.43 + drift * 1.7) * 0.22 +
      drift * 0.44 +
      shear * 0.28;
    const wanderForce =
      clamp(wanderSignal, -1.35, 1.35) *
      spreadAccel *
      (0.016 + unravelFactor * 0.24) *
      step;

    const centerPullStrength =
      (0.0012 + (1 - lifeRatio) * 0.0016) *
      Math.max(0, 1 - unravelFactor * 1.08);
    const centerForce = centerOffset * centerPullStrength * step;

    return wanderForce + centerForce;
  }

  function getParticleRenderState(profile, particleAlpha, lifeRatio) {
    const t = clamp01(lifeRatio);
    const alpha = Math.max(0, particleAlpha || 0);
    const spriteFadeStart = clamp01(
      profile && profile.spriteFadeStart != null ? profile.spriteFadeStart : 0.14
    );
    const spriteFadePower = Math.max(
      0.2,
      profile && profile.spriteFadePower != null ? profile.spriteFadePower : 1
    );
    const spriteAlphaMultiplier =
      profile && profile.spriteAlphaMultiplier != null ? profile.spriteAlphaMultiplier : 0.3;
    const veilAlphaMultiplier =
      profile && profile.veilAlphaMultiplier != null ? profile.veilAlphaMultiplier : 0.4;
    const veilScaleBase = profile && profile.veilScale != null ? profile.veilScale : 1.5;
    const haloAlphaMultiplier =
      profile && profile.haloAlphaMultiplier != null ? profile.haloAlphaMultiplier : 0.12;
    const haloScaleBase = profile && profile.haloScale != null ? profile.haloScale : 2;
    const unravel = profile && profile.unravel != null ? profile.unravel : 0;
    const lightAlphaMultiplier =
      profile && profile.lightAlphaMultiplier != null ? profile.lightAlphaMultiplier : 0.18;
    const lightScaleBase = profile && profile.lightScale != null ? profile.lightScale : 1.8;
    const lightOffsetX = profile && profile.lightOffsetX != null ? profile.lightOffsetX : -0.08;
    const lightOffsetY = profile && profile.lightOffsetY != null ? profile.lightOffsetY : -0.16;

    const spriteFadeT = t <= spriteFadeStart
      ? 0
      : clamp01((t - spriteFadeStart) / Math.max(0.001, 1 - spriteFadeStart));
    const spriteAlpha =
      alpha *
      spriteAlphaMultiplier *
      Math.pow(1 - spriteFadeT, spriteFadePower);
    const veilDensityFade =
      1 - Math.pow(clamp01((t - 0.38) / 0.62), 0.9) * 0.82;
    const veilAlpha =
      alpha *
      veilAlphaMultiplier *
      (0.88 + t * 0.14) *
      veilDensityFade;
    const haloAlpha =
      alpha *
      haloAlphaMultiplier *
      (0.68 + t * 0.3) *
      (1 - Math.pow(clamp01((t - 0.44) / 0.56), 0.92) * 0.58);
    const lightDensityFade =
      1 - Math.pow(clamp01((t - 0.34) / 0.66), 0.95) * 0.88;
    const lightAlpha =
      alpha *
      lightAlphaMultiplier *
      (0.9 + t * 0.06) *
      lightDensityFade;

    return {
      spriteAlpha,
      spriteScale: 0.86 + (1 - t) * 0.08,
      veilAlpha,
      veilScale: 1 + veilScaleBase * (0.88 + t * unravel * 0.86),
      haloAlpha,
      haloScale: 1 + haloScaleBase * (0.82 + t * 0.5),
      lightAlpha,
      lightScale: 1 + lightScaleBase * (0.86 + t * 0.48),
      lightOffsetX,
      lightOffsetY,
    };
  }

  function getAltitudeFade(profile, riseDistance) {
    const distance = Math.max(0, riseDistance || 0);
    const dissolveStart =
      profile && profile.dissolveStartDistance != null ? profile.dissolveStartDistance : 80;
    const dissolveEnd =
      profile && profile.dissolveEndDistance != null ? profile.dissolveEndDistance : 220;
    const dissolvePower = Math.max(
      0.2,
      profile && profile.dissolvePower != null ? profile.dissolvePower : 1
    );

    if (distance <= dissolveStart) {
      return 1;
    }

    const dissolveWindow = Math.max(1, dissolveEnd - dissolveStart);
    const dissolveT = clamp01((distance - dissolveStart) / dissolveWindow);
    return Math.pow(1 - dissolveT, dissolvePower);
  }

  function getEmberProfile(mode, state, pulsePhase) {
    if (!state || state === 'idle') {
      return { visible: false };
    }

    const ember = Object.assign({}, DEFAULT_EMBER, mode && mode.ember);
    const phase = clamp01(pulsePhase || 0);
    const flicker =
      0.94 +
      Math.sin(phase * Math.PI * 2) * 0.09 +
      Math.sin((phase + 0.17) * Math.PI * 4) * 0.04;

    const stateIntensity = state === 'inhaling'
      ? 1.22
      : state === 'exhaling'
        ? 1.05
        : 0.96;
    const intensity = Math.max(0.75, flicker * stateIntensity);

    return {
      visible: true,
      coreRadius: ember.coreRadius * (0.9 + intensity * 0.18),
      haloRadius: ember.haloRadius * (0.88 + intensity * 0.24),
      sparkRadius: ember.sparkRadius * (0.9 + intensity * 0.2),
      coreAlpha: clamp01(ember.coreAlpha * intensity),
      haloAlpha: clamp01(ember.haloAlpha * intensity),
      sparkAlpha: clamp01(ember.sparkAlpha * (0.9 + intensity * 0.14)),
    };
  }

  function getEmissionProfile(mode, type, progress) {
    if (!type) {
      return null;
    }

    const t = clamp01(progress || 0);

    if (type === 'fingertip') {
      return getBaseProfile(mode, 'fingertip');
    }

    if (type === 'exhale-burst') {
      return getBaseProfile(mode, 'exhaleBurst');
    }

    if (type === 'exhale-stream') {
      const burst = getBaseProfile(mode, 'exhaleBurst');
      const stream = getBaseProfile(mode, 'exhaleStream');
      const fingertip = getBaseProfile(mode, 'fingertip');

      // progress 0~0.3: burst → stream 전환
      // progress 0.3~1.0: stream → fingertip 전환
      const burstBlend = t < 0.3 ? 1 - (t / 0.3) : 0;
      const decayT = t < 0.3 ? 0 : (t - 0.3) / 0.7;

      // burst→stream 보간된 기본값
      const baseCount = lerp(stream.count, burst.count, burstBlend);
      const baseAlpha = lerp(stream.alphaMultiplier, burst.alphaMultiplier, burstBlend);
      const baseSize = lerp(stream.sizeMultiplier, burst.sizeMultiplier, burstBlend);
      const baseSpreadX = lerp(stream.spreadX, burst.spreadX, burstBlend);
      const baseSpreadY = lerp(stream.spreadY, burst.spreadY, burstBlend);

      return {
        count: Math.max(fingertip.count + 2, Math.round(lerp(baseCount, baseCount * 0.72, decayT))),
        spreadX: lerp(baseSpreadX, Math.max(fingertip.spreadX + 8, baseSpreadX * 0.82), decayT),
        spreadY: lerp(baseSpreadY, Math.max(fingertip.spreadY + 4, baseSpreadY * 0.84), decayT),
        velocityX: lerp(stream.velocityX, Math.max(fingertip.velocityX * 1.5, stream.velocityX * 0.8), decayT),
        velocityY: {
          min: lerp(stream.velocityY.min, stream.velocityY.min * 0.82, decayT),
          max: lerp(stream.velocityY.max, stream.velocityY.max * 0.85, decayT),
        },
        lifeMultiplier: lerp(stream.lifeMultiplier, Math.max(fingertip.lifeMultiplier, stream.lifeMultiplier * 0.92), decayT),
        sizeMultiplier: lerp(baseSize, Math.max(fingertip.sizeMultiplier + 0.12, baseSize * 0.92), decayT),
        alphaMultiplier: lerp(baseAlpha, Math.max(fingertip.alphaMultiplier + 0.08, baseAlpha * 0.9), decayT),
        turbulence: lerp(stream.turbulence, Math.max(fingertip.turbulence + 0.12, stream.turbulence * 0.85), decayT),
        riseAccel: lerp(stream.riseAccel, Math.max(fingertip.riseAccel + 0.00035, stream.riseAccel * 0.9), decayT),
        drag: lerp(stream.drag, Math.min(0.995, stream.drag + 0.002), decayT),
        lateralDamping: lerp(stream.lateralDamping, Math.min(stream.drag, stream.lateralDamping + 0.004), decayT),
        trailWidth: lerp(stream.trailWidth, Math.max(fingertip.trailWidth + 0.3, stream.trailWidth * 0.92), decayT),
        trailAlpha: lerp(stream.trailAlpha, Math.max(fingertip.trailAlpha * 0.8, stream.trailAlpha * 0.86), decayT),
        strandiness: lerp(stream.strandiness, Math.max(fingertip.strandiness * 0.7, stream.strandiness * 0.84), decayT),
        unravel: lerp(stream.unravel, Math.max(fingertip.unravel * 0.72, stream.unravel * 0.88), decayT),
        curlStrength: lerp(stream.curlStrength, Math.max(fingertip.curlStrength * 0.7, stream.curlStrength * 0.9), decayT),
        spreadAccel: lerp(stream.spreadAccel, Math.max(fingertip.spreadAccel * 0.72, stream.spreadAccel * 0.88), decayT),
        fadeInEnd: lerp(stream.fadeInEnd, Math.max(0.08, stream.fadeInEnd * 0.96), decayT),
        fadeOutStart: lerp(stream.fadeOutStart, Math.max(fingertip.fadeOutStart + 0.04, stream.fadeOutStart * 0.96), decayT),
        fadeOutPower: lerp(stream.fadeOutPower, Math.max(fingertip.fadeOutPower * 0.8, stream.fadeOutPower * 1.08), decayT),
        spriteAlphaMultiplier: lerp(stream.spriteAlphaMultiplier, Math.max(fingertip.spriteAlphaMultiplier * 1.1, stream.spriteAlphaMultiplier * 0.94), decayT),
        spriteFadeStart: lerp(stream.spriteFadeStart, Math.max(fingertip.spriteFadeStart + 0.02, stream.spriteFadeStart * 0.96), decayT),
        spriteFadePower: lerp(stream.spriteFadePower, Math.max(fingertip.spriteFadePower * 0.88, stream.spriteFadePower * 1.04), decayT),
        veilAlphaMultiplier: lerp(stream.veilAlphaMultiplier, Math.max(fingertip.veilAlphaMultiplier * 0.92, stream.veilAlphaMultiplier * 1.04), decayT),
        veilScale: lerp(stream.veilScale, Math.max(fingertip.veilScale * 0.92, stream.veilScale * 1.05), decayT),
        haloAlphaMultiplier: lerp(stream.haloAlphaMultiplier, Math.max(fingertip.haloAlphaMultiplier, stream.haloAlphaMultiplier * 1.03), decayT),
        haloScale: lerp(stream.haloScale, Math.max(fingertip.haloScale * 0.92, stream.haloScale * 1.04), decayT),
        trailSoftness: lerp(stream.trailSoftness, Math.max(fingertip.trailSoftness * 0.82, stream.trailSoftness * 1.04), decayT),
        lightAlphaMultiplier: lerp(stream.lightAlphaMultiplier, Math.max(fingertip.lightAlphaMultiplier * 0.86, stream.lightAlphaMultiplier * 1.02), decayT),
        lightScale: lerp(stream.lightScale, Math.max(fingertip.lightScale * 0.9, stream.lightScale * 1.04), decayT),
        lightOffsetX: lerp(stream.lightOffsetX, fingertip.lightOffsetX * 0.9, decayT),
        lightOffsetY: lerp(stream.lightOffsetY, fingertip.lightOffsetY * 0.9, decayT),
        dissolveStartDistance: lerp(stream.dissolveStartDistance, Math.max(fingertip.dissolveStartDistance + 18, stream.dissolveStartDistance * 0.96), decayT),
        dissolveEndDistance: lerp(stream.dissolveEndDistance, Math.max(fingertip.dissolveEndDistance + 36, stream.dissolveEndDistance * 0.98), decayT),
        dissolvePower: lerp(stream.dissolvePower, Math.max(fingertip.dissolvePower * 0.82, stream.dissolvePower * 1.04), decayT),
      };
    }

    return null;
  }

  return {
    getEmissionProfile,
    getEmberProfile,
    getParticleAlpha,
    getLateralSpreadForce,
    getParticleRenderState,
    getAltitudeFade,
  };
});
