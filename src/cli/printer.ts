import { styleText } from 'node:util';
import type { DebateEvent, Phase, SessionUsage } from '../orchestrator/events.js';
import type { Verdict } from '../verdict.js';

type Color = 'cyan' | 'magenta' | 'yellow' | 'green' | 'blue' | 'red';
const PALETTE: Color[] = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red'];
const STRUCTURED: Phase[] = ['verdict', 'preserve'];

type Turn = { id: string; header: string; buffer: string; structured: boolean; done: boolean };

/**
 * Prints the debate as a timeline. Parallel members would interleave
 * mid-sentence, so one turn streams live at a time; the others buffer and
 * print, whole, when the live one finishes.
 */
export class TimelinePrinter {
  private readonly colors = new Map<string, Color>();
  private readonly turns: Turn[] = [];
  private live: Turn | null = null;

  constructor(private readonly write: (s: string) => void) {}

  handle(e: DebateEvent): void {
    switch (e.type) {
      case 'turn_start': return this.start(e);
      case 'token': return this.token(e.turnId, e.text);
      case 'turn_end': return this.end(e.turnId, e.result.status === 'ok' ? null : e.result.error);
      case 'round_complete': return;
      case 'error': return this.error(e);
      case 'verdict': return this.verdict(e.verdict, e.proposal, e.usage);
    }
  }

  private start(e: Extract<DebateEvent, { type: 'turn_start' }>): void {
    const color = this.colorFor(e.agentId);
    const label = e.phase === 'framing' ? 'framing' : `round ${e.round} · ${e.phase}`;
    const header = `\n${styleText(['bold', color], `▸ ${e.role}`)} ${styleText('dim', `(${label})`)}\n`;
    const turn = { id: e.turnId, header, buffer: '', structured: STRUCTURED.includes(e.phase), done: false };
    this.turns.push(turn);
    if (!this.live) this.goLive(turn);
  }

  private token(turnId: string, text: string): void {
    const turn = this.find(turnId);
    if (!turn || turn.structured) return;
    if (turn === this.live) this.write(text);
    else turn.buffer += text;
  }

  private end(turnId: string, error: string | null): void {
    const turn = this.find(turnId);
    if (!turn) return;
    turn.done = true;
    if (error) turn.buffer += styleText('red', `✗ turn failed: ${error}`);
    if (turn === this.live) {
      if (error) this.write(styleText('red', `✗ turn failed: ${error}`));
      this.write('\n');
      this.turns.splice(this.turns.indexOf(turn), 1);
      this.live = null;
      this.advance();
    }
  }

  private advance(): void {
    for (const turn of this.turns.splice(0)) {
      if (turn.done) {
        this.write(turn.header + (turn.structured ? styleText('dim', '(structured output)') : turn.buffer) + '\n');
        continue;
      }
      this.turns.push(turn);
    }
    const next = this.turns[0];
    if (next) this.goLive(next);
  }

  private goLive(turn: Turn): void {
    this.live = turn;
    this.write(turn.header + (turn.structured ? styleText('dim', '(writing structured output…)') : turn.buffer));
    turn.buffer = '';
  }

  private error(e: Extract<DebateEvent, { type: 'error' }>): void {
    const turn = e.turnId ? this.find(e.turnId) : undefined;
    if (turn && e.retrying) {
      if (turn === this.live) this.write(styleText('yellow', '\n  ↻ retrying, discarding the partial reply above\n'));
      turn.buffer = '';
    }
    this.write(styleText('yellow', `\n  ! ${e.message}\n`));
  }

  private verdict(verdict: Verdict | null, proposal: string | undefined, usage: SessionUsage): void {
    const out = [`\n${styleText(['bold', 'inverse'], ' VERDICT ')}`];
    if (!verdict) {
      out.push(styleText('red', 'No valid verdict was produced. See the errors above.'));
    } else {
      out.push(`${styleText('bold', 'Recommendation:')} ${verdict.recommendation}`);
      out.push(`${styleText('bold', 'Confidence:')} ${Math.round(verdict.confidence * 100)}%`);
      if (proposal) out.push(styleText('bold', 'Final proposal:'), proposal);
      out.push(styleText(['bold', 'red'], `DISSENT (${verdict.dissent.agent}):`) + ` ${verdict.dissent.reason}`);
      out.push(...list('Unresolved disagreements', verdict.unresolved_disagreements, 'red'));
      out.push(...list('Agreements', verdict.agreements, 'green'));
      out.push(...list('What would change my mind', verdict.what_would_change_my_mind, 'yellow'));
    }
    const requests = Object.entries(usage.requests).map(([p, n]) => `${p} ${n}`).join(', ') || 'none';
    out.push(styleText('dim', `\nTokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out · `
      + `cost $${usage.costUsd.toFixed(4)} · requests: ${requests}`));
    this.write(out.join('\n') + '\n');
  }

  private find(turnId: string): Turn | undefined {
    return this.turns.find((t) => t.id === turnId);
  }

  private colorFor(agentId: string): Color {
    if (!this.colors.has(agentId)) this.colors.set(agentId, PALETTE[this.colors.size % PALETTE.length]!);
    return this.colors.get(agentId)!;
  }
}

function list(title: string, items: string[], color: Color): string[] {
  return [styleText(['bold', color], `${title}:`), ...(items.length ? items.map((i) => `  - ${i}`) : ['  (none)'])];
}
