import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../timeline.dart';
import '../widgets/agent_style.dart';
import '../widgets/controls.dart';
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

const _readiness = {
  'ready': ('Ready', Palette.positive),
  'fallbacks': ('On fallback models', Palette.brass),
  'blocked': ('No provider available', Palette.muted),
};

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
  int? _rounds;
  DebateTimeline? _timeline;
  String? _error;

  @override
  void initState() {
    super.initState();
    _question.addListener(() => setState(() {}));
  }

  Future<void> _start(Council council) async {
    setState(() => _error = null);
    try {
      final id = await widget.api.createSession(question: _question.text.trim(), councilId: council.id, rounds: _rounds ?? council.maxRounds);
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
    if (timeline != null) return _session(timeline, _council!);
    return FutureBuilder<List<Council>>(
      future: _councils,
      builder: (context, snap) {
        if (snap.hasError) return _unreachable(snap.error!);
        if (!snap.hasData) return const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)));
        final councils = snap.data!;
        final council = _council ??= councils.firstWhere((c) => c.id == 'supreme-free', orElse: () => councils.first);
        return _form(councils, council);
      },
    );
  }

  Widget _form(List<Council> councils, Council council) {
    final rounds = (_rounds ?? council.maxRounds).clamp(council.minRounds, council.maxRounds);
    return ListView(padding: const EdgeInsets.fromLTRB(Space.s24, Space.s32, Space.s24, Space.s32), children: [
      const Text('Put a question before the council', style: Txt.display),
      const SizedBox(height: Space.s12),
      const Text('Members argue it in rounds without seeing each other first. The Chair rules, and the strongest dissent stays on the record.',
          style: Txt.secondary),
      const SizedBox(height: Space.s32),
      const Text('Question', style: Txt.label),
      const SizedBox(height: Space.s8),
      TextField(
        controller: _question,
        minLines: 4,
        maxLines: 8,
        style: Txt.body,
        decoration: InputDecoration(
          hintText: 'Should we rewrite our billing system this quarter?',
          hintStyle: Txt.body.copyWith(color: Palette.muted),
          filled: true,
          fillColor: Palette.card,
          contentPadding: const EdgeInsets.all(Space.s16),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Palette.hairline)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Palette.hairlineStrong)),
        ),
      ),
      const SizedBox(height: Space.s32),
      const Text('Council', style: Txt.label),
      const SizedBox(height: Space.s8),
      for (final c in councils)
        Padding(padding: const EdgeInsets.only(bottom: Space.s8), child: _CouncilOption(council: c, selected: c.id == council.id, onTap: () => setState(() {
          _council = c;
          _rounds = null;
        }))),
      const SizedBox(height: Space.s16),
      Bench(members: [for (final m in council.members) (id: m.id, role: m.role)], speaking: const {}),
      const SizedBox(height: Space.s32),
      Row(children: [
        Expanded(child: Text(council.isLoop ? 'Most cycles before the Keeper rules' : 'Rounds of argument', style: Txt.label)),
        Segmented(
          options: [for (var i = council.minRounds; i <= council.maxRounds; i++) i],
          selected: rounds,
          onSelect: (v) => setState(() => _rounds = v),
        ),
      ]),
      const SizedBox(height: Space.s32),
      PrimaryButton(label: 'Convene the council', onPressed: _question.text.trim().isEmpty ? null : () => _start(council)),
      if (_error != null) ...[const SizedBox(height: Space.s12), Text(_error!, style: Txt.secondary.copyWith(color: Palette.negative))],
      const SizedBox(height: Space.s16),
      const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: EdgeInsets.only(top: 2), child: Icon(Icons.info_outline, size: 16)),
        SizedBox(width: Space.s8),
        Expanded(child: Text('Free tiers may use your question for training. Keep confidential questions off them.', style: Txt.secondary)),
      ]),
    ]);
  }

  Widget _session(DebateTimeline timeline, Council council) {
    return ListenableBuilder(
      listenable: timeline,
      builder: (context, _) => TimelineView(
        timeline: timeline,
        members: [for (final m in council.members) (id: m.id, role: m.role)],
        header: Padding(
          padding: const EdgeInsets.only(top: Space.s16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              StatusDot(color: timeline.finished ? (timeline.verdict != null ? Palette.positive : Palette.negative) : Palette.brass, live: !timeline.finished),
              const SizedBox(width: Space.s8),
              Expanded(
                child: Text(
                  '${council.name} · ${timeline.finished ? (timeline.verdict != null ? 'Ruled' : 'No ruling') : 'In session'}',
                  style: Txt.secondary,
                ),
              ),
              QuietButton(label: 'New question', onPressed: timeline.finished ? () => setState(() => _timeline = null) : null),
            ]),
            const SizedBox(height: Space.s12),
            Text(_question.text.trim(), style: Txt.title),
          ]),
        ),
      ),
    );
  }

  Widget _unreachable(Object error) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Space.s32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('The council is not reachable', style: Txt.title),
            const SizedBox(height: Space.s8),
            Text('Start the server, then try again. Looking for it at $apiBaseUrl', style: Txt.secondary, textAlign: TextAlign.center),
            const SizedBox(height: Space.s20),
            QuietButton(label: 'Try again', onPressed: () => setState(() => _councils = widget.api.councils())),
          ]),
        ),
      );
}

class _CouncilOption extends StatelessWidget {
  const _CouncilOption({required this.council, required this.selected, required this.onTap});
  final Council council;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (status, color) = _readiness[council.state] ?? ('Unknown', Palette.muted);
    final shape = council.isLoop ? 'create, critique, preserve' : 'parallel rounds';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Panel(
          radius: 12,
          color: selected ? Palette.raised : Palette.card,
          borderColor: selected ? Palette.brass.withValues(alpha: 0.6) : Palette.hairline,
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(council.name, style: Txt.bodyStrong),
                const SizedBox(height: Space.s4),
                Text('${council.members.length} members · $shape', style: Txt.caption),
              ]),
            ),
            const SizedBox(width: Space.s12),
            StatusDot(color: color),
            const SizedBox(width: Space.s8),
            Text(status, style: Txt.meta.copyWith(color: Palette.text2)),
          ]),
        ),
      ),
    );
  }
}
