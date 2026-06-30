import { DateTimeOffset, SixLineDivination, type DateTimeOffsetInput } from "./six-lines/divination.js";
import { FivePhase } from "./core/elements.js";
export type CastingMode = "symbols" | "numbers" | "hexagram";
export interface SymbolCastingInput {
    mode: "symbols";
    castingTime: DateTimeOffsetInput;
    values: readonly number[];
}
export interface NumberCastingInput {
    mode: "numbers";
    castingTime: DateTimeOffsetInput;
    upper: number;
    lower: number;
    changing?: number | null;
}
export interface HexagramCastingInput {
    mode: "hexagram";
    castingTime: DateTimeOffsetInput;
    originalValue: number;
    changedValue?: number | null;
}
export type CastingInput = SymbolCastingInput | NumberCastingInput | HexagramCastingInput;
export interface LineView {
    position: string;
    yinYang: string;
    fourSymbol: string;
    changing: boolean;
    stemBranch: string;
    fivePhase: string;
    sixKin: string;
    sixSpirit: string;
    worldPosition: string;
    hiddenDeity: string;
}
export interface FivePhaseStateView {
    fivePhase: string;
    state: string;
}
export interface DivinationView {
    title: string;
    solar: string;
    lunar: string;
    stemBranch: string;
    dayEmptiness: string;
    original: string;
    changed: string;
    palace: string;
    palaceFivePhase: string;
    lines: LineView[];
    changedLines: Pick<LineView, "position" | "stemBranch" | "fivePhase" | "sixKin" | "sixSpirit">[];
    fivePhaseStates: FivePhaseStateView[];
    stars: {
        name: string;
        branches: string;
    }[];
    markdown: string;
}
export interface SelfCheckResult {
    ok: boolean;
    checks: {
        name: string;
        ok: boolean;
        actual: string;
        expected: string;
    }[];
}
export declare function castDivination(input: CastingInput): SixLineDivination;
export declare function createDateTimeOffset(localValue: string, offsetMinutes: number): DateTimeOffset;
export declare function toDivinationView(divination: SixLineDivination, culture?: string): DivinationView;
export declare function getFivePhaseStates(monthPhase: FivePhase, culture?: string): FivePhaseStateView[];
export declare function runSelfCheck(): SelfCheckResult;
export declare function getHexagramOptions(culture?: string): {
    value: number;
    label: string;
}[];
export declare function getFourSymbolOptions(culture?: string): {
    value: number;
    label: string;
}[];
