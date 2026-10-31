import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../timeline.dart';
import '../widgets/timeline_view.dart';
import 'debate_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.api});
  final Api api;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<SessionSummary>> _sessions = widget.api.sessions();

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        setState(() => _sessions = widget.api.sessions());
        await _sessions;
      },
      child: FutureBuilder<List<SessionSummary>>(
        future: _sessions,
        builder: (context, snap) {
          if (snap.hasError) return ListView(children: [ListTile(title: Text('Cannot load history: ${snap.error}'))]);
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          if (snap.data!.isEmpty) return ListView(children: const [ListTile(title: Text('No debates yet.'))]);
          return ListView(children: [
            for (final s in snap.data!)
              ListTile(
                leading: Icon(switch (s.status) { 'complete' => Icons.gavel, 'running' => Icons.hourglass_top, _ => Icons.error_outline }),
                title: Text(s.question, maxLines: 2, overflow: TextOverflow.ellipsis),
                subtitle: Text('${s.councilId} · ${s.status} · ${s.createdAt.toLocal().toString().substring(0, 16)} · \$${s.costUsd.toStringAsFixed(4)}'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReplayScreen(api: widget.api, session: s))),
              ),
          ]);
        },
      ),
    );
  }
}

/// Replays a stored session through the same event stream a live debate uses.
class ReplayScreen extends StatefulWidget {
  const ReplayScreen({super.key, required this.api, required this.session});
  final Api api;
  final SessionSummary session;

  @override
  State<ReplayScreen> createState() => _ReplayScreenState();
}

class _ReplayScreenState extends State<ReplayScreen> {
  final _timeline = DebateTimeline();

  @override
  void initState() {
    super.initState();
    follow(widget.api, widget.session.id, _timeline);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.session.question, maxLines: 1, overflow: TextOverflow.ellipsis)),
        body: TimelineView(timeline: _timeline),
      );
}
