//
// interaction.js —— 鼠标与键盘交互模块
//
// 鼠标：左键拖动平移（mousedown / mousemove / mouseup），滚轮缩放（wheel）。
// 键盘：1/2/3 切换渲染模式（0/4 为扩展模式），空格 暂停/继续逐点生长动画，
//       r 复位视图，3D 模式下方向键旋转。
//

"use strict";

var Interaction = (function () {

    var dragging = false;
    var lastX = 0, lastY = 0;

    /** canvas 像素 → gl 设备坐标（-1..1，y 向上）。 */
    function toDevice(canvas, clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        return {
            x:  ((clientX - rect.left) / rect.width)  * 2 - 1,
            y: -(((clientY - rect.top) / rect.height) * 2 - 1)
        };
    }

    function init(canvas) {
        var view = Renderer.view;
        var state = Renderer.state;

        // ---------------- 鼠标：左键拖动平移 ----------------
        canvas.addEventListener("mousedown", function (e) {
            if (e.button !== 0) return;
            dragging = true;
            var p = toDevice(canvas, e.clientX, e.clientY);
            lastX = p.x; lastY = p.y;
            canvas.style.cursor = "grabbing";
        });

        window.addEventListener("mousemove", function (e) {
            if (!dragging) return;
            var p = toDevice(canvas, e.clientX, e.clientY);
            // 设备坐标差 ÷ 当前缩放 = 世界坐标平移量
            view.tx += (p.x - lastX) / view.scale;
            view.ty += (p.y - lastY) / (view.scale * view.aspect);
            lastX = p.x; lastY = p.y;
        });

        window.addEventListener("mouseup", function () {
            dragging = false;
            canvas.style.cursor = "grab";
        });

        // ---------------- 滚轮缩放（以光标为中心） ----------------
        canvas.addEventListener("wheel", function (e) {
            e.preventDefault();
            var p = toDevice(canvas, e.clientX, e.clientY);
            var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            var ns = Math.min(50, Math.max(0.05, view.scale * factor));
            // 保持光标下的世界点不动：
            // 新平移 = 光标点 - (光标点 - 旧平移) * 新旧缩放比
            var k = ns / view.scale;
            view.tx = p.x - (p.x - view.tx) * k;
            view.ty = p.y - (p.y - view.ty) * k;
            view.scale = ns;
        }, { passive: false });

        canvas.style.cursor = "grab";

        // ---------------- 键盘 ----------------
        window.addEventListener("keydown", function (e) {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
            switch (e.key) {
                case "1": UI.setMode(RenderMode.CHAOS);  break;
                case "2": UI.setMode(RenderMode.POINTS); break;
                case "3": UI.setMode(RenderMode.LINES);  break;
                case "4": UI.setMode(RenderMode.SOLID);  break;
                case "5": UI.setMode(RenderMode.GASKET3D); break;
                case " ":                                   // 空格：暂停/继续生长
                    e.preventDefault();
                    UI.toggleGrowing();
                    break;
                case "r": case "R":                          // r：复位视图
                    view.tx = 0; view.ty = 0; view.scale = 1.0;
                    state.rotX = 15; state.rotY = 25;
                    break;
                case "ArrowLeft":  state.rotY -= 5; break;   // 3D 旋转
                case "ArrowRight": state.rotY += 5; break;
                case "ArrowUp":    state.rotX -= 5; break;
                case "ArrowDown":  state.rotX += 5; break;
            }
        });
    }

    return { init: init };
})();
