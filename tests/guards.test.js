/**
 * @fileoverview Test guard conditions on transitions
 * Tests boolean guard expressions that control transition enablement
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class GuardInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {
      counter: 0,
      flag: false,
      values: []
    };
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic guard conditions - allow or block transitions', async function () {
  const instance = new GuardInstance();
  instance.data.flag = true;

  const model = hsm.define('BasicGuardMachine',
    hsm.initial(
      hsm.target('idle')
    ),
    hsm.state('idle',
      hsm.initial(
        hsm.target('idle')
      ),
      hsm.transition(
        hsm.on('go'),
        hsm.guard(function (ctx, inst, event) {
          return inst.data.flag === true;
        }),
        hsm.target('/active'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('transition-allowed'));
        })
      )
    ),
    hsm.state('active',
      hsm.entry(function (ctx, inst, event) {
        return Promise.resolve(inst.logAction('active-entry'));
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Guard passes - transition should occur
  instance.dispatch({ name: 'go', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/BasicGuardMachine/active');
  assert.deepStrictEqual(instance.log, ['transition-allowed', 'active-entry']);

  // Reset
  hsm.stop(instance);
  instance.log = [];
  instance.data.flag = false;
  const ctx2 = new hsm.Context();
  hsm.start(ctx2, instance, model);

  // Guard fails - transition should not occur
  instance.dispatch({ name: 'go', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/BasicGuardMachine/idle');
  assert.deepStrictEqual(instance.log, []); // No actions executed

  hsm.stop(instance);
});

test('Multiple transitions with different guards', async function () {
  const instance = new GuardInstance();
  instance.data.counter = 5;

  const model = hsm.define('MultipleGuardMachine',
    hsm.initial(
      hsm.target('source')
    ),
    hsm.state('source',
      hsm.transition(
        hsm.on('check'),
        hsm.guard(function (ctx, inst, event) {
          return inst.data.counter < 3;
        }),
        hsm.target('/low'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('went-low'));
        })
      ),
      hsm.transition(
        hsm.on('check'),
        hsm.guard(function (ctx, inst, event) {
          return inst.data.counter >= 3 && inst.data.counter < 7;
        }),
        hsm.target('/medium'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('went-medium'));
        })
      ),
      hsm.transition(
        hsm.on('check'),
        hsm.guard(function (ctx, inst, event) {
          return inst.data.counter >= 7;
        }),
        hsm.target('/high'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('went-high'));
        })
      )
    ),
    hsm.state('low'),
    hsm.state('medium'),
    hsm.state('high')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should take medium path
  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleGuardMachine/medium');
  assert.deepStrictEqual(instance.log, ['went-medium']);

  // Test other values
  hsm.stop(instance);
  instance.log = [];
  instance.data.counter = 1;
  const ctx2 = new hsm.Context();
  hsm.start(ctx2, instance, model);

  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleGuardMachine/low');
  assert.deepStrictEqual(instance.log, ['went-low']);

  hsm.stop(instance);
  instance.log = [];
  instance.data.counter = 10;
  const ctx3 = new hsm.Context();
  hsm.start(ctx3, instance, model);

  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/MultipleGuardMachine/high');
  assert.deepStrictEqual(instance.log, ['went-high']);

  hsm.stop(instance);
});

test('Guards with event data access', async function () {
  const instance = new GuardInstance();

  const model = hsm.define('EventDataGuardMachine',
    hsm.initial(
      hsm.target('waiting')
    ),
    hsm.state('waiting',
      hsm.transition(
        hsm.on('submit'),
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('guard-evaluated');
          return event.data && event.data.password === 'secret123';
        }),
        hsm.target('/authorized'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('access-granted'));
        })
      )
    ),
    hsm.state('authorized')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Wrong password
  instance.dispatch({
    name: 'submit',
    kind: hsm.kinds.Event,
    data: { password: 'wrong' }
  });
  assert.strictEqual(instance.state(), '/EventDataGuardMachine/waiting');
  assert.deepStrictEqual(instance.log, ['guard-evaluated']);

  // Correct password
  instance.log = [];
  instance.dispatch({
    name: 'submit',
    kind: hsm.kinds.Event,
    data: { password: 'secret123' }
  });
  assert.strictEqual(instance.state(), '/EventDataGuardMachine/authorized');
  assert.deepStrictEqual(instance.log, ['guard-evaluated', 'access-granted']);

  hsm.stop(instance);
});

test('Guard evaluation order - first matching guard wins', async function () {
  const instance = new GuardInstance();
  instance.data.values = [];

  const model = hsm.define('GuardOrderMachine',
    hsm.initial(
      hsm.target('start')
    ),
    hsm.state('start',
      hsm.transition(
        hsm.on('test'),
        hsm.guard(function (ctx, inst, event) {
          inst.data.values.push('guard1');
          return false;
        }),
        hsm.target('/target1')
      ),
      hsm.transition(
        hsm.on('test'),
        hsm.guard(function (ctx, inst, event) {
          inst.data.values.push('guard2');
          return true;
        }),
        hsm.target('/target2')
      ),
      hsm.transition(
        hsm.on('test'),
        hsm.guard(function (ctx, inst, event) {
          inst.data.values.push('guard3');
          return true;
        }),
        hsm.target('/target3')
      )
    ),
    hsm.state('target1'),
    hsm.state('target2'),
    hsm.state('target3')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  instance.dispatch({ name: 'test', kind: hsm.kinds.Event });

  // Should evaluate guards in order until first true
  assert.deepStrictEqual(instance.data.values, ['guard1', 'guard2']);
  assert.strictEqual(instance.state(), '/GuardOrderMachine/target2');

  hsm.stop(instance);
});

test('Guards in hierarchical states', async function () {
  const instance = new GuardInstance();
  instance.data.level = 'child';

  const model = hsm.define('HierarchicalGuardMachine',
    hsm.initial(
      hsm.target('parent')
    ),
    hsm.state('parent',
      hsm.initial(
        hsm.target('child')
      ),
      hsm.transition(
        hsm.on('move'),
        hsm.guard(function (ctx, inst, event) {
          return inst.data.level === 'parent';
        }),
        hsm.target('sibling'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('parent-handled'));
        })
      ),

      hsm.state('child',
        hsm.transition(
          hsm.on('move'),
          hsm.guard(function (ctx, inst, event) {
            return inst.data.level === 'child';
          }),
          hsm.target('../other'),
          hsm.effect(function (ctx, inst, event) {
            return Promise.resolve(inst.logAction('child-handled'));
          })
        )
      ),

      hsm.state('other')
    ),
    hsm.state('sibling')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Child guard should match first
  instance.dispatch({ name: 'move', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/HierarchicalGuardMachine/parent/other');
  assert.deepStrictEqual(instance.log, ['child-handled']);

  hsm.stop(instance);
});

test('Transition without guard (always enabled)', async function () {
  const instance = new GuardInstance();

  const model = hsm.define('NoGuardMachine',
    hsm.initial(
      hsm.target('a')
    ),
    hsm.state('a',
      hsm.transition(
        hsm.on('always'),
        hsm.target('/b'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('transition-executed'));
        })
      )
    ),
    hsm.state('b')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Transition without guard should always execute
  instance.dispatch({ name: 'always', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/NoGuardMachine/b');
  assert.deepStrictEqual(instance.log, ['transition-executed']);

  hsm.stop(instance);
});

test('Guard exceptions are caught and treated as false', async function () {
  const instance = new GuardInstance();

  const model = hsm.define('GuardExceptionMachine',
    hsm.initial(
      hsm.target('safe')
    ),
    hsm.state('safe',
      hsm.transition(
        hsm.on('error'),
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('guard-throwing');
          throw new Error('Guard error!');
        }),
        hsm.target('/danger'),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve(inst.logAction('should-not-execute'));
        })
      ),
      hsm.transition(
        hsm.on('error'),
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('fallback-guard');
          return true;
        }),
        hsm.target('/fallback')
      )
    ),
    hsm.state('danger'),
    hsm.state('fallback')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Guard exception should be caught, transition skipped, fallback used
  instance.dispatch({ name: 'error', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/GuardExceptionMachine/fallback');
  assert.deepStrictEqual(instance.log, ['guard-throwing', 'fallback-guard']);

  hsm.stop(instance);
});

test('Complex guard with state inspection', async function () {
  const instance = new GuardInstance();

  const model = hsm.define('StateInspectionGuardMachine',
    hsm.initial(
      hsm.target('idle')
    ),
    hsm.state('idle',
      hsm.entry(function (ctx, inst, event) {
        inst.data.visitCount = (inst.data.visitCount || 0) + 1;
        return Promise.resolve();
      }),
      hsm.transition(
        hsm.on('check'),
        hsm.guard(function (ctx, inst, event) {
          // Guard based on how many times we've been in idle
          return inst.data.visitCount >= 3;
        }),
        hsm.target('/done')
      ),
      hsm.transition(
        hsm.on('loop'),
        hsm.target('/processing')
      )
    ),
    hsm.state('processing',
      hsm.transition(
        hsm.on('back'),
        hsm.target('/idle')
      )
    ),
    hsm.state('done',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('done-after-' + inst.data.visitCount + '-visits');
        return Promise.resolve();
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // First check - should fail (visitCount = 1)
  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/StateInspectionGuardMachine/idle');

  // Loop to increment visit count
  instance.dispatch({ name: 'loop', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'back', kind: hsm.kinds.Event }); // visitCount = 2
  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/StateInspectionGuardMachine/idle');

  instance.dispatch({ name: 'loop', kind: hsm.kinds.Event });
  instance.dispatch({ name: 'back', kind: hsm.kinds.Event }); // visitCount = 3
  instance.dispatch({ name: 'check', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/StateInspectionGuardMachine/done');
  assert.deepStrictEqual(instance.log, ['done-after-3-visits']);

  hsm.stop(instance);
});