import { DateTimeOffset, SixLineDivination } from "./six-lines/divination.js";
import { FivePhase, FourSymbol, Hexagram } from "./core/elements.js";
export function castDivination(input) {
    switch (input.mode) {
        case "symbols":
            if (input.values.length !== 6) {
                throw new Error("四象必须填写 6 个值。");
            }
            return SixLineDivination.createFromFourSymbolValues(input.castingTime, input.values);
        case "numbers":
            return SixLineDivination.createFromNumbers(input.castingTime, input.upper, input.lower, input.changing ?? null);
        case "hexagram":
            return SixLineDivination.createFromHexagramValues(input.castingTime, input.originalValue, input.changedValue ?? null);
    }
}
export function createDateTimeOffset(localValue, offsetMinutes) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue);
    if (!match) {
        throw new Error("时间格式应为 yyyy-MM-ddTHH:mm。");
    }
    return new DateTimeOffset({
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6] ?? 0),
        offsetMinutes
    });
}
export function toDivinationView(divination, culture = "zh-Hans") {
    const original = divination.original.meta;
    const changed = divination.changed?.meta ?? null;
    const originalLinesTopToBottom = [...divination.original.lines].reverse();
    const dayEmptiness = divination.castingTime.stemBranch.day.emptyBranchesMemory
        .map((branch) => branch.toString(culture))
        .join("、");
    return {
        title: changed === null
            ? `${original.toString(culture)}卦`
            : `${original.toString(culture)}之${changed.toString(culture)}卦`,
        solar: divination.castingTime.solar.toISO(),
        lunar: divination.castingTime.lunar.toISO(),
        stemBranch: divination.castingTime.stemBranch.toString(culture),
        dayEmptiness,
        original: original.toString(culture),
        changed: changed?.toString(culture) ?? "无",
        palace: original.palace.toString(culture),
        palaceFivePhase: original.palace.fivePhase.toString(culture),
        lines: originalLinesTopToBottom.map((line) => ({
            position: line.linePosition.toString(culture),
            yinYang: line.yinYang.toString(culture),
            fourSymbol: line.fourSymbol.toString(culture),
            changing: line.isChanging,
            stemBranch: line.tryGetStemBranch()?.toString(culture) ?? "_",
            fivePhase: line.tryGetStemBranch()?.branch.fivePhase.toString(culture) ?? "_",
            sixKin: line.tryGetSixKin()?.toString(culture) ?? "_",
            sixSpirit: line.sixSpirit?.toString(culture) ?? "_",
            worldPosition: line.position?.toString(culture) ?? "_",
            hiddenDeity: line.hiddenDeity
                ? `${line.hiddenDeity.sixKin.toString(culture)} ${line.hiddenDeity.stemBranch.toString(culture)}`
                : "_"
        })),
        changedLines: divination.changed === null
            ? []
            : [...divination.changed.lines].reverse().map((line, index) => {
                const originalLine = originalLinesTopToBottom[index];
                return {
                    position: line.linePosition.toString(culture),
                    stemBranch: line.tryGetStemBranch()?.toString(culture) ?? "_",
                    fivePhase: line.tryGetStemBranch()?.branch.fivePhase.toString(culture) ?? "_",
                    sixKin: line.tryGetSixKin()?.toString(culture) ?? "_",
                    sixSpirit: originalLine?.sixSpirit?.toString(culture) ?? "_"
                };
            }),
        fivePhaseStates: getFivePhaseStates(divination.castingTime.stemBranch.month.branch.fivePhase, culture),
        stars: divination.symbolicStars === null
            ? []
            : [...divination.symbolicStars.allStars].map(([star, branches]) => ({
                name: star.toString(culture),
                branches: branches.map((branch) => branch.toString(culture)).join("、")
            })),
        markdown: divination.toString(culture)
    };
}
export function getFivePhaseStates(monthPhase, culture = "zh-Hans") {
    const stateOrder = ["旺", "相", "休", "囚", "死"];
    return FivePhase.getAll()
        .map((fivePhase) => ({
        fivePhase: fivePhase.toString(culture),
        state: getFivePhaseState(monthPhase, fivePhase)
    }))
        .sort((left, right) => stateOrder.indexOf(left.state) - stateOrder.indexOf(right.state));
}
function getFivePhaseState(monthPhase, fivePhase) {
    if (fivePhase === monthPhase) {
        return "旺";
    }
    if (monthPhase.generates(fivePhase)) {
        return "相";
    }
    if (fivePhase.generates(monthPhase)) {
        return "休";
    }
    if (fivePhase.restrains(monthPhase)) {
        return "囚";
    }
    return "死";
}
export function runSelfCheck() {
    const fullYang = SixLineDivination.createFromFourSymbolValues("2024-01-01T12:00:00+00:00", [7, 7, 7, 7, 7, 7]);
    const changing = SixLineDivination.createFromFourSymbolValues("2024-01-01T12:00:00+00:00", [9, 8, 7, 6, 7, 8]);
    const checks = [
        {
            name: "2024-01-01 干支",
            actual: fullYang.castingTime.stemBranch.toString("en"),
            expected: "GuiMao JiaZi JiaZi GengWu"
        },
        {
            name: "全阳卦纳甲",
            actual: fullYang.original.lines.map((line) => line.stemBranch.toString("en")).join(","),
            expected: "JiaZi,JiaYin,JiaChen,RenWu,RenShen,RenXu"
        },
        {
            name: "全阳卦六亲",
            actual: fullYang.original.lines.map((line) => line.sixKin.label).join(","),
            expected: "Offspring,Wealth,Parent,Officer,Sibling,Parent"
        },
        {
            name: "变爻样例",
            actual: `${changing.original.meta.label}->${changing.changed?.meta.label}:${changing.original.lines.map((line) => Number(line.isChanging)).join("")}`,
            expected: "AfterCompletion->Influence:100100"
        }
    ].map((check) => ({ ...check, ok: check.actual === check.expected }));
    return {
        ok: checks.every((check) => check.ok),
        checks
    };
}
export function getHexagramOptions(culture = "zh-Hans") {
    return Hexagram.getAll()
        .map((hexagram) => ({
        value: hexagram.value,
        label: `${hexagram.value}: ${hexagram.toString(culture)} (${hexagram.label})`
    }))
        .sort((left, right) => left.value - right.value);
}
export function getFourSymbolOptions(culture = "zh-Hans") {
    return FourSymbol.getAll().map((symbol) => ({
        value: symbol.value,
        label: `${symbol.value} ${symbol.toString(culture)}`
    }));
}
//# sourceMappingURL=interaction.js.map