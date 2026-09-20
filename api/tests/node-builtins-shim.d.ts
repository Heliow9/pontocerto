declare module "node:test" { const test: any; export default test; }
declare module "node:assert/strict" { const assert: any; export default assert; }
declare module "node:crypto" {
  export function createHash(...args: any[]): any;
  export function createHmac(...args: any[]): any;
  export function timingSafeEqual(...args: any[]): boolean;
}
type Buffer = any;
declare const Buffer: any;
