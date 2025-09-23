/**
 * Simple on/off light state machine benchmark
 */

const hsm = require('../src/hsm.js');

// Simple light HSM instance
class LightHSM extends hsm.Instance {
    constructor() {
        super();
    }
}

// No-op behavior function
async function noBehavior(sm, event) {
    // Do nothing
}

// Create simple on/off light state machine model
function createLightModel() {
    const onEvent = hsm.event('on');
    const offEvent = hsm.event('off');
    
    return hsm.define(
        'LightHSM',
        hsm.state('off'),
        hsm.state('on'),
        hsm.transition(
            hsm.on(onEvent),
            hsm.source('off'),
            hsm.target('on')
        ),
        hsm.transition(
            hsm.on(offEvent),
            hsm.source('on'),
            hsm.target('off')
        ),
        hsm.initial(hsm.target('off'))
    );
}

// Get memory usage (Node.js specific)
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return usage.heapUsed;
}

// Run light on/off benchmark
async function runLightBenchmark(iterations = 100000) {
    const model = createLightModel();
    const sm = new LightHSM();
    await hsm.start(sm, model);
    
    const onEvent = hsm.event('on');
    const offEvent = hsm.event('off');
    
    // Warmup
    for (let i = 0; i < 1000; i++) {
        await sm.dispatch(onEvent);
        await sm.dispatch(offEvent);
    }
    
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
    
    // Record memory before benchmark
    const memBefore = getMemoryUsage();
    
    // Start timing
    const startTime = process.hrtime.bigint();
    
    // Run benchmark iterations
    for (let i = 0; i < iterations; i++) {
        await sm.dispatch(onEvent);
        await sm.dispatch(offEvent);
    }
    
    // End timing
    const endTime = process.hrtime.bigint();
    
    // Record memory after benchmark
    const memAfter = getMemoryUsage();
    
    // Calculate results
    const totalTimeNs = Number(endTime - startTime);
    const totalTransitions = iterations * 2; // Two transitions per iteration
    const transitionsPerSecond = (totalTransitions * 1e9) / totalTimeNs;
    const timePerTransitionNs = totalTimeNs / totalTransitions;
    const memoryUsed = memAfter - memBefore;
    const bytesPerOp = memoryUsed / totalTransitions;
    
    return {
        transitionsPerSecond,
        timePerTransitionNs,
        bytesPerOp,
        totalTransitions,
        memoryUsed
    };
}

async function main() {
    console.log('Light State Machine Benchmark (JavaScript)');
    console.log('==========================================');
    
    const iterations = 100000;
    const results = await runLightBenchmark(iterations);
    
    console.log(`Iterations: ${iterations}`);
    console.log(`Total transitions: ${results.totalTransitions}`);
    console.log(`Transitions per second: ${Math.round(results.transitionsPerSecond).toLocaleString()}`);
    console.log(`Memory bytes per operation: ${results.bytesPerOp.toFixed(1)}`);
    console.log(`Time per transition: ${results.timePerTransitionNs.toFixed(1)} ns`);
}

// Export for use as module
module.exports = {
    LightHSM,
    createLightModel,
    runLightBenchmark
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}