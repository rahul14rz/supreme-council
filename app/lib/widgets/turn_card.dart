import 'package:flutter/material.dart';

import '../theme.dart';
import '../timeline.dart';
import 'agent_style.dart';

/// Section heading in the record: Framing, Round 1 · Opening positions, Cycle 2, Ruling.
String sectionTitle(String phase, int round) => switch (phase) {
      'framing' => 'Framing',
      'opening' => 'Round 1 · Opening positions',
      'rebuttal' => 'Round 2 · Rebuttals',
      'final' => 'Round 3 · Final stances',
      'verdict' => 'Ruling',
      _ => 'Cycle $round · Create, critique, preserve',
    };

/// Docket mark: round and the turn's place in it, e.g. "§ 2·03".
String docketMark(TurnView turn, int seat) => '§ ${turn.start.round}·${seat.toString().padLeft(2, '0')}';

class TurnCard extends StatelessWidget {
  const TurnCard({super.key, required this.turn, required this.seat});
  final TurnView turn;
  final int seat;

  @override
  Widget build(BuildContext context) {
    final color = agentColor(turn.start.agentId);
    final running = turn.status == TurnStatus.running;
    return Entrance(
      child: Panel(
        borderColor: running ? Palette.hairlineStrong : Palette.hairline,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Seat(agentId: turn.start.agentId, role: turn.start.role, size: 32, speaking: running),
            const SizedBox(width: Space.s12),
            Expanded(child: Text(turn.start.role, style: Txt.role.copyWith(color: color))),
            if (running) ...[
              const StatusDot(color: Palette.brass, live: true, size: 6),
              const SizedBox(width: Space.s8),
              Text('Speaking', style: Txt.meta.copyWith(color: Palette.text2)),
              const SizedBox(width: Space.s12),
            ],
            Text(docketMark(turn, seat), style: Txt.meta),
          ]),
          const SizedBox(height: Space.s12),
          _body(),
          for (final note in turn.notes) _Note(note),
          if (turn.model != null) ...[
            const SizedBox(height: Space.s12),
            Text('${turn.model} · ${turn.outputTokens} tok · \$${turn.costUsd.toStringAsFixed(4)}', style: Txt.meta),
          ],
        ]),
      ),
    );
  }

  Widget _body() {
    if (turn.status == TurnStatus.failed) {
      return Text('Turn failed: ${turn.error}', style: Txt.body.copyWith(color: Palette.negative));
    }
    if (!turn.structured) {
      return SelectableText(turn.text.isEmpty ? 'Taking the floor' : turn.text,
          style: turn.text.isEmpty ? Txt.body.copyWith(color: Palette.muted) : Txt.body);
    }
    if (turn.status == TurnStatus.running) {
      return Text(turn.start.phase == 'verdict' ? 'Writing the ruling' : 'Weighing the critique', style: Txt.body.copyWith(color: Palette.text2));
    }
    final keeper = turn.keeperOutput;
    if (keeper == null) return Text('Ruling entered on the record below', style: Txt.body.copyWith(color: Palette.text2));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(keeper.changed ? 'Changed materially this cycle' : 'No material change, so the loop closes',
          style: Txt.label.copyWith(color: keeper.changed ? Palette.brass : Palette.text2)),
      const SizedBox(height: Space.s8),
      SelectableText(keeper.proposal, style: Txt.body),
    ]);
  }
}

/// A retry or fallback note: routine, so muted rather than alarming.
class _Note extends StatelessWidget {
  const _Note(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: Space.s8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 1), child: Icon(Icons.subdirectory_arrow_right, size: 14)),
          const SizedBox(width: Space.s8),
          Expanded(child: Text(text, style: Txt.meta)),
        ]),
      );
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: Space.s24, bottom: Space.s12),
        child: Row(children: [
          Text(title, style: Txt.label),
          const SizedBox(width: Space.s12),
          const Expanded(child: Divider()),
        ]),
      );
}
