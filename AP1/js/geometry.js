//
// geometry.js —— 几何生成模块（纯计算，不涉及 WebGL）
//
// 本模块负责"算法 → 顶点数据"：
//   1. 混沌游戏（chaos game）：随机初始点，反复取 p = (p + 随机顶点) / 2，
//      生成 Sierpinski 垫片（三角形）或任意 n 边形垫片。
//   2. 递归细分（recursive subdivision）：subdivide(triangle, depth)
//      生成垫片的三角形集合 / 顶点集合。
//   3. 扩展 E3：三维四面体 gasket（Gasket3D），供 3D 预览模式使用。
//
// 所有生成结果统一为 { positions: Float32Array, ... }，由 renderer 上传 GPU。
//

"use strict";

var Geometry = (function () {

    // ------------------------------------------------------------ 工具

    /** 生成以 (0,0) 为中心的 n 边形顶点（逆时针，第 0 个顶点朝正上方）。 */
    function regularPolygon(n, radius, center) {
        var cx = center ? center[0] : 0;
        var cy = center ? center[1] : 0;
        var verts = [];
        for (var i = 0; i < n; i++) {
            var angle = Math.PI / 2 + i * 2 * Math.PI / n;  // 从正上方开始
            verts.push([cx + radius * Math.cos(angle),
                        cy + radius * Math.sin(angle)]);
        }
        return verts;
    }

    /** 两点的中点。 */
    function midpoint(a, b) {
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    // ------------------------------------------------------- 混沌游戏

    /**
     * 混沌游戏生成垫片点云。
     *   opts.polygonN : 多边形边数（3 = 经典 Sierpinski 垫片，5/6 为扩展）
     *   opts.count    : 顶点个数
     *   opts.ratio    : 收缩比例 r，p = (1-r)*p + r*vertex，教材取 0.5
     * 返回 Float32Array（x0,y0, x1,y1, ...）。
     */
    function chaosGame(count, polygonN, ratio) {
        var n = polygonN || 3;
        var r = (ratio === undefined) ? 0.5 : ratio;
        var verts = regularPolygon(n, 0.8);

        // 初始点随机（多边形内部）
        var p = verts[Math.floor(Math.random() * n)].slice();
        p[0] += (Math.random() - 0.5) * 0.3;
        p[1] += (Math.random() - 0.5) * 0.3;

        var out = new Float32Array(count * 2);
        for (var i = 0; i < count; i++) {
            var v = verts[Math.floor(Math.random() * n)];
            p[0] = (1 - r) * p[0] + r * v[0];
            p[1] = (1 - r) * p[1] + r * v[1];
            out[i * 2]     = p[0];
            out[i * 2 + 1] = p[1];
        }
        return out;
    }

    // ------------------------------------------------------- 递归细分

    /**
     * subdivide(triangle, depth)：把 triangle = [a, b, c]（三个二维点）
     * 递归细分为 depth 层的 Sierpinski 垫片，返回叶子三角形数组。
     * depth = 0 时返回 [triangle] 自身。
     */
    function subdivide(triangle, depth) {
        if (depth <= 0) return [triangle];
        var a = triangle[0], b = triangle[1], c = triangle[2];
        var ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        // 三个角上的小三角形继续细分（中间倒置三角形丢弃）
        return subdivide([a, ab, ca], depth - 1)
            .concat(subdivide([b, bc, ab], depth - 1))
            .concat(subdivide([c, ca, bc], depth - 1));
    }

    /** 初始大三角形（等边，朝上，居中）。 */
    function baseTriangle() {
        return [[0, 0.8], [-0.8 * Math.cos(Math.PI / 6), -0.4],
                [0.8 * Math.cos(Math.PI / 6), -0.4]];
    }

    /**
     * 递归细分垫片 → 顶点数据。
     * 返回：
     *   pointsVerts : Float32Array  所有三角形的顶点（用于 gl.POINTS）
     *   lineVerts   : Float32Array  每个三角形 3 条边，每边 2 点（gl.LINES）
     *   solidVerts  : Float32Array  三角形顶点本身（gl.TRIANGLES）
     * depth 最大 6 → 3^6 = 729 个叶子三角形。
     */
    function gasketRecursive(depth) {
        var tris = subdivide(baseTriangle(), depth);
        var nv = tris.length * 3;

        var pointsVerts = new Float32Array(nv * 2);
        var lineVerts   = new Float32Array(nv * 2 * 2);  // 3 边 × 2 点
        var solidVerts  = new Float32Array(nv * 2);

        for (var t = 0; t < tris.length; t++) {
            var tri = tris[t];
            for (var k = 0; k < 3; k++) {
                pointsVerts[(t * 3 + k) * 2]     = tri[k][0];
                pointsVerts[(t * 3 + k) * 2 + 1] = tri[k][1];
                solidVerts[(t * 3 + k) * 2]      = tri[k][0];
                solidVerts[(t * 3 + k) * 2 + 1]  = tri[k][1];
            }
            // 边：0-1, 1-2, 2-0
            var edges = [[0, 1], [1, 2], [2, 0]];
            for (var e = 0; e < 3; e++) {
                var base = (t * 6 + e * 2) * 2;
                var p0 = tri[edges[e][0]], p1 = tri[edges[e][1]];
                lineVerts[base]     = p0[0]; lineVerts[base + 1] = p0[1];
                lineVerts[base + 2] = p1[0]; lineVerts[base + 3] = p1[1];
            }
        }
        return { pointsVerts: pointsVerts, lineVerts: lineVerts,
                 solidVerts: solidVerts, triCount: tris.length };
    }

    // -------------------------------------------- 扩展 E3：四面体 gasket

    /** 三维 Sierpinski gasket：对四面体做 midpoint 细分（教材 gasket 程序思想）。 */
    function tetraGasket(depth) {
        // 初始四面体四个顶点
        var a = [ 0.0,  0.6,  0.0];
        var b = [-0.5, -0.3,  0.5];
        var c = [ 0.5, -0.3,  0.5];
        var d = [ 0.0, -0.3, -0.6];

        function mid3(p, q) {
            return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        }

        // 返回叶子四面体数组 [[a,b,c,d], ...]
        function divide(a, b, c, d, k) {
            if (k === 0) return [[a, b, c, d]];
            var ab = mid3(a, b), ac = mid3(a, c), ad = mid3(a, d),
                bc = mid3(b, c), bd = mid3(b, d), cd = mid3(c, d);
            return divide(a, ab, ac, ad, k - 1)
                .concat(divide(ab, b, bc, bd, k - 1))
                .concat(divide(ac, bc, c, cd, k - 1))
                .concat(divide(ad, bd, cd, d, k - 1));
        }

        var tetras = divide(a, b, c, d, depth);
        var out = [];
        // 每个四面体 4 个三角形面，按 CCW 排列（供面绘制）
        var faces = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
        for (var i = 0; i < tetras.length; i++) {
            for (var f = 0; f < 4; f++) {
                out.push(tetras[i][faces[f][0]]);
                out.push(tetras[i][faces[f][1]]);
                out.push(tetras[i][faces[f][2]]);
            }
        }
        return flatten(out);   // 使用 MV.js 的 flatten
    }

    // ------------------------------------------------------------- 导出

    return {
        regularPolygon: regularPolygon,
        chaosGame: chaosGame,
        subdivide: subdivide,
        baseTriangle: baseTriangle,
        gasketRecursive: gasketRecursive,
        tetraGasket: tetraGasket
    };
})();
