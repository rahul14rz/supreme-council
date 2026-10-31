import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/controls.dart';

class ProvidersScreen extends StatefulWidget {
  const ProvidersScreen({super.key, required this.api});
  final Api api;

  @override
  State<ProvidersScreen> createState() => _ProvidersScreenState();
}

class _ProvidersScreenState extends State<ProvidersScreen> {
  late Future<({String day, List<ProviderStatus> providers})> _data = widget.api.providers();

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: Palette.brass,
      backgroundColor: Palette.raised,
      onRefresh: () async {
        setState(() => _data = widget.api.providers());
        await _data;
      },
      child: FutureBuilder(
        future: _data,
        builder: (context, snap) {
          final data = snap.data;
          final providers = [...?data?.providers]..sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));
          final available = providers.where((p) => p.available).length;
          return ListView(children: [
            ScreenTitle('Providers', subtitle: data == null ? null : '$available of ${providers.length} available · requests on ${data.day} UTC'),
            if (snap.hasError) Padding(padding: const EdgeInsets.all(Space.s24), child: Text('Cannot load providers: ${snap.error}', style: Txt.secondary)),
            for (final p in providers) ...[_ProviderRow(p), const Divider(indent: Space.s24, endIndent: Space.s24)],
          ]);
        },
      ),
    );
  }
}

class _ProviderRow extends StatelessWidget {
  const _ProviderRow(this.p);
  final ProviderStatus p;

  @override
  Widget build(BuildContext context) {
    final rpd = p.rpd;
    final share = rpd == null ? null : (p.requestsToday / rpd).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.s24, vertical: Space.s16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          StatusDot(color: p.available ? Palette.positive : Palette.muted),
          const SizedBox(width: Space.s12),
          Expanded(child: Text(p.id, style: Txt.bodyStrong.copyWith(color: p.available ? Palette.text : Palette.text2))),
          Text(p.freeTier ? 'Free tier' : 'Paid', style: Txt.meta),
        ]),
        const SizedBox(height: Space.s8),
        Padding(
          padding: const EdgeInsets.only(left: Space.s20),
          child: p.available
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(rpd == null ? '${p.requestsToday} today · no daily cap · ${p.rpm} per min' : '${p.requestsToday} / $rpd today · ${p.rpm} per min',
                      style: Txt.meta.copyWith(color: Palette.text2)),
                  if (share != null) ...[
                    const SizedBox(height: Space.s8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(
                        value: share,
                        minHeight: 3,
                        backgroundColor: Palette.raised,
                        color: share > 0.8 ? Palette.brass : Palette.text2,
                      ),
                    ),
                  ],
                ])
              : Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: Space.s8, children: [
                  Text('Set', style: Txt.meta),
                  Keycap(p.credentialEnv),
                  Text('on the server', style: Txt.meta),
                ]),
        ),
      ]),
    );
  }
}
