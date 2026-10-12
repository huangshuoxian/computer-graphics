//
// ui.js —— 参数面板模块（纯 HTML 控件）
//
// 控件：渲染模式、顶点数 / 递归深度、点大小、配色方案、
//       混沌游戏多边形边数与收缩比（扩展 E1）、生长动画控制。
// UI 只读写 Renderer.state 并调用 Renderer.rebuild()，不直接接触 WebGL。
//

"use strict";

var UI = (function () {

    var els = {};

    function $(id) { return document.getElementById(id); }

    /** 面板初始化：绑定控件事件并同步初始状态。 */
    function init() {
        els.mode      = $("ctl-mode");
        els.count     = $("ctl-count");
        els.countVal  = $("ctl-count-val");
        els.depth     = $("ctl-depth");
        els.depthVal  = $("ctl-depth-val");
        els.size      = $("ctl-size");
        els.sizeVal   = $("ctl-size-val");
        els.scheme    = $("ctl-scheme");
        els.polygonN  = $("ctl-polygon");
        els.ratio     = $("ctl-ratio");
        els.ratioVal  = $("ctl-ratio-val");
        els.grow      = $("ctl-grow");
        els.growState = $("grow-state");
        els.triCount  = $("tri-count");
        els.modeLabel = $("mode-label");

        var state = Renderer.state;

        // 渲染模式
        els.mode.addEventListener("change", function () {
            setMode(parseInt(els.mode.value, 10));
        });

        // 顶点数（混沌游戏 / 点云）
        els.count.addEventListener("input", function () {
            state.pointCount = parseInt(els.count.value, 10);
            els.countVal.textContent = state.pointCount;
            Renderer.rebuild();
        });

        // 递归深度
        els.depth.addEventListener("input", function () {
            state.depth = parseInt(els.depth.value, 10);
            els.depthVal.textContent = state.depth;
            Renderer.rebuild();
            updateTriCount();
        });

        // 点大小
        els.size.addEventListener("input", function () {
            state.pointSize = parseFloat(els.size.value);
            els.sizeVal.textContent = state.pointSize.toFixed(1);
        });

        // 配色方案
        els.scheme.addEventListener("change", function () {
            state.colorScheme = parseInt(els.scheme.value, 10);
        });

        // 混沌游戏多边形边数（扩展 E1）
        // 经验：n = 3 时经典值 r = 0.5；n ≥ 4 时 r ≈ 0.55–0.62 才有清晰结构，
        // 故切换边数时自动给出推荐收缩比（仍可手动调节观察差异）。
        els.polygonN.addEventListener("change", function () {
            state.polygonN = parseInt(els.polygonN.value, 10);
            var rec = { 3: 0.50, 4: 0.55, 5: 0.62, 6: 0.60, 8: 0.65 }[state.polygonN] || 0.60;
            state.ratio = rec;
            els.ratio.value = String(rec);
            els.ratioVal.textContent = rec.toFixed(2);
            Renderer.rebuild();
        });

        // 混沌游戏收缩比
        els.ratio.addEventListener("input", function () {
            state.ratio = parseFloat(els.ratio.value);
            els.ratioVal.textContent = state.ratio.toFixed(2);
            Renderer.rebuild();
        });

        // 逐点生长动画按钮
        els.grow.addEventListener("click", toggleGrowing);

        updateTriCount();
        syncModeLabel();
    }

    /** 切换渲染模式（键盘快捷键也调用此入口，保证面板同步）。 */
    function setMode(m) {
        Renderer.state.mode = m;
        els.mode.value = String(m);
        syncModeLabel();
    }

    /** 空格 / 按钮：暂停、继续生长动画。 */
    function toggleGrowing() {
        var state = Renderer.state;
        state.growing = !state.growing;
        if (state.growing && state.grownCount >= state.pointCount) {
            state.grownCount = 0;            // 长满了再按空格 → 重新生长
        }
        els.grow.textContent = state.growing ? "⏸ 暂停生长" : "▶ 开始生长";
        els.growState.textContent = state.growing ? "生长中" : "已暂停";
    }

    function updateTriCount() {
        var n = Renderer.recTriCount();
        els.triCount.textContent = "叶子三角形：" + n + "（顶点 " + n * 3 + "）";
    }

    function syncModeLabel() {
        els.modeLabel.textContent = "当前模式：" + Renderer.ModeNames[Renderer.state.mode];
    }

    /** 每帧刷新（生长动画状态文本等）。 */
    function update() {
        var state = Renderer.state;
        if (state.growing) {
            els.growState.textContent =
                "生长中 " + Math.min(Math.floor(state.grownCount), state.pointCount) +
                " / " + state.pointCount;
        }
    }

    return { init: init, setMode: setMode, toggleGrowing: toggleGrowing, update: update };
})();
