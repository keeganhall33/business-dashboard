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

    type BuilderResult = { data: Array<Record<string, unknown>>; error: null };

    const builder: {
      select: () => typeof builder;
      eq: (col: string, val: unknown) => typeof builder;
      limit: () => typeof builder;
      order: (col: string, opts: { ascending: boolean }) => typeof builder;
      then: (resolve: (v: BuilderResult) => unknown, reject: (e: unknown) => unknown) => Promise<unknown>;
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
      upsert: () => Promise<{ error: null }>;
      insert: () => Promise<{ error: null }>;
    } = {
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
      // Supabase/PostgREST builders are thenable; repository code awaits select/eq/order directly.
      then(resolve: (v: BuilderResult) => unknown, reject: (e: unknown) => unknown) {
        try {
          const rows = (tableData.get(state.table) ?? []) as Array<Record<string, unknown>>;
          let filtered = rows.filter((r) => state.filters.every((f) => r[f.col] === f.val));
          if (state.order) {
            const { col, asc } = state.order;
            filtered = filtered.slice().sort((a, b) => {
              const av = a[col];
              const bv = b[col];
              if (av === bv) return 0;
              return av > bv ? (asc ? 1 : -1) : asc ? -1 : 1;
            });
          }
          return Promise.resolve(resolve({ data: filtered, error: null }));
        } catch (e) {
          return Promise.resolve(reject(e));
        }
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
