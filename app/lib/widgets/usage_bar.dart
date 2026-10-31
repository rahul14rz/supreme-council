import 'package:flutter/material.dart';

import '../timeline.dart';

/// Per-debate cost, tokens and requests per provider. Updates live, then shows the final totals.
class UsageBar extends StatelessWidget {
  const UsageBar({super.key, required this.timeline});
  final DebateTimeline timeline;

  @override
  Widget build(BuildContext context) {
    final usage = timeline.usage;
    final requests = usage?.requests.entries.map((e) => '${e.key} ${e.value}').join(' · ');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Wrap(spacing: 16, runSpacing: 4, children: [
        Text('Cost \$${timeline.liveCostUsd.toStringAsFixed(4)}'),
        Text('${timeline.liveOutputTokens} output tokens${usage == null ? '' : ' · ${usage.inputTokens} input'}'),
        if (requests != null) Text('Requests: ${requests.isEmpty ? 'none' : requests}'),
      ]),
    );
  }
}
