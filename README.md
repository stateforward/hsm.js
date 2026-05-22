# `@stateforward/hsm`

Hierarchical state machine runtime for JavaScript with bundled TypeScript declarations.

This package provides:

- a JavaScript runtime in `src/hsm.js`
- declaration files in `src/hsm.d.ts`
- a builder-style DSL for defining models
- runtime helpers for events, attributes, operations, timers, history, and snapshots

It exports both the existing camelCase helpers and PascalCase aliases.

## Install

```sh
npm install @stateforward/hsm
```

## Import

ES modules:

```js
import * as hsm from "@stateforward/hsm";
```

CommonJS:

```js
const hsm = require("@stateforward/hsm");
```

There is no default export.

## Example

```js
import * as hsm from "@stateforward/hsm";

class Door extends hsm.Instance {}

const Open = hsm.event("open");
const Close = hsm.event("close");

const model = hsm.define(
  "Door",
  hsm.state(
    "closed",
    hsm.transition(
      hsm.on(Open),
      hsm.target("../open"),
    ),
  ),
  hsm.state(
    "open",
    hsm.entry((ctx, instance, event) => {
      void ctx;
      void instance;
      console.log(`entered ${event.name}`);
    }),
    hsm.transition(
      hsm.on(Close),
      hsm.target("../closed"),
    ),
  ),
  hsm.initial(hsm.target("closed")),
);

const instance = new Door();
const machine = hsm.start(instance, model);

machine.dispatch(Open);
console.log(machine.state()); // "/Door/open"
machine.dispatch(Close);
console.log(machine.state()); // "/Door/closed"
```

## Core API

Model building:

- `define(name, ...partials)`
- `state(name, ...partials)`
- `initial(...partials)`
- `transition(...partials)`
- `final(name)`
- `choice(name, ...partials)`
- `shallowHistory(name, ...partials)`
- `deepHistory(name, ...partials)`

Transition partials:

- `on(eventOrName)`
- `onSet(name)`
- `onCall(name)`
- `when(nameOrExpression)`
- `source(path)`
- `target(path)`
- `guard(expressionOrOperationName)`
- `effect(...operations)`
- `after(duration)`
- `every(duration)`
- `at(timepoint)`

State partials:

- `entry(...operations)`
- `exit(...operations)`
- `activity(...operations)`
- `defer(...eventNames)`

Runtime helpers:

- `start(...)`
- `stop(instance)`
- `restart(instance, data?)`
- `get(...)`
- `set(...)`
- `call(...)`
- `takeSnapshot(...)`
- `dispatchAll(ctx, event)`
- `dispatchTo(ctx, event, ...ids)`
- `makeGroup(...instances)`

## Paths

`target(...)` and `source(...)` accept relative and absolute paths.

Examples:

- `"."` current state
- `"../sibling"` sibling state
- `"nested/child"` nested state
- `"/Machine/absolute/path"` absolute path

## Events, Attributes, and Operations

Events:

```js
const Tick = hsm.event("tick");
```

Attributes:

```js
const model = hsm.define(
  "Counter",
  hsm.attribute("count", 0),
  hsm.state(
    "idle",
    hsm.transition(hsm.onSet("count"), hsm.target(".")),
  ),
  hsm.initial(hsm.target("idle")),
);
```

Operations:

```js
const model = hsm.define(
  "Worker",
  hsm.operation("save", (ctx, instance, value) => {
    void ctx;
    void instance;
    return value;
  }),
  hsm.state(
    "idle",
    hsm.transition(hsm.onCall("save"), hsm.target(".")),
  ),
  hsm.initial(hsm.target("idle")),
);
```

## TypeScript

The package includes `.d.ts` files and can be used directly from TypeScript:

```ts
import * as hsm from "@stateforward/hsm";

class Counter extends hsm.Instance {}

const model = hsm.define(
  "Counter",
  hsm.attribute("count", 0),
  hsm.state("idle"),
  hsm.initial(hsm.target("idle")),
);

const machine = hsm.start(new Counter(), model);
const count = machine.get("count");
```

## Runtime Notes

- `start(instance, model)` returns the machine controller
- `instance._hsm` points at the active machine after start
- `state()` returns the fully qualified active state path
- `takeSnapshot()` returns the current state, attributes, queue length, and registered event metadata
- PascalCase aliases such as `Define`, `State`, `Transition`, and `Event` are exported alongside camelCase names

## Development

```sh
npm install
npm test
```
