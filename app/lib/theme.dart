import 'package:flutter/material.dart';

/// Design tokens. The chrome is a quiet graphite ramp with one brass accent;
/// the ruling is the one surface allowed to look like a real object (paper).
abstract final class Palette {
  static const deepest = Color(0xFF0F0F10);
  static const page = Color(0xFF141415);
  static const card = Color(0xFF19191B);
  static const raised = Color(0xFF232325);
  static const text = Color(0xFFEDEDED);
  static const text2 = Color(0xFFA1A1A6);
  static const muted = Color(0xFF85858B);
  static const hairline = Color(0x14EDEDED);
  static const hairlineStrong = Color(0x24EDEDED);
  static const brass = Color(0xFFC8A96A);
  static const positive = Color(0xFF4CC38A);
  static const negative = Color(0xFFE5484D);

  // The ruling, set on paper.
  static const paper = Color(0xFFF4EFE4);
  static const paperInk = Color(0xFF1F1B16);
  static const paperInk2 = Color(0xFF5E554A);
  static const paperRule = Color(0x221F1B16);
  static const vermilion = Color(0xFFA8382A);
}

/// 4px grid.
abstract final class Space {
  static const s4 = 4.0, s8 = 8.0, s12 = 12.0, s16 = 16.0, s20 = 20.0, s24 = 24.0, s32 = 32.0, s40 = 40.0, s48 = 48.0;
}

abstract final class Motion {
  static const curve = Cubic(0.22, 1, 0.36, 1);
  static const quick = Duration(milliseconds: 160);
  static const enter = Duration(milliseconds: 360);
}

abstract final class Txt {
  static const _sans = 'Plex Sans';
  static const _serif = 'Plex Serif';
  static const _mono = 'Plex Mono';
  static const _tabular = [FontFeature.tabularFigures()];

  static const display = TextStyle(fontFamily: _serif, fontWeight: FontWeight.w300, fontSize: 34, height: 1.12, letterSpacing: -0.4, color: Palette.text);
  static const title = TextStyle(fontFamily: _serif, fontSize: 22, height: 1.3, color: Palette.text);
  static const body = TextStyle(fontFamily: _sans, fontSize: 15, height: 1.5, color: Palette.text);
  static const bodyStrong = TextStyle(fontFamily: _sans, fontSize: 15, height: 1.45, fontWeight: FontWeight.w500, color: Palette.text);
  static const secondary = TextStyle(fontFamily: _sans, fontSize: 13, height: 1.5, color: Palette.text2);
  static const caption = TextStyle(fontFamily: _sans, fontSize: 13, height: 1.45, color: Palette.muted);
  static const label = TextStyle(fontFamily: _sans, fontSize: 13, height: 1.4, fontWeight: FontWeight.w500, color: Palette.text2);
  static const role = TextStyle(fontFamily: _sans, fontSize: 14, height: 1.3, fontWeight: FontWeight.w500);
  static const meta = TextStyle(fontFamily: _mono, fontSize: 12, height: 1.35, color: Palette.muted, fontFeatures: _tabular);
  static const figure = TextStyle(fontFamily: _mono, fontSize: 12, height: 1.35, fontWeight: FontWeight.w500, color: Palette.text, fontFeatures: _tabular);

  // On paper.
  static const ruling = TextStyle(fontFamily: _serif, fontSize: 24, height: 1.3, color: Palette.paperInk);
  static const opinion = TextStyle(fontFamily: _serif, fontSize: 17, height: 1.5, color: Palette.paperInk);
  static const paperBody = TextStyle(fontFamily: _sans, fontSize: 15, height: 1.5, color: Palette.paperInk);
  static const paperLabel = TextStyle(fontFamily: _sans, fontSize: 13, height: 1.4, fontWeight: FontWeight.w600, color: Palette.paperInk2);
  static const paperMeta = TextStyle(fontFamily: _mono, fontSize: 12, height: 1.35, color: Palette.paperInk2, fontFeatures: _tabular);
}

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    surface: Palette.page,
    onSurface: Palette.text,
    primary: Palette.text,
    onPrimary: Palette.page,
    secondary: Palette.brass,
    error: Palette.negative,
    outline: Palette.hairlineStrong,
    outlineVariant: Palette.hairline,
    surfaceContainerHighest: Palette.raised,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.page,
    fontFamily: 'Plex Sans',
    splashFactory: NoSplash.splashFactory,
    dividerTheme: const DividerThemeData(color: Palette.hairline, thickness: 1, space: 1),
    textSelectionTheme: const TextSelectionThemeData(cursorColor: Palette.brass, selectionColor: Color(0x55C8A96A)),
    iconTheme: const IconThemeData(color: Palette.muted, size: 18),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Palette.brass),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Palette.deepest,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Palette.raised,
      height: 64,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => Txt.meta.copyWith(
            fontFamily: 'Plex Sans',
            color: s.contains(WidgetState.selected) ? Palette.text : Palette.muted,
          )),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: 20, color: s.contains(WidgetState.selected) ? Palette.text : Palette.muted),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(backgroundColor: Palette.raised, contentTextStyle: Txt.body),
  );
}

/// A hairline-bordered surface; the one container shape used across the app.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(Space.s16), this.color = Palette.card, this.borderColor = Palette.hairline, this.radius = 14});
  final Widget child;
  final EdgeInsets padding;
  final Color color, borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: Motion.quick,
        curve: Motion.curve,
        padding: padding,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius), border: Border.all(color: borderColor)),
        child: child,
      );
}

/// A status dot. Pulses only when it represents something live.
class StatusDot extends StatefulWidget {
  const StatusDot({super.key, required this.color, this.live = false, this.size = 8});
  final Color color;
  final bool live;
  final double size;

  @override
  State<StatusDot> createState() => _StatusDotState();
}

class _StatusDotState extends State<StatusDot> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void initState() {
    super.initState();
    if (widget.live) _pulse.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(StatusDot old) {
    super.didUpdateWidget(old);
    if (widget.live && !_pulse.isAnimating) _pulse.repeat(reverse: true);
    if (!widget.live) _pulse.stop();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(width: widget.size, height: widget.size, decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle));
    if (!widget.live) return dot;
    return FadeTransition(opacity: Tween(begin: 0.35, end: 1.0).animate(_pulse), child: dot);
  }
}

/// Fades and rises a few pixels once, when first built.
class Entrance extends StatelessWidget {
  const Entrance({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Motion.enter,
        curve: Motion.curve,
        builder: (_, t, child) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: child)),
        child: child,
      );
}
