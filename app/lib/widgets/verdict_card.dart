import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// The ruling, set like a written opinion on paper. The dissenting opinion
/// comes straight after the recommendation, ahead of everything else.
class VerdictCard extends StatelessWidget {
  const VerdictCard({super.key, required this.verdict, this.proposal, required this.roles, this.turnCount});
  final Verdict verdict;
  final String? proposal;
  final Map<String, String> roles;
  final int? turnCount;

  @override
  Widget build(BuildContext context) {
    final dissenter = verdict.dissentAgent;
    final hasDissent = dissenter != 'none';
    final confidence = (verdict.confidence * 100).round();
    return Entrance(
      child: Container(
        margin: const EdgeInsets.only(top: Space.s8, bottom: Space.s24),
        padding: const EdgeInsets.fromLTRB(Space.s24, Space.s24, Space.s24, Space.s20),
        decoration: BoxDecoration(
          color: Palette.paper,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 32, offset: Offset(0, 12))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Ruling of the council', style: Txt.paperMeta)),
            Text('Confidence $confidence%', style: Txt.paperMeta.copyWith(color: Palette.paperInk)),
          ]),
          const SizedBox(height: Space.s8),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(value: verdict.confidence, minHeight: 3, color: Palette.paperInk, backgroundColor: Palette.paperRule),
          ),
          const SizedBox(height: Space.s20),
          SelectableText(verdict.recommendation, style: Txt.ruling),
          if (proposal != null) ...[
            const SizedBox(height: Space.s20),
            const Text('Final proposal', style: Txt.paperLabel),
            const SizedBox(height: Space.s8),
            SelectableText(proposal!, style: Txt.paperBody),
          ],
          const SizedBox(height: Space.s24),
          Container(
            key: const Key('dissent'),
            padding: const EdgeInsets.only(left: Space.s16),
            decoration: const BoxDecoration(border: Border(left: BorderSide(color: Palette.vermilion, width: 3))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(hasDissent ? 'Dissenting opinion · ${roles[dissenter] ?? dissenter}' : 'No dissent recorded',
                  style: Txt.paperLabel.copyWith(color: Palette.vermilion)),
              const SizedBox(height: Space.s8),
              SelectableText(verdict.dissentReason, style: Txt.opinion),
            ]),
          ),
          _Clauses(key: const Key('unresolved'), title: 'Unresolved disagreements', items: verdict.unresolved, numberColor: Palette.vermilion),
          _Clauses(title: 'Agreed by the members', items: verdict.agreements),
          _Clauses(title: 'What would change this ruling', items: verdict.whatWouldChange),
          const SizedBox(height: Space.s24),
          Container(height: 1, color: Palette.paperRule),
          const SizedBox(height: Space.s12),
          Text(turnCount == null ? 'Entered on the record' : 'Entered on the record after $turnCount turns', style: Txt.paperMeta),
        ]),
      ),
    );
  }
}

class _Clauses extends StatelessWidget {
  const _Clauses({super.key, required this.title, required this.items, this.numberColor = Palette.paperInk2});
  final String title;
  final List<String> items;
  final Color numberColor;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: Space.s24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Txt.paperLabel),
          const SizedBox(height: Space.s8),
          if (items.isEmpty) Text('None', style: Txt.paperBody.copyWith(color: Palette.paperInk2)),
          for (final (i, item) in items.indexed)
            Padding(
              padding: const EdgeInsets.only(top: Space.s4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 24, child: Text('${i + 1}.', style: Txt.paperMeta.copyWith(color: numberColor, height: 1.85))),
                Expanded(child: Text(item, style: Txt.paperBody)),
              ]),
            ),
        ]),
      );
}
