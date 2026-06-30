export class InvalidOperationException extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidOperationException";
    }
}
export class ArgumentException extends Error {
    paramName;
    constructor(message, paramName) {
        super(paramName ? `${message} (${paramName})` : message);
        this.paramName = paramName;
        this.name = "ArgumentException";
    }
}
export class ArgumentOutOfRangeException extends RangeError {
    paramName;
    constructor(paramName, message = "Specified argument was out of the range of valid values.") {
        super(`${message} (${paramName})`);
        this.paramName = paramName;
        this.name = "ArgumentOutOfRangeException";
    }
}
export class KeyNotFoundException extends Error {
    constructor(message) {
        super(message);
        this.name = "KeyNotFoundException";
    }
}
//# sourceMappingURL=errors.js.map