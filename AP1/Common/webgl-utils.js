//
// webgl-utils.js
// 教材配套 WebGL 上下文获取工具（8th ed. 简化版）。
// setupWebGL(canvas[, options]) 返回 WebGL 2.0 上下文，失败时弹窗提示。
//

"use strict";

window.requestAnimFrame = window.requestAnimationFrame ||
                          window.webkitRequestAnimationFrame ||
                          window.mozRequestAnimationFrame ||
                          function (callback) { setTimeout(callback, 1000 / 60); };

function setupWebGL(canvas, opts) {
    var options = opts || { alpha: false, depth: true };
    var gl = canvas.getContext("webgl2", options);
    if (!gl) {
        alert("WebGL 2.0 is not available in this browser!");
        throw new Error("WebGL 2.0 unavailable");
    }
    return gl;
}
