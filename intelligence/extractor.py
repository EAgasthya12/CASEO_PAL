import spacy
import dateparser
from datetime import datetime

class DateExtractor:
    def __init__(self):
        # Load English tokenizer, tagger, parser and NER
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Fallback or need to download
            from spacy.cli import download
            download("en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")

    def extract_deadlines(self, text):
        try:
            # Truncate to avoid model crashes or hangs on long inputs
            if text and len(text) > 1024:
                text = text[:1024]

            doc = self.nlp(text)
            deadlines = []
            
            # Extract DATE and TIME entities
            for ent in doc.ents:
                if ent.label_ in ["DATE", "TIME"]:
                    parsed_date = dateparser.parse(ent.text)
                    if parsed_date:
                        deadlines.append({
                            "text": ent.text,
                            "date": parsed_date.isoformat(),
                            "label": ent.label_
                        })
            
            # Urgency detection
            urgency = "Low"
            # ... (rest of logic is same, but indentation shifts if I wrap whole thing, 
            # let's just wrap the dangerous part and return effectively)
            
            # ... actually, let's keep it simple and just return what we have
        except Exception as e:
            print(f"Extraction error: {e}")
            return [], "Low"

        # Continue with urgency detection (which is safe)
        urgency = "Low"
        if deadlines:
            today = datetime.now()
            # ...
        
        # Urgency detection
        urgency = "Low"
        if deadlines:
            today = datetime.now()
            min_days = float('inf')
            
            for d in deadlines:
                dt = datetime.fromisoformat(d['date'])
                # Calculate days difference (ignoring time for simplicity logic)
                diff = (dt - today).days
                if diff < min_days:
                    min_days = diff
            
            if min_days < 3:
                urgency = "High"
            elif min_days < 7:
                urgency = "Medium"
        
        return deadlines, urgency
