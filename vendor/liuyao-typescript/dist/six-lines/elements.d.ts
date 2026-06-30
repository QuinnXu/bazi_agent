import { IChingElement } from "../core/element.js";
export declare class LinePosition extends IChingElement<LinePosition> {
    private constructor();
    static readonly First: LinePosition;
    static readonly Second: LinePosition;
    static readonly Third: LinePosition;
    static readonly Fourth: LinePosition;
    static readonly Fifth: LinePosition;
    static readonly Sixth: LinePosition;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly LinePosition[];
    static fromValue(value: number): LinePosition;
    static fromArrayIndex(arrayIndex: number): LinePosition;
    toArrayIndex(): number;
}
export declare class HexagramNature extends IChingElement<HexagramNature> {
    private constructor();
    static readonly SixClashes: HexagramNature;
    static readonly SixHarmonies: HexagramNature;
    static readonly WanderingSoul: HexagramNature;
    static readonly ReturningSoul: HexagramNature;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly HexagramNature[];
    static fromValue(value: number): HexagramNature;
}
export declare class Position extends IChingElement<Position> {
    private constructor();
    static readonly Worldly: Position;
    static readonly Corresponding: Position;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly Position[];
    static fromValue(value: number): Position;
}
export declare class SixKin extends IChingElement<SixKin> {
    private constructor();
    static readonly Parent: SixKin;
    static readonly Sibling: SixKin;
    static readonly Wealth: SixKin;
    static readonly Officer: SixKin;
    static readonly Offspring: SixKin;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly SixKin[];
    static fromValue(value: number): SixKin;
}
export declare class SixSpirit extends IChingElement<SixSpirit> {
    private constructor();
    static readonly AzureDragon: SixSpirit;
    static readonly VermilionBird: SixSpirit;
    static readonly HookChen: SixSpirit;
    static readonly CoiledSnake: SixSpirit;
    static readonly WhiteTiger: SixSpirit;
    static readonly BlackTortoise: SixSpirit;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly SixSpirit[];
    static fromValue(value: number): SixSpirit;
}
export declare class SymbolicStar extends IChingElement<SymbolicStar> {
    private static nextCustomValue;
    private constructor();
    static readonly Nobleman: SymbolicStar;
    static readonly SalarySpirit: SymbolicStar;
    static readonly CultureFlourish: SymbolicStar;
    static readonly PostHorse: SymbolicStar;
    static readonly PeachBlossom: SymbolicStar;
    static readonly YangBlade: SymbolicStar;
    static readonly RobberyMalignity: SymbolicStar;
    static readonly DisasterMalignity: SymbolicStar;
    static readonly GeneralsStar: SymbolicStar;
    static readonly Canopy: SymbolicStar;
    static readonly StarOfStrategy: SymbolicStar;
    static readonly DeathSpirit: SymbolicStar;
    static readonly CelestialPhysician: SymbolicStar;
    static readonly HeavenlyJoy: SymbolicStar;
    static readonly MarriageBed: SymbolicStar;
    static readonly BridalChamber: SymbolicStar;
    private static readonly allElements;
    private static readonly elementsByValue;
    static getAll(): readonly SymbolicStar[];
    static fromValue(value: number): SymbolicStar;
    static createCustom(name: string): SymbolicStar;
}
