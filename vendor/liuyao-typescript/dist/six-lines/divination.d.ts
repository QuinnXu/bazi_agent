import { EarthlyBranch, FivePhase, FourSymbol, Hexagram, StemBranch, YinYang } from "../core/elements.js";
import { type CultureInput } from "../core/localization.js";
import { HexagramNature, LinePosition, Position, SixKin, SixSpirit, SymbolicStar } from "./elements.js";
export type DateTimeOffsetInput = DateTimeOffset | Date | string | DateTimeOffsetParts;
export interface DateTimeOffsetParts {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
    offsetMinutes?: number;
}
export declare class DateTimeOffset {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
    readonly offsetMinutes: number;
    constructor(parts: DateTimeOffsetParts);
    static from(input: DateTimeOffsetInput): DateTimeOffset;
    static parse(value: string): DateTimeOffset;
    addDays(days: number): DateTimeOffset;
    equals(other: DateTimeOffsetInput): boolean;
    toISO(): string;
    format(pattern: string): string;
    toString(): string;
}
export declare class LunarStemBranch {
    readonly year: StemBranch;
    readonly month: StemBranch;
    readonly day: StemBranch;
    readonly hour: StemBranch;
    constructor(year: StemBranch, month: StemBranch, day: StemBranch, hour: StemBranch);
    toString(culture?: CultureInput): string;
}
export declare class CastingTime {
    readonly solar: DateTimeOffset;
    readonly lunar: DateTimeOffset;
    readonly stemBranch: LunarStemBranch;
    constructor(solar: DateTimeOffset, lunar: DateTimeOffset, stemBranch: LunarStemBranch);
    static convertFrom(dateTime: DateTimeOffsetInput): CastingTime;
}
export declare class Line {
    readonly linePosition: LinePosition;
    readonly yinYang: YinYang;
    private stemBranchValue;
    private sixKinValue;
    constructor(linePosition: LinePosition, yinYang: YinYang);
    isChanging: boolean;
    position: Position | null;
    sixSpirit: SixSpirit | null;
    hiddenDeity: HiddenDeityInfo | null;
    get fourSymbol(): FourSymbol;
    get stemBranch(): StemBranch;
    set stemBranch(value: StemBranch);
    tryGetStemBranch(): StemBranch | null;
    get sixKin(): SixKin;
    set sixKin(value: SixKin);
    tryGetSixKin(): SixKin | null;
    get hasHiddenDeity(): boolean;
    getStatement(hexagram: Hexagram, culture?: CultureInput): string;
    getImage(hexagram: Hexagram, culture?: CultureInput): string;
}
export declare class HiddenDeityInfo {
    readonly stemBranch: StemBranch;
    readonly sixKin: SixKin;
    private constructor();
    static fromLine(line: Line): HiddenDeityInfo;
}
export declare class HexagramInstance {
    readonly meta: Hexagram;
    readonly lines: Line[];
    constructor(meta: Hexagram);
    at(index: number): Line;
}
export declare class SymbolicStarCollection {
    private readonly symbolicStars;
    constructor(symbolicStars: Map<SymbolicStar, EarthlyBranch[]>);
    getStars(symbolicStar: SymbolicStar): EarthlyBranch[] | null;
    tryGetStarsMemory(symbolicStar: SymbolicStar): readonly EarthlyBranch[] | null;
    hasStar(branch: EarthlyBranch, symbolicStar: SymbolicStar): boolean;
    getStarsForBranch(branch: EarthlyBranch): SymbolicStar[];
    get allStars(): Map<SymbolicStar, EarthlyBranch[]>;
    add(symbolicStar: SymbolicStar, calculator: () => EarthlyBranch[]): boolean;
    remove(symbolicStar: SymbolicStar): boolean;
}
export declare class SixLineDivination {
    readonly castingTime: CastingTime;
    readonly original: HexagramInstance;
    readonly changed: HexagramInstance | null;
    symbolicStars: SymbolicStarCollection | null;
    constructor(castingTime: CastingTime, original: HexagramInstance, changed?: HexagramInstance | null);
    static createBuilder(): SixLineDivinationBuilder;
    static create(castingTime: DateTimeOffsetInput): SixLineDivination;
    static create(castingTime: DateTimeOffsetInput, fourSymbols: readonly FourSymbol[]): SixLineDivination;
    static create(castingTime: DateTimeOffsetInput, fourSymbolValues: readonly number[]): SixLineDivination;
    static create(castingTime: DateTimeOffsetInput, original: Hexagram, changed?: Hexagram | null): SixLineDivination;
    static create(castingTime: DateTimeOffsetInput, upperTrigramNumber: number, lowerTrigramNumber: number, changingLineNumber?: number | null): SixLineDivination;
    static createByTime(castingTime: DateTimeOffsetInput): SixLineDivination;
    static createFromFourSymbols(castingTime: DateTimeOffsetInput, fourSymbols: readonly FourSymbol[]): SixLineDivination;
    static createFromFourSymbolValues(castingTime: DateTimeOffsetInput, fourSymbolValues: readonly number[]): SixLineDivination;
    static createFromNumbers(castingTime: DateTimeOffsetInput, upperTrigramNumber: number, lowerTrigramNumber: number, changingLineNumber?: number | null): SixLineDivination;
    static createFromHexagrams(castingTime: DateTimeOffsetInput, original: Hexagram, changed?: Hexagram | null): SixLineDivination;
    static createFromHexagramValues(castingTime: DateTimeOffsetInput, originalValue: number, changedValue?: number | null): SixLineDivination;
    toString(culture?: CultureInput): string;
}
export interface ICastingMethod {
    cast(): SixLineDivination;
}
export interface IStructuringStep {
    readonly requiredSteps: readonly StepConstructor[];
    execute(context: DivinationContext): void;
}
export type StepConstructor = abstract new (...args: never[]) => IStructuringStep;
export declare class DivinationContext {
    readonly sixLineDivination: SixLineDivination;
    constructor(sixLineDivination: SixLineDivination);
}
export declare class TimeBasedCastingMethod implements ICastingMethod {
    private readonly castingTime;
    constructor(castingTime: DateTimeOffsetInput);
    cast(): SixLineDivination;
}
export declare class CoinCastingMethod implements ICastingMethod {
    private readonly castingTime;
    private readonly fourSymbols;
    constructor(castingTime: DateTimeOffsetInput, fourSymbols: readonly FourSymbol[]);
    cast(): SixLineDivination;
    static createDivination(castingTime: CastingTime, fourSymbols: readonly FourSymbol[]): SixLineDivination;
}
export declare class NumberBasedCastingMethod implements ICastingMethod {
    private readonly castingTime;
    private readonly upperTrigramNumber;
    private readonly lowerTrigramNumber;
    private readonly changingLineNumber;
    constructor(castingTime: DateTimeOffsetInput, upperTrigramNumber: number, lowerTrigramNumber: number, changingLineNumber?: number | null);
    cast(): SixLineDivination;
    static createDivination(castingTime: CastingTime, upperTrigramNumber: number, lowerTrigramNumber: number, changingLineNumber: number | null): SixLineDivination;
    private static getTrigramByNumber;
    private static getChangingLinePosition;
}
export declare class SpecifyingHexagramCastingMethod implements ICastingMethod {
    private readonly castingTime;
    private readonly original;
    private readonly changed;
    constructor(castingTime: DateTimeOffsetInput, original: Hexagram, changed?: Hexagram | null);
    cast(): SixLineDivination;
    static createDivination(castingTime: CastingTime, original: Hexagram, changed: Hexagram | null): SixLineDivination;
    private static applyChangingLines;
}
export declare class NajiaStep implements IStructuringStep {
    readonly requiredSteps: readonly [];
    private static readonly stemTable;
    private static readonly branchTable;
    execute(context: DivinationContext): void;
    static bind(hexagram: HexagramInstance): void;
}
export declare class PositionStep implements IStructuringStep {
    readonly requiredSteps: readonly [];
    private static readonly worldlyPositions;
    execute(context: DivinationContext): void;
    private static getPositionIndices;
}
export declare class SixKinStep implements IStructuringStep {
    readonly requiredSteps: readonly [typeof NajiaStep];
    execute(context: DivinationContext): void;
    static getSixKin(palacePhase: FivePhase, linePhase: FivePhase): SixKin;
}
export declare class SixSpiritStep implements IStructuringStep {
    readonly requiredSteps: readonly [];
    private static readonly spiritsOrder;
    execute(context: DivinationContext): void;
    private static getStartIndex;
}
export declare class HiddenDeityStep implements IStructuringStep {
    readonly requiredSteps: readonly [typeof SixKinStep];
    private static readonly palaceTemplateCache;
    execute(context: DivinationContext): void;
    private static getOrCreatePalaceTemplate;
    private static createPalaceTemplate;
}
export declare class SymbolicStarStep implements IStructuringStep {
    readonly requiredSteps: readonly [];
    private static readonly noblemanTable;
    private static readonly salarySpiritTable;
    private static readonly cultureFlourishTable;
    private static readonly yangBladeTable;
    private static readonly calculators;
    execute(context: DivinationContext): void;
    private static createCalculators;
    private static add;
    private static calculateStemStar;
    private static calculateTrinityCombinationBranch;
}
export declare class SixLineDivinationBuilder {
    private castingMethod;
    private readonly steps;
    private readonly stepTypes;
    private requiresSorting;
    useMethod(castingMethod: ICastingMethod): this;
    withDefaultSteps(): this;
    withStep(structuringStep: IStructuringStep): this;
    build(): SixLineDivination;
    private sortSteps;
    private addStep;
}
export declare function getHexagramNature(hexagram: Hexagram): HexagramNature | null;
export declare function toNuclear(hexagram: Hexagram): Hexagram;
export declare function toOpposite(hexagram: Hexagram): Hexagram;
export declare function toInverted(hexagram: Hexagram): Hexagram;
export declare function findHexagramBody(hexagram: HexagramInstance): EarthlyBranch | null;
