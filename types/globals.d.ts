declare function setTimeout(callback: () => void, delay: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(callback: () => void, delay: number): number;
declare function clearInterval(id: number): void;
declare function setImmediate(callback: () => void): number;
declare function clearImmediate(id: number): void;

declare const console: {
    log: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  };


  type RelativePath =
  | '..'
  | '../'
  | '.'
  | './'
  | `${'../' | '..'}${string}`
  | `${'./' | '.'}${string}`;

type AbsolutePath = '/' | `/${string}`;

type Path = RelativePath | AbsolutePath | `${string}/${string}`;