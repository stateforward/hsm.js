/**
 * @fileoverview Test choice pseudostates
 * Tests dynamic branching based on runtime conditions using choice pseudostates
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class ChoiceInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Basic choice pseudostate with guards', async function () {
  const instance = new ChoiceInstance();
  instance.data.value = 5;

  const model = hsm.define('BasicChoiceMachine',
    hsm.initial(
      hsm.target('start')
    ),
    hsm.state('start',
      hsm.transition(
        hsm.on('decide'),
        hsm.target('../decision'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('going-to-choice');
        })
      )
    ),

    hsm.choice('decision',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return inst.data.value < 3;
        }),
        hsm.target('low'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('chose-low');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return inst.data.value >= 3 && inst.data.value < 7;
        }),
        hsm.target('medium'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('chose-medium');
        })
      ),
      hsm.transition(
        hsm.target('high'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('chose-high');
        })
      )
    ),

    hsm.state('low',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('low-entry');
      })
    ),
    hsm.state('medium',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('medium-entry');
      })
    ),
    hsm.state('high',
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('high-entry');
      })
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Trigger choice evaluation
  instance.dispatch({ name: 'decide', kind: hsm.kinds.Event });

  // Should choose medium branch
  assert.deepStrictEqual(instance.log, [
    'going-to-choice',
    'chose-medium',
    'medium-entry'
  ]);
  assert.strictEqual(instance.state(), '/BasicChoiceMachine/medium');

  hsm.stop(instance);
});

test('Choice pseudostate with different guard outcomes', async function () {
  const instance = new ChoiceInstance();

  const testCases = [
    { value: 1, expectedState: 'low', expectedEffect: 'chose-low' },
    { value: 5, expectedState: 'medium', expectedEffect: 'chose-medium' },
    { value: 10, expectedState: 'high', expectedEffect: 'chose-high' }
  ];

  for (var i = 0; i < testCases.length; i++) {
    var testCase = testCases[i];
    instance.data.value = testCase.value;
    instance.log = [];

    const model = hsm.define('ChoiceTestMachine',
      hsm.initial(
        hsm.target('choice')
      ),
      hsm.choice('choice',
        hsm.transition(
          hsm.guard(function (ctx, inst, event) {
            return inst.data.value < 3;
          }),
          hsm.target('low'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('chose-low');
          })
        ),
        hsm.transition(
          hsm.guard(function (ctx, inst, event) {
            return inst.data.value >= 3 && inst.data.value < 7;
          }),
          hsm.target('medium'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('chose-medium');
          })
        ),
        hsm.transition(
          hsm.target('high'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('chose-high');
          })
        )
      ),
      hsm.state('low'),
      hsm.state('medium'),
      hsm.state('high')
    );

    const ctx = new hsm.Context();
    hsm.start(ctx, instance, model);

    assert.strictEqual(instance.log.includes(testCase.expectedEffect), true);
    assert.strictEqual(instance.state(), '/ChoiceTestMachine/' + testCase.expectedState);

    hsm.stop(instance);
  }
});

test('Choice in hierarchical state', async function () {
  const instance = new ChoiceInstance();
  instance.data.direction = 'left';

  const model = hsm.define('HierarchicalChoiceMachine',
    hsm.initial(
      hsm.target('container')
    ),
    hsm.state('container',
      hsm.initial(
        hsm.target('router')
      ),

      hsm.choice('router',
        hsm.transition(
          hsm.guard(function (ctx, inst, event) {
            return inst.data.direction === 'left';
          }),
          hsm.target('left'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('routed-left');
          })
        ),
        hsm.transition(
          hsm.guard(function (ctx, inst, event) {
            return inst.data.direction === 'right';
          }),
          hsm.target('right'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('routed-right');
          })
        ),
        hsm.transition(
          hsm.target('center'),
          hsm.effect(function (ctx, inst, event) {
            inst.logAction('routed-center');
          })
        )
      ),

      hsm.state('left',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('left-entry');
        })
      ),
      hsm.state('right',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('right-entry');
        })
      ),
      hsm.state('center',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('center-entry');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  assert.deepStrictEqual(instance.log, [
    'routed-left',
    'left-entry'
  ]);
  assert.strictEqual(instance.state(), '/HierarchicalChoiceMachine/container/left');

  hsm.stop(instance);
});

test('Choice with complex guard conditions', async function () {
  const instance = new ChoiceInstance();
  instance.data.config = {
    enabled: true,
    priority: 2,
    mode: 'auto'
  };

  const model = hsm.define('ComplexChoiceMachine',
    hsm.initial(
      hsm.target('choice')
    ),
    hsm.choice('choice',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          var cfg = inst.data.config;
          return !cfg.enabled;
        }),
        hsm.target('disabled'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('disabled-path');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          var cfg = inst.data.config;
          return cfg.enabled && cfg.priority > 5 && cfg.mode === 'manual';
        }),
        hsm.target('highpriority'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('high-priority-manual');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          var cfg = inst.data.config;
          return cfg.enabled && cfg.mode === 'auto';
        }),
        hsm.target('automatic'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('automatic-mode');
        })
      ),
      hsm.transition(
        hsm.target('default'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('default-fallback');
        })
      )
    ),
    hsm.state('disabled'),
    hsm.state('highpriority'),
    hsm.state('automatic'),
    hsm.state('default')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should choose automatic mode
  assert.deepStrictEqual(instance.log, ['automatic-mode']);
  assert.strictEqual(instance.state(), '/ComplexChoiceMachine/automatic');

  hsm.stop(instance);
});

test('Choice with event data evaluation', async function () {
  const instance = new ChoiceInstance();

  const model = hsm.define('EventChoiceMachine',
    hsm.initial(
      hsm.target('waiting')
    ),
    hsm.state('waiting',
      hsm.transition(
        hsm.on('process'),
        hsm.target('../router')
      )
    ),

    hsm.choice('router',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return event.data && event.data.type === 'urgent';
        }),
        hsm.target('urgent'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('urgent-processing');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return event.data && event.data.type === 'normal';
        }),
        hsm.target('normal'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('normal-processing');
        })
      ),
      hsm.transition(
        hsm.target('fallback'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('fallback-processing');
        })
      )
    ),

    hsm.state('urgent'),
    hsm.state('normal'),
    hsm.state('fallback')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Send event with urgent data
  instance.dispatch({
    name: 'process',
    data: { type: 'urgent', priority: 1 }
  });

  assert.deepStrictEqual(instance.log, ['urgent-processing']);
  assert.strictEqual(instance.state(), '/EventChoiceMachine/urgent');

  hsm.stop(instance);
});

test('Choice with no matching guards - should throw error', async function () {
  const instance = new ChoiceInstance();

  const model = hsm.define('NoMatchChoiceMachine',
    hsm.initial(
      hsm.target('choice')
    ),
    hsm.choice('choice',
      hsm.transition(
        hsm.guard(function () {
          return false; // Always false
        }),
        hsm.target('never')
      )
    ),
    hsm.state('never')
  );

  // Should throw error when no transition matches
  assert.throws(function () {
    const ctx = new hsm.Context();
    hsm.start(ctx, instance, model);
  }, /No transition found for choice vertex/);
});

test('Nested choice pseudostates', async function () {
  const instance = new ChoiceInstance();
  instance.data.level1 = true;
  instance.data.level2 = 'b';

  const model = hsm.define('NestedChoiceMachine',
    hsm.initial(
      hsm.target('level1choice')
    ),
    hsm.choice('level1choice',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return inst.data.level1;
        }),
        hsm.target('level2choice'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('level1-true');
        })
      ),
      hsm.transition(
        hsm.target('level1false'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('level1-false');
        })
      )
    ),
    hsm.choice('level2choice',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return inst.data.level2 === 'a';
        }),
        hsm.target('result_a'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('level2-a');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          return inst.data.level2 === 'b';
        }),
        hsm.target('result_b'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('level2-b');
        })
      ),
      hsm.transition(
        hsm.target('result_other'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('level2-other');
        })
      )
    ),

    hsm.state('level1false'),
    hsm.state('result_a'),
    hsm.state('result_b'),
    hsm.state('result_other')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should follow level1 choice then level2 choice
  assert.deepStrictEqual(instance.log, [
    'level1-true',
    'level2-b'
  ]);
  assert.strictEqual(instance.state(), '/NestedChoiceMachine/result_b');

  hsm.stop(instance);
});

test('Choice with side effects in guards', async function () {
  const instance = new ChoiceInstance();

  const model = hsm.define('SideEffectChoiceMachine',
    hsm.initial(
      hsm.target('choice')
    ),
    hsm.choice('choice',
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('guard1-evaluated');
          return false;
        }),
        hsm.target('path1')
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('guard2-evaluated');
          return true;
        }),
        hsm.target('path2'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('path2-effect');
        })
      ),
      hsm.transition(
        hsm.guard(function (ctx, inst, event) {
          inst.logAction('guard3-evaluated');
          return true;
        }),
        hsm.target('path3')
      )
    ),
    hsm.state('path1'),
    hsm.state('path2'),
    hsm.state('path3')
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should evaluate guards in order until first true
  assert.deepStrictEqual(instance.log, [
    'guard1-evaluated',
    'guard2-evaluated',
    'path2-effect'
  ]);
  assert.strictEqual(instance.state(), '/SideEffectChoiceMachine/path2');

  hsm.stop(instance);
});