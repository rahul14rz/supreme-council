import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../timeline.dart';
import '../widgets/controls.dart';
import '../widgets/timeline_view.dart';
import 'debate_screen.dart';

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String shortDate(DateTime t) {
  final l = t.toLocal();
  return '${l.day} ${_months[l.month - 1]}  ${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
}

const _status = {
  'complete': ('Ruled', Palette.positive),
  'running': ('In session', Palette.brass),
  'failed': ('No ruling', Palette.negative),
};

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
      color: Palette.brass,
      backgroundColor: Palette.raised,
      onRefresh: () async {
        setState(() => _sessions = widget.api.sessions());
        await _sessions;
      },
      child: FutureBuilder<List<SessionSummary>>(
        future: _sessions,
        builder: (context, snap) {
          final sessions = snap.data;
          return ListView(children: [
            ScreenTitle('History', subtitle: sessions == null ? null : '${sessions.length} debates on the record'),
            if (snap.hasError) Padding(padding: const EdgeInsets.all(Space.s24), child: Text('Cannot load history: ${snap.error}', style: Txt.secondary)),
            if (sessions != null && sessions.isEmpty)
              const Padding(padding: EdgeInsets.all(Space.s24), child: Text('No debates on the record yet', style: Txt.secondary)),
            for (final s in sessions ?? const <SessionSummary>[]) ...[
              _SessionRow(s, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReplayScreen(api: widget.api, session: s)))),
              const Divider(indent: Space.s24, endIndent: Space.s24),
            ],
          ]);
        },
      ),
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow(this.s, {required this.onTap});
  final SessionSummary s;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (label, color) = _status[s.status] ?? (s.status, Palette.muted);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.s24, vertical: Space.s16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.question, maxLines: 2, overflow: TextOverflow.ellipsis, style: Txt.body),
          const SizedBox(height: Space.s8),
          Row(children: [
            StatusDot(color: color, size: 6),
            const SizedBox(width: Space.s8),
            Text(label, style: Txt.meta.copyWith(color: Palette.text2)),
            Expanded(
              child: Text('  ${s.councilId} · ${shortDate(s.createdAt)}', style: Txt.meta, overflow: TextOverflow.ellipsis),
            ),
            Text('\$${s.costUsd.toStringAsFixed(4)}', style: Txt.figure.copyWith(color: Palette.text2)),
          ]),
        ]),
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
        appBar: AppBar(
          backgroundColor: Palette.page,
          surfaceTintColor: Colors.transparent,
          foregroundColor: Palette.text,
          title: Text('${widget.session.councilId} · ${shortDate(widget.session.createdAt)}', style: Txt.meta.copyWith(color: Palette.text2)),
        ),
        body: TimelineView(
          timeline: _timeline,
          header: Padding(padding: const EdgeInsets.only(top: Space.s8), child: Text(widget.session.question, style: Txt.title)),
        ),
      );
}
