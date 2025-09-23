/**
 * @fileoverview Test deferred event handling
 * Tests events that are held and re-dispatched when the machine moves to a state that can handle them
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Helper to create a delay promise
function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Test instance implementation
class DeferredInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic deferred event - held and processed later', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('BasicDeferredMachine',
    hsm.initial(
      hsm.target('busy')
    ),
    hsm.state('busy',
      hsm.defer('process'), // Defer 'process' events
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('busy-entry');
      }),
      hsm.transition(
        hsm.on('ready'),
        hsm.target('../idle'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('ready-transition');
        })
      )
    ),
    hsm.state('idle',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('idle-entry');
      }),
      hsm.transition(
        hsm.on('process'),
        hsm.target('../working'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('process-handled');
        })
      )
    ),
    hsm.state('working',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('working-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.deepStrictEqual(instance.log, ['busy-entry']);
  assert.strictEqual(instance.state(), '/BasicDeferredMachine/busy');

  // Send deferred event while in busy state
  instance.dispatch({ name: 'process', kind: hsm.kinds.Event });

  // Should still be in busy state, event deferred
  assert.strictEqual(instance.state(), '/BasicDeferredMachine/busy');
  assert.deepStrictEqual(instance.log, ['busy-entry']);

  // Transition to idle state
  instance.dispatch({ name: 'ready', kind: hsm.kinds.Event });

  // Should now process the deferred event
  await delay(10);
  assert.deepStrictEqual(instance.log, [
    'busy-entry',
    'ready-transition',
    'idle-entry',
    'process-handled',
    'working-entry'
  ]);
  assert.strictEqual(instance.state(), '/BasicDeferredMachine/working');

  hsm.stop(instance);
});

test('Multiple deferred events processed in order', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('MultipleDeferredMachine',
    hsm.initial(
      hsm.target('blocked')
    ),
    hsm.state('blocked',
      hsm.defer('event1', 'event2', 'event3'),
      hsm.transition(
        hsm.on('unblock'),
        hsm.target('../open')
      )
    ),
    hsm.state('open',
      hsm.transition(
        hsm.on('event1'),
        hsm.target('../state1'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('handled-event1');
        })
      ),
      hsm.transition(
        hsm.on('event2'),
        hsm.target('../state2'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('handled-event2');
        })
      ),
      hsm.transition(
        hsm.on('event3'),
        hsm.target('../state3'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('handled-event3');
        })
      )
    ),
    hsm.state('state1'),
    hsm.state('state2'),
    hsm.state('state3')
  );

  const ctx = new hsm.Context();
  var sm = hsm.start(ctx, instance, model);

  // Send multiple deferred events
  console.log('start instance.queue', sm.queue);
  instance.dispatch({ name: 'event2', kind: hsm.kinds.Event });
  console.log('after event2 instance.queue', sm.queue);
  instance.dispatch({ name: 'event1', kind: hsm.kinds.Event });
  console.log('after event1 instance.queue', sm.queue);
  instance.dispatch({ name: 'event3', kind: hsm.kinds.Event });
  console.log('after event3 instance.queue', sm.queue);
  console.log('end instance.queue', sm.queue);
  // Should still be blocked
  assert.strictEqual(instance.state(), '/MultipleDeferredMachine/blocked');
  assert.deepStrictEqual(instance.log, []);

  // Unblock and process deferred events
  instance.dispatch({ name: 'unblock', kind: hsm.kinds.Event });
  await delay(10);

  // Should process first deferred event (event2)
  assert.deepStrictEqual(instance.log, ['handled-event2']);
  assert.strictEqual(instance.state(), '/MultipleDeferredMachine/state2');

  hsm.stop(instance);
});

test('Deferred events in hierarchical states', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('HierarchicalDeferredMachine',
    hsm.initial(
      hsm.target('active/connecting')
    ),
    hsm.state('active',
      hsm.state('connecting',
        hsm.defer('send'),
        hsm.transition(
          hsm.on('connected'),
          hsm.target('../connected/idle')
        )
      ),
      hsm.state(
        'connected',
        hsm.state(
          "idle",
          hsm.transition(
            hsm.on('send'),
            hsm.target('../sending')
          ),
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('idle-entry');
          })
        ),
        hsm.state(
          'sending',
          hsm.defer('disconnect'),
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('sending-entry');
          }),
          hsm.transition(
            hsm.on('sent'),
            hsm.target('../idle')
          )
        )
      )
    ),
    hsm.state('disconnected')
  );
  console.log('model', model.deferredMap);
  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/active/connecting');

  // Send events that are deferred at different levels
  instance.dispatch({ name: 'send', kind: hsm.kinds.Event }); // Deferred by child1
  assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/active/connecting');
  instance.dispatch({ name: 'connected', kind: hsm.kinds.Event });  // Deferred by parent
  assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/active/connected/sending');
  assert.deepStrictEqual(instance.log, ['idle-entry', 'sending-entry']);
  instance.log = [];
  instance.dispatch({ name: 'sent', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/active/connected/idle');

  // Switch to child2 - should process local event
  // instance.dispatch({ name: 'switch', kind: hsm.kinds.Event });
  // await delay(10);

  // assert.deepStrictEqual(instance.log, ['child2-handled-local']);
  // assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/parent/child1');

  // // Go up to parent level - should process global event
  // instance.dispatch({ name: 'up', kind: hsm.kinds.Event });
  // assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/parent');
  // await delay(10);

  // assert.deepStrictEqual(instance.log, [
  //   'child2-handled-global',
  // ]);
  // assert.strictEqual(instance.state(), '/HierarchicalDeferredMachine/done');

  // hsm.stop(instance);
});

test('Deferred event overridden by immediate handler', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('DeferredOverrideMachine',
    hsm.initial(
      hsm.target('deferring')
    ),
    hsm.state('deferring',
      hsm.defer('test'),
      hsm.transition(
        hsm.on('test'), // Immediate handler
        hsm.target('../immediate'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('immediate-handler');
        })
      ),
      hsm.transition(
        hsm.on('allow'),
        hsm.target('../allowing')
      )
    ),
    hsm.state('immediate'),
    hsm.state('allowing',
      hsm.transition(
        hsm.on('test'),
        hsm.target('../handled'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('deferred-handler');
        })
      )
    ),
    hsm.state('handled')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Send test event - should be handled immediately despite deferral
  instance.dispatch({ name: 'test', kind: hsm.kinds.Event });

  assert.deepStrictEqual(instance.log, ['immediate-handler']);
  assert.strictEqual(instance.state(), '/DeferredOverrideMachine/immediate');

  hsm.stop(instance);
});

test('Deferred events discarded on machine stop', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('DeferredDiscardMachine',
    hsm.initial(
      hsm.target('blocking')
    ),
    hsm.state('blocking',
      hsm.defer('discard'),
      hsm.transition(
        hsm.on('unblock'),
        hsm.target('../open')
      )
    ),
    hsm.state('open',
      hsm.transition(
        hsm.on('discard'),
        hsm.target('../processed'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('processed-discard');
        })
      )
    ),
    hsm.state('processed')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Send deferred event
  instance.dispatch({ name: 'discard', kind: hsm.kinds.Event });

  // Stop machine before processing deferred events
  hsm.stop(instance);

  // Restart machine
  instance.log = [];
  const ctx2 = new hsm.Context();
  hsm.start(ctx2, instance, model);

  // Unblock and check that old deferred event is not processed
  instance.dispatch({ name: 'unblock', kind: hsm.kinds.Event });
  await delay(10);

  assert.strictEqual(instance.log.includes('processed-discard'), false);
  assert.strictEqual(instance.state(), '/DeferredDiscardMachine/open');

  hsm.stop(instance);
});

test('Deferred event with data preservation', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('DeferredDataMachine',
    hsm.initial(
      hsm.target('waiting')
    ),
    hsm.state('waiting',
      hsm.defer('data'),
      hsm.transition(
        hsm.on('proceed'),
        hsm.target('../ready')
      )
    ),
    hsm.state('ready',
      hsm.transition(
        hsm.on('data'),
        hsm.target('../processed'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('processed-data');
          inst.data.receivedData = event.data;
        })
      )
    ),
    hsm.state('processed')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Send event with data while deferred
  instance.dispatch({
    name: 'data',
    kind: hsm.kinds.Event,
    data: { value: 'test-payload', count: 42 }
  });

  // Proceed to ready state
  instance.dispatch({ name: 'proceed', kind: hsm.kinds.Event });
  await delay(10);

  // Deferred event should be processed with data intact
  assert.deepStrictEqual(instance.log, ['processed-data']);
  assert.deepStrictEqual(instance.data.receivedData, {
    value: 'test-payload',
    count: 42
  });
  assert.strictEqual(instance.state(), '/DeferredDataMachine/processed');

  hsm.stop(instance);
});

test('No infinite loops with deferred self-transitions', async function () {
  const instance = new DeferredInstance();

  const model = hsm.define('DeferredSelfMachine',
    hsm.initial(
      hsm.target('state1')
    ),
    hsm.state('state1',
      hsm.defer('loop'),
      hsm.transition(
        hsm.on('switch'),
        hsm.target('../state2')
      )
    ),
    hsm.state('state2',
      hsm.entry(function (ctx, inst, event) {
        inst.data.entryCount = (inst.data.entryCount || 0) + 1;
        inst.logAction('state2-entry-' + inst.data.entryCount);
      }),
      hsm.transition(
        hsm.on('loop'),
        hsm.target('../state2'), // Self transition
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('self-loop');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  var sm = hsm.start(ctx, instance, model);

  // Send deferred event
  instance.dispatch({ name: 'loop', kind: hsm.kinds.Event });
  assert.strictEqual(sm._hsm.queue.len(), 1);
  assert.strictEqual(sm.state(), '/DeferredSelfMachine/state1');
  // Switch to state2 - should process deferred event once
  instance.dispatch({ name: 'switch', kind: hsm.kinds.Event });
  await delay(10);
  assert.strictEqual(sm._hsm.queue.len(), 0);
  assert.strictEqual(sm.state(), '/DeferredSelfMachine/state2');
  assert.deepStrictEqual(instance.log, [
    'state2-entry-1',
    'self-loop',
    'state2-entry-2'
  ]);
  assert.strictEqual(instance.data.entryCount, 2);
  assert.strictEqual(instance.state(), '/DeferredSelfMachine/state2');

  hsm.stop(instance);
});