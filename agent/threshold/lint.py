"""Rule-based linter for provider queries (AHIMA/ACDIS compliant query practice).

A query that fails the linter is sent back to the model with the failures,
so a leading query can't reach the output."""

from __future__ import annotations

import re

from .schemas import ProviderQuery

# Queries must never mention money, DRGs or severity tiers.
FORBIDDEN = re.compile(
    r"\b(drg|ms-drg|reimburs\w*|payment|revenue|dollar|\$\d|mcc|cc/mcc|case mix|cmi|severity of illness|"
    r"denial|audit|maximi[sz]e|capture)\b",
    re.IGNORECASE,
)
LEADING_OPENERS = re.compile(
    r"^\s*(please (document|confirm|add)|can you (document|confirm|add)|"
    r"would you (document|agree)|do you agree|is it (true|correct)|"
    r"does the patient have)",
    re.IGNORECASE,
)


def lint(q: ProviderQuery) -> list[str]:
    problems: list[str] = []
    text = " ".join([q.question, *q.options, *(i.text for i in q.clinical_indicators)])
    if m := FORBIDDEN.search(text):
        problems.append(f"mentions financial/severity language ('{m.group(0)}')")
    if LEADING_OPENERS.search(q.question):
        problems.append("question is leading or yes/no; ask an open question")
    lowered = [o.lower() for o in q.options]
    if not any("other" in o for o in lowered):
        problems.append("options must include 'Other (please specify)'")
    if not any("undetermined" in o or "unable to determine" in o for o in lowered):
        problems.append("options must include 'Clinically undetermined'")
    if len([o for o in lowered if "other" not in o and "undetermined" not in o]) < 2:
        problems.append("offer at least two clinically reasonable diagnoses, not one")
    if len(q.clinical_indicators) < 2:
        problems.append("include at least two clinical indicators from the record")
    return problems
