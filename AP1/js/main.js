//
// main.js —— 程序入口：装配各模块并驱动渲染循环。
//
// 最小图形程序结构（教材 Ch2 思想）：
//   应用程序（main.js / ui.js / interaction.js）
//     → 顶点数据（geometry.js，Float32Array）
//     → VBO（renderer.js，gl.bufferData）
//     → 渲染（requestAnimationFrame 驱动 render）
//

"use strict";

window.onload = function () {
    var canvas = document.getElementById("gl-canvas");
    Renderer.init(canvas);
    UI.init();
    Interaction.init(canvas);

    var lastTime = performance.now();

    function frame(now) {
        var dt = (now - lastTime) / 1000;
        lastTime = now;

        // 逐点生长动画：点数随时间增长，空格可暂停
        var state = Renderer.state;
        if (state.growing) {
            state.grownCount += state.growSpeed * dt;
            if (state.grownCount >= state.pointCount) {
                state.grownCount = state.pointCount;   // 长满后停住
            }
        }

        // 3D 预览自动缓慢旋转
        if (state.mode === RenderMode.GASKET3D) {
            state.rotY += 30 * dt;
        }

        Renderer.render();
        UI.update();
        requestAnimFrame(frame);
    }

    requestAnimFrame(frame);
};
