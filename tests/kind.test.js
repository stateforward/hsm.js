const KindSystem = require('../src/kind.js');
const assert = require('assert');

// Import the functions we need
const { kind, isKind } = KindSystem;

// Define kinds exactly like the built-in counter flow in hsm.go / hsm.js
var TestKinds = {};
TestKinds.Null = kind();
TestKinds.Element = kind();
TestKinds.Partial = kind(TestKinds.Element);
TestKinds.Vertex = kind(TestKinds.Element);
TestKinds.Constraint = kind(TestKinds.Element);
TestKinds.Behavior = kind(TestKinds.Element);
TestKinds.Namespace = kind(TestKinds.Element);
TestKinds.Concurrent = kind(TestKinds.Behavior);
TestKinds.Sequential = kind(TestKinds.Behavior);
TestKinds.StateMachine = kind(TestKinds.Concurrent, TestKinds.Namespace);
TestKinds.Attribute = kind(TestKinds.Element);
TestKinds.State = kind(TestKinds.Vertex, TestKinds.Namespace);
TestKinds.Model = kind(TestKinds.State);
TestKinds.Transition = kind(TestKinds.Element);
TestKinds.Internal = kind(TestKinds.Transition);
TestKinds.External = kind(TestKinds.Transition);
TestKinds.Local = kind(TestKinds.Transition);
TestKinds.Self = kind(TestKinds.Transition);
TestKinds.Event = kind(TestKinds.Element);
TestKinds.CompletionEvent = kind(TestKinds.Event);
TestKinds.ChangeEvent = kind(TestKinds.Event);
TestKinds.ErrorEvent = kind(TestKinds.CompletionEvent);
TestKinds.TimeEvent = kind(TestKinds.Event);
TestKinds.CallEvent = kind(TestKinds.Event);
TestKinds.Pseudostate = kind(TestKinds.Vertex);
TestKinds.Initial = kind(TestKinds.Pseudostate);
TestKinds.FinalState = kind(TestKinds.State);
TestKinds.Choice = kind(TestKinds.Pseudostate);
TestKinds.Junction = kind(TestKinds.Pseudostate);
TestKinds.DeepHistory = kind(TestKinds.Pseudostate);
TestKinds.ShallowHistory = kind(TestKinds.Pseudostate);


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
