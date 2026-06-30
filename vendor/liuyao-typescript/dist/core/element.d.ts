import { CultureInput } from "./localization.js";
export declare abstract class IChingElement<T extends IChingElement<T>> {
    readonly value: number;
    readonly label: string;
    private readonly typeName;
    protected constructor(value: number, label: string, typeName: string);
    get uniqueKey(): string;
    equals(other: unknown): boolean;
    toString(culture?: CultureInput): string;
    valueOf(): number;
}
export declare function createElementsByValue<T extends IChingElement<T>>(elements: readonly T[]): readonly (T | undefined)[];
export declare function fromElementValue<T extends IChingElement<T>>(className: string, values: readonly (T | undefined)[], value: number): T;
