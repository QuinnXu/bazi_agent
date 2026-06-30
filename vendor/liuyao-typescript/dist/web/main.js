import "../web/styles.css";
import { castDivination, createDateTimeOffset, getFourSymbolOptions, getHexagramOptions, runSelfCheck, toDivinationView } from "../interaction.js";
let mode = "symbols";
const symbolLines = byId("symbol-lines");
const status = byId("status");
initSymbolInputs();
initHexagramInputs();
bindModeTabs();
byId("cast").addEventListener("click", render);
byId("self-check").addEventListener("click", renderSelfCheck);
render();
function initSymbolInputs() {
    const options = getFourSymbolOptions();
    const names = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
    symbolLines.innerHTML = names.map((name, index) => `
    <label class="symbol-field">
      <span>${name}</span>
      <select id="symbol-${index}">
        ${options.map((option) => `<option value="${option.value}" ${option.value === 7 ? "selected" : ""}>${option.label}</option>`).join("")}
      </select>
    </label>
  `).join("");
}
function initHexagramInputs() {
    const options = getHexagramOptions();
    byId("original-hexagram").innerHTML = options
        .map((option) => `<option value="${option.value}" ${option.value === 63 ? "selected" : ""}>${option.label}</option>`)
        .join("");
    byId("changed-hexagram").innerHTML = [
        `<option value="">无变卦</option>`,
        ...options.map((option) => `<option value="${option.value}">${option.label}</option>`)
    ].join("");
}
function bindModeTabs() {
    for (const tab of document.querySelectorAll(".tab")) {
        tab.addEventListener("click", () => {
            mode = tab.dataset.mode;
            for (const item of document.querySelectorAll(".tab")) {
                item.classList.toggle("active", item === tab);
            }
            for (const panel of document.querySelectorAll(".mode-panel")) {
                panel.classList.toggle("hidden", panel.dataset.panel !== mode);
            }
        });
    }
}
function readInput() {
    const castingTime = createDateTimeOffset(inputValue("casting-time"), Number(inputValue("offset")));
    if (mode === "numbers") {
        const changing = inputValue("changing-number");
        return {
            mode,
            castingTime,
            upper: Number(inputValue("upper-number")),
            lower: Number(inputValue("lower-number")),
            changing: changing ? Number(changing) : null
        };
    }
    if (mode === "hexagram") {
        const changedValue = inputValue("changed-hexagram");
        return {
            mode,
            castingTime,
            originalValue: Number(inputValue("original-hexagram")),
            changedValue: changedValue ? Number(changedValue) : null
        };
    }
    return {
        mode,
        castingTime,
        values: Array.from({ length: 6 }, (_, index) => Number(inputValue(`symbol-${index}`)))
    };
}
function render() {
    try {
        const view = toDivinationView(castDivination(readInput()));
        setText("title", view.title);
        setText("solar", view.solar);
        setText("lunar", view.lunar);
        setText("stem-branch", view.stemBranch);
        setText("day-emptiness", view.dayEmptiness);
        setText("original", `${view.original}（${view.palace}宫 ${view.palaceFivePhase}）`);
        setText("changed", view.changed);
        byId("lines").innerHTML = renderTable(["爻位", "阴阳", "四象", "动", "干支", "六亲", "六神", "世应", "伏神"], view.lines.map((line) => [
            line.position,
            line.yinYang,
            line.fourSymbol,
            line.changing ? "是" : "",
            line.stemBranch,
            line.sixKin,
            line.sixSpirit,
            line.worldPosition,
            line.hiddenDeity
        ]));
        byId("changed-section").classList.toggle("hidden", view.changedLines.length === 0);
        byId("changed-lines").innerHTML = renderTable(["爻位", "干支", "六亲"], view.changedLines.map((line) => [line.position, line.stemBranch, line.sixKin]));
        byId("stars").innerHTML = renderTable(["神煞", "地支"], view.stars.map((star) => [star.name, star.branches]));
        status.textContent = "已排盘";
        status.className = "status ok";
    }
    catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        status.className = "status error";
    }
}
function renderSelfCheck() {
    const result = runSelfCheck();
    status.innerHTML = result.checks
        .map((check) => `<span class="${check.ok ? "ok" : "error"}">${check.ok ? "PASS" : "FAIL"} ${check.name}</span>`)
        .join("");
    status.className = `status ${result.ok ? "ok" : "error"}`;
}
function renderTable(headers, rows) {
    return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || "_")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}
function byId(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element #${id}`);
    }
    return element;
}
function inputValue(id) {
    return byId(id).value;
}
function setText(id, value) {
    byId(id).textContent = value;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
//# sourceMappingURL=main.js.map