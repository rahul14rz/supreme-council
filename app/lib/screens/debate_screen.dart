import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../timeline.dart';
import '../widgets/timeline_view.dart';

/// Feed a session's events into a timeline until the stream ends.
Future<void> follow(Api api, String sessionId, DebateTimeline timeline) async {
  try {
    await for (final event in api.stream(sessionId)) {
      timeline.apply(event);
    }
  } catch (e) {
    timeline.apply(ErrorEvent('Connection lost: $e', null, false));
  } finally {
    timeline.finish();
  }
}

class DebateScreen extends StatefulWidget {
  const DebateScreen({super.key, required this.api});
  final Api api;

  @override
  State<DebateScreen> createState() => _DebateScreenState();
}

class _DebateScreenState extends State<DebateScreen> {
  final _question = TextEditingController();
  late Future<List<Council>> _councils = widget.api.councils();
  Council? _council;
  int _rounds = 3;
  DebateTimeline? _timeline;
  String? _error;

  Future<void> _start() async {
    final council = _council;
    if (council == null || _question.text.trim().isEmpty) return;
    setState(() => _error = null);
    try {
      final id = await widget.api.createSession(question: _question.text.trim(), councilId: council.id, rounds: _rounds);
      final timeline = DebateTimeline();
      setState(() => _timeline = timeline);
      await follow(widget.api, id, timeline);
    } on Exception catch (e) {
      setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeline = _timeline;
    if (timeline != null) {
      return Column(children: [
        ListTile(
          title: Text(_question.text, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(_council!.name),
          trailing: ListenableBuilder(
            listenable: timeline,
            builder: (_, __) => TextButton(
              onPressed: timeline.finished ? () => setState(() => _timeline = null) : null,
              child: const Text('New question'),
            ),
          ),
        ),
        Expanded(child: TimelineView(timeline: timeline)),
      ]);
    }
    return FutureBuilder<List<Council>>(
      future: _councils,
      builder: (context, snap) {
        if (snap.hasError) {
          return _Retry(message: 'Cannot reach the server at $apiBaseUrl.\n${snap.error}', onRetry: () => setState(() => _councils = widget.api.councils()));
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final councils = snap.data!;
        final council = _council ??= councils.firstWhere((c) => c.id == 'supreme-free', orElse: () => councils.first);
        return ListView(padding: const EdgeInsets.all(16), children: [
          TextField(
            controller: _question,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(labelText: 'Your question', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: council.id,
            decoration: const InputDecoration(labelText: 'Council', border: OutlineInputBorder()),
            items: [
              for (final c in councils)
                DropdownMenuItem(value: c.id, child: Text('${c.name}${c.state == 'blocked' ? ' (unavailable)' : ''}')),
            ],
            onChanged: (id) => setState(() {
              _council = councils.firstWhere((c) => c.id == id);
              _rounds = _council!.maxRounds;
            }),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 6, children: [for (final m in council.members) Chip(label: Text(m.role))]),
          const SizedBox(height: 8),
          Row(children: [
            Text(council.isLoop ? 'Max cycles' : 'Rounds'),
            Expanded(
              child: Slider(
                value: _rounds.clamp(council.minRounds, council.maxRounds).toDouble(),
                min: council.minRounds.toDouble(),
                max: council.maxRounds.toDouble(),
                divisions: council.maxRounds - council.minRounds == 0 ? null : council.maxRounds - council.minRounds,
                label: '$_rounds',
                onChanged: council.maxRounds == council.minRounds ? null : (v) => setState(() => _rounds = v.round()),
              ),
            ),
            Text('${_rounds.clamp(council.minRounds, council.maxRounds)}'),
          ]),
          if (council.state == 'blocked')
            const Text('Some members have no available provider; their turns will fail. Check the Providers tab.'),
          const Text('Free tiers may use your question for training. Do not send confidential questions through them.',
              style: TextStyle(fontSize: 12)),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _start, icon: const Icon(Icons.gavel), label: const Text('Convene the council')),
        ]);
      },
    );
  }
}

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ]),
        ),
      );
}
