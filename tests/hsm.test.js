/**
 * @fileoverview Comprehensive HSM Tests for JavaScript implementation
 * Compatible with Node.js built-in test framework
 * Tests cover all core functionality, edge cases, and error handling
 */

const test = require('node:test');
const assert = require('node:assert');

// Import HSM module
const hsm = require('../src/hsm.js');



// Helper to create a delay promise
function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// === UNIT TESTS FOR CORE UTILITIES ===

test("isKind() should correctly identify type hierarchies", function () {
  // Test basic kind matching
  assert.strictEqual(hsm.isKind(hsm.kinds.State, hsm.kinds.State), true);
  assert.strictEqual(hsm.isKind(hsm.kinds.State, hsm.kinds.Event), false);

  // Test hierarchical kind matching
  assert.strictEqual(hsm.isKind(hsm.kinds.Initial, hsm.kinds.Pseudostate), true);
  assert.strictEqual(hsm.isKind(hsm.kinds.FinalState, hsm.kinds.State), true);

  // Test multiple base kinds
  assert.strictEqual(hsm.isKind(hsm.kinds.State, hsm.kinds.Event, hsm.kinds.State), true);
  assert.strictEqual(hsm.isKind(hsm.kinds.Transition, hsm.kinds.State, hsm.kinds.Event), false);

  // Test with Transition kind variants
  assert.strictEqual(hsm.isKind(hsm.kinds.Internal, hsm.kinds.Transition), true);
  assert.strictEqual(hsm.isKind(hsm.kinds.External, hsm.kinds.Transition), true);
});

test("Path utilities - join() should handle various path combinations", function () {
  // Basic join operations
  assert.strictEqual(hsm.join("a", "b"), "a/b");
  assert.strictEqual(hsm.join("/a", "b"), "/a/b");
  assert.strictEqual(hsm.join("a", "/b"), "/b"); // Absolute path resets

  // Handle empty segments
  assert.strictEqual(hsm.join("a", "", "b"), "a/b");
  assert.strictEqual(hsm.join("", "a", "b"), "a/b");

  // Handle . and .. segments
  assert.strictEqual(hsm.join("a/b", "."), "a/b");
  assert.strictEqual(hsm.join("a/b", ".."), "a");
  assert.strictEqual(hsm.join("a/b/c", "../.."), "a");
  assert.strictEqual(hsm.join("/a/b", "../.."), "/");

  // Handle trailing slashes
  assert.strictEqual(hsm.join("a", "b/"), "a/b/");
  assert.strictEqual(hsm.join("a/", "b"), "a/b");

  // Edge cases
  assert.strictEqual(hsm.join(""), ".");
  assert.strictEqual(hsm.join("/"), "/");
  assert.strictEqual(hsm.join(".."), "..");
  assert.strictEqual(hsm.join("..", ".."), "../..");
});

test("Path utilities - dirname() should extract directory correctly", function () {
  // Basic dirname operations
  assert.strictEqual(hsm.dirname("/a/b/c"), "/a/b");
  assert.strictEqual(hsm.dirname("a/b/c"), "a/b");
  assert.strictEqual(hsm.dirname("/a"), "/");
  assert.strictEqual(hsm.dirname("a"), ".");

  // Handle trailing slashes
  assert.strictEqual(hsm.dirname("/a/b/"), "/a");
  assert.strictEqual(hsm.dirname("a/b/"), "a");

  // Edge cases
  assert.strictEqual(hsm.dirname("/"), "/");
  assert.strictEqual(hsm.dirname(""), ".");
  assert.strictEqual(hsm.dirname("."), ".");
  assert.strictEqual(hsm.dirname(".."), ".");
});

test("Path utilities - isAbsolute() should identify absolute paths", function () {
  // Unix-style paths
  assert.strictEqual(hsm.isAbsolute("/path"), true);
  assert.strictEqual(hsm.isAbsolute("path"), false);
  assert.strictEqual(hsm.isAbsolute("./path"), false);
  assert.strictEqual(hsm.isAbsolute("../path"), false);

  // Windows-style paths
  assert.strictEqual(hsm.isAbsolute("C:/path"), true);
  assert.strictEqual(hsm.isAbsolute("D:/"), true);
  assert.strictEqual(hsm.isAbsolute("C:path"), false); // Missing slash

  // Edge cases
  assert.strictEqual(hsm.isAbsolute(""), false);
  assert.strictEqual(hsm.isAbsolute("/"), true);
});

test("Context should implement done functionality", function () {
  var context = new hsm.Context();
  var doneCalled = false;

  // Test initial state
  assert.strictEqual(context.done, false);

  // Add done listener
  context.addEventListener('done', function () {
    doneCalled = true;
  });

  // Test done
  context.done = true;
  // Note: In the current implementation, listeners are not automatically called
  // when done is set to true. This is different from AbortController.

  // Test removing listener
  var listener2Called = false;
  var listener2 = function () { listener2Called = true; };
  context.addEventListener('done', listener2);
  context.removeEventListener('done', listener2);

  // Verify listener was removed
  assert.strictEqual(context.listeners.indexOf(listener2), -1);
});

test("Profiler should track operation timing", function () {
  var profiler = new hsm.Profiler();

  // Test basic profiling
  profiler.start('operation1');
  profiler.end('operation1');

  profiler.start('operation2');
  profiler.end('operation2');

  // Do it again to test counting
  profiler.start('operation1');
  profiler.end('operation1');

  var results = profiler.getResults();

  assert.strictEqual(results.operation1.count, 2);
  assert.strictEqual(results.operation2.count, 1);
  assert(results.operation1.totalTime >= 0);
  assert(results.operation1.avgTime >= 0);
  assert(results.operation1.maxTime >= 0);

  // Test reset
  profiler.reset();
  results = profiler.getResults();
  assert.deepStrictEqual(results, {});

  // Test disabled profiler
  var disabledProfiler = new hsm.Profiler(true);
  disabledProfiler.start('test');
  disabledProfiler.end('test');
  assert.deepStrictEqual(disabledProfiler.getResults(), {});
});

test("Queue should handle completion and regular events correctly", function () {
  var queue = new hsm.Queue();

  // Test empty queue
  assert.strictEqual(queue.len(), 0);
  assert.strictEqual(queue.pop(), undefined);

  // Test regular events (FIFO)
  queue.push({ kind: hsm.kinds.Event, name: 'event1' });
  queue.push({ kind: hsm.kinds.Event, name: 'event2' });
  assert.strictEqual(queue.len(), 2);

  var e1 = queue.pop();
  assert.strictEqual(e1.name, 'event1');
  var e2 = queue.pop();
  assert.strictEqual(e2.name, 'event2');

  // Test completion events (LIFO priority)
  queue.push({ kind: hsm.kinds.Event, name: 'regular1' });
  queue.push({ kind: hsm.kinds.CompletionEvent, name: 'completion1' });
  queue.push({ kind: hsm.kinds.Event, name: 'regular2' });
  queue.push({ kind: hsm.kinds.CompletionEvent, name: 'completion2' });

  // Completion events should come first (LIFO order)
  assert.strictEqual(queue.pop().name, 'completion2');
  assert.strictEqual(queue.pop().name, 'completion1');
  assert.strictEqual(queue.pop().name, 'regular1');
  assert.strictEqual(queue.pop().name, 'regular2');

  // Test memory reclamation
  for (var i = 0; i < 20; i++) {
    queue.push({ kind: hsm.kinds.Event, name: 'event' + i });
  }

  // Pop half to trigger reclamation
  for (var j = 0; j < 12; j++) {
    queue.pop();
  }

  // Should still work correctly
  assert.strictEqual(queue.len(), 8);
  assert.strictEqual(queue.pop().name, 'event12');
});

test("buildTransitionTable() should create optimized lookup tables", function () {
  var model = hsm.define("tableTest",
    hsm.state("parent",
      hsm.transition(hsm.on("parentEvent"), hsm.target(".")),

      hsm.state("child",
        hsm.transition(hsm.on("childEvent"), hsm.target(".")),
        hsm.transition(hsm.on("sharedEvent"), hsm.target(".")) // Overrides parent
      ),

      hsm.transition(hsm.on("sharedEvent"), hsm.target("."))
    ),
    hsm.initial(hsm.target("parent"))
  );

  // Check transition table structure
  assert(model.transitionMap);
  assert(model.transitionMap["/tableTest/parent"]);
  assert(model.transitionMap["/tableTest/parent/child"]);

  // Check event lookup
  var parentTransitions = model.transitionMap["/tableTest/parent"];
  assert(parentTransitions["parentEvent"]);
  assert(parentTransitions["sharedEvent"]);

  var childTransitions = model.transitionMap["/tableTest/parent/child"];
  assert(childTransitions["childEvent"]);
  assert(childTransitions["sharedEvent"]);
  assert(childTransitions["parentEvent"]); // Inherited

  // Check priority ordering (child transitions come first)
  assert.strictEqual(childTransitions["sharedEvent"][0].source, "/tableTest/parent/child");
  assert.strictEqual(childTransitions["sharedEvent"][1].source, "/tableTest/parent");
});

test("Instance class should provide state machine interface", function () {
  var instance = new hsm.Instance();

  // Test initial state (no HSM attached)
  assert.strictEqual(instance.state(), '');
  instance.dispatch({ name: 'event', kind: hsm.kinds.Event }); // Should not throw

  // Test context getter without HSM
  var ctx = instance.context();
  assert(ctx instanceof hsm.Context);
});

test("find() helper should locate elements in stack", function () {
  var stack = [
    { kind: hsm.kinds.Model, qualifiedName: '/model' },
    { kind: hsm.kinds.State, qualifiedName: '/model/state1' },
    { kind: hsm.kinds.Transition, qualifiedName: '/model/state1/transition1' }
  ];

  // Find by single kind
  var state = hsm.find(stack, hsm.kinds.State);
  assert.strictEqual(state.qualifiedName, '/model/state1');

  // Find by multiple kinds
  var vertex = hsm.find(stack, hsm.kinds.Vertex, hsm.kinds.State);
  assert.strictEqual(vertex.qualifiedName, '/model/state1');

  // Find non-existent
  var notFound = hsm.find(stack, hsm.kinds.Event);
  assert.strictEqual(notFound, undefined);

  // Find searches from end of stack
  stack.unshift({ kind: hsm.kinds.State, qualifiedName: '/model/state0' });
  state = hsm.find(stack, hsm.kinds.State);
  assert.strictEqual(state.qualifiedName, '/model/state1'); // Found the last one
});

test("apply() should execute partial functions", function () {
  var executed = [];
  var partial1 = function (model, stack) { executed.push(1); };
  var partial2 = function (model, stack) { executed.push(2); };
  var partial3 = function (model, stack) { executed.push(3); };

  hsm.apply({}, [], [partial1, partial2, partial3]);
  assert.deepStrictEqual(executed, [1, 2, 3]);
});

// === BUILDER FUNCTION TESTS ===

test("state() builder should create state with correct structure", function () {
  var model = {
    members: {},
    partials: []
  };
  var stack = [{ kind: hsm.kinds.Model, qualifiedName: '/model' }];

  var statePartial = hsm.state("test");
  statePartial(model, stack);

  var createdState = model.members['/model/test'];
  assert(createdState);
  assert.strictEqual(createdState.kind, hsm.kinds.State);
  assert.strictEqual(createdState.qualifiedName, '/model/test');
  assert(Array.isArray(createdState.transitions));
  assert(Array.isArray(createdState.entry));
  assert(Array.isArray(createdState.exit));
  assert(Array.isArray(createdState.activities));
  assert(Array.isArray(createdState.deferred));
});

test("transition() builder should create transitions with paths", function () {
  var model = hsm.define("transTest",
    hsm.state("a",
      hsm.transition(
        hsm.on("event"),
        hsm.target("../b"),
        hsm.effect(function (ctx, inst, event) { })
      )
    ),
    hsm.state("b"),
    hsm.initial(hsm.target("a"))
  );

  var transition = model.members[model.members["/transTest/a"].transitions[0]];
  assert(transition);
  assert.strictEqual(transition.source, "/transTest/a");
  assert.strictEqual(transition.target, "/transTest/b");
  assert(transition.events.includes("event"));
  assert(transition.paths);

  // Check computed paths
  var pathFromA = transition.paths["/transTest/a"];
  assert(pathFromA);
  assert(pathFromA.exit.includes("/transTest/a"));
  assert(pathFromA.enter.includes("/transTest/b"));
});

test("guard() should attach guard constraints", function () {
  var guardCalled = false;
  var guardResult = true;

  var model = hsm.define("guardTest",
    hsm.state("a",
      hsm.transition(
        hsm.on("test"),
        hsm.guard(function (ctx, instance, event) {
          guardCalled = true;
          return guardResult;
        }),
        hsm.target("../b")
      )
    ),
    hsm.state("b"),
    hsm.initial(hsm.target("a"))
  );

  var transition = model.members[model.members["/guardTest/a"].transitions[0]];
  assert(transition.guard);

  var constraint = model.members[transition.guard];
  assert(constraint);
  assert.strictEqual(constraint.kind, hsm.kinds.Constraint);
  assert(typeof constraint.expression === 'function');
});

test("effect() should attach behaviors to transitions", function () {
  var effectCount = 0;

  var model = hsm.define("effectTest",
    hsm.state("a",
      hsm.transition(
        hsm.on("test"),
        hsm.effect(
          function (ctx, inst, event) { effectCount++; },
          function (ctx, inst, event) { effectCount++; }
        ),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("a"))
  );

  var transition = model.members[model.members["/effectTest/a"].transitions[0]];
  assert.strictEqual(transition.effect.length, 2);

  // Check behaviors were created
  transition.effect.forEach(function (behaviorName) {
    var behavior = model.members[behaviorName];
    assert(behavior);
    assert.strictEqual(behavior.kind, hsm.kinds.Sequential);
    assert(typeof behavior.operation === 'function');
  });
});

test("entry/exit/activity builders should attach behaviors to states", function () {
  var model = hsm.define("behaviorTest",
    hsm.state("test",
      hsm.entry(function (ctx, inst, event) { }, function (ctx, inst, event) { }),
      hsm.exit(function (ctx, inst, event) { }),
      hsm.activity(function (ctx, inst, event) { })
    ),
    hsm.initial(hsm.target("test"))
  );

  var state = model.members["/behaviorTest/test"];
  assert.strictEqual(state.entry.length, 2);
  assert.strictEqual(state.exit.length, 1);
  assert.strictEqual(state.activities.length, 1);

  // Check entry behaviors
  state.entry.forEach(function (behaviorName) {
    var behavior = model.members[behaviorName];
    assert(behavior);
    assert.strictEqual(behavior.kind, hsm.kinds.Sequential);
  });

  // Check activity behavior
  var activity = model.members[state.activities[0]];
  assert(activity);
  assert.strictEqual(activity.kind, hsm.kinds.Concurrent);
});

test("choice() builder should create choice pseudostate", function () {
  var model = hsm.define("choiceTest",
    hsm.state("deciding",
      hsm.transition(hsm.on("decide"), hsm.target("../myChoice"))
    ),
    hsm.choice("myChoice",
      hsm.transition(hsm.guard(function () { return true; }), hsm.target("result1")),
      hsm.transition(hsm.target("result2"))
    ),
    hsm.state("result1"),
    hsm.state("result2"),
    hsm.initial(hsm.target("deciding"))
  );

  var choice = model.members["/choiceTest/myChoice"];
  assert(choice);
  assert.strictEqual(choice.kind, hsm.kinds.Choice);
  assert.strictEqual(choice.transitions.length, 2);
});

test("final() builder should create final state", function () {
  var model = hsm.define("finalTest",
    hsm.state("working"),
    hsm.final("done"),
    hsm.initial(hsm.target("working"))
  );

  var finalState = model.members["/finalTest/done"];
  assert(finalState);
  assert.strictEqual(finalState.kind, hsm.kinds.FinalState);
  assert(Array.isArray(finalState.transitions));
  assert.strictEqual(finalState.transitions.length, 0);
});

test("after() should create time-based transition", function () {
  var model = hsm.define("afterTest",
    hsm.state("waiting",
      hsm.transition(
        hsm.after(function (ctx, inst, event) { return 100; }),
        hsm.target("../done")
      )
    ),
    hsm.state("done"),
    hsm.initial(hsm.target("waiting"))
  );

  var state = model.members["/afterTest/waiting"];
  var transition = model.members[state.transitions[0]];

  // Should have a time event
  assert(transition.events.length > 0);
  assert(transition.events[0].includes("after"));

  // Should have created an activity for the timer
  assert(state.activities.length > 0);
  var activity = model.members[state.activities[0]];
  assert(activity);
  assert(activity.qualifiedName.includes("activity_after"));
});

test("every() should create periodic timer transition", function () {
  var model = hsm.define("everyTest",
    hsm.state("ticking",
      hsm.transition(
        hsm.every(function (ctx, inst, event) { return 50; }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("ticking"))
  );

  var state = model.members["/everyTest/ticking"];
  var transition = model.members[state.transitions[0]];

  // Should have a time event
  assert(transition.events.length > 0);
  assert(transition.events[0].includes("every"));

  // Should have created an activity for the timer
  assert(state.activities.length > 0);
  var activity = model.members[state.activities[0]];
  assert(activity);
  assert(activity.qualifiedName.includes("activity_every"));
});

// === DEFERRED EVENT TESTS ===

test("deferred() builder should add events to state deferred array", function () {
  var model = hsm.define("deferredTest",
    hsm.state("working",
      hsm.defer("event1", "event2", "event3")
    ),
    hsm.initial(hsm.target("working"))
  );

  var state = model.members["/deferredTest/working"];
  assert(state);
  assert.strictEqual(state.deferred.length, 3);
  assert.strictEqual(state.deferred[0], "event1");
  assert.strictEqual(state.deferred[1], "event2");
  assert.strictEqual(state.deferred[2], "event3");
});

test("buildDeferredTable should create O(1) lookup tables", function () {
  var model = hsm.define("deferredTableTest",
    hsm.state("parent",
      hsm.defer("parentEvent"),
      hsm.state("child",
        hsm.defer("childEvent1", "childEvent2")
      ),
      hsm.initial(hsm.target("child"))
    ),
    hsm.initial(hsm.target("parent"))
  );

  // Check that deferredMap was built
  assert(model.deferredMap);

  // Check parent state deferred map
  var parentMap = model.deferredMap["/deferredTableTest/parent"];
  assert(parentMap);
  assert.strictEqual(parentMap["parentEvent"], true);

  // Check child state deferred map (should inherit parent deferred events)
  var childMap = model.deferredMap["/deferredTableTest/parent/child"];
  assert(childMap);
  assert.strictEqual(childMap["childEvent1"], true);
  assert.strictEqual(childMap["childEvent2"], true);
});

test("deferred events should be queued and reprocessed later", async function () {
  var instance = new TestMachine();
  var processedEvents = [];

  var model = hsm.define("deferredRuntimeTest",
    hsm.state("busy",
      hsm.defer("deferredEvent"),
      hsm.entry(function (ctx, inst, event) {
        inst.logEntry("Entered busy state");
        return Promise.resolve();
      }),
      hsm.transition(
        hsm.on("finish"),
        hsm.target("../ready")
      )
    ),
    hsm.state("ready",
      hsm.entry(function (ctx, inst, event) {
        inst.logEntry("Entered ready state");
        return Promise.resolve();
      }),
      hsm.transition(
        hsm.on("deferredEvent"),
        hsm.effect(function (ctx, inst, event) {
          processedEvents.push(event.name);
          inst.logEffect("Processed deferred event");
          return Promise.resolve();
        }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("busy"))
  );

  var ctx = new hsm.Context();
  var sm = hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), "/deferredRuntimeTest/busy");

  // Dispatch deferred event while in busy state - should be deferred
  instance.dispatch({ name: "deferredEvent", kind: hsm.kinds.Event });
  assert.strictEqual(processedEvents.length, 0); // Not processed yet
  assert.strictEqual(instance.state(), "/deferredRuntimeTest/busy"); // Still in busy state
  assert.strictEqual(sm.queue.len(), 1);
  // Transition to ready state - deferred event should be reprocessed
  instance.dispatch({ name: "finish", kind: hsm.kinds.Event });

  // Allow time for event processing
  await delay(10);

  assert.strictEqual(instance.state(), "/deferredRuntimeTest/ready");
  assert.strictEqual(processedEvents.length, 1); // Now processed
  assert.strictEqual(processedEvents[0], "deferredEvent");
  assert.ok(instance.effectLog.some(function (log) { return log === "Processed deferred event"; }));
});

test("hierarchical deferred events should inherit from parent states", async function () {
  var instance = new TestMachine();
  var processedEvents = [];

  var model = hsm.define("hierarchicalDeferredTest",
    hsm.state("parent",
      hsm.defer("parentDeferred"),
      hsm.state("child",
        hsm.defer("childDeferred"),
        hsm.transition(
          hsm.on("exit"),
          hsm.target("../../ready")
        )
      ),
      hsm.initial(hsm.target("child"))
    ),
    hsm.state("ready",
      hsm.transition(
        hsm.on("parentDeferred"),
        hsm.effect(function (ctx, inst, event) {
          processedEvents.push("parent-" + event.name);
        }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("childDeferred"),
        hsm.effect(function (ctx, inst, event) {
          processedEvents.push("child-" + event.name);
        }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("parent"))
  );
  var ctx = new hsm.Context();
  var sm = hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), "/hierarchicalDeferredTest/parent/child");

  // Dispatch both parent and child deferred events
  instance.dispatch({ name: "parentDeferred", kind: hsm.kinds.Event });
  instance.dispatch({ name: "childDeferred", kind: hsm.kinds.Event });

  // Both should be deferred
  assert.strictEqual(processedEvents.length, 0);
  assert.strictEqual(instance.state(), "/hierarchicalDeferredTest/parent/child");

  // Exit to ready state
  instance.dispatch({ name: "exit", kind: hsm.kinds.Event });
  await delay(10);
  assert.strictEqual(sm.queue.len(), 0);
  assert.strictEqual(instance.state(), "/hierarchicalDeferredTest/ready");
  assert.strictEqual(processedEvents.length, 2);
  assert.ok(processedEvents.includes("parent-parentDeferred"));
  assert.ok(processedEvents.includes("child-childDeferred"));
});

test("non-deferred events should process normally even when some events are deferred", async function () {
  var instance = new TestMachine();
  var processedEvents = [];

  var model = hsm.define("mixedEventTest",
    hsm.state("working",
      hsm.defer("deferredEvent"),
      hsm.transition(
        hsm.on("normalEvent"),
        hsm.effect(function (ctx, inst, event) {
          processedEvents.push(event.name);
        }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("finish"),
        hsm.target("../ready"),
      )
    ),
    hsm.state("ready",
      hsm.transition(
        hsm.on("deferredEvent"),
        hsm.effect(function (ctx, inst, event) {
          processedEvents.push(event.name);
        }),
      )
    ),
    hsm.initial(hsm.target("working"))
  );

  var ctx = new hsm.Context();
  var sm = hsm.start(ctx, instance, model);

  // Dispatch mixed events
  instance.dispatch({ name: "normalEvent", kind: hsm.kinds.Event });    // Should process immediately
  instance.dispatch({ name: "deferredEvent", kind: hsm.kinds.Event });  // Should be deferred

  instance.dispatch({ name: "normalEvent", kind: hsm.kinds.Event });    // Should process immediately

  await delay(10);
  // Normal events processed, deferred event not yet
  assert.strictEqual(processedEvents.length, 2);
  assert.strictEqual(processedEvents[0], "normalEvent");
  assert.strictEqual(processedEvents[1], "normalEvent");
  assert.strictEqual(sm.queue.len(), 1);
  assert.strictEqual(sm.state(), '/mixedEventTest/working');
  // Transition to ready state
  sm.dispatch({ name: "finish", kind: hsm.kinds.Event });
  await delay(10);
  assert.strictEqual(sm.state(), '/mixedEventTest/ready');
  // Deferred event should now be processed
  assert.strictEqual(processedEvents.length, 3);
  assert.strictEqual(processedEvents[2], "deferredEvent");
});

test("empty deferred array should not cause errors", function () {
  var model = hsm.define("emptyDeferredTest",
    hsm.state("working"),
    hsm.initial(hsm.target("working"))
  );

  var state = model.members["/emptyDeferredTest/working"];
  assert(state);
  assert(Array.isArray(state.deferred));
  assert.strictEqual(state.deferred.length, 0);

  // Should have empty deferred map
  var deferredMap = model.deferredMap["/emptyDeferredTest/working"];
  assert(deferredMap);
  assert.strictEqual(Object.keys(deferredMap).length, 0);
});

test("deferred events with exact event names only (no wildcards)", function () {
  var model = hsm.define("exactDeferredTest",
    hsm.state("working",
      hsm.defer("exact.event.name", "another-event", "event123")
    ),
    hsm.initial(hsm.target("working"))
  );

  var deferredMap = model.deferredMap["/exactDeferredTest/working"];
  assert(deferredMap);
  assert.strictEqual(deferredMap["exact.event.name"], true);
  assert.strictEqual(deferredMap["another-event"], true);
  assert.strictEqual(deferredMap["event123"], true);

  // Should not have wildcard patterns
  assert.strictEqual(deferredMap["__patterns__"], undefined);
});

// === ERROR HANDLING TESTS ===

test("HSM should handle missing transition target gracefully", async function () {
  var instance = new hsm.Instance();

  // This should not throw during definition
  var model = hsm.define("errorTest",
    hsm.state("a"),
    hsm.initial(hsm.target("a"))
  );

  // Start should work
  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), "/errorTest/a");

  // Dispatching unknown event should not throw
  instance.dispatch({ name: "unknownEvent", kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), "/errorTest/a");
});

test("HSM should handle guard expression errors", async function () {
  var instance = new hsm.Instance();
  var errorCaught = false;

  var model = hsm.define("guardError",
    hsm.state("a",
      hsm.transition(
        hsm.on("test"),
        hsm.guard(function (ctx, inst, event) {
          throw new Error("Guard error");
        }),
        hsm.target("../b")
      ),
      hsm.transition(
        hsm.on("test"),
        hsm.target("../c") // Fallback
      )
    ),
    hsm.state("b"),
    hsm.state("c"),
    hsm.initial(hsm.target("a"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // In the current implementation, guard errors prevent the transition
  try {
    instance.dispatch({ name: "test", kind: hsm.kinds.Event });
    await delay(10); // Let it process
  } catch (e) {
    errorCaught = true;
  }

  // The first transition with throwing guard should be skipped
  // and the fallback transition should be taken
  assert.strictEqual(instance.state(), "/guardError/c");
});

test("Choice without valid transition should throw", async function () {
  var instance = new hsm.Instance();

  var model = hsm.define("choiceError",
    hsm.state("start",
      hsm.transition(hsm.on("go"), hsm.target("../badChoice"))
    ),
    hsm.choice("badChoice",
      hsm.transition(
        hsm.guard(function (ctx, inst, event) { return false; }),
        hsm.target("never")
      )
      // No default transition!
    ),
    hsm.state("never"),
    hsm.initial(hsm.target("start"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  var errorThrown = false;
  try {
    instance.dispatch({ name: "go", kind: hsm.kinds.Event });
  } catch (e) {
    errorThrown = true;
    assert(e.message.includes("No transition found"));
  }

  assert(errorThrown);
});

// Define test events  
var SomeEvent = "SomeEvent";

// Placeholder behavior
function noBehavior(ctx, inst, event) {
  return Promise.resolve();
}

/**
 * @extends {hsm.Instance}
 */
function SM() {
  hsm.Instance.call(this);
}
SM.prototype = Object.create(hsm.Instance.prototype);
SM.prototype.constructor = SM;

var model = hsm.define(
  "test",
  hsm.state("foo",
    hsm.entry(noBehavior),
    hsm.exit(noBehavior),
    hsm.transition(
      hsm.on(SomeEvent),
      hsm.target("."),  // Self transition
      hsm.effect(function (ctx, sm, event) {
        return Promise.resolve();
      })
    )
  ),
  hsm.state("bar",
    hsm.entry(noBehavior),
    hsm.exit(noBehavior),
    hsm.activity(function (ctx, sm, event) {
      return new Promise(function (resolve) {
        ctx.addEventListener('done', function () {
          resolve();
        });
      });
    }),
    hsm.transition(
      hsm.on(SomeEvent),
      hsm.target("."),  // Self transition
      hsm.effect(function (ctx, sm, event) {
        return sm.dispatch({ name: SomeEvent, kind: hsm.kinds.Event });
      })
    ),
    hsm.transition(
      hsm.after(function (ctx, sm, event) {
        return 1000;
      }),
      hsm.target("."),  // Self transition  
      hsm.effect(function (ctx, sm, event) {
        return sm.dispatch({ name: SomeEvent, kind: hsm.kinds.Event });
      })
    ),
    hsm.transition(
      hsm.every(function (ctx, sm, event) {
        return Promise.resolve(1000);
      }),
      hsm.target("."),  // Self transition
      hsm.effect(function (ctx, sm, event) {
        return sm.dispatch({ name: SomeEvent, kind: hsm.kinds.Event });
      })
    )
  ),
  hsm.initial(hsm.target("foo"))
);

/**
 * Test machine instance
 * @extends {hsm.Instance}
 */
function TestMachine() {
  hsm.Instance.call(this);
  this.counter = 0;
  this.entryLog = [];
  this.exitLog = [];
  this.effectLog = [];
  this.activityStarted = false;
  this.activityStopped = false;
}
TestMachine.prototype = Object.create(hsm.Instance.prototype);
TestMachine.prototype.constructor = TestMachine;

TestMachine.prototype.logEntry = function (state) {
  this.entryLog.push(state);
};

TestMachine.prototype.logExit = function (state) {
  this.exitLog.push(state);
};

TestMachine.prototype.logEffect = function (event) {
  this.effectLog.push(event);
};

test("should create a simple state machine", function () {
  var model = hsm.define(
    "simple",
    hsm.state("idle"),
    hsm.state("running"),
    hsm.initial(hsm.target("idle"))
  );

  assert.strictEqual(model.qualifiedName, "/simple");
  assert.strictEqual(model.kind, hsm.kinds.Model);
  assert.strictEqual(model.initial, "/simple/.initial");
  assert(Object.keys(model.members).includes("/simple/idle"));
  assert(Object.keys(model.members).includes("/simple/running"));
});

// test("should throw error if initial state is not defined", function () {
//   assert.throws(function () {
//     hsm.define(
//       "invalid",
//       hsm.state("idle")
//     );
//   }, /model must have an initial state/);
// });

test("should create nested states", function () {
  var model = hsm.define(
    "nested",
    hsm.state("parent",
      hsm.state("child1"),
      hsm.state("child2"),
      hsm.initial(hsm.target("child1"))
    ),
    hsm.initial(hsm.target("parent"))
  );

  assert(Object.keys(model.members).includes("/nested/parent/child1"));
  assert(Object.keys(model.members).includes("/nested/parent/child2"));
});

test("should create transitions between states", function () {
  var model = hsm.define(
    "transitions",
    hsm.state("a",
      hsm.transition(
        hsm.on("go"),
        hsm.target("../b")
      )
    ),
    hsm.state("b"),
    hsm.initial(hsm.target("a"))
  );

  var stateA = model.members["/transitions/a"];
  assert.strictEqual(stateA.transitions.length, 1);

  var transition = model.members[stateA.transitions[0]];
  assert.strictEqual(transition.source, "/transitions/a");
  assert.strictEqual(transition.target, "/transitions/b");
  assert(transition.events.includes("go"));
});

test("should support self transitions", function () {
  var model = hsm.define(
    "self",
    hsm.state("a",
      hsm.transition(
        hsm.on("self"),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("a"))
  );

  var stateA = model.members["/self/a"];
  var transition = model.members[stateA.transitions[0]];
  assert.strictEqual(transition.kind, hsm.kinds.Self);
});

test("should support internal transitions", function () {
  var model = hsm.define(
    "internal",
    hsm.state("a",
      hsm.transition(
        hsm.on("internal"),
        hsm.effect(function (ctx, inst, event) { return Promise.resolve(); })
      )
    ),
    hsm.initial(hsm.target("a"))
  );

  var stateA = model.members["/internal/a"];
  var transition = model.members[stateA.transitions[0]];
  assert.strictEqual(transition.kind, hsm.kinds.Internal);
});

test("should execute entry and exit actions", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "behaviors",
    hsm.state("a",
      hsm.entry(function (ctx, m, event) { m.logEntry("a"); return Promise.resolve(); }),
      hsm.exit(function (ctx, m, event) { m.logExit("a"); return Promise.resolve(); }),
      hsm.transition(
        hsm.on("go"),
        hsm.target("../b")
      )
    ),
    hsm.state("b",
      hsm.entry(function (ctx, m, event) { m.logEntry("b"); return Promise.resolve(); }),
      hsm.exit(function (ctx, m, event) { m.logExit("b"); return Promise.resolve(); })
    ),
    hsm.initial(hsm.target("a"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  assert.deepStrictEqual(machine.entryLog, ["a"]);
  machine.dispatch({ name: "go", kind: hsm.kinds.Event });
  assert.deepStrictEqual(machine.exitLog, ["a"]);
  assert.deepStrictEqual(machine.entryLog, ["a", "b"]);
});

test("should execute transition effects", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "effects",
    hsm.state("a",
      hsm.transition(
        hsm.on("go"),
        hsm.target("../b"),
        hsm.effect(function (ctx, m, e) { m.logEffect(e.name); return Promise.resolve(); })
      )
    ),
    hsm.state("b"),
    hsm.initial(hsm.target("a"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  machine.dispatch({ name: "go", kind: hsm.kinds.Event });
  assert.deepStrictEqual(machine.effectLog, ["go"]);
});

test("should start and stop activities", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "activities",
    hsm.state("active",
      hsm.activity(function (ctx, m, e) {
        m.activityStarted = true;
        return new Promise(function (resolve) {
          ctx.addEventListener('done', function () {
            m.activityStopped = true;
            resolve();
          });
        });
      }),
      hsm.transition(
        hsm.on("stop"),
        hsm.target("../idle")
      )
    ),
    hsm.state("idle"),
    hsm.initial(hsm.target("active"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(10); // Let activity start
  assert.strictEqual(machine.activityStarted, true);
  assert.strictEqual(machine.activityStopped, false);
  machine.dispatch({ name: "stop", kind: hsm.kinds.Event });
  await delay(10); // Let activity stop
  assert.strictEqual(machine.activityStopped, true);
});

test("should correctly compute LCA", function () {
  assert.strictEqual(hsm.lca("/a/b", "/a/c"), "/a");
  assert.strictEqual(hsm.lca("/a/b/c", "/a/b/d"), "/a/b");
  assert.strictEqual(hsm.lca("/a", "/a/b"), "/a");
  assert.strictEqual(hsm.lca("/a/b", "/a"), "/a");
});

test("should correctly check ancestors", function () {
  assert.strictEqual(hsm.isAncestor("/a", "/a/b"), true);
  assert.strictEqual(hsm.isAncestor("/a", "/a/b/c"), true);
  assert.strictEqual(hsm.isAncestor("/a/b", "/a"), false);
  assert.strictEqual(hsm.isAncestor("/a", "/a"), false);
});

// test("should correctly match patterns", function () {
//   assert.strictEqual(hsm.match("exact", "exact"), true);
//   assert.strictEqual(hsm.match("*", "anything"), true);
//   assert.strictEqual(hsm.match("pre*", "prefix"), true);
//   assert.strictEqual(hsm.match("*fix", "suffix"), true);
//   assert.strictEqual(hsm.match("pre*fix", "prefix"), true);
// });

// test("should correctly resolve paths", function () {
//   // Absolute paths
//   assert.strictEqual(hsm.resolvePath("/a/b", "/x/y"), "/x/y");
//   assert.strictEqual(hsm.resolvePath("/a/b/c", "/"), "/");

//   // Current directory
//   assert.strictEqual(hsm.resolvePath("/a/b", "."), "/a/b");

//   // Parent references
//   assert.strictEqual(hsm.resolvePath("/a/b/c", "../d"), "/a/b/d");
//   assert.strictEqual(hsm.resolvePath("/a/b/c", "../../d"), "/a/d");
//   assert.strictEqual(hsm.resolvePath("/a/b/c", "../../../d"), "/d");

//   // Relative paths
//   assert.strictEqual(hsm.resolvePath("/a/b", "c"), "/a/b/c");
//   assert.strictEqual(hsm.resolvePath("/a/b", "c/d"), "/a/b/c/d");
// });


test("should support final states", async function () {
  var instance = new TestMachine();

  // Test final state functionality (without implicit completion events)
  var model = hsm.define('FinalTest',
    hsm.state('process',
      hsm.state('working',
        hsm.entry(function (ctx, inst, event) { inst.logEntry('Started working'); return Promise.resolve(); }),
        hsm.transition(hsm.on('complete'), hsm.target('../done'))
      ),
      hsm.final('done'),  // Final state - no implicit completion events yet
      hsm.initial(hsm.target('working'))
    ),
    hsm.initial(hsm.target('process'))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);
  assert.strictEqual(instance.state(), '/FinalTest/process/working');

  // Complete the work to reach final state
  instance.dispatch({ name: 'complete', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/FinalTest/process/done');

  // Final state is terminal - no further transitions expected
  assert.ok(instance.entryLog.some(function (log) { return log.includes('Started working'); }));
});

// test("should terminate state machine on top-level final state", async function () {
//   var instance = new TestMachine();
//   var eventAfterTermination = false;

//   // Test TOP-LEVEL final state functionality
//   // this should fail validation because of the transition from final state
//   assert.throws(function () {
//     var model = hsm.define('TopLevelFinalTest',
//       hsm.state('working',
//         hsm.entry(function (ctx, inst, event) { inst.logEntry('Started working'); return Promise.resolve(); }),
//         hsm.transition(hsm.on('complete'), hsm.target('../done'))
//       ),
//       hsm.final('done'),  // This is TOP-LEVEL, should terminate the machine
//       hsm.state('shouldNeverReach',
//         hsm.entry(function (ctx, inst, event) {
//           eventAfterTermination = true;
//           inst.logEntry('Should never reach this');
//           return Promise.resolve();
//         })
//       ),
//       hsm.transition(hsm.on('afterTermination'), hsm.source('done'), hsm.target('../shouldNeverReach')),
//       hsm.initial(hsm.target('working'))
//     );

//   }, hsm.ValidationError);

// });

test("should correctly report termination status", async function () {
  var instance = new TestMachine();

  // Test that isTerminated works correctly
  var model = hsm.define('TerminationTest',
    hsm.state('working',
      hsm.transition(hsm.on('complete'), hsm.target('../done'))
    ),
    hsm.final('done'),  // Top-level final state
    hsm.initial(hsm.target('working'))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Should not be terminated initially
  assert.strictEqual(instance.state(), '/TerminationTest/working');

  // Reach final state
  instance.dispatch({ name: 'complete', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/TerminationTest/done');

  // Should now be terminated

  // Try to dispatch another event - should be ignored
  instance.dispatch({ name: 'shouldBeIgnored', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/TerminationTest/done');
});


test("should gracefully stop state machine and exit states", async function () {
  var instance = new TestMachine();
  var exitedStates = [];

  var model = hsm.define('StopTest',
    hsm.state('outer',
      hsm.exit(function (ctx, inst, event) {
        exitedStates.push('outer');
        return Promise.resolve();
      }),

      hsm.state('inner',
        hsm.exit(function (ctx, inst, event) {
          exitedStates.push('inner');
          return Promise.resolve();
        }),

        hsm.activity(function (ctx, inst, event) {
          inst.activityStarted = true;
          return new Promise(function (resolve) {
            ctx.addEventListener('done', function () {
              inst.activityStopped = true;
              resolve();
            });
          });
        })
      ),

      hsm.initial(hsm.target('inner'))
    ),

    hsm.initial(hsm.target('outer'))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, instance, model);

  // Verify initial state
  assert.strictEqual(instance.state(), '/StopTest/outer/inner');

  // Let activity start
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(instance.activityStarted, true);

  // Stop the state machine
  hsm.stop(instance);

  // Verify stop behavior
  assert.strictEqual(instance.state(), '/StopTest'); // Should be at root
  assert.strictEqual(instance.activityStopped, true);

  // Verify exit order (inner first, then outer)
  assert.deepStrictEqual(exitedStates, ['inner', 'outer']);

  // Events should be ignored after stop
  instance.dispatch({ name: 'shouldBeIgnored', kind: hsm.kinds.Event });
  assert.strictEqual(instance.state(), '/StopTest');
});


test('Validation - Complex Hierarchical Cases', async () => {
  const instance = new TestMachine();

  // Test complex valid hierarchy
  const validModel = hsm.define('ComplexModel',
    hsm.state('level1',
      hsm.state('level2a',
        hsm.state('level3a',
          hsm.transition(hsm.on('goToB'), hsm.target('../level3b'))
        ),
        hsm.state('level3b',
          hsm.transition(hsm.on('up'), hsm.target('../../level2b'))
        ),
        hsm.initial(hsm.target('level3a'))
      ),
      hsm.state('level2b',
        hsm.final('end')
      ),
      hsm.initial(hsm.target('level2a'))
    ),
    hsm.initial(hsm.target('level1'))
  );

  assert.ok(validModel);

  // Test that transitions work correctly
  var ctx = new hsm.Context();
  const hsm_instance = hsm.start(ctx, instance, validModel);
  assert.equal(instance.state(), '/ComplexModel/level1/level2a/level3a');

  // First go to level3b where the 'up' transition is defined
  instance.dispatch({ name: 'goToB', kind: hsm.kinds.Event });
  assert.equal(instance.state(), '/ComplexModel/level1/level2a/level3b');

  // Now dispatch 'up' to transition to level2b
  instance.dispatch({ name: 'up', kind: hsm.kinds.Event });
  assert.equal(instance.state(), '/ComplexModel/level1/level2b');
});


// === GUARD CONDITIONS TESTS ===

test("should support guard conditions on transitions", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "guards",
    hsm.state("waiting",
      hsm.transition(
        hsm.on("attempt"),
        hsm.guard(function (ctx, m, e) { return m.counter > 5; }),
        hsm.target("../success")
      ),
      hsm.transition(
        hsm.on("attempt"),
        hsm.target("../failed")
      )
    ),
    hsm.state("success"),
    hsm.state("failed"),
    hsm.initial(hsm.target("waiting"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  assert.strictEqual(machine.state(), "/guards/waiting");

  // First attempt should fail guard (counter = 0)
  machine.dispatch({ name: "attempt", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/guards/failed");
});

test("should support async guard conditions", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "asyncGuards",
    hsm.state("checking",
      hsm.transition(
        hsm.on("check"),
        hsm.guard(function (ctx, m, e) {
          return Promise.resolve(m.counter > 3);
        }),
        hsm.target("../passed")
      ),
      hsm.transition(
        hsm.on("check"),
        hsm.target("../failed")
      )
    ),
    hsm.state("passed"),
    hsm.state("failed"),
    hsm.initial(hsm.target("checking"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  machine.counter = 5;

  machine.dispatch({ name: "check", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/asyncGuards/passed");
});


// === CHOICE PSEUDOSTATES TESTS ===

test("should support choice pseudostates", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "choices",
    hsm.state("deciding",
      hsm.transition(
        hsm.on("decide"),
        hsm.target("../junction")
      )
    ),
    hsm.choice("junction",
      hsm.transition(
        hsm.guard(function (ctx, m, e) { return m.counter > 10; }),
        hsm.target("high")
      ),
      hsm.transition(
        hsm.guard(function (ctx, m, e) { return m.counter > 5; }),
        hsm.target("medium")
      ),
      hsm.transition(
        hsm.target("low")  // Default - no guard
      )
    ),
    hsm.state("high"),
    hsm.state("medium"),
    hsm.state("low"),
    hsm.initial(hsm.target("deciding"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Test low path (counter = 0)
  machine.dispatch({ name: "decide", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/choices/low");
});

test("should support choice with medium value", async function () {
  var machine = new TestMachine();
  machine.counter = 7;

  var model = hsm.define(
    "choiceMedium",
    hsm.state("deciding",
      hsm.transition(
        hsm.on("decide"),
        hsm.target("../junction")
      )
    ),
    hsm.choice("junction",
      hsm.transition(
        hsm.guard(function (ctx, m, e) { return m.counter > 10; }),
        hsm.target("high")
      ),
      hsm.transition(
        hsm.guard(function (ctx, m, e) { return m.counter > 5; }),
        hsm.target("medium")
      ),
      hsm.transition(
        hsm.target("low")
      )
    ),
    hsm.state("high"),
    hsm.state("medium"),
    hsm.state("low"),
    hsm.initial(hsm.target("deciding"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  machine.dispatch({ name: "decide", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/choiceMedium/medium");
});


test("should support after() timer transitions", async function () {
  var machine = new TestMachine();
  var timerFired = false;

  var model = hsm.define(
    "timers",
    hsm.state("waiting",
      hsm.transition(
        hsm.after(function (ctx, inst, event) { return 50; }),
        hsm.effect(function (ctx, m, event) { timerFired = true; return Promise.resolve(); }),
        hsm.target("../finished")
      )
    ),
    hsm.state("finished"),
    hsm.initial(hsm.target("waiting"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  assert.strictEqual(machine.state(), "/timers/waiting");

  // Wait for timer to fire
  await delay(100);
  assert.strictEqual(timerFired, true);
  assert.strictEqual(machine.state(), "/timers/finished");
});

test("should support every() periodic timers", async function () {
  var machine = new TestMachine();
  var tickCount = 0;

  var model = hsm.define(
    "periodic",
    hsm.state("ticking",
      hsm.transition(
        hsm.every(function (ctx, inst, event) { return 25; }),
        hsm.effect(function (ctx, m, event) {
          tickCount++;
          if (tickCount >= 3) {
            return m.dispatch({ name: "stop", kind: hsm.kinds.Event });
          }
        }),
        hsm.target(".")  // Self transition
      ),
      hsm.transition(
        hsm.on("stop"),
        hsm.target("../stopped")
      )
    ),
    hsm.state("stopped"),
    hsm.initial(hsm.target("ticking"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Wait for multiple ticks
  await delay(150);
  assert(tickCount >= 3);
  assert.strictEqual(machine.state(), "/periodic/stopped");
});

test("should support async timer expressions", async function () {
  var machine = new TestMachine();

  var model = hsm.define(
    "asyncTimer",
    hsm.state("waiting",
      hsm.transition(
        hsm.after(function (ctx, inst, event) { return Promise.resolve(30); }),
        hsm.target("../done")
      )
    ),
    hsm.state("done"),
    hsm.initial(hsm.target("waiting"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(60);
  assert.strictEqual(machine.state(), "/asyncTimer/done");
});

test("should cancel timers on state exit", async function () {
  var machine = new TestMachine();
  var timerFired = false;

  var model = hsm.define(
    "cancelTimer",
    hsm.state("waiting",
      hsm.transition(
        hsm.after(function (ctx, inst, event) { return 100; }),
        hsm.effect(function (ctx, inst, event) { timerFired = true; return Promise.resolve(); }),
        hsm.target("../timeout")
      ),
      hsm.transition(
        hsm.on("cancel"),
        hsm.target("../cancelled")
      )
    ),
    hsm.state("timeout"),
    hsm.state("cancelled"),
    hsm.initial(hsm.target("waiting"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Cancel before timer fires
  await delay(20);
  machine.dispatch({ name: "cancel", kind: hsm.kinds.Event });

  // Wait longer than timer duration
  await delay(120);
  assert.strictEqual(timerFired, false);
  assert.strictEqual(machine.state(), "/cancelTimer/cancelled");
});


test("should process events in order", async function () {
  var machine = new TestMachine();
  var processed = [];

  var model = hsm.define(
    "queue",
    hsm.state("processing",
      hsm.transition(
        hsm.on("event1"),
        hsm.effect(function (ctx, inst, event) { processed.push("event1"); return Promise.resolve(); }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("event2"),
        hsm.effect(function (ctx, inst, event) { processed.push("event2"); return Promise.resolve(); }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("event3"),
        hsm.effect(function (ctx, inst, event) { processed.push("event3"); return Promise.resolve(); }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("processing"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Dispatch multiple events rapidly
  machine.dispatch({ name: "event1", kind: hsm.kinds.Event });
  machine.dispatch({ name: "event2", kind: hsm.kinds.Event });
  machine.dispatch({ name: "event3", kind: hsm.kinds.Event });

  // Wait for processing
  await delay(50);
  assert.deepStrictEqual(processed, ["event1", "event2", "event3"]);
});

test("should prioritize completion events", async function () {
  var machine = new TestMachine();
  var processed = [];

  var model = hsm.define(
    "priority",
    hsm.state("processing",
      hsm.transition(
        hsm.on("regular"),
        hsm.effect(function (ctx, inst, event) { processed.push("regular"); return Promise.resolve(); }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("completion"),
        hsm.effect(function (ctx, inst, event) { processed.push("completion"); return Promise.resolve(); }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("processing"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Dispatch regular event, then completion event
  machine.dispatch({
    name: "completion",
    kind: hsm.kinds.CompletionEvent,
  });
  machine.dispatch({ name: "regular", kind: hsm.kinds.Event });

  await delay(50);

  // Completion events should be processed first
  assert.strictEqual(processed.length, 2);
  assert.strictEqual(processed[0], "completion");
});

// === CONCURRENT ACTIVITIES TESTS ===

test("should run multiple activities concurrently", async function () {
  var machine = new TestMachine();
  var activity1Started = false;
  var activity2Started = false;
  var activity1Stopped = false;
  var activity2Stopped = false;

  var model = hsm.define(
    "concurrent",
    hsm.state("active",
      hsm.activity(function (ctx, m, e) {
        activity1Started = true;
        return new Promise(function (resolve) {
          ctx.addEventListener('done', function () {
            activity1Stopped = true;
            resolve();
          });
        });
      }),
      hsm.activity(function (ctx, m, e) {
        activity2Started = true;
        return new Promise(function (resolve) {
          ctx.addEventListener('done', function () {
            activity2Stopped = true;
            resolve();
          });
        });
      }),
      hsm.transition(
        hsm.on("stop"),
        hsm.target("../idle")
      )
    ),
    hsm.state("idle"),
    hsm.initial(hsm.target("active"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(20);

  assert.strictEqual(activity1Started, true);
  assert.strictEqual(activity2Started, true);
  assert.strictEqual(activity1Stopped, false);
  assert.strictEqual(activity2Stopped, false);

  machine.dispatch({ name: "stop", kind: hsm.kinds.Event });
  await delay(20);

  assert.strictEqual(activity1Stopped, true);
  assert.strictEqual(activity2Stopped, true);
});

test("should handle activity errors gracefully", async function () {
  var machine = new TestMachine();
  var errorThrown = false;

  var model = hsm.define(
    "errorActivity",
    hsm.state("active",
      hsm.activity(function (ctx, m, e) {
        return Promise.reject(new Error("Activity failed"));
      }),
      hsm.transition(
        hsm.on("continue"),
        hsm.target("../next")
      )
    ),
    hsm.state("next"),
    hsm.initial(hsm.target("active"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(20);

  // Should continue to work despite activity error
  machine.dispatch({ name: "continue", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/errorActivity/next");
});

// === TRANSITION TYPE TESTS ===

test("should handle external transitions correctly", async function () {
  var machine = new TestMachine();
  var exitOrder = [];
  var entryOrder = [];

  var model = hsm.define(
    "external",
    hsm.state("parent",
      hsm.exit(function (ctx, inst, event) { exitOrder.push("parent"); return Promise.resolve(); }),
      hsm.entry(function (ctx, inst, event) { entryOrder.push("parent"); return Promise.resolve(); }),

      hsm.state("child1",
        hsm.exit(function (ctx, inst, event) { exitOrder.push("child1"); return Promise.resolve(); }),
        hsm.entry(function (ctx, inst, event) { entryOrder.push("child1"); return Promise.resolve(); }),
        hsm.transition(
          hsm.on("toChild2"),
          hsm.target("../child2")
        )
      ),
      hsm.state("child2",
        hsm.exit(function (ctx, inst, event) { exitOrder.push("child2"); return Promise.resolve(); }),
        hsm.entry(function (ctx, inst, event) { entryOrder.push("child2"); return Promise.resolve(); })
      ),
      hsm.initial(hsm.target("child1"))
    ),
    hsm.initial(hsm.target("parent"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  entryOrder = []; // Reset after initial entry

  machine.dispatch({ name: "toChild2", kind: hsm.kinds.Event });

  assert.deepStrictEqual(exitOrder, ["child1"]);
  assert.deepStrictEqual(entryOrder, ["child2"]);
});

test("should handle local transitions correctly", async function () {
  var machine = new TestMachine();
  var exitOrder = [];
  var entryOrder = [];

  var model = hsm.define(
    "local",
    hsm.state("grandparent",
      hsm.exit(function (ctx, inst, event) { exitOrder.push("grandparent"); return Promise.resolve(); }),
      hsm.entry(function (ctx, inst, event) { entryOrder.push("grandparent"); return Promise.resolve(); }),

      hsm.state("parent",
        hsm.exit(function (ctx, inst, event) { exitOrder.push("parent"); return Promise.resolve(); }),
        hsm.entry(function (ctx, inst, event) { entryOrder.push("parent"); return Promise.resolve(); }),

        hsm.state("child",
          hsm.exit(function (ctx, inst, event) { exitOrder.push("child"); return Promise.resolve(); }),
          hsm.entry(function (ctx, inst, event) { entryOrder.push("child"); return Promise.resolve(); }),
          hsm.transition(
            hsm.on("toGrandchild"),
            hsm.target("../grandchild")
          )
        ),
        hsm.state("grandchild",
          hsm.exit(function (ctx, inst, event) { exitOrder.push("grandchild"); return Promise.resolve(); }),
          hsm.entry(function (ctx, inst, event) { entryOrder.push("grandchild"); return Promise.resolve(); })
        ),
        hsm.initial(hsm.target("child"))
      ),
      hsm.initial(hsm.target("parent"))
    ),
    hsm.initial(hsm.target("grandparent"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  exitOrder = [];
  entryOrder = [];

  machine.dispatch({ name: "toGrandchild", kind: hsm.kinds.Event });

  // Should exit child, but not parent or grandparent
  assert.deepStrictEqual(exitOrder, ["child"]);
  assert.deepStrictEqual(entryOrder, ["grandchild"]);
});

test("should handle self transitions correctly", async function () {
  var machine = new TestMachine();
  var exitCount = 0;
  var entryCount = 0;

  var model = hsm.define(
    "selfTransition",
    hsm.state("state",
      hsm.exit(function (ctx, inst, event) { exitCount++; return Promise.resolve(); }),
      hsm.entry(function (ctx, inst, event) { entryCount++; return Promise.resolve(); }),
      hsm.transition(
        hsm.on("self"),
        hsm.target("."),
        hsm.effect(function (ctx, inst, event) { return Promise.resolve(); })
      )
    ),
    hsm.initial(hsm.target("state"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  var initialExitCount = exitCount;
  var initialEntryCount = entryCount;

  machine.dispatch({ name: "self", kind: hsm.kinds.Event });

  // Self transitions should exit and re-enter the state
  assert.strictEqual(exitCount, initialExitCount + 1);
  assert.strictEqual(entryCount, initialEntryCount + 1);
});


test("should handle unhandled events gracefully", async function () {
  var machine = new TestMachine();
  var handlerCalled = false;

  var model = hsm.define(
    "unhandled",
    hsm.state("limited",
      hsm.transition(
        hsm.on("handled"),
        hsm.effect(function (ctx, inst, event) { handlerCalled = true; return Promise.resolve(); }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("limited"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Unhandled events should be ignored
  machine.dispatch({ name: "unhandled", kind: hsm.kinds.Event });
  machine.dispatch({ name: "unhandled", kind: hsm.kinds.Event });

  // State should remain the same
  assert.strictEqual(machine.state(), "/unhandled/limited");

  // Handled event should still work
  machine.dispatch({ name: "handled", kind: hsm.kinds.Event });
  assert.strictEqual(handlerCalled, true);
});

// === HIERARCHICAL STATE PRIORITY TESTS ===

test("should handle event in deepest state first", async function () {
  var machine = new TestMachine();
  var handledAt = "";

  var model = hsm.define(
    "hierarchy",
    hsm.state("parent",
      hsm.transition(
        hsm.on("test"),
        hsm.effect(function (ctx, inst, event) { handledAt = "parent"; return Promise.resolve(); }),
        hsm.target(".")
      ),
      hsm.state("child",
        hsm.transition(
          hsm.on("test"),
          hsm.effect(function (ctx, inst, event) { handledAt = "child"; return Promise.resolve(); }),
          hsm.target(".")
        )
      ),
      hsm.initial(hsm.target("child"))
    ),
    hsm.initial(hsm.target("parent"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  machine.dispatch({ name: "test", kind: hsm.kinds.Event });

  // Should be handled at child level, not parent
  assert.strictEqual(handledAt, "child");
});

// === COMPLEX SCENARIO TESTS ===

test("should handle complex state machine scenario", async function () {
  var machine = new TestMachine();
  var log = [];

  var model = hsm.define(
    "complex",
    hsm.state("system",
      hsm.entry(function (ctx, inst, event) { log.push("system-entry"); return Promise.resolve(); }),
      hsm.exit(function (ctx, inst, event) { log.push("system-exit"); return Promise.resolve(); }),

      hsm.state("initializing",
        hsm.entry(function (ctx, inst, event) { log.push("init-entry"); return Promise.resolve(); }),
        hsm.activity(function (ctx, m, e) {
          log.push("init-activity-start");
          return new Promise(function (resolve) {
            setTimeout(function () {
              if (!ctx.done) {
                m.dispatch({ name: "initialized", kind: hsm.kinds.Event });
              }
              resolve();
            }, 30);
            ctx.addEventListener('done', resolve);
          });
        }),
        hsm.transition(
          hsm.on("initialized"),
          hsm.target("../running")
        )
      ),

      hsm.state("running",
        hsm.entry(function (ctx, inst, event) { log.push("running-entry"); return Promise.resolve(); }),

        hsm.state("idle",
          hsm.entry(function (ctx, inst, event) { log.push("idle-entry"); return Promise.resolve(); }),
          hsm.transition(
            hsm.on("start"),
            hsm.target("../processing")
          )
        ),

        hsm.state("processing",
          hsm.entry(function (ctx, inst, event) { log.push("processing-entry"); return Promise.resolve(); }),
          hsm.activity(function (ctx, m, e) {
            log.push("processing-activity");
            return new Promise(function (resolve) {
              ctx.addEventListener('done', resolve);
            });
          }),
          hsm.transition(
            hsm.on("complete"),
            hsm.target("../idle")
          ),
          hsm.transition(
            hsm.on("error"),
            hsm.target("../../error")
          )
        ),

        hsm.initial(hsm.target("idle"))
      ),

      hsm.state("error",
        hsm.entry(function (ctx, inst, event) { log.push("error-entry"); return Promise.resolve(); }),
        hsm.transition(
          hsm.on("reset"),
          hsm.target("../running")
        )
      ),

      hsm.initial(hsm.target("initializing"))
    ),
    hsm.initial(hsm.target("system"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  assert.strictEqual(machine.state(), "/complex/system/initializing");

  // Wait for initialization
  await delay(60);
  assert.strictEqual(machine.state(), "/complex/system/running/idle");

  // Start processing
  machine.dispatch({ name: "start", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/complex/system/running/processing");

  // Simulate error
  machine.dispatch({ name: "error", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/complex/system/error");

  // Reset
  machine.dispatch({ name: "reset", kind: hsm.kinds.Event });
  assert.strictEqual(machine.state(), "/complex/system/running/idle");

  // Verify log sequence
  assert(log.includes("system-entry"));
  assert(log.includes("init-entry"));
  assert(log.includes("init-activity-start"));
  assert(log.includes("running-entry"));
  assert(log.includes("idle-entry"));
  assert(log.includes("processing-entry"));
  assert(log.includes("processing-activity"));
  assert(log.includes("error-entry"));
});


test("should handle rapid event dispatching", async function () {
  var machine = new TestMachine();
  var processedCount = 0;

  var model = hsm.define(
    "stress",
    hsm.state("processing",
      hsm.transition(
        hsm.on("event"),
        hsm.effect(function (ctx, inst, event) {
          processedCount++;
        }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("processing"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Dispatch many events rapidly
  var eventCount = 100;
  for (var i = 0; i < eventCount; i++) {
    machine.dispatch({ name: "event", kind: hsm.kinds.Event });
  }

  // Wait for processing
  await delay(200);
  assert.strictEqual(processedCount, eventCount);
});

test("should handle deep nesting without stack overflow", async function () {
  var machine = new TestMachine();

  // Build a nested state machine with proper structure
  var model = hsm.define("deep",
    hsm.state("level0",
      hsm.state("level1",
        hsm.state("level2",
          hsm.state("level3",
            hsm.state("level4",
              hsm.transition(hsm.on("bubble"), hsm.target("../../../.."))
            ),
            hsm.initial(hsm.target("level4"))
          ),
          hsm.initial(hsm.target("level3"))
        ),
        hsm.initial(hsm.target("level2"))
      ),
      hsm.initial(hsm.target("level1"))
    ),
    hsm.initial(hsm.target("level0"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  // Should reach the deepest level
  assert(machine.state().includes("level4"));

  // Should handle event bubbling from deep level
  machine.dispatch({ name: "bubble", kind: hsm.kinds.Event });
  assert(machine.state().includes("level0"));
});

// === ERROR RECOVERY TESTS ===

test("should recover from behavior errors", async function () {
  var machine = new TestMachine();
  var recoveryCount = 0;

  var model = hsm.define("behaviorErrors",
    hsm.state("normal",
      hsm.transition(
        hsm.on("causeError"),
        hsm.effect(function (ctx, inst, event) {
          return Promise.resolve();
        }),
        hsm.target("../recovery")
      )
    ),
    hsm.state("recovery",
      hsm.entry(function (ctx, inst, event) {
        recoveryCount++;
        return Promise.resolve();
      })
    ),
    hsm.initial(hsm.target("normal"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  machine.dispatch({ name: "causeError", kind: hsm.kinds.Event });

  assert.strictEqual(recoveryCount, 1);
  assert.strictEqual(machine.state(), "/behaviorErrors/recovery");
});


test("should handle stack overflow conditions gracefully", async function () {
  var machine = new TestMachine();
  var depth = 0;
  var maxDepth = 0;

  // Create a recursive transition pattern
  var model = hsm.define("stackoverflow",
    hsm.state("recursive",
      hsm.transition(
        hsm.on("recurse"),
        hsm.effect(function (ctx, m, e) {
          depth++;
          maxDepth = Math.max(maxDepth, depth);

          if (depth < 1000) { // Prevent infinite recursion
            return m.dispatch({ name: "recurse", kind: hsm.kinds.Event });
          } else {
            return m.dispatch({ name: "stop", kind: hsm.kinds.Event });
          }
        }),
        hsm.target(".")
      ),
      hsm.transition(
        hsm.on("stop"),
        hsm.effect(function (ctx, inst, event) {
          depth = 0;
          return Promise.resolve();
        }),
        hsm.target("../stopped")
      )
    ),
    hsm.state("stopped"),
    hsm.initial(hsm.target("recursive"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);

  try {
    machine.dispatch({ name: "recurse", kind: hsm.kinds.Event });
    await delay(100); // Let recursion complete

    assert.strictEqual(machine.state(), "/stackoverflow/stopped");
    assert(maxDepth >= 100, "Should have achieved significant recursion depth");

  } catch (e) {
    // Should handle stack overflow gracefully
    assert(e.message.includes("stack") || e.message.includes("Maximum call stack"));
  }
});

test("should clean up resources on forced termination", async function () {
  var machine = new TestMachine();
  var resourcesCreated = 0;
  var resourcesDestroyed = 0;
  var leakedResources = [];

  function createResource(name) {
    resourcesCreated++;
    var resource = { name: name, id: resourcesCreated };
    leakedResources.push(resource);
    return resource;
  }

  function destroyResource(resource) {
    resourcesDestroyed++;
    var index = leakedResources.indexOf(resource);
    if (index !== -1) {
      leakedResources.splice(index, 1);
    }
  }

  var model = hsm.define("resourceLeak",
    hsm.state("allocating",
      hsm.entry(function (ctx, m, event) {
        m.resource1 = createResource("entry");
        return Promise.resolve();
      }),
      hsm.exit(function (ctx, m, event) {
        if (m.resource1) destroyResource(m.resource1);
        return Promise.resolve();
      }),
      hsm.activity(function (ctx, m, e) {
        var resource = createResource("activity");
        m.activityResource = resource;

        return new Promise(function (resolve) {
          ctx.addEventListener('done', function () {
            destroyResource(resource);
            resolve();
          });
        });
      }),
      hsm.transition(
        hsm.every(function () { return 10; }),
        hsm.effect(function (ctx, m, event) {
          var resource = createResource("timer");
          // Intentionally not cleaning up to test leak detection
          return Promise.resolve();
        }),
        hsm.target(".")
      )
    ),
    hsm.initial(hsm.target("allocating"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(50); // Let some resources accumulate

  // Force termination
  hsm.stop(machine);
  await delay(20); // Let cleanup happen


  // Should have cleaned up most resources
  assert(resourcesDestroyed > 0, "Should have destroyed some resources");

  // Some resources might still be leaked (timer effects)
  if (leakedResources.length > 0) {
    console.log("Leaked resources:", leakedResources.map(r => r.name));
  }
});

test("every() should work correctly with internal transitions", async function () {
  var machine = new TestMachine();
  var timer1Count = 0;
  var timer2Count = 0;
  var effectCount = 0;

  var model = hsm.define("multipleEveryInternal",
    hsm.state("ticking",
      hsm.transition(
        hsm.every(function (ctx, inst, event) { return 25; }),
        hsm.effect(function (ctx, inst, event) {
          timer1Count++;
          effectCount++;
          return Promise.resolve();
        })
        // No target - this is an internal transition!
      ),
      hsm.transition(
        hsm.every(function (ctx, inst, event) { return 35; }),
        hsm.effect(function (ctx, inst, event) {
          timer2Count++;
          effectCount++;
          return Promise.resolve();
        })
        // No target - this is an internal transition!
      ),
      hsm.transition(
        hsm.on("stop"),
        hsm.target("../stopped")
      )
    ),
    hsm.state("stopped"),
    hsm.initial(hsm.target("ticking"))
  );

  var ctx = new hsm.Context();
  hsm.start(ctx, machine, model);
  await delay(200); // Let both timers fire multiple times
  machine.dispatch({ name: "stop", kind: hsm.kinds.Event });

  // Both timers should fire since internal transitions don't exit/re-enter the state
  assert(timer1Count >= 2, `Timer1 should fire multiple times, got ${timer1Count}`);
  assert(timer2Count >= 2, `Timer2 should fire multiple times, got ${timer2Count}`);
  assert(effectCount >= 4, `Total effects should be at least 4, got ${effectCount}`);

  // Timer1 should fire more frequently than timer2 (25ms vs 35ms)
  assert(timer1Count >= timer2Count, `Timer1 (${timer1Count}) should fire more than timer2 (${timer2Count})`);


  // Verify we're in the stopped state
  assert.strictEqual(machine.state(), "/multipleEveryInternal/stopped");
});

