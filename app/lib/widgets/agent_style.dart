import 'package:flutter/material.dart';

/// A distinct colour and avatar per agent. Unknown agents (new councils) get a stable colour from their id.
class AgentStyle {
  const AgentStyle(this.color, this.icon);
  final Color color;
  final IconData? icon;

  static const _known = {
    'chair': AgentStyle(Color(0xFF6A4C93), Icons.gavel),
    'optimist': AgentStyle(Color(0xFF2E7D32), Icons.wb_sunny_outlined),
    'skeptic': AgentStyle(Color(0xFFEF6C00), Icons.help_outline),
    'cost-analyst': AgentStyle(Color(0xFF1565C0), Icons.payments_outlined),
    'risk-officer': AgentStyle(Color(0xFFC62828), Icons.shield_outlined),
    'creator': AgentStyle(Color(0xFF00897B), Icons.lightbulb_outline),
    'critic': AgentStyle(Color(0xFFD84315), Icons.bolt),
    'keeper': AgentStyle(Color(0xFF3949AB), Icons.inventory_2_outlined),
  };

  static const _palette = [Color(0xFF00838F), Color(0xFF8E24AA), Color(0xFF558B2F), Color(0xFFAD1457), Color(0xFF4E342E), Color(0xFF283593)];

  static AgentStyle of(String agentId) =>
      _known[agentId] ?? AgentStyle(_palette[agentId.codeUnits.fold(0, (a, b) => a + b) % _palette.length], null);
}

class AgentAvatar extends StatelessWidget {
  const AgentAvatar({super.key, required this.agentId, required this.role, this.radius = 18});
  final String agentId, role;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final style = AgentStyle.of(agentId);
    final initials = role.split(RegExp(r'[\s/]+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join();
    return CircleAvatar(
      radius: radius,
      backgroundColor: style.color,
      foregroundColor: Colors.white,
      child: style.icon != null ? Icon(style.icon, size: radius) : Text(initials, style: TextStyle(fontSize: radius * 0.75)),
    );
  }
}
