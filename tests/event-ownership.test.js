const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

function OwnershipMachine(label) {
  hsm.Instance.call(this);
  this.label = label;
  this.seen = [];
}

OwnershipMachine.prototype = Object.create(hsm.Instance.prototype);
OwnershipMachine.prototype.constructor = OwnershipMachine;

function ownershipModel(name) {
  return hsm.Define(
    name,
    hsm.State('idle',
      hsm.Transition(
        hsm.On('go'),
        hsm.Effect(function (ctx, inst, event) {
          inst.seen.push({
            name: event.name,
            kind: event.kind,
            schemaOwner: event.schema && event.schema.nested.owner,
            data: event.data
          });
          event.name = 'mutated-' + inst.label;
          event.kind = hsm.kinds.ErrorEvent;
          event.schema.nested.owner = inst.label;
          event.data.visits.push(inst.label);
        }),
        hsm.Target('../done')
      )
    ),
    hsm.State('done'),
    hsm.Initial(hsm.Target('idle'))
  );
}

test('dispatch isolates event metadata from caller while preserving data reference', async function () {
  var instance = new OwnershipMachine('single');
  var model = ownershipModel('DirectEventOwnership');
  hsm.start(new hsm.Context(), instance, model);
  var data = { visits: [] };
  var event = {
    name: 'go',
    schema: {
      nested: {
        owner: 'caller'
      }
    },
    data: data
  };

  await instance.dispatch(event);

  assert.strictEqual(event.name, 'go');
  assert.strictEqual(event.kind, undefined);
  assert.deepStrictEqual(event.schema, { nested: { owner: 'caller' } });
  assert.deepStrictEqual(data.visits, ['single']);
  assert.deepStrictEqual(instance.seen, [{
    name: 'go',
    kind: hsm.kinds.Event,
    schemaOwner: 'caller',
    data: data
  }]);
});

test('broadcast and group dispatch isolate sibling event metadata', async function () {
  var first = new OwnershipMachine('first');
  var second = new OwnershipMachine('second');
  var ctx = new hsm.Context();
  var model = ownershipModel('BroadcastEventOwnership');
  hsm.start(ctx, first, model, { id: 'first' });
  hsm.start(ctx, second, model, { id: 'second' });
  var data = { visits: [] };
  var event = hsm.Event('go', {
    nested: {
      owner: 'caller'
    }
  });
  event.data = data;

  await hsm.DispatchAll(ctx, event);

  assert.strictEqual(event.name, 'go');
  assert.strictEqual(event.kind, hsm.kinds.Event);
  assert.deepStrictEqual(event.schema, { nested: { owner: 'caller' } });
  assert.deepStrictEqual(data.visits, ['first', 'second']);
  assert.deepStrictEqual(first.seen[0], {
    name: 'go',
    kind: hsm.kinds.Event,
    schemaOwner: 'caller',
    data: data
  });
  assert.deepStrictEqual(second.seen[0], {
    name: 'go',
    kind: hsm.kinds.Event,
    schemaOwner: 'caller',
    data: data
  });

  hsm.restart(first);
  hsm.restart(second);
  first.seen = [];
  second.seen = [];
  data.visits = [];
  var group = hsm.MakeGroup(first, second);

  await group.dispatch(event);

  assert.deepStrictEqual(event.schema, { nested: { owner: 'caller' } });
  assert.deepStrictEqual(data.visits, ['first', 'second']);
  assert.strictEqual(first.seen[0].schemaOwner, 'caller');
  assert.strictEqual(second.seen[0].schemaOwner, 'caller');
});
