/* eslint-disable @typescript-eslint/no-explicit-any -- test double mirrors the untyped PostgREST builder surface */
/**
 * In-memory stand-in for the Supabase clients used by the guest SpaceFit
 * server boundary.
 *
 * Only the query surface `guest.server.ts` actually uses is implemented, and
 * the semantics that matter for security are faithful: filters, counts,
 * single/maybeSingle, and the unique (session_id, client_request_id) index that
 * makes duplicate scans impossible.
 */

type Row = Record<string, any>;
type Filter = [string, "eq" | "gte" | "is", unknown];

export interface StorageCall {
  bucket: string;
  paths: string[];
}

export class FakeSupabase {
  tables = new Map<string, Row[]>();
  uploads: { bucket: string; path: string; contentType: string }[] = [];
  removals: StorageCall[] = [];
  rpcCalls: { fn: string; args: unknown }[] = [];
  /** Set to force every storage upload to fail. */
  uploadFails = false;
  private seq = 0;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  seed(table: string, row: Row): Row {
    const stored = { id: `id-${++this.seq}`, created_at: new Date().toISOString(), ...row };
    this.rows(table).push(stored);
    return stored;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(fn: string, args?: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: null, error: null });
  }

  nextId() {
    return `id-${++this.seq}`;
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, _body: unknown, opts: { contentType: string }) => {
        if (this.uploadFails) return { error: new Error("upload failed") };
        this.uploads.push({ bucket, path, contentType: opts.contentType });
        return { error: null };
      },
      remove: async (paths: string[]) => {
        this.removals.push({ bucket, paths });
        return { error: null };
      },
    }),
  };
}

class FakeQuery implements PromiseLike<{ data: any; error: any; count?: number }> {
  private op: "select" | "insert" | "update" = "select";
  private filters: Filter[] = [];
  private payload: Row | null = null;
  private wantCount = false;
  private limitN: number | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }

  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, "eq", value]);
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push([column, "gte", value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push([column, "is", value]);
    return this;
  }

  order() {
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, kind, value]) => {
      const current = row[column] ?? null;
      if (kind === "eq") return current === value;
      if (kind === "is") return current === value;
      return String(current) >= String(value);
    });
  }

  private matched(): Row[] {
    const rows = this.db.rows(this.table).filter((row) => this.matches(row));
    return this.limitN === null ? rows : rows.slice(0, this.limitN);
  }

  private execute(): { data: any; error: any; count?: number } {
    if (this.op === "insert") {
      const payload = this.payload ?? {};
      // Faithful to the unique (session_id, client_request_id) index.
      if (
        this.table === "guest_spacefit_runs" &&
        payload["client_request_id"] &&
        this.db
          .rows(this.table)
          .some(
            (row) =>
              row["session_id"] === payload["session_id"] &&
              row["client_request_id"] === payload["client_request_id"],
          )
      ) {
        return { data: null, error: { message: "duplicate key" } };
      }
      const rows = Array.isArray(payload) ? payload : [payload];
      const inserted = rows.map((row) => {
        const stored = {
          id: this.db.nextId(),
          created_at: new Date().toISOString(),
          ...row,
        };
        this.db.rows(this.table).push(stored);
        return stored;
      });
      return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
    }

    if (this.op === "update") {
      const rows = this.matched();
      for (const row of rows) Object.assign(row, this.payload);
      return { data: rows, error: null };
    }

    const rows = this.matched();
    if (this.wantCount) return { data: null, error: null, count: rows.length };
    return { data: rows, error: null };
  }

  async single() {
    const result = this.execute();
    if (this.op === "select") {
      const rows = result.data as Row[];
      if (rows.length !== 1) return { data: null, error: { message: "no rows" } };
      return { data: rows[0], error: null };
    }
    return result;
  }

  async maybeSingle() {
    const result = this.execute();
    if (this.op === "select") {
      const rows = result.data as Row[];
      return { data: rows[0] ?? null, error: null };
    }
    return result;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
