(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.InteractionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_HAND_OPTIONS = {
    gapMin: 0.045,
    gapMax: 0.24,
    wideGapMax: 0.72,
    onThreshold: 0.64,
    offThreshold: 0.46,
    detectFrames: 2,
    lostFrames: 4,
  };

  const DEFAULT_SMOKE_OPTIONS = {
    nearEnterRatio: 0.45,
    nearExitRatio: 0.60,
    inhaleMinDuration: 60,
    exhaleMinMoveRatio: 0.08,
    exhaleHoldDuration: 1200,
    exhaleBurstDuration: 220,
    cooldownDuration: 140,
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalizeVector(x, y) {
    const length = Math.hypot(x, y);
    if (!length) {
      return { x: 0, y: 0 };
    }

    return { x: x / length, y: y / length };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function isValidLandmarks(landmarks) {
    return Array.isArray(landmarks) && landmarks.length >= 21;
  }

  function palmWidth(landmarks) {
    return dist(landmarks[0], landmarks[9]);
  }

  function extensionRatio(landmarks, tipIdx, pipIdx) {
    const wrist = landmarks[0];
    const tipDistance = dist(wrist, landmarks[tipIdx]);
    const pipDistance = dist(wrist, landmarks[pipIdx]);

    if (!pipDistance) {
      return 0;
    }

    return tipDistance / pipDistance;
  }

  function extensionScore(landmarks, tipIdx, pipIdx) {
    const ratio = extensionRatio(landmarks, tipIdx, pipIdx);
    return clamp01((ratio - 1.08) / 0.28);
  }

  function relaxedScore(landmarks, tipIdx, pipIdx) {
    const ratio = extensionRatio(landmarks, tipIdx, pipIdx);
    return clamp01((1.08 - ratio) / 0.22);
  }

  function gapScore(gapRatio, minGap, idealMaxGap, wideMaxGap) {
    if (gapRatio < minGap || gapRatio > wideMaxGap) {
      return 0;
    }

    if (gapRatio <= idealMaxGap) {
      const midpoint = (minGap + idealMaxGap) / 2;
      const radius = (idealMaxGap - minGap) / 2;
      if (!radius) {
        return 1;
      }

      return clamp01(1 - Math.abs(gapRatio - midpoint) / radius);
    }

    const wideProgress = (gapRatio - idealMaxGap) / Math.max(0.0001, wideMaxGap - idealMaxGap);
    return 0.34 * (1 - wideProgress);
  }

  function parallelScore(landmarks) {
    const indexVector = normalizeVector(
      landmarks[8].x - landmarks[6].x,
      landmarks[8].y - landmarks[6].y
    );
    const middleVector = normalizeVector(
      landmarks[12].x - landmarks[10].x,
      landmarks[12].y - landmarks[10].y
    );

    return clamp01((dot(indexVector, middleVector) - 0.55) / 0.45);
  }

  // --- Pinch pose (thumb + index) detection ---
  function analyzePinchPose(landmarks, width) {
    // Thumb tip (4) and index tip (8) distance
    var pinchGap = dist(landmarks[4], landmarks[8]) / width;
    // Pinch is active when thumb and index tips are close
    var pinchClose = pinchGap < 0.45;
    // Check that thumb and index tips are away from the palm center (not just a fist)
    var thumbDist = dist(landmarks[4], landmarks[0]) / width;
    var indexDist = dist(landmarks[8], landmarks[0]) / width;
    var awayFromPalm = thumbDist > 0.5 && indexDist > 0.5;
    var closeness = clamp01((0.45 - pinchGap) / 0.35);
    var pinchScore = pinchClose && awayFromPalm
      ? closeness * 0.7 + clamp01(thumbDist - 0.5) * 0.15 + clamp01(indexDist - 0.5) * 0.15
      : 0;
    var isPinch = pinchClose && awayFromPalm && pinchScore >= 0.35;
    return { isPinch: isPinch, pinchScore: pinchScore, pinchGap: pinchGap };
  }

  function computePinchTipPosition(landmarks) {
    // Tip is at the pinch point (midpoint of thumb tip and index tip)
    var pinchPoint = midpoint(landmarks[4], landmarks[8]);
    // Guide from knuckles
    var guideMid = midpoint(landmarks[3], landmarks[6]);
    var width = palmWidth(landmarks);
    var emberDir = normalizeVector(
      pinchPoint.x - guideMid.x,
      pinchPoint.y - guideMid.y
    );
    var fingerGap = dist(landmarks[4], landmarks[8]);
    var extension = Math.min(
      width * 0.22,
      Math.max(width * 0.12, fingerGap * 0.6)
    );
    return {
      x: pinchPoint.x + emberDir.x * extension,
      y: pinchPoint.y + emberDir.y * extension,
    };
  }

  function analyzeHandPose(landmarks, options) {
    const config = Object.assign({}, DEFAULT_HAND_OPTIONS, options);

    var emptyResult = {
      isPose: false,
      score: 0,
      gapRatio: 0,
      indexExtendedScore: 0,
      middleExtendedScore: 0,
      ringRelaxedScore: 0,
      pinkyRelaxedScore: 0,
      parallelScore: 0,
      poseType: null,
    };

    if (!isValidLandmarks(landmarks)) {
      return emptyResult;
    }

    const width = palmWidth(landmarks);
    if (!width) {
      return emptyResult;
    }

    // --- V-pose (index + middle) ---
    const gapRatio = dist(landmarks[8], landmarks[12]) / width;
    const indexExtendedScore = extensionScore(landmarks, 8, 6);
    const middleExtendedScore = extensionScore(landmarks, 12, 10);
    const ringRelaxedScore = relaxedScore(landmarks, 16, 14);
    const pinkyRelaxedScore = relaxedScore(landmarks, 20, 18);
    const directionScore = parallelScore(landmarks);
    const shapeScore = gapScore(
      gapRatio,
      config.gapMin,
      config.gapMax,
      config.wideGapMax
    );

    const wideGapEligible =
      gapRatio > config.gapMax &&
      gapRatio <= config.wideGapMax &&
      indexExtendedScore >= 0.72 &&
      middleExtendedScore >= 0.72 &&
      directionScore >= 0.82;

    const vScore =
      shapeScore * 0.38 +
      indexExtendedScore * 0.21 +
      middleExtendedScore * 0.21 +
      directionScore * 0.14 +
      ringRelaxedScore * 0.03 +
      pinkyRelaxedScore * 0.03;

    const hasVShape =
      gapRatio >= config.gapMin &&
      indexExtendedScore >= 0.55 &&
      middleExtendedScore >= 0.55 &&
      directionScore >= 0.45 &&
      (gapRatio <= config.gapMax || wideGapEligible);

    const vPose = hasVShape && vScore >= config.onThreshold;

    // --- Pinch pose (thumb + index) ---
    const pinch = analyzePinchPose(landmarks, width);

    // Pick the better pose
    const isPose = vPose || pinch.isPinch;
    const poseType = vPose ? 'v' : pinch.isPinch ? 'pinch' : null;
    const score = vPose ? vScore : pinch.isPinch ? pinch.pinchScore : Math.max(vScore, pinch.pinchScore);

    return {
      isPose,
      score,
      gapRatio,
      indexExtendedScore,
      middleExtendedScore,
      ringRelaxedScore,
      pinkyRelaxedScore,
      parallelScore: directionScore,
      poseType,
      pinchGap: pinch.pinchGap,
    };
  }

  function computeCigaretteTipPosition(landmarks, poseType) {
    if (poseType === 'pinch') {
      return computePinchTipPosition(landmarks);
    }
    // Default: V-pose (index + middle)
    const tipMid = midpoint(landmarks[8], landmarks[12]);
    const guideMid = midpoint(landmarks[6], landmarks[10]);
    const width = palmWidth(landmarks);
    const emberDirection = normalizeVector(
      tipMid.x - guideMid.x,
      tipMid.y - guideMid.y
    );
    const fingerGap = dist(landmarks[8], landmarks[12]);
    const extension = Math.min(
      width * 0.28,
      Math.max(width * 0.18, fingerGap * 0.75)
    );

    return {
      x: tipMid.x + emberDirection.x * extension,
      y: tipMid.y + emberDirection.y * extension,
    };
  }

  function createPoseTracker(options) {
    const config = Object.assign({}, DEFAULT_HAND_OPTIONS, options);
    let poseActive = false;
    let detectStreak = 0;
    let lostStreak = 0;
    let lastAnalysis = analyzeHandPose(null, config);

    function update(landmarks) {
      if (!isValidLandmarks(landmarks)) {
        detectStreak = 0;
        lostStreak += 1;
        if (lostStreak >= config.lostFrames) {
          poseActive = false;
        }

        lastAnalysis = analyzeHandPose(null, config);
        return {
          poseActive,
          poseScore: lastAnalysis.score,
          cigTip: null,
          analysis: lastAnalysis,
        };
      }

      lastAnalysis = analyzeHandPose(landmarks, config);

      if (lastAnalysis.isPose) {
        detectStreak += 1;
        lostStreak = 0;
        if (detectStreak >= config.detectFrames) {
          poseActive = true;
        }
      } else if (
        lastAnalysis.score <= config.offThreshold &&
        // Don't use V-pose gapRatio to kill a pinch pose
        !lastAnalysis.poseType
      ) {
        detectStreak = 0;
        lostStreak += 1;
        if (lostStreak >= config.lostFrames) {
          poseActive = false;
        }
      } else if (!lastAnalysis.isPose) {
        detectStreak = 0;
        lostStreak += 1;
        if (lostStreak >= config.lostFrames) {
          poseActive = false;
        }
      }

      return {
        poseActive,
        poseScore: lastAnalysis.score,
        cigTip: poseActive ? computeCigaretteTipPosition(landmarks, lastAnalysis.poseType) : null,
        analysis: lastAnalysis,
      };
    }

    function getLastAnalysis() {
      return lastAnalysis;
    }

    return { update, getLastAnalysis };
  }

  function createEmission(type, progress, strength) {
    return {
      type: type || null,
      progress: progress || 0,
      strength: strength == null ? 1 : strength,
    };
  }

  function createSmokeStateMachine(options) {
    const config = Object.assign({}, DEFAULT_SMOKE_OPTIONS, options);
    let smokeState = 'idle';
    let blendFactor = 0;
    let inhaleStartTime = 0;
    let inhaleAnchorTip = null;
    let proximityAccum = 0;
    let exhaleStartTime = -Infinity;
    let cooldownUntil = 0;
    let lastMouth = null;
    let exhaleDirection = null;
    let inhaleAccumulated = 0;
    let exhaleStrength = 1;

    function resetInhale() {
      inhaleStartTime = 0;
      inhaleAnchorTip = null;
      blendFactor = 0;
    }

    function update(input, now) {
      const poseActive = !!(input && input.poseActive);
      const cigTip = input ? input.cigTip : null;
      const mouth = input ? input.mouth : null;
      const faceHeight = input && input.faceHeight ? input.faceHeight : 0;

      if (mouth) {
        lastMouth = { x: mouth.x, y: mouth.y };
      }

      if (smokeState === 'exhaling') {
        const elapsed = now - exhaleStartTime;
        if (lastMouth && elapsed < config.exhaleHoldDuration) {
          const emissionType = elapsed < config.exhaleBurstDuration
            ? 'exhale-burst'
            : 'exhale-stream';
          const progress = clamp01(
            (elapsed - config.exhaleBurstDuration) /
              Math.max(1, config.exhaleHoldDuration - config.exhaleBurstDuration)
          );

          blendFactor = Math.min(1, blendFactor + 0.05);

          const baseStr = emissionType === 'exhale-burst' ? 1 : 0.82;
          const em = createEmission(
            emissionType,
            progress,
            baseStr * exhaleStrength
          );
          em.direction = exhaleDirection;
          return {
            state: 'exhaling',
            emitPos: lastMouth,
            isExhale: true,
            emission: em,
            blendFactor,
          };
        }

        smokeState = poseActive && cigTip ? 'fingertip' : 'idle';
        blendFactor = 0;
        cooldownUntil = now + config.cooldownDuration;
      }

      if (!poseActive || !cigTip) {
        smokeState = 'idle';
        proximityAccum = 0;
        resetInhale();
        return {
          state: 'idle',
          emitPos: null,
          isExhale: false,
          emission: createEmission(null),
          blendFactor: 0,
        };
      }

      if (!mouth || !faceHeight) {
        smokeState = 'fingertip';
        proximityAccum = Math.max(0, proximityAccum - 0.03);
        resetInhale();
        return {
          state: 'fingertip',
          emitPos: cigTip,
          isExhale: false,
          emission: createEmission('fingertip'),
          blendFactor: 0,
        };
      }

      const tipToMouth = dist(cigTip, mouth);
      const enterThreshold = config.nearEnterRatio * faceHeight;
      const exitThreshold = config.nearExitRatio * faceHeight;
      const proximityRatio = 1 - clamp01(tipToMouth / enterThreshold);

      proximityAccum = clamp01(proximityAccum + proximityRatio * 0.22);

      if (smokeState === 'inhaling') {
        const inhaleDuration = now - inhaleStartTime;
        const movedFromAnchor = inhaleAnchorTip
          ? dist(cigTip, inhaleAnchorTip)
          : tipToMouth;
        const exhaleDistance = config.exhaleMinMoveRatio * faceHeight;

        if (
          inhaleDuration >= config.inhaleMinDuration &&
          (tipToMouth >= exhaleDistance || movedFromAnchor >= exhaleDistance * 0.5)
        ) {
          smokeState = 'exhaling';
          blendFactor = 0;
          exhaleStartTime = now;
          proximityAccum = 0;
          exhaleStrength = Math.max(0.3, inhaleAccumulated);
          inhaleStartTime = 0;
          inhaleAnchorTip = null;

          exhaleDirection = null;
          if (cigTip && mouth) {
            const ddx = cigTip.x - mouth.x;
            const ddy = cigTip.y - mouth.y;
            const dlen = Math.hypot(ddx, ddy);
            if (dlen > 0.001) {
              exhaleDirection = { x: ddx / dlen, y: ddy / dlen };
            }
          }

          const burstEm = createEmission('exhale-burst', 0, exhaleStrength);
          burstEm.direction = exhaleDirection;
          return {
            state: 'exhaling',
            emitPos: mouth,
            isExhale: true,
            emission: burstEm,
            blendFactor,
            tipToMouth,
            movedFromAnchor,
            thresholds: {
              enter: enterThreshold,
              exit: exitThreshold,
            },
          };
        }

        if (tipToMouth >= exitThreshold * 1.5) {
          proximityAccum = Math.max(0, proximityAccum - 0.1);
        }
      }

      if (proximityAccum > 0.25) {
        if (smokeState !== 'inhaling') {
          inhaleStartTime = now;
          inhaleAnchorTip = { x: cigTip.x, y: cigTip.y };
        }

        smokeState = 'inhaling';
        inhaleAccumulated = clamp01(inhaleAccumulated + 0.025);
        var inhaleDir = null;
        if (cigTip && mouth) {
          var idx = mouth.x - cigTip.x;
          var idy = mouth.y - cigTip.y;
          var ilen = Math.hypot(idx, idy);
          if (ilen > 0.001) {
            inhaleDir = { x: idx / ilen, y: idy / ilen };
          }
        }
        var inhaleEm = createEmission('fingertip', 0, 0.35);
        inhaleEm.direction = inhaleDir;
        inhaleEm.inhaling = true;
        return {
          state: 'inhaling',
          emitPos: cigTip,
          isExhale: false,
          emission: inhaleEm,
          blendFactor: 0,
          inhalingMouth: mouth,
          tipToMouth,
          thresholds: {
            enter: enterThreshold,
            exit: exitThreshold,
          },
        };
      }

      smokeState = 'fingertip';
      blendFactor = Math.max(0, blendFactor - 0.08);
      inhaleAccumulated = Math.max(0, inhaleAccumulated - 0.01);
      return {
        state: 'fingertip',
        emitPos: cigTip,
        isExhale: false,
        emission: createEmission('fingertip'),
        blendFactor,
        tipToMouth,
        thresholds: {
          enter: enterThreshold,
          exit: exitThreshold,
        },
      };
    }

    function getState() {
      return smokeState;
    }

    return { update, getState };
  }

  return {
    analyzeHandPose,
    computeCigaretteTipPosition,
    createPoseTracker,
    createSmokeStateMachine,
    dist,
  };
});
