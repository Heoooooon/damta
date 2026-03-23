(function () {
  'use strict';

  var scene, camera, renderer;

  function init(canvas) {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 1.0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient light
    var ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    // Directional light (전체 조명 + 그림자)
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(2, 4, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 15;
    dirLight.shadow.camera.left = -3;
    dirLight.shadow.camera.right = 3;
    dirLight.shadow.camera.top = 4;
    dirLight.shadow.camera.bottom = -1;
    scene.add(dirLight);

    // Spot light (샌드백에 집중)
    var spotLight = new THREE.SpotLight(0xffeedd, 1.0, 10, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 3.5, 2);
    spotLight.target.position.set(0, 1.0, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    scene.add(spotLight);
    scene.add(spotLight.target);

    // Floor
    var floorGeo = new THREE.PlaneGeometry(10, 10);
    var floorMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 1,
      metalness: 0
    });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    return { scene: scene, camera: camera, renderer: renderer };
  }

  function resize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getRenderer() { return renderer; }

  window.BoxingScene = {
    init: init,
    resize: resize,
    getScene: getScene,
    getCamera: getCamera,
    getRenderer: getRenderer
  };
})();
