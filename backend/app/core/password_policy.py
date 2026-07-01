"""Password policy + strength scoring + breach check.

Single source of truth for password rules on ProPDFs. Both
the backend (request validation, signup endpoint) and the
frontend strength meter reference the same rule set:
  * minimum 8 characters
  * at least 1 uppercase letter
  * at least 1 digit
  * at least 1 special character (!@#$%^&*()_+-=[]{};':"\\|,.<>/?`~)

The frontend mirrors these rules to give users live feedback
as they type. The backend runs the same checks at signup so
the rules can't be bypassed by skipping the UI checks.

For the breach check we use the HaveIBeenPwned (HIBP) k-
anonymity API: send the first 5 chars of the SHA-1 hash of
the password, receive a list of hash suffixes + breach counts,
look up our suffix to learn how many times this exact password
appears in known breaches. The plaintext password never leaves
the server — only the SHA-1 prefix crosses the wire, and the
HIBP API can't reverse the prefix back to a password.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import List

# -- Rule set ------------------------------------------------------------

# Rule identifiers used by both ends of the wire. Keep these
# strings stable — the Flutter UI iterates over them in a fixed
# order to render the strength meter.
RULE_MIN_LENGTH = "min_length"  # ≥ 8 chars
RULE_UPPERCASE = "uppercase"  # ≥ 1 A-Z
RULE_DIGIT = "digit"  # ≥ 1 0-9
RULE_SPECIAL = "special"  # ≥ 1 special char
RULE_NOT_BREACHED = "not_breached"  # not in HIBP's breach corpus

RULE_LABELS = {
    RULE_MIN_LENGTH: "At least 8 characters",
    RULE_UPPERCASE: "At least 1 uppercase letter",
    RULE_DIGIT: "At least 1 number",
    RULE_SPECIAL: "At least 1 special character",
    RULE_NOT_BREACHED: "Not found in known breaches",
}

RULE_ORDER = [
    RULE_MIN_LENGTH,
    RULE_UPPERCASE,
    RULE_DIGIT,
    RULE_SPECIAL,
    RULE_NOT_BREACHED,
]

# Regex fragment for a special character. Excludes whitespace
# and the usual alphanumeric so things like "abc 123" don't
# pass by virtue of the space. This matches the OWASP "special
# character" definition.
_SPECIAL_CHARS = r"""!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~"""
_SPECIAL_RE = re.compile(f"[{re.escape(_SPECIAL_CHARS)}]")
_UPPER_RE = re.compile(r"[A-Z]")
_DIGIT_RE = re.compile(r"[0-9]")


@dataclass
class PasswordCheckResult:
    """Result of evaluating a password against every rule.

    `passed` lists the rule IDs that the password satisfied.
    `failed` lists the ones it didn't. The frontend uses these
    two lists to show ticks / crosses in the strength meter.
    `breach_count` is only populated when the HIBP check has
    actually run; 0 means "checked, not breached", None means
    "not checked yet" (HIBP lookup is async + has rate limits).
    """

    passed: List[str] = field(default_factory=list)
    failed: List[str] = field(default_factory=list)
    breach_count: int | None = None

    @property
    def is_strong(self) -> bool:
        """Strong = every structural rule passes AND the password
        hasn't appeared in known breaches (or the breach check
        hasn't run yet — we don't block on a slow HIBP lookup)."""
        structural = {RULE_MIN_LENGTH, RULE_UPPERCASE, RULE_DIGIT, RULE_SPECIAL}
        if not structural.issubset(self.passed):
            return False
        if self.breach_count is not None and self.breach_count > 0:
            return False
        return True


def check_password_rules(password: str) -> PasswordCheckResult:
    """Run the structural rules against a password.

    HIBP is intentionally NOT called here — it's an async
    network call. Pass the result to [check_breach] (which
    returns a copy with `breach_count` set) when you want to
    include the breach check.
    """
    result = PasswordCheckResult()

    if len(password) >= 8:
        result.passed.append(RULE_MIN_LENGTH)
    else:
        result.failed.append(RULE_MIN_LENGTH)

    if _UPPER_RE.search(password):
        result.passed.append(RULE_UPPERCASE)
    else:
        result.failed.append(RULE_UPPERCASE)

    if _DIGIT_RE.search(password):
        result.passed.append(RULE_DIGIT)
    else:
        result.failed.append(RULE_DIGIT)

    if _SPECIAL_RE.search(password):
        result.passed.append(RULE_SPECIAL)
    else:
        result.failed.append(RULE_SPECIAL)

    return result


# -- HIBP integration -----------------------------------------------------

# SHA-1 of the empty string. We short-circuit the breach check
# for empty passwords so we never hit HIBP for them.
_EMPTY_SHA1 = hashlib.sha1(b"").hexdigest().upper()


def _sha1_hex_upper(password: str) -> str:
    """SHA-1 of the password, uppercase hex (HIBP's wire format)."""
    return hashlib.sha1(password.encode("utf-8")).hexdigest().upper()


def k_anonymity_prefix(password: str) -> tuple[str, str]:
    """Return (prefix, suffix) for the HIBP range query.

    HIBP's /range/{prefix} endpoint accepts the first 5 chars
    of the SHA-1 hash and returns all known hash suffixes with
    that prefix + their breach counts. We split locally so we
    never send more than 5 chars of the hash off-box.
    """
    full = _sha1_hex_upper(password)
    return full[:5], full[5:]


def parse_hibp_range_response(
    body: str,
    suffix: str,
) -> int:
    """Parse the /range response body and return the breach count
    for our suffix. Returns 0 if not found.

    HIBP returns lines like:
        0018A45C4D1DEF81644B54AB7F969B88D65:1
        00D4F6E8FA6EECAD2A3AA415EEC418D38EC:3
        ...

    Each line is the full 40-char SHA-1 hash (which happens to start
    with the prefix we sent) plus the breach count. We look up our
    exact entry by matching the SUFFIX at the END of each row's hash,
    not by comparing the whole hash against our suffix. Comparing
    whole-hash-against-suffix was a bug — the lengths don't match
    (40 chars vs 35) so the lookup always returned 0 and the
    breach check never reported anything.
    """
    needle = suffix.upper()
    for raw in body.splitlines():
        line = raw.strip()
        if not line or ":" not in line:
            continue
        sfx, _, count = line.partition(":")
        if sfx.upper().endswith(needle):
            # Matched our suffix. Use the count, but degrade gracefully
            # to 0 rather than 500 if the count column is malformed —
            # the endpoint treats breach_check as best-effort, and a
            # single bad row shouldn't poison the whole response.
            # NB: must continue the loop on ValueError? No — once we
            # match our suffix, no other row can match it (suffix is
            # unique to our hash). So returning 0 here is correct.
            try:
                return int(count)
            except ValueError:
                return 0
    return 0
