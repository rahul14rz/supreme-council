import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'models.dart';

enum TurnStatus { running, ok, failed }

const structuredPhases = {'verdict', 'preserve'};

class TurnView {
  TurnView(this.start);
  final TurnStart start;
  String text = '';
  TurnStatus status = TurnStatus.running;
  String? model, error;
  int outputTokens = 0;
  double costUsd = 0;
  final notes = <String>[];

  bool get structured => structuredPhases.contains(start.phase);

  /// For a Keeper turn: the revised proposal and whether it changed, if the JSON parsed.
  ({bool changed, String proposal})? get keeperOutput {
    if (start.phase != 'preserve' || status != TurnStatus.ok) return null;
    try {
      final j = jsonDecode(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Map<String, dynamic>;
      return (changed: j['changed'] as bool, proposal: j['proposal'] as String);
    } catch (_) {
      return null;
    }
  }
}

/// Folds debate events into what the UI shows. Live streams and replays go through the same code.
class DebateTimeline extends ChangeNotifier {
  final turns = <TurnView>[];
  final errors = <String>[];
  Verdict? verdict;
  String? proposal;
  SessionUsage? usage;
  bool finished = false;

  double get liveCostUsd => usage?.costUsd ?? turns.fold(0, (s, t) => s + t.costUsd);
  int get liveOutputTokens => usage?.outputTokens ?? turns.fold(0, (s, t) => s + t.outputTokens);

  void apply(DebateEvent e) {
    switch (e) {
      case TurnStart():
        turns.add(TurnView(e));
      case Token(:final turnId, :final text):
        _turn(turnId)?.text += text;
      case TurnEnd(:final turnId, :final result):
        final turn = _turn(turnId);
        if (turn == null) break;
        if (result['status'] == 'ok') {
          turn
            ..status = TurnStatus.ok
            ..text = result['text'] as String
            ..model = result['model'] as String
            ..outputTokens = (result['usage'] as Map)['outputTokens'] as int
            ..costUsd = (result['costUsd'] as num).toDouble();
        } else {
          turn
            ..status = TurnStatus.failed
            ..error = result['error'] as String;
        }
      case RoundComplete():
        break;
      case VerdictEvent():
        verdict = e.verdict;
        proposal = e.proposal;
        usage = e.usage;
      case ErrorEvent(:final message, :final turnId, :final retrying):
        final turn = turnId == null ? null : _turn(turnId);
        if (turn == null) {
          errors.add(message);
        } else {
          turn.notes.add(message);
          if (retrying) turn.text = '';
        }
    }
    notifyListeners();
  }

  void finish() {
    finished = true;
    notifyListeners();
  }

  TurnView? _turn(String id) {
    for (final t in turns) {
      if (t.start.turnId == id) return t;
    }
    return null;
  }
}
