/**
 * @fileoverview HSM Validation Tests for JavaScript implementation
 * Compatible with Node.js built-in test framework
 * Tests cover HSM model validation constraints and error handling
 */

const test = require('node:test');
const assert = require('node:assert');

// Import HSM module
const hsm = require('../src/hsm.js');


// // Helper test machine class
// class TestMachine {
//   constructor() {
//     this.current = {};
//     this.events = [];
//   }

//   state() {
//     return this.current.qualifiedName || '/';
//   }

//   dispatch(event) {
//     this.events.push(event);
//     return Promise.resolve();
//   }
// }

// test('Validation - FinalState Rules', async () => {
//   const instance = new TestMachine();

//   // FinalState_no_entry_behavior: A FinalState has no entry Behavior
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.final('end',
//           hsm.entry(() => { })  // This should fail
//         )
//       ),
//       hsm.initial(hsm.target('parent'))
//     );
//   }, hsm.ValidationError);

//   // FinalState_no_exit_behavior: A FinalState has no exit Behavior  
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.final('end',
//           hsm.exit(() => { })  // This should fail
//         )
//       ),
//       hsm.initial(hsm.target('parent'))
//     );
//   }, hsm.ValidationError);

//   // FinalState_no_state_behavior: A FinalState has no doActivity Behavior
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.final('end',
//           hsm.activity(() => { })  // This should fail
//         )
//       ),
//       hsm.initial(hsm.target('parent'))
//     );
//   }, hsm.ValidationError);

//   // FinalState_no_outgoing_transitions: A FinalState cannot have outgoing Transitions
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.state('regular'),
//         hsm.final('end',
//           hsm.transition(hsm.on('event'), hsm.target('regular'))  // This should fail
//         )
//       ),
//       hsm.initial(hsm.target('parent'))
//     );
//   }, hsm.ValidationError);

//   // Valid final state should work
//   const validModel = hsm.define('TestModel',
//     hsm.state('parent',
//       hsm.state('regular',
//         hsm.transition(hsm.on('finish'), hsm.target('../end'))
//       ),
//       hsm.final('end'),
//       hsm.initial(hsm.target('regular'))
//     ),
//     hsm.initial(hsm.target('parent'))
//   );

//   assert.ok(validModel);
// });

// test('Validation - Transition Rules', async () => {
//   const instance = new TestMachine();

//   // Transition_initial_transition: Initial transitions cannot have non-initial events
//   assert.throws(() => {
//     var model = hsm.define('TestModel',
//       hsm.state('state1'),
//       hsm.initial(hsm.target('state1')),
//       // Add a custom partial that modifies the initial transition to have a non-initial event
//       function (model, stack) {
//         var initialVertex = model.members['/TestModel/.initial'];
//         if (initialVertex && initialVertex.transitions && initialVertex.transitions.length > 0) {
//           var initialTransition = model.members[initialVertex.transitions[0]];
//           if (initialTransition) {
//             // Add a non-initial event to the initial transition
//             initialTransition.events.push('trigger');
//           }
//         }
//       }
//     );
//     hsm.validate(model);  // Explicit validation call
//   }, hsm.ValidationError);

//   // Transitions from final states are not allowed - this should be caught by validation
//   assert.throws(() => {
//     var model = hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.state('regular'),
//         hsm.final('end')
//       ),
//       hsm.initial(hsm.target('parent')),
//       // Try to add transition from final state in post-processing
//       function (model, stack) {
//         var finalState = model.members['/TestModel/parent/end'];
//         if (finalState) {
//           finalState.transitions = ['illegal_transition'];
//           model.members['illegal_transition'] = {
//             qualifiedName: 'illegal_transition',
//             kind: hsm.kinds.Transition,
//             source: '/TestModel/parent/end',
//             target: '/TestModel/parent/regular',
//             events: ['some_event'],
//             effect: [],
//             paths: {}
//           };
//         }
//       }
//     );
//     hsm.validate(model);  // Explicit validation call
//   }, hsm.ValidationError);

//   // Valid transition should work
//   const validModel = hsm.define('TestModel',
//     hsm.state('state1',
//       hsm.transition(hsm.on('event'), hsm.target('../state2'))
//     ),
//     hsm.state('state2'),
//     hsm.initial(hsm.target('state1'))
//   );

//   assert.ok(validModel);
// });

// test('Validation - State Rules', async () => {
//   const instance = new TestMachine();

//   // State with initial but no nested states should fail
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('parent'),
//       hsm.initial(hsm.target('nonexistent'))  // Target doesn't exist as nested state
//     );
//   }, hsm.ValidationError);

//   // Valid composite state should work
//   const validModel = hsm.define('TestModel',
//     hsm.state('parent',
//       hsm.state('child1'),
//       hsm.state('child2'),
//       hsm.initial(hsm.target('child1'))
//     ),
//     hsm.initial(hsm.target('parent'))
//   );

//   assert.ok(validModel);
// });

// test('Validation - Model Rules', async () => {
//   const instance = new TestMachine();

//   // Model without initial state should fail
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('state1')
//       // Missing initial
//     );
//   }, hsm.ValidationError);

//   // Model with initial pointing to non-existent state should fail
//   assert.throws(() => {
//     hsm.define('TestModel',
//       hsm.state('state1'),
//       hsm.initial(hsm.target('nonexistent'))
//     );
//   }, hsm.ValidationError);

//   // Model with initial state that has no transitions should fail
//   assert.throws(() => {
//     var model = hsm.define('TestModel',
//       function (model, stack) {
//         // Create initial pseudostate without transitions
//         var initialName = '/TestModel/.initial';
//         var initialObj = {
//           qualifiedName: initialName,
//           kind: hsm.kinds.Initial,
//           transitions: []  // Empty transitions
//         };
//         model.members[initialName] = initialObj;
//         model.initial = initialName;
//       }
//     );
//     hsm.validate(model);  // Explicit validation call
//   }, hsm.ValidationError);

//   // Valid model should work
//   const validModel = hsm.define('TestModel',
//     hsm.state('state1'),
//     hsm.initial(hsm.target('state1'))
//   );

//   assert.ok(validModel);
// });

// test('Validation - Context Rules', async () => {
//   const instance = new TestMachine();

//   // Target outside transition should fail
//   assert.throws(() => {
//     const targetPartial = hsm.target('somewhere');
//     targetPartial({}, [{}]);  // Mock model and stack without transition
//   }, hsm.ValidationError);

//   // On outside transition should fail
//   assert.throws(() => {
//     const onPartial = hsm.on('event');
//     onPartial({}, [{}]);  // Mock model and stack without transition
//   }, hsm.ValidationError);

//   // Effect outside transition should fail
//   assert.throws(() => {
//     const effectPartial = hsm.effect(() => { });
//     effectPartial({}, [{}]);  // Mock model and stack without transition
//   }, hsm.ValidationError);

//   // Entry outside state should fail
//   assert.throws(() => {
//     const entryPartial = hsm.entry(() => { });
//     entryPartial({}, [{}]);  // Mock model and stack without state
//   }, hsm.ValidationError);

//   // Exit outside state should fail
//   assert.throws(() => {
//     const exitPartial = hsm.exit(() => { });
//     exitPartial({}, [{}]);  // Mock model and stack without state
//   }, hsm.ValidationError);

//   // Activity outside state should fail
//   assert.throws(() => {
//     const activityPartial = hsm.activity(() => { });
//     activityPartial({}, [{}]);  // Mock model and stack without state
//   }, hsm.ValidationError);
// });

// test('Validation - Robust Error Messages', async () => {
//   const instance = new TestMachine();

//   // Test that error messages are helpful and specific
//   try {
//     var model = hsm.define('TestModel',
//       hsm.state('state1'),
//       hsm.initial(hsm.target('state1')),
//       // Add a custom partial that modifies the initial transition to have a non-initial event
//       function (model, stack) {
//         var initialVertex = model.members['/TestModel/.initial'];
//         if (initialVertex && initialVertex.transitions && initialVertex.transitions.length > 0) {
//           var initialTransition = model.members[initialVertex.transitions[0]];
//           if (initialTransition) {
//             // Add a non-initial event to the initial transition
//             initialTransition.events.push('trigger');
//           }
//         }
//       }
//     );
//     hsm.validate(model);  // Explicit validation call
//     assert.fail('Should have thrown validation error');
//   } catch (error) {
//     assert.ok(error instanceof hsm.ValidationError);
//     assert.ok(error.message.includes('initial') || error.message.includes('trigger'));
//   }

//   try {
//     hsm.define('TestModel',
//       hsm.state('parent',
//         hsm.final('end',
//           hsm.entry(() => { })
//         )
//       ),
//       hsm.initial(hsm.target('parent'))
//     );
//     assert.fail('Should have thrown validation error');
//   } catch (error) {
//     assert.ok(error instanceof hsm.ValidationError);
//     assert.ok(error.message.includes('final') || error.message.includes('entry'));
//   }

//   try {
//     hsm.define('TestModel',
//       hsm.state('state1'),
//       hsm.initial(hsm.target('nonexistent'))
//     );
//     assert.fail('Should have thrown validation error');
//   } catch (error) {
//     assert.ok(error instanceof hsm.ValidationError);
//     assert.ok(error.message.includes('missing target') || error.message.includes('not found'));
//   }
// });

// test("should validate final state constraints", function () {
//   // Test that final states cannot have transitions
//   assert.throws(function () {
//     hsm.define('InvalidFinalTest',
//       hsm.final('invalid',
//         hsm.transition(hsm.on('event'), hsm.target('../somewhere'))
//       ),
//       hsm.initial(hsm.target('invalid'))
//     );
//   }, hsm.ValidationError);

//   // Test that final states cannot have activities
//   assert.throws(function () {
//     hsm.define('InvalidFinalTest2',
//       hsm.final('invalid',
//         hsm.activity(function () { return Promise.resolve(); })
//       ),
//       hsm.initial(hsm.target('invalid'))
//     );
//   }, hsm.ValidationError);

//   // Test that final states cannot have entry actions
//   assert.throws(function () {
//     hsm.define('InvalidFinalTest3',
//       hsm.final('invalid',
//         hsm.entry(function () { return Promise.resolve(); })
//       ),
//       hsm.initial(hsm.target('invalid'))
//     );
//   }, hsm.ValidationError);

//   // Test that final states cannot have exit actions
//   assert.throws(function () {
//     hsm.define('InvalidFinalTest4',
//       hsm.final('invalid',
//         hsm.exit(function () { return Promise.resolve(); })
//       ),
//       hsm.initial(hsm.target('invalid'))
//     );
//   }, hsm.ValidationError);
// });

// test("should throw ValidationError when no initial state is defined", function () {
//   assert.throws(function () {
//     hsm.define("missing_initial", hsm.state("test"));
//   }, hsm.ValidationError);

//   assert.throws(function () {
//     hsm.define("missing_initial", hsm.state("test"));
//   }, /model must have an initial state/);
// });

// test("should be an instance of ValidationError", function () {
//   assert.throws(function () {
//     hsm.define("invalid", hsm.state("test"));
//   }, hsm.ValidationError);
// });

// test("should throw ValidationError for empty state names", function () {
//   assert.throws(function () {
//     hsm.define("empty_name", hsm.state(""), hsm.initial(""));
//   }, hsm.ValidationError);

//   assert.throws(function () {
//     hsm.define("empty_name", hsm.state(""), hsm.initial(""));
//   }, /state name cannot be empty/);
// });

// test("should throw ValidationError for invalid characters in state names", function () {
//   assert.throws(function () {
//     hsm.define("invalid_slash", hsm.state("parent/child"), hsm.initial("parent/child"));
//   }, hsm.ValidationError);

//   assert.throws(function () {
//     hsm.define("invalid_slash", hsm.state("parent/child"), hsm.initial("parent/child"));
//   }, /cannot contain/);
// });

// test("should throw ValidationError for duplicate state names", function () {
//   assert.throws(function () {
//     hsm.define("duplicates",
//       hsm.state("same"),
//       hsm.state("same"),
//       hsm.initial("same")
//     );
//   }, hsm.ValidationError);

//   assert.throws(function () {
//     hsm.define("duplicates",
//       hsm.state("same"),
//       hsm.state("same"),
//       hsm.initial("same")
//     );
//   }, /already exists/);
// });

// test("should throw ValidationError for missing transition targets", function () {
//   assert.throws(function () {
//     hsm.define("missing_target",
//       hsm.state("a",
//         hsm.transition(hsm.on("go"), hsm.target("nonexistent"))
//       ),
//       hsm.initial(hsm.target("a"))
//     );
//   }, hsm.ValidationError);

//   assert.throws(function () {
//     hsm.define("missing_target",
//       hsm.state("a",
//         hsm.transition(hsm.on("go"), hsm.target("nonexistent"))
//       ),
//       hsm.initial(hsm.target("a"))
//     );
//   }, /missing target/);
// });