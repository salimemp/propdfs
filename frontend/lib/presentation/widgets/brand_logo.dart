import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Reusable brand mark. Renders the ProPDFs logo.
///
/// Variants:
///   * mark:     just the icon (use in AppBars, tight spaces, the footer).
///   * inline:   the icon + a Flutter-rendered "ProPDFs" wordmark. We don't
///               load the wordmark from the horizontal SVG because the
///               SVG <text> elements rely on Inter being bundled, which
///               isn't true on web — flutter_svg silently renders nothing
///               for missing fonts, so the wordmark would disappear.
///               Composing with a Flutter Text guarantees it renders.
class BrandLogo extends StatelessWidget {
  final BrandVariant variant;
  final double? height;
  final double textSize;
  final FontWeight fontWeight;

  const BrandLogo({
    super.key,
    this.variant = BrandVariant.mark,
    this.height,
    this.textSize = 20,
    this.fontWeight = FontWeight.w800,
  });

  const BrandLogo.mark({super.key, this.height, this.textSize = 20, this.fontWeight = FontWeight.w800})
      : variant = BrandVariant.mark;

  /// Inline brand mark. Renders the icon + a "ProPDFs" wordmark in the
  /// current theme's foreground color. The icon is sized by [height] (or
  /// defaults to 28); the text scales with [textSize].
  const BrandLogo.inline({
    super.key,
    this.height,
    this.textSize = 20,
    this.fontWeight = FontWeight.w800,
  }) : variant = BrandVariant.inline;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = isDark ? Colors.white : const Color(0xFF0F172A);
    // Two mark variants so the icon stays readable on both light
    // and dark backgrounds. Light mode uses the navy rect; dark
    // mode uses a white rect (with the same red corner + navy "P").
    // Same brand identity, opposite polarity.
    final markAsset = isDark
        ? 'assets/brand/logo-mark-dark.svg'
        : 'assets/brand/logo-mark.svg';

    switch (variant) {
      case BrandVariant.mark:
        final h = height ?? 28.0;
        return SvgPicture.asset(
          markAsset,
          height: h,
          // No tint — the mark ships with its own colours and we
          // pick the variant that already has the right polarity
          // for the current theme.
        );
      case BrandVariant.inline:
        final h = height ?? 28.0;
        return Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SvgPicture.asset(
              markAsset,
              height: h,
            ),
            SizedBox(width: h * 0.32),
            Text(
              'ProPDFs',
              style: TextStyle(
                fontSize: textSize,
                fontWeight: fontWeight,
                color: fg,
                letterSpacing: -0.3,
                height: 1.0,
              ),
            ),
          ],
        );
    }
  }
}

enum BrandVariant { mark, inline }
