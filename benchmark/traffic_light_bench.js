const hsm = require('../src/hsm.js');
const { performance } = require('perf_hooks');

const WARMUP_MS = Math.max(1, parseInt(process.env.HSM_BENCH_WARMUP_MS ?? '250', 10));
const DURATION_MS = Math.max(1, parseInt(process.env.HSM_BENCH_DURATION_MS ?? '2000', 10));
const TARGET_BATCH_MS = 10;

class TrafficLight extends hsm.Instance {
    constructor() {
        super();
        this.maintenance_mode = false;
        this.cars_waiting = 0;
        this.timer = 0;
    }

    // Static callbacks
    static resetCars(ctx, inst, event) {
        inst.cars_waiting = 0;
    }
    
    static addCar(ctx, inst, event) {
        inst.cars_waiting++;
    }
    
    static noCarsWaiting(ctx, inst, event) {
        return inst.cars_waiting === 0;
    }

    static isMaintenance(ctx, inst, event) {
        return inst.maintenance_mode === true;
    }

    static isNotMaintenance(ctx, inst, event) {
        return inst.maintenance_mode === false;
    }

    static checkCarsForChoice(ctx, inst, event) {
        return inst.cars_waiting > 10;
    }

    static setTimerExtended(ctx, inst, event) {
        inst.timer = 60;
    }

    static setTimerStandard(ctx, inst, event) {
        inst.timer = 40;
    }

    static model = hsm.define('TrafficLight',
        hsm.initial(hsm.target('operational')),

        hsm.state('operational',
            hsm.transition(
                hsm.on('MaintenanceSwitch'),
                hsm.guard(TrafficLight.isMaintenance),
                hsm.target('../maintenance')
            ),
            hsm.initial(hsm.target('red')),

            hsm.state('red',
                hsm.transition(
                    hsm.on('TimerEvent'),
                    hsm.guard(TrafficLight.checkCarsForChoice),
                    hsm.effect(TrafficLight.setTimerExtended),
                    hsm.target('../green')
                ),
                hsm.transition(
                    hsm.on('TimerEvent'),
                    hsm.effect(TrafficLight.setTimerStandard),
                    hsm.target('../green')
                ),
                hsm.transition(
                    hsm.on('CarArrival'),
                    hsm.effect(TrafficLight.addCar)
                )
            ),

            hsm.state('green',
                hsm.transition(
                    hsm.on('TimerEvent'),
                    hsm.target('../yellow')
                ),
                hsm.transition(
                    hsm.on('PedestrianButton'),
                    hsm.guard(TrafficLight.noCarsWaiting),
                    hsm.target('../yellow')
                )
            ),

            hsm.state('yellow',
                hsm.defer('CarArrival'),
                hsm.transition(
                    hsm.on('TimerEvent'),
                    hsm.target('../red')
                )
            )
        ),

        hsm.state('maintenance',
            hsm.entry(TrafficLight.resetCars),
            hsm.transition(
                hsm.on('Tick'),
                hsm.effect((ctx, inst) => { inst.timer = !inst.timer; })
            ),
            hsm.transition(
                hsm.on('MaintenanceSwitch'),
                hsm.guard(TrafficLight.isNotMaintenance),
                hsm.target('../operational')
            )
        )
    );
}

function runBenchmark() {
    const ctx = new hsm.Context();
    const carEvent = { name: 'CarArrival' };
    const timerEvent = { name: 'TimerEvent' };

    function dispatchBatch(light, cycles) {
        for (let i = 0; i < cycles; i++) {
            light.dispatch(carEvent);
            light.dispatch(timerEvent);
            light.dispatch(timerEvent);
            light.dispatch(timerEvent);
        }
    }

    function calibrateBatch(light) {
        let cycles = 1;
        while (true) {
            const start = performance.now();
            dispatchBatch(light, cycles);
            const elapsedMs = performance.now() - start;
            if (elapsedMs >= TARGET_BATCH_MS || cycles >= (1 << 20)) {
                return cycles;
            }
            cycles *= 2;
        }
    }

    function runFor(light, durationMs, batchCycles) {
        const start = performance.now();
        const deadline = start + durationMs;
        let cycles = 0;
        while (performance.now() < deadline) {
            dispatchBatch(light, batchCycles);
            cycles += batchCycles;
        }
        return {
            cycles,
            durationMs: performance.now() - start
        };
    }

    const warmupLight = new TrafficLight();
    hsm.start(ctx, warmupLight, TrafficLight.model);
    const batchCycles = calibrateBatch(warmupLight);
    runFor(warmupLight, WARMUP_MS, batchCycles);

    const lightBench = new TrafficLight();
    hsm.start(ctx, lightBench, TrafficLight.model);
    const { cycles, durationMs } = runFor(lightBench, DURATION_MS, batchCycles);
    
    const totalDispatches = cycles * 4;
    const opsPerSec = (totalDispatches / (durationMs / 1000)) | 0;
    
    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    
    console.log(JSON.stringify({
        language: "JavaScript (Node)",
        iterations: totalDispatches,
        duration_ms: Math.round(durationMs),
        memory_mb: Number(memUsage.toFixed(2)),
        throughput_ops_per_sec: opsPerSec
    }));
}

runBenchmark();
