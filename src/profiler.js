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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Profiler;
} else if (typeof exports !== 'undefined') {
    for (var key in Profiler) {
        /** @type {Object<key, any>} */ (exports)[key] = Profiler[/** @type {keyof typeof Profiler} */ (key)];
    }
} else {
    // Global export for Espruino
    // @ts-ignore
    global.Profiler = Profiler;
} 