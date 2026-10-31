import 'package:flutter/material.dart';

import '../theme.dart';
import '../timeline.dart';
import 'agent_style.dart';
import 'turn_card.dart';
import 'usage_bar.dart';
import 'verdict_card.dart';

/// The record of a debate, live or replayed: the bench, turns grouped by
/// round, then the ruling, with the running cost pinned at the bottom.
class TimelineView extends StatelessWidget {
  const TimelineView({super.key, required this.timeline, this.members, this.header});
  final DebateTimeline timeline;
  final List<({String id, String role})>? members;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: timeline,
      builder: (context, _) {
        final roles = {for (final t in timeline.turns) t.start.agentId: t.start.role};
        final bench = members ?? [for (final e in roles.entries) (id: e.key, role: e.value)];
        final speaking = {for (final t in timeline.turns) if (t.status == TurnStatus.running) t.start.agentId};
        return Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(Space.s24, Space.s8, Space.s24, Space.s24), children: [
              if (header != null) header!,
              if (bench.isNotEmpty) ...[
                const SizedBox(height: Space.s16),
                Bench(members: bench, speaking: speaking),
              ],
              ..._record(),
              for (final e in timeline.errors)
                Padding(padding: const EdgeInsets.only(top: Space.s12), child: Text(e, style: Txt.meta.copyWith(color: Palette.negative))),
              if (timeline.verdict != null) ...[
                const SectionHeader('Ruling'),
                VerdictCard(verdict: timeline.verdict!, proposal: timeline.proposal, roles: roles, turnCount: timeline.turns.length),
              ],
              if (timeline.finished && timeline.verdict == null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.s24),
                  child: Panel(child: Text('No valid ruling was produced. The turns above show what failed.', style: Txt.body.copyWith(color: Palette.text2))),
                ),
            ]),
          ),
          UsageBar(timeline: timeline),
        ]);
      },
    );
  }

  /// Turns with a heading wherever the section changes. Once the ruling is in,
  /// the document replaces the Chair's ruling turns.
  List<Widget> _record() {
    final out = <Widget>[];
    String? section;
    var seat = 0;
    for (final turn in timeline.turns) {
      if (turn.start.phase == 'verdict' && timeline.verdict != null) continue;
      final title = sectionTitle(turn.start.phase, turn.start.round);
      if (title != section) {
        section = title;
        seat = 0;
        out.add(SectionHeader(title));
      }
      seat++;
      out.add(Padding(padding: const EdgeInsets.only(bottom: Space.s12), child: TurnCard(turn: turn, seat: seat)));
    }
    return out;
  }
}
