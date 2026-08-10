import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DisposableDb = {
  port: number;
  dbname: string;
  psql: (sql: string) => string;
  psqlAs: (user: string, sql: string) => string;
  file: (filePath: string) => void;
  fileAs: (user: string, filePath: string) => void;
};

type Cluster = {
  workdir: string;
  datadir: string;
  port: number;
  log: string;
};

const GLOBAL_KEY = "__extint_rpc_cluster__";

const g = globalThis as unknown as {
  [GLOBAL_KEY]?: { cluster: Cluster | null; dbCounter: number };
};

if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { cluster: null, dbCounter: 0 };
}

function startCluster(): Cluster {
  if (g[GLOBAL_KEY]!.cluster) return g[GLOBAL_KEY]!.cluster!;

  let lastLog = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "extint-rpc-cluster-"));
    const datadir = path.join(workdir, "pgdata");
    const log = path.join(workdir, "postgres.log");

    const baseEnv = { ...process.env, LC_ALL: "C", LANG: "C" };

    execFileSync("initdb", ["-D", datadir], { stdio: "ignore", env: baseEnv });

    const port = 56000 + Math.floor(Math.random() * 2000);
    fs.appendFileSync(
      path.join(datadir, "postgresql.conf"),
      `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`
    );

    try {
      execFileSync("pg_ctl", ["-D", datadir, "-l", log, "start"], { stdio: "ignore", env: baseEnv });
      g[GLOBAL_KEY]!.cluster = { workdir, datadir, port, log };
      break;
    } catch {
      lastLog = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "(no log)";
      try {
        execFileSync("pg_ctl", ["-D", datadir, "stop", "-m", "fast"], { stdio: "ignore" });
      } catch {
        // ignore
      }
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  if (!g[GLOBAL_KEY]!.cluster) {
    throw new Error(`Failed to start disposable Postgres cluster after retries. Last log:\n${lastLog}`);
  }

  const { workdir, datadir } = g[GLOBAL_KEY]!.cluster;

  process.once("exit", () => {
    try {
      execFileSync("pg_ctl", ["-D", datadir, "stop", "-m", "fast"], {
        stdio: "ignore",
        env: { ...process.env, LC_ALL: "C", LANG: "C" }
      });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(workdir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  return g[GLOBAL_KEY]!.cluster!;
}

export function createDisposableDb(): DisposableDb {
  const c = startCluster();
  const dbname = `extint_rpc_${process.pid}_${Date.now()}_${g[GLOBAL_KEY]!.dbCounter++}`;

  const baseEnv = { ...process.env, LC_ALL: "C", LANG: "C" };

  execFileSync("createdb", ["-h", "127.0.0.1", "-p", String(c.port), dbname], { stdio: "ignore", env: baseEnv });

  // Supabase production installs `pgcrypto` in the `extensions` schema.
  // Our RPCs run SECURITY DEFINER with `search_path=public`, so schema-qualified
  // calls must work even when `extensions` is not on the search_path.
  execFileSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(c.port),
      "-d",
      dbname,
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-t",
      "-A",
      "-c",
      "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
    ],
    { encoding: "utf8", env: baseEnv }
  );

  // Supabase provides auth.jwt() in production. For disposable DB tests, we emulate it using request.jwt.claims.
  execFileSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(c.port),
      "-d",
      dbname,
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-t",
      "-A",
      "-c",
      "create schema if not exists auth; create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}' )::jsonb $$;"
    ],
    { encoding: "utf8", env: baseEnv }
  );

  const psql = (sql: string) => {
    return execFileSync(
      "psql",
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(c.port),
        "-d",
        dbname,
        "-v",
        "ON_ERROR_STOP=1",
        "-X",
        "-q",
        "-t",
        "-A",
        "-c",
        sql
      ],
      { encoding: "utf8", env: baseEnv }
    ).trim();
  };

  const psqlAs = (user: string, sql: string) => {
    // Supabase RPCs require a PostgREST JWT role claim (not session_user).
    // For disposable DB tests we emulate the claim for service_role calls.
    const shouldInjectJwtRoleClaim =
      user === "service_role" &&
      !sql.includes("/*no_jwt*/") &&
      !sql.includes("request.jwt.claim.role") &&
      !sql.includes("request.jwt.claims");

    const effectiveSql = shouldInjectJwtRoleClaim
      ? `select set_config('request.jwt.claim.role','service_role', true); select set_config('request.jwt.claims','{"role":"service_role","ref":"ibjsjosplgbqevmnvvpf"}', true); ${sql}`
      : sql;
    return execFileSync(
      "psql",
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(c.port),
        "-U",
        user,
        "-d",
        dbname,
        "-v",
        "ON_ERROR_STOP=1",
        "-X",
        "-q",
        "-t",
        "-A",
        "-c",
        effectiveSql
      ],
      { encoding: "utf8", env: baseEnv }
    ).trim();
  };

  const file = (filePath: string) => {
    try {
      execFileSync(
        "psql",
        ["-h", "127.0.0.1", "-p", String(c.port), "-d", dbname, "-v", "ON_ERROR_STOP=1", "-X", "-f", filePath],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: baseEnv }
      );
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      throw new Error(`psql -f failed for ${filePath}: ${e.message}\nSTDERR:\n${e.stderr ?? ""}`);
    }
  };

  const fileAs = (user: string, filePath: string) => {
    try {
      execFileSync(
        "psql",
        [
          "-h",
          "127.0.0.1",
          "-p",
          String(c.port),
          "-U",
          user,
          "-d",
          dbname,
          "-v",
          "ON_ERROR_STOP=1",
          "-X",
          "-f",
          filePath
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: baseEnv }
      );
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      throw new Error(`psql -U ${user} -f failed for ${filePath}: ${e.message}\nSTDERR:\n${e.stderr ?? ""}`);
    }
  };

  return { port: c.port, dbname, psql, psqlAs, file, fileAs };
}
