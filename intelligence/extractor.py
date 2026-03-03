import spacy
import dateparser
from datetime import datetime

class DateExtractor:
    def __init__(self):
        # Load English tokenizer, tagger, parser and NER
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            from spacy.cli import download
            download("en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")

    def extract_deadlines(self, text):
        try:
            # Truncate to avoid model crashes or hangs on long inputs
            if text and len(text) > 1024:
                text = text[:1024]

            doc = self.nlp(text)
            raw_deadlines = []

            # Extract DATE and TIME entities
            for ent in doc.ents:
                if ent.label_ in ["DATE", "TIME"]:
                    parsed_date = dateparser.parse(ent.text)
                    if parsed_date:
                        raw_deadlines.append({
                            "text": ent.text,
                            "date": parsed_date.isoformat(),
                            "label": ent.label_
                        })

            # ── Deduplication by calendar day ──────────────────────────────
            # spaCy often extracts the same date in multiple formats
            # e.g. "March 4" and "3/4/2026" both resolve to the same day.
            # Keep only the first occurrence of each unique YYYY-MM-DD day.
            seen_days = set()
            deadlines = []
            for d in raw_deadlines:
                day_key = d["date"][:10]   # "YYYY-MM-DD"
                if day_key not in seen_days:
                    seen_days.add(day_key)
                    deadlines.append(d)
            # ───────────────────────────────────────────────────────────────

        except Exception as e:
            print(f"Extraction error: {e}")
            return [], "Low"

        # Urgency detection based on closest upcoming deadline
        urgency = "Low"
        if deadlines:
            today = datetime.now()
            min_days = float('inf')

            for d in deadlines:
                dt = datetime.fromisoformat(d['date'])
                diff = (dt - today).days
                if diff < min_days:
                    min_days = diff

            if min_days < 3:
                urgency = "High"
            elif min_days < 7:
                urgency = "Medium"

        return deadlines, urgency
