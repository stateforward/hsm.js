/**
 * @fileoverview Test hierarchical states and nested state transitions
 * Tests complex state hierarchies, entry/exit order, and transitions between nested states
 */

const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Test instance implementation
class HierarchicalInstance extends hsm.Instance {
  constructor() {
    super();
    this.log = [];
    this.data = {};
  }

  logAction(action) {
    this.log.push(action);
  }
}

test('Simple hierarchical states with parent-child relationship', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('HierarchicalMachine',
    hsm.initial(
      hsm.target('parent')
    ),
    hsm.state('parent',
      hsm.initial(
        hsm.target('child1')
      ),
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
          hsm.on('next'),
          hsm.target('../child2')
        )
      ),

      hsm.state('child2',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('child2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('child2-exit');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should enter parent first, then child1
  assert.deepStrictEqual(instance.log, ['parent-entry', 'child1-entry']);
  assert.strictEqual(instance.state(), '/HierarchicalMachine/parent/child1');

  // Transition between siblings
  instance.dispatch({ name: 'next', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'parent-entry', 'child1-entry',
    'child1-exit', 'child2-entry'
  ]);
  assert.strictEqual(instance.state(), '/HierarchicalMachine/parent/child2');

  hsm.stop(instance);
  // Should exit in reverse order
  assert.deepStrictEqual(instance.log, [
    'parent-entry', 'child1-entry',
    'child1-exit', 'child2-entry',
    'child2-exit', 'parent-exit'
  ]);
});

test('Deep hierarchy with multiple levels', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('DeepHierarchy',
    hsm.initial(
      hsm.target('level1')
    ),
    hsm.state('level1',
      hsm.initial(
        hsm.target('level2')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('level1-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('level1-exit');
      }),

      hsm.state('level2',
        hsm.initial(
          hsm.target('level3')
        ),
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('level2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('level2-exit');
        }),

        hsm.state('level3',
          hsm.initial(
            hsm.target('level4')
          ),
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('level3-entry');
          }),
          hsm.exit(function (ctx, inst, event) {
            inst.logAction('level3-exit');
          }),

          hsm.state('level4',
            hsm.entry(function (ctx, inst, event) {
              inst.logAction('level4-entry');
            }),
            hsm.exit(function (ctx, inst, event) {
              inst.logAction('level4-exit');
            })
          )
        )
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should enter all levels in order
  assert.deepStrictEqual(instance.log, [
    'level1-entry',
    'level2-entry',
    'level3-entry',
    'level4-entry'
  ]);
  assert.strictEqual(instance.state(), '/DeepHierarchy/level1/level2/level3/level4');

  hsm.stop(instance);
  // Should exit in reverse order
  assert.deepStrictEqual(instance.log, [
    'level1-entry', 'level2-entry', 'level3-entry', 'level4-entry',
    'level4-exit', 'level3-exit', 'level2-exit', 'level1-exit'
  ]);
});

test('Transitions between different hierarchy levels', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('CrossLevelMachine',
    hsm.initial(
      hsm.target('a')
    ),
    hsm.state('a',
      hsm.initial(
        hsm.target('a1')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('a-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('a-exit');
      }),

      hsm.state('a1',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('a1-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('a1-exit');
        }),
        hsm.transition(
          hsm.on('toB'),
          hsm.target('../../b/b2') // Go up and then down
        )
      ),

      hsm.state('a2',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('a2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('a2-exit');
        })
      )
    ),

    hsm.state('b',
      hsm.initial(
        hsm.target('b1')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('b-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('b-exit');
      }),

      hsm.state('b1',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('b1-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('b1-exit');
        })
      ),

      hsm.state('b2',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('b2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('b2-exit');
        }),
        hsm.transition(
          hsm.on('toA'),
          hsm.target('../../a/a2')
        )
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  instance.log = []; // Clear initial entries

  // Transition from a1 to b2
  instance.dispatch({ name: 'toB', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'a1-exit', 'a-exit',
    'b-entry', 'b2-entry'
  ]);
  assert.strictEqual(instance.state(), '/CrossLevelMachine/b/b2');

  // Transition from b2 to a2
  instance.log = [];
  instance.dispatch({ name: 'toA', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'b2-exit', 'b-exit',
    'a-entry', 'a2-entry'
  ]);
  assert.strictEqual(instance.state(), '/CrossLevelMachine/a/a2');

  hsm.stop(instance);
});

test('Local transitions within hierarchy', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('LocalTransitionMachine',
    hsm.initial(
      hsm.target('container')
    ),
    hsm.state('container',
      hsm.initial(
        hsm.target('inner')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('container-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('container-exit');
      }),

      hsm.state('inner',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('inner-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('inner-exit');
        })
      ),

      // Transition at container level
      hsm.transition(
        hsm.on('restart'),
        hsm.target('inner') // Local transition to child
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/LocalTransitionMachine/container/inner');
  instance.log = [];

  // Local transition should exit inner and re-enter it
  instance.dispatch({ name: 'restart', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'inner-exit',
    'inner-entry'
  ]);
  assert.strictEqual(instance.state(), '/LocalTransitionMachine/container/inner');

  hsm.stop(instance);
});

test('Event bubbling in hierarchical states', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('EventBubblingMachine',
    hsm.initial(
      hsm.target('outer')
    ),
    hsm.state('outer',
      hsm.initial(
        hsm.target('middle')
      ),
      hsm.transition(
        hsm.on('bubble'),
        hsm.target('handled'),
        hsm.effect(function (ctx, inst, event) {
          inst.logAction('outer-handled-bubble');
        })
      ),

      hsm.state('middle',
        hsm.initial(
          hsm.target('inner')
        ),

        hsm.state('inner',
          hsm.entry(function (ctx, inst, event) {
            inst.logAction('inner-entry');
          })
          // No transition for 'bubble' event here
        )
      ),

      hsm.state('handled',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('handled-entry');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/EventBubblingMachine/outer/middle/inner');
  instance.log = [];

  // Event should bubble up from inner through middle to outer
  instance.dispatch({ name: 'bubble', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'outer-handled-bubble',
    'handled-entry'
  ]);
  assert.strictEqual(instance.state(), '/EventBubblingMachine/outer/handled');

  hsm.stop(instance);
});

test('Multiple parallel hierarchies', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('ParallelHierarchies',
    hsm.initial(
      hsm.target('branch1')
    ),
    hsm.state('branch1',
      hsm.initial(
        hsm.target('leaf1')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('branch1-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('branch1-exit');
      }),

      hsm.state('leaf1',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('leaf1-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('leaf1-exit');
        }),
        hsm.transition(
          hsm.on('switch'),
          hsm.target('../../branch2/leaf2')
        )
      )
    ),

    hsm.state('branch2',
      hsm.initial(
        hsm.target('leaf2')
      ),
      hsm.entry(function (ctx, inst, event) {
        inst.logAction('branch2-entry');
      }),
      hsm.exit(function (ctx, inst, event) {
        inst.logAction('branch2-exit');
      }),

      hsm.state('leaf2',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('leaf2-entry');
        }),
        hsm.exit(function (ctx, inst, event) {
          inst.logAction('leaf2-exit');
        }),
        hsm.transition(
          hsm.on('switch'),
          hsm.target('../../branch1/leaf1')
        )
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/ParallelHierarchies/branch1/leaf1');
  instance.log = [];

  // Switch between branches
  instance.dispatch({ name: 'switch', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'leaf1-exit', 'branch1-exit',
    'branch2-entry', 'leaf2-entry'
  ]);
  assert.strictEqual(instance.state(), '/ParallelHierarchies/branch2/leaf2');

  // Switch back
  instance.log = [];
  instance.dispatch({ name: 'switch', kind: hsm.kinds.Event });
  assert.deepStrictEqual(instance.log, [
    'leaf2-exit', 'branch2-exit',
    'branch1-entry', 'leaf1-entry'
  ]);
  assert.strictEqual(instance.state(), '/ParallelHierarchies/branch1/leaf1');

  hsm.stop(instance);
});

test('Absolute vs relative path targeting', async function () {
  const instance = new HierarchicalInstance();

  const model = hsm.define('PathTargetingMachine',
    hsm.initial(
      hsm.target('root')
    ),
    hsm.state('root',
      hsm.initial(
        hsm.target('child')
      ),

      hsm.state('child',
        hsm.initial(
          hsm.target('grandchild')
        ),
        hsm.state('grandchild',
          hsm.transition(
            hsm.on('relative'),
            hsm.target('..') // Relative to parent
          ),
        ),
        hsm.transition(
          hsm.on('absolute'),
          hsm.target('/root/other') // Absolute path
        )
      ),
      hsm.state('other',
        hsm.entry(function (ctx, inst, event) {
          inst.logAction('other-entry');
        })
      )
    )
  );

  const ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/PathTargetingMachine/root/child/grandchild');

  // Test relative path
  instance.dispatch({ name: 'relative', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/PathTargetingMachine/root/child');

  // Test absolute path
  instance.dispatch({ name: 'absolute', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/PathTargetingMachine/root/other');

  hsm.stop(instance);
});