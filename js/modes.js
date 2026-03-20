const SmokeModes = (function () {
  let current = 'realistic';

  const presets = {
    realistic: {
      name: 'Realistic',
      colors: [
        'rgba(255,255,255,',
        'rgba(220,220,220,',
        'rgba(200,200,200,',
      ],
      startAlpha: 0.04,
      maxAlpha: 0.08,
      startSize: 4,
      maxSize: 40,
      speed: { min: 0.3, max: 0.8 },
      lifetime: { min: 2000, max: 4000 },
      drift: 0.15,
      swirlStrength: 0,
      swirlFrequency: 0,
      maxParticles: 100,
      exhaleMultiplier: 3,
    },
    artistic: {
      name: 'Artistic',
      colors: [
        'rgba(0,255,255,',
        'rgba(255,0,255,',
        'rgba(128,0,255,',
        'rgba(255,100,200,',
      ],
      startAlpha: 0.06,
      maxAlpha: 0.12,
      startSize: 3,
      maxSize: 50,
      speed: { min: 0.5, max: 1.2 },
      lifetime: { min: 2500, max: 5000 },
      drift: 0.4,
      swirlStrength: 2.0,
      swirlFrequency: 0.003,
      maxParticles: 200,
      exhaleMultiplier: 4,
    },
  };

  function get() {
    return presets[current];
  }

  function toggle() {
    current = current === 'realistic' ? 'artistic' : 'realistic';
    return presets[current];
  }

  function getName() {
    return presets[current].name;
  }

  return { get, toggle, getName };
})();
