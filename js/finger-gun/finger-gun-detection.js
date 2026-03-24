(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.FingerGunDetection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const INDEX_TIP = 8;
  const INDEX_PIP = 6;
  const INDEX_MCP = 5;
  const MIDDLE_TIP = 12;
  const MIDDLE_PIP = 10;
  const MIDDLE_MCP = 9;
  const FOLDED_PAIRS = [
    [16, 14],
    [20, 18],
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function distance2D(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distance3D(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function dot3D(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function normalize3D(v) {
    var length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  }

  function fingerDirection3D(landmarks, mcpIndex, tipIndex) {
    return normalize3D({
      x: landmarks[tipIndex].x - landmarks[mcpIndex].x,
      y: landmarks[tipIndex].y - landmarks[mcpIndex].y,
      z: (landmarks[tipIndex].z || 0) - (landmarks[mcpIndex].z || 0)
    });
  }

  function isFingerExtended(landmarks, mcpIndex, pipIndex, tipIndex) {
    var mcp = landmarks[mcpIndex];
    var pip = landmarks[pipIndex];
    var tip = landmarks[tipIndex];
    return distance3D(mcp, tip) > distance3D(mcp, pip) + 0.05;
  }

  function isFingerFolded(landmarks, mcpIndex, pipIndex, tipIndex) {
    var mcp = landmarks[mcpIndex];
    var pip = landmarks[pipIndex];
    var tip = landmarks[tipIndex];
    return (
      distance2D(mcp, tip) < distance2D(mcp, pip) * 1.18 ||
      tip.y > pip.y + 0.02
    );
  }

  function isValidLandmarks(landmarks) {
    return Array.isArray(landmarks) && landmarks.length >= 21;
  }

  function isFingerGunPose(landmarks) {
    if (!isValidLandmarks(landmarks)) return false;

    var indexExtended = isFingerExtended(landmarks, INDEX_MCP, INDEX_PIP, INDEX_TIP);
    var middleExtended = isFingerExtended(landmarks, MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP);
    var supportFolded = FOLDED_PAIRS.every(function (pair) {
      return isFingerFolded(landmarks, pair[1] - 1, pair[1], pair[0]);
    });
    var indexDir = fingerDirection3D(landmarks, INDEX_MCP, INDEX_TIP);
    var middleDir = fingerDirection3D(landmarks, MIDDLE_MCP, MIDDLE_TIP);
    var parallelBarrel = dot3D(indexDir, middleDir) > 0.9;

    return indexExtended && middleExtended && supportFolded && parallelBarrel;
  }

  function getBarrelDirection(landmarks) {
    var baseX = (landmarks[INDEX_MCP].x + landmarks[MIDDLE_MCP].x) / 2;
    var baseY = (landmarks[INDEX_MCP].y + landmarks[MIDDLE_MCP].y) / 2;
    var tipX = (landmarks[INDEX_TIP].x + landmarks[MIDDLE_TIP].x) / 2;
    var tipY = (landmarks[INDEX_TIP].y + landmarks[MIDDLE_TIP].y) / 2;
    var tipZ = ((landmarks[INDEX_TIP].z || 0) + (landmarks[MIDDLE_TIP].z || 0)) / 2;
    var baseZ = ((landmarks[INDEX_MCP].z || 0) + (landmarks[MIDDLE_MCP].z || 0)) / 2;
    var dir3D = normalize3D({
      x: tipX - baseX,
      y: tipY - baseY,
      z: tipZ - baseZ
    });
    var planarLength = Math.sqrt(dir3D.x * dir3D.x + dir3D.y * dir3D.y);
    return {
      x: planarLength > 0.001 ? dir3D.x / planarLength : 0,
      y: planarLength > 0.001 ? dir3D.y / planarLength : 0,
      z: dir3D.z,
      planarLength: planarLength,
      baseX: baseX,
      baseY: baseY,
      tipX: tipX,
      tipY: tipY,
      tipZ: tipZ
    };
  }

  function getAimPoint(landmarks) {
    var barrel = getBarrelDirection(landmarks);
    var extend = barrel.planarLength < 0.12 ? 0 : 0.28;
    return {
      x: clamp(barrel.tipX + barrel.x * extend, 0, 1),
      y: clamp(barrel.tipY + barrel.y * extend, 0, 1)
    };
  }

  function createManualFireController(cooldownMs, liftThreshold) {
    var lastShotTime = -Infinity;
    var prevDirection = null;
    var accumulatedLift = 0;
    var consecutiveLiftFrames = 0;
    var minLiftStep = liftThreshold * 0.35;

    return {
      update(active, direction, now) {
        if (!active) {
          prevDirection = null;
          accumulatedLift = 0;
          consecutiveLiftFrames = 0;
          return false;
        }

        if (!direction) {
          prevDirection = null;
          accumulatedLift = 0;
          consecutiveLiftFrames = 0;
          return false;
        }

        if (!prevDirection) {
          prevDirection = { x: direction.x, y: direction.y };
          accumulatedLift = 0;
          consecutiveLiftFrames = 0;
          return false;
        }

        var liftDelta = prevDirection.y - direction.y;

        if (liftDelta >= minLiftStep) {
          accumulatedLift += liftDelta;
          consecutiveLiftFrames += 1;
        } else if (liftDelta <= -minLiftStep * 0.8) {
          accumulatedLift = 0;
          consecutiveLiftFrames = 0;
        } else {
          accumulatedLift = Math.max(0, accumulatedLift * 0.4);
          consecutiveLiftFrames = 0;
        }

        prevDirection = { x: direction.x, y: direction.y };

        if (
          consecutiveLiftFrames >= 2 &&
          accumulatedLift >= liftThreshold &&
          now - lastShotTime >= cooldownMs
        ) {
          lastShotTime = now;
          accumulatedLift = 0;
          consecutiveLiftFrames = 0;
          return true;
        }

        return false;
      }
    };
  }

  function createVectorSmoother(alpha, deadzone) {
    var prev = null;
    var epsilon = typeof deadzone === 'number' ? deadzone : 0;

    return {
      update(vector) {
        if (!vector) {
          prev = null;
          return null;
        }

        if (!prev) {
          prev = { x: vector.x, y: vector.y };
          return { x: prev.x, y: prev.y };
        }

        if (
          Math.abs(vector.x - prev.x) <= epsilon &&
          Math.abs(vector.y - prev.y) <= epsilon
        ) {
          return { x: prev.x, y: prev.y };
        }

        prev = {
          x: prev.x + (vector.x - prev.x) * alpha,
          y: prev.y + (vector.y - prev.y) * alpha
        };

        return { x: prev.x, y: prev.y };
      },

      reset() {
        prev = null;
      }
    };
  }

  return {
    isValidLandmarks: isValidLandmarks,
    isFingerGunPose: isFingerGunPose,
    getBarrelDirection: getBarrelDirection,
    getAimPoint: getAimPoint,
    createManualFireController: createManualFireController,
    createVectorSmoother: createVectorSmoother
  };
});
