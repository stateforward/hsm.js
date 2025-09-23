/**
 * @fileoverview Test entry/exit actions and transition effects
 * Tests action execution order and behavior in various scenarios
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class ActionInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic entry and exit actions', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('BasicActionMachine',
    hsm.initial(
      hsm.target('state1')
    ),
    hsm.state('state1',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('state1-entry');
        inst.state1Entered = true;
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('state1-exit');
        inst.state1Exited = true;
      }),
      hsm.transition(
        hsm.on('next'),
        hsm.target('../state2')
      )
    ),
    hsm.state('state2',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('state2-entry');
        inst.state2Entered = true;
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('state2-exit');
        inst.state2Exited = true;
      })
    )
  );

  hsm.start(ctx, instance, model);

  // Should execute entry action on start
  assert.deepStrictEqual(instance.log, ['state1-entry']);
  assert.strictEqual(instance.state1Entered, true);

  // Transition should execute exit and entry
  instance.dispatch({ name: 'next', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'state1-entry',
    'state1-exit',
    'state2-entry'
  ]);
  assert.strictEqual(instance.state1Exited, true);
  assert.strictEqual(instance.state2Entered, true);

  // Stop should execute exit
  hsm.stop(instance);
  assert.deepStrictEqual(instance.log, [
    'state1-entry',
    'state1-exit',
    'state2-entry',
    'state2-exit'
  ]);
  assert.strictEqual(instance.state2Exited, true);
});

test('Multiple entry and exit actions in order', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('MultipleActionMachine',
    hsm.initial(
      hsm.target('multi')
    ),
    hsm.state('multi',
      hsm.entry(
        function (ctx, inst, event) { inst.logAction('entry-1'); },
        function (ctx, inst, event) { inst.logAction('entry-2'); },
        function (ctx, inst, event) { inst.logAction('entry-3'); }
      ),
      hsm.exit(
        function (ctx, inst, event) { inst.logAction('exit-1'); },
        function (ctx, inst, event) { inst.logAction('exit-2'); },
        function (ctx, inst, event) { inst.logAction('exit-3'); }
      ),
      hsm.transition(
        hsm.on('leave'),
        hsm.target('../done')
      )
    ),
    hsm.state('done')
  );

  hsm.start(ctx, instance, model);

  // Multiple entry actions should execute in order
  assert.deepStrictEqual(instance.log, ['entry-1', 'entry-2', 'entry-3']);

  // Multiple exit actions should execute in order
  instance.dispatch({ name: 'leave', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'entry-1', 'entry-2', 'entry-3',
    'exit-1', 'exit-2', 'exit-3'
  ]);

  hsm.stop(instance);
});

test('Transition effects', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('EffectMachine',
    hsm.initial(
      hsm.target('source')
    ),
    hsm.state('source',
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('source-exit');
      }),
      hsm.transition(
        hsm.on('go'),
        hsm.target('../target'),
        hsm.effect(
          function (ctx, inst, event) { inst.logAction('effect-1'); },
          function (ctx, inst, event) { inst.logAction('effect-2'); },
          function (ctx, inst, event) { inst.logAction('effect-3'); }
        )
      )
    ),
    hsm.state('target',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('target-entry');
      })
    )
  );

  hsm.start(ctx, instance, model);
  instance.log = [];

  // Effects should execute between exit and entry
  instance.dispatch({ name: 'go', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'source-exit',
    'effect-1',
    'effect-2',
    'effect-3',
    'target-entry'
  ]);

  hsm.stop(instance);
});

test('Action execution order in hierarchical states', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('HierarchicalActionMachine',
    hsm.initial(
      hsm.target('parent/child1')
    ),
    hsm.state('parent',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('parent-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('parent-exit');
      }),

      hsm.state('child1',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('child1-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('child1-exit');
        }),
        hsm.transition(
          hsm.on('switch'),
          hsm.target('../child2'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('switch-effect');
          })
        )
      ),

      hsm.state('child2',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('child2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('child2-exit');
        })
      ),

      hsm.transition(
        hsm.on('leave'),
        hsm.target('../outside')
      )
    ),

    hsm.state('outside',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('outside-entry');
      })
    )
  );

  hsm.start(ctx, instance, model);

  // Entry order: parent -> child
  assert.deepStrictEqual(instance.log, ['parent-entry', 'child1-entry']);

  // Sibling transition
  instance.log = [];
  instance.dispatch({ name: 'switch', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'child1-exit',
    'switch-effect',
    'child2-entry'
  ]);

  // Exit hierarchy
  instance.log = [];
  instance.dispatch({ name: 'leave', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'child2-exit',
    'parent-exit',
    'outside-entry'
  ]);

  hsm.stop(instance);
});

test('Actions with event data access', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('EventDataActionMachine',
    hsm.initial(
      hsm.target('receiver')
    ),
    hsm.state('receiver',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('entry-with-' + event.name);
        inst.data.entryEvent = event;
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('exit-with-' + event.name);
        inst.data.exitEvent = event;
      }),
      hsm.transition(
        hsm.on('custom'),
        hsm.target('../done'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('effect-with-' + event.name);
          inst.data.effectEvent = event;
          if (event.data) {
            inst.data.payload = event.data.payload;
          }
        })
      )
    ),
    hsm.state('done',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('done-entry-with-' + event.name);
        inst.data.doneEvent = event;
      })
    )
  );

  hsm.start(ctx, instance, model);

  // Initial entry should receive InitialEvent
  assert.strictEqual(instance.data.entryEvent.name, 'hsm_initial');

  // Custom event with data
  instance.dispatch({
    name: 'custom',
    kind: hsm.kinds.Event,
    data: { payload: 'test-data' }
  });

  assert.strictEqual(instance.data.exitEvent.name, 'custom');
  assert.strictEqual(instance.data.effectEvent.name, 'custom');
  assert.strictEqual(instance.data.doneEvent.name, 'custom');
  assert.strictEqual(instance.data.payload, 'test-data');
  assert.deepStrictEqual(instance.log, [
    'entry-with-hsm_initial',
    'exit-with-custom',
    'effect-with-custom',
    'done-entry-with-custom'
  ]);

  hsm.stop(instance);
});

test('Actions in self transitions', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('SelfTransitionActionMachine',
    hsm.initial(
      hsm.target('counter')
    ),
    hsm.state('counter',
      hsm.entry(function (ctx, inst, event) {
        inst.data.count = (inst.data.count || 0) + 1;
        inst.logAction('entry-' + inst.data.count);
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('exit-' + inst.data.count);
      }),
      hsm.transition(
        hsm.on('increment'),
        hsm.target('../counter'), // Self
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('increment-effect');
        })
      )
    )
  );

  hsm.start(ctx, instance, model);
  assert.deepStrictEqual(instance.log, ['entry-1']);

  // Self transition should exit and re-enter
  instance.dispatch({ name: 'increment', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'entry-1',
    'exit-1',
    'increment-effect',
    'entry-2'
  ]);
  assert.strictEqual(instance.data.count, 2);

  hsm.stop(instance);
});

test('Actions in internal transitions', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('InternalTransitionActionMachine',
    hsm.initial(
      hsm.target('container')
    ),
    hsm.state('container',
      hsm.entry(function (ctx, inst, event) {
        inst.data.entryCount = (inst.data.entryCount || 0) + 1;
        inst.logAction('entry-' + inst.data.entryCount);
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('exit');
      }),
      hsm.transition(
        hsm.on('internal'),
        // No target = internal transition
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('internal-effect');
          inst.data.internalCount = (inst.data.internalCount || 0) + 1;
        })
      )
    )
  );

  hsm.start(ctx, instance, model);
  assert.deepStrictEqual(instance.log, ['entry-1']);

  // Internal transition should NOT exit/enter
  instance.dispatch({ name: 'internal', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'entry-1',
    'internal-effect'
  ]);
  assert.strictEqual(instance.data.entryCount, 1); // Should not increment
  assert.strictEqual(instance.data.internalCount, 1);

  // Multiple internal transitions
  instance.dispatch({ name: 'internal', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'internal', kind: hsm.kinds.Event });
  assert.strictEqual(instance.data.entryCount, 1); // Still 1
  assert.strictEqual(instance.data.internalCount, 3);

  hsm.stop(instance);
});

test('Action execution with abort signal', async function () {
  const instance = new ActionInstance();
  const ctx = new hsm.Context();

  const model = hsm.define('AbortSignalActionMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('entry-signal-aborted-' + ctx.done);
        inst.data.entrySignal = ctx;
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('exit-signal-aborted-' + ctx.done);
        inst.data.exitSignal = ctx;
      }),
      hsm.transition(
        hsm.on('move'),
        hsm.target('../done'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('effect-signal-aborted-' + ctx.done);
          inst.data.effectSignal = ctx;
        })
      )
    ),
    hsm.state('done')
  );

  hsm.start(ctx, instance, model);

  // Signals should not be aborted during normal operation
  assert.deepStrictEqual(instance.log, ['entry-signal-aborted-false']);
  assert.strictEqual(instance.data.entrySignal.done, false);

  instance.dispatch({ name: 'move', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'entry-signal-aborted-false',
    'exit-signal-aborted-false',
    'effect-signal-aborted-false'
  ]);
  assert.strictEqual(instance.data.exitSignal.done, false);
  assert.strictEqual(instance.data.effectSignal.done, false);

  hsm.stop(instance);
});