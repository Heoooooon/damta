(function () {
  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  const mainTrackingCanvas = document.getElementById('mainTrackingCanvas');
  const mainTrackingCtx = mainTrackingCanvas.getContext('2d');
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
  const urlParams = new URLSearchParams(window.location.search);
  let smootherEnabled = true;
  let useMouseMode = false;
  let simulationMode = urlParams.get('sim') || '';
  let debugVisible = urlParams.get('debug') === '1' || !!simulationMode;
  let simulationStartTime = 0;
  let detectorSendInFlight = false;
  let frameTimeEma = 16;
  let renderQuality = 1;
  let frameIndex = 0;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    mainTrackingCanvas.width = window.innerWidth;
    mainTrackingCanvas.height = window.innerHeight;
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

  function updateRenderQuality(dt) {
    frameTimeEma += (dt - frameTimeEma) * 0.08;
    if (frameTimeEma > 24) {
      renderQuality = 0.65;
    } else if (frameTimeEma > 18) {
      renderQuality = 0.82;
    } else {
      renderQuality = 1;
    }
  }

  function pumpDetectors() {
    if (detectorSendInFlight) return;
    detectorSendInFlight = true;
    Promise.resolve()
      .then(function () { return HandDetector.send(video); })
      .then(function () { return FaceDetector.send(video); })
      .finally(function () {
        detectorSendInFlight = false;
      });
  }

  function easeInOut(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function getSimulationRig(timestamp) {
    const cycle = 5200;
    const t = ((timestamp - simulationStartTime) % cycle + cycle) % cycle;
    const mouth = { x: 0.5, y: 0.42 };

    if (t < 900) {
      return {
        label: 'fingertip',
        mouth,
        pointer: { x: 0.54, y: 0.55 },
        poseActive: true,
      };
    }

    if (t < 1800) {
      const p = easeInOut((t - 900) / 900);
      return {
        label: 'inhale-approach',
        mouth,
        pointer: {
          x: lerp(0.54, 0.505, p),
          y: lerp(0.55, 0.435, p),
        },
        poseActive: true,
      };
    }

    if (t < 2600) {
      return {
        label: 'inhale-hold',
        mouth,
        pointer: { x: 0.505, y: 0.435 },
        poseActive: true,
      };
    }

    if (t < 3600) {
      const p = easeInOut((t - 2600) / 1000);
      return {
        label: 'exhale-away',
        mouth,
        pointer: {
          x: lerp(0.505, 0.68, p),
          y: lerp(0.435, 0.39, p),
        },
        poseActive: true,
      };
    }

    if (t < 4550) {
      return {
        label: 'exhale-release',
        mouth,
        pointer: null,
        poseActive: false,
      };
    }

    return {
      label: 'reset',
      mouth,
      pointer: null,
      poseActive: false,
    };
  }

  function updateSimulation(timestamp) {
    if (!simulationMode) return null;
    const rig = getSimulationRig(timestamp);
    MouseController.setMouth(rig.mouth);
    MouseController.setPointer(rig.pointer, rig.poseActive);
    return rig;
  }

  function mainLoop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;
    frameIndex += 1;
    updateRenderQuality(dt);

    if (useMouseMode) {
      var simulationRig = updateSimulation(timestamp);
      MouseController.send();
    } else {
      pumpDetectors();
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
      if (smokeResults[h].state === 'inhaling' && mouthSmoothed) {
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
        qualityScale: renderQuality,
      });
    } else {
      SmokeSystem.update(ctx, dt, Noise.noise2D, {
        dormant: !anyActive,
        inhalingMouth: inhalingMouth,
        qualityScale: renderQuality,
      });
    }

    if ((debugVisible || simulationMode) && useMouseMode) {
      if (mouthSmoothed) {
        const mx = canvas.width * (1 - mouthSmoothed.x);
        const my = canvas.height * mouthSmoothed.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 180, 180, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(mx, my, 18, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 180, 180, 0.15)';
        ctx.fill();
        ctx.restore();
      }
      const mouseDebug = MouseController.getDebugInfo();
      if (mouseDebug.mousePos) {
        const cx = canvas.width * (1 - mouseDebug.mousePos.x);
        const cy = canvas.height * mouseDebug.mousePos.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 230, 180, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
        if (mouseDebug.poseActive) {
          ctx.strokeStyle = 'rgba(255, 200, 120, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (simulationMode && simulationRig) {
        ctx.save();
        ctx.font = '16px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillText('Simulation: ' + simulationRig.label, 20, canvas.height - 58);
        ctx.fillText('URL mode: ?sim=smoke / Space: mode switch / D: debug', 20, canvas.height - 34);
        ctx.restore();
      }
    } else if (!useMouseMode) {
      const drawTrackingOverlay = debugVisible || renderQuality > 0.7 || frameIndex % 2 === 0;
      const drawMainTrackingOverlay = debugVisible || frameIndex % 3 === 0;

      if (drawMainTrackingOverlay || (allLandmarks.length === 0 && !faceLandmarks)) {
        mainTrackingCtx.clearRect(0, 0, mainTrackingCanvas.width, mainTrackingCanvas.height);
      }

      for (let h = 0; h < allLandmarks.length; h++) {
        if (drawTrackingOverlay) {
          TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
            handLandmarks: allLandmarks[h],
            faceLandmarks: h === 0 ? faceLandmarks : null,
            poseActive: handStates[h] ? handStates[h].poseActive : false,
            mirrored: false,
          });
        }
        if (drawMainTrackingOverlay) {
          TrackingOverlay.draw(mainTrackingCtx, mainTrackingCanvas.width, mainTrackingCanvas.height, {
            handLandmarks: allLandmarks[h],
            faceLandmarks: h === 0 ? faceLandmarks : null,
            poseActive: handStates[h] ? handStates[h].poseActive : false,
            mirrored: true,
            mainCanvas: true,
          });
        }
      }
      if (drawTrackingOverlay && allLandmarks.length === 0 && faceLandmarks) {
        TrackingOverlay.draw(trackingCtx, trackingCanvas.width, trackingCanvas.height, {
          handLandmarks: null,
          faceLandmarks,
          poseActive: false,
          mirrored: false,
        });
      }
      if (drawMainTrackingOverlay && allLandmarks.length === 0 && faceLandmarks) {
        TrackingOverlay.draw(mainTrackingCtx, mainTrackingCanvas.width, mainTrackingCanvas.height, {
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
      renderQuality: renderQuality.toFixed(2),
      detectorBusy: detectorSendInFlight,
      simulation: simulationRig ? simulationRig.label : null,
      fingers: landmarks ? {
        idx: landmarks[8].y < landmarks[6].y,
        mid: landmarks[12].y < landmarks[10].y,
        ring: landmarks[16].y < landmarks[14].y,
        pinky: landmarks[20].y < landmarks[18].y,
      } : null,
    };

    if (debugVisible) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px monospace';
      const modeLabel = useMouseMode ? '[Mouse]' : 'Hands: ' + (_lastDebug.hands || 0) + ' | Landmarks: ' + (_lastDebug.landmarks || 'NO');
      ctx.fillText(modeLabel, 20, 30);
      ctx.fillText('Pose: ' + (_lastDebug.pose ? 'ACTIVE' : 'inactive'), 20, 50);
      ctx.fillText('State: ' + _lastDebug.state + ' / ' + (_lastDebug.emission || 'none'), 20, 70);
      ctx.fillText('Particles: ' + _lastDebug.particles, 20, 90);
      ctx.fillText('Quality: ' + _lastDebug.renderQuality, 20, 110);
      if (debugGap) {
        ctx.fillText('Gap/Palm: ' + debugGap + ' | Score: ' + debugScore, 20, 130);
        const f = _lastDebug.fingers;
        if (f) {
          ctx.fillText('idx=' + f.idx + ' mid=' + f.mid + ' ring=' + f.ring + ' pinky=' + f.pinky, 20, 150);
        }
      }
      if (mouthDistDebug) {
        ctx.fillText('MouthDist: ' + mouthDistDebug + ' / Threshold: ' + thresholdDebug, 20, 170);
      }
      ctx.fillText('Snapshots: ' + _snapshots.length + ' (press P)', 20, 190);
      ctx.fillText('Smoother: ' + (smootherEnabled ? 'ON' : 'OFF') + ' (press S)', 20, 210);
      if (useMouseMode) {
        ctx.fillText('Left-click: hold smoke | Right-click: set mouth | Arrows: move mouth', 20, 230);
      }
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
    if (simulationMode) {
      useMouseMode = true;
      simulationStartTime = performance.now();
      MouseController.init();
      resizeTrackingCanvas();
      requestAnimationFrame(mainLoop);
      return;
    }

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
    } else if (e.code === 'KeyD') {
      debugVisible = !debugVisible;
      console.log('Debug HUD: ' + (debugVisible ? 'ON' : 'OFF'));
    } else if (e.code === 'KeyC') {
      simulationMode = '';
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

  if (simulationMode) {
    dismissGuide();
  }

  window.APP = {
    canvas,
    ctx,
    video,
    getDebug: function () { return _lastDebug; },
    setDebugVisible: function (visible) { debugVisible = !!visible; },
    setSimulation: function (mode) {
      simulationMode = mode || '';
      simulationStartTime = performance.now();
      if (simulationMode) {
        useMouseMode = true;
        MouseController.init();
        resizeTrackingCanvas();
      }
    },
  };
})();
