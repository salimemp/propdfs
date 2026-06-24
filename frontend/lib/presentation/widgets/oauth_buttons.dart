import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Reusable OAuth / passkey buttons used by the login + register
/// pages. Dark theme styling to match the auth page background.
///
/// Two button variants:
///   * [SocialButton] — plain icon + label. Used for the
///     passkey button (which has no brand-specific icon).
///   * [BrandButton] — real brand SVG icon (Google's 4-colour G,
///     GitHub's octocat) + label. The SVG path data carries the
///     brand colour, so no tinting at the call site.
class SocialButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final IconData icon;
  final String label;
  final bool loading;

  const SocialButton({
    super.key,
    required this.onPressed,
    required this.icon,
    required this.label,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFF1a1a2e),
          foregroundColor: Colors.white,
          side: BorderSide(color: Colors.grey[800]!),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: loading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20, color: Colors.white),
                  const SizedBox(width: 10),
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class BrandButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final BrandKind brand;
  final String label;
  final bool loading;

  const BrandButton({
    super.key,
    required this.onPressed,
    required this.brand,
    required this.label,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFF1a1a2e),
          foregroundColor: Colors.white,
          side: BorderSide(color: Colors.grey[800]!),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: loading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _BrandIcon(kind: brand),
                  const SizedBox(width: 10),
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

enum BrandKind { google, github }

class _BrandIcon extends StatelessWidget {
  final BrandKind kind;
  const _BrandIcon({required this.kind});

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case BrandKind.google:
        // Multi-colour official Google "G" — no tint, the SVG
        // ships with the brand colours baked in.
        return SvgPicture.asset(
          'assets/oauth/google.svg',
          width: 20,
          height: 20,
        );
      case BrandKind.github:
        // GitHub Octocat, white-on-dark so it reads on the
        // OAuth button.
        return SvgPicture.asset(
          'assets/oauth/github.svg',
          width: 20,
          height: 20,
          colorFilter: const ColorFilter.mode(
            Colors.white,
            BlendMode.srcIn,
          ),
        );
    }
  }
}

/// "or with email" divider. Dark-theme-coloured. Rendered
/// between the OAuth stack and the email/password form so the
/// two sections read as alternatives, not one continuous form.
class AuthDivider extends StatelessWidget {
  final String label;
  const AuthDivider({super.key, this.label = 'or with email'});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: Color(0xFF2a2a3e), thickness: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            label,
            style: TextStyle(color: Colors.grey[500], fontSize: 14),
          ),
        ),
        const Expanded(child: Divider(color: Color(0xFF2a2a3e), thickness: 1)),
      ],
    );
  }
}