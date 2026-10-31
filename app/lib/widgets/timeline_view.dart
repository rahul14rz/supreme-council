import 'package:flutter/material.dart';

import '../timeline.dart';
import 'turn_card.dart';
import 'usage_bar.dart';
import 'verdict_card.dart';

/// The live (or replayed) debate: turns, then the verdict, with usage pinned at the bottom.
class TimelineView extends StatelessWidget {
  const TimelineView({super.key, required this.timeline});
  final DebateTimeline timeline;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: timeline,
      builder: (context, _) {
        final roles = {for (final t in timeline.turns) t.start.agentId: t.start.role};
        return Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.all(12), children: [
              for (final turn in timeline.turns) TurnCard(turn: turn),
              for (final e in timeline.errors)
                Text('⚠ $e', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              if (timeline.verdict != null) VerdictCard(verdict: timeline.verdict!, proposal: timeline.proposal, roles: roles),
              if (timeline.finished && timeline.verdict == null)
                const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No valid verdict was produced. See the errors above.'))),
            ]),
          ),
          UsageBar(timeline: timeline),
        ]);
      },
    );
  }
}
