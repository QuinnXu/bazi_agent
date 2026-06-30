import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { castDivination, createDateTimeOffset, runSelfCheck, toDivinationView } from "./interaction.js";
const rl = createInterface({ input, output });
async function ask(question, fallback) {
    const answer = (await rl.question(`${question} (${fallback}): `)).trim();
    return answer || fallback;
}
async function main() {
    console.log("六爻 TypeScript 交互");
    console.log("1. 四象起卦  2. 数字起卦  3. 指定卦值  4. 自检");
    const mode = await ask("选择", "1");
    if (mode === "4") {
        const result = runSelfCheck();
        for (const check of result.checks) {
            console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.actual}`);
        }
        console.log(result.ok ? "自检通过" : "自检失败");
        return;
    }
    const localTime = await ask("起卦时间 yyyy-MM-ddTHH:mm", "2024-01-01T12:00");
    const offsetHours = Number(await ask("时区偏移小时", "8"));
    const castingTime = createDateTimeOffset(localTime, offsetHours * 60);
    let inputData;
    if (mode === "2") {
        const upper = Number(await ask("上卦数字", "5"));
        const lower = Number(await ask("下卦数字", "3"));
        const changingText = await ask("动爻数字，留空用默认公式", "");
        inputData = {
            mode: "numbers",
            castingTime,
            upper,
            lower,
            changing: changingText ? Number(changingText) : null
        };
    }
    else if (mode === "3") {
        const originalValue = Number(await ask("主卦值 0-63", "63"));
        const changedText = await ask("变卦值 0-63，留空表示无变卦", "");
        inputData = {
            mode: "hexagram",
            castingTime,
            originalValue,
            changedValue: changedText ? Number(changedText) : null
        };
    }
    else {
        const values = (await ask("六爻四象，从初爻到上爻，逗号分隔", "7,7,7,7,7,7"))
            .split(",")
            .map((value) => Number(value.trim()));
        inputData = {
            mode: "symbols",
            castingTime,
            values
        };
    }
    const view = toDivinationView(castDivination(inputData), "zh-Hans");
    console.log(`\n${view.title}`);
    console.log(`公历: ${view.solar}`);
    console.log(`农历: ${view.lunar}`);
    console.log(`四柱: ${view.stemBranch}`);
    console.log(`日空: ${view.dayEmptiness}`);
    console.table(view.lines);
    if (view.changedLines.length > 0) {
        console.log("变卦");
        console.table(view.changedLines);
    }
    console.log("神煞");
    console.table(view.stars);
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(() => {
    rl.close();
});
//# sourceMappingURL=cli.js.map