export type CultureInput = string | {
    name?: string;
    toString(): string;
} | null | undefined;
export interface IChingTranslationProvider {
    getTranslation(typeName: string, label: string, culture: string): string | null;
}
export declare class ResxTranslationProvider implements IChingTranslationProvider {
    private readonly resourceSets;
    constructor(resourceSets: Record<string, Record<string, string>>);
    getTranslation(typeName: string, label: string, culture: string): string | null;
}
export declare class IChingTranslationManager {
    private static providerValue;
    private static defaultCultureValue;
    static get provider(): IChingTranslationProvider;
    static set provider(provider: IChingTranslationProvider);
    static get defaultCulture(): string | null;
    static set defaultCulture(culture: string | null);
    static getEffectiveCulture(): string;
    static getTranslation(typeName: string, label: string, culture?: CultureInput): string | null;
    static resetToDefault(): void;
}
export declare function normalizeCulture(culture?: CultureInput): string;
