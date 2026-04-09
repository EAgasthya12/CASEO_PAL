import re
import spacy
import dateparser
from dateparser.search import search_dates
from datetime import datetime, timezone

DEADLINE_SIGNALS = [
    r'last\s+date', r'due\s+(date|by|on)', r'deadline', r'submit\s+by',
    r'register\s+(by|before|on)', r'apply\s+(by|before)', r'closes?\s+(on|at)',
    r'before\s+\w+\s*\d', r'by\s+\w+\s*\d', r'until\s+\w+\s*\d',
    r'expir(es?|y|ing)', r'ends?\s+(on|at|by)', r'final\s+date',
    r'not\s+later\s+than', r'no\s+later\s+than',
    r'must\s+(be\s+)?(submit|send|register|apply)',
    r'interview\s+scheduled', r'report\s+at', r'appear\s+for',
    r'joining\s+(date|on)', r'reporting\s+(date|time)',
    r'slot\s+(date|time)', r'session\s+(date|time)',
]
SIGNAL_RE = re.compile('|'.join(DEADLINE_SIGNALS), re.IGNORECASE)
MAX_DEADLINE_CANDIDATES = 5
MIN_CONTEXT_WINDOW = 160

DEADLINE_SIGNAL_TYPES = [
    ("Expiry Date", 110, re.compile(r'ends?\s+(on|at|by)|expires?\s+(on|at|by)?|valid\s+until|offer\s+ends?', re.IGNORECASE)),
    ("Application Deadline", 100, re.compile(r'apply\s+(by|before)|application\s+deadline|last\s+date\s+to\s+apply|registration\s+deadline', re.IGNORECASE)),
    ("Submission Deadline", 95, re.compile(r'assignment\s+due|submission\s+deadline|submit\s+by|last\s+date\s+to\s+submit|due\s+date', re.IGNORECASE)),
    ("Interview Date", 90, re.compile(r'interview\s+scheduled|interview\s+on|slot\s+(date|time)|assessment\s+on', re.IGNORECASE)),
    ("Reporting Date", 88, re.compile(r'reporting\s+(date|time)|report\s+at|joining\s+(date|on)|appear\s+for', re.IGNORECASE)),
]
NUMERIC_DMY_RE = re.compile(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b')


class DateExtractor:
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            from spacy.cli import download
            download("en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")

    def _parse_date(self, date_text):
        numeric_match = NUMERIC_DMY_RE.search(date_text)
        if numeric_match:
            day, month, year = map(int, numeric_match.groups())
            if year < 100:
                year += 2000
            try:
                return datetime(year, month, day, tzinfo=timezone.utc)
            except ValueError:
                return None

        parsed = dateparser.parse(
            date_text,
            settings={'PREFER_DATES_FROM': 'future', 'RETURN_AS_TIMEZONE_AWARE': True}
        )
        if not parsed:
            return None
        return parsed.astimezone(timezone.utc)

    def _has_deadline_signal(self, text, date_text, start_pos, end_pos):
        context_start = max(0, start_pos - MIN_CONTEXT_WINDOW)
        context_end = min(len(text), end_pos + MIN_CONTEXT_WINDOW)
        context = text[context_start:context_end]

        if SIGNAL_RE.search(context):
            return True

        sentence_start = max(text.rfind('.', 0, start_pos), text.rfind('\n', 0, start_pos))
        sentence = text[sentence_start + 1:context_end].lower()
        lowered_date = date_text.lower()
        directional_patterns = [
            r'(?:by|before|on|until)\s+' + re.escape(lowered_date),
            r'(?:deadline|due|submit|submission|apply|application|register|registration|interview|reporting|joining|exam|assessment)[^.\n]{0,100}' + re.escape(lowered_date),
        ]
        return any(re.search(pattern, sentence, re.IGNORECASE) for pattern in directional_patterns)

    def _infer_signal_type(self, text, start_pos, end_pos):
        context_start = max(0, start_pos - MIN_CONTEXT_WINDOW)
        context_end = min(len(text), end_pos + MIN_CONTEXT_WINDOW)
        context = text[context_start:context_end]
        for label, score, pattern in DEADLINE_SIGNAL_TYPES:
            if pattern.search(context):
                return label, score
        return "Deadline", 50

    def extract_deadlines(self, text):
        try:
            if text and len(text) > 2048:
                text = text[:2048]

            doc = self.nlp(text)
            raw_candidates = []

            for ent in doc.ents:
                if ent.label_ not in ["DATE", "TIME"]:
                    continue

                parsed = self._parse_date(ent.text)
                if not parsed:
                    continue

                signal_label, signal_score = self._infer_signal_type(text, ent.start_char, ent.end_char)
                has_signal = self._has_deadline_signal(text, ent.text, ent.start_char, ent.end_char)
                if not has_signal:
                    continue

                days_ahead = (parsed - datetime.now(timezone.utc)).days
                if days_ahead > 400:
                    continue

                raw_candidates.append({
                    "text": ent.text,
                    "date": parsed.isoformat(),
                    "label": signal_label,
                    "score": signal_score,
                    "has_signal": has_signal,
                })

            found_dates = search_dates(
                text,
                settings={'PREFER_DATES_FROM': 'future', 'RETURN_AS_TIMEZONE_AWARE': True}
            ) or []
            for text_match, parsed_date in found_dates:
                pos = text.find(text_match)
                has_signal = False
                signal_label = "Deadline"
                signal_score = 50
                if pos >= 0:
                    has_signal = self._has_deadline_signal(text, text_match, pos, pos + len(text_match))
                    signal_label, signal_score = self._infer_signal_type(text, pos, pos + len(text_match))
                if not has_signal:
                    continue

                days_ahead = (parsed_date.astimezone(timezone.utc) - datetime.now(timezone.utc)).days
                if days_ahead > 400:
                    continue

                raw_candidates.append({
                    "text": text_match,
                    "date": parsed_date.astimezone(timezone.utc).isoformat(),
                    "label": signal_label,
                    "score": signal_score,
                    "has_signal": has_signal,
                })

            seen_days = {}
            for candidate in raw_candidates:
                day_key = candidate["date"][:10]
                if day_key not in seen_days or candidate["score"] > seen_days[day_key]["score"]:
                    seen_days[day_key] = candidate

            ranked_deadlines = sorted(
                seen_days.values(),
                key=lambda item: (-item["score"], item["date"])
            )
            deadlines = ranked_deadlines[:1]

            for deadline in deadlines:
                deadline.pop("has_signal", None)
                deadline.pop("score", None)

        except Exception as e:
            print(f"Extraction error: {e}")
            return [], "Low"

        urgency = "Low"
        now = datetime.now(timezone.utc)
        min_hours = float('inf')
        for deadline in deadlines:
            try:
                dt = datetime.fromisoformat(deadline['date'])
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                diff_seconds = (dt - now).total_seconds()
                if diff_seconds > 0:
                    min_hours = min(min_hours, diff_seconds / 3600)
            except Exception:
                pass

        if min_hours < 24:
            urgency = "Critical"
        elif min_hours < 72:
            urgency = "High"
        elif min_hours < 168:
            urgency = "Medium"

        return deadlines, urgency
