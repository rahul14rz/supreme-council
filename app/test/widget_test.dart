import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supreme_council/models.dart';
import 'package:supreme_council/timeline.dart';
import 'package:supreme_council/widgets/timeline_view.dart';

const verdict = Verdict(
  recommendation: 'Run a one-quarter pilot.',
  confidence: 0.6,
  agreements: ['Measure output'],
  unresolved: ['Support coverage on Fridays'],
  dissentAgent: 'risk-officer',
  dissentReason: 'Coverage gaps are irreversible for key accounts.',
  whatWouldChange: ['Pilot SLA data'],
);

void main() {
  testWidgets('timeline shows each agent turn and a verdict with prominent dissent', (tester) async {
    final timeline = DebateTimeline()
      ..apply(const TurnStart('t1', 'optimist', 'Optimist', 'opening', 1))
      ..apply(const Token('t1', 'Upside is large.'))
      ..apply(const TurnStart('t2', 'risk-officer', 'Risk Officer', 'opening', 1))
      ..apply(const TurnEnd('t2', {'status': 'failed', 'error': 'all 2 model options failed', 'failures': [], 'requests': {}}))
      ..apply(const VerdictEvent(verdict, null, SessionUsage(inputTokens: 900, outputTokens: 120, costUsd: 0.0123, requests: {'groq': 5})));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: TimelineView(timeline: timeline))));

    expect(find.text('Upside is large.'), findsOneWidget);
    expect(find.text('Turn failed: all 2 model options failed'), findsOneWidget);
    expect(find.text('Run a one-quarter pilot.'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('dissent')), matching: find.text('Dissenting opinion · Risk Officer')), findsOneWidget);
    expect(find.text('Coverage gaps are irreversible for key accounts.'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('unresolved')), matching: find.text('Support coverage on Fridays')), findsOneWidget);
    expect(find.text('\$0.0123'), findsOneWidget);
    expect(find.text('groq 5'), findsOneWidget);
  });
}
