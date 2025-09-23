


/**
 * Custom error class for validation errors
 * @constructor
 * @param {string} message - Error message
 * @param {string|null} [location] - Optional creation location
 */
function ValidationError(message, location) {
    this.name = 'ValidationError';
    this.message = message;

    // Use provided creation location or capture current stack trace
    var locationToUse = location;

    if (!locationToUse) {
        // Capture stack trace and add clickable location
        if (typeof /** @type {any} */ (Error).captureStackTrace === 'function') {
        /** @type {any} */ (Error).captureStackTrace(this, ValidationError);
        }

        // For Espruino compatibility, create a simple stack property
        var stack = (new Error()).stack;
        if (stack) {
            var lines = stack.split('\n');
            // Find the first line that's not in this file and not node internals
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.indexOf('.js:') !== -1 && line.indexOf('hsm.js') === -1 && line.indexOf('node:') === -1) {
                    // Extract file path and line number
                    var match = line.match(/\s+at\s+.*?\s+\(([^)]+)\)|at\s+([^:]+:\d+:\d+)/);
                    if (match) {
                        locationToUse = match[1] || match[2];
                        break;
                    }
                }
            }
        }
    }

    if (locationToUse) {
        this.message = message + '\n    → ' + locationToUse;
    }
}



// Make ValidationError inherit from Error
ValidationError.prototype = Object.create(Error.prototype);
ValidationError.prototype.constructor = ValidationError;

/**
 * Validator class that captures creation location and provides error throwing
 * @constructor
 * @returns {Validator}
 */
function Validator() {
    this.location = this._captureLocation();
    return this;
}

Validator.prototype = {
    constructor: ValidationError,

    /**
     * Capture the current stack location
     * @returns {string|null} The creation location
     */
    _captureLocation: function () {
        var stack = (new Error()).stack;
        if (stack) {
            var lines = stack.split('\n');
            // Find the first line that's not in this file and not node internals
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.indexOf('.js:') !== -1 && line.indexOf('hsm.js') === -1 && line.indexOf('node:') === -1) {
                    // Extract file path and line number
                    var match = line.match(/\s+at\s+.*?\s+\(([^)]+)\)|at\s+([^:]+:\d+:\d+)/);
                    if (match) {
                        return match[1] || match[2];
                    }
                }
            }
        }
        return null;
    },
    /**
     * Throw a validation error with the captured location
     * @param {string} message - Error message
     * @returns {ValidationError} The validation error
     */
    error: function (message) {
        return new ValidationError(message, this.location);
    }
};

module.exports = {
    ValidationError: ValidationError,
    Validator: Validator
}