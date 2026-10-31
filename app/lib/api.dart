import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Server address. Override with --dart-define=API_BASE_URL=http://host:8787
/// (the Android emulator reaches the host machine at http://10.0.2.2:8787).
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://127.0.0.1:8787');

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class Api {
  Api({String baseUrl = apiBaseUrl, http.Client? client})
      : _base = Uri.parse(baseUrl),
        _client = client ?? http.Client();

  final Uri _base;
  final http.Client _client;

  Future<List<Council>> councils() async => [for (final c in await _get('/councils') as List) Council.fromJson(c)];

  Future<List<SessionSummary>> sessions() async => [for (final s in await _get('/sessions') as List) SessionSummary.fromJson(s)];

  Future<({String day, List<ProviderStatus> providers})> providers() async {
    final j = await _get('/providers') as Map<String, dynamic>;
    return (day: j['day'] as String, providers: [for (final p in j['providers'] as List) ProviderStatus.fromJson(p)]);
  }

  Future<String> createSession({required String question, required String councilId, required int rounds}) async {
    final res = await _client.post(_base.resolve('/sessions'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'question': question, 'councilId': councilId, 'rounds': rounds}));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 201) throw ApiException(body['error'] as String? ?? 'HTTP ${res.statusCode}');
    return body['sessionId'] as String;
  }

  /// Live events for a running session, or a replay of a finished one.
  Stream<DebateEvent> stream(String sessionId) async* {
    final res = await _client.send(http.Request('GET', _base.resolve('/sessions/$sessionId/stream')));
    if (res.statusCode != 200) throw ApiException('stream failed: HTTP ${res.statusCode}');
    yield* parseSse(res.stream.transform(utf8.decoder));
  }

  Future<Object?> _get(String path) async {
    final res = await _client.get(_base.resolve(path));
    if (res.statusCode != 200) throw ApiException('GET $path failed: HTTP ${res.statusCode}');
    return jsonDecode(res.body);
  }
}

/// Parses `event:`/`data:` blocks separated by blank lines. Only `data` is needed: it carries the type.
Stream<DebateEvent> parseSse(Stream<String> chunks) async* {
  final data = StringBuffer();
  await for (final line in chunks.transform(const LineSplitter())) {
    if (line.startsWith('data: ')) {
      data.write(line.substring(6));
    } else if (line.isEmpty && data.isNotEmpty) {
      yield DebateEvent.fromJson(jsonDecode(data.toString()) as Map<String, dynamic>);
      data.clear();
    }
  }
}
