import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Reusable brand mark. Renders the ProPDFs logo from the bundled SVG asset
/// and tints it with the current theme's foreground color so it looks right
/// in both light and dark modes.
///
/// Variants:
///   * mark:    the icon-only mark (use in AppBars, tight spaces, the footer)
///   * inline:  the horizontal wordmark "P ProPDFs" (use in headers / hero
///              sections, anywhere there's enough horizontal room)
class BrandLogo extends StatelessWidget {
  final BrandVariant variant;
  final double? height;

  const BrandLogo({
    super.key,
    this.variant = BrandVariant.mark,
    this.height,
  });

  const BrandLogo.mark({super.key, this.height}) : variant = BrandVariant.mark;
  const BrandLogo.inline({super.key, this.height})
      : variant = BrandVariant.inline;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tint = isDark ? Colors.white : const Color(0xFF0F172A);

    final asset = switch (variant) {
      BrandVariant.mark => 'assets/brand/logo-mark.svg',
      BrandVariant.inline => 'assets/brand/logo-horizontal.svg',
    };

    final h = height ?? (variant == BrandVariant.mark ? 28.0 : 26.0);

    return SvgPicture.asset(
      asset,
      height: h,
      colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
    );
  }
}

enum BrandVariant { mark, inline }
