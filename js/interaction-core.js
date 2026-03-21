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
    nearEnterRatio: 0.27,
    nearExitRatio: 0.35,
    inhaleMinDuration: 180,
    exhaleMinMoveRatio: 0.2,
    exhaleHoldDuration: 760,
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

  function analyzeHandPose(landmarks, options) {
    const config = Object.assign({}, DEFAULT_HAND_OPTIONS, options);

    if (!isValidLandmarks(landmarks)) {
      return {
        isPose: false,
        score: 0,
        gapRatio: 0,
        indexExtendedScore: 0,
        middleExtendedScore: 0,
        ringRelaxedScore: 0,
        pinkyRelaxedScore: 0,
        parallelScore: 0,
      };
    }

    const width = palmWidth(landmarks);
    if (!width) {
      return {
        isPose: false,
        score: 0,
        gapRatio: 0,
        indexExtendedScore: 0,
        middleExtendedScore: 0,
        ringRelaxedScore: 0,
        pinkyRelaxedScore: 0,
        parallelScore: 0,
      };
    }

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

    const score =
      shapeScore * 0.38 +
      indexExtendedScore * 0.21 +
      middleExtendedScore * 0.21 +
      directionScore * 0.14 +
      ringRelaxedScore * 0.03 +
      pinkyRelaxedScore * 0.03;

    const hasRequiredShape =
      gapRatio >= config.gapMin &&
      indexExtendedScore >= 0.55 &&
      middleExtendedScore >= 0.55 &&
      directionScore >= 0.45 &&
      (gapRatio <= config.gapMax || wideGapEligible);

    return {
      isPose: hasRequiredShape && score >= config.onThreshold,
      score,
      gapRatio,
      indexExtendedScore,
      middleExtendedScore,
      ringRelaxedScore,
      pinkyRelaxedScore,
      parallelScore: directionScore,
    };
  }

  function computeCigaretteTipPosition(landmarks) {
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
        lastAnalysis.score <= config.offThreshold ||
        lastAnalysis.gapRatio < config.gapMin * 0.6 ||
        lastAnalysis.gapRatio > config.wideGapMax * 1.15
      ) {
        detectStreak = 0;
        lostStreak += 1;
        if (lostStreak >= config.lostFrames) {
          poseActive = false;
        }
      } else {
        detectStreak = 0;
        lostStreak = 0;
      }

      return {
        poseActive,
        poseScore: lastAnalysis.score,
        cigTip: poseActive ? computeCigaretteTipPosition(landmarks) : null,
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
    let inhaleStartTime = 0;
    let inhaleAnchorTip = null;
    let nearMouth = false;
    let exhaleStartTime = -Infinity;
    let cooldownUntil = 0;
    let lastMouth = null;

    function resetInhale() {
      inhaleStartTime = 0;
      inhaleAnchorTip = null;
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

          return {
            state: 'exhaling',
            emitPos: lastMouth,
            isExhale: true,
            emission: createEmission(
              emissionType,
              progress,
              emissionType === 'exhale-burst' ? 1 : 0.82
            ),
          };
        }

        smokeState = poseActive && cigTip ? 'fingertip' : 'idle';
        cooldownUntil = now + config.cooldownDuration;
      }

      if (!poseActive || !cigTip) {
        smokeState = 'idle';
        nearMouth = false;
        resetInhale();
        return {
          state: 'idle',
          emitPos: null,
          isExhale: false,
          emission: createEmission(null),
        };
      }

      if (!mouth || !faceHeight) {
        smokeState = 'fingertip';
        nearMouth = false;
        resetInhale();
        return {
          state: 'fingertip',
          emitPos: cigTip,
          isExhale: false,
          emission: createEmission('fingertip'),
        };
      }

      const tipToMouth = dist(cigTip, mouth);
      const enterThreshold = config.nearEnterRatio * faceHeight;
      const exitThreshold = config.nearExitRatio * faceHeight;

      nearMouth = nearMouth
        ? tipToMouth <= exitThreshold
        : tipToMouth <= enterThreshold;

      if (nearMouth) {
        if (smokeState !== 'inhaling') {
          inhaleStartTime = now;
          inhaleAnchorTip = { x: cigTip.x, y: cigTip.y };
        }

        smokeState = 'inhaling';
        return {
          state: 'inhaling',
          emitPos: null,
          isExhale: false,
          emission: createEmission(null),
          tipToMouth,
          thresholds: {
            enter: enterThreshold,
            exit: exitThreshold,
          },
        };
      }

      if (smokeState === 'inhaling' && now >= cooldownUntil) {
        const inhaleDuration = now - inhaleStartTime;
        const movedFromAnchor = inhaleAnchorTip
          ? dist(cigTip, inhaleAnchorTip)
          : tipToMouth;
        const exhaleDistance = config.exhaleMinMoveRatio * faceHeight;

        if (
          inhaleDuration >= config.inhaleMinDuration &&
          tipToMouth >= exhaleDistance &&
          movedFromAnchor >= exhaleDistance * 0.6
        ) {
          smokeState = 'exhaling';
          exhaleStartTime = now;
          nearMouth = false;
          resetInhale();

          return {
            state: 'exhaling',
            emitPos: mouth,
            isExhale: true,
            emission: createEmission('exhale-burst'),
            tipToMouth,
            movedFromAnchor,
            thresholds: {
              enter: enterThreshold,
              exit: exitThreshold,
            },
          };
        }
      }

      smokeState = 'fingertip';
      resetInhale();
      return {
        state: 'fingertip',
        emitPos: cigTip,
        isExhale: false,
        emission: createEmission('fingertip'),
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
