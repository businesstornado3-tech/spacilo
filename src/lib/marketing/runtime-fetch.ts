/**
 * A safely bound `fetch`.
 *
 * The publishing layer injects its transport, and every adapter calls it as a
 * bare function (`fetchImpl(url, init)`). On the Cloudflare Workers runtime the
 * global `fetch` is a method of the global scope: handing the bare reference
 * around detaches it, and calling it then throws
 *
 *   Illegal invocation: function called with incorrect `this` reference.
 *
 * before any request leaves the worker — which the Meta/Instagram layers could
 * only report as "could not reach". Passing this wrapper instead keeps the
 * correct receiver, so the request is actually made and real platform errors
 * are surfaced.
 */
export const runtimeFetch: typeof fetch = (input, init) =>
  init === undefined ? globalThis.fetch(input) : globalThis.fetch(input, init);
