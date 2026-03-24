(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.TrackingSmoother = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function createPositionSmoother(options) {
    var alpha = (options && options.alpha) || 0.4;
    var deadzone = (options && options.deadzone) || 0;
    var prev = null;

    function update(pos) {
      if (!prev) {
        prev = { x: pos.x, y: pos.y };
        if (typeof pos.z === 'number') prev.z = pos.z;
        var result = { x: prev.x, y: prev.y };
        if (typeof prev.z === 'number') result.z = prev.z;
        return result;
      }

      var dx = pos.x - prev.x;
      var dy = pos.y - prev.y;
      var dz = typeof pos.z === 'number' && typeof prev.z === 'number' ? pos.z - prev.z : 0;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (deadzone > 0 && dist < deadzone) {
        var result = { x: prev.x, y: prev.y };
        if (typeof prev.z === 'number') result.z = prev.z;
        return result;
      }

      prev.x = prev.x + dx * alpha;
      prev.y = prev.y + dy * alpha;
      if (typeof pos.z === 'number') {
        if (typeof prev.z !== 'number') prev.z = pos.z;
        else prev.z = prev.z + dz * alpha;
      }

      var result = { x: prev.x, y: prev.y };
      if (typeof prev.z === 'number') result.z = prev.z;
      return result;
    }

    function reset() {
      prev = null;
    }

    return { update: update, reset: reset };
  }

  function createVelocityPredictor(options) {
    var maxPredictMs = (options && options.maxPredictMs) || 120;
    var velocityAlpha = (options && options.velocityAlpha) || 0.5;
    var lastPos = null;
    var lastTime = null;
    var velocity = null;

    function feed(pos, timestampMs) {
      if (lastPos !== null && lastTime !== null) {
        var dt = timestampMs - lastTime;
        if (dt > 0) {
          var rawVx = (pos.x - lastPos.x) / dt;
          var rawVy = (pos.y - lastPos.y) / dt;
          if (velocity === null) {
            velocity = { x: rawVx, y: rawVy };
          } else {
            velocity.x = velocity.x + (rawVx - velocity.x) * velocityAlpha;
            velocity.y = velocity.y + (rawVy - velocity.y) * velocityAlpha;
          }
        }
      }
      lastPos = { x: pos.x, y: pos.y };
      lastTime = timestampMs;
    }

    function predict(timestampMs) {
      if (!lastPos || !velocity || lastTime === null) return null;
      var elapsed = timestampMs - lastTime;
      if (elapsed > maxPredictMs) return null;
      return {
        x: lastPos.x + velocity.x * elapsed,
        y: lastPos.y + velocity.y * elapsed,
      };
    }

    function reset() {
      lastPos = null;
      lastTime = null;
      velocity = null;
    }

    return { feed: feed, predict: predict, reset: reset };
  }

  return {
    createPositionSmoother: createPositionSmoother,
    createVelocityPredictor: createVelocityPredictor,
  };
});
