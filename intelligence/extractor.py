import re
import spacy
import dateparser
from dateparser.search import search_dates
from datetime import datetime

# Keywords that signal a date is a deadline (not just a mentioned date)
DEADLINE_SIGNALS = [
    r'last\s+date', r'due\s+(date|by|on)', r'deadline', r'submit\s+by',
    r'register\s+(by|before|on)', r'apply\s+(by|before)', r'closes?\s+(on|at)',
    r'before\s+\w+\s*\d', r'by\s+\w+\s*\d', r'until\s+\w+\s*\d',
    r'expir(es?|y|ing)', r'ends?\s+(on|at|by)', r'final\s+date',
    r'not\s+later\s+than', r'no\s+later\s+than',
    r'must\s+(be\s+)?(submit|send|register|apply)',
]
SIGNAL_RE = re.compile('|'.join(DEADLINE_SIGNALS), re.IGNORECASE)


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
                        settings={'PREFER_DATES_FROM': 'future'}
                    )
                    if parsed:
                        # Check proximity to deadline signals (within 120 chars either side)
                        start = max(0, ent.start_char - 120)
                        end = min(len(text), ent.end_char + 120)
                        context = text[start:end]
                        has_signal = bool(SIGNAL_RE.search(context))
                        raw_candidates.append({
                            "text": ent.text,
                            "date": parsed.isoformat(),
                            "label": ent.label_,
                            "has_signal": has_signal
                        })

            # 2. dateparser.search fallback
            found_dates = search_dates(
                text,
                settings={'PREFER_DATES_FROM': 'future'}
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
                    "date": p_date.isoformat(),
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

            # Strip internal field before returning
            for d in deadlines:
                d.pop("has_signal", None)

        except Exception as e:
            print(f"Extraction error: {e}")
            return [], "Low"

        # Urgency based on closest upcoming deadline
        urgency = "Low"
        today = datetime.now()
        min_days = float('inf')
        for d in deadlines:
            try:
                dt = datetime.fromisoformat(d['date'])
                diff = (dt - today).days
                if 0 <= diff < min_days:
                    min_days = diff
            except Exception:
                pass

        if min_days < 3:
            urgency = "High"
        elif min_days < 7:
            urgency = "Medium"

        return deadlines, urgency
