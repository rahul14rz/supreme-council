import 'package:flutter/material.dart';

import '../timeline.dart';
import 'agent_style.dart';

String phaseLabel(String phase, int round) => switch (phase) {
      'framing' => 'Framing',
      'opening' => 'Round 1 · Opening',
      'rebuttal' => 'Round 2 · Rebuttal',
      'final' => 'Round 3 · Final stance',
      'verdict' => 'Ruling',
      _ => 'Cycle $round · ${phase[0].toUpperCase()}${phase.substring(1)}',
    };

/// One agent turn in the chat-style timeline.
class TurnCard extends StatelessWidget {
  const TurnCard({super.key, required this.turn});
  final TurnView turn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = AgentStyle.of(turn.start.agentId).color;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AgentAvatar(agentId: turn.start.agentId, role: turn.start.role),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.07),
              border: Border(left: BorderSide(color: color, width: 3)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(turn.start.role, style: theme.textTheme.titleSmall?.copyWith(color: color, fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                Expanded(child: Text(phaseLabel(turn.start.phase, turn.start.round), style: theme.textTheme.labelSmall)),
                if (turn.status == TurnStatus.running) const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
              ]),
              const SizedBox(height: 6),
              _body(theme),
              for (final note in turn.notes)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('⚠ $note', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
                ),
              if (turn.model != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('${turn.model} · ${turn.outputTokens} tokens · \$${turn.costUsd.toStringAsFixed(4)}', style: theme.textTheme.labelSmall),
                ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _body(ThemeData theme) {
    if (turn.status == TurnStatus.failed) {
      return Text('Turn failed: ${turn.error}', style: TextStyle(color: theme.colorScheme.error));
    }
    if (!turn.structured) return SelectableText(turn.text.isEmpty ? '…' : turn.text);
    if (turn.status == TurnStatus.running) return const Text('Writing the ruling…', style: TextStyle(fontStyle: FontStyle.italic));
    final keeper = turn.keeperOutput;
    if (keeper != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(keeper.changed ? 'Proposal changed materially this cycle' : 'No material change: the loop stops here',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        SelectableText(keeper.proposal),
      ]);
    }
    return const Text('Ruling written (see the verdict below).', style: TextStyle(fontStyle: FontStyle.italic));
  }
}
