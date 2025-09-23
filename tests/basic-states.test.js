/**
 * @fileoverview Test basic state transitions and state machine lifecycle
 * Tests fundamental HSM features including state transitions, lifecycle methods, and basic event handling
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class BasicInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic state machine with simple transitions', async function () {
  const instance = new BasicInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('BasicMachine',
    hsm.initial(
      hsm.target('idle')
    ),
    hsm.state('idle',
      hsm.transition(
        hsm.on('start'),
        hsm.target('../running')
      )
    ),
    hsm.state('running',
      hsm.transition(
        hsm.on('stop'),
        hsm.target('../idle')
      )
    )
  );

  // Start the state machine
  hsm.start(ctx, instance, model);

  // Should start in idle state
  assert.strictEqual(instance.state(), '/BasicMachine/idle');

  // Dispatch start event
  instance.dispatch({ name: 'start', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/BasicMachine/running');

  // Dispatch stop event
  instance.dispatch({ name: 'stop', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/BasicMachine/idle');

  // Stop the state machine
  hsm.stop(instance);
});

test('State machine lifecycle - start and stop', async function () {
  const instance = new BasicInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('LifecycleMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('active-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('active-exit');
      })
    )
  );

  // Start the state machine
  hsm.start(ctx, instance, model);

  // Should have executed entry action
  assert.deepStrictEqual(instance.log, ['active-entry']);
  assert.strictEqual(instance.state(), '/LifecycleMachine/active');

  // Stop the state machine
  hsm.stop(instance);

  // Should have executed exit action
  assert.deepStrictEqual(instance.log, ['active-entry', 'active-exit']);

  // State should be reset to model (root)
  assert.strictEqual(instance.state(), '/LifecycleMachine');
});

test('Multiple transitions from the same state', async function () {
  const instance = new BasicInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('MultiTransitionMachine',
    hsm.initial(
      hsm.target('idle')
    ),
    hsm.state('idle',
      hsm.transition(
        hsm.on('event1'),
        hsm.target('../state1')
      ),
      hsm.transition(
        hsm.on('event2'),
        hsm.target('../state2')
      )
    ),
    hsm.state('state1',
      hsm.transition(
        hsm.on('back'),
        hsm.target('../idle')
      )
    ),
    hsm.state('state2',
      hsm.transition(
        hsm.on('back'),
        hsm.target('../idle')
      )
    )
  );

  hsm.start(ctx, instance, model);

  // Test first transition
  instance.dispatch({ name: 'event1', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultiTransitionMachine/state1');

  // Go back to idle
  instance.dispatch({ name: 'back', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultiTransitionMachine/idle');

  // Test second transition
  instance.dispatch({ name: 'event2', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultiTransitionMachine/state2');

  hsm.stop(instance);
});

test('Self transitions', async function () {
  const instance = new BasicInstance();

  const model = hsm.define('SelfTransitionMachine',
    hsm.initial(
      hsm.target('counter')
    ),
    hsm.state('counter',
      hsm.entry(function (ctx, inst, event) {
        inst.data.count = (inst.data.count || 0) + 1;
        inst.logAction('counter-entry-' + inst.data.count);
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('counter-exit-' + inst.data.count);
      }),
      hsm.transition(
        hsm.on('increment'),
        hsm.target('../counter'), // Self transition
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('increment-effect');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Initial entry
  assert.strictEqual(instance.data.count, 1);
  assert.deepStrictEqual(instance.log, ['counter-entry-1']);

  // Self transition should exit and re-enter the state
  instance.dispatch({ name: 'increment', kind: hsm.kinds.Event });
  assert.strictEqual(instance.data.count, 2);
  assert.deepStrictEqual(instance.log, [
    'counter-entry-1',
    'counter-exit-1',
    'increment-effect',
    'counter-entry-2'
  ]);

  hsm.stop(instance);
});

test('Internal transitions', async function () {
  const instance = new BasicInstance();

  const model = hsm.define('InternalTransitionMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',
      hsm.entry(function (ctx, inst, event) {
        inst.data.entryCount = (inst.data.entryCount || 0) + 1;
        inst.logAction('active-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('active-exit');
      }),
      hsm.transition(
        hsm.on('internal'),
        // No target specified makes it internal
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('internal-effect');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Initial entry
  assert.strictEqual(instance.data.entryCount, 1);
  assert.deepStrictEqual(instance.log, ['active-entry']);

  // Internal transition should NOT exit/enter the state
  instance.dispatch({ name: 'internal', kind: hsm.kinds.Event });
  assert.strictEqual(instance.data.entryCount, 1); // Should not re-enter
  assert.deepStrictEqual(instance.log, [
    'active-entry',
    'internal-effect'
  ]);

  hsm.stop(instance);
});

test('Event dispatching during state machine lifecycle', async function () {
  const instance = new BasicInstance();

  const model = hsm.define('EventLifecycleMachine',
    hsm.initial(
      hsm.target('a')
    ),
    hsm.state('a',
      hsm.transition(
        hsm.on('next'),
        hsm.target('../b')
      )
    ),
    hsm.state('b')
  );

  // Events dispatched before start should be ignored
  // (Can't dispatch before we have an HSM instance)

  // Start the state machine
  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/EventLifecycleMachine/a');

  // Now event should work
  instance.dispatch({ name: 'next', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/EventLifecycleMachine/b');

  // Stop the state machine
  hsm.stop(instance);

  // Events after stop should be ignored
  instance.dispatch({ name: 'next', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/EventLifecycleMachine'); // Root state after stop
});

test('Unknown events should be ignored', async function () {
  const instance = new BasicInstance();

  const model = hsm.define('UnknownEventMachine',
    hsm.initial(
      hsm.target('stable')
    ),
    hsm.state('stable',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('stable-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/UnknownEventMachine/stable');

  // Dispatch unknown events
  instance.dispatch({ name: 'unknown1', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'unknown2', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'unknown3', kind: hsm.kinds.Event });

  // State should remain unchanged
  assert.strictEqual(instance.state(), '/UnknownEventMachine/stable');
  // No additional actions should have been triggered
  assert.deepStrictEqual(instance.log, ['stable-entry']);

  hsm.stop(instance);
});

test('Event object vs string dispatching', async function () {
  const instance = new BasicInstance();

  const model = hsm.define('EventTypeMachine',
    hsm.initial(
      hsm.target('waiting')
    ),
    hsm.state('waiting',
      hsm.transition(
        hsm.on('proceed'),
        hsm.target('../done'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('effect-' + event.name);
          inst.data.eventData = event.data;
        })
      )
    ),
    hsm.state('done')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Test event with no data
  instance.dispatch({ name: 'proceed', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/EventTypeMachine/done');
  assert.deepStrictEqual(instance.log, ['effect-proceed']);
  assert.strictEqual(instance.data.eventData, undefined);

  // Reset
  hsm.stop(instance);
  instance.log = [];
  instance.data = {};
  const ctx2 = new hsm.Context();
  hsm.start(ctx2, instance, model);

  // Test event object with data
  instance.dispatch({
    name: 'proceed',
    kind: hsm.kinds.Event,
    data: { value: 42 }
  });
  assert.strictEqual(instance.state(), '/EventTypeMachine/done');
  assert.deepStrictEqual(instance.log, ['effect-proceed']);
  assert.deepStrictEqual(instance.data.eventData, { value: 42 });

  hsm.stop(instance);
});