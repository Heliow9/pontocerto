declare module "node:test" { const test: any; export default test; }
declare module "node:assert/strict" { const assert: any; export default assert; }
declare module "node:crypto" {
  export function createHash(...args: any[]): any;
  export function createHmac(...args: any[]): any;
  export function timingSafeEqual(...args: any[]): boolean;
}
type Buffer = any;
declare const Buffer: any;
declare module "node:https" { const https: any; export default https; export type RequestOptions = any; }
declare module "node:http" { export type IncomingHttpHeaders = Record<string, any>; }
declare module "node:fs" { const fs: any; export default fs; }
