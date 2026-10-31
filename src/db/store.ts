import Database from 'better-sqlite3';
import type { ProviderId } from '../config/schema.js';
import type { DebateEvent } from '../orchestrator/events.js';
import type { RequestCounter } from '../providers/quota.js';
import type { Verdict } from '../verdict.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  council_id TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  created_at TEXT NOT NULL,
  finished_at TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS turns (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  turn_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  phase TEXT NOT NULL,
  round INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  model TEXT,
  text TEXT,
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, turn_id)
);
CREATE TABLE IF NOT EXISTS verdicts (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  verdict TEXT,
  proposal TEXT
);
CREATE TABLE IF NOT EXISTS daily_requests (
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, provider)
);`;

export type SessionStatus = 'running' | 'complete' | 'failed';

export type SessionRow = {
  id: string; question: string; councilId: string; rounds: number; status: SessionStatus;
  createdAt: string; finishedAt: string | null; inputTokens: number; outputTokens: number; costUsd: number;
};

export type TurnRow = {
  turnId: string; agentId: string; role: string; phase: string; round: number; status: 'running' | 'ok' | 'failed';
  model: string | null; text: string | null; error: string | null; inputTokens: number; outputTokens: number; costUsd: number;
};

export type SessionDetail = { session: SessionRow; turns: TurnRow[]; verdict: Verdict | null; proposal: string | null };

const SESSION_COLUMNS = `id, question, council_id AS councilId, rounds, status, created_at AS createdAt, finished_at AS finishedAt,
  input_tokens AS inputTokens, output_tokens AS outputTokens, cost_usd AS costUsd`;

const utcDay = () => new Date().toISOString().slice(0, 10);

/** Sessions, their event log (for exact replay), projected turns and verdicts, and daily request counts. */
export class Store implements RequestCounter {
  private readonly db: Database.Database;

  constructor(path: string, private readonly today: () => string = utcDay) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  createSession(s: { id: string; question: string; councilId: string; rounds: number }): void {
    this.db.prepare(`INSERT INTO sessions (id, question, council_id, rounds, status, created_at) VALUES (?, ?, ?, ?, 'running', ?)`)
      .run(s.id, s.question, s.councilId, s.rounds, new Date().toISOString());
  }

  /** Append an event to the session log and update the turn, verdict and session tables from it. */
  append(sessionId: string, event: DebateEvent): void {
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO events (session_id, seq, type, payload)
        VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE session_id = ?), ?, ?)`)
        .run(sessionId, sessionId, event.type, JSON.stringify(event));
      this.project(sessionId, event);
    })();
  }

  private project(sessionId: string, e: DebateEvent): void {
    if (e.type === 'turn_start') {
      this.db.prepare(`INSERT INTO turns (session_id, turn_id, agent_id, role, phase, round, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`)
        .run(sessionId, e.turnId, e.agentId, e.role, e.phase, e.round);
    } else if (e.type === 'turn_end') {
      const r = e.result;
      const ok = r.status === 'ok';
      this.db.prepare(`UPDATE turns SET status = ?, model = ?, text = ?, error = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?
        WHERE session_id = ? AND turn_id = ?`)
        .run(r.status, ok ? r.model : null, ok ? r.text : null, ok ? null : r.error,
          ok ? r.usage.inputTokens : 0, ok ? r.usage.outputTokens : 0, ok ? r.costUsd : 0, sessionId, e.turnId);
    } else if (e.type === 'verdict') {
      this.db.prepare(`INSERT INTO verdicts (session_id, verdict, proposal) VALUES (?, ?, ?)`)
        .run(sessionId, e.verdict ? JSON.stringify(e.verdict) : null, e.proposal ?? null);
      this.db.prepare(`UPDATE sessions SET status = ?, finished_at = ?, input_tokens = ?, output_tokens = ?, cost_usd = ? WHERE id = ?`)
        .run(e.verdict ? 'complete' : 'failed', new Date().toISOString(), e.usage.inputTokens, e.usage.outputTokens, e.usage.costUsd, sessionId);
    }
  }

  /** Mark a session failed if its stream ended without a verdict. */
  finish(sessionId: string): void {
    this.db.prepare(`UPDATE sessions SET status = 'failed', finished_at = ? WHERE id = ? AND status = 'running'`)
      .run(new Date().toISOString(), sessionId);
  }

  /** On server start: sessions still 'running' were cut off by a restart. */
  failInterrupted(): number {
    return this.db.prepare(`UPDATE sessions SET status = 'failed', finished_at = ? WHERE status = 'running'`)
      .run(new Date().toISOString()).changes;
  }

  listSessions(limit = 100): SessionRow[] {
    return this.db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY created_at DESC LIMIT ?`).all(limit) as SessionRow[];
  }

  getSession(id: string): SessionDetail | undefined {
    const session = this.db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`).get(id) as SessionRow | undefined;
    if (!session) return undefined;
    const turns = this.db.prepare(`SELECT turn_id AS turnId, agent_id AS agentId, role, phase, round, status, model, text, error,
      input_tokens AS inputTokens, output_tokens AS outputTokens, cost_usd AS costUsd
      FROM turns WHERE session_id = ? ORDER BY CAST(SUBSTR(turn_id, 2) AS INTEGER)`).all(id) as TurnRow[];
    const v = this.db.prepare(`SELECT verdict, proposal FROM verdicts WHERE session_id = ?`).get(id) as
      { verdict: string | null; proposal: string | null } | undefined;
    return { session, turns, verdict: v?.verdict ? JSON.parse(v.verdict) as Verdict : null, proposal: v?.proposal ?? null };
  }

  events(sessionId: string): DebateEvent[] {
    return (this.db.prepare(`SELECT payload FROM events WHERE session_id = ? ORDER BY seq`).all(sessionId) as { payload: string }[])
      .map((r) => JSON.parse(r.payload) as DebateEvent);
  }

  countToday(provider: ProviderId): number {
    const row = this.db.prepare(`SELECT count FROM daily_requests WHERE day = ? AND provider = ?`).get(this.today(), provider) as
      { count: number } | undefined;
    return row?.count ?? 0;
  }

  record(provider: ProviderId): void {
    this.db.prepare(`INSERT INTO daily_requests (day, provider, count) VALUES (?, ?, 1)
      ON CONFLICT (day, provider) DO UPDATE SET count = count + 1`).run(this.today(), provider);
  }

  requestsToday(): Partial<Record<ProviderId, number>> {
    const rows = this.db.prepare(`SELECT provider, count FROM daily_requests WHERE day = ?`).all(this.today()) as
      { provider: ProviderId; count: number }[];
    return Object.fromEntries(rows.map((r) => [r.provider, r.count]));
  }

  close(): void {
    this.db.close();
  }
}
