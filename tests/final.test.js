/**
 * @fileoverview Test final states
 * Tests terminal states that indicate completion of a state machine region
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class FinalInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic final state - terminal state', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('BasicFinalMachine',
    hsm.initial(
      hsm.target('working')
    ),
    hsm.state('working',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('working-entry');
      }),
      hsm.transition(
        hsm.on('complete'),
        hsm.target('../done'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('completing');
        })
      )
    ),
    hsm.final('done')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.deepStrictEqual(instance.log, ['working-entry']);
  assert.strictEqual(instance.state(), '/BasicFinalMachine/working');

  // Transition to final state
  instance.dispatch({ name: 'complete', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, ['working-entry', 'completing']);
  assert.strictEqual(instance.state(), '/BasicFinalMachine/done');

  // Final states should not accept events
  instance.dispatch({ name: 'any-event', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/BasicFinalMachine/done');

  hsm.stop(instance);
});

test('Final state in hierarchical structure', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('HierarchicalFinalMachine',
    hsm.initial(
      hsm.target('container/subprocess')
    ),
    hsm.state('container',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('container-entry');
      }),

      hsm.state('subprocess',
        hsm.initial(
          hsm.target('step1')
        ),
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('subprocess-entry');
        }),

        hsm.state('step1',
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('step1-entry');
          }),
          hsm.transition(
            hsm.on('next'),
            hsm.target('../step2')
          )
        ),

        hsm.state('step2',
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('step2-entry');
          }),
          hsm.transition(
            hsm.on('finish'),
            hsm.target('../completed')
          )
        ),

        hsm.final('completed')
      ),

      hsm.transition(
        hsm.on('abort'),
        hsm.target('../aborted')
      )
    ),

    hsm.state('aborted',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('aborted-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.deepStrictEqual(instance.log, [
    'container-entry',
    'subprocess-entry',
    'step1-entry'
  ]);
  assert.strictEqual(instance.state(), '/HierarchicalFinalMachine/container/subprocess/step1');

  // Progress through subprocess
  instance.dispatch({ name: 'next', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/HierarchicalFinalMachine/container/subprocess/step2');

  // Complete subprocess
  instance.dispatch({ name: 'finish', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/HierarchicalFinalMachine/container/subprocess/completed');

  // Events can still be handled by parent
  instance.dispatch({ name: 'abort', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/HierarchicalFinalMachine/aborted');
  assert.strictEqual(instance.log.includes('aborted-entry'), true);

  hsm.stop(instance);
});

test('Multiple final states in same container', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('MultipleFinalMachine',
    hsm.initial(
      hsm.target('process/running')
    ),
    hsm.state('process',

      hsm.state('running',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('running-entry');
        }),
        hsm.transition(
          hsm.on('success'),
          hsm.target('../success')
        ),
        hsm.transition(
          hsm.on('error'),
          hsm.target('../error')
        ),
        hsm.transition(
          hsm.on('cancel'),
          hsm.target('../cancelled')
        )
      ),

      hsm.final('success'),
      hsm.final('error'),
      hsm.final('cancelled')
    )
  );

  // Test success path
  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  instance.dispatch({ name: 'success', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleFinalMachine/process/success');
  hsm.stop(instance);

  // Test error path
  instance.log = [];
  const ctx2 = new hsm.Context();
  hsm.start(ctx2, instance, model);
  instance.dispatch({ name: 'error', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleFinalMachine/process/error');
  hsm.stop(instance);

  // Test cancel path
  instance.log = [];
  const ctx3 = new hsm.Context();
  hsm.start(ctx3, instance, model);
  instance.dispatch({ name: 'cancel', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleFinalMachine/process/cancelled');
  hsm.stop(instance);
});

test('Final state with entry actions', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('FinalWithActionMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',
      hsm.transition(
        hsm.on('end'),
        hsm.target('/finished'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('transition-to-final');
        })
      )
    ),

    hsm.state('finished',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('final-entry');
        inst.data.finalizedAt = Date.now();
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Transition to final state
  instance.dispatch({ name: 'end', kind: hsm.kinds.Event });

  assert.deepStrictEqual(instance.log, [
    'transition-to-final',
    'final-entry'
  ]);
  assert.strictEqual(instance.state(), '/FinalWithActionMachine/finished');
  assert.strictEqual(typeof instance.data.finalizedAt, 'number');

  hsm.stop(instance);
});

test('Final state behavior during stop', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('FinalStopMachine',
    hsm.initial(
      hsm.target('normal')
    ),
    hsm.state('normal',

      hsm.exit(function (ctx, inst, event) {
        inst.logAction('normal-exit');
      }),
      hsm.transition(
        hsm.on('finish'),
        hsm.target('/terminal')
      )
    ),

    hsm.final('terminal')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Move to final state
  instance.dispatch({ name: 'finish', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/FinalStopMachine/terminal');

  // Stop from final state
  instance.log = [];
  hsm.stop(instance);

  // Should not execute exit actions for final states
  assert.deepStrictEqual(instance.log, []);
});

test('Transition from final state should not be possible', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('FinalTransitionMachine',
    hsm.initial(
      hsm.target('start')
    ),
    hsm.state('start',
      hsm.transition(
        hsm.on('end'),
        hsm.target('../final')
      )
    ),

    hsm.final('final')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Go to final state
  instance.dispatch({ name: 'end', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/FinalTransitionMachine/final');

  // Try to send events - should be ignored
  instance.dispatch({ name: 'restart', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'anything', kind: hsm.kinds.Event });

  // Should remain in final state
  assert.strictEqual(instance.state(), '/FinalTransitionMachine/final');

  hsm.stop(instance);
});

test('Complex final state scenario with cleanup', async function () {
  const instance = new FinalInstance();

  const model = hsm.define('ComplexFinalMachine',
    hsm.initial(
      hsm.target('workflow')
    ),
    hsm.state('workflow',
      hsm.initial(
        hsm.target('initialize')
      ),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('workflow-cleanup');
      }),

      hsm.state('initialize',
        hsm.entry(function (ctx, inst, event) {
          inst.data.resources = ['resource1', 'resource2'];
          inst.logAction('resources-allocated');
        }),
        hsm.transition(
          hsm.on('proceed'),
          hsm.target('../processing')
        )
      ),

      hsm.state('processing',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('processing-started');
        }),
        hsm.transition(
          hsm.on('complete'),
          hsm.target('../cleanup')
        )
      ),

      hsm.state('cleanup',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('cleaning-up');
          inst.data.resources = [];
        }),
        hsm.transition(
          hsm.on('done'),
          hsm.target('../finished')
        )
      ),

      hsm.final('finished')
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Execute workflow
  instance.dispatch({ name: 'proceed', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'complete', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'done', kind: hsm.kinds.Event });

  assert.deepStrictEqual(instance.log, [
    'resources-allocated',
    'processing-started',
    'cleaning-up',
  ]);
  assert.strictEqual(instance.state(), '/ComplexFinalMachine/workflow/finished');
  assert.deepStrictEqual(instance.data.resources, []);

  // Stop the machine
  hsm.stop(instance);
  assert.strictEqual(instance.log.includes('workflow-cleanup'), true);
});