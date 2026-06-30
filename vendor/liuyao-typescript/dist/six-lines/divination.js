import { Solar } from "lunar-typescript";
import { EarthlyBranch, FourSymbol, HeavenlyStem, Hexagram, StemBranch, Trigram, YinYang } from "../core/elements.js";
import { IChingTranslationManager } from "../core/localization.js";
import { ArgumentException, ArgumentOutOfRangeException, InvalidOperationException } from "../errors.js";
import { HexagramNature, LinePosition, Position, SixKin, SixSpirit, SymbolicStar } from "./elements.js";
export class DateTimeOffset {
    year;
    month;
    day;
    hour;
    minute;
    second;
    millisecond;
    offsetMinutes;
    constructor(parts) {
        this.year = parts.year;
        this.month = parts.month;
        this.day = parts.day;
        this.hour = parts.hour ?? 0;
        this.minute = parts.minute ?? 0;
        this.second = parts.second ?? 0;
        this.millisecond = parts.millisecond ?? 0;
        this.offsetMinutes = parts.offsetMinutes ?? 0;
    }
    static from(input) {
        if (input instanceof DateTimeOffset) {
            return input;
        }
        if (input instanceof Date) {
            return new DateTimeOffset({
                year: input.getUTCFullYear(),
                month: input.getUTCMonth() + 1,
                day: input.getUTCDate(),
                hour: input.getUTCHours(),
                minute: input.getUTCMinutes(),
                second: input.getUTCSeconds(),
                millisecond: input.getUTCMilliseconds(),
                offsetMinutes: 0
            });
        }
        if (typeof input === "string") {
            return DateTimeOffset.parse(input);
        }
        return new DateTimeOffset(input);
    }
    static parse(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/.exec(value);
        if (!match) {
            throw new ArgumentException(`Invalid DateTimeOffset string: ${value}`);
        }
        const [, y, m, d, h = "0", min = "0", s = "0", ms = "0", offset = "Z"] = match;
        return new DateTimeOffset({
            year: Number(y),
            month: Number(m),
            day: Number(d),
            hour: Number(h),
            minute: Number(min),
            second: Number(s),
            millisecond: Number(ms.padEnd(3, "0")),
            offsetMinutes: parseOffsetMinutes(offset)
        });
    }
    addDays(days) {
        const date = new Date(Date.UTC(this.year, this.month - 1, this.day + days, this.hour, this.minute, this.second, this.millisecond));
        return new DateTimeOffset({
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
            second: date.getUTCSeconds(),
            millisecond: date.getUTCMilliseconds(),
            offsetMinutes: this.offsetMinutes
        });
    }
    equals(other) {
        const value = DateTimeOffset.from(other);
        return this.year === value.year
            && this.month === value.month
            && this.day === value.day
            && this.hour === value.hour
            && this.minute === value.minute
            && this.second === value.second
            && this.millisecond === value.millisecond
            && this.offsetMinutes === value.offsetMinutes;
    }
    toISO() {
        const sign = this.offsetMinutes >= 0 ? "+" : "-";
        const absOffset = Math.abs(this.offsetMinutes);
        const offsetHour = Math.trunc(absOffset / 60).toString().padStart(2, "0");
        const offsetMinute = (absOffset % 60).toString().padStart(2, "0");
        return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}T${pad(this.hour)}:${pad(this.minute)}:${pad(this.second)}${sign}${offsetHour}:${offsetMinute}`;
    }
    format(pattern) {
        return pattern
            .replaceAll("yyyy", this.year.toString().padStart(4, "0"))
            .replaceAll("MM", pad(this.month))
            .replaceAll("M", this.month.toString())
            .replaceAll("dd", pad(this.day))
            .replaceAll("d", this.day.toString())
            .replaceAll("HH", pad(this.hour))
            .replaceAll("H", this.hour.toString());
    }
    toString() {
        return this.toISO();
    }
}
export class LunarStemBranch {
    year;
    month;
    day;
    hour;
    constructor(year, month, day, hour) {
        this.year = year;
        this.month = month;
        this.day = day;
        this.hour = hour;
    }
    toString(culture) {
        return `${this.year.toString(culture)} ${this.month.toString(culture)} ${this.day.toString(culture)} ${this.hour.toString(culture)}`;
    }
}
export class CastingTime {
    solar;
    lunar;
    stemBranch;
    constructor(solar, lunar, stemBranch) {
        this.solar = solar;
        this.lunar = lunar;
        this.stemBranch = stemBranch;
    }
    static convertFrom(dateTime) {
        const dto = DateTimeOffset.from(dateTime);
        const solar = Solar.fromYmdHms(dto.year, dto.month, dto.day, dto.hour, dto.minute, dto.second);
        const lunar = solar.getLunar();
        const lunarDto = new DateTimeOffset({
            year: lunar.getYear(),
            month: Math.abs(lunar.getMonth()),
            day: lunar.getDay(),
            hour: lunar.getHour(),
            minute: lunar.getMinute(),
            second: lunar.getSecond(),
            offsetMinutes: dto.offsetMinutes
        });
        const stemBranch = new LunarStemBranch(new StemBranch(HeavenlyStem.fromValue(lunar.getYearGanIndex() + 1), EarthlyBranch.fromValue(lunar.getYearZhiIndex() + 1)), new StemBranch(HeavenlyStem.fromValue(lunar.getMonthGanIndex() + 1), EarthlyBranch.fromValue(lunar.getMonthZhiIndex() + 1)), new StemBranch(HeavenlyStem.fromValue(lunar.getDayGanIndex() + 1), EarthlyBranch.fromValue(lunar.getDayZhiIndex() + 1)), new StemBranch(HeavenlyStem.fromValue(lunar.getTimeGanIndex() + 1), EarthlyBranch.fromValue(lunar.getTimeZhiIndex() + 1)));
        return new CastingTime(dto, lunarDto, stemBranch);
    }
}
export class Line {
    linePosition;
    yinYang;
    stemBranchValue = null;
    sixKinValue = null;
    constructor(linePosition, yinYang) {
        this.linePosition = linePosition;
        this.yinYang = yinYang;
    }
    isChanging = false;
    position = null;
    sixSpirit = null;
    hiddenDeity = null;
    get fourSymbol() {
        if (this.isChanging) {
            return this.yinYang === YinYang.Yang ? FourSymbol.OldYang : FourSymbol.OldYin;
        }
        return this.yinYang === YinYang.Yang ? FourSymbol.YoungYang : FourSymbol.YoungYin;
    }
    get stemBranch() {
        if (!this.stemBranchValue) {
            throw new InvalidOperationException("StemBranch not set in build step");
        }
        return this.stemBranchValue;
    }
    set stemBranch(value) {
        this.stemBranchValue = value;
    }
    tryGetStemBranch() {
        return this.stemBranchValue;
    }
    get sixKin() {
        if (!this.sixKinValue) {
            throw new InvalidOperationException("SixKin not set in build step");
        }
        return this.sixKinValue;
    }
    set sixKin(value) {
        this.sixKinValue = value;
    }
    tryGetSixKin() {
        return this.sixKinValue;
    }
    get hasHiddenDeity() {
        return this.hiddenDeity !== null;
    }
    getStatement(hexagram, culture) {
        return IChingTranslationManager.getTranslation("Line", `${hexagram.value}.${this.linePosition.label}.Statement`, culture) ?? "";
    }
    getImage(hexagram, culture) {
        return IChingTranslationManager.getTranslation("Line", `${hexagram.value}.${this.linePosition.label}.Image`, culture) ?? "";
    }
}
export class HiddenDeityInfo {
    stemBranch;
    sixKin;
    constructor(stemBranch, sixKin) {
        this.stemBranch = stemBranch;
        this.sixKin = sixKin;
    }
    static fromLine(line) {
        return new HiddenDeityInfo(line.stemBranch, line.sixKin);
    }
}
export class HexagramInstance {
    meta;
    lines;
    constructor(meta) {
        this.meta = meta;
        this.lines = Array.from({ length: 6 }, (_, index) => {
            const yinYang = ((meta.value >> index) & 1) === 1 ? YinYang.Yang : YinYang.Yin;
            return new Line(LinePosition.fromArrayIndex(index), yinYang);
        });
    }
    at(index) {
        return this.lines[index];
    }
}
export class SymbolicStarCollection {
    symbolicStars;
    constructor(symbolicStars) {
        this.symbolicStars = symbolicStars;
    }
    getStars(symbolicStar) {
        const branches = this.symbolicStars.get(symbolicStar);
        return branches ? [...branches] : null;
    }
    tryGetStarsMemory(symbolicStar) {
        return this.symbolicStars.get(symbolicStar) ?? null;
    }
    hasStar(branch, symbolicStar) {
        return this.symbolicStars.get(symbolicStar)?.some((item) => item === branch) ?? false;
    }
    getStarsForBranch(branch) {
        const result = [];
        for (const [star, branches] of this.symbolicStars) {
            if (branches.some((item) => item === branch)) {
                result.push(star);
            }
        }
        return result;
    }
    get allStars() {
        return new Map([...this.symbolicStars].map(([star, branches]) => [star, [...branches]]));
    }
    add(symbolicStar, calculator) {
        if (this.symbolicStars.has(symbolicStar)) {
            return false;
        }
        this.symbolicStars.set(symbolicStar, calculator());
        return true;
    }
    remove(symbolicStar) {
        return this.symbolicStars.delete(symbolicStar);
    }
}
export class SixLineDivination {
    castingTime;
    original;
    changed;
    symbolicStars = null;
    constructor(castingTime, original, changed = null) {
        this.castingTime = castingTime;
        this.original = original;
        this.changed = changed;
    }
    static createBuilder() {
        return new SixLineDivinationBuilder();
    }
    static create(castingTime, first, second, third) {
        if (first === undefined) {
            return SixLineDivination.createByTime(castingTime);
        }
        if (Array.isArray(first)) {
            if (first.length !== 6) {
                throw new InvalidOperationException(`Invalid number of four symbol values. Expected 6, got ${first.length}`);
            }
            const fourSymbols = first.map((value) => typeof value === "number" ? FourSymbol.fromValue(value) : value);
            return SixLineDivination.createFromFourSymbols(castingTime, fourSymbols);
        }
        if (first instanceof Hexagram) {
            return SixLineDivination.createFromHexagrams(castingTime, first, second instanceof Hexagram ? second : null);
        }
        if (typeof first === "number" && typeof second === "number") {
            return SixLineDivination.createFromNumbers(castingTime, first, second, third ?? null);
        }
        if (typeof first === "number" && (second === undefined || second === null)) {
            return SixLineDivination.createFromHexagramValues(castingTime, first, null);
        }
        throw new ArgumentException("Unsupported SixLineDivination.create overload");
    }
    static createByTime(castingTime) {
        return SixLineDivination.createBuilder()
            .useMethod(new TimeBasedCastingMethod(castingTime))
            .withDefaultSteps()
            .build();
    }
    static createFromFourSymbols(castingTime, fourSymbols) {
        if (fourSymbols.length !== 6) {
            throw new InvalidOperationException(`Invalid number of four symbol values. Expected 6, got ${fourSymbols.length}`);
        }
        return SixLineDivination.createBuilder()
            .useMethod(new CoinCastingMethod(castingTime, fourSymbols))
            .withDefaultSteps()
            .build();
    }
    static createFromFourSymbolValues(castingTime, fourSymbolValues) {
        if (fourSymbolValues.length !== 6) {
            throw new InvalidOperationException(`Invalid number of four symbol values. Expected 6, got ${fourSymbolValues.length}`);
        }
        return SixLineDivination.createFromFourSymbols(castingTime, fourSymbolValues.map((value) => FourSymbol.fromValue(value)));
    }
    static createFromNumbers(castingTime, upperTrigramNumber, lowerTrigramNumber, changingLineNumber = null) {
        return SixLineDivination.createBuilder()
            .useMethod(new NumberBasedCastingMethod(castingTime, upperTrigramNumber, lowerTrigramNumber, changingLineNumber))
            .withDefaultSteps()
            .build();
    }
    static createFromHexagrams(castingTime, original, changed = null) {
        return SixLineDivination.createBuilder()
            .useMethod(new SpecifyingHexagramCastingMethod(castingTime, original, changed))
            .withDefaultSteps()
            .build();
    }
    static createFromHexagramValues(castingTime, originalValue, changedValue = null) {
        return SixLineDivination.createFromHexagrams(castingTime, Hexagram.fromValue(originalValue), changedValue === null ? null : Hexagram.fromValue(changedValue));
    }
    toString(culture) {
        const tName = "SixLineDivination";
        const tTo = translate(tName, "To", culture);
        const tHexagram = translate(tName, "Hexagram", culture);
        const tCastingTime = translate(tName, "CastingTime", culture);
        const tGregorianCalendar = translate(tName, "GregorianCalendar", culture);
        const tDateFormat = translate(tName, "DateFormat", culture) || "yyyy/M/d H";
        const tLunarStemBranch = translate(tName, "LunarStemBranch", culture);
        const tDayEmptiness = translate(tName, "DayEmptiness", culture);
        const tOriginalHexagram = translate(tName, "OriginalHexagram", culture);
        const tHexagramName = translate(tName, "HexagramName", culture);
        const tHexagramPalace = translate(tName, "HexagramPalace", culture);
        const tPalace = translate(tName, "Palace", culture);
        const tPalaceFivePhases = translate(tName, "PalaceFivePhases", culture);
        const tLinePosition = translate(tName, "LinePosition", culture);
        const tStemBranch = translate(tName, "StemBranch", culture);
        const tSixKin = translate(tName, "SixKin", culture);
        const tFourSymbols = translate(tName, "FourSymbols", culture);
        const tSixSpirits = translate(tName, "SixSpirits", culture);
        const tPosition = translate(tName, "Position", culture);
        const tHiddenDeity = translate(tName, "HiddenDeity", culture);
        const tHiddenDeityStemBranch = translate(tName, "HiddenDeityStemBranch", culture);
        const tChangedHexagram = translate(tName, "ChangedHexagram", culture);
        const tSymbolicStar = translate(tName, "SymbolicStar", culture);
        const tSymbolicStarName = translate(tName, "SymbolicStarName", culture);
        const tSymbolicStarBranch = translate(tName, "SymbolicStarBranch", culture);
        const dayEmptiness = formatEarthlyBranches(this.castingTime.stemBranch.day.emptyBranchesMemory, culture);
        const lines = [];
        lines.push(`# ${this.original.meta.toString(culture)}${this.changed === null ? "" : ` ${tTo} ${this.changed.meta.toString(culture)}`} ${tHexagram}\n`);
        lines.push(`## ${tCastingTime}`);
        lines.push(`**${tGregorianCalendar}**: _${this.castingTime.solar.format(tDateFormat)}_  `);
        lines.push(`**${tLunarStemBranch}**: _${this.castingTime.stemBranch.toString(culture)}_  `);
        lines.push(`**${tDayEmptiness}**: _${dayEmptiness}_  \n`);
        lines.push(`## ${tOriginalHexagram}`);
        const originalNature = getHexagramNature(this.original.meta);
        lines.push(`**${tHexagramName}**: _${this.original.meta.toString(culture)}${originalNature === null ? "" : `（${originalNature.toString(culture)}${tHexagram}）`}_  `);
        lines.push(`**${tHexagramPalace}**: _${this.original.meta.palace.toString(culture)}${tPalace}_  `);
        lines.push(`**${tPalaceFivePhases}**: _${this.original.meta.palace.fivePhase.toString(culture)}_  \n`);
        lines.push(`|${tLinePosition}|${tStemBranch}|${tSixKin}|${tFourSymbols}|${tSixSpirits}|${tPosition}|${tHiddenDeity}|${tHiddenDeityStemBranch}|`);
        lines.push("|---|---|---|---|---|---|---|---|");
        for (let i = 5; i >= 0; i--) {
            const line = this.original.at(i);
            const stemBranchText = line.tryGetStemBranch()?.toString(culture) ?? "_";
            const sixKinText = line.tryGetSixKin()?.toString(culture) ?? "_";
            const hiddenDeity = line.hiddenDeity;
            lines.push([
                line.linePosition.toString(culture),
                stemBranchText,
                sixKinText,
                line.fourSymbol.toString(culture),
                line.sixSpirit?.toString(culture) ?? "_",
                line.position?.toString(culture) ?? "_",
                hiddenDeity?.sixKin.toString(culture) ?? "_",
                hiddenDeity?.stemBranch.toString(culture) ?? "_"
            ].join("|").replace(/^/, "|").replace(/$/, "|  "));
        }
        if (this.changed !== null) {
            lines.push(`\n## ${tChangedHexagram}`);
            const changedNature = getHexagramNature(this.changed.meta);
            lines.push(`**${tHexagramName}**: _${this.changed.meta.toString(culture)}${changedNature === null ? "" : `（${changedNature.toString(culture)}${tHexagram}）`}_  `);
            lines.push(`**${tHexagramPalace}**: _${this.changed.meta.palace.toString(culture)}${tPalace}_  `);
            lines.push(`**${tPalaceFivePhases}**: _${this.changed.meta.palace.fivePhase.toString(culture)}_  \n`);
            lines.push(`|${tLinePosition}|${tStemBranch}|${tSixKin}|`);
            lines.push("|---|---|---|");
            for (let i = 5; i >= 0; i--) {
                const line = this.changed.at(i);
                lines.push(`|${line.linePosition.toString(culture)}|${line.tryGetStemBranch()?.toString(culture) ?? "_"}|${line.tryGetSixKin()?.toString(culture) ?? "_"}|`);
            }
        }
        if (this.symbolicStars === null) {
            return `${lines.join("\n")}\n`;
        }
        lines.push(`\n## ${tSymbolicStar}`);
        lines.push(`|${tSymbolicStarName}|${tSymbolicStarBranch}|`);
        lines.push("|---|---|");
        for (const [symbolicStar, branches] of this.symbolicStars.allStars) {
            lines.push(`|${symbolicStar.toString(culture)}|${formatEarthlyBranches(branches, culture)}|`);
        }
        return `${lines.join("\n")}\n`;
    }
}
export class DivinationContext {
    sixLineDivination;
    constructor(sixLineDivination) {
        this.sixLineDivination = sixLineDivination;
    }
}
export class TimeBasedCastingMethod {
    castingTime;
    constructor(castingTime) {
        this.castingTime = castingTime;
    }
    cast() {
        const ctime = CastingTime.convertFrom(this.castingTime);
        const yearBranchValue = ctime.stemBranch.year.branch.value;
        const hourBranchValue = ctime.stemBranch.hour.branch.value;
        const lunarMonth = ctime.lunar.month;
        const lunarDay = ctime.lunar.day;
        const upperTrigramNumber = yearBranchValue + lunarMonth + lunarDay;
        const lowerTrigramNumber = upperTrigramNumber + hourBranchValue;
        const changingLineNumber = lowerTrigramNumber;
        return NumberBasedCastingMethod.createDivination(ctime, upperTrigramNumber, lowerTrigramNumber, changingLineNumber);
    }
}
export class CoinCastingMethod {
    castingTime;
    fourSymbols;
    constructor(castingTime, fourSymbols) {
        this.castingTime = castingTime;
        this.fourSymbols = fourSymbols;
    }
    cast() {
        return CoinCastingMethod.createDivination(CastingTime.convertFrom(this.castingTime), this.fourSymbols);
    }
    static createDivination(castingTime, fourSymbols) {
        if (fourSymbols.length !== 6) {
            throw new ArgumentException("必须提供6个四象值", "fourSymbols");
        }
        let originalValue = 0;
        let changingMask = 0;
        for (let i = 0; i < 6; i++) {
            const symbol = fourSymbols[i];
            if (symbol.yinYang === YinYang.Yang) {
                originalValue |= 1 << i;
            }
            if (symbol.isChanging) {
                changingMask |= 1 << i;
            }
        }
        const changedValue = originalValue ^ changingMask;
        return SpecifyingHexagramCastingMethod.createDivination(castingTime, Hexagram.fromValue(originalValue), changingMask !== 0 ? Hexagram.fromValue(changedValue) : null);
    }
}
export class NumberBasedCastingMethod {
    castingTime;
    upperTrigramNumber;
    lowerTrigramNumber;
    changingLineNumber;
    constructor(castingTime, upperTrigramNumber, lowerTrigramNumber, changingLineNumber = null) {
        this.castingTime = castingTime;
        this.upperTrigramNumber = upperTrigramNumber;
        this.lowerTrigramNumber = lowerTrigramNumber;
        this.changingLineNumber = changingLineNumber;
    }
    cast() {
        return NumberBasedCastingMethod.createDivination(CastingTime.convertFrom(this.castingTime), this.upperTrigramNumber, this.lowerTrigramNumber, this.changingLineNumber);
    }
    static createDivination(castingTime, upperTrigramNumber, lowerTrigramNumber, changingLineNumber) {
        if (upperTrigramNumber < 0) {
            throw new ArgumentOutOfRangeException("upperTrigramNumber");
        }
        if (lowerTrigramNumber < 0) {
            throw new ArgumentOutOfRangeException("lowerTrigramNumber");
        }
        if (changingLineNumber !== null && changingLineNumber < 0) {
            throw new ArgumentOutOfRangeException("changingLineNumber");
        }
        const upperTrigram = NumberBasedCastingMethod.getTrigramByNumber(upperTrigramNumber);
        const lowerTrigram = NumberBasedCastingMethod.getTrigramByNumber(lowerTrigramNumber);
        const original = Hexagram.create(upperTrigram, lowerTrigram);
        const changingLinePosition = changingLineNumber !== null
            ? NumberBasedCastingMethod.getChangingLinePosition(changingLineNumber)
            : NumberBasedCastingMethod.getChangingLinePosition(upperTrigramNumber + lowerTrigramNumber + castingTime.stemBranch.day.branch.value);
        const changed = original.value ^ (1 << (changingLinePosition - 1));
        return SpecifyingHexagramCastingMethod.createDivination(castingTime, original, Hexagram.fromValue(changed));
    }
    static getTrigramByNumber(number) {
        switch (number % 8) {
            case 1:
                return Trigram.Qian;
            case 2:
                return Trigram.Dui;
            case 3:
                return Trigram.Li;
            case 4:
                return Trigram.Zhen;
            case 5:
                return Trigram.Xun;
            case 6:
                return Trigram.Kan;
            case 7:
                return Trigram.Gen;
            case 0:
                return Trigram.Kun;
            default:
                throw new InvalidOperationException("无效的余数");
        }
    }
    static getChangingLinePosition(number) {
        const remainder = number % 6;
        return remainder === 0 ? 6 : remainder;
    }
}
export class SpecifyingHexagramCastingMethod {
    castingTime;
    original;
    changed;
    constructor(castingTime, original, changed = null) {
        this.castingTime = castingTime;
        this.original = original;
        this.changed = changed;
    }
    cast() {
        return SpecifyingHexagramCastingMethod.createDivination(CastingTime.convertFrom(this.castingTime), this.original, this.changed);
    }
    static createDivination(castingTime, original, changed) {
        const originalInstance = new HexagramInstance(original);
        if (changed === null) {
            return new SixLineDivination(castingTime, originalInstance);
        }
        const changingMask = original.value ^ changed.value;
        if (changingMask === 0) {
            return new SixLineDivination(castingTime, originalInstance);
        }
        SpecifyingHexagramCastingMethod.applyChangingLines(originalInstance, changingMask);
        return new SixLineDivination(castingTime, originalInstance, new HexagramInstance(changed));
    }
    static applyChangingLines(original, changingMask) {
        for (let i = 0; i < 6; i++) {
            if (((changingMask >> i) & 1) === 1) {
                original.lines[i].isChanging = true;
            }
        }
    }
}
export class NajiaStep {
    requiredSteps = [];
    static stemTable = [
        2, 10,
        7, 7,
        5, 5,
        4, 4,
        3, 3,
        6, 6,
        8, 8,
        1, 9
    ];
    static branchTable = [
        8, 6, 4, 2, 12, 10,
        1, 3, 5, 7, 9, 11,
        3, 5, 7, 9, 11, 1,
        6, 4, 2, 12, 10, 8,
        5, 7, 9, 11, 1, 3,
        4, 2, 12, 10, 8, 6,
        2, 12, 10, 8, 6, 4,
        1, 3, 5, 7, 9, 11
    ];
    execute(context) {
        NajiaStep.bind(context.sixLineDivination.original);
        if (context.sixLineDivination.changed !== null) {
            NajiaStep.bind(context.sixLineDivination.changed);
        }
    }
    static bind(hexagram) {
        const lowerIdx = hexagram.meta.lower.value;
        const upperIdx = hexagram.meta.upper.value;
        const lowerStem = NajiaStep.stemTable[lowerIdx * 2];
        const upperStem = NajiaStep.stemTable[upperIdx * 2 + 1];
        const lowerBranches = NajiaStep.branchTable.slice(lowerIdx * 6, lowerIdx * 6 + 3);
        const upperBranches = NajiaStep.branchTable.slice(upperIdx * 6 + 3, upperIdx * 6 + 6);
        for (let i = 0; i < 3; i++) {
            hexagram.lines[i].stemBranch = new StemBranch(HeavenlyStem.fromValue(lowerStem), EarthlyBranch.fromValue(lowerBranches[i]));
            hexagram.lines[i + 3].stemBranch = new StemBranch(HeavenlyStem.fromValue(upperStem), EarthlyBranch.fromValue(upperBranches[i]));
        }
    }
}
export class PositionStep {
    requiredSteps = [];
    static worldlyPositions = [2, 3, 3, 4, 1, 2, 0, 5];
    execute(context) {
        const [worldlyIndex, correspondingIndex] = PositionStep.getPositionIndices(context.sixLineDivination.original);
        context.sixLineDivination.original.lines[worldlyIndex].position = Position.Worldly;
        context.sixLineDivination.original.lines[correspondingIndex].position = Position.Corresponding;
    }
    static getPositionIndices(hexagram) {
        const value = hexagram.meta.value;
        const lower = value & 0b111;
        const upper = (value >> 3) & 0b111;
        const match = (~(lower ^ upper)) & 0b111;
        const worldlyIndex = PositionStep.worldlyPositions[match];
        return [worldlyIndex, (worldlyIndex + 3) % 6];
    }
}
export class SixKinStep {
    requiredSteps = [NajiaStep];
    execute(context) {
        const palaceFivePhase = context.sixLineDivination.original.meta.palace.fivePhase;
        for (let i = 0; i < 6; i++) {
            context.sixLineDivination.original.lines[i].sixKin = SixKinStep.getSixKin(palaceFivePhase, context.sixLineDivination.original.lines[i].stemBranch.branch.fivePhase);
            if (context.sixLineDivination.changed !== null) {
                context.sixLineDivination.changed.lines[i].sixKin = SixKinStep.getSixKin(palaceFivePhase, context.sixLineDivination.changed.lines[i].stemBranch.branch.fivePhase);
            }
        }
    }
    static getSixKin(palacePhase, linePhase) {
        if (linePhase.generates(palacePhase)) {
            return SixKin.Parent;
        }
        if (linePhase === palacePhase) {
            return SixKin.Sibling;
        }
        if (palacePhase.restrains(linePhase)) {
            return SixKin.Wealth;
        }
        if (linePhase.restrains(palacePhase)) {
            return SixKin.Officer;
        }
        return SixKin.Offspring;
    }
}
export class SixSpiritStep {
    requiredSteps = [];
    static spiritsOrder = [
        SixSpirit.AzureDragon,
        SixSpirit.VermilionBird,
        SixSpirit.HookChen,
        SixSpirit.CoiledSnake,
        SixSpirit.WhiteTiger,
        SixSpirit.BlackTortoise
    ];
    execute(context) {
        const startIndex = SixSpiritStep.getStartIndex(context.sixLineDivination.castingTime.stemBranch.day.stem);
        for (let i = 0; i < 6; i++) {
            context.sixLineDivination.original.lines[i].sixSpirit = SixSpiritStep.spiritsOrder[(startIndex + i) % 6];
        }
    }
    static getStartIndex(dayStem) {
        switch (dayStem.value) {
            case 1:
            case 2:
                return 0;
            case 3:
            case 4:
                return 1;
            case 5:
                return 2;
            case 6:
                return 3;
            case 7:
            case 8:
                return 4;
            case 9:
            case 10:
                return 5;
            default:
                return 0;
        }
    }
}
export class HiddenDeityStep {
    requiredSteps = [SixKinStep];
    static palaceTemplateCache = new Map();
    execute(context) {
        const existingKins = new Set(context.sixLineDivination.original.lines.map((line) => line.sixKin));
        const missingKins = new Set(SixKin.getAll().filter((kin) => !existingKins.has(kin)));
        if (missingKins.size === 0) {
            return;
        }
        const palaceTemplate = HiddenDeityStep.getOrCreatePalaceTemplate(context.sixLineDivination.original.meta.palace);
        for (let i = 0; i < 6; i++) {
            const palaceLine = palaceTemplate[i];
            if (missingKins.has(palaceLine.sixKin)) {
                context.sixLineDivination.original.lines[i].hiddenDeity = palaceLine;
            }
        }
    }
    static getOrCreatePalaceTemplate(palace) {
        let template = HiddenDeityStep.palaceTemplateCache.get(palace);
        if (!template) {
            template = HiddenDeityStep.createPalaceTemplate(palace);
            HiddenDeityStep.palaceTemplateCache.set(palace, template);
        }
        return template;
    }
    static createPalaceTemplate(palace) {
        const hexagram = new HexagramInstance(Hexagram.create(palace, palace));
        NajiaStep.bind(hexagram);
        const palacePhase = palace.fivePhase;
        return hexagram.lines.map((line) => {
            line.sixKin = SixKinStep.getSixKin(palacePhase, line.stemBranch.branch.fivePhase);
            return HiddenDeityInfo.fromLine(line);
        });
    }
}
export class SymbolicStarStep {
    requiredSteps = [];
    static noblemanTable = [
        2, 8,
        1, 9,
        12, 10,
        12, 10,
        2, 8,
        1, 9,
        7, 3,
        7, 3,
        4, 6,
        4, 6
    ];
    static salarySpiritTable = [3, 4, 6, 7, 6, 7, 9, 10, 12, 1];
    static cultureFlourishTable = [6, 7, 9, 10, 9, 10, 12, 1, 3, 4];
    static yangBladeTable = [4, 3, 7, 6, 7, 6, 10, 9, 1, 12];
    static calculators = SymbolicStarStep.createCalculators();
    execute(context) {
        const stars = new Map();
        for (const [symbolicStar, calculator] of SymbolicStarStep.calculators) {
            const branches = calculator(context.sixLineDivination.castingTime, context.sixLineDivination.original);
            if (branches !== null) {
                stars.set(symbolicStar, branches);
            }
        }
        context.sixLineDivination.symbolicStars = new SymbolicStarCollection(stars);
    }
    static createCalculators() {
        const calculators = new Map();
        SymbolicStarStep.add(calculators, SymbolicStar.Nobleman, (ct) => {
            const startIndex = (ct.stemBranch.day.stem.value - 1) * 2;
            return [
                EarthlyBranch.fromValue(SymbolicStarStep.noblemanTable[startIndex]),
                EarthlyBranch.fromValue(SymbolicStarStep.noblemanTable[startIndex + 1])
            ];
        });
        SymbolicStarStep.add(calculators, SymbolicStar.SalarySpirit, (ct) => [SymbolicStarStep.calculateStemStar(ct.stemBranch.day.stem, SymbolicStarStep.salarySpiritTable)]);
        SymbolicStarStep.add(calculators, SymbolicStar.CultureFlourish, (ct) => [SymbolicStarStep.calculateStemStar(ct.stemBranch.day.stem, SymbolicStarStep.cultureFlourishTable)]);
        SymbolicStarStep.add(calculators, SymbolicStar.YangBlade, (ct) => [SymbolicStarStep.calculateStemStar(ct.stemBranch.day.stem, SymbolicStarStep.yangBladeTable)]);
        SymbolicStarStep.add(calculators, SymbolicStar.PostHorse, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 6)]);
        SymbolicStarStep.add(calculators, SymbolicStar.PeachBlossom, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 1)]);
        SymbolicStarStep.add(calculators, SymbolicStar.GeneralsStar, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 4)]);
        SymbolicStarStep.add(calculators, SymbolicStar.Canopy, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 8)]);
        SymbolicStarStep.add(calculators, SymbolicStar.StarOfStrategy, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 2)]);
        SymbolicStarStep.add(calculators, SymbolicStar.DisasterMalignity, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 10)]);
        SymbolicStarStep.add(calculators, SymbolicStar.RobberyMalignity, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 9)]);
        SymbolicStarStep.add(calculators, SymbolicStar.DeathSpirit, (ct) => [SymbolicStarStep.calculateTrinityCombinationBranch(ct.stemBranch.day.branch, 3)]);
        SymbolicStarStep.add(calculators, SymbolicStar.CelestialPhysician, (ct) => [EarthlyBranch.fromValue(((ct.stemBranch.month.branch.value - 1 + 11) % 12) + 1)]);
        SymbolicStarStep.add(calculators, SymbolicStar.HeavenlyJoy, (ct) => {
            const season = Math.trunc(((ct.stemBranch.month.branch.value + 9) % 12) / 3);
            return [EarthlyBranch.fromValue(((season * 3 + 10) % 12) + 1)];
        });
        SymbolicStarStep.add(calculators, SymbolicStar.MarriageBed, (_, hi) => {
            switch (findHexagramBody(hi)?.fivePhase.value) {
                case 1:
                    return [EarthlyBranch.Hai, EarthlyBranch.Zi];
                case 2:
                    return [EarthlyBranch.Yin, EarthlyBranch.Mao];
                case 3:
                    return [EarthlyBranch.Si, EarthlyBranch.Wu];
                case 4:
                    return [EarthlyBranch.Chen, EarthlyBranch.Xu, EarthlyBranch.Chou, EarthlyBranch.Wei];
                case 5:
                    return [EarthlyBranch.Shen, EarthlyBranch.You];
                default:
                    return [];
            }
        });
        SymbolicStarStep.add(calculators, SymbolicStar.BridalChamber, (_, hi) => {
            switch (findHexagramBody(hi)?.fivePhase.value) {
                case 1:
                    return [EarthlyBranch.Yin, EarthlyBranch.Mao];
                case 2:
                    return [EarthlyBranch.Si, EarthlyBranch.Wu];
                case 3:
                    return [EarthlyBranch.Chen, EarthlyBranch.Xu, EarthlyBranch.Chou, EarthlyBranch.Wei];
                case 4:
                    return [EarthlyBranch.Shen, EarthlyBranch.You];
                case 5:
                    return [EarthlyBranch.Hai, EarthlyBranch.Zi];
                default:
                    return [];
            }
        });
        return calculators;
    }
    static add(calculators, symbolicStar, calculator) {
        if (!calculators.has(symbolicStar)) {
            calculators.set(symbolicStar, calculator);
        }
    }
    static calculateStemStar(dayStem, table) {
        return EarthlyBranch.fromValue(table[dayStem.value - 1]);
    }
    static calculateTrinityCombinationBranch(dayBranch, offset) {
        let changSheng;
        switch (dayBranch.value % 4) {
            case 1:
                changSheng = EarthlyBranch.Shen.value;
                break;
            case 2:
                changSheng = EarthlyBranch.Si.value;
                break;
            case 3:
                changSheng = EarthlyBranch.Yin.value;
                break;
            case 0:
                changSheng = EarthlyBranch.Hai.value;
                break;
            default:
                throw new ArgumentException("Invalid dayBranch", "dayBranch");
        }
        return EarthlyBranch.fromValue(((changSheng + offset - 1) % 12) + 1);
    }
}
export class SixLineDivinationBuilder {
    castingMethod = null;
    steps = [];
    stepTypes = new Set();
    requiresSorting = false;
    useMethod(castingMethod) {
        this.castingMethod = castingMethod;
        return this;
    }
    withDefaultSteps() {
        const hadExistingSteps = this.steps.length > 0;
        this.addStep(new NajiaStep());
        this.addStep(new PositionStep());
        this.addStep(new SixKinStep());
        this.addStep(new SixSpiritStep());
        this.addStep(new HiddenDeityStep());
        this.addStep(new SymbolicStarStep());
        if (hadExistingSteps) {
            this.requiresSorting = true;
        }
        return this;
    }
    withStep(structuringStep) {
        if (this.addStep(structuringStep)) {
            this.requiresSorting = true;
        }
        return this;
    }
    build() {
        if (this.castingMethod === null) {
            throw new InvalidOperationException("起卦方式ICastingMethod尚未指定。");
        }
        const seed = this.castingMethod.cast();
        const context = new DivinationContext(seed);
        const sortedSteps = this.requiresSorting ? this.sortSteps() : this.steps;
        for (const step of sortedSteps) {
            step.execute(context);
        }
        return context.sixLineDivination;
    }
    sortSteps() {
        const stepDict = new Map(this.steps.map((step) => [step.constructor, step]));
        const visited = new Set();
        const visiting = new Set();
        const sorted = [];
        const visit = (step) => {
            const stepType = step.constructor;
            if (visited.has(stepType)) {
                return;
            }
            if (visiting.has(stepType)) {
                throw new InvalidOperationException(`检测到循环依赖步骤: ${stepType.name}`);
            }
            visiting.add(stepType);
            for (const depType of step.requiredSteps) {
                const depStep = stepDict.get(depType);
                if (!depStep) {
                    throw new InvalidOperationException(`缺少必要的依赖步骤: ${depType.name}`);
                }
                visit(depStep);
            }
            visiting.delete(stepType);
            visited.add(stepType);
            sorted.push(step);
        };
        for (const step of this.steps) {
            visit(step);
        }
        return sorted;
    }
    addStep(structuringStep) {
        const stepType = structuringStep.constructor;
        if (this.stepTypes.has(stepType)) {
            return false;
        }
        this.stepTypes.add(stepType);
        this.steps.push(structuringStep);
        return true;
    }
}
export function getHexagramNature(hexagram) {
    return natureMap.get(hexagram) ?? null;
}
export function toNuclear(hexagram) {
    const value = hexagram.value;
    const lowerValue = (value >> 1) & 0b111;
    const upperValue = (value >> 2) & 0b111;
    return Hexagram.fromValue((upperValue << 3) | lowerValue);
}
export function toOpposite(hexagram) {
    return Hexagram.fromValue(~hexagram.value & 0b111111);
}
export function toInverted(hexagram) {
    let invertedValue = 0;
    for (let i = 0; i < 6; i++) {
        if (((hexagram.value >> i) & 1) === 1) {
            invertedValue |= 1 << (5 - i);
        }
    }
    return Hexagram.fromValue(invertedValue);
}
export function findHexagramBody(hexagram) {
    const worldLine = hexagram.lines.find((line) => line.position === Position.Worldly);
    if (!worldLine) {
        return null;
    }
    const startBranch = worldLine.yinYang === YinYang.Yang ? EarthlyBranch.Zi : EarthlyBranch.Wu;
    const offset = worldLine.linePosition.toArrayIndex();
    return EarthlyBranch.fromValue(((startBranch.value + offset - 1) % 12) + 1);
}
const natureMap = new Map([
    [Hexagram.TheCreative, HexagramNature.SixClashes],
    [Hexagram.TheJoyous, HexagramNature.SixClashes],
    [Hexagram.TheClinging, HexagramNature.SixClashes],
    [Hexagram.TheArousing, HexagramNature.SixClashes],
    [Hexagram.TheGentle, HexagramNature.SixClashes],
    [Hexagram.TheAbysmal, HexagramNature.SixClashes],
    [Hexagram.KeepingStill, HexagramNature.SixClashes],
    [Hexagram.TheReceptive, HexagramNature.SixClashes],
    [Hexagram.Innocence, HexagramNature.SixClashes],
    [Hexagram.ThePowerOfTheGreat, HexagramNature.SixClashes],
    [Hexagram.Standstill, HexagramNature.SixHarmonies],
    [Hexagram.Peace, HexagramNature.SixHarmonies],
    [Hexagram.Limitation, HexagramNature.SixHarmonies],
    [Hexagram.Oppression, HexagramNature.SixHarmonies],
    [Hexagram.TheWanderer, HexagramNature.SixHarmonies],
    [Hexagram.Grace, HexagramNature.SixHarmonies],
    [Hexagram.Enthusiasm, HexagramNature.SixHarmonies],
    [Hexagram.Return, HexagramNature.SixHarmonies],
    [Hexagram.Progress, HexagramNature.WanderingSoul],
    [Hexagram.PreponderanceOfTheSmall, HexagramNature.WanderingSoul],
    [Hexagram.Conflict, HexagramNature.WanderingSoul],
    [Hexagram.PreponderanceOfTheGreat, HexagramNature.WanderingSoul],
    [Hexagram.TheCornersOfTheMouth, HexagramNature.WanderingSoul],
    [Hexagram.DarkeningOfTheLight, HexagramNature.WanderingSoul],
    [Hexagram.InnerTruth, HexagramNature.WanderingSoul],
    [Hexagram.Waiting, HexagramNature.WanderingSoul],
    [Hexagram.PossessionInGreatMeasure, HexagramNature.ReturningSoul],
    [Hexagram.TheMarryingMaiden, HexagramNature.ReturningSoul],
    [Hexagram.FellowshipWithMen, HexagramNature.ReturningSoul],
    [Hexagram.Following, HexagramNature.ReturningSoul],
    [Hexagram.WorkOnTheDecayed, HexagramNature.ReturningSoul],
    [Hexagram.TheArmy, HexagramNature.ReturningSoul],
    [Hexagram.Development, HexagramNature.ReturningSoul],
    [Hexagram.HoldingTogether, HexagramNature.ReturningSoul]
]);
function parseOffsetMinutes(offset) {
    if (offset === "Z") {
        return 0;
    }
    const sign = offset[0] === "-" ? -1 : 1;
    const clean = offset.slice(1).replace(":", "");
    return sign * (Number(clean.slice(0, 2)) * 60 + Number(clean.slice(2, 4)));
}
function pad(value, size = 2) {
    return value.toString().padStart(size, "0");
}
function translate(typeName, label, culture) {
    return IChingTranslationManager.getTranslation(typeName, label, culture) ?? label;
}
function formatEarthlyBranches(branches, culture) {
    return branches.length === 0 ? "_" : branches.map((branch) => branch.toString(culture)).join("、");
}
//# sourceMappingURL=divination.js.map