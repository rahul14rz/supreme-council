import 'package:flutter/material.dart';

import '../theme.dart';
import '../timeline.dart';

/// What this debate has cost so far: dollars, tokens and requests per provider.
class UsageBar extends StatelessWidget {
  const UsageBar({super.key, required this.timeline});
  final DebateTimeline timeline;

  @override
  Widget build(BuildContext context) {
    final usage = timeline.usage;
    final requests = usage?.requests.entries.map((e) => '${e.key} ${e.value}').join('  ') ?? '';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Space.s24, vertical: Space.s12),
      decoration: const BoxDecoration(color: Palette.deepest, border: Border(top: BorderSide(color: Palette.hairline))),
      child: Wrap(spacing: Space.s24, runSpacing: Space.s4, crossAxisAlignment: WrapCrossAlignment.center, children: [
        _Figure(label: 'Cost', value: '\$${timeline.liveCostUsd.toStringAsFixed(4)}', accent: true),
        _Figure(label: 'Tokens', value: usage == null ? '${timeline.liveOutputTokens} out' : '${usage.outputTokens} out · ${usage.inputTokens} in'),
        if (usage != null) _Figure(label: 'Requests', value: requests.isEmpty ? 'none' : requests),
      ]),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.accent = false});
  final String label, value;
  final bool accent;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: Txt.meta),
        const SizedBox(width: Space.s8),
        Text(value, style: Txt.figure.copyWith(color: accent ? Palette.brass : Palette.text)),
      ]);
}
