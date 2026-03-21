(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.TrackingOverlay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HAND_POLYLINE_INDICES = [
    [0, 5, 9, 13, 17, 0],
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];

  const FACE_POLYLINE_INDICES = [
    [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
    [70, 63, 105, 66, 107],
    [336, 296, 334, 293, 300],
    [33, 160, 158, 133, 153, 144, 33],
    [362, 385, 387, 263, 373, 380, 362],
    [168, 6, 195, 5, 4, 1, 19, 94, 2, 98],
    [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
    [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  ];

  const OVERLAY_STYLE = {
    face: {
      stroke: '182, 203, 232',
      strokeAlpha: 0.24,
      pointAlpha: 0.18,
      lineWidthScale: 0.0017,
      pointRadius: 1.15,
    },
    hand: {
      idleStroke: '255, 232, 206',
      activeStroke: '255, 232, 206',
      idleStrokeAlpha: 0.28,
      activeStrokeAlpha: 0.38,
      pointAlpha: 0.24,
      lineWidthScale: 0.0022,
      pointRadius: 1.55,
    },
  };

  function mapPolyline(landmarks, indices) {
    const points = [];

    for (const index of indices) {
      const point = landmarks[index];
      if (!point || point.x == null || point.y == null) {
        return null;
      }
      points.push({ x: point.x, y: point.y });
    }

    return points;
  }

  function getHandPolylines(landmarks) {
    if (!landmarks || landmarks.length < 21) {
      return [];
    }

    return HAND_POLYLINE_INDICES
      .map((indices) => mapPolyline(landmarks, indices))
      .filter(Boolean);
  }

  function getFacePolylines(landmarks) {
    if (!landmarks || landmarks.length < 400) {
      return [];
    }

    return FACE_POLYLINE_INDICES
      .map((indices) => mapPolyline(landmarks, indices))
      .filter(Boolean);
  }

  function projectPoint(point, canvasW, canvasH, mirrored) {
    return {
      x: canvasW * (mirrored ? 1 - point.x : point.x),
      y: canvasH * point.y,
    };
  }

  function drawPolyline(ctx, canvasW, canvasH, points, mirrored) {
    if (!points || points.length < 2) return;

    const firstPoint = projectPoint(points[0], canvasW, canvasH, mirrored);
    ctx.beginPath();
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let index = 1; index < points.length; index++) {
      const point = projectPoint(points[index], canvasW, canvasH, mirrored);
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }

  function drawPoints(ctx, canvasW, canvasH, points, radius, mirrored) {
    for (const point of points) {
      const projectedPoint = projectPoint(point, canvasW, canvasH, mirrored);
      ctx.beginPath();
      ctx.arc(
        projectedPoint.x,
        projectedPoint.y,
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  const MAIN_CANVAS_STYLE = {
    face: {
      stroke: '182, 210, 255',
      strokeAlpha: 0.35,
      pointAlpha: 0.25,
      lineWidthScale: 0.0014,
      pointRadius: 1.8,
    },
    hand: {
      idleStroke: '255, 245, 230',
      activeStroke: '255, 200, 120',
      idleStrokeAlpha: 0.45,
      activeStrokeAlpha: 0.7,
      pointAlpha: 0.5,
      lineWidthScale: 0.0018,
      pointRadius: 2.5,
    },
  };

  function draw(ctx, canvasW, canvasH, options) {
    const handPolylines = getHandPolylines(options && options.handLandmarks);
    const facePolylines = getFacePolylines(options && options.faceLandmarks);
    if (!handPolylines.length && !facePolylines.length) {
      return;
    }

    const mirrored = !!(options && options.mirrored);
    const poseActive = !!(options && options.poseActive);
    const style = (options && options.mainCanvas) ? MAIN_CANVAS_STYLE : null;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (facePolylines.length) {
      const faceStyle = style ? style.face : OVERLAY_STYLE.face;
      ctx.strokeStyle = `rgba(${faceStyle.stroke}, ${faceStyle.strokeAlpha})`;
      ctx.fillStyle = `rgba(${faceStyle.stroke}, ${faceStyle.pointAlpha})`;
      ctx.lineWidth = Math.max(1.1, Math.min(canvasW, canvasH) * faceStyle.lineWidthScale);
      for (const polyline of facePolylines) {
        drawPolyline(ctx, canvasW, canvasH, polyline, mirrored);
        drawPoints(ctx, canvasW, canvasH, polyline, faceStyle.pointRadius, mirrored);
      }
    }

    if (handPolylines.length) {
      const handStyle = style ? style.hand : OVERLAY_STYLE.hand;
      const handStrokeAlpha = poseActive
        ? handStyle.activeStrokeAlpha
        : handStyle.idleStrokeAlpha;
      const handStroke = poseActive
        ? handStyle.activeStroke
        : handStyle.idleStroke;
      const pointRadius = handStyle.pointRadius;
      ctx.strokeStyle = `rgba(${handStroke}, ${handStrokeAlpha})`;
      ctx.fillStyle = `rgba(${handStroke}, ${handStyle.pointAlpha})`;
      ctx.lineWidth = Math.max(1.3, Math.min(canvasW, canvasH) * handStyle.lineWidthScale);
      for (const polyline of handPolylines) {
        drawPolyline(ctx, canvasW, canvasH, polyline, mirrored);
        drawPoints(ctx, canvasW, canvasH, polyline, pointRadius, mirrored);
      }
    }

    ctx.restore();
  }

  return {
    getHandPolylines,
    getFacePolylines,
    getOverlayStyle: function () {
      return {
        face: {
          strokeAlpha: OVERLAY_STYLE.face.strokeAlpha,
          pointAlpha: OVERLAY_STYLE.face.pointAlpha,
          pointRadius: OVERLAY_STYLE.face.pointRadius,
        },
        hand: {
          strokeAlpha: OVERLAY_STYLE.hand.activeStrokeAlpha,
          pointAlpha: OVERLAY_STYLE.hand.pointAlpha,
          pointRadius: OVERLAY_STYLE.hand.pointRadius,
        },
      };
    },
    projectPoint,
    draw,
  };
});
