export type RpcCall = { fn: string; args: Record<string, unknown> };

export class MockSupabaseClient {
  rpcCalls: RpcCall[] = [];

  // Configure per-fn behavior.
  private rpcHandlers = new Map<
    string,
    (args: Record<string, unknown>) => { data: unknown; error: { message: string; code?: string } | null }
  >();

  onRpc(
    fn: string,
    handler: (args: Record<string, unknown>) => { data: unknown; error: { message: string; code?: string } | null }
  ) {
    this.rpcHandlers.set(fn, handler);
  }

  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    const h = this.rpcHandlers.get(fn);
    if (!h) {
      return Promise.resolve({ data: null, error: { message: `unhandled_rpc:${fn}` } });
    }
    return Promise.resolve(h(args));
  }

  // Minimal PostgREST chain for exact-version reads.
  private tableData = new Map<string, unknown[]>();
  seedTable(table: string, rows: unknown[]) {
    this.tableData.set(table, rows);
  }

  from(table: string) {
    const tableData = this.tableData;
    const state: { table: string; filters: Array<{ col: string; val: unknown }>; order?: { col: string; asc: boolean } } = {
      table,
      filters: []
    };

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, val });
        return builder;
      },
      limit() {
        return builder;
      },
      order(col: string, opts: { ascending: boolean }) {
        state.order = { col, asc: opts.ascending };
        return builder;
      },
      async maybeSingle() {
        const rows = (tableData.get(state.table) ?? []) as Array<Record<string, unknown>>;
        const filtered = rows.filter((r) => state.filters.every((f) => r[f.col] === f.val));
        const data = filtered[0] ?? null;
        return { data, error: null } as const;
      },
      async upsert() {
        return { error: null } as const;
      },
      async insert() {
        return { error: null } as const;
      }
    };

    return builder;
  }
}
