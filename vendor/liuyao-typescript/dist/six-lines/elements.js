import { IChingElement, createElementsByValue, fromElementValue } from "../core/element.js";
export class LinePosition extends IChingElement {
    constructor(value, label) {
        super(value, label, "LinePosition");
    }
    static First = new LinePosition(1, "First");
    static Second = new LinePosition(2, "Second");
    static Third = new LinePosition(3, "Third");
    static Fourth = new LinePosition(4, "Fourth");
    static Fifth = new LinePosition(5, "Fifth");
    static Sixth = new LinePosition(6, "Sixth");
    static allElements = [
        LinePosition.First,
        LinePosition.Second,
        LinePosition.Third,
        LinePosition.Fourth,
        LinePosition.Fifth,
        LinePosition.Sixth
    ];
    static elementsByValue = createElementsByValue(LinePosition.allElements);
    static getAll() {
        return LinePosition.allElements;
    }
    static fromValue(value) {
        return fromElementValue("LinePosition", LinePosition.elementsByValue, value);
    }
    static fromArrayIndex(arrayIndex) {
        switch (arrayIndex) {
            case 0:
                return LinePosition.First;
            case 1:
                return LinePosition.Second;
            case 2:
                return LinePosition.Third;
            case 3:
                return LinePosition.Fourth;
            case 4:
                return LinePosition.Fifth;
            case 5:
                return LinePosition.Sixth;
            default:
                throw new RangeError("数组索引必须在 0-5 范围内");
        }
    }
    toArrayIndex() {
        return this.value - 1;
    }
}
export class HexagramNature extends IChingElement {
    constructor(value, label) {
        super(value, label, "HexagramNature");
    }
    static SixClashes = new HexagramNature(1, "SixClashes");
    static SixHarmonies = new HexagramNature(2, "SixHarmonies");
    static WanderingSoul = new HexagramNature(3, "WanderingSoul");
    static ReturningSoul = new HexagramNature(4, "ReturningSoul");
    static allElements = [
        HexagramNature.SixClashes,
        HexagramNature.SixHarmonies,
        HexagramNature.WanderingSoul,
        HexagramNature.ReturningSoul
    ];
    static elementsByValue = createElementsByValue(HexagramNature.allElements);
    static getAll() {
        return HexagramNature.allElements;
    }
    static fromValue(value) {
        return fromElementValue("HexagramNature", HexagramNature.elementsByValue, value);
    }
}
export class Position extends IChingElement {
    constructor(value, label) {
        super(value, label, "Position");
    }
    static Worldly = new Position(1, "Worldly");
    static Corresponding = new Position(2, "Corresponding");
    static allElements = [Position.Worldly, Position.Corresponding];
    static elementsByValue = createElementsByValue(Position.allElements);
    static getAll() {
        return Position.allElements;
    }
    static fromValue(value) {
        return fromElementValue("Position", Position.elementsByValue, value);
    }
}
export class SixKin extends IChingElement {
    constructor(value, label) {
        super(value, label, "SixKin");
    }
    static Parent = new SixKin(1, "Parent");
    static Sibling = new SixKin(2, "Sibling");
    static Wealth = new SixKin(3, "Wealth");
    static Officer = new SixKin(4, "Officer");
    static Offspring = new SixKin(5, "Offspring");
    static allElements = [
        SixKin.Parent,
        SixKin.Sibling,
        SixKin.Wealth,
        SixKin.Officer,
        SixKin.Offspring
    ];
    static elementsByValue = createElementsByValue(SixKin.allElements);
    static getAll() {
        return SixKin.allElements;
    }
    static fromValue(value) {
        return fromElementValue("SixKin", SixKin.elementsByValue, value);
    }
}
export class SixSpirit extends IChingElement {
    constructor(value, label) {
        super(value, label, "SixSpirit");
    }
    static AzureDragon = new SixSpirit(1, "AzureDragon");
    static VermilionBird = new SixSpirit(2, "VermilionBird");
    static HookChen = new SixSpirit(3, "HookChen");
    static CoiledSnake = new SixSpirit(4, "CoiledSnake");
    static WhiteTiger = new SixSpirit(5, "WhiteTiger");
    static BlackTortoise = new SixSpirit(6, "BlackTortoise");
    static allElements = [
        SixSpirit.AzureDragon,
        SixSpirit.VermilionBird,
        SixSpirit.HookChen,
        SixSpirit.CoiledSnake,
        SixSpirit.WhiteTiger,
        SixSpirit.BlackTortoise
    ];
    static elementsByValue = createElementsByValue(SixSpirit.allElements);
    static getAll() {
        return SixSpirit.allElements;
    }
    static fromValue(value) {
        return fromElementValue("SixSpirit", SixSpirit.elementsByValue, value);
    }
}
export class SymbolicStar extends IChingElement {
    static nextCustomValue = 17;
    constructor(value, label) {
        super(value, label, "SymbolicStar");
    }
    static Nobleman = new SymbolicStar(1, "Nobleman");
    static SalarySpirit = new SymbolicStar(2, "SalarySpirit");
    static CultureFlourish = new SymbolicStar(3, "CultureFlourish");
    static PostHorse = new SymbolicStar(4, "PostHorse");
    static PeachBlossom = new SymbolicStar(5, "PeachBlossom");
    static YangBlade = new SymbolicStar(6, "YangBlade");
    static RobberyMalignity = new SymbolicStar(7, "RobberyMalignity");
    static DisasterMalignity = new SymbolicStar(8, "DisasterMalignity");
    static GeneralsStar = new SymbolicStar(9, "GeneralsStar");
    static Canopy = new SymbolicStar(10, "Canopy");
    static StarOfStrategy = new SymbolicStar(11, "StarOfStrategy");
    static DeathSpirit = new SymbolicStar(12, "DeathSpirit");
    static CelestialPhysician = new SymbolicStar(13, "CelestialPhysician");
    static HeavenlyJoy = new SymbolicStar(14, "HeavenlyJoy");
    static MarriageBed = new SymbolicStar(15, "MarriageBed");
    static BridalChamber = new SymbolicStar(16, "BridalChamber");
    static allElements = [
        SymbolicStar.Nobleman,
        SymbolicStar.SalarySpirit,
        SymbolicStar.CultureFlourish,
        SymbolicStar.YangBlade,
        SymbolicStar.PostHorse,
        SymbolicStar.PeachBlossom,
        SymbolicStar.GeneralsStar,
        SymbolicStar.Canopy,
        SymbolicStar.StarOfStrategy,
        SymbolicStar.DisasterMalignity,
        SymbolicStar.RobberyMalignity,
        SymbolicStar.DeathSpirit,
        SymbolicStar.CelestialPhysician,
        SymbolicStar.HeavenlyJoy,
        SymbolicStar.MarriageBed,
        SymbolicStar.BridalChamber
    ];
    static elementsByValue = createElementsByValue(SymbolicStar.allElements);
    static getAll() {
        return SymbolicStar.allElements;
    }
    static fromValue(value) {
        return fromElementValue("SymbolicStar", SymbolicStar.elementsByValue, value);
    }
    static createCustom(name) {
        if (SymbolicStar.nextCustomValue > 255) {
            throw new Error("自定义神煞值已达到上限。");
        }
        return new SymbolicStar(SymbolicStar.nextCustomValue++, name);
    }
}
//# sourceMappingURL=elements.js.map