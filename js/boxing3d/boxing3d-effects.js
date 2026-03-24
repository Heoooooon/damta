(function () {
  'use strict';

  var MAX_PARTICLES = 500;
  var scene = null;
  var camera = null;

  // 파티클 상태 배열
  var particles = [];
  var rings = [];
  var shakeAmount = 0;
  var shakeDecay = 0.85;
  var cameraBasePos = null;

  // 파티클 Points 오브젝트
  var pointsGeometry = null;
  var pointsMesh = null;
  var positions = null;
  var colors = null;

  // 샌드백 모델 파라미터 (좌표 변환용)
  var BAG_RADIUS = 0.3;
  var BAG_HEIGHT = 1.2;
  var BAG_CENTER_Y = 1.0;

  var NORMAL = {
    count: 10,
    sizeMin: 0.02, sizeMax: 0.04,
    lifetime: 300,
    lifetimeVar: 0.3,
    speed: 0.15,
    gravity: 0.006, // 3D 단위 (2D의 0.15px → 3D ~0.006 units)
    drag: 0.97,
    shake: 0.03,
    colors: [
      { r: 1, g: 1, b: 1 },
      { r: 1, g: 0.94, b: 0.78 }
    ]
  };

  var STRONG = {
    count: 24,
    sizeMin: 0.03, sizeMax: 0.07,
    lifetime: 500,
    lifetimeVar: 0.3,
    speed: 0.3,
    gravity: 0.006,
    drag: 0.97,
    shake: 0.08,
    colors: [
      { r: 1, g: 0.47, b: 0.08 },
      { r: 1, g: 0.31, b: 0.12 },
      { r: 1, g: 0.7, b: 0.23 }
    ]
  };

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function normalizedTo3D(nx, ny) {
    // 정규화 좌표 → 샌드백 표면 3D 좌표
    // app에서 미러링 후 전달하므로 추가 미러링 불필요
    var x = (nx - 0.5) * 0.6;
    var y = (1 - ny) * BAG_HEIGHT + (BAG_CENTER_Y - BAG_HEIGHT / 2);
    var z = BAG_RADIUS + 0.05;
    return { x: x, y: y, z: z };
  }

  function init(sceneRef, cameraRef) {
    scene = sceneRef;
    camera = cameraRef;
    cameraBasePos = camera.position.clone();

    // BufferGeometry 기반 Points 생성
    // PointsMaterial은 개별 파티클 크기 제어 불가 — 전체 고정 size 사용
    // 페이드 효과는 vertexColors RGB를 lifeRatio로 곱하여 구현
    pointsGeometry = new THREE.BufferGeometry();
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);

    for (var i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
    }

    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var pointsMaterial = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true
    });

    pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(pointsMesh);
  }

  function createParticle(pos3d, cfg) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.random() * Math.PI;
    var speed = cfg.speed * (0.5 + Math.random() * 0.5);
    var color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    var lifetimeVariance = 1 - cfg.lifetimeVar + Math.random() * cfg.lifetimeVar * 2;
    return {
      x: pos3d.x,
      y: pos3d.y,
      z: pos3d.z,
      vx: Math.sin(phi) * Math.cos(theta) * speed,
      vy: Math.sin(phi) * Math.sin(theta) * speed * 0.5 + speed * 0.3,
      vz: Math.cos(phi) * speed * 0.5 + speed * 0.2,
      size: randRange(cfg.sizeMin, cfg.sizeMax),
      lifetime: cfg.lifetime * lifetimeVariance,
      age: 0,
      gravity: cfg.gravity,
      drag: cfg.drag,
      r: color.r, g: color.g, b: color.b,
      active: true
    };
  }

  function buildImpactConfig(baseCfg, impactScale) {
    var scale = Math.max(1, impactScale || 1);
    var scaleDelta = scale - 1;
    return {
      count: Math.round(baseCfg.count * (1 + scaleDelta * 0.7)),
      sizeMin: baseCfg.sizeMin * (1 + scaleDelta * 0.2),
      sizeMax: baseCfg.sizeMax * (1 + scaleDelta * 0.5),
      lifetime: baseCfg.lifetime * (1 + scaleDelta * 0.35),
      lifetimeVar: baseCfg.lifetimeVar,
      speed: baseCfg.speed * (1 + scaleDelta * 0.45),
      gravity: baseCfg.gravity,
      drag: baseCfg.drag,
      shake: baseCfg.shake * (1 + scaleDelta * 0.9),
      colors: baseCfg.colors
    };
  }

  function emit(nx, ny, power, impactScale) {
    var baseCfg = power === 'strong' ? STRONG : NORMAL;
    var cfg = buildImpactConfig(baseCfg, impactScale);
    var pos3d = normalizedTo3D(nx, ny);

    for (var i = 0; i < cfg.count; i++) {
      if (particles.length >= MAX_PARTICLES) {
        var recycled = false;
        for (var j = 0; j < particles.length; j++) {
          if (!particles[j].active) {
            particles[j] = createParticle(pos3d, cfg);
            recycled = true;
            break;
          }
        }
        if (!recycled) break;
      } else {
        particles.push(createParticle(pos3d, cfg));
      }
    }

    if (power === 'strong') {
      createRing(pos3d, impactScale);
    }

    shakeAmount = cfg.shake;
  }

  function createRing(pos3d, impactScale) {
    var scale = Math.max(1, impactScale || 1);
    var ringGeo = new THREE.RingGeometry(0.05, 0.07, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffa028,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(pos3d.x, pos3d.y, pos3d.z + 0.01);
    ringMesh.lookAt(camera.position);
    scene.add(ringMesh);

    rings.push({
      mesh: ringMesh,
      scale: 1,
      maxScale: 8 + (scale - 1) * 3,
      expandRate: 0.3 + (scale - 1) * 0.08,
      alpha: 1,
      active: true
    });
  }

  function update(dt) {
    var dtRatio = dt / 16.667;

    // 카메라 셰이크
    if (shakeAmount > 0.001 && cameraBasePos) {
      camera.position.x = cameraBasePos.x + (Math.random() - 0.5) * 2 * shakeAmount;
      camera.position.y = cameraBasePos.y + (Math.random() - 0.5) * 2 * shakeAmount;
      shakeAmount *= Math.pow(shakeDecay, dtRatio);
    } else if (cameraBasePos) {
      shakeAmount = 0;
      camera.position.x = cameraBasePos.x;
      camera.position.y = cameraBasePos.y;
    }

    // 파티클 업데이트
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.lifetime) {
        p.active = false;
        continue;
      }

      // 물리
      p.vy -= p.gravity * dtRatio;
      p.vx *= Math.pow(p.drag, dtRatio);
      p.vy *= Math.pow(p.drag, dtRatio);
      p.vz *= Math.pow(p.drag, dtRatio);

      // Noise offset
      if (typeof Noise !== 'undefined') {
        var noiseScale = 0.005;
        p.vx += Noise.noise2D(p.x * 3, p.age * 0.01) * noiseScale;
        p.vy += Noise.noise2D(p.y * 3, p.age * 0.01) * noiseScale;
      }

      p.x += p.vx * dtRatio;
      p.y += p.vy * dtRatio;
      p.z += p.vz * dtRatio;
    }

    // BufferGeometry 갱신
    for (var i = 0; i < MAX_PARTICLES; i++) {
      if (i < particles.length && particles[i].active) {
        var p = particles[i];
        var lifeRatio = 1 - p.age / p.lifetime;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        colors[i * 3] = p.r * lifeRatio;
        colors[i * 3 + 1] = p.g * lifeRatio;
        colors[i * 3 + 2] = p.b * lifeRatio;
      } else {
        positions[i * 3 + 1] = -100;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
      }
    }

    pointsGeometry.attributes.position.needsUpdate = true;
    pointsGeometry.attributes.color.needsUpdate = true;

    // 충격파 링 업데이트
    for (var r = rings.length - 1; r >= 0; r--) {
      var ring = rings[r];
      if (!ring.active) continue;

      ring.scale += ring.expandRate * dtRatio;
      ring.alpha -= 0.03 * dtRatio;

      if (ring.alpha <= 0 || ring.scale >= ring.maxScale) {
        ring.active = false;
        scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        continue;
      }

      ring.mesh.scale.set(ring.scale, ring.scale, 1);
      ring.mesh.material.opacity = Math.max(0, ring.alpha);
    }

    // 비활성 링 정리
    rings = rings.filter(function (r) { return r.active; });

    // 비활성 파티클 정리
    if (particles.length > MAX_PARTICLES * 0.8) {
      particles = particles.filter(function (p) { return p.active; });
    }
  }

  function reset() {
    particles = [];
    shakeAmount = 0;
    if (cameraBasePos && camera) {
      camera.position.copy(cameraBasePos);
    }

    // 링 정리
    for (var i = 0; i < rings.length; i++) {
      if (rings[i].mesh) {
        scene.remove(rings[i].mesh);
        rings[i].mesh.geometry.dispose();
        rings[i].mesh.material.dispose();
      }
    }
    rings = [];

    // 파티클 위치/색상 초기화
    if (positions) {
      for (var i = 0; i < MAX_PARTICLES; i++) {
        positions[i * 3 + 1] = -100;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
      }
      pointsGeometry.attributes.position.needsUpdate = true;
      pointsGeometry.attributes.color.needsUpdate = true;
    }
  }

  window.BoxingEffects3D = {
    init: init,
    emit: emit,
    update: update,
    reset: reset
  };
})();
