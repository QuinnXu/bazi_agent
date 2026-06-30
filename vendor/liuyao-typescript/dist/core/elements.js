import { IChingTranslationManager } from "./localization.js";
import { IChingElement, createElementsByValue, fromElementValue } from "./element.js";
export class YinYang extends IChingElement {
    constructor(value, label) {
        super(value, label, "YinYang");
    }
    static Yin = new YinYang(0, "Yin");
    static Yang = new YinYang(1, "Yang");
    static allElements = [YinYang.Yin, YinYang.Yang];
    static elementsByValue = createElementsByValue(YinYang.allElements);
    static getAll() {
        return YinYang.allElements;
    }
    static fromValue(value) {
        return fromElementValue("YinYang", YinYang.elementsByValue, value);
    }
}
export class FivePhase extends IChingElement {
    constructor(value, label) {
        super(value, label, "FivePhase");
    }
    static Metal = new FivePhase(1, "Metal");
    static Water = new FivePhase(2, "Water");
    static Wood = new FivePhase(3, "Wood");
    static Fire = new FivePhase(4, "Fire");
    static Earth = new FivePhase(5, "Earth");
    static allElements = [
        FivePhase.Metal,
        FivePhase.Water,
        FivePhase.Wood,
        FivePhase.Fire,
        FivePhase.Earth
    ];
    static elementsByValue = createElementsByValue(FivePhase.allElements);
    static generatesMap = new Map([
        [FivePhase.Wood.value, FivePhase.Fire.value],
        [FivePhase.Fire.value, FivePhase.Earth.value],
        [FivePhase.Earth.value, FivePhase.Metal.value],
        [FivePhase.Metal.value, FivePhase.Water.value],
        [FivePhase.Water.value, FivePhase.Wood.value]
    ]);
    static generatesByMap = invertMap(FivePhase.generatesMap);
    static restrainsMap = new Map([
        [FivePhase.Wood.value, FivePhase.Earth.value],
        [FivePhase.Earth.value, FivePhase.Water.value],
        [FivePhase.Water.value, FivePhase.Fire.value],
        [FivePhase.Fire.value, FivePhase.Metal.value],
        [FivePhase.Metal.value, FivePhase.Wood.value]
    ]);
    static restrainsByMap = invertMap(FivePhase.restrainsMap);
    static getAll() {
        return FivePhase.allElements;
    }
    static fromValue(value) {
        return fromElementValue("FivePhase", FivePhase.elementsByValue, value);
    }
    isGenerates(other) {
        return this.generates(other);
    }
    generates(other) {
        return FivePhase.generatesMap.get(this.value) === other.value;
    }
    generatesBy(other) {
        return FivePhase.generatesByMap.get(this.value) === other.value;
    }
    isRestrains(other) {
        return this.restrains(other);
    }
    restrains(other) {
        return FivePhase.restrainsMap.get(this.value) === other.value;
    }
    restrainsBy(other) {
        return FivePhase.restrainsByMap.get(this.value) === other.value;
    }
}
export class FourSymbol extends IChingElement {
    yinYang;
    constructor(value, label, yinYang) {
        super(value, label, "FourSymbol");
        this.yinYang = yinYang;
    }
    get isChanging() {
        return this.value === 6 || this.value === 9;
    }
    static OldYin = new FourSymbol(6, "OldYin", YinYang.Yin);
    static YoungYang = new FourSymbol(7, "YoungYang", YinYang.Yang);
    static YoungYin = new FourSymbol(8, "YoungYin", YinYang.Yin);
    static OldYang = new FourSymbol(9, "OldYang", YinYang.Yang);
    static allElements = [
        FourSymbol.OldYin,
        FourSymbol.YoungYang,
        FourSymbol.YoungYin,
        FourSymbol.OldYang
    ];
    static elementsByValue = createElementsByValue(FourSymbol.allElements);
    static getAll() {
        return FourSymbol.allElements;
    }
    static fromValue(value) {
        return fromElementValue("FourSymbol", FourSymbol.elementsByValue, value);
    }
}
export class Trigram extends IChingElement {
    fivePhase;
    constructor(value, label, fivePhase) {
        super(value, label, "Trigram");
        this.fivePhase = fivePhase;
    }
    static Qian = new Trigram(0b111, "Qian", FivePhase.Metal);
    static Dui = new Trigram(0b011, "Dui", FivePhase.Metal);
    static Li = new Trigram(0b101, "Li", FivePhase.Fire);
    static Zhen = new Trigram(0b001, "Zhen", FivePhase.Wood);
    static Xun = new Trigram(0b110, "Xun", FivePhase.Wood);
    static Kan = new Trigram(0b010, "Kan", FivePhase.Water);
    static Gen = new Trigram(0b100, "Gen", FivePhase.Earth);
    static Kun = new Trigram(0b000, "Kun", FivePhase.Earth);
    static allElements = [
        Trigram.Qian,
        Trigram.Dui,
        Trigram.Li,
        Trigram.Zhen,
        Trigram.Xun,
        Trigram.Kan,
        Trigram.Gen,
        Trigram.Kun
    ];
    static elementsByValue = createElementsByValue(Trigram.allElements);
    static getAll() {
        return Trigram.allElements;
    }
    static fromValue(value) {
        return fromElementValue("Trigram", Trigram.elementsByValue, value);
    }
}
export class Hexagram extends IChingElement {
    upper;
    lower;
    palace;
    constructor(upper, lower, label, palace) {
        super((upper.value << 3) | lower.value, label, "Hexagram");
        this.upper = upper;
        this.lower = lower;
        this.palace = palace;
    }
    static TheCreative = new Hexagram(Trigram.Qian, Trigram.Qian, "TheCreative", Trigram.Qian);
    static ComingToMeet = new Hexagram(Trigram.Qian, Trigram.Xun, "ComingToMeet", Trigram.Qian);
    static Retreat = new Hexagram(Trigram.Qian, Trigram.Gen, "Retreat", Trigram.Qian);
    static Standstill = new Hexagram(Trigram.Qian, Trigram.Kun, "Standstill", Trigram.Qian);
    static Contemplation = new Hexagram(Trigram.Xun, Trigram.Kun, "Contemplation", Trigram.Qian);
    static SplittingApart = new Hexagram(Trigram.Gen, Trigram.Kun, "SplittingApart", Trigram.Qian);
    static Progress = new Hexagram(Trigram.Li, Trigram.Kun, "Progress", Trigram.Qian);
    static PossessionInGreatMeasure = new Hexagram(Trigram.Li, Trigram.Qian, "PossessionInGreatMeasure", Trigram.Qian);
    static TheJoyous = new Hexagram(Trigram.Dui, Trigram.Dui, "TheJoyous", Trigram.Dui);
    static Oppression = new Hexagram(Trigram.Dui, Trigram.Kan, "Oppression", Trigram.Dui);
    static GatheringTogether = new Hexagram(Trigram.Dui, Trigram.Kun, "GatheringTogether", Trigram.Dui);
    static Influence = new Hexagram(Trigram.Dui, Trigram.Gen, "Influence", Trigram.Dui);
    static Obstruction = new Hexagram(Trigram.Kan, Trigram.Gen, "Obstruction", Trigram.Dui);
    static Modesty = new Hexagram(Trigram.Kun, Trigram.Gen, "Modesty", Trigram.Dui);
    static PreponderanceOfTheSmall = new Hexagram(Trigram.Zhen, Trigram.Gen, "PreponderanceOfTheSmall", Trigram.Dui);
    static TheMarryingMaiden = new Hexagram(Trigram.Zhen, Trigram.Dui, "TheMarryingMaiden", Trigram.Dui);
    static TheClinging = new Hexagram(Trigram.Li, Trigram.Li, "TheClinging", Trigram.Li);
    static TheWanderer = new Hexagram(Trigram.Li, Trigram.Gen, "TheWanderer", Trigram.Li);
    static TheCauldron = new Hexagram(Trigram.Li, Trigram.Xun, "TheCauldron", Trigram.Li);
    static BeforeCompletion = new Hexagram(Trigram.Li, Trigram.Kan, "BeforeCompletion", Trigram.Li);
    static YouthfulFolly = new Hexagram(Trigram.Gen, Trigram.Kan, "YouthfulFolly", Trigram.Li);
    static Dispersion = new Hexagram(Trigram.Xun, Trigram.Kan, "Dispersion", Trigram.Li);
    static Conflict = new Hexagram(Trigram.Qian, Trigram.Kan, "Conflict", Trigram.Li);
    static FellowshipWithMen = new Hexagram(Trigram.Qian, Trigram.Li, "FellowshipWithMen", Trigram.Li);
    static TheArousing = new Hexagram(Trigram.Zhen, Trigram.Zhen, "TheArousing", Trigram.Zhen);
    static Enthusiasm = new Hexagram(Trigram.Zhen, Trigram.Kun, "Enthusiasm", Trigram.Zhen);
    static Deliverance = new Hexagram(Trigram.Zhen, Trigram.Kan, "Deliverance", Trigram.Zhen);
    static Duration = new Hexagram(Trigram.Zhen, Trigram.Xun, "Duration", Trigram.Zhen);
    static PushingUpward = new Hexagram(Trigram.Kun, Trigram.Xun, "PushingUpward", Trigram.Zhen);
    static TheWell = new Hexagram(Trigram.Kan, Trigram.Xun, "TheWell", Trigram.Zhen);
    static PreponderanceOfTheGreat = new Hexagram(Trigram.Dui, Trigram.Xun, "PreponderanceOfTheGreat", Trigram.Zhen);
    static Following = new Hexagram(Trigram.Dui, Trigram.Zhen, "Following", Trigram.Zhen);
    static TheGentle = new Hexagram(Trigram.Xun, Trigram.Xun, "TheGentle", Trigram.Xun);
    static TheTamingPowerOfTheSmall = new Hexagram(Trigram.Xun, Trigram.Qian, "TheTamingPowerOfTheSmall", Trigram.Xun);
    static TheFamily = new Hexagram(Trigram.Xun, Trigram.Li, "TheFamily", Trigram.Xun);
    static Increase = new Hexagram(Trigram.Xun, Trigram.Zhen, "Increase", Trigram.Xun);
    static Innocence = new Hexagram(Trigram.Qian, Trigram.Zhen, "Innocence", Trigram.Xun);
    static BitingThrough = new Hexagram(Trigram.Li, Trigram.Zhen, "BitingThrough", Trigram.Xun);
    static TheCornersOfTheMouth = new Hexagram(Trigram.Gen, Trigram.Zhen, "TheCornersOfTheMouth", Trigram.Xun);
    static WorkOnTheDecayed = new Hexagram(Trigram.Gen, Trigram.Xun, "WorkOnTheDecayed", Trigram.Xun);
    static TheAbysmal = new Hexagram(Trigram.Kan, Trigram.Kan, "TheAbysmal", Trigram.Kan);
    static Limitation = new Hexagram(Trigram.Kan, Trigram.Dui, "Limitation", Trigram.Kan);
    static DifficultyAtTheBeginning = new Hexagram(Trigram.Kan, Trigram.Zhen, "DifficultyAtTheBeginning", Trigram.Kan);
    static AfterCompletion = new Hexagram(Trigram.Kan, Trigram.Li, "AfterCompletion", Trigram.Kan);
    static Revolution = new Hexagram(Trigram.Dui, Trigram.Li, "Revolution", Trigram.Kan);
    static Abundance = new Hexagram(Trigram.Zhen, Trigram.Li, "Abundance", Trigram.Kan);
    static DarkeningOfTheLight = new Hexagram(Trigram.Kun, Trigram.Li, "DarkeningOfTheLight", Trigram.Kan);
    static TheArmy = new Hexagram(Trigram.Kun, Trigram.Kan, "TheArmy", Trigram.Kan);
    static KeepingStill = new Hexagram(Trigram.Gen, Trigram.Gen, "KeepingStill", Trigram.Gen);
    static Grace = new Hexagram(Trigram.Gen, Trigram.Li, "Grace", Trigram.Gen);
    static TheTamingPowerOfTheGreat = new Hexagram(Trigram.Gen, Trigram.Qian, "TheTamingPowerOfTheGreat", Trigram.Gen);
    static Decrease = new Hexagram(Trigram.Gen, Trigram.Dui, "Decrease", Trigram.Gen);
    static Opposition = new Hexagram(Trigram.Li, Trigram.Dui, "Opposition", Trigram.Gen);
    static Treading = new Hexagram(Trigram.Qian, Trigram.Dui, "Treading", Trigram.Gen);
    static InnerTruth = new Hexagram(Trigram.Xun, Trigram.Dui, "InnerTruth", Trigram.Gen);
    static Development = new Hexagram(Trigram.Xun, Trigram.Gen, "Development", Trigram.Gen);
    static TheReceptive = new Hexagram(Trigram.Kun, Trigram.Kun, "TheReceptive", Trigram.Kun);
    static Return = new Hexagram(Trigram.Kun, Trigram.Zhen, "Return", Trigram.Kun);
    static Approach = new Hexagram(Trigram.Kun, Trigram.Dui, "Approach", Trigram.Kun);
    static Peace = new Hexagram(Trigram.Kun, Trigram.Qian, "Peace", Trigram.Kun);
    static ThePowerOfTheGreat = new Hexagram(Trigram.Zhen, Trigram.Qian, "ThePowerOfTheGreat", Trigram.Kun);
    static BreakThrough = new Hexagram(Trigram.Dui, Trigram.Qian, "BreakThrough", Trigram.Kun);
    static Waiting = new Hexagram(Trigram.Kan, Trigram.Qian, "Waiting", Trigram.Kun);
    static HoldingTogether = new Hexagram(Trigram.Kan, Trigram.Kun, "HoldingTogether", Trigram.Kun);
    static allElements = [
        Hexagram.TheCreative,
        Hexagram.ComingToMeet,
        Hexagram.Retreat,
        Hexagram.Standstill,
        Hexagram.Contemplation,
        Hexagram.SplittingApart,
        Hexagram.Progress,
        Hexagram.PossessionInGreatMeasure,
        Hexagram.TheJoyous,
        Hexagram.Oppression,
        Hexagram.GatheringTogether,
        Hexagram.Influence,
        Hexagram.Obstruction,
        Hexagram.Modesty,
        Hexagram.PreponderanceOfTheSmall,
        Hexagram.TheMarryingMaiden,
        Hexagram.TheClinging,
        Hexagram.TheWanderer,
        Hexagram.TheCauldron,
        Hexagram.BeforeCompletion,
        Hexagram.YouthfulFolly,
        Hexagram.Dispersion,
        Hexagram.Conflict,
        Hexagram.FellowshipWithMen,
        Hexagram.TheArousing,
        Hexagram.Enthusiasm,
        Hexagram.Deliverance,
        Hexagram.Duration,
        Hexagram.PushingUpward,
        Hexagram.TheWell,
        Hexagram.PreponderanceOfTheGreat,
        Hexagram.Following,
        Hexagram.TheGentle,
        Hexagram.TheTamingPowerOfTheSmall,
        Hexagram.TheFamily,
        Hexagram.Increase,
        Hexagram.Innocence,
        Hexagram.BitingThrough,
        Hexagram.TheCornersOfTheMouth,
        Hexagram.WorkOnTheDecayed,
        Hexagram.TheAbysmal,
        Hexagram.Limitation,
        Hexagram.DifficultyAtTheBeginning,
        Hexagram.AfterCompletion,
        Hexagram.Revolution,
        Hexagram.Abundance,
        Hexagram.DarkeningOfTheLight,
        Hexagram.TheArmy,
        Hexagram.KeepingStill,
        Hexagram.Grace,
        Hexagram.TheTamingPowerOfTheGreat,
        Hexagram.Decrease,
        Hexagram.Opposition,
        Hexagram.Treading,
        Hexagram.InnerTruth,
        Hexagram.Development,
        Hexagram.TheReceptive,
        Hexagram.Return,
        Hexagram.Approach,
        Hexagram.Peace,
        Hexagram.ThePowerOfTheGreat,
        Hexagram.BreakThrough,
        Hexagram.Waiting,
        Hexagram.HoldingTogether
    ];
    static elementsByValue = createElementsByValue(Hexagram.allElements);
    static getAll() {
        return Hexagram.allElements;
    }
    static fromValue(value) {
        return fromElementValue("Hexagram", Hexagram.elementsByValue, value);
    }
    static create(upper, lower) {
        return Hexagram.fromValue((upper.value << 3) | lower.value);
    }
    getStatement(culture) {
        return IChingTranslationManager.getTranslation("Hexagram", `${this.value}.Statement`, culture) ?? "";
    }
    getCommentary(culture) {
        return IChingTranslationManager.getTranslation("Hexagram", `${this.value}.Commentary`, culture) ?? "";
    }
    getImage(culture) {
        return IChingTranslationManager.getTranslation("Hexagram", `${this.value}.Image`, culture) ?? "";
    }
}
export class HeavenlyStem extends IChingElement {
    yinYang;
    fivePhase;
    constructor(value, label, yinYang, fivePhase) {
        super(value, label, "HeavenlyStem");
        this.yinYang = yinYang;
        this.fivePhase = fivePhase;
    }
    static Jia = new HeavenlyStem(1, "Jia", YinYang.Yang, FivePhase.Wood);
    static Yi = new HeavenlyStem(2, "Yi", YinYang.Yin, FivePhase.Wood);
    static Bing = new HeavenlyStem(3, "Bing", YinYang.Yang, FivePhase.Fire);
    static Ding = new HeavenlyStem(4, "Ding", YinYang.Yin, FivePhase.Fire);
    static Wu = new HeavenlyStem(5, "Wu", YinYang.Yang, FivePhase.Earth);
    static Ji = new HeavenlyStem(6, "Ji", YinYang.Yin, FivePhase.Earth);
    static Geng = new HeavenlyStem(7, "Geng", YinYang.Yang, FivePhase.Metal);
    static Xin = new HeavenlyStem(8, "Xin", YinYang.Yin, FivePhase.Metal);
    static Ren = new HeavenlyStem(9, "Ren", YinYang.Yang, FivePhase.Water);
    static Gui = new HeavenlyStem(10, "Gui", YinYang.Yin, FivePhase.Water);
    static allElements = [
        HeavenlyStem.Jia,
        HeavenlyStem.Yi,
        HeavenlyStem.Bing,
        HeavenlyStem.Ding,
        HeavenlyStem.Wu,
        HeavenlyStem.Ji,
        HeavenlyStem.Geng,
        HeavenlyStem.Xin,
        HeavenlyStem.Ren,
        HeavenlyStem.Gui
    ];
    static elementsByValue = createElementsByValue(HeavenlyStem.allElements);
    static combinesMap = new Map([
        [1, 6],
        [6, 1],
        [2, 7],
        [7, 2],
        [3, 8],
        [8, 3],
        [4, 9],
        [9, 4],
        [5, 10],
        [10, 5]
    ]);
    static clashesMap = new Map([
        [1, 7],
        [7, 1],
        [2, 8],
        [8, 2],
        [9, 3],
        [3, 9],
        [4, 10],
        [10, 4]
    ]);
    static getAll() {
        return HeavenlyStem.allElements;
    }
    static fromValue(value) {
        return fromElementValue("HeavenlyStem", HeavenlyStem.elementsByValue, value);
    }
    isGenerates(other) {
        return this.fivePhase.isGenerates(other.fivePhase);
    }
    generates(other) {
        return this.fivePhase.generates(other.fivePhase);
    }
    generatesBy(other) {
        return this.fivePhase.generatesBy(other.fivePhase);
    }
    isRestrains(other) {
        return this.fivePhase.isRestrains(other.fivePhase);
    }
    restrains(other) {
        return this.fivePhase.restrains(other.fivePhase);
    }
    restrainsBy(other) {
        return this.fivePhase.restrainsBy(other.fivePhase);
    }
    isClashing(other) {
        return HeavenlyStem.clashesMap.get(this.value) === other.value;
    }
    isCombining(other) {
        return HeavenlyStem.combinesMap.get(this.value) === other.value;
    }
}
export class EarthlyBranch extends IChingElement {
    yinYang;
    fivePhase;
    constructor(value, label, yinYang, fivePhase) {
        super(value, label, "EarthlyBranch");
        this.yinYang = yinYang;
        this.fivePhase = fivePhase;
    }
    static Yin = new EarthlyBranch(3, "Yin", YinYang.Yang, FivePhase.Wood);
    static Mao = new EarthlyBranch(4, "Mao", YinYang.Yin, FivePhase.Wood);
    static Chen = new EarthlyBranch(5, "Chen", YinYang.Yang, FivePhase.Earth);
    static Si = new EarthlyBranch(6, "Si", YinYang.Yin, FivePhase.Fire);
    static Wu = new EarthlyBranch(7, "Wu", YinYang.Yang, FivePhase.Fire);
    static Wei = new EarthlyBranch(8, "Wei", YinYang.Yin, FivePhase.Earth);
    static Shen = new EarthlyBranch(9, "Shen", YinYang.Yang, FivePhase.Metal);
    static You = new EarthlyBranch(10, "You", YinYang.Yin, FivePhase.Metal);
    static Xu = new EarthlyBranch(11, "Xu", YinYang.Yang, FivePhase.Earth);
    static Hai = new EarthlyBranch(12, "Hai", YinYang.Yin, FivePhase.Water);
    static Zi = new EarthlyBranch(1, "Zi", YinYang.Yang, FivePhase.Water);
    static Chou = new EarthlyBranch(2, "Chou", YinYang.Yin, FivePhase.Earth);
    static allElements = [
        EarthlyBranch.Yin,
        EarthlyBranch.Mao,
        EarthlyBranch.Chen,
        EarthlyBranch.Si,
        EarthlyBranch.Wu,
        EarthlyBranch.Wei,
        EarthlyBranch.Shen,
        EarthlyBranch.You,
        EarthlyBranch.Xu,
        EarthlyBranch.Hai,
        EarthlyBranch.Zi,
        EarthlyBranch.Chou
    ];
    static elementsByValue = createElementsByValue(EarthlyBranch.allElements);
    static clashesMap = new Map([
        [1, 7],
        [7, 1],
        [2, 8],
        [8, 2],
        [3, 9],
        [9, 3],
        [4, 10],
        [10, 4],
        [5, 11],
        [11, 5],
        [6, 12],
        [12, 6]
    ]);
    static combinesMap = new Map([
        [1, 2],
        [2, 1],
        [3, 12],
        [12, 3],
        [4, 11],
        [11, 4],
        [5, 10],
        [10, 5],
        [6, 9],
        [9, 6],
        [7, 8],
        [8, 7]
    ]);
    static triangularCombinationMasks = EarthlyBranch.createTriangularCombinationMasks();
    static getAll() {
        return EarthlyBranch.allElements;
    }
    static fromValue(value) {
        return fromElementValue("EarthlyBranch", EarthlyBranch.elementsByValue, value);
    }
    isGenerates(other) {
        return this.fivePhase.isGenerates(other.fivePhase);
    }
    generates(other) {
        return this.fivePhase.generates(other.fivePhase);
    }
    generatesBy(other) {
        return this.fivePhase.generatesBy(other.fivePhase);
    }
    isRestrains(other) {
        return this.fivePhase.isRestrains(other.fivePhase);
    }
    restrains(other) {
        return this.fivePhase.restrains(other.fivePhase);
    }
    restrainsBy(other) {
        return this.fivePhase.restrainsBy(other.fivePhase);
    }
    isClashing(other) {
        return EarthlyBranch.clashesMap.get(this.value) === other.value;
    }
    isCombining(other) {
        return EarthlyBranch.combinesMap.get(this.value) === other.value;
    }
    isTriangularCombination(other, another) {
        const mask = EarthlyBranch.triangularCombinationMasks[this.value] ?? 0;
        return mask !== 0 && mask === EarthlyBranch.createCombinationMask(this, other, another);
    }
    static createTriangularCombinationMasks() {
        const masks = new Array(13).fill(0);
        EarthlyBranch.registerTriangularCombinationMask(masks, EarthlyBranch.Shen, EarthlyBranch.Zi, EarthlyBranch.Chen);
        EarthlyBranch.registerTriangularCombinationMask(masks, EarthlyBranch.Hai, EarthlyBranch.Mao, EarthlyBranch.Wei);
        EarthlyBranch.registerTriangularCombinationMask(masks, EarthlyBranch.Yin, EarthlyBranch.Wu, EarthlyBranch.Xu);
        EarthlyBranch.registerTriangularCombinationMask(masks, EarthlyBranch.Si, EarthlyBranch.You, EarthlyBranch.Chou);
        return masks;
    }
    static registerTriangularCombinationMask(masks, first, second, third) {
        const mask = EarthlyBranch.createCombinationMask(first, second, third);
        masks[first.value] = mask;
        masks[second.value] = mask;
        masks[third.value] = mask;
    }
    static createCombinationMask(first, second, third) {
        return (1 << first.value) | (1 << second.value) | (1 << third.value);
    }
}
export class StemBranch {
    stem;
    branch;
    emptyBranchesValue;
    constructor(stem, branch) {
        this.stem = stem;
        this.branch = branch;
        this.emptyBranchesValue = StemBranch.createEmptyBranches(stem, branch);
    }
    get emptyBranches() {
        return [...this.emptyBranchesValue];
    }
    get emptyBranchesMemory() {
        return this.emptyBranchesValue;
    }
    toString(culture) {
        return `${this.stem.toString(culture)}${this.branch.toString(culture)}`;
    }
    static createEmptyBranches(stem, branch) {
        const stemIndex = stem.value - 1;
        const branchIndex = branch.value;
        const xunBranchIndex = ((branchIndex - stemIndex + 11) % 12) + 1;
        const empty1Index = ((xunBranchIndex + 9) % 12) + 1;
        const empty2Index = ((xunBranchIndex + 10) % 12) + 1;
        return [EarthlyBranch.fromValue(empty1Index), EarthlyBranch.fromValue(empty2Index)];
    }
}
function invertMap(map) {
    return new Map([...map].map(([key, value]) => [value, key]));
}
//# sourceMappingURL=elements.js.map