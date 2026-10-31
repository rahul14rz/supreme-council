import type { DebateEvent } from '../orchestrator/events.js';

type Listener = (event: DebateEvent | null) => void; // null: the session ended

/**
 * Debates in progress. A subscriber first receives every event so far, then
 * live events. Finished sessions are dropped; they replay from the store.
 */
export class LiveSessions {
  private readonly sessions = new Map<string, { events: DebateEvent[]; listeners: Set<Listener> }>();

  run(id: string, events: AsyncIterable<DebateEvent>, onError: (err: unknown) => void): void {
    const session = { events: [] as DebateEvent[], listeners: new Set<Listener>() };
    this.sessions.set(id, session);
    void (async () => {
      try {
        for await (const event of events) {
          session.events.push(event);
          for (const listener of session.listeners) listener(event);
        }
      } catch (err) {
        onError(err);
      } finally {
        this.sessions.delete(id);
        for (const listener of session.listeners) listener(null);
      }
    })();
  }

  /** Returns an unsubscribe function, or null if the session is not running. */
  subscribe(id: string, listener: Listener): (() => void) | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    for (const event of session.events) listener(event);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }
}
