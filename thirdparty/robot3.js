function valueEnumerable(value) {
    return { enumerable: true, value: value };
}

function valueEnumerableWritable(value) {
    return { enumerable: true, writable: true, value: value };
}

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

Profiler.prototype = {
    constructor: Profiler,

    /**
     * Reset all profiling data
     */
    reset: function () {
        this.stats = {};
        this.startTimes = {};
    },

    /**
     * Get current time in seconds (Espruino compatible)
     * @returns {number} Current time in seconds
     */
    getTime: function () {
        // Use Espruino's getTime() if available, otherwise fallback to Date
        // @ts-ignore - getTime is Espruino global
        if (typeof getTime !== 'undefined') {
            // @ts-ignore - getTime is Espruino global
            return getTime();
        } else {
            return Date.now() / 1000;
        }
    },

    /**
     * Start timing an operation
     * @param {string} name - Operation name
     */
    start: function (name) {
        if (!this.enabled) return;
        this.startTimes[name] = this.getTime();
    },

    /**
     * End timing an operation
     * @param {string} name - Operation name
     */
    end: function (name) {
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
    },

    /**
     * Get profiling results
     * @returns {Object<string, {count: number, totalTime: number, maxTime: number, avgTime: number}>} 
     */
    getResults: function () {
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
    },

    /**
     * Print profiling results to console
     */
    report: function () {
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

        console.log("State Machine Profiling Results:");
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
    }
};

function sliceArguments(args, start, stop) {
    return Array.isArray(args)
        ? args.slice(start, stop)
        : Array.prototype.slice.call(args, start, stop);
}

function isKind(source, kind) {
    return source.KIND === kind;
}

let d = {};

let truthy = function () {
    return true;
};

let empty = function () {
    return {};
};

let identity = function (a) {
    return a;
};

let callBoth = function (par, fn, self, args) {
    return par.apply(self, args) && fn.apply(self, args);
};

let callForward = function (par, fn, self, args) {
    var a = args[0],
        b = args[1];
    return fn.call(self, par.call(self, a, b), b);
};

let create = function (a, b) {
    const obj = Object.create(a);
    for (let key in b) {
        Object.defineProperty(obj, key, b[key]);
    }
    return Object.freeze ? Object.freeze(obj) : obj;
};

function stack(fns, def, caller) {
    return fns.reduce(function (par, fn) {
        return function () {
            return caller(par, fn, this, sliceArguments(arguments));
        };
    }, def);
}

function fnType(fn) {
    return create(this, { fn: valueEnumerable(fn) });
}

let reduceType = { KIND: "reduce" };
var reduce = fnType.bind(reduceType);

let guardType = { KIND: "guard" };
var guard = fnType.bind(guardType);

function filter(kind, arr) {
    return arr.filter(function (value) {
        return isKind(value, kind);
    });
}

function makeTransition(from, to) {
    var args = sliceArguments(arguments, 2);
    var guards = stack(
        filter("guard", args).map(function (t) {
            return t.fn;
        }),
        truthy,
        callBoth
    );
    var reducers = stack(
        filter("reduce", args).map(function (t) {
            return t.fn;
        }),
        identity,
        callForward
    );
    return create(this, {
        from: valueEnumerable(from),
        to: valueEnumerable(to),
        guards: valueEnumerable(guards),
        reducers: valueEnumerable(reducers),
    });
}

let transitionType = { KIND: "transition" };
let immediateType = { KIND: "immediate" };
let transition = makeTransition.bind(transitionType);
let immediate = makeTransition.bind(immediateType, null);

function Map() {
    if (!(this instanceof Map)) return new Map();
    this.has = function (key) {
        return this.get(key) !== undefined;
    };
    this.set = function (key, value) {
        this[key] = value;
        return this;
    };
    this.get = function (key) {
        return this[key];
    };
    this.delete = function (key) {
        delete this[key];
    };
}

function transitionsToMap(transitions) {
    let m = new Map();
    for (let t of transitions) {
        if (!m.has(t.from)) m.set(t.from, []);
        m.get(t.from).push(t);
    }
    return m;
}
let stateType = { enter: identity, KIND: "state" };

function state() {
    var args = sliceArguments(arguments);
    let transitions = filter("transition", args);
    let immediates = filter("immediate", args);
    let desc = {
        final: valueEnumerable(args.length === 0),
        transitions: valueEnumerable(transitionsToMap(transitions)),
    };
    if (immediates.length) {
        desc.immediates = valueEnumerable(immediates);
        desc.enter = valueEnumerable(function (machine, service, event) {
            var result = transitionTo(service, machine, event, this.immediates) || machine;
            return result;
        });
    }
    return create(stateType, desc);
}

const invokeFnType = {
    enter(machine2, service, event) {
        if (service.profiler) {
            service.profiler.start('invokeFn');
        }

        let rn = this.fn.call(service, service.context, event);
        if (isKind(rn, "machine")) {
            var result = create(invokeMachineType, {
                machine: valueEnumerable(rn),
                transitions: valueEnumerable(this.transitions),
            }).enter(machine2, service, event);

            if (service.profiler) {
                service.profiler.end('invokeFn');
            }

            return result;
        }
        rn.then((data) => service.send({ type: "done", data })).catch((error) =>
            service.send({ type: "error", error })
        );

        if (service.profiler) {
            service.profiler.end('invokeFn');
        }

        return machine2;
    },
};

let invokeMachineType = {
    enter(machine, service, event) {
        if (service.profiler) {
            service.profiler.start('invokeMachine');
        }

        service.child = interpret(
            this.machine,
            (s) => {
                service.onChange(s);
                if (service.child == s && s.machine.state.value.final) {
                    delete service.child;
                    service.send({ type: "done", data: s.context });
                }
            },
            service.context,
            event,
            service.profiler
        );
        if (service.child.machine.state.value.final) {
            let data = service.child.context;
            delete service.child;
            var result = transitionTo(
                service,
                machine,
                { type: "done", data },
                this.transitions.get("done")
            );

            if (service.profiler) {
                service.profiler.end('invokeMachine');
            }

            return result;
        }

        if (service.profiler) {
            service.profiler.end('invokeMachine');
        }

        return machine;
    },
};

function invoke(fn) {
    var transitions = sliceArguments(arguments, 1);
    var t = valueEnumerable(transitionsToMap(transitions));
    return isKind(fn, "machine")
        ? create(invokeMachineType, {
            machine: valueEnumerable(fn),
            transitions: t,
        })
        : create(invokeFnType, {
            fn: valueEnumerable(fn),
            transitions: t,
        });
}

let machine = {
    get state() {
        return {
            name: this.current,
            value: this.states[this.current],
        };
    },
    KIND: "machine",
};

function createMachine(current, states, contextFn) {
    if (typeof current !== "string") {
        contextFn = states || empty;
        states = current;
        current = Object.keys(states)[0];
    }

    contextFn = contextFn || empty;

    if (d._create) {
        d._create(current, states);
    }

    return create(machine, {
        context: valueEnumerable(contextFn),
        current: valueEnumerable(current),
        states: valueEnumerable(states),
    });
}

function transitionTo(service, machine, fromEvent, candidates) {
    if (service.profiler) {
        service.profiler.start('transitionTo');
    }

    var context = service.context;
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];

        // Profile guard evaluation
        if (service.profiler) {
            service.profiler.start('guard');
        }
        var guardResult = candidate.guards(context, fromEvent);
        if (service.profiler) {
            service.profiler.end('guard');
        }

        if (guardResult) {
            // Profile reducer execution
            if (service.profiler) {
                service.profiler.start('reducer');
            }
            service.context = candidate.reducers.call(service, context, fromEvent);
            if (service.profiler) {
                service.profiler.end('reducer');
            }

            var original = machine.original || machine;
            var newMachine = create(original, {
                current: valueEnumerable(candidate.to),
                original: { value: original },
            });
            if (d._onEnter) {
                d._onEnter(machine, candidate.to, service.context, context, fromEvent);
            }
            var state = newMachine.state.value;
            service.machine = newMachine;
            if (service.onChange) {
                service.onChange(service);
            }
            if (service.profiler) {
                service.profiler.start('enter');
            }
            var result = state.enter(newMachine, service, fromEvent);

            if (service.profiler) {
                service.profiler.end('enter');
            }
            if (service.profiler) {
                service.profiler.end('transitionTo');
            }
            return result;
        }
    }

    if (service.profiler) {
        service.profiler.end('transitionTo');
    }
}

function send(service, event) {
    if (service.profiler) {
        service.profiler.start('send');
    }

    var eventName = event.type || event;
    var machine = service.machine;
    var state = machine.state;
    var currentStateName = state.name;
    var transitions = state.value.transitions;

    var result;
    if (transitions.has(eventName)) {
        result = (
            transitionTo(service, machine, event, transitions.get(eventName)) ||
            machine
        );
    } else {
        if (d._send) {
            d._send(eventName, currentStateName);
        }
        result = machine;
    }

    if (service.profiler) {
        service.profiler.end('send');
    }
    return result;
}

let service = {
    send: function (event) {
        send(this, event);
    },
};

function interpret(machine, onChange, initialContext, event, profiler) {
    var s = create(service, {
        machine: valueEnumerableWritable(machine),
        context: valueEnumerableWritable(machine.context(initialContext, event)),
        onChange: valueEnumerable(onChange),
        profiler: valueEnumerable(profiler || new Profiler(true))
    });
    s.send = s.send.bind(s);

    if (s.profiler) {
        s.profiler.start('interpret');
    }

    s.machine = s.machine.state.value.enter(s.machine, s, event);

    if (s.profiler) {
        s.profiler.end('interpret');
    }

    return s;
}

function sleep(ms) {
    return () => new Promise(function (resolve) { return setTimeout(resolve, ms); });
}

/**
 * Create and start a state machine with optional profiling
 * @param {Object} machine - The state machine definition
 * @param {Function} onChange - State change callback
 * @param {Object} [initialContext] - Initial context
 * @param {Object} [event] - Initial event
 * @param {Profiler} [profiler] - Optional profiler instance
 * @returns {Object} The service instance
 */
function startMachine(machine, onChange, initialContext, event, profiler) {
    return interpret(machine, onChange, initialContext, event, profiler);
}

/**
 * Create a profiler instance
 * @param {boolean} [disabled] - Whether profiling is disabled
 * @returns {Profiler} The profiler instance
 */
function createProfiler(disabled) {
    return new Profiler(disabled);
}

const robot3 = {
    "createProfiler": createProfiler,
    "startMachine": startMachine,
    "createMachine": createMachine,
    "invoke": invoke,
    "state": state,
    "transition": transition,
    "immediate": immediate,
    "guard": guard,
    "reduce": reduce,
    "interpret": interpret,
    "send": send,
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = robot3;
} else if (typeof exports !== 'undefined') {
    for (var key in robot3) {
          /** @type {Object<key, any>} */ (exports)[key] = robot3[/** @type {keyof typeof robot3} */ (key)];
    }
} else {
    // Global export for Espruino
    // @ts-ignore
    global.robot3 = robot3;
}