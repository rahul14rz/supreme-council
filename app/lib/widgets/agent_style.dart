import 'package:flutter/material.dart';

import '../theme.dart';

/// Each member keeps one muted hue for its seat ring and name. Members of
/// councils added later get a stable hue from their id.
Color agentColor(String agentId) => _known[agentId] ?? _palette[agentId.codeUnits.fold(0, (a, b) => a + b) % _palette.length];

const _known = {
  'chair': Color(0xFFE6DFD0),
  'optimist': Color(0xFF79B88F),
  'skeptic': Color(0xFFD9925E),
  'cost-analyst': Color(0xFF7AA5DA),
  'risk-officer': Color(0xFFDB6F74),
  'creator': Color(0xFF6CBDB3),
  'critic': Color(0xFFC985BA),
  'keeper': Color(0xFF97A3E2),
};

const _palette = [Color(0xFF6CBDB3), Color(0xFFC985BA), Color(0xFFB7B26A), Color(0xFF97A3E2), Color(0xFFD9925E), Color(0xFF79B88F)];

String monogram(String role) {
  final words = role.split(RegExp(r'[\s/]+')).where((w) => w.isNotEmpty).toList();
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words.isEmpty ? '?' : words[0].substring(0, words[0].length.clamp(1, 2));
}

/// A member's seat: a monogram on the raised surface, ringed in the member's hue.
class Seat extends StatelessWidget {
  const Seat({super.key, required this.agentId, required this.role, this.size = 36, this.speaking = false, this.dimmed = false});
  final String agentId, role;
  final double size;
  final bool speaking, dimmed;

  @override
  Widget build(BuildContext context) {
    final color = agentColor(agentId);
    return AnimatedContainer(
      duration: Motion.quick,
      curve: Motion.curve,
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: speaking ? Palette.raised : Palette.card,
        shape: BoxShape.circle,
        border: Border.all(color: dimmed ? color.withValues(alpha: 0.35) : color, width: speaking ? 2 : 1.25),
      ),
      child: Text(
        monogram(role),
        style: TextStyle(fontFamily: 'Plex Serif', fontSize: size * 0.4, height: 1, color: dimmed ? color.withValues(alpha: 0.55) : color),
      ),
    );
  }
}

/// The bench: every member of the council, with whoever is speaking lit.
class Bench extends StatelessWidget {
  const Bench({super.key, required this.members, required this.speaking});
  final List<({String id, String role})> members;
  final Set<String> speaking;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final m in members)
          Expanded(
            child: Column(children: [
              Stack(clipBehavior: Clip.none, children: [
                Seat(agentId: m.id, role: m.role, size: 40, speaking: speaking.contains(m.id), dimmed: speaking.isNotEmpty && !speaking.contains(m.id)),
                if (speaking.contains(m.id))
                  const Positioned(right: -1, top: -1, child: StatusDot(color: Palette.brass, live: true, size: 9)),
              ]),
              const SizedBox(height: Space.s8),
              Text(m.role, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                  style: Txt.meta.copyWith(fontFamily: 'Plex Sans', fontSize: 11, height: 1.3, color: speaking.contains(m.id) ? Palette.text : Palette.muted)),
            ]),
          ),
      ],
    );
  }
}
