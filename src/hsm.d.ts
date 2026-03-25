export type Kind = number;

export interface Event<N extends string = string, T = any> {
  kind: Kind;
  name: N;
  data?: T;
  schema?: any;
  source?: string;
  target?: string;
  id?: string;
}

export interface SnapshotEventDetail {
  event: string;
  target?: string;
  guard: boolean;
  schema?: any;
}

export interface Snapshot {
  id: string;
  qualifiedName: string;
  state: string;
  attributes: Record<string, any>;
  queueLen: number;
  events: SnapshotEventDetail[];
}

export interface ClockConfig {
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  now?: () => number;
}

export const DefaultClock: Required<ClockConfig>;

export interface Config {
  id?: string;
  name?: string;
  data?: any;
  clock?: ClockConfig;
}

export class Context {
  listeners: Array<() => void>;
  instances: Record<string, Instance>;
  done: boolean;
  addEventListener(type: 'done', listener: () => void): void;
  removeEventListener(type: 'done', listener: () => void): void;
}

export class Instance {
  _hsm: HSM<this> | null;
  dispatch(event: Event): void;
  state(): string;
  context(): Context;
  clock(): Required<ClockConfig>;
  get(name: string): any;
  set(name: string, value: any): void;
  call(name: string, ...args: any[]): any;
  restart(data?: any): void;
  takeSnapshot(): Snapshot;
}

export class HSM<T extends Instance = Instance> {
  readonly _hsm: HSM<T>;
  readonly instance: T;
  readonly ctx: Context;
  readonly model: Model;
  readonly queue: Queue;
  readonly id: string;
  readonly name: string;
  dispatch(event: Event): void;
  state(): string;
  start(): HSM<T>;
  stop(): void;
  restart(data?: any): void;
  get(name: string): any;
  set(name: string, value: any): void;
  call(name: string, ...args: any[]): any;
  takeSnapshot(): Snapshot;
}

export class Queue {
  backHead: number;
  back: Array<Event | undefined>;
  front: Event[];
  len(): number;
  pop(): Event | undefined;
  push(...events: Event[]): void;
}

export class Profiler {
  constructor(disabled?: boolean);
  reset(): void;
  getTime(): number;
  start(name: string): void;
  end(name: string): void;
  getResults(): Record<string, { count: number; totalTime: number; maxTime: number; avgTime: number }>;
  report(): void;
}

export class Group {
  constructor(...instances: Instance[]);
  dispatch(event: Event): void;
  clock(): Required<ClockConfig>;
  set(name: string, value: any): void;
  call(name: string, ...args: any[]): any;
  stop(): void;
  restart(data?: any): void;
  takeSnapshot(): Snapshot;
}

export type PartialFunction<T = any> = (model: Model, stack: any[]) => T | void;
export type Operation<T extends Instance = Instance> = (ctx: Context, instance: T, event: Event) => any;
export type GuardExpression<T extends Instance = Instance> = (ctx: Context, instance: T, event: Event) => boolean;

export interface Model {
  qualifiedName: string;
  kind: Kind;
  members: Record<string, any>;
  transitionMap: Record<string, Record<string, any[]>>;
  deferredMap: Record<string, Record<string, boolean>>;
  attributes: Record<string, any>;
  operations: Record<string, any>;
  events: Record<string, Event>;
}

export const kinds: Record<string, Kind>;
export const Kinds: typeof kinds;
export const NullKind: Kind;
export const ElementKind: Kind;
export const PartialKind: Kind;
export const VertexKind: Kind;
export const ConstraintKind: Kind;
export const BehaviorKind: Kind;
export const NamespaceKind: Kind;
export const ConcurrentKind: Kind;
export const SequentialKind: Kind;
export const StateMachineKind: Kind;
export const AttributeKind: Kind;
export const StateKind: Kind;
export const ModelKind: Kind;
export const TransitionKind: Kind;
export const InternalKind: Kind;
export const ExternalKind: Kind;
export const LocalKind: Kind;
export const SelfKind: Kind;
export const EventKind: Kind;
export const CompletionEventKind: Kind;
export const ChangeEventKind: Kind;
export const ErrorEventKind: Kind;
export const TimeEventKind: Kind;
export const CallEventKind: Kind;
export const PseudostateKind: Kind;
export const InitialKind: Kind;
export const FinalStateKind: Kind;
export const ChoiceKind: Kind;
export const JunctionKind: Kind;
export const DeepHistoryKind: Kind;
export const ShallowHistoryKind: Kind;
export const InitialEvent: Event<'hsm_initial'>;
export const FinalEvent: Event<'hsm_final'>;
export const ErrorEvent: Event<'hsm_error'>;

export function isKind(kindValue: Kind, ...baseKinds: Kind[]): boolean;
export function makeKind(...baseKinds: Kind[]): Kind;
export function join(...segments: string[]): string;
export function dirname(path: string): string;
export function isAbsolute(path: string): boolean;
export function lca(a: string, b: string): string;
export function isAncestor(ancestor: string, descendant: string): boolean;

export function start<T extends Instance>(instance: T, model: Model, config?: Config): HSM<T>;
export function start<T extends Instance>(ctx: Context, instance: T, model: Model, config?: Config): HSM<T>;
export function stop(instance: Instance): void;
export function restart(instance: Instance, data?: any): void;
export function dispatchAll(ctx: Context, event: Event): void;
export function dispatchTo(ctx: Context, event: Event, ...ids: string[]): void;
export function get(instance: Instance, name: string): any;
export function get(ctx: Context, instance: Instance, name: string): any;
export function set(instance: Instance, name: string, value: any): void;
export function set(ctx: Context, instance: Instance, name: string, value: any): void;
export function call(instance: Instance, name: string, ...args: any[]): any;
export function call(ctx: Context, instance: Instance, name: string, ...args: any[]): any;
export function takeSnapshot(instance: Instance): Snapshot;
export function takeSnapshot(ctx: Context, instance: Instance): Snapshot;
export function afterProcess(ctx: Context, instance: Instance, event?: Event): Promise<void>;
export function afterDispatch(ctx: Context, instance: Instance, event: Event): Promise<void>;
export function afterEntry(ctx: Context, instance: Instance, state: string): Promise<void>;
export function afterExit(ctx: Context, instance: Instance, state: string): Promise<void>;
export function afterExecuted(ctx: Context, instance: Instance, stateOrBehavior: string): Promise<void>;
export function id(instance: Instance): string;
export function qualifiedName(instance: Instance): string;
export function name(instance: Instance): string;
export function clock(instance: Instance | Group | null | undefined): Required<ClockConfig>;

export function state(name: string, ...partials: PartialFunction[]): PartialFunction;
export function initial(...partials: PartialFunction[]): PartialFunction;
export function transition(...partials: PartialFunction[]): PartialFunction;
export function event<N extends string = string>(name: N, schema?: any): Event<N>;
export function source(name: string): PartialFunction;
export function target(name: string): PartialFunction;
export function on(event: Event | string): PartialFunction;
export function onSet(name: string): PartialFunction;
export function onCall(name: string): PartialFunction;
export function when(name: string): PartialFunction;
export function when(expr: (ctx: Context, instance: Instance, event: Event) => any): PartialFunction;
export function entry(...operations: Array<string | Operation>): PartialFunction;
export function exit(...operations: Array<string | Operation>): PartialFunction;
export function activity(...operations: Array<string | Operation>): PartialFunction;
export function effect(...operations: Array<string | Operation>): PartialFunction;
export function guard(expression: string | GuardExpression): PartialFunction;
export function after(duration: string | ((ctx: Context, instance: Instance, event: Event) => number)): PartialFunction;
export function every(duration: string | ((ctx: Context, instance: Instance, event: Event) => number)): PartialFunction;
export function at(timepoint: string | ((ctx: Context, instance: Instance, event: Event) => number | Date)): PartialFunction;
export function defer(...eventNames: string[]): PartialFunction;
export function final(name: string): PartialFunction;
export function choice(name: string, ...partials: PartialFunction[]): PartialFunction;
export function shallowHistory(name: string, ...partials: PartialFunction[]): PartialFunction;
export function deepHistory(name: string, ...partials: PartialFunction[]): PartialFunction;
export function define(name: string, ...partials: PartialFunction[]): Model;
export function attribute(name: string, defaultValue?: any): PartialFunction;
export function operation(name: string, implementation: Function): PartialFunction;
export function makeGroup(...instances: Instance[]): Group;

export const Define: typeof define;
export const State: typeof state;
export const Final: typeof final;
export const ShallowHistory: typeof shallowHistory;
export const DeepHistory: typeof deepHistory;
export const Choice: typeof choice;
export const Transition: typeof transition;
export const Initial: typeof initial;
export const Event: typeof event;
export const On: typeof on;
export const OnCall: typeof onCall;
export const OnSet: typeof onSet;
export const When: typeof when;
export const After: typeof after;
export const Every: typeof every;
export const At: typeof at;
export const Target: typeof target;
export const Source: typeof source;
export const Entry: typeof entry;
export const Exit: typeof exit;
export const Activity: typeof activity;
export const Effect: typeof effect;
export const Guard: typeof guard;
export const Defer: typeof defer;
export const Attribute: typeof attribute;
export const Operation: typeof operation;
export const DispatchAll: typeof dispatchAll;
export const DispatchTo: typeof dispatchTo;
export const Get: typeof get;
export const Set: typeof set;
export const Call: typeof call;
export const Restart: typeof restart;
export const TakeSnapshot: typeof takeSnapshot;
export const MakeGroup: typeof makeGroup;
export const MakeKind: typeof makeKind;
export const IsKind: typeof isKind;
export const LCA: typeof lca;
export const IsAncestor: typeof isAncestor;
export const ID: typeof id;
export const QualifiedName: typeof qualifiedName;
export const Name: typeof name;
export const Clock: typeof clock;
