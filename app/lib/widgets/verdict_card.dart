import 'package:flutter/material.dart';

import '../models.dart';
import 'agent_style.dart';

/// The chair's ruling. Dissent and unresolved disagreements are shown first and loudest.
class VerdictCard extends StatelessWidget {
  const VerdictCard({super.key, required this.verdict, this.proposal, required this.roles});
  final Verdict verdict;
  final String? proposal;
  final Map<String, String> roles;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dissenter = verdict.dissentAgent;
    final hasDissent = dissenter != 'none';
    return Card(
      elevation: 3,
      margin: const EdgeInsets.symmetric(vertical: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.gavel),
            const SizedBox(width: 8),
            Text('Verdict', style: theme.textTheme.titleLarge),
          ]),
          const SizedBox(height: 12),
          Text(verdict.recommendation, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Row(children: [
            Text('Confidence ${(verdict.confidence * 100).round()}%'),
            const SizedBox(width: 12),
            Expanded(child: LinearProgressIndicator(value: verdict.confidence)),
          ]),
          if (proposal != null) ...[
            const SizedBox(height: 12),
            Text('Final proposal', style: theme.textTheme.titleSmall),
            SelectableText(proposal!),
          ],
          const SizedBox(height: 16),
          Container(
            key: const Key('dissent'),
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.errorContainer,
              border: Border.all(color: theme.colorScheme.error, width: 2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (hasDissent) AgentAvatar(agentId: dissenter, role: roles[dissenter] ?? dissenter, radius: 16),
              if (hasDissent) const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(hasDissent ? 'DISSENT · ${roles[dissenter] ?? dissenter}' : 'No dissent recorded',
                      style: theme.textTheme.titleSmall?.copyWith(color: theme.colorScheme.onErrorContainer, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(verdict.dissentReason, style: TextStyle(color: theme.colorScheme.onErrorContainer)),
                ]),
              ),
            ]),
          ),
          _section(context, 'Unresolved disagreements', verdict.unresolved, Icons.warning_amber, theme.colorScheme.error, key: const Key('unresolved')),
          _section(context, 'Agreements', verdict.agreements, Icons.check_circle_outline, Colors.green.shade700),
          _section(context, 'What would change my mind', verdict.whatWouldChange, Icons.sync_alt, theme.colorScheme.primary),
        ]),
      ),
    );
  }

  Widget _section(BuildContext context, String title, List<String> items, IconData icon, Color color, {Key? key}) {
    return Padding(
      key: key,
      padding: const EdgeInsets.only(top: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: color, fontWeight: FontWeight.bold)),
        if (items.isEmpty) const Text('None'),
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Expanded(child: Text(item)),
            ]),
          ),
      ]),
    );
  }
}
