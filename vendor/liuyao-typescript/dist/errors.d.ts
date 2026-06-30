export declare class InvalidOperationException extends Error {
    constructor(message: string);
}
export declare class ArgumentException extends Error {
    readonly paramName?: string | undefined;
    constructor(message: string, paramName?: string | undefined);
}
export declare class ArgumentOutOfRangeException extends RangeError {
    readonly paramName: string;
    constructor(paramName: string, message?: string);
}
export declare class KeyNotFoundException extends Error {
    constructor(message: string);
}
