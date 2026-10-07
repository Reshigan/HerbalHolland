// The few Cloudflare Workers runtime types worker.ts uses, so the repo's `tsc --noEmit` checks it without a new
// dependency on @cloudflare/workers-types.
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
