/**
 * @fileoverview Optimized Hierarchical State Machine implementation for Espruino
 * This version uses precomputed transition tables for O(1) event lookup
 * and removes the miss cache for better performance.
 */

/**
 * Simple profiler for tracking time spent in different operations
 * @constructor
 * @param {boolean} [disabled] - Whether profiling is disabled
 */
function Profiler(disabled) {
    /** @type {Object<string, {count: number, totalTime: number, maxTime: number}>} */
    this.stats = {};
    /** @type {boolean} */
    this.enabled = disabled !== true;
    /** @type {Object<string, number>} */
    this.startTimes = {};
}

/**
 * @typedef {(
 *   '..' |
 *   '../' |
 *   '.' |
 *   './' |
 *   `${'../' | '..'}${string}` |
 *   `${'./' | '.'}${string}` |
 *    `${string}`
 * )} RelativePath
 */

/**
 * @typedef {('/' | `/${string}`)} AbsolutePath
 */

/**
 * @typedef {(RelativePath | AbsolutePath | `${string}/${string}`)} Path
 */

/**
 * Reset all profiling data
 * @returns {void}
 */
Profiler.prototype.reset = function () {
    this.stats = {};
    this.startTimes = {};
};

/**
 * Get current time in seconds (Espruino compatible)
 * @returns {number} Current time in seconds
 */
Profiler.prototype.getTime = function () {
    // Use Espruino's getTime() if available, otherwise fallback to Date
    // @ts-ignore - getTime is Espruino global
    if (typeof getTime !== 'undefined') {
        // @ts-ignore - getTime is Espruino global
        return getTime();
    } else {
        return Date.now() / 1000;
    }
};

/**
 * Start timing an operation
 * @param {string} name - Operation name
 * @returns {void}
 */
Profiler.prototype.start = function (name) {
    if (!this.enabled) return;
    this.startTimes[name] = this.getTime();
};

/**
 * End timing an operation
 * @param {string} name - Operation name
 */
Profiler.prototype.end = function (name) {
    if (!this.enabled || !this.startTimes[name]) return;

    var duration = this.getTime() - this.startTimes[name];
    delete this.startTimes[name];

    if (!this.stats[name]) {
        this.stats[name] = { "count": 0, "totalTime": 0, "maxTime": 0 };
    }

    var stat = this.stats[name];
    stat.count++;
    stat.totalTime += duration;
    stat.maxTime = Math.max(stat.maxTime, duration);
};

/**
 * Get profiling results
 * @returns {Object<string, {count: number, totalTime: number, maxTime: number, avgTime: number}>} 
 */
Profiler.prototype.getResults = function () {
    /** @type {Object<string, {count: number, totalTime: number, maxTime: number, avgTime: number}>} */
    var results = {};
    for (var name in this.stats) {
        var stat = this.stats[name];
        results[name] = {
            "count": stat.count,
            "totalTime": stat.totalTime,
            "maxTime": stat.maxTime,
            "avgTime": stat.count > 0 ? stat.totalTime / stat.count : 0
        };
    }
    return results;
};

/**
 * Print profiling results to console
 */
Profiler.prototype.report = function () {
    if (!this.enabled) {
        console.log("Profiling is disabled");
        return;
    }
    var results = this.getResults();
    var names = Object.keys(results);

    if (names.length === 0) {
        console.log("No profiling data collected");
        return;
    }

    console.log("HSM Optimized Profiling Results:");
    console.log("================================");

    // Sort by total time descending
    names.sort(function (a, b) {
        return results[b].totalTime - results[a].totalTime;
    });

    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var stat = results[name];
        console.log(name + ":");
        console.log("  Count: " + stat["count"]);
        console.log("  Total: " + (stat["totalTime"] * 1000).toFixed(2) + "ms");
        console.log("  Avg: " + (stat["avgTime"] * 1000).toFixed(2) + "ms");
        console.log("  Max: " + (stat["maxTime"] * 1000).toFixed(2) + "ms");
    }
};


// #region Kind

/**
 * @typedef {number} Kind
 */

var length = 48;  // Use 48-bit packing to preserve deeper ancestry within JS number precision
var idLength = 8;
var depthMax = length / idLength;
var idMask = (1 << idLength) - 1;
var kindCounter = 0;

function nextKindId() {
    var id = kindCounter & idMask;
    kindCounter++;
    return id;
}

function extractKindId(kindValue, depth) {
    return Math.floor(kindValue / Math.pow(2, idLength * depth)) & idMask;
}

/**
 * Check if a kind matches any of the given base kinds
 * @param {number} kindValue - The kind to check
 * @param {...number[]} baseKinds - Base kinds to check against
 * @returns {boolean} True if the kind matches any base
 */
export function isKind(kindValue) {
    var baseKinds = [];
    for (var i = 1; i < arguments.length; i++) {
        baseKinds.push(arguments[i]);
    }

    for (var i = 0; i < baseKinds.length; i++) {
        var base = baseKinds[i];
        var baseId = base & idMask;
        if (kindValue === baseId) {
            return true;
        }

        for (var j = 0; j < depthMax; j++) {
            var currentId = extractKindId(kindValue, j);
            if (currentId === baseId) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Create a derived kind identifier using the built-in counter, like hsm.go.
 * @returns {number}
 */
export function makeKind() {
    var result = nextKindId();
    var used = {};
    var usedCount = 0;
    for (var i = 0; i < arguments.length; i++) {
        var base = arguments[i];
        for (var j = 0; j < depthMax; j++) {
            var baseId = extractKindId(base, j);
            if (!baseId) {
                break;
            }
            if (used[baseId]) {
                continue;
            }
            used[baseId] = true;
            usedCount++;
            result += baseId * Math.pow(2, usedCount * idLength);
        }
    }
    return result;
}
// #endregion

/**
 * Join multiple path segments together, normalizing the resulting path.
 * Optimized for Espruino and Unix-style paths (only '/').
 * Handles leading/trailing slashes and '..' for navigating up directories.
 * Follows Node.js path.posix.join behavior (e.g., intermediate absolute paths reset the path).
 *
 * @param {...string} segments - Path segments to join
 * @returns {Path} The normalized, joined path string
 */
export function join() {
    /** @type {Path[]} */
    var segments = slice(arguments, 0);

    var parts = []; // Stores the normalized path components (e.g., ['a', 'b'])
    var currentIsAbsolute = false; // Flag to track if the *resulting* path should be absolute

    // Loop through each input segment
    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];

        // Skip null, undefined, or empty segments.
        if (segment === null || segment === undefined || segment.length === 0) {
            continue;
        }

        // If the current segment starts with '/', it resets the path.
        // All previous parts are discarded, and the new path effectively becomes absolute from here.
        if (segment[0] === '/') {
            parts = []; // Reset parts array
            currentIsAbsolute = true;
        }

        var startIndex = 0;
        var currentPartEnd = 0;
        var part = '';
        // Iterate through the segment to extract components between slashes
        while (currentPartEnd < segment.length) {
            if (segment[currentPartEnd] === '/') {
                // If we found a component (i.e., not multiple slashes like // or a leading slash at start of segment)
                if (currentPartEnd > startIndex) {
                    part = segment.substring(startIndex, currentPartEnd);

                    // Process the extracted part
                    if (part === '..') {
                        // If absolute path and at root (parts is empty), '..' has no effect (e.g., /../ -> /)
                        if (currentIsAbsolute && parts.length === 0) {
                            // Do nothing
                        }
                        // If the last part pushed was not '..', we can pop it (e.g., /a/b/../ -> /a/)
                        else if (parts.length > 0 && parts[parts.length - 1] !== '..') {
                            parts.pop(); // Go up one directory
                        }
                        // Otherwise (parts is empty and relative, or last part was '..'), push '..'
                        else {
                            parts.push(part);
                        }
                    } else if (part !== '.') { // Ignore '.' (e.g., a/./b -> a/b)
                        parts.push(part);
                    }
                }
                startIndex = currentPartEnd + 1; // Move past the current separator
            }
            currentPartEnd++;
        }

        // Handle the last component of the segment (if any) after the loop finishes
        if (currentPartEnd > startIndex) {
            part = segment.substring(startIndex, currentPartEnd);
            // Process the last extracted part, same logic as above
            if (part === '..') {
                if (currentIsAbsolute && parts.length === 0) {
                    // Do nothing
                } else if (parts.length > 0 && parts[parts.length - 1] !== '..') {
                    parts.pop();
                } else {
                    parts.push(part);
                }
            } else if (part !== '.') {
                parts.push(part);
            }
        }
    }

    // Join the processed parts into a single string
    var joinedPath = parts.join('/');

    // If the resulting path should be absolute, prepend '/'
    if (currentIsAbsolute) {
        joinedPath = '/' + joinedPath;
    }

    // Determine if the *final* path should have a trailing slash.
    // This is true if the *last original input segment* ended with a slash,
    // AND the resulting path is not just the root ('/').
    var hasTrailingSlash = false;
    if (segments.length > 0) {
        var lastInputSegment = segments[segments.length - 1];
        // Check if the last non-empty segment ends with a slash
        if (lastInputSegment && lastInputSegment.length > 0 && lastInputSegment[lastInputSegment.length - 1] === '/') {
            hasTrailingSlash = true;
        }
    }

    // Handle final path resolution:
    // 1. If path is empty (e.g., join('a', '..')), return '.' for relative, '/' for absolute.
    if (joinedPath.length === 0) {
        return currentIsAbsolute ? '/' : '.';
    }
    // 2. If it should have a trailing slash and isn't just '/', append it.
    else if (hasTrailingSlash && joinedPath !== '/') {
        return /** @type {Path} */ (joinedPath + '/');
    }

    // 3. Otherwise, return the path as is.
    return /** @type {Path} */ (joinedPath);
}
/**
 * @description Slice an array-like object (including arguments)
 * @template T
 * @param {ArrayLike<T>} args 
 * @param {number} start 
 * @returns {T[]}
 */
function slice(args, start) {
    /** @type {T[]} */
    var result = [];
    if (start === undefined) {
        start = 0;
    }
    for (var i = start; i < args.length; i++) {
        result.push(args[i]);
    }
    return result;
}


/**
 * Returns the directory name of a path.
 * Optimized for Espruino: avoids regex, split, filter, and join.
 * Assumes Unix-style paths (only '/' as separator).
 * Uses string manipulation (lastIndexOf, substring) for better memory and performance.
 *
 * @param {Path} path - The path string
 * @returns {Path} The directory name string
 */
export function dirname(path) {
    // Handle null, undefined, or empty path strings
    if (path === undefined || path === null || path.length === 0) {
        return '.';
    }

    // Determine if the original path was absolute (starts with '/').
    // This helps distinguish e.g., '/foo' (dirname is '/') from 'foo' (dirname is '.').
    var originalPathWasAbsolute = (path[0] === '/');

    // --- Step 1: Trim trailing separators ---
    // Find the index of the last non-separator character.
    // This effectively removes trailing slashes, so 'a/b/c/' becomes 'a/b/c'.
    // If path is '/', '///', etc., 'i' will become -1.
    var i = path.length - 1;
    while (i >= 0 && path[i] === '/') {
        i--;
    }

    // 'p' is the path without trailing separators.
    // Example: If path was 'a/b/c/', p becomes 'a/b/c'.
    // Example: If path was '/', p becomes ''.
    var p = path.substring(0, i + 1);

    // --- Step 2: Handle cases where 'p' is empty after trimming ---
    // This means the original path was composed solely of separators (e.g., '/', '///')
    // or was initially an empty string.
    if (p.length === 0) {
        // If the original path was absolute (e.g., '/'), return '/'.
        // Otherwise (e.g., '' -> should be '.'), return '.'.
        return originalPathWasAbsolute ? '/' : '.';
    }

    // --- Step 3: Find the last separator in the (now trimmed) path 'p' ---
    var lastSeparatorIndex = p.lastIndexOf('/');

    // --- Step 4: Determine the result based on the last separator index ---

    // Case A: No separator found in 'p' (e.g., 'foo', or '/foo' where 'p' became 'foo').
    if (lastSeparatorIndex < 0) {
        // If the original path was absolute (e.g., '/foo'), its dirname is '/'.
        // Otherwise (e.g., 'foo'), its dirname is '.'.
        return originalPathWasAbsolute ? '/' : '.';
    }

    // Case B: A separator was found. Extract the part of 'p' before that separator.
    var result = /** @type {Path} */ (p.substring(0, lastSeparatorIndex));

    // Case C: The extracted 'result' is empty (e.g., original '/a', 'p' was '/a', lastSeparatorIndex was 0).
    // This means the last component was the only component after a root.
    if (result.length === 0) {
        // If the original path was absolute, the dirname is '/'.
        // (This correctly handles '/a' -> '/')
        return originalPathWasAbsolute ? '/' : '.';
    }

    // Otherwise, return the extracted directory path.
    return result;
}

/**
 * Checks if a path is absolute.
 * @param {string} path - The path string
 * @returns {boolean} True if the path is absolute, false otherwise
 */
export function isAbsolute(path) {
    var c = path.charAt(0);
    // Unix-style: "/foo"
    if (c === '/') return true;

    // Windows-style: "C:\foo" or "C:/foo"
    return path.length > 2 && path.charAt(1) === ':' && path.charAt(2) === '/';
}

// #endregion

// #region AbortController

/**
 * @typedef {Object} AbortSignal
 * @property {boolean} aborted - Whether the signal has been aborted
 * @property {function(string, function(): void): void} addEventListener - Add event listener
 * @property {function(string, function(): void): void} removeEventListener - Remove event listener
 */

/**
 * @typedef {Object} AbortController
 * @property {AbortSignal} signal - The abort signal
 * @property {function(): void} abort - Abort the operation
 */

export function Context() {
    /** @type {Array<function(): void>} */
    this.listeners = [];
    /** @type {Record<string, Instance>} */
    this.instances = {};
    /** @type {HSM<Instance>|Group|null} */
    this.hsm = null;
    /** @type {boolean} */
    this.done = false;
}


Context.prototype = {
    constructor: Context,
    /**
     * @param {'done'} _ - The event type
     * @param {function(): void} listener - The listener to add
     */
    addEventListener: function (_, listener) {
        this.listeners.push(listener);
    },
    /**
     * @param {'done'} _ - The event type
     * @param {function(): void} listener - The listener to remove
     */
    removeEventListener: function (_, listener) {
        var index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }
}



// #endregion


/**
 * @readonly
 * @enum {Kind}
 */
var kinds = {};

kinds.Null = makeKind();
kinds.Element = makeKind();
kinds.Partial = makeKind(kinds.Element);
kinds.Vertex = makeKind(kinds.Element);
kinds.Constraint = makeKind(kinds.Element);
kinds.Behavior = makeKind(kinds.Element);
kinds.Namespace = makeKind(kinds.Element);
kinds.Concurrent = makeKind(kinds.Behavior);
kinds.Sequential = makeKind(kinds.Behavior);
kinds.StateMachine = makeKind(kinds.Concurrent, kinds.Namespace);
kinds.Attribute = makeKind(kinds.Element);
kinds.State = makeKind(kinds.Vertex, kinds.Namespace);
kinds.Model = makeKind(kinds.State);
kinds.Transition = makeKind(kinds.Element);
kinds.Internal = makeKind(kinds.Transition);
kinds.External = makeKind(kinds.Transition);
kinds.Local = makeKind(kinds.Transition);
kinds.Self = makeKind(kinds.Transition);
kinds.Event = makeKind(kinds.Element);
kinds.CompletionEvent = makeKind(kinds.Event);
kinds.ChangeEvent = makeKind(kinds.Event);
kinds.ErrorEvent = makeKind(kinds.CompletionEvent);
kinds.TimeEvent = makeKind(kinds.Event);
kinds.CallEvent = makeKind(kinds.Event);
kinds.Pseudostate = makeKind(kinds.Vertex);
kinds.Initial = makeKind(kinds.Pseudostate);
kinds.FinalState = makeKind(kinds.State);
kinds.Choice = makeKind(kinds.Pseudostate);
kinds.Junction = makeKind(kinds.Pseudostate);
kinds.DeepHistory = makeKind(kinds.Pseudostate);
kinds.ShallowHistory = makeKind(kinds.Pseudostate);

export { kinds };

/**
 * @typedef {{
 *   kind: Kind,
 *   qualifiedName: Path,
 *   id?: string,
 * }} Element
 * 
 */

/**
 * @template {string} N 
 * @template {any} T
 * @typedef {{
 *   kind: Kind,
 *   name: N,
 *   data?: T,
 *   schema?: any,
 *   source?: string,
 *   target?: string,
 *   id?: string,
 * }} Event
 */

/**
 * @typedef {Element & {
 *   transitions: Path[]
 * }} Vertex
 */

/**
 * @typedef {Vertex & {
 *   entry: Path[],
 *   exit: Path[],
 *   activities: Path[],
 *   deferred: Path[],
 *   initial?: Path,
 * }} State
 */

/**
 * @typedef {Object} Validator
 * @property {function(string): Error} error - Validate an element
 */

/**
 * @typedef {State & {
 *   members: Record<Path, Element|Transition|State|Vertex>,
 *   transitionMap: Record<Path, Record<Path, Transition[]>>,
 *   deferredMap: Record<Path, Record<Path, boolean>>,
 *   events: Record<string, Event<string, any>>,
 *   attributes: Record<string, { name: string, qualifiedName: string, hasDefault: boolean, defaultValue?: any }>,
 *   operations: Record<string, { name: string, qualifiedName: string, implementation: Function }>,
 *   partials: PartialFunction<Element>[]
 * }} Model
 */


/**
 * @typedef {{
 *  enter: Path[],
 *  exit: Path[],
 * }} TransitionPath
 */

/**
 * @typedef {Element & {
 *   guard: string,
 *   events: string[],
 *   effect: Path[],
 *   source: Path,
 *   target?: Path,
 *   paths: Record<Path, TransitionPath>
 * }} Transition
 */

/**
 * @template {Instance} T  
 * @typedef {Element & {
 *   operation: Operation<T>,
 *   operationName?: string,
 * }} Behavior
 */

/**
 * @template {Instance} T
 * @typedef {Element & {
 *   expression: Expression<T>,
 * }} Constraint
 */



/**
 * @template {Instance} T
 * @typedef {function(Context, T, Event<string, any>): boolean} Expression
 */

/**
 * @template {Instance} T
 * @typedef {function(Context, T, Event<string, any>): number} TimeExpression
 */

/**
 * @template {Instance} T
 * @typedef {function(Context, T, Event<string, any>): (Promise<void>|void)} Operation
 */

/**
 * @template {Element} T
 * @typedef {(model: Model, elements: Element[]) => T | void} PartialFunction
 */

/**
 * @typedef {Event<string, any>} UnknownEvent
 */

// Define special events
export const InitialEvent = {
    kind: kinds.CompletionEvent,
    qualifiedName: "hsm_initial",
    name: "hsm_initial"
};

// AnyEvent is not used in this optimized version
// Wildcard events are not supported for performance reasons

/**
 * @type { Event<string, any> }
 */
export const FinalEvent = {
    name: 'hsm_final',
    kind: kinds.CompletionEvent
};

/**
 * @type {Event<string, any>}
 */
export const ErrorEvent = {
    name: 'hsm_error',
    kind: kinds.ErrorEvent
};

/**
 * Default clock implementation used when config.clock does not override timer behavior.
 * @type {{ setTimeout: Function, clearTimeout: Function, now: Function }}
 */
export const DefaultClock = {
    setTimeout: typeof setTimeout === 'function' ? setTimeout : function () { },
    clearTimeout: typeof clearTimeout === 'function' ? clearTimeout : function () { },
    now: typeof Date !== 'undefined' && typeof Date.now === 'function' ? Date.now : function () { return 0; }
};

/**
 * Create an event definition with optional schema metadata.
 * Runtime callers can dispatch the returned object directly or use it with on().
 *
 * @template {string} N
 * @param {N} name
 * @param {any} [schema]
 * @returns {Event<N, any>}
 */
export function event(name, schema) {
    return {
        kind: kinds.Event,
        name: name,
        schema: schema
    };
}

/**
 * Apply partial functions to the model and stack
 * @param {Model} model - The model to apply the partial functions to
 * @param {Element[]} stack - The stack of elements to apply the partial functions to
 * @param {PartialFunction<Element>[]} partials - The partial functions to apply
 */
function apply(model, stack, partials) {
    for (var i = 0; i < partials.length; i++) {
        var partial = partials[i];
        partial(model, stack);
    }
}

/**
 * Qualify a model-level name to an absolute path.
 * @param {Model} model
 * @param {string} name
 * @returns {string}
 */
function qualifyModelName(model, name) {
    if (isAbsolute(name)) {
        return isAncestor(model.qualifiedName, name) || model.qualifiedName === name
            ? name
            : join(model.qualifiedName, name.slice(1));
    }
    return join(model.qualifiedName, name);
}

/**
 * Register an event definition with the model.
 * @param {Model} model
 * @param {Event<string, any>} event
 * @returns {Event<string, any>}
 */
function registerEvent(model, event) {
    if (!model.events) {
        model.events = {};
    }
    var existing = model.events[event.name];
    if (!existing) {
        model.events[event.name] = event;
        return event;
    }
    return existing;
}

/**
 * Resolve a callable or named operation to a behavior operation.
 * @template {Instance} T
 * @param {Model} model
 * @param {string|Operation<T>} value
 * @param {'behavior'|'guard'} mode
 * @returns {Operation<T>|Expression<T>}
 */
function resolveOperation(model, value, mode) {
    if (typeof value === 'function') {
        return /** @type {Operation<T>|Expression<T>} */ (value);
    }
    return /** @type {Operation<T>|Expression<T>} */ (function (ctx, instance, event) {
        var hsm = instance && instance._hsm ? instance._hsm : null;
        if (!hsm) {
            if (mode === 'guard') {
                return false;
            }
            return;
        }
        var result = hsm.invoke(value, ctx, mode === 'behavior' ? [event] : [event]);
        if (mode === 'guard') {
            return !!result;
        }
        return;
    });
}


// Helper functions
/**
 * Check if ancestor is an ancestor of descendant
 * @param {Path} ancestor - The ancestor path
 * @param {Path} descendant - The descendant path
 * @returns {boolean} True if ancestor is an ancestor of descendant
 */
export function isAncestor(ancestor, descendant) {
    // Simple cases
    if (ancestor === descendant) return false;
    if (ancestor === '/') return isAbsolute(descendant); // root is ancestor of all absolute paths
    return descendant.startsWith(ancestor + "/")
}

/**
 * Find the lowest common ancestor of two paths
 * @param {Path} a - First path
 * @param {Path} b - Second path
 * @returns {Path} The LCA path
 */
export function lca(a, b) {
    if (a === b) return dirname(a);
    if (!a) return b;
    if (!b) return a;
    if (dirname(a) === dirname(b)) return dirname(a);
    if (isAncestor(a, b)) return a;
    if (isAncestor(b, a)) return b;
    return lca(dirname(a), dirname(b));
}


/**
 * Event queue for managing completion and regular events
 * @constructor
 * @param {Profiler} [profiler] - Optional profiler instance
 */
function Queue(profiler) {
    /** @type {Profiler|undefined} */
    this.profiler = profiler;
    /** @type {Array<Event<string, any>>} */
    this.front = []; // For completion events, acts as a stack (LIFO)
    /** @type {Array<Event<string, any>>} */
    this.back = []; // Internal array for regular events
    this.backHead = 0;
}

Queue.prototype.len = function () {
    return this.front.length + (this.back.length - this.backHead);
};

/**
 * Pop an event from the queue
 * @returns {Event<string, any>|undefined} The event that was popped
 */
Queue.prototype.pop = function () {
    if (this.profiler) {
        this.profiler.start('pop');
    }
    var event;
    if (this.front.length > 0) {
        event = this.front.pop(); // O(1) for completion events
    } else if (this.backHead < this.back.length) {
        event = this.back[this.backHead];
        this.back[this.backHead] = undefined; // Help GC
        this.backHead++;

        // Reset the array when we've consumed all events to prevent unbounded growth
        if (this.backHead === this.back.length) {
            this.back = [];
            this.backHead = 0;
        }
    }
    if (this.profiler) {
        this.profiler.end('pop');
    }
    return event;
};

/**
 * Push an event onto the queue
 * @param {...Event<string, any>} events - The events to push
 * @returns {void}
 */
Queue.prototype.push = function () {
    if (this.profiler) {
        this.profiler.start('push');
    }
    for (var i = 0; i < arguments.length; i++) {
        var event = arguments[i];
        if (isKind(event.kind, kinds.CompletionEvent)) {
            this.front.push(event); // O(1)
        } else {
            this.back.push(event);
        }
    }
    if (this.profiler) {
        this.profiler.end('push');
    }
};

/**
 * Build a transition lookup table for O(1) event dispatch
 * @param {Model} model - The model to build the table for
 * @returns {void}
 */
function buildTransitionTable(model) {

    // For each state in the model
    for (var stateName in model.members) {
        var state = model.members[stateName];
        if (!isKind(state.kind, kinds.State, kinds.Model)) continue;

        // Initialize tables for this state
        model.transitionMap[stateName] = /** @type {Record<Path, Transition[]>} */ ({});

        // Collect all transitions accessible from this state by walking up hierarchy
        var transitionsByEvent = /** @type {Record<string, Array<{transition: Transition, priority: number}>>} */ ({});
        var currentPath = /** @type {Path} */ (stateName);
        var depth = 0;

        while (currentPath) {
            var currentState = model.members[currentPath];
            if (currentState && isKind(currentState.kind, kinds.State, kinds.Model)) {
                var stateOrModel = /** @type {State} */ (currentState);
                // Process transitions at this level
                for (var i = 0; i < stateOrModel.transitions.length; i++) {
                    var transitionName = stateOrModel.transitions[i];
                    var transition = /** @type {Transition} */ (model.members[transitionName]);

                    if (transition && transition.events) {
                        // Process each event this transition handles
                        for (var j = 0; j < transition.events.length; j++) {
                            var eventName = /** @type {string} */ (transition.events[j]);

                            // Skip wildcard events - not supported
                            if (eventName.indexOf('*') !== -1) {
                                continue;
                            }

                            // Regular event - add to lookup table
                            if (!transitionsByEvent[eventName]) {
                                transitionsByEvent[eventName] = [];
                            }
                            transitionsByEvent[eventName].push({
                                transition: transition,
                                priority: depth
                            });
                        }
                    }
                }
            }

            // Move up to parent
            if (currentPath === '/' || !currentPath) break;
            var parentPath = dirname(currentPath);
            if (parentPath === currentPath) break; // Avoid infinite loop
            currentPath = parentPath;
            depth++;
        }

        // Sort transitions by priority (lower depth = higher priority)
        for (var eventName in transitionsByEvent) {
            var transitions = transitionsByEvent[eventName];
            transitions.sort(function (a, b) {
                return a.priority - b.priority;
            });

            // Extract just the transition objects
            model.transitionMap[stateName][eventName] = transitions.map(function (t) {
                return t.transition;
            });
        }
    }

}

/**
 * Build a deferred event lookup table for O(1) deferred event checking
 * @param {Model} model - The model to build the table for
 * @returns {void}
 */
function buildDeferredTable(model) {
    // For each state in the model
    for (var stateName in model.members) {
        var state = /** @type {State} */ (model.members[stateName]);
        if (!isKind(state.kind, kinds.State, kinds.Model)) continue;
        model.deferredMap[stateName] = /** @type {Object<string, boolean>} */ ({});
        var currentPath = /** @type {Path} */ (stateName);
        while (currentPath) {
            var currentState = /** @type {State|Model} */ (model.members[currentPath]);
            if (currentState && isKind(currentState.kind, kinds.State, kinds.Model)) {
                var stateOrModel = /** @type {State} */ (currentState);

                // Process deferred events at this level
                if (stateOrModel.deferred) {
                    for (var i = 0; i < stateOrModel.deferred.length; i++) {
                        var deferredEvent = stateOrModel.deferred[i];
                        var transitions = model.transitionMap[stateName][deferredEvent];
                        if (transitions && transitions.some(t => t.source === stateName)) {
                            continue;
                        }
                        // Only support exact event names for O(1) lookup
                        // Skip wildcard patterns for performance
                        if (deferredEvent.indexOf('*') === -1) {
                            model.deferredMap[stateName][deferredEvent] = true;
                        }
                    }
                }
            }

            // Move up to parent
            if (currentPath === '/' || !currentPath) break;
            var parentPath = dirname(currentPath);
            if (parentPath === currentPath) break; // Avoid infinite loop
            currentPath = parentPath;
        }
    }
}

/** @type {TransitionPath} */
var EMPTY_PATH = {
    enter: [],
    exit: []
};

/**
 * Base Instance class for state machine instances
 * @constructor
 */
export function Instance() {
    /** @type {HSM<Instance>|null} */
    this._hsm = null;
}

/**
 * Dispatch an event to the state machine
 * @template {string} N
 * @template {any} T    
 * @param {Event<N, T>} event - The event to dispatch
 * @returns {void}
 */
Instance.prototype.dispatch = function (event) {
    var self = this;
    if (!self._hsm) {
        return;
    }
    self._hsm.dispatch(event);
};

/**
 * Get the current state
 * @returns {string} The current state qualified name
 */
Instance.prototype.state = function () {
    return this._hsm ? this._hsm.state() : '';
};

/**
 * context getter
 * @returns {Context} The context
 */
Instance.prototype.context = function () {
    return this._hsm ? this._hsm.ctx : new Context();
};

/**
 * clock getter
 * @returns {{ setTimeout: Function, clearTimeout: Function, now: Function }}
 */
Instance.prototype.clock = function () {
    return this._hsm ? this._hsm.clock : DefaultClock;
};

/**
 * Read an attribute value by name.
 * @param {string} name
 * @returns {any}
 */
Instance.prototype.get = function (name) {
    return this._hsm ? this._hsm.get(name) : undefined;
};

/**
 * Update an attribute value by name.
 * @param {string} name
 * @param {any} value
 * @returns {void}
 */
Instance.prototype.set = function (name, value) {
    if (this._hsm) {
        this._hsm.set(name, value);
    }
};

/**
 * Invoke a named operation.
 * @param {string} name
 * @returns {any}
 */
Instance.prototype.call = function (name) {
    if (!this._hsm) {
        return undefined;
    }
    var args = slice(arguments, 1);
    return this._hsm.call.apply(this._hsm, [name].concat(args));
};

/**
 * Restart the instance from its initial state.
 * @param {any} [data]
 * @returns {void}
 */
Instance.prototype.restart = function (data) {
    if (this._hsm) {
        this._hsm.restart(data);
    }
};

/**
 * Take a point-in-time snapshot of the machine.
 * @returns {Snapshot}
 */
Instance.prototype.takeSnapshot = function () {
    return this._hsm ? this._hsm.takeSnapshot() : {
        id: '',
        qualifiedName: '',
        state: '',
        attributes: {},
        queueLen: 0,
        events: []
    };
};


/**
 * @typedef {Object} Active
 * @property {Context} context - The abort controller
 * @property {Promise<void>} promise - The active promise
 */

/**
 * @typedef {Object} Config
 * @property {string} [id] - The ID of the instance
 * @property {string} [name] - The name of the instance
 */

/**
 * Optimized HSM implementation with precomputed transition tables
 * @template {Instance} T
 * @constructor
 * @param {Context|T} ctxOrInstance - The context to use or the instance to control
 * @param {T|Model} instanceOrModel - The instance to control or the model
 * @param {Model|Config} maybeModelOrConfig - The model or configuration
 * @param {Config} [maybeConfig] - The configuration
 */
function HSM(ctxOrInstance, instanceOrModel, maybeModelOrConfig, maybeConfig) {
    if (!(ctxOrInstance instanceof Context)) {
        maybeConfig = /** @type {Config} */ (maybeModelOrConfig);
        maybeModelOrConfig = /** @type {Model} */ (instanceOrModel);
        instanceOrModel = /** @type {T} */ (ctxOrInstance);
        ctxOrInstance = new Context();
    }
    const id = (maybeConfig ? maybeConfig.id : '') || HSM.id++;
    const name = (maybeConfig ? maybeConfig.name : '') || /** @type {Model} */ (maybeModelOrConfig).qualifiedName;
    /** @type {T} */
    this.instance = /** @type {T} */ (instanceOrModel);
    /** @type {Context} */
    this.ctx = /** @type {Context} */ (ctxOrInstance);
    /** @type {Model} */
    this.model = /** @type {Model} */ (maybeModelOrConfig);
    /** @type {Vertex|Model} */
    this.currentState = /** @type {any} */ (maybeModelOrConfig); // Model acts as root state
    /** @type {Queue} */
    this.queue = new Queue();
    /** @type {Object<string, Active>} */
    this.active = {}; // Use object instead of Map for Espruino compatibility
    /** @type {boolean} */
    this.processing = false;
    /** @type {string} */
    this.id = id.toString();
    /** @type {string} */
    this.name = name;
    /** @type {HSM<T>} */
    this._hsm = this;
    /** @type {Record<string, any>} */
    this.attributes = {};
    /** @type {Record<string, string>} */
    this.historyShallow = {};
    /** @type {Record<string, string>} */
    this.historyDeep = {};
    /** @type {{ entered: Record<string, Array<Function>>, exited: Record<string, Array<Function>>, processed: Record<string, Array<Function>>, dispatched: Record<string, Array<Function>>, executed: Record<string, Array<Function>> }} */
    this.after = {
        entered: {},
        exited: {},
        processed: {},
        dispatched: {},
        executed: {}
    };
    /** @type {{ setTimeout: Function, clearTimeout: Function, now: Function }} */
    this.clock = {
        setTimeout: (maybeConfig && maybeConfig.clock && maybeConfig.clock.setTimeout) || DefaultClock.setTimeout,
        clearTimeout: (maybeConfig && maybeConfig.clock && maybeConfig.clock.clearTimeout) || DefaultClock.clearTimeout,
        now: (maybeConfig && maybeConfig.clock && maybeConfig.clock.now) || DefaultClock.now
    };
    this.startData = maybeConfig ? maybeConfig.data : undefined;
    this.instance._hsm = this;
    this.ctx.hsm = this;
}

/**
 * Start the state machine
 * @returns {HSM<T>} The HSM instance
 */
HSM.prototype.start = function () {
    this.processing = true; // Mark as processing to allow immediate dispatch
    this.ctx.done = false;
    this.resetAttributes();

    var initialEvent = Object.create(InitialEvent);
    initialEvent.data = this.startData;
    var newState = this.enter(/** @type {any} */(this.model), initialEvent, true);
    this.ctx.instances[this.id] = this.instance;
    this.currentState = newState;
    this.process(); // Process all initial events synchronously

    return this;
};

HSM.id = 0;

/**
 * Get current state
 * @returns {string} Current state qualified name
 */
HSM.prototype.state = function () {
    return this.currentState ? this.currentState.qualifiedName : '';
};

HSM.prototype.resetAttributes = function () {
    this.attributes = {};
    if (!this.model.attributes) {
        return;
    }
    for (var qualifiedName in this.model.attributes) {
        var attribute = this.model.attributes[qualifiedName];
        if (attribute && attribute.hasDefault) {
            this.attributes[qualifiedName] = attribute.defaultValue;
        }
    }
};

HSM.prototype.notify = function (bucket, key) {
    var listeners = this.after[bucket][key];
    if (!listeners || listeners.length === 0) {
        return;
    }
    delete this.after[bucket][key];
    for (var i = 0; i < listeners.length; i++) {
        listeners[i]();
    }
};

HSM.prototype.onAfter = function (bucket, key, listener) {
    if (!this.after[bucket][key]) {
        this.after[bucket][key] = [];
    }
    this.after[bucket][key].push(listener);
};

HSM.prototype.get = function (name) {
    return this.attributes[qualifyModelName(this.model, name)];
};

HSM.prototype.set = function (name, value) {
    var qualifiedName = qualifyModelName(this.model, name);
    var hadValue = Object.prototype.hasOwnProperty.call(this.attributes, qualifiedName);
    var old = this.attributes[qualifiedName];
    this.attributes[qualifiedName] = value;
    if (hadValue && old === value) {
        return;
    }
    var event = {
        kind: kinds.ChangeEvent,
        name: qualifiedName,
        source: qualifiedName,
        data: {
            name: qualifiedName,
            old: old,
            new: value
        }
    };
    this.dispatch(event);
};

HSM.prototype.call = function (name) {
    var args = slice(arguments, 1);
    var qualifiedName = qualifyModelName(this.model, name);
    var event = {
        kind: kinds.CallEvent,
        name: qualifiedName,
        source: qualifiedName,
        data: {
            name: qualifiedName,
            args: args
        }
    };
    this.dispatch(event);
    return this.invoke(name, this.ctx, args);
};

HSM.prototype.invoke = function (name, ctx, args) {
    var qualifiedName = qualifyModelName(this.model, name);
    var operation = this.model.operations && this.model.operations[qualifiedName];
    if (!operation) {
        throw new Error('missing operation "' + qualifiedName + '"');
    }
    var fn = operation.implementation;
    if (typeof fn !== 'function') {
        throw new Error('invalid operation "' + qualifiedName + '"');
    }
    var candidates = [
        [ctx, this.instance].concat(args),
        [ctx].concat(args),
        [this.instance].concat(args),
        args
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (fn.length === candidates[i].length || (fn.length <= candidates[i].length && fn.length >= 0)) {
            return fn.apply(this.instance, candidates[i]);
        }
    }
    return fn.apply(this.instance, args);
};

HSM.prototype.restart = function (data) {
    this.stop();
    this.startData = data;
    this.ctx.done = false;
    this.currentState = /** @type {Vertex|Model} */ (this.model);
    this.start();
};

HSM.prototype.takeSnapshot = function () {
    /** @type {Array<any>} */
    var events = [];
    var currentStateName = this.currentState ? this.currentState.qualifiedName : this.model.qualifiedName;
    var transitionsByEvent = this.model.transitionMap[currentStateName] || {};
    for (var eventName in transitionsByEvent) {
        var transitionList = transitionsByEvent[eventName];
        for (var i = 0; i < transitionList.length; i++) {
            events.push({
                event: eventName,
                target: transitionList[i].target,
                guard: !!transitionList[i].guard,
                schema: this.model.events[eventName] ? this.model.events[eventName].schema : undefined
            });
        }
    }
    return {
        id: this.id,
        qualifiedName: this.model.qualifiedName,
        state: currentStateName,
        attributes: Object.assign({}, this.attributes),
        queueLen: this.queue.len(),
        events: events
    };
};

HSM.prototype.recordHistory = function (stateName) {
    if (!stateName) {
        return;
    }
    var child = stateName;
    var parent = dirname(child);
    while (parent && parent !== '.' && parent !== '/') {
        var element = this.model.members[parent];
        if (element && isKind(element.kind, kinds.State)) {
            this.historyDeep[parent] = stateName;
            this.historyShallow[parent] = child;
        }
        if (parent === this.model.qualifiedName) {
            break;
        }
        child = parent;
        parent = dirname(parent);
    }
};

HSM.prototype.followHistoryDefault = function (vertex, event) {
    for (var i = 0; i < vertex.transitions.length; i++) {
        var transition = /** @type {Transition} */ (this.model.members[vertex.transitions[i]]);
        if (!transition) {
            continue;
        }
        if (transition.guard) {
            var guard = /** @type {Constraint<typeof this.instance>} */ (this.model.members[transition.guard]);
            if (guard && guard.expression && !guard.expression(this.ctx, this.instance, event)) {
                continue;
            }
        }
        return this.transition(vertex, transition, event);
    }
    return undefined;
};

/**
 * Dispatch an event
 * @template {string} N
 * @template {any} T
 * @param {Event<N, T>} event - Event to dispatch
 * @returns {void}
 */
HSM.prototype.dispatch = function (event) {
    if (!event.kind) {
        event.kind = kinds.Event;
    }
    this.queue.push(event);
    this.notify('dispatched', event.name);

    if (this.processing) {
        return;
    }
    if (this.currentState.qualifiedName === /** @type {any} */ (this.model).qualifiedName && this.ctx.done) {
        return;
    }
    this.processing = true;
    this.process(); // Process events synchronously
};

/**
 * Process queued events using optimized transition lookup
 * @returns {void}
 */
HSM.prototype.process = function () {
    /** @type {Array<Event<string, any>>} */
    var deferred = new Array(this.queue.len() + 1);
    var deferredCount = 0;

    var event = this.queue.pop();
    while (event) { // Loop while there are events to process
        var currentStateName = this.currentState.qualifiedName;
        var eventName = event.name;

        // Check if event is deferred using O(1) lookup
        var deferredLookup = this.model.deferredMap[currentStateName];
        var isDeferred = deferredLookup && deferredLookup[eventName] === true;

        if (isDeferred) {
            deferred[deferredCount++] = event;
            event = this.queue.pop();
            continue;
        }

        // Direct O(1) lookup for exact event matches
        var transitions = this.model.transitionMap[currentStateName][eventName];
        if (transitions && transitions.length > 0) {
            // Check guards and execute first enabled transition
            for (var i = 0; i < transitions.length; i++) {
                var transition = transitions[i];

                // Check guard
                if (transition.guard) {
                    var guard = /** @type {Constraint<typeof this.instance>} */ (this.model.members[transition.guard]);
                    if (guard && guard.expression) {
                        try {
                            var guardResult = guard.expression(this.ctx, this.instance, event);
                        } catch (error) {
                            this.dispatch(Object.create(ErrorEvent, {
                                data: { value: error }
                            }));
                            continue;
                        }

                        if (!guardResult) {
                            continue; // Guard failed, try next transition
                        }
                    }
                }
                // Execute the transition
                var nextState = this.transition(/** @type {Vertex} */(this.currentState), transition, event);
                if (nextState.qualifiedName !== this.currentState.qualifiedName) {
                    this.currentState = nextState;
                    for (var i = 0; i < deferredCount; i++) {
                        this.queue.push(deferred[i]);
                    }
                    deferredCount = 0;
                }
                break; // Transition found and executed
            }
        }

        this.notify('processed', event.name);
        // Get next event from queue
        event = this.queue.pop();
    }

    // Re-queue deferred events after all current events are processed
    for (var i = 0; i < deferredCount; i++) {
        this.queue.push(deferred[i]);
    }

    this.processing = false; // Mark as not processing
    this.notify('processed', '__next__');
};


/**
 * Execute a transition
 * @param {Vertex} current - Current state/vertex
 * @param {Transition} transition - Transition to execute
 * @param {Event<string, any>} event - Event that triggered the transition
 * @returns {Vertex} The new current state
 */
HSM.prototype.transition = function (current, transition, event) {
    var path = transition.paths[current.qualifiedName];
    if (!path) {
        path = EMPTY_PATH;
    }
    // Execute exit actions
    for (var i = 0; i < path.exit.length; i++) {
        var exitingName = path.exit[i];
        var exiting = /** @type {State} */ (this.model.members[exitingName]);
        if (exiting && isKind(exiting.kind, kinds.State)) {
            this.exit(exiting, event);
            this.notify('exited', exitingName);
        }
    }

    // Execute effect actions
    for (var i = 0; i < transition.effect.length; i++) {
        var effectName = transition.effect[i];
        var behavior = /** @type {Behavior<typeof this.instance>} */ (this.model.members[effectName]);
        if (behavior) {
            this.execute(behavior, event);
        }
    }

    // Execute entry actions
    var enteredState = undefined;
    for (var i = 0; i < path.enter.length; i++) {
        var enteringName = path.enter[i];
        var entering = /** @type {Vertex} */ (this.model.members[enteringName]);
        if (entering) {
            var defaultEntry = entering.qualifiedName === transition.target && transition.kind !== kinds.Self;
            enteredState = this.enter(entering, event, defaultEntry);
        }
    }

    // Determine the final state after the transition
    var finalState = enteredState || /** @type {Vertex} */ (this.model.members[transition.target]);
    return /** @type {Vertex} */ (finalState || current);
};

/**
 * Enter a state or vertex
 * @param {Vertex} vertex - The vertex to enter
 * @param {Event<string, any>} event - The event
 * @param {boolean} defaultEntry - Whether this is a default entry
 * @returns {Vertex} The entered state
 */
HSM.prototype.enter = function (vertex, event, defaultEntry) {
    if (isKind(vertex.kind, kinds.State)) {
        var state = /** @type {State} */ (vertex);
        this.recordHistory(state.qualifiedName);

        // Execute entry actions
        for (var i = 0; i < state.entry.length; i++) {
            var entryName = state.entry[i];
            var behavior = /** @type {Behavior<typeof this.instance>} */ (this.model.members[entryName]);
            if (behavior) {
                this.execute(behavior, event);
            }
        }
        this.notify('entered', state.qualifiedName);

        // Execute activities
        for (var i = 0; i < state.activities.length; i++) {
            var activityName = state.activities[i];
            var behavior = /** @type {Behavior<typeof this.instance>} */ (this.model.members[activityName]);
            if (behavior) {
                this.execute(behavior, event);
            }
        }

        // Handle default initial transition
        if (defaultEntry && state.initial) {
            var initial = /** @type {Vertex} */ (this.model.members[state.initial]);
            var transition = /** @type {Transition} */ (this.model.members[initial.transitions[0]]);
            if (transition) {
                var result = this.transition(state, transition, event);
                return result;
            }
        }
        return state;
    }

    if (isKind(vertex.kind, kinds.Choice)) {
        var choiceVertex = /** @type {Vertex} */ (vertex);
        var chosenTransition = undefined;

        // Find the first enabled transition
        for (var i = 0; i < choiceVertex.transitions.length; i++) {
            var transitionName = choiceVertex.transitions[i];
            var transition = /** @type {Transition} */ (this.model.members[transitionName]);
            if (!transition) {
                continue;
            }

            if (transition.guard) {
                var guard = /** @type {Constraint<typeof this.instance>} */ (this.model.members[transition.guard]);
                if (guard && guard.expression) {
                    var guardResult = guard.expression(this.ctx, this.instance, event);
                    if (guardResult) {
                        chosenTransition = transition;
                        break;
                    }
                }
            } else {
                // No guard, this is the default transition
                chosenTransition = transition;
                break;
            }
        }

        if (chosenTransition) {
            var result = this.transition(choiceVertex, chosenTransition, event);

            return result;
        }
        throw new Error('No transition found for choice vertex ' + choiceVertex.qualifiedName);
    }

    if (isKind(vertex.kind, kinds.ShallowHistory, kinds.DeepHistory)) {
        var parent = dirname(vertex.qualifiedName);
        var resolved = isKind(vertex.kind, kinds.ShallowHistory)
            ? this.historyShallow[parent]
            : this.historyDeep[parent];
        if (!resolved) {
            var historyResult = this.followHistoryDefault(/** @type {Vertex} */(vertex), event);
            if (historyResult) {
                return historyResult;
            }
            var parentState = /** @type {State} */ (this.model.members[parent]);
            if (parentState && parentState.initial) {
                var initialVertex = /** @type {Vertex} */ (this.model.members[parentState.initial]);
                if (initialVertex && initialVertex.transitions.length > 0) {
                    return this.transition(parentState, /** @type {Transition} */(this.model.members[initialVertex.transitions[0]]), event);
                }
            }
            return vertex;
        }

        var enterPath = [];
        var currentPath = resolved;
        while (currentPath && currentPath !== parent && currentPath !== '.') {
            enterPath.unshift(currentPath);
            currentPath = dirname(currentPath);
        }
        var currentVertex = vertex;
        for (var j = 0; j < enterPath.length; j++) {
            var entering = /** @type {Vertex} */ (this.model.members[enterPath[j]]);
            if (!entering) {
                break;
            }
            currentVertex = this.enter(
                entering,
                event,
                isKind(vertex.kind, kinds.ShallowHistory) && j === enterPath.length - 1
            );
        }
        return currentVertex;
    }

    if (isKind(vertex.kind, kinds.FinalState)) {
        // Final states are terminal
        this.notify('entered', vertex.qualifiedName);
        if (dirname(vertex.qualifiedName) === this.model.qualifiedName) {
            this.stop();
        }
        return vertex;
    }
    return vertex;
};

/**
 * Exit a state
 * @param {State} state - The state to exit
 * @param {Event<string, any>} event - The event
 * @returns {void}
 */
HSM.prototype.exit = function (state, event) {
    // Terminate activities
    for (var i = 0; i < state.activities.length; i++) {
        var activityName = state.activities[i];
        var activity = /** @type {Behavior<typeof this.instance>} */ (this.model.members[activityName]);
        if (activity) {
            this.terminate(activity);
        }
    }

    // Execute exit actions
    for (var i = 0; i < state.exit.length; i++) {
        var exitName = state.exit[i];
        var behavior = /** @type {Behavior<typeof this.instance>} */ (this.model.members[exitName]);
        if (behavior) {
            this.execute(behavior, event);
        }
    }
};


/**
 * Execute a behavior
 * @param {Behavior<T>} behavior - The behavior to execute
 * @param {Event<string, any>} event - The event
 * @returns {void}
 */
HSM.prototype.execute = function (behavior, event) {
    var error = undefined;
    var operation = behavior.operation;
    var self = this;
    if (!operation && behavior.operationName) {
        operation = /** @type {Operation<T>} */ (function (ctx, instance) {
            self.invoke(behavior.operationName, ctx, [event]);
        });
    }
    if (isKind(behavior.kind, kinds.Concurrent)) {
        var controller = new Context();

        try {
            var asyncOperationPromise = Promise.resolve(operation(controller, this.instance, event))
            this.active[behavior.qualifiedName] = {
                context: controller,
                promise: asyncOperationPromise.catch(function (error) {
                    self.dispatch(Object.create(ErrorEvent, {
                        data: { value: error }
                    }));
                }).then(function () {
                    self.notify('executed', behavior.qualifiedName);
                    self.notify('executed', behavior.Owner ? behavior.Owner() : dirname(behavior.qualifiedName));
                })
            };
        } catch (err) {
            error = err;
        }
    } else {
        // Sequential behaviors
        try {
            operation(this.ctx, this.instance, event);
            this.notify('executed', behavior.qualifiedName);
            this.notify('executed', dirname(behavior.qualifiedName));
        } catch (err) {
            error = err;
        }
    }
    if (error) {
        this.dispatch(Object.create(ErrorEvent, {
            data: { value: error }
        }));
    }
};

/**
 * Terminate an activity
 * @param {Behavior<Instance>} activity - The activity to terminate
 * @returns {void}
 */
HSM.prototype.terminate = function (activity) {
    var active = this.active[activity.qualifiedName];

    if (active) {
        active.context.done = true;
        // Notify all listeners
        for (var i = 0; i < active.context.listeners.length; i++) {
            active.context.listeners[i]();
        }
        delete this.active[activity.qualifiedName];
    }
};

/**
 * Stop the state machine gracefully
 * @template {Instance} T
 * @returns {void} Promise that resolves when stopped
 */
HSM.prototype.stop = function () {

    // Exit all states from current state up to root
    this.processing = true;
    while (this.currentState && this.currentState.qualifiedName !== (this.model).qualifiedName) {

        this.exit(/** @type {State} */(this.currentState), FinalEvent);

        this.currentState = /** @type {Vertex} */ (this.model.members[dirname(this.currentState.qualifiedName)]);
    }
    this.processing = false;
    this.ctx.done = true;
    for (var i = 0; i < this.ctx.listeners.length; i++) {
        this.ctx.listeners[i]();
    }

    delete this.ctx.instances[this.id];
};

/**
 * Find an element of specific kinds in the stack
 * @param {Element[]} stack - The element stack
 * @param {...number[]} arguments - Kinds to search for
 * @template {Element} T
 * @returns {T|undefined} Found element or undefined
 */
function find(stack) {
    for (var i = stack.length - 1; i >= 0; i--) {
        var element = stack[i];
        for (var j = 1; j < arguments.length; j++) {
            if (isKind(element.kind, arguments[j])) {
                return /** @type {T} */ (element);
            }
        }
    }
    return undefined;
}

/**
 * Start a state machine instance with optimized transition table
 * @template {Instance} T
 * @param {Context} ctx - The context to use
 * @param {T} instance - The instance to start
 * @param {Model} model - The state machine model
 * @param {Config} [maybeConfig] - The configuration
 * @returns {T} The HSM controller
 */
export function start(ctx, instance, model, maybeConfig) {
    if (!(ctx instanceof Context)) {
        maybeConfig = /** @type {Config} */ (model);
        model = /** @type {Model} */ (instance);
        instance = /** @type {T} */ (ctx);
        ctx = new Context();
    }
    var sm = new HSM(ctx, instance, model, maybeConfig);
    sm.start();
    return sm;
}

/**
 * Stop a state machine instance gracefully
 * @param {Instance} instance - The instance to stop
 * @returns {void}
 */
export function stop(instance) {
    if (instance && instance._hsm) {
        instance._hsm.stop();
    }
}


/**
 * Create a state partial function
 * @param {string} name - State name
 * @param {...PartialFunction<Element>[]} partials - Nested partials
 * @returns {PartialFunction<State>} State partial function
 */
export function state(name) {
    /** @type {PartialFunction<Transition|Vertex>[]} */
    var partials = slice(arguments, 1);
    return function (model, stack) {
        /** @type {State} */
        var namespace = /** @type {State} */ (find(stack, kinds.State, kinds.Model));

        var qualifiedName = join(namespace.qualifiedName, name);
        /** @type {State} */
        var stateObj = {
            qualifiedName: qualifiedName,
            kind: kinds.State,
            transitions: [],
            entry: [],
            exit: [],
            activities: [],
            deferred: [],
        };

        model.members[stateObj.qualifiedName] = stateObj;
        stack.push(stateObj);
        apply(model, stack, partials);
        stack.pop();



        return stateObj;
    };
}

/**
 * Create an initial state partial function
 * @param {string|PartialFunction<Element>} elementOrName - Initial name or partial element  
 * @param {...PartialFunction<Element>[]} partials - Additional partials
 * @returns {PartialFunction<Transition>} Initial partial function
 */
export function initial(elementOrName) {
    /** @type {PartialFunction<Element>[]} */
    var partials = slice(arguments, 1);

    var name = '.initial';

    // If first argument is a string, it's the name of the initial pseudostate
    if (typeof elementOrName === 'string') {
        name = elementOrName;
    } else if (typeof elementOrName === 'function') {
        // If it's a partial function, add it to the beginning of partials
        partials.unshift(elementOrName);
    }

    return function (model, stack) {
        var state = /** @type {State} */ (find(stack, kinds.State));

        var initialName = join(state.qualifiedName, name);
        var initialObj = {
            qualifiedName: initialName,
            kind: kinds.Initial,
            transitions: [],
        };

        model.members[initialName] = initialObj;
        state.initial = initialName;

        // Add the initial event trigger
        partials.unshift(source(initialObj.qualifiedName), on(InitialEvent));

        // Create the transition with all partials
        stack.push(initialObj);
        var transitionObj = /** @type {Transition} */ (transition.apply(null, partials)(model, stack));
        stack.pop();

        return transitionObj;
    };
}

/**
 * Create a transition partial function
 * @param {...PartialFunction<Element>} partials - Transition configuration partials
 * @returns {PartialFunction<Transition>} Transition partial function
 */
export function transition() {
    /** @type {PartialFunction<Element>[]} */
    var partials = slice(arguments, 0);

    return function (model, stack) {
        var vertex = find(stack, kinds.Vertex);

        var name = 'transition_' + Object.keys(model.members).length;
        /** @type {Transition} */
        var transitionObj = {
            qualifiedName: join(vertex.qualifiedName, name),
            kind: kinds.Transition, // Will be updated later
            source: ".",
            guard: '',
            effect: /** @type {Path[]} */ ([]),
            events: /** @type {string[]} */ ([]),
            paths: /** @type {Record<Path, TransitionPath>} */ ({})
        };

        model.members[transitionObj.qualifiedName] = transitionObj;
        stack.push(transitionObj);
        apply(model, stack, partials);
        stack.pop();

        // Default source to the current vertex if not explicitly set
        if (transitionObj.source == "." || !transitionObj.source) {
            transitionObj.source = vertex.qualifiedName;
        }
        var sourceElement = /** @type {Vertex} */ (model.members[transitionObj.source]);
        sourceElement.transitions.push(transitionObj.qualifiedName);

        // Determine transition kind and compute paths after all elements are processed
        model.partials.push(function () {
            if (transitionObj.target === transitionObj.source) {
                transitionObj.kind = kinds.Self;
            } else if (!transitionObj.target) {
                transitionObj.kind = kinds.Internal;
            } else if (isAncestor(transitionObj.source, transitionObj.target)) {
                transitionObj.kind = kinds.Local;
            } else {
                transitionObj.kind = kinds.External;
            }

            // Compute paths
            var lcaPath = lca(transitionObj.source, transitionObj.target);
            var enter = /** @type {Path[]} */ ([]);
            if (transitionObj.kind === kinds.Self) {
                enter.push(sourceElement.qualifiedName);
            } else {
                var entering = transitionObj.target;
                while (entering && entering !== lcaPath && entering !== '/') {
                    enter.unshift(entering);
                    entering = dirname(entering);
                }
            }

            if (isKind(sourceElement.kind, kinds.Initial)) {
                transitionObj.paths[dirname(sourceElement.qualifiedName)] = {
                    enter: enter,
                    exit: [sourceElement.qualifiedName]
                };
                return transitionObj;
            }

            // Add another partial to compute all other exit paths after all elements are defined
            model.partials.push(function () {
                if (transitionObj.kind === kinds.Internal) {
                    // Internal transitions do not involve exiting/entering other states
                    return;
                }
                for (var qualifiedName in model.members) {
                    var element = model.members[qualifiedName];
                    if (!element || !isKind(element.kind, kinds.Vertex)) {
                        continue;
                    }
                    if (transitionObj.source !== qualifiedName && !isAncestor(transitionObj.source, /** @type {Path} */(qualifiedName))) {
                        continue;
                    }
                    var exit = /** @type {Path[]} */ ([]);
                    var exiting = /** @type {Path} */ (element.qualifiedName);
                    while (exiting !== lcaPath && exiting) {
                        exit.push(exiting);
                        exiting = dirname(exiting);
                        if (exiting === '/') {
                            break;
                        }
                    }
                    transitionObj.paths[element.qualifiedName] = {
                        enter: enter,
                        exit: exit
                    };
                }
            });
        });
        return transitionObj;
    };
}

/**
 * Set transition source
 * @param {Path} name - Source name
 * @returns {PartialFunction<Transition>} Source partial function
 */
export function source(name) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        if (!isAbsolute(name)) {
            var ancestor = find(stack, kinds.State);
            if (ancestor) {
                name = join(ancestor.qualifiedName, name);
            }
        } else if (!isAncestor(model.qualifiedName, name)) {
            name = join(model.qualifiedName, name.slice(1));
        }

        transition.source = name;
        return transition;
    };
}

/**
 * Set transition target
 * @param {Path} name - Target name
 * @returns {PartialFunction<Transition>} Target partial function
 */
export function target(name) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        if (!isAbsolute(name)) {
            // Look for the nearest namespace (state or model) in the stack for path resolution
            var ancestor = find(stack, kinds.State, kinds.Model);
            if (ancestor) {
                name = join(ancestor.qualifiedName, name);
            }
        } else if (!isAncestor(model.qualifiedName, name)) {
            name = join(model.qualifiedName, name.slice(1));
        }
        transition.target = name;
        return transition;
    };
}

/**
 * Add event trigger to transition
 * @param {Event<string, any>|string} event - Event or event name
 * @returns {PartialFunction<Transition>} On partial function
 */
export function on(event) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        var eventName = typeof event === 'string' ? event : event.name;
        transition.events.push(eventName);
        if (typeof event !== 'string') {
            registerEvent(model, event);
        }
        return transition;
    };
}

/**
 * Add an attribute-change trigger to a transition.
 * @param {string} name
 * @returns {PartialFunction<Transition>}
 */
export function onSet(name) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));
        var qualifiedName = qualifyModelName(model, name);
        transition.events.push(qualifiedName);
        registerEvent(model, {
            kind: kinds.ChangeEvent,
            name: qualifiedName,
            source: qualifiedName
        });
        if (!model.attributes[qualifiedName]) {
            model.attributes[qualifiedName] = {
                name: name,
                qualifiedName: qualifiedName,
                hasDefault: false
            };
        }
        return transition;
    };
}

/**
 * Add a named operation trigger to a transition.
 * @param {string} name
 * @returns {PartialFunction<Transition>}
 */
export function onCall(name) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));
        var qualifiedName = qualifyModelName(model, name);
        transition.events.push(qualifiedName);
        registerEvent(model, {
            kind: kinds.CallEvent,
            name: qualifiedName,
            source: qualifiedName
        });
        model.partials.push(function () {
            if (!model.operations[qualifiedName]) {
                throw new Error('missing operation "' + qualifiedName + '" for OnCall()');
            }
        });
        return transition;
    };
}

/**
 * Overloaded change/signal trigger.
 * @param {string|function(Context, Instance, Event<string, any>): any} expr
 * @returns {PartialFunction<Transition>}
 */
export function when(expr) {
    if (typeof expr === 'string') {
        return onSet(expr);
    }
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));
        var eventName = join(transition.qualifiedName, 'when_' + Object.keys(model.members).length);
        var event = {
            kind: kinds.TimeEvent,
            name: eventName
        };
        transition.events.push(eventName);
        registerEvent(model, event);
        model.partials.push(function () {
            var source = /** @type {State} */ (model.members[transition.source]);
            pushBehaviors(
                join(source.qualifiedName, 'activity_when_' + source.activities.length),
                kinds.Concurrent,
                source.activities,
                model,
                [function (ctx, instance, evt) {
                    var signal = expr(ctx, instance, evt);
                    if (!signal) {
                        return;
                    }
                    return new Promise(function (resolve) {
                        var once = function () {
                            if (!ctx.done) {
                                instance.dispatch(event);
                            }
                            resolve();
                        };
                        if (typeof signal.then === 'function') {
                            signal.then(once);
                        } else if (typeof signal.addEventListener === 'function') {
                            signal.addEventListener('done', once);
                        } else if (typeof signal.on === 'function') {
                            signal.on('ready', once);
                            signal.on('done', once);
                        }
                        ctx.addEventListener('done', resolve);
                    });
                }]
            );
        });
    };
}

/**
 * Push behaviors to the model and add them to the name list
 * @template {Instance} T
 * @param {string} namePrefix - Base name for the behavior
 * @param {Kind} kind - The kind of behavior (e.g., Concurrent, Sequential)
 * @param {string[]} namesList - The list to add qualified names to (e.g., state.entry, transition.effect)
 * @param {Model} model - The state machine model
 * @param {Operation<T>[]} operations - The operation functions
 */
function pushBehaviors(namePrefix, kind, namesList, model, operations) {
    for (var i = 0; i < operations.length; i++) {
        var operation = operations[i];
        var qualifiedName = namePrefix + '_' + namesList.length;
        var behavior = {
            qualifiedName: qualifiedName,
            kind: kind,
            operation: typeof operation === 'function' ? operation : null,
            operationName: typeof operation === 'string' ? qualifyModelName(model, operation) : undefined
        };
        model.members[qualifiedName] = behavior;
        namesList.push(qualifiedName);
    }
}

/**
 * Add entry action to state
 * @template {Instance} T
 * @param {...Operation<T>} operations - Entry operations
 * @returns {PartialFunction<State>} Entry partial function
 */
export function entry() {
    var operations = /** @type {Operation<T>[]} */ (slice(arguments, 0));
    return function (model, stack) {
        var state = /** @type {State} */ (find(stack, kinds.State));
        pushBehaviors(join(state.qualifiedName, 'entry'), kinds.Sequential, state.entry, model, operations);
        return state;
    };
}

/**
 * Add exit action to state
 * @template {Instance} T
 * @param {...Operation<T>} operations - Exit operations
 * @returns {PartialFunction<State>} Exit partial function
 */
export function exit() {
    var operations = /** @type {Operation<T>[]} */ (slice(arguments, 0));
    return function (model, stack) {
        var state = /** @type {State|Model} */ (find(stack, kinds.State, kinds.Model));
        pushBehaviors(join(state.qualifiedName, 'exit'), kinds.Sequential, state.exit, model, operations);
        return /** @type {State} */ (state);
    };
}

/**
 * Add activity to state (can be asynchronous)
 * @template {Instance} T
 * @param {...Operation<T>} operations - Activity operations
 * @returns {PartialFunction<State>} Activity partial function
 */
export function activity() {
    var operations = /** @type {Operation<T>[]} */ (slice(arguments, 0));
    return function (model, stack) {
        var state = /** @type {State} */ (find(stack, kinds.State));
        pushBehaviors(join(state.qualifiedName, 'activity'), kinds.Concurrent, state.activities, model, operations);
        return state;
    };
}

/**
 * Add effect to transition
 * @template {Instance} T
 * @param {...Operation<T>} operations - Effect operations
 * @returns {PartialFunction<Transition>} Effect partial function
 */
export function effect() {
    var operations = /** @type {Operation<T>[]} */ (slice(arguments, 0));
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));
        pushBehaviors(join(transition.qualifiedName, 'effect'), kinds.Sequential, transition.effect, model, operations);
        return transition;
    };
}

/**
 * Add guard condition to transition (synchronous)
 * @template {Instance} T
 * @param {Expression<T>} expression - Guard expression function
 * @returns {PartialFunction<Transition>} Guard partial function
 */
export function guard(expression) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        var name = join(transition.qualifiedName, 'guard');
        /** @type {Constraint<T>} */
        var constraint = {
            qualifiedName: name,
            kind: kinds.Constraint,
            expression: /** @type {Expression<T>} */ (resolveOperation(model, expression, 'guard'))
        };

        model.members[name] = constraint;
        transition.guard = name;
    };
}

/**
 * Define a model-level attribute.
 * @param {string} name
 * @param {any} [maybeDefault]
 * @returns {PartialFunction<Element>}
 */
export function attribute(name, maybeDefault) {
    var hasDefault = arguments.length > 1;
    return function (model) {
        var qualifiedName = qualifyModelName(model, name);
        model.attributes[qualifiedName] = {
            name: name,
            qualifiedName: qualifiedName,
            hasDefault: hasDefault,
            defaultValue: maybeDefault
        };
    };
}

/**
 * Define a named operation callable by behaviors and OnCall.
 * @param {string} name
 * @param {Function} implementation
 * @returns {PartialFunction<Element>}
 */
export function operation(name, implementation) {
    return function (model) {
        var qualifiedName = qualifyModelName(model, name);
        model.operations[qualifiedName] = {
            name: name,
            qualifiedName: qualifiedName,
            implementation: implementation
        };
    };
}

/**
 * Add a time-based transition that fires once after a duration (can be asynchronous)
 * @template {Instance} T
 * @param {TimeExpression<T>} duration - Duration expression (synchronous, returns number)
 * @returns {PartialFunction<Transition>} After partial function
 */
export function after(duration) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        var eventName = join(transition.qualifiedName, 'after_' + Object.keys(model.members).length);
        /** @type {Event<string, any>} */
        var event = {
            name: eventName,
            kind: kinds.TimeEvent
        };

        transition.events.push(eventName);
        registerEvent(model, event);

        model.partials.push(function () {
            var source = /** @type {State} */ (model.members[transition.source]);
            pushBehaviors(
                join(source.qualifiedName, 'activity_after_' + source.activities.length),
                kinds.Concurrent, // Activities can be concurrent/asynchronous
                source.activities,
                model,
                [
                    /**
                     * @param {Context} ctx
                     * @param {T} instance
                     * @param {Event<string, any>} evt - The event that caused state entry (not the timer event itself)
                     */
                    function (ctx, instance, evt) {
                        // duration() must be synchronous here
                        var delay = typeof duration === 'string'
                            ? instance.get(duration)
                            : duration(ctx, instance, evt);
                        if (delay <= 0) return; // No promise needed if no delay

                        return new Promise(function (resolve) {
                            var timeout = instance._hsm.clock.setTimeout(function () {
                                // Dispatch timer event asynchronously to avoid blocking the main thread
                                instance.dispatch(event);
                                resolve(); // Resolve the activity's promise after dispatch
                            }, delay);

                            ctx.addEventListener('done', function () {
                                instance._hsm.clock.clearTimeout(timeout);
                                resolve(); // Resolve if aborted
                            });
                        });
                    }]
            );
        });
    };
}

/**
 * Add a periodic timer transition (can be asynchronous)
 * @template {Instance} T
 * @param {TimeExpression<T>} duration - Duration expression (synchronous, returns number)
 * @returns {PartialFunction<Transition>} Every partial function
 */
export function every(duration) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));

        var eventName = join(transition.qualifiedName, 'every_' + Object.keys(model.members).length);
        /** @type {Event<string, any>} */
        var event = {
            name: eventName,
            kind: kinds.TimeEvent
        };

        transition.events.push(eventName);
        registerEvent(model, event);

        model.partials.push(function () {
            var source = /** @type {State} */ (model.members[transition.source]);
            pushBehaviors(
                join(source.qualifiedName, 'activity_every_' + source.activities.length),
                kinds.Concurrent, // Activities can be concurrent/asynchronous
                source.activities,
                model,
                [
                    /** 
                     * @param {Context} ctx
                     * @param {T} instance 
                     * @param {Event<string, any>} evt - The event that caused state entry (not the timer event itself)
                     */
                    function (ctx, instance, evt) {
                        // duration() must be synchronous here
                        var interval = typeof duration === 'string'
                            ? instance.get(duration)
                            : duration(ctx, instance, evt);
                        if (interval <= 0) return; // No promise needed if no interval
                        return new Promise(
                            function (resolve) {
                                var timeout = instance._hsm.clock.setTimeout(function tick() {
                                    if (ctx.done) {
                                        instance._hsm.clock.clearTimeout(timeout);
                                        resolve();
                                        return;
                                    }
                                    instance.dispatch(event);
                                    timeout = instance._hsm.clock.setTimeout(tick, interval);
                                }, interval);
                                ctx.addEventListener('done', function () {
                                    instance._hsm.clock.clearTimeout(timeout);
                                    resolve(); // Resolve if aborted
                                });
                            });
                    }]
            );
        });
    };
}

/**
 * Add an absolute time-point transition.
 * @template {Instance} T
 * @param {string|function(Context, T, Event<string, any>): number|Date} timepoint
 * @returns {PartialFunction<Transition>}
 */
export function at(timepoint) {
    return function (model, stack) {
        var transition = /** @type {Transition} */ (find(stack, kinds.Transition));
        var eventName = join(transition.qualifiedName, 'at_' + Object.keys(model.members).length);
        var event = {
            name: eventName,
            kind: kinds.TimeEvent
        };

        transition.events.push(eventName);
        registerEvent(model, event);

        model.partials.push(function () {
            var source = /** @type {State} */ (model.members[transition.source]);
            pushBehaviors(
                join(source.qualifiedName, 'activity_at_' + source.activities.length),
                kinds.Concurrent,
                source.activities,
                model,
                [function (ctx, instance, evt) {
                    var value = typeof timepoint === 'string' ? instance.get(timepoint) : timepoint(ctx, instance, evt);
                    var deadline = value instanceof Date ? value.getTime() : value;
                    var delay = deadline - instance._hsm.clock.now();
                    if (delay <= 0) {
                        instance.dispatch(event);
                        return;
                    }
                    return new Promise(function (resolve) {
                        var timeout = instance._hsm.clock.setTimeout(function () {
                            instance.dispatch(event);
                            resolve();
                        }, delay);
                        ctx.addEventListener('done', function () {
                            instance._hsm.clock.clearTimeout(timeout);
                            resolve();
                        });
                    });
                }]
            );
        });
    };
}

/**
 * Add deferred events to a state 
 * @param {...string} eventNames - Event names to defer
 * @returns {PartialFunction<State>} Defer partial function
 */
export function defer() {
    var eventNames = slice(arguments, 0);
    return function (model, stack) {
        var state = /** @type {State} */ (find(stack, kinds.State));

        // Add event names to the deferred array
        for (var i = 0; i < eventNames.length; i++) {
            state.deferred.push(eventNames[i]);
        }

        return state;
    };
}

/**
 * Create a final state
 * @param {string} name - Name of the final state
 * @returns {PartialFunction<State>} Final state partial function
 */
export function final(name) {
    return function (model, stack) {
        var parent = /** @type {State} */ (find(stack, kinds.State));

        var qualifiedName = join(parent.qualifiedName, name);
        /** @type {State} */
        var finalState = {
            qualifiedName: qualifiedName,
            kind: kinds.FinalState,
            entry: [],
            exit: [],
            activities: [],
            deferred: [],
            transitions: [],
            initial: undefined,
        };

        model.members[qualifiedName] = finalState;

        return finalState;
    };
}

/**
 * Create a shallow history pseudostate.
 * @param {string|PartialFunction<Element>} elementOrName
 * @returns {PartialFunction<Vertex>}
 */
export function shallowHistory(elementOrName) {
    var partials = slice(arguments, 1);
    var name = '';
    if (typeof elementOrName === 'string') {
        name = elementOrName;
    } else if (typeof elementOrName === 'function') {
        partials.unshift(elementOrName);
    }
    return function (model, stack) {
        var owner = /** @type {State} */ (find(stack, kinds.State));
        if (!name) {
            name = 'shallow_history_' + Object.keys(model.members).length;
        }
        var qualifiedName = join(owner.qualifiedName, name);
        var history = {
            qualifiedName: qualifiedName,
            kind: kinds.ShallowHistory,
            transitions: []
        };
        model.members[qualifiedName] = history;
        stack.push(history);
        apply(model, stack, partials);
        stack.pop();
        return history;
    };
}

/**
 * Create a deep history pseudostate.
 * @param {string|PartialFunction<Element>} elementOrName
 * @returns {PartialFunction<Vertex>}
 */
export function deepHistory(elementOrName) {
    var partials = slice(arguments, 1);
    var name = '';
    if (typeof elementOrName === 'string') {
        name = elementOrName;
    } else if (typeof elementOrName === 'function') {
        partials.unshift(elementOrName);
    }
    return function (model, stack) {
        var owner = /** @type {State} */ (find(stack, kinds.State));
        if (!name) {
            name = 'deep_history_' + Object.keys(model.members).length;
        }
        var qualifiedName = join(owner.qualifiedName, name);
        var history = {
            qualifiedName: qualifiedName,
            kind: kinds.DeepHistory,
            transitions: []
        };
        model.members[qualifiedName] = history;
        stack.push(history);
        apply(model, stack, partials);
        stack.pop();
        return history;
    };
}

/**
 * Create a choice pseudostate that enables dynamic branching based on guard conditions
 * @param {string|PartialFunction<Element>} elementOrName - Choice name or partial element
 * @param {...PartialFunction<Element>[]} partials - Additional partials (transitions)
 * @returns {PartialFunction<Vertex>} Choice partial function
 */
export function choice(elementOrName) {
    var partials = slice(arguments, 1);
    var name = '';

    // If first argument is a string, it's the name of the choice pseudostate
    if (typeof elementOrName === 'string') {
        name = elementOrName;
    } else if (typeof elementOrName === 'function') {
        // If it's a partial function, add it to the beginning of partials
        partials.unshift(elementOrName);
    }

    return function (model, stack) {
        // Find the appropriate owner for this choice
        var owner = /** @type {Transition|State} */ (find(stack, kinds.Transition, kinds.State));

        if (isKind(owner.kind, kinds.Transition)) {
            var transition = /** @type {Transition} */ (owner);
            var source = transition.source;
            owner = /** @type {State} */ (model.members[source]);
            if (isKind(owner.kind, kinds.Pseudostate)) {
                owner = /** @type {State} */ (find(stack, kinds.State));
            }
        }
        if (name === "") {
            name = "choice_" + Object.keys(model.members).length;
        }

        var qualifiedName = join(owner.qualifiedName, name);
        /** @type {Vertex} */
        var choice = {
            qualifiedName: qualifiedName,
            kind: kinds.Choice,
            transitions: [],
        };
        model.members[qualifiedName] = choice;
        stack.push(choice);
        apply(model, stack, partials);
        stack.pop();

        return choice;
    };
}

/**
 * Dispatch an event to all instances in the context
 * @template {string} N
 * @template {any} T
 * @param {Context} ctx 
 * @param {Event<N, T>} event 
 */
export function dispatchAll(ctx, event) {
    for (var id in ctx.instances) {
        var instance = ctx.instances[id];
        instance.dispatch(event);
    }
}

/**
 * Define a state machine model with optimized transition table
 * @param {string} name - Model name
 * @param {...PartialFunction<Element>[]} partials - Partial functions to apply
 * @returns {Model} The defined model
 */
export function define(name) {
    /** @type {PartialFunction<Element>[]} */
    var partials = slice(arguments, 1);
    /** @type {Model} */
    var model = {
        qualifiedName: join('/', name),
        kind: kinds.Model,
        members: /** @type {Record<Path, Element>} */ ({}),
        transitions: /** @type {Path[]} */ ([]),
        entry: /** @type {Path[]} */ ([]),
        exit: /** @type {Path[]} */ ([]),
        activities: /** @type {Path[]} */ ([]),
        deferred: /** @type {Path[]} */ ([]),
        initial: /** @type {Path} */ (""),
        transitionMap: /** @type {Record<Path, Record<Path, Transition[]>>} */ ({}),
        deferredMap: /** @type {Record<Path, Record<Path, boolean>>} */ ({}),
        events: {},
        attributes: {},
        operations: {},
        partials: /** @type {PartialFunction<Element>[]} */ ([])
    };
    model.members[model.qualifiedName] = model;
    registerEvent(model, InitialEvent);
    registerEvent(model, FinalEvent);
    registerEvent(model, ErrorEvent);
    var stack = [model];

    // Apply partials
    apply(model, stack, partials);

    // Process regular partials first
    while (model.partials.length > 0) {
        var currentPartials = model.partials.slice(); // Copy array
        model.partials = [];
        for (var i = 0; i < currentPartials.length; i++) {
            currentPartials[i](model, stack);
        }
    }

    // Build the optimized transition table
    buildTransitionTable(model);

    // Build the deferred event lookup table
    buildDeferredTable(model);

    return model;
}

/**
 * Dispatch to selected instance ids, or all instances when no ids are provided.
 * @param {Context} ctx
 * @param {Event<string, any>} event
 * @returns {void}
 */
export function dispatchTo(ctx, event) {
    var ids = slice(arguments, 2);
    if (!ids.length) {
        return dispatchAll(ctx, event);
    }
    for (var i = 0; i < ids.length; i++) {
        var instance = ctx.instances[ids[i]];
        if (instance) {
            instance.dispatch(event);
        }
    }
}

export function get(ctxOrInstance, maybeInstanceOrName, maybeName) {
    var instance = ctxOrInstance instanceof Context ? maybeInstanceOrName : ctxOrInstance;
    var name = ctxOrInstance instanceof Context ? maybeName : maybeInstanceOrName;
    return instance && instance._hsm ? instance._hsm.get(name) : undefined;
}

export function set(ctxOrInstance, maybeInstanceOrName, maybeNameOrValue, maybeValue) {
    var instance = ctxOrInstance instanceof Context ? maybeInstanceOrName : ctxOrInstance;
    var name = ctxOrInstance instanceof Context ? maybeNameOrValue : maybeInstanceOrName;
    var value = ctxOrInstance instanceof Context ? maybeValue : maybeNameOrValue;
    if (instance && instance._hsm) {
        instance._hsm.set(name, value);
    }
}

export function call(ctxOrInstance, maybeInstanceOrName, maybeName) {
    var instance = ctxOrInstance instanceof Context ? maybeInstanceOrName : ctxOrInstance;
    var name = ctxOrInstance instanceof Context ? maybeName : maybeInstanceOrName;
    var args = slice(arguments, ctxOrInstance instanceof Context ? 3 : 2);
    if (instance && instance._hsm) {
        return instance._hsm.call.apply(instance._hsm, [name].concat(args));
    }
}

export function restart(instance, data) {
    if (instance && instance._hsm) {
        instance._hsm.restart(data);
    }
}

export function takeSnapshot(ctxOrInstance, maybeInstance) {
    var instance = ctxOrInstance instanceof Context ? maybeInstance : ctxOrInstance;
    return instance && instance._hsm ? instance._hsm.takeSnapshot() : {
        id: '',
        qualifiedName: '',
        state: '',
        attributes: {},
        queueLen: 0,
        events: []
    };
}

export function afterProcess(ctx, instance, maybeEvent) {
    return new Promise(function (resolve) {
        if (!instance || !instance._hsm) {
            resolve();
            return;
        }
        if (maybeEvent) {
            instance._hsm.onAfter('processed', maybeEvent.name, resolve);
            return;
        }
        if (!instance._hsm.processing) {
            resolve();
            return;
        }
        instance._hsm.onAfter('processed', '__next__', resolve);
    });
}

export function afterDispatch(ctx, instance, event) {
    return new Promise(function (resolve) {
        if (!instance || !instance._hsm) {
            resolve();
            return;
        }
        instance._hsm.onAfter('dispatched', event.name, resolve);
    });
}

export function afterEntry(ctx, instance, stateName) {
    return new Promise(function (resolve) {
        if (!instance || !instance._hsm) {
            resolve();
            return;
        }
        instance._hsm.onAfter('entered', stateName, resolve);
    });
}

export function afterExit(ctx, instance, stateName) {
    return new Promise(function (resolve) {
        if (!instance || !instance._hsm) {
            resolve();
            return;
        }
        instance._hsm.onAfter('exited', stateName, resolve);
    });
}

export function afterExecuted(ctx, instance, stateOrBehavior) {
    return new Promise(function (resolve) {
        if (!instance || !instance._hsm) {
            resolve();
            return;
        }
        instance._hsm.onAfter('executed', stateOrBehavior, resolve);
    });
}

export function id(instance) {
    return instance && instance._hsm ? instance._hsm.id : '';
}

export function qualifiedName(instance) {
    return instance && instance._hsm ? instance._hsm.model.qualifiedName : '';
}

export function name(instance) {
    return instance && instance._hsm ? instance._hsm.name : '';
}

export function clock(instance) {
    if (instance instanceof Group) {
        return instance.clock();
    }
    return instance && instance._hsm ? instance._hsm.clock : DefaultClock;
}

/**
 * Group multiple machines.
 * @constructor
 */
export function Group() {
    this.instances = [];
    for (var i = 0; i < arguments.length; i++) {
        var instance = arguments[i];
        if (!instance) {
            continue;
        }
        if (instance instanceof Group) {
            for (var j = 0; j < instance.instances.length; j++) {
                this.instances.push(instance.instances[j]);
            }
            continue;
        }
        this.instances.push(instance);
    }
}

Group.prototype.dispatch = function (event) {
    for (var i = 0; i < this.instances.length; i++) {
        this.instances[i].dispatch(event);
    }
};

Group.prototype.set = function (name, value) {
    for (var i = 0; i < this.instances.length; i++) {
        this.instances[i].set(name, value);
    }
};

Group.prototype.call = function (name) {
    if (!this.instances.length) {
        return undefined;
    }
    var args = slice(arguments, 1);
    return this.instances[0].call.apply(this.instances[0], [name].concat(args));
};

Group.prototype.stop = function () {
    for (var i = 0; i < this.instances.length; i++) {
        stop(this.instances[i]);
    }
};

Group.prototype.restart = function (data) {
    for (var i = 0; i < this.instances.length; i++) {
        restart(this.instances[i], data);
    }
};

Group.prototype.takeSnapshot = function () {
    return {
        id: '',
        qualifiedName: '',
        state: '',
        attributes: {},
        queueLen: 0,
        events: []
    };
};

Group.prototype.clock = function () {
    return DefaultClock;
};

export function makeGroup() {
    return new (Function.prototype.bind.apply(Group, [null].concat(slice(arguments, 0))))();
}

export const Kinds = kinds;
export const NullKind = kinds.Null;
export const ElementKind = kinds.Element;
export const PartialKind = kinds.Partial;
export const VertexKind = kinds.Vertex;
export const ConstraintKind = kinds.Constraint;
export const BehaviorKind = kinds.Behavior;
export const NamespaceKind = kinds.Namespace;
export const ConcurrentKind = kinds.Concurrent;
export const SequentialKind = kinds.Sequential;
export const StateMachineKind = kinds.StateMachine;
export const AttributeKind = kinds.Attribute;
export const StateKind = kinds.State;
export const ModelKind = kinds.Model;
export const TransitionKind = kinds.Transition;
export const InternalKind = kinds.Internal;
export const ExternalKind = kinds.External;
export const LocalKind = kinds.Local;
export const SelfKind = kinds.Self;
export const EventKind = kinds.Event;
export const CompletionEventKind = kinds.CompletionEvent;
export const ChangeEventKind = kinds.ChangeEvent;
export const ErrorEventKind = kinds.ErrorEvent;
export const TimeEventKind = kinds.TimeEvent;
export const CallEventKind = kinds.CallEvent;
export const PseudostateKind = kinds.Pseudostate;
export const InitialKind = kinds.Initial;
export const FinalStateKind = kinds.FinalState;
export const ChoiceKind = kinds.Choice;
export const JunctionKind = kinds.Junction;
export const DeepHistoryKind = kinds.DeepHistory;
export const ShallowHistoryKind = kinds.ShallowHistory;
export const Define = define;
export const State = state;
export const Final = final;
export const ShallowHistory = shallowHistory;
export const DeepHistory = deepHistory;
export const Choice = choice;
export const Transition = transition;
export const Initial = initial;
export const Event = event;
export const On = on;
export const OnCall = onCall;
export const OnSet = onSet;
export const When = when;
export const After = after;
export const Every = every;
export const At = at;
export const Target = target;
export const Source = source;
export const Entry = entry;
export const Exit = exit;
export const Activity = activity;
export const Effect = effect;
export const Guard = guard;
export const Defer = defer;
export const Attribute = attribute;
export const Operation = operation;
export const DispatchAll = dispatchAll;
export const DispatchTo = dispatchTo;
export const Get = get;
export const Set = set;
export const Call = call;
export const Restart = restart;
export const TakeSnapshot = takeSnapshot;
export const MakeGroup = makeGroup;
export const MakeKind = makeKind;
export const IsKind = isKind;
export const LCA = lca;
export const IsAncestor = isAncestor;
export const ID = id;
export const QualifiedName = qualifiedName;
export const Name = name;
export const Clock = clock;
export { Profiler, Queue, apply, find };
