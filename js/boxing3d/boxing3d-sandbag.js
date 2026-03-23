(function () {
  'use strict';

  var STIFFNESS = 0.08;
  var DAMPING = 0.95;
  var MAX_ANGLE = 0.35;
  var FLASH_DECAY = 0.92;

  var HITBOX = { x: 0.5, y: 0.45, halfW: 0.1, halfH: 0.25 };

  // 물리 상태
  var angle = 0;
  var angularVelocity = 0;
  var flash = 0;

  // Three.js 객체
  var group = null;
  var bagMaterial = null;

  // 샌드백 모델 파라미터
  var BAG_RADIUS = 0.3;
  var BAG_HEIGHT = 1.2;
  var BAG_CENTER_Y = 1.0;
  var CHAIN_TOP_Y = 2.8;

  function init(scene) {
    group = new THREE.Group();

    // 샌드백 본체
    var bagGeo = new THREE.CylinderGeometry(BAG_RADIUS, BAG_RADIUS, BAG_HEIGHT, 24);
    bagMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0x000000
    });
    var bag = new THREE.Mesh(bagGeo, bagMaterial);
    bag.position.y = BAG_CENTER_Y;
    bag.castShadow = true;
    group.add(bag);

    // 상단 캡 (반구)
    var topCapGeo = new THREE.SphereGeometry(BAG_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    var topCap = new THREE.Mesh(topCapGeo, bagMaterial);
    topCap.position.y = BAG_CENTER_Y + BAG_HEIGHT / 2;
    topCap.castShadow = true;
    group.add(topCap);

    // 하단 캡 (반구, 뒤집기)
    var bottomCapGeo = new THREE.SphereGeometry(BAG_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    var bottomCap = new THREE.Mesh(bottomCapGeo, bagMaterial);
    bottomCap.position.y = BAG_CENTER_Y - BAG_HEIGHT / 2;
    bottomCap.rotation.x = Math.PI;
    bottomCap.castShadow = true;
    group.add(bottomCap);

    // 체인 (TorusGeometry 링크 4개)
    var chainMat = new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.3,
      metalness: 0.8
    });

    var chainStartY = BAG_CENTER_Y + BAG_HEIGHT / 2 + BAG_RADIUS * 0.5;
    var chainEndY = CHAIN_TOP_Y;
    var linkCount = 4;
    var linkSpacing = (chainEndY - chainStartY) / linkCount;

    for (var i = 0; i < linkCount; i++) {
      var linkGeo = new THREE.TorusGeometry(0.04, 0.012, 8, 12);
      var link = new THREE.Mesh(linkGeo, chainMat);
      link.position.y = chainStartY + i * linkSpacing + linkSpacing / 2;
      // 번갈아 회전 (체인 느낌)
      if (i % 2 === 0) {
        link.rotation.x = Math.PI / 2;
      } else {
        link.rotation.z = Math.PI / 2;
        link.rotation.x = Math.PI / 2;
      }
      link.castShadow = true;
      group.add(link);
    }

    // 천장 고정점 (마운트 — group 밖, 회전해도 고정)
    var mountGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
    var mountMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.2 });
    var mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = CHAIN_TOP_Y;
    scene.add(mount);

    // pivot 설정: group 원점을 천장(CHAIN_TOP_Y)으로
    group.children.forEach(function (child) {
      child.position.y -= CHAIN_TOP_Y;
    });
    group.position.y = CHAIN_TOP_Y;

    scene.add(group);
    return group;
  }

  function applyHit(power, hitX) {
    var impulse = power === 'strong' ? 0.15 : 0.06;
    var direction = hitX < HITBOX.x ? 1 : -1;
    angularVelocity += impulse * direction;
    flash = 1;
  }

  function update(dt) {
    var dtRatio = dt / 16.667;

    // 감쇠 진자
    var restoring = -STIFFNESS * angle;
    angularVelocity += restoring * dtRatio;
    angularVelocity *= Math.pow(DAMPING, dtRatio);
    angle += angularVelocity * dtRatio;

    if (angle > MAX_ANGLE) { angle = MAX_ANGLE; angularVelocity *= -0.3; }
    if (angle < -MAX_ANGLE) { angle = -MAX_ANGLE; angularVelocity *= -0.3; }

    // Flash 감쇠
    if (flash > 0.01) {
      flash *= Math.pow(FLASH_DECAY, dtRatio);
    } else {
      flash = 0;
    }

    // Three.js 업데이트
    if (group) {
      group.rotation.z = angle;
    }
    if (bagMaterial) {
      var emissiveVal = Math.floor(flash * 80);
      bagMaterial.emissive.setRGB(emissiveVal / 255, emissiveVal / 255, emissiveVal / 255);
    }
  }

  function getHitbox() {
    return { x: HITBOX.x, y: HITBOX.y, halfW: HITBOX.halfW, halfH: HITBOX.halfH };
  }

  function reset() {
    angle = 0;
    angularVelocity = 0;
    flash = 0;
    if (group) {
      group.rotation.z = 0;
    }
    if (bagMaterial) {
      bagMaterial.emissive.setRGB(0, 0, 0);
    }
  }

  window.BoxingSandbag3D = {
    init: init,
    update: update,
    applyHit: applyHit,
    getHitbox: getHitbox,
    reset: reset
  };
})();
