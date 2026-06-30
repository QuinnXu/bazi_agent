import { KeyNotFoundException } from "../errors.js";
import { IChingTranslationManager } from "./localization.js";
export class IChingElement {
    value;
    label;
    typeName;
    constructor(value, label, typeName) {
        this.value = value;
        this.label = label;
        this.typeName = typeName;
    }
    get uniqueKey() {
        return `${this.typeName}.${this.label}`;
    }
    equals(other) {
        return other instanceof IChingElement
            && other.constructor === this.constructor
            && other.value === this.value;
    }
    toString(culture) {
        return IChingTranslationManager.getTranslation(this.typeName, this.label, culture) ?? this.label;
    }
    valueOf() {
        return this.value;
    }
}
export function createElementsByValue(elements) {
    const max = elements.reduce((current, element) => Math.max(current, element.value), 0);
    const values = new Array(max + 1);
    for (const element of elements) {
        values[element.value] = element;
    }
    return values;
}
export function fromElementValue(className, values, value) {
    const element = values[value];
    if (element) {
        return element;
    }
    throw new KeyNotFoundException(`Value ${value} not found in ${className}`);
}
//# sourceMappingURL=element.js.map