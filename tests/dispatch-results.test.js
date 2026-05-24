const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

function ResultMachine() {
  hsm.Instance.call(this);
}

ResultMachine.prototype = Object.create(hsm.Instance.prototype);
ResultMachine.prototype.constructor = ResultMachine;

test('instance dispatch and set return completions', async function () {
  var instance = new ResultMachine();
  var model = hsm.Define(
    'DispatchCompletionMachine',
    hsm.Attribute('count', Number, 0),
    hsm.State('idle',
      hsm.Transition(hsm.On('go'), hsm.Target('../done'))
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);

  var topLevelSet = hsm.Set(instance, 'count', 1);
  assert.ok(topLevelSet instanceof Promise);
  await topLevelSet;
  var instanceSet = instance.set('count', 2);
  assert.ok(instanceSet instanceof Promise);
  await instanceSet;
  await sm.dispatch({ name: 'go', kind: hsm.kinds.Event });
  assert.strictEqual(sm.state(), '/DispatchCompletionMachine/done');
  await instance.dispatch({ name: 'ignored', kind: hsm.kinds.Event });
});

test('set no-ops for unknown attributes and type mismatches', async function () {
  var instance = new ResultMachine();
  var model = hsm.Define(
    'SetFailureResultMachine',
    hsm.Attribute('count', Number, 0),
    hsm.State('idle',
      hsm.Transition(hsm.OnSet('count'), hsm.Target('../changed'))
    ),
    hsm.State('changed'),
    hsm.Initial(hsm.Target('idle'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);

  await hsm.Set(instance, 'missing', 1);
  await instance.set('count', 'wrong');
  assert.strictEqual(sm.state(), '/SetFailureResultMachine/idle');
  assert.strictEqual(instance.get('count'), 0);

  await instance.set('count', 1);
  assert.strictEqual(sm.state(), '/SetFailureResultMachine/changed');
});

test('group dispatch and set return completions', async function () {
  var instance = new ResultMachine();
  var model = hsm.Define(
    'GroupDispatchCompletionMachine',
    hsm.Attribute('value', 0),
    hsm.State('idle'),
    hsm.Initial(hsm.Target('idle'))
  );

  hsm.start(new hsm.Context(), instance, model);
  var group = hsm.MakeGroup(instance);

  await group.dispatch({ name: 'noop', kind: hsm.kinds.Event });
  var groupSet = group.set('value', 1);
  assert.ok(groupSet instanceof Promise);
  await groupSet;
  await group.set('missing', 1);
});

test('deferred dispatch returns a completion and preserves deferred behavior', async function () {
  var instance = new ResultMachine();
  var model = hsm.Define(
    'DeferredDispatchCompletionMachine',
    hsm.State('busy',
      hsm.Defer('process'),
      hsm.Transition(hsm.On('ready'), hsm.Target('../ready'))
    ),
    hsm.State('ready',
      hsm.Transition(hsm.On('process'), hsm.Target('../working'))
    ),
    hsm.State('working'),
    hsm.Initial(hsm.Target('busy'))
  );

  var sm = hsm.start(new hsm.Context(), instance, model);

  await sm.dispatch({ name: 'process', kind: hsm.kinds.Event });
  assert.strictEqual(sm.state(), '/DeferredDispatchCompletionMachine/busy');
  await sm.dispatch({ name: 'ready', kind: hsm.kinds.Event });
  assert.strictEqual(sm.state(), '/DeferredDispatchCompletionMachine/working');
});

test('group dispatch completion preserves deferred member behavior', async function () {
  var deferredInstance = new ResultMachine();
  var processedInstance = new ResultMachine();
  var model = hsm.Define(
    'GroupDeferredDispatchCompletionMachine',
    hsm.State('blocked',
      hsm.Defer('work')
    ),
    hsm.State('open',
      hsm.Transition(hsm.On('work'), hsm.Target('../done'))
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('blocked'))
  );
  var processedModel = hsm.Define(
    'GroupProcessedDispatchCompletionMachine',
    hsm.State('open',
      hsm.Transition(hsm.On('work'), hsm.Target('../done'))
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('open'))
  );

  hsm.start(new hsm.Context(), deferredInstance, model);
  hsm.start(new hsm.Context(), processedInstance, processedModel);
  var group = hsm.MakeGroup(deferredInstance, processedInstance);

  await group.dispatch({ name: 'work', kind: hsm.kinds.Event });
  assert.strictEqual(deferredInstance.state(), '/GroupDeferredDispatchCompletionMachine/blocked');
  assert.strictEqual(processedInstance.state(), '/GroupProcessedDispatchCompletionMachine/done');
});
