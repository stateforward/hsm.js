const hsm = require('../src/hsm.js');
const robot3 = require('../thirdparty/robot3.js');


function benchHSM(iterations) {
    var model = hsm.define(
        'SimpleToggle',
        hsm.state('off',
            hsm.transition(hsm.on('toggle'), hsm.target('../on'))
        ),
        hsm.state('on',
            hsm.transition(hsm.on('toggle'), hsm.target('../off'))
        ),
        hsm.initial(hsm.target('off'))
    );

    var instance = new hsm.Instance();
    var profiler = new hsm.Profiler();
    console.time('benchHSM');

    hsm.start(instance, model, profiler);
    for (var i = 0; i < iterations; i++) {
        instance.dispatch("toggle");
    }
    console.timeEnd('benchHSM');
    profiler.report();
}

function benchRobot3(iterations) {
    var machine = robot3.createMachine({
        "on": robot3.state(
            robot3.transition("toggle", "off", robot3.guard(() => true)),
        ),
        "off": robot3.state(
            robot3.transition("toggle", "on", robot3.guard(() => true))
        ),
    });
    var profiler = robot3.createProfiler();
    console.time('benchRobot3');
    var instance = robot3.interpret(machine, null, {}, null, profiler);
    for (var i = 0; i < iterations; i++) {
        instance.send("toggle");
    }
    console.timeEnd('benchRobot3');
    profiler.report();
}

setTimeout(() => {
    var iterations = 10000000;
    benchHSM(iterations);
    benchRobot3(iterations);
}, 1000);