const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function ParityMachine() {
  hsm.Instance.call(this);
  this.log = [];
}

ParityMachine.prototype = Object.create(hsm.Instance.prototype);
ParityMachine.prototype.constructor = ParityMachine;

test('PascalCase exports remain available alongside camelCase', function () {
  assert.strictEqual(typeof hsm.Define, 'function');
  assert.strictEqual(hsm.Define, hsm.define);
  assert.strictEqual(hsm.State, hsm.state);
  assert.strictEqual(hsm.Event, hsm.event);
  assert.strictEqual(hsm.Config, hsm.config);
  assert.strictEqual(hsm.EventKind, hsm.kinds.Event);
  assert.strictEqual(hsm.StateKind, hsm.kinds.State);
  assert.strictEqual(hsm.TransitionKind, hsm.kinds.Transition);
  assert.strictEqual(hsm.CompletionEventKind, hsm.kinds.CompletionEvent);
  assert.strictEqual(hsm.FinalStateKind, hsm.kinds.FinalState);
  assert.strictEqual(hsm.OnSet, hsm.onSet);
  assert.strictEqual(hsm.OnCall, hsm.onCall);
  assert.strictEqual(hsm.ShallowHistory, hsm.shallowHistory);
  assert.strictEqual(hsm.DeepHistory, hsm.deepHistory);
  assert.strictEqual(hsm.TakeSnapshot, hsm.takeSnapshot);
  assert.strictEqual(hsm.Clock, hsm.clock);
  assert.strictEqual(hsm.Kinds, hsm.kinds);
});

test('Config(ID, Name, Data, Clock, Queue) aliases lowercase runtime config without mutating the model', function () {
  var entryData = [];
  var clock = {
    Now: function () {
      return 123;
    }
  };
  var model = hsm.Define(
    'CanonicalConfigMachine',
    hsm.State('idle',
      hsm.Entry(function (ctx, inst, event) {
        entryData.push(event.data);
      })
    ),
    hsm.Initial(hsm.Target('idle'))
  );
  var first = new ParityMachine();
  var second = new ParityMachine();
  var ctx = new hsm.Context();

  var firstConfig = hsm.Config('alpha', '/RuntimeAlpha', 'boot-alpha', clock);
  hsm.start(ctx, first, model, firstConfig);
  hsm.start(ctx, second, model, {
    id: 'beta',
    name: '/RuntimeBeta',
    data: 'boot-beta'
  });

  assert.strictEqual(hsm.ID(first), 'alpha');
  assert.strictEqual(hsm.Name(first), '/RuntimeAlpha');
  assert.strictEqual(hsm.QualifiedName(first), '/RuntimeAlpha');
  assert.strictEqual(hsm.TakeSnapshot(first).QualifiedName, '/RuntimeAlpha');
  assert.strictEqual(hsm.Clock(first).now(), 123);
  assert.strictEqual(ctx.instances.alpha, first);
  assert.strictEqual(ctx.instances.beta, second);
  assert.deepStrictEqual(entryData, ['boot-alpha', 'boot-beta']);
  assert.strictEqual(model.qualifiedName, '/CanonicalConfigMachine');
});

test('canonical Queue hooks Push Pop Len are accepted alongside lowercase hooks', function () {
  var events = [];
  var pushed = [];
  var hookContexts = [];
  var canonicalQueue = {
    Push: function (ctx, event) {
      hookContexts.push(ctx);
      pushed.push(event.name);
      events.push(event);
    },
    Pop: function (ctx) {
      hookContexts.push(ctx);
      return events.shift();
    },
    Len: function (ctx) {
      hookContexts.push(ctx);
      return events.length;
    }
  };
  var completion = { name: 'done.state.idle', kind: hsm.kinds.CompletionEvent };
  var regular = { name: 'go', kind: hsm.kinds.Event };
  var queue = new hsm.Queue(canonicalQueue);

  queue.push(regular);
  queue.push(completion);

  assert.deepStrictEqual(pushed, ['go']);
  assert.strictEqual(queue.len(), 2);
  assert.strictEqual(queue.pop(), completion);
  assert.strictEqual(queue.pop(), regular);
  assert.strictEqual(queue.pop(), undefined);
  assert.strictEqual(hookContexts.length >= 3, true);
});

test('canonical Config Queue hooks are used by runtime dispatch', function () {
  var events = [];
  var pushed = [];
  var contexts = [];
  var queue = {
    Push: function (ctx, event) {
      contexts.push(ctx);
      pushed.push(event.name);
      events.push(event);
    },
    Pop: function (ctx) {
      contexts.push(ctx);
      return events.shift();
    },
    Len: function (ctx) {
      contexts.push(ctx);
      return events.length;
    }
  };
  var model = hsm.Define(
    'CanonicalQueueRuntime',
    hsm.State('idle',
      hsm.Transition(hsm.On('go'), hsm.Target('../done'))
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );
  var ctx = new hsm.Context();
  var instance = new ParityMachine();

  hsm.start(ctx, instance, model, hsm.Config('queued', undefined, undefined, undefined, queue));
  assert.ok(instance.dispatch({ name: 'go', kind: hsm.kinds.Event }) instanceof Promise);

  assert.deepStrictEqual(pushed, ['go']);
  assert.strictEqual(instance.state(), '/CanonicalQueueRuntime/done');
  assert.strictEqual(contexts.every(function (value) { return value === ctx; }), true);
});

test('Event schema metadata is preserved in model registration and snapshots', function () {
  var payloadSchema = {
    parse: function (value) {
      return value;
    }
  };
  var goEvent = hsm.Event('go', payloadSchema);
  var model = hsm.Define(
    'SchemaParity',
    hsm.State('idle',
      hsm.Transition(
        hsm.On(goEvent),
        hsm.Target('../done')
      )
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );
  var instance = new ParityMachine();

  hsm.start(new hsm.Context(), instance, model);
  var snapshot = hsm.TakeSnapshot(instance);

  assert.strictEqual(model.events.go.schema, payloadSchema);
  assert.strictEqual(snapshot.events.length, 1);
  assert.strictEqual(snapshot.Events, snapshot.events);
  assert.strictEqual(snapshot.events[0].event, 'go');
  assert.strictEqual(snapshot.events[0].Name, 'go');
  assert.strictEqual(snapshot.events[0].Kind, hsm.kinds.Event);
  assert.strictEqual(snapshot.events[0].Guard, snapshot.events[0].guard);
  assert.strictEqual(snapshot.events[0].Target, snapshot.events[0].target);
  assert.notStrictEqual(snapshot.events[0].schema, payloadSchema);
  assert.deepStrictEqual(snapshot.events[0].schema, payloadSchema);
  assert.strictEqual(snapshot.events[0].Schema, snapshot.events[0].schema);
  assert.deepStrictEqual(snapshot.events[0].Schema, payloadSchema);
});

test('TakeSnapshot returns a frozen point-in-time view for plain attributes and events', function () {
  var payloadSchema = {
    nested: {
      version: 1
    }
  };
  var instance = new ParityMachine();
  var model = hsm.Define(
    'SnapshotParity',
    hsm.Attribute('payload', Object, {
      nested: {
        count: 1
      },
      items: [
        { label: 'first' }
      ]
    }),
    hsm.State('idle',
      hsm.Transition(
        hsm.On(hsm.Event('go', payloadSchema)),
        hsm.Target('../done')
      )
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );

  hsm.start(new hsm.Context(), instance, model);
  var snapshot = hsm.TakeSnapshot(instance);
  var attributeName = '/SnapshotParity/payload';

  assert.strictEqual(Object.isFrozen(snapshot), true);
  assert.strictEqual(Object.isFrozen(snapshot.attributes), true);
  assert.strictEqual(snapshot.Attributes, snapshot.attributes);
  assert.strictEqual(snapshot.QueueLen, snapshot.queueLen);
  assert.strictEqual(Object.isFrozen(snapshot.attributes[attributeName]), true);
  assert.strictEqual(Object.isFrozen(snapshot.attributes[attributeName].nested), true);
  assert.strictEqual(Object.isFrozen(snapshot.attributes[attributeName].items), true);
  assert.strictEqual(Object.isFrozen(snapshot.attributes[attributeName].items[0]), true);
  assert.strictEqual(Object.isFrozen(snapshot.events), true);
  assert.strictEqual(Object.isFrozen(snapshot.events[0]), true);
  assert.strictEqual(Object.isFrozen(snapshot.events[0].schema), true);
  assert.strictEqual(Object.isFrozen(snapshot.events[0].schema.nested), true);

  hsm.Get(instance, 'payload').nested.count = 99;
  hsm.Get(instance, 'payload').items[0].label = 'mutated';
  assert.strictEqual(hsm.Get(instance, 'payload').nested.count, 1);
  assert.strictEqual(hsm.Get(instance, 'payload').items[0].label, 'first');
  hsm.Set(instance, 'payload', {
    nested: {
      count: 2
    },
    items: []
  });
  payloadSchema.nested.version = 2;

  snapshot.attributes[attributeName].nested.count = 7;
  snapshot.attributes[attributeName].items[0].label = 'changed';
  snapshot.events[0].schema.nested.version = 7;
  assert.throws(function () {
    snapshot.events.push({ event: 'extra', guard: false });
  }, TypeError);

  assert.strictEqual(snapshot.state, '/SnapshotParity/idle');
  assert.strictEqual(snapshot.attributes[attributeName].nested.count, 1);
  assert.strictEqual(snapshot.attributes[attributeName].items[0].label, 'first');
  assert.strictEqual(snapshot.events[0].schema.nested.version, 1);
  assert.strictEqual(hsm.Get(instance, 'payload').nested.count, 2);
});

test('Attribute + OnSet + Get/Set parity', async function () {
  var instance = new ParityMachine();
  var model = hsm.Define(
    'AttributeParity',
    hsm.Attribute('count', 1),
    hsm.State('idle',
      hsm.Transition(
        hsm.OnSet('count'),
        hsm.Target('../changed'),
        hsm.Effect(function (ctx, inst, event) {
          inst.log.push(event.data.old + '->' + event.data.new);
        })
      )
    ),
    hsm.State('changed'),
    hsm.Initial(hsm.Target('idle'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);
  assert.strictEqual(hsm.Get(instance, 'count'), 1);
  hsm.Set(instance, 'count', 1);
  assert.strictEqual(sm.state(), '/AttributeParity/idle');
  hsm.Set(instance, 'count', 2);
  await delay(0);
  assert.strictEqual(sm.state(), '/AttributeParity/changed');
  assert.deepStrictEqual(instance.log, ['1->2']);
});

test('Operation + OnCall + Call parity', async function () {
  var instance = new ParityMachine();
  var model = hsm.Define(
    'CallParity',
    hsm.Operation('doWork', function (ctx, inst, a, b) {
      inst.log.push('op:' + a + ':' + b);
      return a + b;
    }),
    hsm.State('idle',
      hsm.Transition(
        hsm.OnCall('doWork'),
        hsm.Target('../done'),
        hsm.Effect('recordEffect')
      )
    ),
    hsm.State('done'),
    hsm.Operation('recordEffect', function (ctx, inst, event) {
      inst.log.push('effect:' + event.data.name);
    }),
    hsm.Initial(hsm.Target('idle'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);
  var result = hsm.Call(instance, 'doWork', 2, 3);
  await delay(0);
  assert.strictEqual(result, 5);
  assert.strictEqual(sm.state(), '/CallParity/done');
  assert.deepStrictEqual(instance.log, ['effect:/CallParity/doWork', 'op:2:3']);
});

test('String operation references work for Entry/Effect/Guard', async function () {
  var instance = new ParityMachine();
  var model = hsm.Define(
    'OperationRefs',
    hsm.Operation('enterIdle', function (ctx, inst, event) {
      inst.log.push('enterIdle');
    }),
    hsm.Operation('allowGo', function (ctx, inst, event) {
      inst.log.push('allowGo');
      return true;
    }),
    hsm.Operation('markGo', function (ctx, inst, event) {
      inst.log.push('markGo');
    }),
    hsm.State('idle',
      hsm.Entry('enterIdle'),
      hsm.Transition(
        hsm.On('go'),
        hsm.Guard('allowGo'),
        hsm.Effect('markGo'),
        hsm.Target('../done')
      )
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);
  sm.dispatch({ name: 'go', kind: hsm.kinds.Event });
  await delay(0);
  assert.strictEqual(sm.state(), '/OperationRefs/done');
  assert.deepStrictEqual(instance.log, ['enterIdle', 'allowGo', 'markGo']);
});

test('ShallowHistory and DeepHistory restore correctly', async function () {
  var instance = new ParityMachine();
  var model = hsm.Define(
    'HistoryParity',
    hsm.State('A',
      hsm.State('A1',
        hsm.State('A1a'),
        hsm.State('A1b'),
        hsm.Initial(hsm.Target('A1a'))
      ),
      hsm.State('A2'),
      hsm.ShallowHistory('shallow'),
      hsm.DeepHistory('deep'),
      hsm.Initial(hsm.Target('A1'))
    ),
    hsm.State('B'),
    hsm.Transition(hsm.On('toA1b'), hsm.Source('A/A1/A1a'), hsm.Target('A/A1/A1b')),
    hsm.Transition(hsm.On('toB'), hsm.Source('A/A1/A1b'), hsm.Target('B')),
    hsm.Transition(hsm.On('backDeep'), hsm.Source('B'), hsm.Target('A/deep')),
    hsm.Transition(hsm.On('backShallow'), hsm.Source('B'), hsm.Target('A/shallow')),
    hsm.Initial(hsm.Target('A'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);
  sm.dispatch({ name: 'toA1b', kind: hsm.kinds.Event });
  sm.dispatch({ name: 'toB', kind: hsm.kinds.Event });
  sm.dispatch({ name: 'backDeep', kind: hsm.kinds.Event });
  assert.strictEqual(sm.state(), '/HistoryParity/A/A1/A1b');
  sm.dispatch({ name: 'toB', kind: hsm.kinds.Event });
  sm.dispatch({ name: 'backShallow', kind: hsm.kinds.Event });
  assert.strictEqual(sm.state(), '/HistoryParity/A/A1/A1a');
});

test('When(function), At(), TakeSnapshot(), and Restart() parity', async function () {
  var instance = new ParityMachine();
  var resolveReady;
  var ready = new Promise(function (resolve) {
    resolveReady = resolve;
  });

  var model = hsm.Define(
    'RuntimeParity',
    hsm.State('waiting',
      hsm.Transition(
        hsm.When(function () {
          return ready;
        }),
        hsm.Target('../atDeadline')
      )
    ),
    hsm.State('atDeadline',
      hsm.Transition(
        hsm.At(function () {
          return Date.now() + 5;
        }),
        hsm.Target('../done')
      )
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('waiting'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);
  var before = hsm.TakeSnapshot(instance);
  assert.strictEqual(before.state, '/RuntimeParity/waiting');
  resolveReady();
  await delay(10);
  assert.strictEqual(sm.state(), '/RuntimeParity/done');
  hsm.Restart(instance);
  assert.strictEqual(sm.state(), '/RuntimeParity/waiting');
});

test('MakeGroup dispatches to all grouped instances', async function () {
  var first = new ParityMachine();
  var second = new ParityMachine();
  var model = hsm.Define(
    'GroupParity',
    hsm.State('idle',
      hsm.Transition(hsm.On('go'), hsm.Target('../done'))
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );

  hsm.start(new hsm.Context(), first, model, { id: 'first' });
  hsm.start(new hsm.Context(), second, model, { id: 'second' });
  var group = hsm.MakeGroup(first, second);
  group.dispatch({ name: 'go', kind: hsm.kinds.Event });
  await delay(0);
  assert.strictEqual(first.state(), '/GroupParity/done');
  assert.strictEqual(second.state(), '/GroupParity/done');
});

test('DSL names reject slash characters', function () {
  assert.throws(function () { hsm.Define('Bad/Model'); }, /Model name "Bad\/Model" cannot contain "\/"/);
  assert.throws(function () { hsm.State('bad/state'); }, /State name "bad\/state" cannot contain "\/"/);
  assert.throws(function () { hsm.Final('bad/final'); }, /Final name "bad\/final" cannot contain "\/"/);
  assert.throws(function () { hsm.ShallowHistory('bad/history'); }, /ShallowHistory name "bad\/history" cannot contain "\/"/);
  assert.throws(function () { hsm.DeepHistory('bad/history'); }, /DeepHistory name "bad\/history" cannot contain "\/"/);
  assert.throws(function () { hsm.Choice('bad/choice'); }, /Choice name "bad\/choice" cannot contain "\/"/);
  assert.throws(function () { hsm.Attribute('bad/attribute', 1); }, /Attribute name "bad\/attribute" cannot contain "\/"/);
  assert.throws(function () { hsm.Operation('bad/operation', function () {}); }, /Operation name "bad\/operation" cannot contain "\/"/);
});
