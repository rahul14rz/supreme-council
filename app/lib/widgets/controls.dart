import 'package:flutter/material.dart';

import '../theme.dart';

/// The one primary action: off-white with dark text.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 48,
        width: double.infinity,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: Palette.text,
            foregroundColor: Palette.page,
            disabledBackgroundColor: Palette.raised,
            disabledForegroundColor: Palette.muted,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            textStyle: Txt.bodyStrong,
          ),
          child: Text(label),
        ),
      );
}

class QuietButton extends StatelessWidget {
  const QuietButton({super.key, required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          foregroundColor: Palette.text,
          disabledForegroundColor: Palette.muted,
          padding: const EdgeInsets.symmetric(horizontal: Space.s12),
          minimumSize: const Size(0, 36),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: const BorderSide(color: Palette.hairlineStrong)),
          textStyle: Txt.label,
        ),
        child: Text(label),
      );
}

/// A row of equal options, e.g. 2 or 3 rounds.
class Segmented extends StatelessWidget {
  const Segmented({super.key, required this.options, required this.selected, required this.onSelect});
  final List<int> options;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(Space.s4),
        decoration: BoxDecoration(color: Palette.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: Palette.hairline)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (final o in options)
            GestureDetector(
              onTap: () => onSelect(o),
              child: AnimatedContainer(
                duration: Motion.quick,
                curve: Motion.curve,
                width: 44,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: o == selected ? Palette.raised : Colors.transparent, borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: o == selected ? Palette.hairlineStrong : Colors.transparent)),
                child: Text('$o', style: Txt.figure.copyWith(fontSize: 13, color: o == selected ? Palette.text : Palette.muted)),
              ),
            ),
        ]),
      );
}

/// An env var or other literal, set like a keycap.
class Keycap extends StatelessWidget {
  const Keycap(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(color: Palette.raised, borderRadius: BorderRadius.circular(4), border: Border.all(color: Palette.hairlineStrong)),
        child: Text(text, style: Txt.meta.copyWith(color: Palette.text2)),
      );
}

class ScreenTitle extends StatelessWidget {
  const ScreenTitle(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(Space.s24, Space.s24, Space.s24, Space.s16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Txt.display.copyWith(fontSize: 28)),
          if (subtitle != null) ...[const SizedBox(height: Space.s4), Text(subtitle!, style: Txt.secondary)],
        ]),
      );
}
