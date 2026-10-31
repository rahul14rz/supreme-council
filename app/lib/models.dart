// Wire types for the Supreme Council API. They mirror the server's JSON.

double _num(Object? v) => (v as num?)?.toDouble() ?? 0;
List<String> _strings(Object? v) => (v as List? ?? const []).cast<String>();

class Member {
  const Member({required this.id, required this.role, required this.model});
  factory Member.fromJson(Map<String, dynamic> j) => Member(id: j['id'], role: j['role'], model: j['model']);
  final String id, role, model;
}

class Council {
  const Council({required this.id, required this.name, required this.protocol, required this.minRounds, required this.maxRounds, required this.members, required this.state});
  factory Council.fromJson(Map<String, dynamic> j) => Council(
        id: j['id'],
        name: j['name'],
        protocol: j['protocol'],
        minRounds: j['minRounds'],
        maxRounds: j['maxRounds'],
        members: [for (final m in j['members'] as List) Member.fromJson(m)],
        state: (j['status'] as Map)['state'],
      );
  final String id, name, protocol, state;
  final int minRounds, maxRounds;
  final List<Member> members;
  bool get isLoop => protocol == 'create-critique-preserve';
}

class Verdict {
  const Verdict({required this.recommendation, required this.confidence, required this.agreements, required this.unresolved, required this.dissentAgent, required this.dissentReason, required this.whatWouldChange});
  factory Verdict.fromJson(Map<String, dynamic> j) => Verdict(
        recommendation: j['recommendation'],
        confidence: _num(j['confidence']),
        agreements: _strings(j['agreements']),
        unresolved: _strings(j['unresolved_disagreements']),
        dissentAgent: (j['dissent'] as Map)['agent'],
        dissentReason: (j['dissent'] as Map)['reason'],
        whatWouldChange: _strings(j['what_would_change_my_mind']),
      );
  final String recommendation, dissentAgent, dissentReason;
  final double confidence;
  final List<String> agreements, unresolved, whatWouldChange;
}

class SessionUsage {
  const SessionUsage({required this.inputTokens, required this.outputTokens, required this.costUsd, required this.requests});
  factory SessionUsage.fromJson(Map<String, dynamic> j) => SessionUsage(
        inputTokens: j['inputTokens'],
        outputTokens: j['outputTokens'],
        costUsd: _num(j['costUsd']),
        requests: (j['requests'] as Map).map((k, v) => MapEntry(k as String, v as int)),
      );
  final int inputTokens, outputTokens;
  final double costUsd;
  final Map<String, int> requests;
}

/// One server-sent event. See src/orchestrator/events.ts.
sealed class DebateEvent {
  const DebateEvent();
  factory DebateEvent.fromJson(Map<String, dynamic> j) => switch (j['type']) {
        'turn_start' => TurnStart(j['turnId'], j['agentId'], j['role'], j['phase'], j['round']),
        'token' => Token(j['turnId'], j['text']),
        'turn_end' => TurnEnd(j['turnId'], j['result']),
        'round_complete' => RoundComplete(j['round'], j['phase']),
        'verdict' => VerdictEvent(
            j['verdict'] == null ? null : Verdict.fromJson(j['verdict']),
            j['proposal'],
            SessionUsage.fromJson(j['usage']),
          ),
        'error' => ErrorEvent(j['message'], j['turnId'], j['retrying'] == true),
        final t => throw FormatException('unknown event type $t'),
      };
}

class TurnStart extends DebateEvent {
  const TurnStart(this.turnId, this.agentId, this.role, this.phase, this.round);
  final String turnId, agentId, role, phase;
  final int round;
}

class Token extends DebateEvent {
  const Token(this.turnId, this.text);
  final String turnId, text;
}

class TurnEnd extends DebateEvent {
  const TurnEnd(this.turnId, this.result);
  final String turnId;
  final Map<String, dynamic> result;
}

class RoundComplete extends DebateEvent {
  const RoundComplete(this.round, this.phase);
  final int round;
  final String phase;
}

class VerdictEvent extends DebateEvent {
  const VerdictEvent(this.verdict, this.proposal, this.usage);
  final Verdict? verdict;
  final String? proposal;
  final SessionUsage usage;
}

class ErrorEvent extends DebateEvent {
  const ErrorEvent(this.message, this.turnId, this.retrying);
  final String message;
  final String? turnId;
  final bool retrying;
}

class ProviderStatus {
  const ProviderStatus({required this.id, required this.available, required this.freeTier, required this.rpm, required this.rpd, required this.requestsToday, required this.credentialEnv});
  factory ProviderStatus.fromJson(Map<String, dynamic> j) => ProviderStatus(
        id: j['id'],
        available: j['available'],
        freeTier: j['freeTier'],
        rpm: j['rpm'],
        rpd: j['rpd'],
        requestsToday: j['requestsToday'],
        credentialEnv: j['credentialEnv'],
      );
  final String id, credentialEnv;
  final bool available, freeTier;
  final int rpm, requestsToday;
  final int? rpd;
}

class SessionSummary {
  const SessionSummary({required this.id, required this.question, required this.councilId, required this.status, required this.createdAt, required this.costUsd, required this.outputTokens});
  factory SessionSummary.fromJson(Map<String, dynamic> j) => SessionSummary(
        id: j['id'],
        question: j['question'],
        councilId: j['councilId'],
        status: j['status'],
        createdAt: DateTime.parse(j['createdAt']),
        costUsd: _num(j['costUsd']),
        outputTokens: j['outputTokens'],
      );
  final String id, question, councilId, status;
  final DateTime createdAt;
  final double costUsd;
  final int outputTokens;
}
