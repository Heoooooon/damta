(function () {
  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  const video = document.getElementById('webcam');
  const trackingCanvas = document.getElementById('trackingCanvas');
  const trackingCtx = trackingCanvas.getContext('2d');
  const errorEl = document.getElementById('error');
  const smokeStateMachines = [
    InteractionCore.createSmokeStateMachine(),
    InteractionCore.createSmokeStateMachine(),
  ];
  const cigTipSmoothers = [
    TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.003 }),
    TrackingSmoother.createPositionSmoother({ alpha: 0.4, deadzone: 0.003 }),
  ];
  const cigTipPredictors = [
    TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 }),
    TrackingSmoother.createVelocityPredictor({ maxPredictMs: 120, velocityAlpha: 0.5 }),
  ];
  const mouthSmoother = TrackingSmoother.createPositionSmoother({ alpha: 0.35, deadzone: 0.002 });
  let smootherEnabled = true;
  let useMouseMode = false;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  function resizeTrackingCanvas() {
    const width = useMouseMode ? canvas.width : Math.max(1, Math.round(video.getBoundingClientRect().width));
    const height = useMouseMode ? canvas.height : Math.max(1, Math.round(video.getBoundingClientRect().height));
    if (trackingCanvas.width !== width || trackingCanvas.height !== height) {
      trackingCanvas.width = width;
      trackingCanvas.height = height;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('resize', resizeTrackingCanvas);
  resizeCanvas();
  resizeTrackingCanvas();

  let lastTime = 0;

  async function mainLoop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    if (useMouseMode) {
      await MouseController.send();
    } else {
      await HandDetector.send(video);
      await FaceDetector.send(video);
    }

    let handStates, allLandmarks, mouth, mouthSmoothed, faceH, faceLandmarks;

    if (useMouseMode) {
      handStates = MouseController.getHandStates();
      allLandmarks = MouseController.getAllLandmarks();
      mouth = MouseController.getMouth();
      mouthSmoothed = mouth ? mouthSmoother.update(mouth) : null;
      if (!mouth) mouthSmoother.reset();
      faceH = MouseController.getFaceHeight();
      faceLandmarks = MouseController.getLandmarks();
    } else {
      handStates = HandDetector.updateAll();
      allLandmarks = HandDetector.getAllLandmarks();
      mouth = FaceDetector.getMouth();
      mouthSmoothed = mouth ? mouthSmoother.update(mouth) : null;
      if (!mouth) mouthSmoother.reset();
      faceH = FaceDetector.getFaceHeight();
      faceLandmarks = FaceDetector.getLandmarks();
    }

    const now = performance.now();
    const currentMode = SmokeModes.get();
    const isTextSmokeMode = currentMode.renderStyle === 'text-smoke';
    let anyActive = false;
    const smokeResults = [];
    const smoothedTips = [];
    for (let h = 0; h < handStates.length; h++) {
      const handState = handStates[h];

      let smoothedTip = null;
      if (smootherEnabled) {
        if (handState.cigTip) {
          smoothedTip = cigTipSmoothers[h].update(handState.cigTip);
          cigTipPredictors[h].feed(smoothedTip, now);
        } else {
          smoothedTip = cigTipPredictors[h].predict(now);
          if (!smoothedTip) {
            cigTipSmoothers[h].reset();
            cigTipPredictors[h].reset();
          }
        }
      } else {
        smoothedTip = handState.cigTip;
      }
      smoothedTips.push(smoothedTip);

      const smokeResult = smokeStateMachines[h].update({
        poseActive: handState.poseActive || !!smoothedTip,
        cigTip: smoothedTip,
        mouth: smootherEnabled ? mouthSmoothed : mouth,
        faceHeight: faceH,
      }, now);
      smokeResults.push(smokeResult);

      if (smokeResult.emitPos && smokeResult.emission.type) {
        if (isTextSmokeMode) {
          TextSmokeSystem.emit(
            smokeResult.emitPos.x,
            smokeResult.emitPos.y,
            canvas.width,
            canvas.height,
            currentMode,
            smokeResult.emission,
            dt
          );
        } else {
          SmokeSystem.emit(
            smokeResult.emitPos.x,
            smokeResult.emitPos.y,
            canvas.width,
            canvas.height,
            currentMode,
            smokeResult.emission,
            dt
          );
        }
      }
      if (smokeResult.state !== 'idle') anyActive = true;
    }

    let inhalingMouth = null;
    for (let h = 0; h < smokeResults.length; h++) {
      if ((smokeResults[h].state === 'inhaling' || smokeResults[h].state === 'exhaling') && mouthSmoothed) {
        inhalingMouth = {
          x: canvas.width * (1 - mouthSmoothed.x),
          y: canvas.height * mouthSmoothed.y,
        };
        break;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    trackingCtx.clearRect(0, 0, trackingCanvas.width, trackingCanvas.height);
    if (isTextSmokeMode) {
      TextSmokeSystem.update(ctx, dt, {
        dormant: !anyActive,
        inhalingMouth: inhalingMouth,
      });
    } else {
      SmokeSystem.update(ctx, dt, Noise.noise2D, {
        dormant: !anyActive,
        inhalingMouth: inhalingMouth,
      });
    }

    if (useMouseMode) {
      const faceLandmarksMouse = MouseController.getLandmarks();
      for (let h = 0; h < allLandmarks.length; h++) {
        TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
          handLandmarks: allLandmarks[h],
          faceLandmarks: faceLandmarksMouse,
          poseActive: handStates[h] ? handStates[h].poseActive : false,
          mirrored: false,
        });
        TrackingOverlay.draw(ctx, canvas.width, canvas.height, {
          handLandmarks: allLandmarks[h],
          faceLandmarks: faceLandmarksMouse,
          poseActive: handStates[h] ? handStates[h].poseActive : false,
          mirrored: true,
          mainCanvas: true,
        });
      }
      if (allLandmarks.length === 0 && faceLandmarksMouse) {
        TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
          handLandmarks: null,
          faceLandmarks: faceLandmarksMouse,
          poseActive: false,
          mirrored: false,
        });
        TrackingOverlay.draw(ctx, canvas.width, canvas.height, {
          handLandmarks: null,
          faceLandmarks: faceLandmarksMouse,
          poseActive: false,
          mirrored: true,
          mainCanvas: true,
        });
      }
    } else {
      for (let h = 0; h < allLandmarks.length; h++) {
        TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
          handLandmarks: allLandmarks[h],
          faceLandmarks: h === 0 ? faceLandmarks : null,
          poseActive: handStates[h] ? handStates[h].poseActive : false,
          mirrored: false,
        });
        TrackingOverlay.draw(ctx, canvas.width, canvas.height, {
          handLandmarks: allLandmarks[h],
          faceLandmarks: h === 0 ? faceLandmarks : null,
          poseActive: handStates[h] ? handStates[h].poseActive : false,
          mirrored: true,
          mainCanvas: true,
        });
      }
      if (allLandmarks.length === 0 && faceLandmarks) {
        TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
          handLandmarks: null,
          faceLandmarks,
          poseActive: false,
          mirrored: false,
        });
        TrackingOverlay.draw(ctx, canvas.width, canvas.height, {
          handLandmarks: null,
          faceLandmarks,
          poseActive: false,
          mirrored: true,
          mainCanvas: true,
        });
      }
    }

    for (let h = 0; h < handStates.length; h++) {
      const hs = handStates[h];
      const tip = smoothedTips[h];
      if ((hs.poseActive || tip) && tip) {
        SmokeSystem.drawEmber(
          ctx,
          tip.x,
          tip.y,
          canvas.width,
          canvas.height,
          currentMode,
          smokeResults[h].state,
          now
        );
      }
    }

    const handState = handStates[0];
    const smokeResult = smokeResults[0] || { state: 'idle', emission: { type: null } };
    const landmarks = allLandmarks[0] || null;
    const analysis = useMouseMode
      ? (handState.analysis || null)
      : (handState.analysis || HandDetector.getLastAnalysis());
    let debugGap = null;
    let debugScore = null;
    let mouthDistDebug = null;
    let thresholdDebug = null;
    if (handState.cigTip && mouth && faceH > 0) {
      mouthDistDebug = InteractionCore.dist(handState.cigTip, mouth).toFixed(3);
      if (smokeResult.thresholds) {
        thresholdDebug =
          smokeResult.thresholds.enter.toFixed(3) +
          ' -> ' +
          smokeResult.thresholds.exit.toFixed(3);
      }
    }
    if (analysis) {
      debugGap = analysis.gapRatio ? analysis.gapRatio.toFixed(3) : null;
      debugScore = analysis.score != null ? analysis.score.toFixed(3) : null;
    }
    _lastDebug = {
      hands: allLandmarks.length,
      landmarks: landmarks ? landmarks.length : 0,
      pose: handState.poseActive,
      poseScore: debugScore,
      state: smokeResult.state,
      emission: smokeResult.emission.type,
      particles: isTextSmokeMode ? TextSmokeSystem.getActiveCount() : SmokeSystem.getActiveCount(),
      gapPalm: debugGap,
      mouthDist: mouthDistDebug,
      mouthThreshold: thresholdDebug,
      faceHeight: faceH ? faceH.toFixed(3) : null,
      fingers: landmarks ? {
        idx: landmarks[8].y < landmarks[6].y,
        mid: landmarks[12].y < landmarks[10].y,
        ring: landmarks[16].y < landmarks[14].y,
        pinky: landmarks[20].y < landmarks[18].y,
      } : null,
    };

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '14px monospace';
    const modeLabel = useMouseMode ? '[Mouse]' : 'Hands: ' + (_lastDebug.hands || 0) + ' | Landmarks: ' + (_lastDebug.landmarks || 'NO');
    ctx.fillText(modeLabel, 20, 30);
    ctx.fillText('Pose: ' + (_lastDebug.pose ? 'ACTIVE' : 'inactive'), 20, 50);
    ctx.fillText('State: ' + _lastDebug.state + ' / ' + (_lastDebug.emission || 'none'), 20, 70);
    ctx.fillText('Particles: ' + _lastDebug.particles, 20, 90);
    if (debugGap) {
      ctx.fillText('Gap/Palm: ' + debugGap + ' | Score: ' + debugScore, 20, 110);
      const f = _lastDebug.fingers;
      if (f) {
        ctx.fillText('idx=' + f.idx + ' mid=' + f.mid + ' ring=' + f.ring + ' pinky=' + f.pinky, 20, 130);
      }
    }
    if (mouthDistDebug) {
      ctx.fillText('MouthDist: ' + mouthDistDebug + ' / Threshold: ' + thresholdDebug, 20, 150);
    }
    ctx.fillText('Snapshots: ' + _snapshots.length + ' (press P)', 20, 170);
    ctx.fillText('Smoother: ' + (smootherEnabled ? 'ON' : 'OFF') + ' (press S)', 20, 190);
    if (useMouseMode) {
      ctx.fillText('Left-click: hold smoke | Right-click: set mouth | Arrows: move mouth', 20, 210);
    }

    requestAnimationFrame(mainLoop);
  }

  async function initWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      return false;
    }
  }

  async function init() {
    const handErr = HandDetector.getError();
    const faceErr = FaceDetector.getError();
    const hasMediaPipe = !handErr && !faceErr;

    let camReady = false;
    if (hasMediaPipe) {
      camReady = await initWebcam();
    }

    if (!camReady && hasMediaPipe) {
      errorEl.textContent = '웹캠을 찾을 수 없습니다. 마우스 모드로 전환합니다.';
      errorEl.hidden = false;
      setTimeout(function () {
        errorEl.hidden = true;
        useMouseMode = true;
        MouseController.init();
        resizeTrackingCanvas();
        requestAnimationFrame(mainLoop);
      }, 2000);
      return;
    }

    if (!hasMediaPipe) {
      useMouseMode = true;
      MouseController.init();
      resizeTrackingCanvas();
      requestAnimationFrame(mainLoop);
      return;
    }

    if (camReady) {
      requestAnimationFrame(mainLoop);
    }
  }

  let _lastDebug = {};
  const _snapshots = [];

  const modeBtn = document.getElementById('modeBtn');
  modeBtn.textContent = SmokeModes.getName();

  function applyMode(mode) {
    modeBtn.textContent = mode.name;
    SmokeSystem.reset();
    TextSmokeSystem.reset();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyM') {
      e.preventDefault();
      applyMode(SmokeModes.toggle());
    } else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } else if (e.code === 'KeyP') {
      const snap = JSON.parse(JSON.stringify(_lastDebug));
      snap.time = new Date().toISOString();
      _snapshots.push(snap);
      navigator.clipboard.writeText(JSON.stringify(_snapshots, null, 2)).then(() => {
        console.log('Snapshot #' + _snapshots.length + ' copied to clipboard');
      });
    } else if (e.code === 'KeyS') {
      smootherEnabled = !smootherEnabled;
      console.log('Smoother: ' + (smootherEnabled ? 'ON' : 'OFF'));
    } else if (e.code === 'KeyH') {
      video.classList.toggle('hidden');
    } else if (e.code === 'KeyC') {
      useMouseMode = !useMouseMode;
      if (useMouseMode) {
        MouseController.init();
        console.log('Mode: Mouse');
      } else {
        console.log('Mode: Webcam');
      }
    }
  });

  modeBtn.addEventListener('click', () => {
    applyMode(SmokeModes.toggle());
  });

  const guideModal = document.getElementById('guideModal');
  const guideStart = document.getElementById('guideStart');
  const guideClose = document.getElementById('guideClose');

  function dismissGuide() {
    guideModal.classList.add('hidden');
    init();
  }

  guideStart.addEventListener('click', dismissGuide);
  guideClose.addEventListener('click', dismissGuide);

  window.APP = { canvas, ctx, video };
})();
