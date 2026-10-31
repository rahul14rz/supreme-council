import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';

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
      onRefresh: () async {
        setState(() => _data = widget.api.providers());
        await _data;
      },
      child: FutureBuilder(
        future: _data,
        builder: (context, snap) {
          if (snap.hasError) return ListView(children: [ListTile(title: Text('Cannot load providers: ${snap.error}'))]);
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          return ListView(children: [
            ListTile(title: Text('Request usage for ${snap.data!.day} (UTC)')),
            for (final p in snap.data!.providers) _ProviderTile(p),
          ]);
        },
      ),
    );
  }
}

class _ProviderTile extends StatelessWidget {
  const _ProviderTile(this.p);
  final ProviderStatus p;

  @override
  Widget build(BuildContext context) {
    final rpd = p.rpd;
    final usage = rpd == null ? '${p.requestsToday} requests today (no daily cap)' : '${p.requestsToday} / $rpd requests today';
    return ListTile(
      leading: Icon(p.available ? Icons.check_circle : Icons.cancel, color: p.available ? Colors.green : Colors.grey),
      title: Text('${p.id}${p.freeTier ? '  ·  free tier' : ''}'),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(p.available ? '$usage · ${p.rpm} requests/min' : 'Unavailable: set ${p.credentialEnv} on the server'),
        if (p.available && rpd != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: LinearProgressIndicator(value: (p.requestsToday / rpd).clamp(0, 1).toDouble()),
          ),
      ]),
    );
  }
}
