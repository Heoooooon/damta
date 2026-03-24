(function () {
  'use strict';

  var scene = null;
  var group = null;
  var materials = [];
  var target = {
    x: 0.5,
    y: 0.42,
    vx: 0.00018,
    vy: 0.00012,
    radius: 0.085,
    pulse: 0,
    bobPhase: 0
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function normalizedToScene(nx, ny) {
    return {
      x: (nx - 0.5) * 3.0,
      y: 0.55 + (1 - ny) * 1.45,
      z: -0.15
    };
  }

  function syncPosition() {
    if (!group) return;
    var pos = normalizedToScene(target.x, target.y);
    group.position.set(pos.x, pos.y + Math.sin(target.bobPhase) * 0.05, pos.z);
    var scale = 1 + target.pulse * 0.18;
    group.scale.set(scale, scale, scale);
  }

  function randomizeTarget(keepVelocity) {
    target.x = rand(0.18, 0.82);
    target.y = rand(0.22, 0.62);
    if (!keepVelocity) {
      target.vx = rand(0.00014, 0.00024) * (Math.random() > 0.5 ? 1 : -1);
      target.vy = rand(0.00008, 0.00018) * (Math.random() > 0.5 ? 1 : -1);
    }
    target.bobPhase = rand(0, Math.PI * 2);
    syncPosition();
  }

  function init(sceneRef) {
    scene = sceneRef;
    group = new THREE.Group();

    var backMat = new THREE.MeshStandardMaterial({
      color: 0x122033,
      emissive: 0x08111f,
      roughness: 0.55,
      metalness: 0.35
    });
    var outerMat = new THREE.MeshStandardMaterial({
      color: 0xff7547,
      emissive: 0x331208,
      roughness: 0.45,
      metalness: 0.15
    });
    var innerMat = new THREE.MeshStandardMaterial({
      color: 0xf7efe5,
      emissive: 0x1f1c14,
      roughness: 0.35,
      metalness: 0.05
    });
    var coreMat = new THREE.MeshStandardMaterial({
      color: 0xfff7bf,
      emissive: 0x544112,
      roughness: 0.2,
      metalness: 0.05
    });

    materials = [backMat, outerMat, innerMat, coreMat];

    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 48), backMat);
    base.rotation.x = Math.PI / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    var outer = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.11, 48), outerMat);
    outer.rotation.x = Math.PI / 2;
    outer.position.z = 0.01;
    group.add(outer);

    var inner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 48), innerMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.z = 0.02;
    group.add(inner);

    var core = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 48), coreMat);
    core.rotation.x = Math.PI / 2;
    core.position.z = 0.03;
    group.add(core);

    scene.add(group);
    randomizeTarget(false);
  }

  function update(dt) {
    target.x += target.vx * dt;
    target.y += target.vy * dt;
    target.bobPhase += dt * 0.0022;

    if (target.x < 0.16 || target.x > 0.84) {
      target.vx *= -1;
      target.x = clamp(target.x, 0.16, 0.84);
    }
    if (target.y < 0.2 || target.y > 0.66) {
      target.vy *= -1;
      target.y = clamp(target.y, 0.2, 0.66);
    }

    target.pulse *= Math.pow(0.88, dt / 16.667);
    syncPosition();

    if (materials.length > 0) {
      materials[1].emissive.setHex(target.pulse > 0.2 ? 0x5a2418 : 0x331208);
      materials[3].emissive.setHex(target.pulse > 0.2 ? 0x7a6526 : 0x544112);
    }
  }

  function checkHit(aimPoint) {
    var dx = aimPoint.x - target.x;
    var dy = aimPoint.y - target.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var scenePoint = normalizedToScene(aimPoint.x, aimPoint.y);

    if (distance > target.radius) {
      return { hit: false, scenePoint: scenePoint };
    }

    var tier = 'edge';
    var score = 40;

    if (distance <= target.radius * 0.33) {
      tier = 'bullseye';
      score = 150;
    } else if (distance <= target.radius * 0.62) {
      tier = 'inner';
      score = 90;
    }

    var targetPoint = normalizedToScene(target.x, target.y);
    target.pulse = 1;
    randomizeTarget(false);

    return {
      hit: true,
      tier: tier,
      score: score,
      scenePoint: targetPoint
    };
  }

  function reset() {
    target.pulse = 0;
    randomizeTarget(false);
  }

  window.FingerGunTarget = {
    init: init,
    update: update,
    checkHit: checkHit,
    reset: reset
  };
})();
