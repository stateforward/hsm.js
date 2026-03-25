const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EventEmitter = require('node:events');

const hsm = require('../src/hsm.js');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadVmModule(filename, extraContext, expose) {
  const abs = path.join(__dirname, '..', 'src', filename);
  const source = fs.readFileSync(abs, 'utf8').replace(/\bexport\s+/g, '') +
    '\n;globalThis.__captured = {' + expose.join(', ') + '};';
  const context = vm.createContext(Object.assign({
    console,
    Math,
    Date,
    Uint8Array,
    setTimeout,
    clearTimeout,
    globalThis: null
  }, extraContext || {}));
  context.globalThis = context;
  vm.runInContext(source, context, { filename: abs });
  return context;
}

function BareInstance() {
  hsm.Instance.call(this);
  this.log = [];
}
BareInstance.prototype = Object.create(hsm.Instance.prototype);
BareInstance.prototype.constructor = BareInstance;

test('coverage: orphan instance fallbacks and helper no-op wrappers', async function () {
  const orphan = new hsm.Instance();
  assert.strictEqual(orphan.get('missing'), undefined);
  assert.strictEqual(orphan.call('missing'), undefined);
  assert.deepStrictEqual(orphan.takeSnapshot(), {
    id: '',
    qualifiedName: '',
    state: '',
    attributes: {},
    queueLen: 0,
    events: []
  });
  orphan.set('x', 1);
  orphan.restart('data');

  assert.strictEqual(hsm.get(orphan, 'x'), undefined);
  assert.strictEqual(hsm.get(new hsm.Context(), orphan, 'x'), undefined);
  hsm.set(orphan, 'x', 1);
  hsm.set(new hsm.Context(), orphan, 'x', 2);
  assert.strictEqual(hsm.call(orphan, 'noop'), undefined);
  assert.strictEqual(hsm.call(new hsm.Context(), orphan, 'noop'), undefined);
  assert.deepStrictEqual(hsm.takeSnapshot(orphan), orphan.takeSnapshot());
  assert.deepStrictEqual(hsm.takeSnapshot(new hsm.Context(), orphan), orphan.takeSnapshot());

  await assert.doesNotReject(hsm.afterProcess(new hsm.Context(), null));
  await assert.doesNotReject(hsm.afterDispatch(new hsm.Context(), null, { name: 'e' }));
  await assert.doesNotReject(hsm.afterEntry(new hsm.Context(), null, '/s'));
  await assert.doesNotReject(hsm.afterExit(new hsm.Context(), null, '/s'));
  await assert.doesNotReject(hsm.afterExecuted(new hsm.Context(), null, '/s'));

  hsm.stop(null);
  assert.strictEqual(hsm.id(null), '');
  assert.strictEqual(hsm.qualifiedName(null), '');
  assert.strictEqual(hsm.name(null), '');
  assert.strictEqual(hsm.clock(null), hsm.DefaultClock);
  assert.strictEqual(orphan.clock(), hsm.DefaultClock);
});

test('coverage: start overload, context wrappers, dispatch helpers, and stop listeners', async function () {
  const instance = new BareInstance();
  const model = hsm.define(
    'CoverageHelpers',
    hsm.attribute('flag', false),
    hsm.operation('sum', function (ctx, inst, a, b) { return a + b; }),
    hsm.state('idle',
      hsm.transition(hsm.on('go'), hsm.target('../done'))
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('idle'))
  );

  const sm = hsm.start(instance, model, { id: 'machine-1', name: 'CoverageHelpersName' });
  assert.strictEqual(sm.id, 'machine-1');
  assert.strictEqual(sm.name, 'CoverageHelpersName');
  assert.strictEqual(hsm.get(instance, 'flag'), false);
  hsm.set(instance, 'flag', true);
  assert.strictEqual(hsm.get(instance, 'flag'), true);
  assert.strictEqual(hsm.call(instance, 'sum', 2, 4), 6);

  const ctx = instance.context();
  assert.strictEqual(ctx.hsm, sm);
  assert.strictEqual(hsm.id(instance), 'machine-1');
  assert.strictEqual(hsm.qualifiedName(instance), '/CoverageHelpers');
  assert.strictEqual(hsm.name(instance), 'CoverageHelpersName');

  const processed = hsm.afterProcess(ctx, instance, { name: 'go' });
  const dispatched = hsm.afterDispatch(ctx, instance, { name: 'go' });
  const entered = hsm.afterEntry(ctx, instance, '/CoverageHelpers/done');
  hsm.dispatchTo(ctx, { name: 'go', kind: hsm.kinds.Event }, 'machine-1', 'missing');
  await Promise.all([processed, dispatched, entered]);
  assert.strictEqual(sm.state(), '/CoverageHelpers/done');

  const idleProcess = hsm.afterProcess(ctx, instance);
  await idleProcess;

  let listenerCount = 0;
  ctx.addEventListener('done', function () {
    listenerCount++;
  });
  hsm.stop(instance);
  assert.strictEqual(ctx.done, true);
  assert.strictEqual(listenerCount, 1);
});

test('coverage: explicit helper branches for onSet/onCall/when/at/history/group', async function () {
  const implicitModel = hsm.define(
    'ImplicitAttributeModel',
    hsm.state('idle',
      hsm.transition(hsm.onSet('dynamic'), hsm.target('../done'))
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('idle'))
  );
  assert.ok(implicitModel.attributes['/ImplicitAttributeModel/dynamic']);

  assert.throws(function () {
    hsm.define(
      'MissingOpModel',
      hsm.state('idle', hsm.transition(hsm.onCall('missing'), hsm.target('../done'))),
      hsm.state('done'),
      hsm.initial(hsm.target('idle'))
    );
  }, /missing operation/);

  const autoHistoryModel = hsm.define(
    'AutoHistoryModel',
    hsm.state('parent',
      hsm.state('child'),
      hsm.shallowHistory(hsm.transition(hsm.target('child'))),
      hsm.deepHistory(hsm.transition(hsm.target('child'))),
      hsm.initial(hsm.target('child'))
    ),
    hsm.initial(hsm.target('parent'))
  );
  assert.ok(Object.keys(autoHistoryModel.members).some((name) => name.includes('shallow_history_')));
  assert.ok(Object.keys(autoHistoryModel.members).some((name) => name.includes('deep_history_')));

  const emitterInstance = new BareInstance();
  const signal = new EventEmitter();
  const emitterModel = hsm.define(
    'EmitterWhenModel',
    hsm.state('waiting',
      hsm.transition(
        hsm.when(function () { return signal; }),
        hsm.target('../done')
      )
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('waiting'))
  );
  const emitterSm = hsm.start(new hsm.Context(), emitterInstance, emitterModel);
  signal.emit('ready');
  await delay(10);
  assert.strictEqual(emitterSm.state(), '/EmitterWhenModel/done');

  const falseyInstance = new BareInstance();
  const falseyModel = hsm.define(
    'FalseyWhenModel',
    hsm.state('waiting',
      hsm.transition(
        hsm.when(function () { return null; }),
        hsm.target('../done')
      ),
      hsm.transition(hsm.on('manual'), hsm.target('../done'))
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('waiting'))
  );
  const falseySm = hsm.start(new hsm.Context(), falseyInstance, falseyModel);
  falseySm.dispatch({ name: 'manual', kind: hsm.kinds.Event });
  assert.strictEqual(falseySm.state(), '/FalseyWhenModel/done');

  const atImmediateInstance = new BareInstance();
  const atImmediateModel = hsm.define(
    'ImmediateAtModel',
    hsm.attribute('deadline', Date.now() - 50),
    hsm.state('waiting',
      hsm.transition(
        hsm.at('deadline'),
        hsm.target('../done')
      )
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('waiting'))
  );
  const atImmediateSm = hsm.start(new hsm.Context(), atImmediateInstance, atImmediateModel);
  await delay(0);
  assert.strictEqual(atImmediateSm.state(), '/ImmediateAtModel/done');

  const customClock = {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    now: function () {
      return Date.now();
    }
  };
  const clockInstance = new BareInstance();
  const clockModel = hsm.define(
    'ClockParityModel',
    hsm.state('idle'),
    hsm.initial(hsm.target('idle'))
  );
  hsm.start(new hsm.Context(), clockInstance, clockModel, { clock: customClock });
  assert.strictEqual(clockInstance.clock().setTimeout, customClock.setTimeout);
  assert.strictEqual(clockInstance.clock().clearTimeout, customClock.clearTimeout);
  assert.strictEqual(clockInstance.clock().now, customClock.now);
  assert.strictEqual(hsm.clock(clockInstance).now, customClock.now);
  assert.strictEqual(hsm.Clock(clockInstance).now, customClock.now);

  const first = new BareInstance();
  const second = new BareInstance();
  const groupModel = hsm.define(
    'GroupCoverageModel',
    hsm.operation('value', function () { return 7; }),
    hsm.state('idle',
      hsm.transition(hsm.on('go'), hsm.target('../done'))
    ),
    hsm.state('done'),
    hsm.initial(hsm.target('idle'))
  );
  hsm.start(new hsm.Context(), first, groupModel);
  hsm.start(new hsm.Context(), second, groupModel);
  const nested = hsm.makeGroup(second);
  const group = hsm.makeGroup(null, first, nested);
  group.set('unused', true);
  assert.strictEqual(group.call('value'), 7);
  group.dispatch({ name: 'go', kind: hsm.kinds.Event });
  await delay(0);
  assert.strictEqual(first.state(), '/GroupCoverageModel/done');
  assert.strictEqual(second.state(), '/GroupCoverageModel/done');
  group.restart();
  assert.strictEqual(first.state(), '/GroupCoverageModel/idle');
  assert.deepStrictEqual(group.takeSnapshot(), {
    id: '',
    qualifiedName: '',
    state: '',
    attributes: {},
    queueLen: 0,
    events: []
  });
  assert.strictEqual(group.clock(), hsm.DefaultClock);
  assert.strictEqual(hsm.clock(group), hsm.DefaultClock);
  group.stop();

  const emptyGroup = hsm.makeGroup(null, hsm.makeGroup());
  assert.strictEqual(emptyGroup.call('missing'), undefined);
});

test('coverage: hsm helper branches through vm and direct utilities', function () {
  const profiler = new hsm.Profiler();
  const originalConsoleLog = console.log;
  const logs = [];
  const originalGetTime = global.getTime;
  console.log = function () {
    logs.push(Array.from(arguments).join(' '));
  };
  global.getTime = function () {
    return 123.456;
  };
  try {
    assert.strictEqual(profiler.getTime(), 123.456);
    profiler.report();
    const disabled = new hsm.Profiler(true);
    disabled.report();
    profiler.start('a');
    profiler.end('a');
    profiler.report();
  } finally {
    console.log = originalConsoleLog;
    if (originalGetTime === undefined) {
      delete global.getTime;
    } else {
      global.getTime = originalGetTime;
    }
  }
  assert.ok(logs.some((line) => line.includes('No profiling data collected')));
  assert.ok(logs.some((line) => line.includes('Profiling is disabled')));
  assert.ok(logs.some((line) => line.includes('HSM Optimized Profiling Results:')));

  const derived = hsm.makeKind(hsm.kinds.State, hsm.kinds.Namespace);
  assert.strictEqual(hsm.isKind(derived, hsm.kinds.State), true);
});

test('coverage: kind.js vm branches and bases helper', function () {
  const exportsContext = loadVmModule('kind.js', { exports: {} }, ['bases', 'kind', 'isKind']);
  const baseA = exportsContext.__captured.kind();
  const baseB = exportsContext.__captured.kind();
  const composite = exportsContext.__captured.kind(baseA, baseB);
  const bases = Array.from(exportsContext.__captured.bases(composite));
  assert.ok(bases.includes(baseA & 0xff));
  assert.ok(bases.includes(baseB & 0xff));
  assert.strictEqual(typeof exportsContext.exports.kind, 'function');

  const globalContext = loadVmModule('kind.js', { global: {} }, ['bases', 'kind', 'isKind']);
  assert.strictEqual(typeof globalContext.global.KindSystem.kind, 'function');
});

test('coverage: muid.js vm fallback and utility branches', function () {
  const fakeMath = Object.create(Math);
  fakeMath.random = () => 0.5;
  const fallbackContext = loadVmModule(
    'muid.js',
    {
      require: function () { throw new Error('missing'); },
      Math: fakeMath,
      global: {}
    },
    ['getMachineIdentifier', 'getRandomBytes', 'toString64', 'toBase32_64', 'MUID']
  );
  const fallbackBytes = Array.from(fallbackContext.__captured.getRandomBytes(3));
  assert.deepStrictEqual(fallbackBytes, [128, 128, 128]);
  assert.ok(fallbackContext.__captured.getMachineIdentifier().startsWith('js-'));
  assert.ok(fallbackContext.__captured.toString64({ high: 0x300000, low: 1 }).startsWith('0x'));
  assert.notStrictEqual(fallbackContext.__captured.toBase32_64({ high: 1, low: 15 }), '0');
  const zeroValue = new fallbackContext.__captured.MUID(null).value;
  assert.strictEqual(zeroValue.high, 0);
  assert.strictEqual(zeroValue.low, 0);

  const browserContext = loadVmModule(
    'muid.js',
    {
      navigator: { userAgent: 'ua', platform: 'plat', hardwareConcurrency: 3 },
      window: {
        crypto: {
          getRandomValues(array) {
            array[0] = 1;
            array[1] = 2;
            array[2] = 3;
          }
        }
      },
      global: {}
    },
    ['getMachineIdentifier', 'getRandomBytes']
  );
  assert.strictEqual(browserContext.__captured.getMachineIdentifier(), 'uaplat3');
  assert.deepStrictEqual(Array.from(browserContext.__captured.getRandomBytes(3)), [1, 2, 3]);

  const nodeCryptoContext = loadVmModule(
    'muid.js',
    {
      require(name) {
        if (name === 'crypto') {
          return {
            randomBytes(length) {
              return Buffer.from(new Array(length).fill(7));
            }
          };
        }
        if (name === 'os') {
          return {
            hostname() { return 'host'; },
            cpus() { return [1, 2, 3, 4, 5, 6, 7, 8]; }
          };
        }
        throw new Error('unexpected module');
      },
      Buffer,
      exports: {}
    },
    ['getMachineIdentifier', 'getRandomBytes', 'ShardedGenerators']
  );
  assert.strictEqual(nodeCryptoContext.__captured.getMachineIdentifier(), 'host');
  assert.deepStrictEqual(Array.from(nodeCryptoContext.__captured.getRandomBytes(3)), [7, 7, 7]);
  const sharded = new nodeCryptoContext.__captured.ShardedGenerators();
  assert.ok(sharded.size > 1);
});
