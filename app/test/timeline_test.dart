import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:supreme_council/api.dart';
import 'package:supreme_council/models.dart';
import 'package:supreme_council/timeline.dart';

void main() {
  test('parses a real SSE stream from the server into a finished timeline', () async {
    // Captured from `npm start -- --mock` with curl, so this checks the wire contract.
    final sse = File('test/fixtures/mock_session.sse').openRead().map(String.fromCharCodes);
    final timeline = DebateTimeline();
    await for (final e in parseSse(sse)) {
      timeline.apply(e);
    }
    expect(timeline.turns, hasLength(10));
    expect(timeline.turns.first.start.phase, 'framing');
    expect(timeline.turns.every((t) => t.status == TurnStatus.ok), isTrue);
    expect(timeline.turns[1].text, contains('Optimist'));
    expect(timeline.verdict!.dissentAgent, 'optimist');
    expect(timeline.usage!.requests.values.reduce((a, b) => a + b), 10);
  });

  test('a retrying error discards the turn text streamed so far', () {
    final t = DebateTimeline()
      ..apply(const TurnStart('t1', 'skeptic', 'Skeptic', 'opening', 1))
      ..apply(const Token('t1', 'half a sen'))
      ..apply(const ErrorEvent('groq rate_limit', 't1', true))
      ..apply(const Token('t1', 'Full answer.'));
    expect(t.turns.single.text, 'Full answer.');
    expect(t.turns.single.notes, ['groq rate_limit']);
  });

  test('a failed turn keeps its error and the debate continues', () {
    final t = DebateTimeline()
      ..apply(const TurnStart('t1', 'risk-officer', 'Risk Officer', 'opening', 1))
      ..apply(const TurnEnd('t1', {'status': 'failed', 'error': 'all 3 model options failed', 'failures': [], 'requests': {}}))
      ..apply(const TurnStart('t2', 'skeptic', 'Skeptic', 'opening', 1));
    expect(t.turns.first.status, TurnStatus.failed);
    expect(t.turns.first.error, contains('all 3'));
    expect(t.turns, hasLength(2));
  });

  test('reads the Keeper proposal and changed flag from its JSON', () {
    final t = DebateTimeline()
      ..apply(const TurnStart('t3', 'keeper', 'Keeper', 'preserve', 1))
      ..apply(const TurnEnd('t3', {
        'status': 'ok',
        'text': '{"changed": false, "proposal": "1. Pilot.", "verdict": {}}',
        'model': 'groq:x',
        'usage': {'inputTokens': 1, 'outputTokens': 2},
        'costUsd': 0,
      }));
    expect(t.turns.single.keeperOutput, (changed: false, proposal: '1. Pilot.'));
  });
}
