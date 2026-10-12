//
// MV.js  （教材 Angel & Shreiner, Interactive Computer Graphics, 8th ed.
// 配套矩阵 / 向量工具库的子集实现，API 与教材一致）
//
// 提供 vec2 / vec3 / vec4 / mat4，以及 flatten() 与平移 / 旋转 / 缩放、
// 正交 / 透视投影、lookAt 等基本函数。所有矩阵按 WebGL 需要的列主序
// 存储（mat4 为长度 16 的数组，m[j*4+i] 表示第 i 行第 j 列元素）。
//

"use strict";

// ---------------------------------------------------------------- 基本类型

function vec2(x, y) { return [x || 0, y || 0]; }
function vec3(x, y, z) { return [x || 0, y || 0, z || 0]; }
function vec4(x, y, z, w) { return [x || 0, y || 0, z || 0, (w === undefined ? 1 : w)]; }

function mat4() {
    // 默认返回单位阵
    var m = new Array(16);
    for (var i = 0; i < 16; i++) m[i] = 0;
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
}

// ------------------------------------------------------------ 向量运算

function dot(u, v) {
    var s = 0;
    for (var i = 0; i < u.length; i++) s += u[i] * v[i];
    return s;
}

function cross(u, v) {
    return [u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0]];
}

function length_(v) {  // 教材中为 length()，避开 JS 保留字
    return Math.sqrt(dot(v, v));
}
var vlen = length_;

function normalize(v, excludeLast) {
    var n = v.length;
    if (excludeLast) n--;
    var len = 0;
    for (var i = 0; i < n; i++) len += v[i] * v[i];
    len = Math.sqrt(len);
    var out = v.slice();
    for (i = 0; i < n; i++) out[i] /= len;
    return out;
}

function scale(s, v) {
    var out = v.slice();
    for (var i = 0; i < v.length; i++) out[i] *= s;
    return out;
}

function add(u, v) {
    var out = [];
    for (var i = 0; i < u.length; i++) out.push(u[i] + v[i]);
    return out;
}

function subtract(u, v) {
    var out = [];
    for (var i = 0; i < u.length; i++) out.push(u[i] - v[i]);
    return out;
}

// ---------------------------------------------------------- 矩阵运算

/** 矩阵相乘：result = u × v（先应用 v 再应用 u，列主序）。 */
function mult(u, v) {
    var result = new Array(16).fill(0);
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            for (var k = 0; k < 4; k++) {
                result[j * 4 + i] += u[k * 4 + i] * v[j * 4 + k];
            }
        }
    }
    return result;
}

/** m 乘以点 p（p 为 vec3 / vec4），返回 vec4。 */
function multMat4Vec4(m, p) {
    var v = (p.length === 3) ? vec4(p[0], p[1], p[2], 1) : p;
    var out = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) out[i] += m[j * 4 + i] * v[j];
    }
    return out;
}

/** 平移矩阵。 */
function translate(x, y, z) {
    var m = mat4();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
}

/** 缩放矩阵（可只给统一比例）。 */
function scalem(x, y, z) {   // 教材函数名 scale 与 JS 保留字冲突，记为 scalem
    if (Array.isArray(x)) { z = x[2]; y = x[1]; x = x[0]; }
    else if (y === undefined && z === undefined) { y = z = x; }
    var m = mat4();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
}

/** 绕任意轴旋转（右手系，角度制）。angle 为度，axis 为 vec3。 */
function rotate(angle, axis) {
    var v = normalize(axis);
    var x = v[0], y = v[1], z = v[2];
    var c = Math.cos(angle * Math.PI / 180);
    var s = Math.sin(angle * Math.PI / 180);
    var omc = 1.0 - c;

    var m = new Array(16).fill(0);
    m[0]  = x * x * omc + c;
    m[1]  = y * x * omc + z * s;
    m[2]  = z * x * omc - y * s;

    m[4]  = x * y * omc - z * s;
    m[5]  = y * y * omc + c;
    m[6]  = z * y * omc + x * s;

    m[8]  = x * z * omc + y * s;
    m[9]  = y * z * omc - x * s;
    m[10] = z * z * omc + c;

    m[15] = 1;
    return m;
}

/** 绕 X / Y / Z 轴旋转。 */
function rotateX(a) { return rotate(a, [1, 0, 0]); }
function rotateY(a) { return rotate(a, [0, 1, 0]); }
function rotateZ(a) { return rotate(a, [0, 0, 1]); }

// ------------------------------------------------------ 投影与观察矩阵

/** 正交投影（对应 gl.ortho）。 */
function ortho(left, right, bottom, top, near, far) {
    var w = right - left, h = top - bottom, d = far - near;
    var m = mat4();
    m[0] = 2 / w; m[5] = 2 / h; m[10] = -2 / d;
    m[12] = -(left + right) / w;
    m[13] = -(top + bottom) / h;
    m[14] = -(near + far) / d;
    return m;
}

/** 透视投影（对应 gluPerspective / mat4.perspective）。 */
function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(radians(fovy) / 2);
    var d = far - near;
    var m = new Array(16).fill(0);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = -(near + far) / d;
    m[11] = -1;
    m[14] = -2 * near * far / d;
    return m;
}

/** 相机观察矩阵（教材 lookAt）：eye 看向 at，up 定上方。 */
function lookAt(eye, at, up) {
    var v = normalize(subtract(at, eye));   // view plane basis
    var n = normalize(cross(v, up));        // normal（侧向）
    var u = normalize(cross(n, v));         // up corrected

    var m = mat4();
    m[0] = n[0]; m[4] = n[1]; m[8]  = n[2];
    m[1] = u[0]; m[5] = u[1]; m[9]  = u[2];
    m[2] = -v[0]; m[6] = -v[1]; m[10] = -v[2];
    m[15] = 1;

    var t = translate(-eye[0], -eye[1], -eye[2]);
    return mult(m, t);
}

// -------------------------------------------------------------- 工具函数

function radians(deg) { return deg * Math.PI / 180; }

/** 把 vec2 / vec3 / vec4 / mat4 数组压平成 Float32Array（WebGL 传输用）。 */
function flatten(v, excludeLast) {
    var floats = [];
    function push(arr, n) {
        for (var i = 0; i < n; i++) floats.push(arr[i]);
    }
    if (typeof v[0] === "number") {           // 单个向量
        push(v, v.length);
    } else if (v[0].length === 16) {          // mat4 数组
        for (var i = 0; i < v.length; i++) push(v[i], 16);
    } else {                                   // 向量数组
        var n = v[0].length;
        if (excludeLast) n--;
        for (i = 0; i < v.length; i++) push(v[i], n);
    }
    return new Float32Array(floats);
}
