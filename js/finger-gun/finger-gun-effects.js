(function () {
  'use strict';

  var scene = null;
  var camera = null;
  var beams = [];
  var flashes = [];
  var cameraBasePos = null;
  var shakeAmount = 0;
  var shakeDecay = 0.84;

  function createBeam(origin, target, hit) {
    var geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(target.x, target.y, target.z)
    ]);
    var material = new THREE.LineBasicMaterial({
      color: hit ? 0xfff2ae : 0x7ac7ff,
      transparent: true,
      opacity: 0.95
    });
    var line = new THREE.Line(geometry, material);
    scene.add(line);
    beams.push({ mesh: line, life: 90, maxLife: 90 });
  }

  function createFlash(position, size, color, life) {
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 16, 16),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1
      })
    );
    mesh.position.set(position.x, position.y, position.z);
    scene.add(mesh);
    flashes.push({ mesh: mesh, life: life, maxLife: life, grow: size * 0.06 });
  }

  function init(sceneRef, cameraRef) {
    scene = sceneRef;
    camera = cameraRef;
    cameraBasePos = camera.position.clone();
  }

  function emitShot(origin, target, hitTier) {
    var isHit = !!hitTier;
    createBeam(origin, target, isHit);
    createFlash(origin, 0.045, 0xffc86f, 80);

    if (isHit) {
      var color = hitTier === 'bullseye' ? 0xffef7d : hitTier === 'inner' ? 0xff9d57 : 0x73d9ff;
      createFlash(target, hitTier === 'bullseye' ? 0.11 : 0.08, color, 170);
      shakeAmount = hitTier === 'bullseye' ? 0.08 : 0.05;
    } else {
      createFlash(target, 0.045, 0x4aa8ff, 110);
      shakeAmount = 0.025;
    }
  }

  function update(dt) {
    var dtRatio = dt / 16.667;

    if (shakeAmount > 0.001 && cameraBasePos) {
      camera.position.x = cameraBasePos.x + (Math.random() - 0.5) * shakeAmount;
      camera.position.y = cameraBasePos.y + (Math.random() - 0.5) * shakeAmount;
      shakeAmount *= Math.pow(shakeDecay, dtRatio);
    } else if (cameraBasePos) {
      shakeAmount = 0;
      camera.position.copy(cameraBasePos);
    }

    for (var i = beams.length - 1; i >= 0; i--) {
      var beam = beams[i];
      beam.life -= dt;
      if (beam.life <= 0) {
        scene.remove(beam.mesh);
        beam.mesh.geometry.dispose();
        beam.mesh.material.dispose();
        beams.splice(i, 1);
        continue;
      }
      beam.mesh.material.opacity = beam.life / beam.maxLife;
    }

    for (var j = flashes.length - 1; j >= 0; j--) {
      var flash = flashes[j];
      flash.life -= dt;
      if (flash.life <= 0) {
        scene.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        flash.mesh.material.dispose();
        flashes.splice(j, 1);
        continue;
      }
      var lifeRatio = flash.life / flash.maxLife;
      flash.mesh.material.opacity = lifeRatio;
      flash.mesh.scale.multiplyScalar(1 + flash.grow * dtRatio);
    }
  }

  function reset() {
    shakeAmount = 0;
    if (cameraBasePos && camera) {
      camera.position.copy(cameraBasePos);
    }

    while (beams.length) {
      var beam = beams.pop();
      scene.remove(beam.mesh);
      beam.mesh.geometry.dispose();
      beam.mesh.material.dispose();
    }

    while (flashes.length) {
      var flash = flashes.pop();
      scene.remove(flash.mesh);
      flash.mesh.geometry.dispose();
      flash.mesh.material.dispose();
    }
  }

  window.FingerGunEffects = {
    init: init,
    emitShot: emitShot,
    update: update,
    reset: reset
  };
})();
