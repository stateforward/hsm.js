const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

const { Queue, Kinds, InitialEvent, FinalEvent, ErrorEvent } = hsm;

test.describe('Queue', () => {
    test('should create an empty queue', () => {
        const queue = new Queue();
        assert.strictEqual(queue.len(), 0);
        assert.strictEqual(queue.pop(), undefined);
    });

    test('should handle regular events with FIFO order', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const event3 = { kind: Kinds.Event, name: 'event3' };

        queue.push(event1, event2, event3);
        assert.strictEqual(queue.len(), 3);

        assert.strictEqual(queue.pop(), event1);
        assert.strictEqual(queue.pop(), event2);
        assert.strictEqual(queue.pop(), event3);
        assert.strictEqual(queue.pop(), undefined);
    });

    test('should handle completion events with LIFO order', () => {
        const queue = new Queue();
        const completion1 = { kind: Kinds.CompletionEvent, name: 'completion1' };
        const completion2 = { kind: Kinds.CompletionEvent, name: 'completion2' };
        const completion3 = { kind: Kinds.CompletionEvent, name: 'completion3' };

        queue.push(completion1, completion2, completion3);
        assert.strictEqual(queue.len(), 3);

        // LIFO order for completion events
        assert.strictEqual(queue.pop(), completion3);
        assert.strictEqual(queue.pop(), completion2);
        assert.strictEqual(queue.pop(), completion1);
        assert.strictEqual(queue.pop(), undefined);
    });

    test('should prioritize completion events over regular events', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const completion1 = { kind: Kinds.CompletionEvent, name: 'completion1' };
        const completion2 = { kind: Kinds.CompletionEvent, name: 'completion2' };

        // Push regular events first
        queue.push(event1, event2);
        // Then push completion events
        queue.push(completion1, completion2);

        // Completion events should be processed first (LIFO)
        assert.strictEqual(queue.pop(), completion2);
        assert.strictEqual(queue.pop(), completion1);
        // Then regular events (FIFO)
        assert.strictEqual(queue.pop(), event1);
        assert.strictEqual(queue.pop(), event2);
    });

    test('should handle mixed event types in single push', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const completion1 = { kind: Kinds.CompletionEvent, name: 'completion1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const completion2 = { kind: Kinds.CompletionEvent, name: 'completion2' };

        queue.push(event1, completion1, event2, completion2);

        // Completion events first (LIFO)
        assert.strictEqual(queue.pop(), completion2);
        assert.strictEqual(queue.pop(), completion1);
        // Then regular events (FIFO)
        assert.strictEqual(queue.pop(), event1);
        assert.strictEqual(queue.pop(), event2);
    });

    test('should track backHead correctly for memory optimization', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const event3 = { kind: Kinds.Event, name: 'event3' };

        // Push and pop to move backHead
        queue.push(event1, event2);
        assert.strictEqual(queue.backHead, 0);
        assert.strictEqual(queue.back.length, 2);
        assert.strictEqual(queue.len(), 2);

        queue.pop(); // removes event1
        assert.strictEqual(queue.backHead, 1);
        assert.strictEqual(queue.back[0], undefined); // slot cleared for GC
        assert.strictEqual(queue.len(), 1);

        // Push event3 - will append to array
        queue.push(event3);
        assert.strictEqual(queue.backHead, 1);
        assert.strictEqual(queue.back.length, 3); // array grew by 1
        assert.strictEqual(queue.len(), 2);

        // Verify correct order
        assert.strictEqual(queue.pop(), event2);
        assert.strictEqual(queue.pop(), event3);
        assert.strictEqual(queue.len(), 0);
    });

    test('should handle special event types correctly', () => {
        const queue = new Queue();

        queue.push(InitialEvent);
        queue.push(FinalEvent);
        queue.push(ErrorEvent);

        // All are completion events, so LIFO order
        assert.strictEqual(queue.pop(), ErrorEvent);
        assert.strictEqual(queue.pop(), FinalEvent);
        assert.strictEqual(queue.pop(), InitialEvent);
    });

    test('should handle large number of events efficiently', () => {
        const queue = new Queue();
        const events = [];
        const completions = [];

        // Create 100 of each type
        for (let i = 0; i < 100; i++) {
            events.push({ kind: Kinds.Event, name: `event${i}` });
            completions.push({ kind: Kinds.CompletionEvent, name: `completion${i}` });
        }

        // Push all events
        queue.push(...events);
        queue.push(...completions);

        assert.strictEqual(queue.len(), 200);

        // Pop all completion events (LIFO)
        for (let i = 99; i >= 0; i--) {
            assert.strictEqual(queue.pop().name, `completion${i}`);
        }

        // Pop all regular events (FIFO)
        for (let i = 0; i < 100; i++) {
            assert.strictEqual(queue.pop().name, `event${i}`);
        }

        assert.strictEqual(queue.len(), 0);
    });

    test('should work with profiler', () => {
        const profiler = new hsm.Profiler();
        const queue = new Queue(profiler);
        const event = { kind: Kinds.Event, name: 'test' };

        queue.push(event);
        queue.pop();

        const results = profiler.getResults();
        assert(results.push);
        assert(results.pop);
        assert.strictEqual(results.push.count, 1);
        assert.strictEqual(results.pop.count, 1);
    });

    test('should handle empty push gracefully', () => {
        const queue = new Queue();
        queue.push(); // No arguments
        assert.strictEqual(queue.len(), 0);
    });

    test('should maintain correct length', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const completion = { kind: Kinds.CompletionEvent, name: 'completion' };

        assert.strictEqual(queue.len(), 0);

        queue.push(event1);
        assert.strictEqual(queue.len(), 1);

        queue.push(event2, completion);
        assert.strictEqual(queue.len(), 3);

        queue.pop();
        assert.strictEqual(queue.len(), 2);

        queue.pop();
        assert.strictEqual(queue.len(), 1);

        queue.pop();
        assert.strictEqual(queue.len(), 0);
    });

    test('should handle alternating push and pop operations', () => {
        const queue = new Queue();
        const event1 = { kind: Kinds.Event, name: 'event1' };
        const event2 = { kind: Kinds.Event, name: 'event2' };
        const completion = { kind: Kinds.CompletionEvent, name: 'completion' };

        queue.push(event1);
        assert.strictEqual(queue.pop(), event1);

        queue.push(event2);
        queue.push(completion);
        assert.strictEqual(queue.pop(), completion);
        assert.strictEqual(queue.pop(), event2);

        assert.strictEqual(queue.pop(), undefined);
    });

    test('should clear slots for garbage collection', () => {
        const queue = new Queue();
        const event = { kind: Kinds.Event, name: 'event', data: new Array(1000).fill('x') };

        queue.push(event);
        assert.strictEqual(queue.back[0], event);

        queue.pop();
        assert.strictEqual(queue.back[0], undefined); // Should be cleared
    });

    test('should reset back array when all events are consumed', () => {
        const queue = new Queue();

        // Push some events
        queue.push(
            { kind: Kinds.Event, name: 'event1' },
            { kind: Kinds.Event, name: 'event2' },
            { kind: Kinds.Event, name: 'event3' }
        );

        assert.strictEqual(queue.back.length, 3);
        assert.strictEqual(queue.backHead, 0);

        // Pop all events
        queue.pop();
        queue.pop();
        // After the last pop, the array should reset
        queue.pop();

        assert.strictEqual(queue.back.length, 0);
        assert.strictEqual(queue.backHead, 0);
        assert.strictEqual(queue.len(), 0);
    });

    test('should handle error events as completion events', () => {
        const queue = new Queue();
        const regularEvent = { kind: Kinds.Event, name: 'regular' };
        const errorEvent = { kind: Kinds.ErrorEvent, name: 'error' };

        queue.push(regularEvent, errorEvent);

        // Error event should be processed first (it's a completion event)
        assert.strictEqual(queue.pop(), errorEvent);
        assert.strictEqual(queue.pop(), regularEvent);
    });

    test('should handle time events as regular events', () => {
        const queue = new Queue();
        const timeEvent = { kind: Kinds.TimeEvent, name: 'timer' };
        const regularEvent = { kind: Kinds.Event, name: 'regular' };

        queue.push(timeEvent, regularEvent);

        // Both are regular events, FIFO order
        assert.strictEqual(queue.pop(), timeEvent);
        assert.strictEqual(queue.pop(), regularEvent);
    });

    test('should handle stress test with mixed event types', () => {
        const queue = new Queue();
        const operations = [];

        // Push 1000 mixed events
        for (let i = 0; i < 1000; i++) {
            const isCompletion = i % 3 === 0;
            const event = {
                kind: isCompletion ? Kinds.CompletionEvent : Kinds.Event,
                name: `event${i}`,
                isCompletion
            };
            queue.push(event);
            operations.push(event);
        }

        // Track popped events
        const popped = [];
        while (queue.len() > 0) {
            popped.push(queue.pop());
        }

        // Verify all events were popped
        assert.strictEqual(popped.length, 1000);

        // Verify completion events came first (LIFO) then regular events (FIFO)
        const completionEvents = operations.filter(e => e.isCompletion);
        const regularEvents = operations.filter(e => !e.isCompletion);

        // Check first part is completion events in reverse order
        for (let i = 0; i < completionEvents.length; i++) {
            assert.strictEqual(popped[i].name, completionEvents[completionEvents.length - 1 - i].name);
        }

        // Check second part is regular events in order
        for (let i = 0; i < regularEvents.length; i++) {
            assert.strictEqual(popped[completionEvents.length + i].name, regularEvents[i].name);
        }
    });

    test('should handle rapid push/pop cycles', () => {
        const queue = new Queue();

        // Simulate rapid event processing
        for (let cycle = 0; cycle < 100; cycle++) {
            // Push a burst of events
            const burstSize = Math.floor(Math.random() * 10) + 1;
            const events = [];

            for (let i = 0; i < burstSize; i++) {
                const event = {
                    kind: Math.random() > 0.7 ? Kinds.CompletionEvent : Kinds.Event,
                    name: `cycle${cycle}-event${i}`
                };
                events.push(event);
                queue.push(event);
            }

            // Pop some events (not necessarily all)
            const popCount = Math.floor(Math.random() * queue.len()) + 1;
            for (let i = 0; i < popCount && queue.len() > 0; i++) {
                const popped = queue.pop();
                assert(popped); // Should not be undefined
            }
        }

        // Drain remaining events
        let remaining = 0;
        while (queue.pop()) {
            remaining++;
        }

        // Queue should be empty now
        assert.strictEqual(queue.len(), 0);
    });

    test('should maintain consistency with concurrent-like access patterns', () => {
        const queue = new Queue();
        const events = [];
        const results = [];

        // Create a pattern that simulates concurrent access
        // Push multiple events, pop one, push more, etc.
        queue.push(
            { kind: Kinds.Event, name: 'e1' },
            { kind: Kinds.CompletionEvent, name: 'c1' }
        );
        results.push(queue.pop()); // Should be c1

        queue.push(
            { kind: Kinds.Event, name: 'e2' },
            { kind: Kinds.CompletionEvent, name: 'c2' },
            { kind: Kinds.Event, name: 'e3' }
        );
        results.push(queue.pop()); // Should be c2
        results.push(queue.pop()); // Should be e1

        queue.push({ kind: Kinds.CompletionEvent, name: 'c3' });
        results.push(queue.pop()); // Should be c3
        results.push(queue.pop()); // Should be e2
        results.push(queue.pop()); // Should be e3

        assert.deepStrictEqual(
            results.map(r => r ? r.name : ''),
            ['c1', 'c2', 'e1', 'c3', 'e2', 'e3']
        );
    });
});