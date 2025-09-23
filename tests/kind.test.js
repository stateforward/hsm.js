const KindSystem = require('../src/kind.js');
const assert = require('assert');

// Import the functions we need
const { kind, isKind } = KindSystem;

// Test counter to generate unique IDs
function Counter() {
    this.value = 0;
}

Counter.prototype.next = function () {
    var value = this.value;
    this.value++;
    return value;
};

var counter = new Counter();

// Define kinds exactly like in hsm.js
var TestKinds = {};
TestKinds.Null = counter.next();
TestKinds.Element = kind(counter.next());
TestKinds.Partial = kind(counter.next(), TestKinds.Element);
TestKinds.Vertex = kind(counter.next(), TestKinds.Element);
TestKinds.Constraint = kind(counter.next(), TestKinds.Element);
TestKinds.Behavior = kind(counter.next(), TestKinds.Element);
TestKinds.Concurrent = kind(counter.next(), TestKinds.Behavior);
TestKinds.Sequential = kind(counter.next(), TestKinds.Behavior);
TestKinds.StateMachine = kind(counter.next(), TestKinds.Behavior);
TestKinds.Namespace = kind(counter.next(), TestKinds.Element);
TestKinds.Attribute = kind(counter.next(), TestKinds.Element);
TestKinds.State = kind(counter.next(), TestKinds.Vertex, TestKinds.Namespace);
TestKinds.Model = kind(counter.next(), TestKinds.State);
TestKinds.Transition = kind(counter.next(), TestKinds.Element);
TestKinds.Internal = kind(counter.next(), TestKinds.Transition);
TestKinds.External = kind(counter.next(), TestKinds.Transition);
TestKinds.Local = kind(counter.next(), TestKinds.Transition);
TestKinds.Self = kind(counter.next(), TestKinds.Transition);
TestKinds.Event = kind(counter.next(), TestKinds.Element);
TestKinds.CompletionEvent = kind(counter.next(), TestKinds.Event);
TestKinds.ErrorEvent = kind(counter.next(), TestKinds.CompletionEvent);
TestKinds.TimeEvent = kind(counter.next(), TestKinds.Event);
TestKinds.Pseudostate = kind(counter.next(), TestKinds.Vertex);
TestKinds.Initial = kind(counter.next(), TestKinds.Pseudostate);
TestKinds.FinalState = kind(counter.next(), TestKinds.State);
TestKinds.Choice = kind(counter.next(), TestKinds.Pseudostate);
TestKinds.Junction = kind(counter.next(), TestKinds.Pseudostate);
TestKinds.DeepHistory = kind(counter.next(), TestKinds.Pseudostate);
TestKinds.ShallowHistory = kind(counter.next(), TestKinds.Pseudostate);

console.log('=== KIND SYSTEM TESTS ===\n');

function test(name, fn) {
    try {
        fn();
        console.log('✓ ' + name);
    } catch (e) {
        console.error('✗ ' + name + ': ' + e.message);
        // Don't throw, just continue to see all failures
    }
}

// Basic inheritance tests
test('Element should match Element', function () {
    assert.strictEqual(isKind(TestKinds.Element, TestKinds.Element), true);
});

test('State should match Element (inheritance)', function () {
    assert.strictEqual(isKind(TestKinds.State, TestKinds.Element), true);
});

test('State should match Vertex (inheritance)', function () {
    assert.strictEqual(isKind(TestKinds.State, TestKinds.Vertex), true);
});

test('State should match Namespace (inheritance)', function () {
    assert.strictEqual(isKind(TestKinds.State, TestKinds.Namespace), true);
});

test('State should match State', function () {
    assert.strictEqual(isKind(TestKinds.State, TestKinds.State), true);
});

// FinalState tests
test('FinalState should match State (inheritance)', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.State), true);
});

test('FinalState should match Element (via State)', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.Element), true);
});

test('FinalState should match Vertex (via State)', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.Vertex), true);
});

test('FinalState should match Namespace (via State)', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.Namespace), true);
});

test('FinalState should match FinalState', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.FinalState), true);
});

// Choice tests
test('Choice should match Pseudostate (inheritance)', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Pseudostate), true);
});

test('Choice should match Vertex (via Pseudostate)', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Vertex), true);
});

test('Choice should match Element (via Pseudostate -> Vertex)', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Element), true);
});

test('Choice should match Choice', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Choice), true);
});

// Critical negative tests
test('Choice should NOT match FinalState', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.FinalState), false);
});

test('FinalState should NOT match Choice', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.Choice), false);
});

test('Choice should NOT match State', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.State), false);
});

test('FinalState should NOT match Pseudostate', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.Pseudostate), false);
});

test('Choice should NOT match Namespace', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Namespace), false);
});

// Multiple inheritance tests
test('State should match both Vertex and Namespace', function () {
    assert.strictEqual(isKind(TestKinds.State, TestKinds.Vertex, TestKinds.Namespace), true);
});

test('Choice should match both Pseudostate and Vertex', function () {
    assert.strictEqual(isKind(TestKinds.Choice, TestKinds.Pseudostate, TestKinds.Vertex), true);
});

test('FinalState should match both State and Element', function () {
    assert.strictEqual(isKind(TestKinds.FinalState, TestKinds.State, TestKinds.Element), true);
});

// Other pseudostate tests
test('Initial should match Pseudostate', function () {
    assert.strictEqual(isKind(TestKinds.Initial, TestKinds.Pseudostate), true);
});

test('Initial should NOT match Choice', function () {
    assert.strictEqual(isKind(TestKinds.Initial, TestKinds.Choice), false);
});

test('Junction should match Pseudostate', function () {
    assert.strictEqual(isKind(TestKinds.Junction, TestKinds.Pseudostate), true);
});

test('Junction should NOT match Choice', function () {
    assert.strictEqual(isKind(TestKinds.Junction, TestKinds.Choice), false);
});

// Transition tests
test('External should match Transition', function () {
    assert.strictEqual(isKind(TestKinds.External, TestKinds.Transition), true);
});

test('Internal should match Transition', function () {
    assert.strictEqual(isKind(TestKinds.Internal, TestKinds.Transition), true);
});

test('External should NOT match Internal', function () {
    assert.strictEqual(isKind(TestKinds.External, TestKinds.Internal), false);
});
