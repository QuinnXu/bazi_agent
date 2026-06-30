import { resources } from "../resources/generated.js";
export class ResxTranslationProvider {
    resourceSets;
    constructor(resourceSets) {
        this.resourceSets = resourceSets;
    }
    getTranslation(typeName, label, culture) {
        if (!typeName) {
            throw new Error("Type name cannot be null or empty.");
        }
        if (!label) {
            throw new Error("Label cannot be null or empty.");
        }
        const key = `${typeName}.${label}`;
        for (const cultureName of getCultureFallbacks(culture)) {
            const value = this.resourceSets[cultureName]?.[key];
            if (value !== undefined) {
                return value;
            }
        }
        return null;
    }
}
export class IChingTranslationManager {
    static providerValue = null;
    static defaultCultureValue = null;
    static get provider() {
        this.providerValue ??= new ResxTranslationProvider(resources);
        return this.providerValue;
    }
    static set provider(provider) {
        if (!provider) {
            throw new Error("provider cannot be null");
        }
        this.providerValue = provider;
    }
    static get defaultCulture() {
        return this.defaultCultureValue;
    }
    static set defaultCulture(culture) {
        this.defaultCultureValue = culture;
    }
    static getEffectiveCulture() {
        return this.defaultCultureValue ?? "en";
    }
    static getTranslation(typeName, label, culture) {
        return this.provider.getTranslation(typeName, label, normalizeCulture(culture));
    }
    static resetToDefault() {
        this.providerValue = null;
        this.defaultCultureValue = null;
    }
}
export function normalizeCulture(culture) {
    if (culture === null || culture === undefined) {
        return IChingTranslationManager.getEffectiveCulture();
    }
    if (typeof culture === "string") {
        return culture || IChingTranslationManager.getEffectiveCulture();
    }
    return culture.name || culture.toString() || IChingTranslationManager.getEffectiveCulture();
}
function getCultureFallbacks(culture) {
    if (culture === "zh" || culture.toLowerCase().startsWith("zh-hans") || culture.toLowerCase() === "zh-cn") {
        return ["zh-Hans", "en"];
    }
    if (culture.toLowerCase().startsWith("en")) {
        return ["en"];
    }
    const neutral = culture.split("-")[0];
    return neutral === culture ? [culture, "en"] : [culture, neutral, "en"];
}
//# sourceMappingURL=localization.js.map