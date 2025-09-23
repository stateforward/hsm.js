/**
 * @fileoverview Test error event handling
 * Tests error event generation and handling in various scenarios
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
class ErrorInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Error event from activity exception', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('ActivityErrorMachine',
    hsm.initial(
      hsm.target('working')
    ),
    hsm.state('working',
      hsm.activity(function (ctx, inst, event) {
        inst.logAction('activity-starting');
        throw new Error('Activity failed!');
      }),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('../error'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('error-caught');
          inst.data.errorMessage = event.data.message;
          inst.data.errorStack = event.data.stack;
        })
      )
    ),
    hsm.state('error',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('error-state-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event to be dispatched
  await delay(20);

  assert.strictEqual(instance.log.includes('activity-starting'), true);
  assert.strictEqual(instance.log.includes('error-caught'), true);
  assert.strictEqual(instance.log.includes('error-state-entry'), true);
  assert.strictEqual(instance.state(), '/ActivityErrorMachine/error');
  assert.strictEqual(instance.data.errorMessage, 'Activity failed!');
  assert.strictEqual(typeof instance.data.errorStack, 'string');

  hsm.stop(instance);
});

test('Error event handled at different hierarchy levels', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('HierarchicalErrorMachine',
    hsm.initial(
      hsm.target('parent/child')
    ),
    hsm.state('parent',
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('../parentError'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('parent-handled-error');
        })
      ),

      hsm.state('child',
        hsm.activity(function (ctx, inst, event) {
          inst.logAction('child-activity-error');
          throw new Error('Child error');
        }),
        hsm.transition(
          hsm.on('hsm_error'),
          hsm.target('../childError'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('child-handled-error');
          })
        )
      ),

      hsm.state('childError',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('child-error-entry');
        })
      ),

      hsm.state('parentError',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('parent-error-entry');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event to bubble up
  await delay(20);

  // Child should handle its own error
  assert.strictEqual(instance.log.includes('child-activity-error'), true);
  assert.strictEqual(instance.log.includes('child-handled-error'), true);
  assert.strictEqual(instance.log.includes('child-error-entry'), true);
  assert.strictEqual(instance.state(), '/HierarchicalErrorMachine/parent/childError');

  // Parent error handler should not be called
  assert.strictEqual(instance.log.includes('parent-handled-error'), false);

  hsm.stop(instance);
});

test('Unhandled error events', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('UnhandledErrorMachine',
    hsm.initial(
      hsm.target('fragile')
    ),
    hsm.state('fragile',
      hsm.activity(function (ctx, inst, event) {
        inst.logAction('activity-will-fail');
        throw new Error('Unhandled error!');
      })
      // No error transition handler
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event
  await delay(20);

  // State should remain unchanged since error is unhandled
  assert.strictEqual(instance.log.includes('activity-will-fail'), true);
  assert.strictEqual(instance.state(), '/UnhandledErrorMachine/fragile');

  hsm.stop(instance);
});

test('Error in entry action', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('EntryErrorMachine',
    hsm.initial(
      hsm.target('start')
    ),
    hsm.state('start',
      hsm.transition(
        hsm.on('go'),
        hsm.target('../failing')

      ),

    ),
    hsm.state('failing',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('entry-about-to-fail');
        throw new Error('Entry action failed!');
      }),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('../recovered'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('recovered-from-entry-error');
          inst.data.errorSource = 'entry';
        })
      )
    ),
    hsm.state('recovered',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('recovery-complete');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Trigger transition to failing state
  instance.dispatch({ name: 'go', kind: hsm.kinds.Event });

  // Wait for error event
  await delay(20);

  assert.strictEqual(instance.log.includes('entry-about-to-fail'), true);
  assert.strictEqual(instance.log.includes('recovered-from-entry-error'), true);
  assert.strictEqual(instance.log.includes('recovery-complete'), true);
  assert.strictEqual(instance.state(), '/EntryErrorMachine/recovered');
  assert.strictEqual(instance.data.errorSource, 'entry');

  hsm.stop(instance);
});

test('Error in transition effect', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('EffectErrorMachine',
    hsm.initial(
      hsm.target('source')
    ),
    hsm.state('source',
      hsm.transition(
        hsm.on('risky'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('effect-failing');
          throw new Error('Effect failed!');
        })
      ),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('../errorHandler'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('handled-effect-error');
        })
      )
    ),
    hsm.state('target',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('target-entry');
      })
    ),
    hsm.state('errorHandler',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('error-handler-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Trigger risky transition
  instance.dispatch({ name: 'risky', kind: hsm.kinds.Event });

  // Wait for error event
  await delay(20);

  assert.strictEqual(instance.log.includes('effect-failing'), true);
  assert.strictEqual(instance.log.includes('handled-effect-error'), true, `logs ${instance.log}`);
  assert.strictEqual(instance.log.includes('error-handler-entry'), true);
  // Should not reach target due to effect error
  assert.strictEqual(instance.log.includes('target-entry'), false);
  assert.strictEqual(instance.state(), '/EffectErrorMachine/errorHandler');

  hsm.stop(instance);
});

test('Multiple error events in sequence', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('MultipleErrorMachine',
    hsm.initial(
      hsm.target('errorProne')
    ),
    hsm.state('errorProne',
      hsm.activity(
        function (ctx, inst, event) {
          inst.logAction('activity1-error');
          throw new Error('First error');
        },
        function (ctx, inst, event) {
          inst.logAction('activity2-error');
          throw new Error('Second error');
        }
      ),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('errorProne'), // Self transition
        hsm.effect(function (ctx, inst, event) {
          inst.data.errorCount = (inst.data.errorCount || 0) + 1;
          inst.logAction('error-' + inst.data.errorCount + '-handled');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for multiple error events
  await delay(50);

  // Should handle multiple errors
  assert.strictEqual(instance.data.errorCount >= 1, true);
  assert.strictEqual(instance.log.includes('activity1-error'), true);
  assert.strictEqual(instance.log.includes('activity2-error'), true);
  assert.strictEqual(instance.log.includes('error-1-handled'), true);

  hsm.stop(instance);
});

test('Error event data structure', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('ErrorDataMachine',
    hsm.initial(
      hsm.target('validator')
    ),
    hsm.state('validator',
      hsm.activity(function (ctx, inst, event) {
        var error = new Error('Custom error message');
        error.code = 'CUSTOM_ERROR';
        error.details = { field: 'value', count: 42 };
        throw error;
      }),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('inspector'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('inspecting-error');
          inst.data.errorEvent = event;
        })
      )
    ),
    hsm.state('inspector')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event
  await delay(20);

  assert.strictEqual(instance.data.errorEvent.name, 'hsm_error');
  assert.strictEqual(instance.data.errorEvent.kind, hsm.kinds.ErrorEvent);
  assert.strictEqual(instance.data.errorEvent.data.message, 'Custom error message');
  assert.strictEqual(instance.data.errorEvent.data.code, 'CUSTOM_ERROR');
  assert.deepStrictEqual(instance.data.errorEvent.data.details, { field: 'value', count: 42 });
  assert.strictEqual(typeof instance.data.errorEvent.data.stack, 'string');

  hsm.stop(instance);
});

test('Error handling with guards', async function () {
  const instance = new ErrorInstance();

  const model = hsm.define('GuardedErrorMachine',
    hsm.initial(
      hsm.target('selective')
    ),
    hsm.state('selective',

      hsm.activity(function (ctx, inst, event) {
        var error = new Error('Network timeout');
        error.type = 'network';
        throw error;
      }),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.guard(function (ctx, inst, event) {
          return event.data.type === 'validation';
        }),
        hsm.target('../validationError'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('validation-error-path');
        })
      ),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.guard(function (ctx, inst, event) {
          return event.data.type === 'network';
        }),
        hsm.target('../networkError'),
        hsm.effect(function (ctx, inst, event) {
          console.log('network-error-path');
          inst.logAction('network-error-path');
        })
      ),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('../generalError'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('general-error-path');
        })
      )
    ),
    hsm.state('validationError'),
    hsm.state('networkError'),
    hsm.state('generalError')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event
  await delay(20);

  // Should take network error path
  assert.strictEqual(instance.log.includes('network-error-path'), true, `logs ${instance.log}`);
  assert.strictEqual(instance.log.includes('validation-error-path'), false, `logs ${instance.log}`);
  assert.strictEqual(instance.log.includes('general-error-path'), false, `logs ${instance.log}`);
  assert.strictEqual(instance.state(), '/GuardedErrorMachine/networkError');

  hsm.stop(instance);
});