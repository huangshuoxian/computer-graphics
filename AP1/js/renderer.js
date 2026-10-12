//
// renderer.js —— WebGL 渲染模块
//
// 职责：着色器编译、VBO 管理、三种 2D 渲染模式（POINTS / LINES / TRIANGLES）
// 与扩展 3D 四面体预览模式的绘制，以及 2D 视口变换（平移 + 缩放）。
//
// 视图约定：2D 模式下 gl 坐标系即分形自身的"世界坐标"，
// 平移缩放通过给每个顶点施加 mat4 变换 u_view 实现（等效于相机）。
//

"use strict";

var RenderMode = { CHAOS: 0, POINTS: 1, LINES: 2, SOLID: 3, GASKET3D: 4 };
var ModeNames = ["混沌游戏 · 点云", "递归细分 · 点云", "递归细分 · 线框",
                 "递归细分 · 实体", "扩展 · 3D 四面体"];

/** 配色方案：至少 3 套，每套含 背景 / 点或线颜色 / 实体填充渐变色。 */
var ColorSchemes = [
    { name: "深邃夜空", bg: [0.05, 0.07, 0.12, 1.0], fg: [0.40, 0.80, 1.00], fillTop: [0.20, 0.55, 0.95], fillBottom: [0.65, 0.90, 1.00] },
    { name: "熔岩暖橙", bg: [0.10, 0.04, 0.03, 1.0], fg: [1.00, 0.75, 0.30], fillTop: [0.95, 0.45, 0.15], fillBottom: [1.00, 0.85, 0.40] },
    { name: "极光翠绿", bg: [0.02, 0.10, 0.08, 1.0], fg: [0.55, 1.00, 0.75], fillTop: [0.10, 0.75, 0.45], fillBottom: [0.70, 1.00, 0.80] },
    { name: "素白图纸", bg: [0.96, 0.96, 0.97, 1.0], fg: [0.15, 0.15, 0.20], fillTop: [0.55, 0.55, 0.60], fillBottom: [0.85, 0.85, 0.88] }
];

var Renderer = (function () {

    var gl, canvas;
    var program2d, program3d;
    var buffers = {};          // 顶点缓冲与段偏移
    var u = {};                // uniform / attribute 位置缓存

    // 视图状态（平移 / 缩放 / 宽高比）
    var view = { tx: 0, ty: 0, scale: 1.0, aspect: 1.0 };

    // 模型 / 动画状态（UI 模块直接读写 state）
    var state = {
        mode: RenderMode.CHAOS,
        pointCount: 5000,      // 混沌游戏 / 点云顶点数
        depth: 5,              // 递归深度（0–6）
        polygonN: 3,           // 混沌游戏多边形边数（扩展 E1）
        ratio: 0.5,            // 混沌游戏收缩比 r
        pointSize: 2.0,
        colorScheme: 0,
        growing: false,        // 逐点生长动画开关
        grownCount: 0,         // 当前已生长到的点数
        growSpeed: 3000,       // 每秒生长点数
        rotX: 15, rotY: 25     // 3D 预览旋转角
    };

    // ------------------------------------------------------------ 着色器

    var VS_2D = `#version 300 es
        in vec2 a_pos;             // 分形局部坐标
        in float a_seed;           // 顶点种子（实体模式按高度做颜色渐变）
        uniform mat4 u_view;       // 平移缩放 + 宽高比校正
        uniform float u_pointSize;
        out float v_t;
        void main() {
            gl_Position = u_view * vec4(a_pos, 0.0, 1.0);
            gl_PointSize = u_pointSize;
            v_t = a_seed;
        }`;

    var FS_2D = `#version 300 es
        precision mediump float;
        uniform vec3 u_fg;         // 点 / 线颜色
        uniform vec3 u_fillTop;    // 实体填充渐变色
        uniform vec3 u_fillBottom;
        uniform bool u_solid;      // 是否实体渐变模式
        in float v_t;
        out vec4 f_color;
        void main() {
            if (u_solid) {
                f_color = vec4(mix(u_fillBottom, u_fillTop, clamp(v_t, 0.0, 1.0)), 1.0);
            } else {
                f_color = vec4(u_fg, 1.0);
            }
        }`;

    var VS_3D = `#version 300 es
        in vec3 a_pos;             // vec3 位置，w 固定为 1
        uniform mat4 u_mvp;
        out float v_y;
        void main() {
            gl_Position = u_mvp * vec4(a_pos, 1.0);
            v_y = a_pos.y;
        }`;

    var FS_3D = `#version 300 es
        precision mediump float;
        in float v_y;
        uniform vec3 u_fillTop;
        uniform vec3 u_fillBottom;
        out vec4 f_color;
        void main() {
            float t = clamp(v_y * 0.8 + 0.5, 0.0, 1.0);
            f_color = vec4(mix(u_fillBottom, u_fillTop, t), 1.0);
        }`;

    // ------------------------------------------------------------ 初始化

    function init(canvasElem) {
        canvas = canvasElem;
        gl = setupWebGL(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);
        view.aspect = canvas.width / canvas.height;

        program2d = initShadersFromStrings(gl, VS_2D, FS_2D);
        program3d = initShadersFromStrings(gl, VS_3D, FS_3D);

        // 属性 / uniform 位置
        u.pos2d      = gl.getAttribLocation(program2d, "a_pos");
        u.seed2d     = gl.getAttribLocation(program2d, "a_seed");
        u.view       = gl.getUniformLocation(program2d, "u_view");
        u.pointSize  = gl.getUniformLocation(program2d, "u_pointSize");
        u.fg         = gl.getUniformLocation(program2d, "u_fg");
        u.fillTop    = gl.getUniformLocation(program2d, "u_fillTop");
        u.fillBottom = gl.getUniformLocation(program2d, "u_fillBottom");
        u.solid      = gl.getUniformLocation(program2d, "u_solid");

        u.pos3d      = gl.getAttribLocation(program3d, "a_pos");
        u.mvp        = gl.getUniformLocation(program3d, "u_mvp");
        u.fillTop3   = gl.getUniformLocation(program3d, "u_fillTop");
        u.fillBottom3= gl.getUniformLocation(program3d, "u_fillBottom");

        buffers.chaos    = gl.createBuffer();
        buffers.recur    = gl.createBuffer();
        buffers.seed     = gl.createBuffer();
        buffers.gasket3d = gl.createBuffer();

        rebuild();
    }

    // ------------------------------------------------------- 数据重建

    /** 按当前参数重新生成顶点数据并上传 VBO。 */
    function rebuild() {
        // 1) 混沌游戏点云
        var chaos = Geometry.chaosGame(state.pointCount, state.polygonN, state.ratio);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.chaos);
        gl.bufferData(gl.ARRAY_BUFFER, chaos, gl.STATIC_DRAW);

        // 2) 递归细分三种数据，打包进同一缓冲的不同段
        var rec = Geometry.gasketRecursive(state.depth);
        var packed = new Float32Array(rec.pointsVerts.length +
                                      rec.lineVerts.length +
                                      rec.solidVerts.length);
        packed.set(rec.pointsVerts, 0);
        packed.set(rec.lineVerts, rec.pointsVerts.length);
        packed.set(rec.solidVerts, rec.pointsVerts.length + rec.lineVerts.length);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.recur);
        gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);

        buffers.recOff = {
            points: { off: 0,                              count: rec.pointsVerts.length / 2 },
            lines:  { off: rec.pointsVerts.length,         count: rec.lineVerts.length / 2 },
            solid:  { off: rec.pointsVerts.length + rec.lineVerts.length,
                      count: rec.solidVerts.length / 2 }
        };
        buffers.recTriCount = rec.triCount;

        // 实体模式的种子：每个三角形 3 个顶点，按 y 坐标从 0→1 渐变
        var seg = buffers.recOff.solid;
        var seeds = new Float32Array(seg.count);
        for (var i = 0; i < seg.count; i += 3) {
            seeds[i] = 0.0; seeds[i + 1] = 0.5; seeds[i + 2] = 1.0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.seed);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

        // 3) 3D 四面体 gasket（深度与 2D 联动，封顶 4 层防顶点过多）
        var g3 = Geometry.tetraGasket(Math.min(state.depth, 4));
        buffers.gasket3dCount = g3.length / 3;   // vec3 顶点
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.gasket3d);
        gl.bufferData(gl.ARRAY_BUFFER, g3, gl.STATIC_DRAW);

        state.grownCount = 0;    // 参数变化时生长动画重新开始
    }

    // ----------------------------------------------------------- 视图矩阵

    /** 手工组合视图 mat4：先缩放（y 轴乘宽高比做等比校正），再平移。 */
    function viewMatrix() {
        return mult(translate(view.tx, view.ty, 0),
                    scalem(view.scale, view.scale * view.aspect, 1));
    }

    // ------------------------------------------------------------- 绘制

    function clearWith(scheme) {
        gl.clearColor(scheme.bg[0], scheme.bg[1], scheme.bg[2], scheme.bg[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    function set2DUniforms(scheme) {
        gl.uniformMatrix4fv(u.view, false, viewMatrix());
        gl.uniform1f(u.pointSize, state.pointSize);
        gl.uniform3fv(u.fg, scheme.fg);
        gl.uniform3fv(u.fillTop, scheme.fillTop);
        gl.uniform3fv(u.fillBottom, scheme.fillBottom);
    }

    function draw2D() {
        gl.useProgram(program2d);
        gl.disable(gl.DEPTH_TEST);
        var scheme = ColorSchemes[state.colorScheme];
        set2DUniforms(scheme);
        gl.enableVertexAttribArray(u.pos2d);

        if (state.mode === RenderMode.CHAOS) {
            gl.uniform1i(u.solid, 0);
            gl.disableVertexAttribArray(u.seed2d);   // 默认 0，不使用渐变
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.chaos);
            gl.vertexAttribPointer(u.pos2d, 2, gl.FLOAT, false, 0, 0);
            var count = state.growing ? Math.min(state.grownCount, state.pointCount)
                                      : state.pointCount;
            gl.drawArrays(gl.POINTS, 0, count);
        } else {
            // 递归细分：三种模式共用 buffers.recur 的不同段
            var seg, prim, solid;
            if (state.mode === RenderMode.POINTS) {
                seg = buffers.recOff.points; prim = gl.POINTS;   solid = 0;
            } else if (state.mode === RenderMode.LINES) {
                seg = buffers.recOff.lines;  prim = gl.LINES;    solid = 0;
            } else {
                seg = buffers.recOff.solid;  prim = gl.TRIANGLES; solid = 1;
            }
            gl.uniform1i(u.solid, solid);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.recur);
            gl.vertexAttribPointer(u.pos2d, 2, gl.FLOAT, false, 0, seg.off * 4);
            if (solid) {
                gl.enableVertexAttribArray(u.seed2d);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffers.seed);
                gl.vertexAttribPointer(u.seed2d, 1, gl.FLOAT, false, 0, 0);
            } else {
                gl.disableVertexAttribArray(u.seed2d);
            }
            gl.drawArrays(prim, 0, seg.count);
        }
    }

    function draw3D() {
        gl.useProgram(program3d);
        gl.enable(gl.DEPTH_TEST);
        var scheme = ColorSchemes[state.colorScheme];

        // MVP 手工组合：透视投影 × 平移退后 × rotY × rotX
        var proj = perspective(45, view.aspect, 0.1, 100);
        var model = mult(rotateY(state.rotY), rotateX(state.rotX));
        var mvp = mult(proj, mult(translate(0, 0, -3), model));

        gl.uniformMatrix4fv(u.mvp, false, mvp);
        gl.uniform3fv(u.fillTop3, scheme.fillTop);
        gl.uniform3fv(u.fillBottom3, scheme.fillBottom);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.gasket3d);
        gl.enableVertexAttribArray(u.pos3d);
        gl.vertexAttribPointer(u.pos3d, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, buffers.gasket3dCount);
    }

    function render() {
        clearWith(ColorSchemes[state.colorScheme]);
        if (state.mode === RenderMode.GASKET3D) draw3D();
        else draw2D();
    }

    // 公开接口
    return {
        init: init,
        render: render,
        rebuild: rebuild,
        state: state,
        view: view,
        ModeNames: ModeNames,
        recTriCount: function () { return buffers.recTriCount || 0; }
    };
})();
