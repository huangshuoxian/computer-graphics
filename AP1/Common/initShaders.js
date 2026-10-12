//
// initShaders.js
// 教材（Angel & Shreiner, Interactive Computer Graphics, 8th ed.）配套
// 着色器加载工具：从页面中的 <script type="x-shader/x-vertex|x-fragment">
// 标签读取 GLSL 源码并编译 / 链接成 program 对象。
//
// 用法：
//    var program = initShaders(gl, "vertex-shader", "fragment-shader");
//

"use strict";

/** 从字符串源码构建 program（8th ed. 同名的辅助入口）。 */
function initShadersFromStrings(gl, vShaderSrc, fShaderSrc) {
    function compile(type, src) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            var log = gl.getShaderInfoLog(sh);
            alert("Shader compile error:\n" + log);
            throw new Error("Shader compile error: " + log);
        }
        return sh;
    }

    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vShaderSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fShaderSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var log = gl.getProgramInfoLog(program);
        alert("Program link error:\n" + log);
        throw new Error("Program link error: " + log);
    }
    return program;
}

/** 从页面中的 script 标签读取并构建 program（教材标准入口）。 */
function initShaders(gl, vertexShaderId, fragmentShaderId) {
    var vertElem = document.getElementById(vertexShaderId);
    var fragElem = document.getElementById(fragmentShaderId);
    if (!vertElem || !fragElem) {
        alert("initShaders: 找不到着色器 script 标签 " +
              vertexShaderId + " / " + fragmentShaderId);
        throw new Error("missing shader script element");
    }
    return initShadersFromStrings(gl, vertElem.textContent,
                                       fragElem.textContent);
}
