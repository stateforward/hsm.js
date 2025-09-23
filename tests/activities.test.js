/**
 * @fileoverview Test state activities (concurrent operations)
 * Tests async activities that run while in a state and can be aborted on exit
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
class ActivityInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {
      activityStarted: 0,
      activityCompleted: 0,
      activityAborted: 0
    };
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic activity - starts on entry, stops on exit', async function () {
  const instance = new ActivityInstance();

  const model = hsm.define('BasicActivityMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',

      hsm.activity(function (ctx, inst, event) {
        inst.logAction('activity-started');
        inst.data.activityStarted++;

        ctx.addEventListener('done', function () {
          inst.logAction('activity-aborted');
          inst.data.activityAborted++;
        });

        return new Promise(function (resolve) {
          setTimeout(function () {
            if (!ctx.done) {
              inst.logAction('activity-completed');
              inst.data.activityCompleted++;
            }
            resolve();
          }, 50);
        });
      }),
      hsm.transition(
        hsm.on('stop'),
        hsm.target('/inactive')
      )
    ),
    hsm.state('inactive')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Activity should start immediately
  assert.deepStrictEqual(instance.log, ['activity-started']);
  assert.strictEqual(instance.data.activityStarted, 1);

  // Exit state before activity completes
  await delay(10);
  instance.dispatch({ name: 'stop', kind: hsm.kinds.Event });

  // Activity should be aborted
  assert.strictEqual(instance.log.includes('activity-aborted'), true);
  assert.strictEqual(instance.data.activityAborted, 1);
  assert.strictEqual(instance.data.activityCompleted, 0);

  hsm.stop(instance);
});

test('Multiple concurrent activities', async function () {
  const instance = new ActivityInstance();

  const model = hsm.define('MultipleActivityMachine',
    hsm.initial(
      hsm.target('busy')
    ),
    hsm.state('busy',
      hsm.activity(
        function (ctx, inst, event) {
          inst.logAction('activity1-started');
          return new Promise(function (resolve) {
            var timeout = setTimeout(function () {
              inst.logAction('activity1-completed');
              resolve();
            }, 30);

            ctx.addEventListener('done', function () {
              clearTimeout(timeout);
              inst.logAction('activity1-aborted');
              resolve();
            });
          });
        },
        function (ctx, inst, event) {
          inst.logAction('activity2-started');
          return new Promise(function (resolve) {
            var timeout = setTimeout(function () {
              inst.logAction('activity2-completed');
              resolve();
            }, 50);

            ctx.addEventListener('done', function () {
              clearTimeout(timeout);
              inst.logAction('activity2-aborted');
              resolve();
            });
          });
        },
        function (ctx, inst, event) {
          inst.logAction('activity3-started');
          // Synchronous activity
          inst.data.syncActivityRan = true;
          return Promise.resolve();
        }
      ),
      hsm.transition(
        hsm.on('stop'),
        hsm.target('/done')
      )
    ),
    hsm.state('done')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // All activities should start
  assert.strictEqual(instance.log.includes('activity1-started'), true);
  assert.strictEqual(instance.log.includes('activity2-started'), true);
  assert.strictEqual(instance.log.includes('activity3-started'), true);
  assert.strictEqual(instance.data.syncActivityRan, true);

  // Let activity1 complete, but stop before activity2
  await delay(40);
  assert.strictEqual(instance.log.includes('activity1-completed'), true);
  assert.strictEqual(instance.log.includes('activity2-completed'), false);

  instance.dispatch({ name: 'stop', kind: hsm.kinds.Event });
  await delay(20);

  // Activity2 should be aborted
  assert.strictEqual(instance.log.includes('activity2-aborted'), true);
  assert.strictEqual(instance.log.includes('activity2-completed'), false);

  hsm.stop(instance);
});

test('Activity error handling', async function () {
  const instance = new ActivityInstance();
  let errorEventReceived = false;

  const model = hsm.define('ActivityErrorMachine',
    hsm.initial(
      hsm.target('working')
    ),
    hsm.state('working',
      hsm.activity(function (ctx, inst, event) {
        inst.logAction('activity-throwing');
        throw new Error('Activity error!');
      }),
      hsm.transition(
        hsm.on('hsm_error'),
        hsm.target('/error'),
        hsm.effect(function (ctx, inst, event) {
          console.log('error-handled', event);
          inst.logAction('error-handled');
          inst.data.errorData = event.data;
          errorEventReceived = true;
          return Promise.resolve();
        })
      )
    ),
    hsm.state('error')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wait for error event to be dispatched
  await delay(100);

  assert.strictEqual(errorEventReceived, true);
  assert.strictEqual(instance.state(), '/ActivityErrorMachine/error');
  assert.strictEqual(instance.data.errorData.message, 'Activity error!');

  hsm.stop(instance);
});

test('Activities in hierarchical states', async function () {
  const instance = new ActivityInstance();

  const model = hsm.define('HierarchicalActivityMachine',
    hsm.initial(
      hsm.target('/parent/child')
    ),
    hsm.state('parent',

      hsm.activity(function (ctx, inst, event) {
        inst.logAction('parent-activity-started');
        inst.data.parentActivityActive = true;

        ctx.addEventListener('done', function () {
          inst.logAction('parent-activity-aborted');
          inst.data.parentActivityActive = false;
        });
        return Promise.resolve();
      }),

      hsm.state('child',
        hsm.activity(function (ctx, inst, event) {
          inst.logAction('child-activity-started');
          inst.data.childActivityActive = true;

          ctx.addEventListener('done', function () {
            inst.logAction('child-activity-aborted');
            inst.data.childActivityActive = false;
          });
          return Promise.resolve();
        }),
        hsm.transition(
          hsm.on('up'),
          hsm.target('..')  // Exit to parent level
        )
      ),

      hsm.transition(
        hsm.on('out'),
        hsm.target('../outside')
      )
    ),
    hsm.state('outside')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Both activities should start
  assert.deepStrictEqual(instance.log, [
    'parent-activity-started',
    'child-activity-started'
  ]);
  assert.strictEqual(instance.data.parentActivityActive, true);
  assert.strictEqual(instance.data.childActivityActive, true);

  // Exit child state
  instance.dispatch({ name: 'up', kind: hsm.kinds.Event });
  await delay(10);

  // Only child activity should be aborted
  assert.strictEqual(instance.log.includes('child-activity-aborted'), true);
  assert.strictEqual(instance.data.childActivityActive, false);
  assert.strictEqual(instance.data.parentActivityActive, true);

  // Exit parent state
  instance.dispatch({ name: 'out', kind: hsm.kinds.Event });
  await delay(10);

  // Parent activity should now be aborted
  assert.strictEqual(instance.log.includes('parent-activity-aborted'), true);
  assert.strictEqual(instance.data.parentActivityActive, false);

  hsm.stop(instance);
});

test('Activity with event data access', async function () {
  const instance = new ActivityInstance();
  instance.data.trigger = 'test-value';

  const model = hsm.define('EventDataActivityMachine',
    hsm.initial(
      hsm.target('processing')
    ),
    hsm.state('processing',

      hsm.activity(function (ctx, inst, event) {
        inst.logAction('activity-event-' + event.name);
        inst.data.activityEvent = event;
        inst.data.processedTrigger = inst.data.trigger;
        return Promise.resolve();
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Activity should receive the initial event
  assert.strictEqual(instance.data.activityEvent.name, 'hsm_initial');
  assert.strictEqual(instance.data.processedTrigger, 'test-value');
  assert.deepStrictEqual(instance.log, ['activity-event-hsm_initial']);

  hsm.stop(instance);
});

test('Long-running activity completion', async function () {
  const instance = new ActivityInstance();

  const model = hsm.define('LongRunningActivityMachine',
    hsm.initial(
      hsm.target('working')
    ),
    hsm.state('working',

      hsm.activity(function (ctx, inst, event) {
        inst.logAction('long-activity-started');

        return new Promise(function (resolve) {
          var count = 0;
          var interval = setInterval(function () {
            if (ctx.done) {
              clearInterval(interval);
              inst.logAction('long-activity-aborted-at-' + count);
              resolve();
              return;
            }

            count++;
            inst.logAction('long-activity-tick-' + count);

            if (count >= 3) {
              clearInterval(interval);
              inst.logAction('long-activity-completed');
              inst.data.finalCount = count;
              resolve();
            }
          }, 20);
        });
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Let activity run to completion
  await delay(80);

  assert.strictEqual(instance.log.includes('long-activity-started'), true);
  assert.strictEqual(instance.log.includes('long-activity-tick-1'), true);
  assert.strictEqual(instance.log.includes('long-activity-tick-2'), true);
  assert.strictEqual(instance.log.includes('long-activity-tick-3'), true);
  assert.strictEqual(instance.log.includes('long-activity-completed'), true);
  assert.strictEqual(instance.data.finalCount, 3);

  hsm.stop(instance);
});

test('Activity re-entry behavior', async function () {
  const instance = new ActivityInstance();

  const model = hsm.define('ReentryActivityMachine',
    hsm.initial(
      hsm.target('active')
    ),
    hsm.state('active',

      hsm.activity(function (ctx, inst, event) {
        inst.data.activityCount = (inst.data.activityCount || 0) + 1;
        inst.logAction('activity-run-' + inst.data.activityCount);
        return Promise.resolve();
      }),
      hsm.transition(
        hsm.on('restart'),
        hsm.target('/active') // Self transition
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  assert.strictEqual(instance.data.activityCount, 1);
  assert.deepStrictEqual(instance.log, ['activity-run-1']);

  // Self transition should restart activity
  instance.dispatch({ name: 'restart', kind: hsm.kinds.Event });
  await delay(10);

  assert.strictEqual(instance.data.activityCount, 2);
  assert.strictEqual(instance.log.includes('activity-run-2'), true);

  // Another restart
  instance.dispatch({ name: 'restart', kind: hsm.kinds.Event });
  await delay(10);

  assert.strictEqual(instance.data.activityCount, 3);
  assert.strictEqual(instance.log.includes('activity-run-3'), true);

  hsm.stop(instance);
});