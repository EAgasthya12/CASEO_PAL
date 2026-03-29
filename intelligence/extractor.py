import re
import spacy
import dateparser
from dateparser.search import search_dates
from datetime import datetime, timezone

# Keywords that signal a date is a deadline (not just a mentioned date)
DEADLINE_SIGNALS = [
    r'last\s+date', r'due\s+(date|by|on)', r'deadline', r'submit\s+by',
    r'register\s+(by|before|on)', r'apply\s+(by|before)', r'closes?\s+(on|at)',
    r'before\s+\w+\s*\d', r'by\s+\w+\s*\d', r'until\s+\w+\s*\d',
    r'expir(es?|y|ing)', r'ends?\s+(on|at|by)', r'final\s+date',
    r'not\s+later\s+than', r'no\s+later\s+than',
    r'must\s+(be\s+)?(submit|send|register|apply)',
    # Interview / reporting signals
    r'interview\s+scheduled', r'report\s+at', r'appear\s+for',
    r'joining\s+(date|on)', r'reporting\s+(date|time)',
    r'slot\s+(date|time)', r'session\s+(date|time)',
]
SIGNAL_RE = re.compile('|'.join(DEADLINE_SIGNALS), re.IGNORECASE)

# Maximum deadline candidates to return (prevents spam emails flooding with 50+ dates)
MAX_DEADLINE_CANDIDATES = 5


class DateExtractor:
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            from spacy.cli import download
            download("en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")

    def extract_deadlines(self, text):
        try:
            if text and len(text) > 2048:
                text = text[:2048]

            doc = self.nlp(text)
            raw_candidates = []

            # 1. spaCy NER — DATE/TIME entities
            for ent in doc.ents:
                if ent.label_ in ["DATE", "TIME"]:
                    parsed = dateparser.parse(
                        ent.text,
                        settings={'PREFER_DATES_FROM': 'future', 'RETURN_AS_TIMEZONE_AWARE': True}
                    )
                    if parsed:
                        start = max(0, ent.start_char - 120)
                        end = min(len(text), ent.end_char + 120)
                        context = text[start:end]
                        has_signal = bool(SIGNAL_RE.search(context))
                        raw_candidates.append({
                            "text": ent.text,
                            "date": parsed.astimezone(timezone.utc).isoformat(),
                            "label": ent.label_,
                            "has_signal": has_signal
                        })

            # 2. dateparser.search fallback for dates spaCy missed
            found_dates = search_dates(
                text,
                settings={'PREFER_DATES_FROM': 'future', 'RETURN_AS_TIMEZONE_AWARE': True}
            ) or []
            for text_match, p_date in found_dates:
                pos = text.find(text_match)
                if pos >= 0:
                    context = text[max(0, pos - 120): pos + len(text_match) + 120]
                    has_signal = bool(SIGNAL_RE.search(context))
                else:
                    has_signal = False
                raw_candidates.append({
                    "text": text_match,
                    "date": p_date.astimezone(timezone.utc).isoformat(),
                    "label": "DATE_PARSER",
                    "has_signal": has_signal
                })

            # 3. Dedup by calendar day — prefer signal-backed date for the same day
            seen_days = {}
            for c in raw_candidates:
                day_key = c["date"][:10]
                if day_key not in seen_days or (c["has_signal"] and not seen_days[day_key]["has_signal"]):
                    seen_days[day_key] = c

            all_deduplicated = list(seen_days.values())

            # 4. Keep only signal-backed deadlines; fall back to all if none have a signal
            signal_deadlines = [d for d in all_deduplicated if d["has_signal"]]
            deadlines = signal_deadlines if signal_deadlines else all_deduplicated

            # 5. Cap to MAX_DEADLINE_CANDIDATES (avoid spam emails flooding with dozens of dates)
            if len(deadlines) > MAX_DEADLINE_CANDIDATES:
                # Prefer the ones with signals first, then earliest
                deadlines = sorted(deadlines, key=lambda d: (not d["has_signal"], d["date"]))
                deadlines = deadlines[:MAX_DEADLINE_CANDIDATES]

            # Strip internal field before returning
            for d in deadlines:
                d.pop("has_signal", None)

        except Exception as e:
            print(f"Extraction error: {e}")
            return [], "Low"

        # ── Urgency based on closest upcoming deadline ────────────────────────
        urgency = "Low"
        now = datetime.now(timezone.utc)
        min_hours = float('inf')
        for d in deadlines:
            try:
                dt = datetime.fromisoformat(d['date'])
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                diff_seconds = (dt - now).total_seconds()
                if diff_seconds > 0:
                    diff_hours = diff_seconds / 3600
                    if diff_hours < min_hours:
                        min_hours = diff_hours
            except Exception:
                pass

        if min_hours < 24:       # < 24 hours
            urgency = "Critical"
        elif min_hours < 72:     # < 3 days
            urgency = "High"
        elif min_hours < 168:    # < 7 days
            urgency = "Medium"

        return deadlines, urgency
