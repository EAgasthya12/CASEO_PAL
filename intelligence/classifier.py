from transformers import pipeline

class EmailClassifier:
    def __init__(self):
        # Use a zero-shot classifier for flexibility without training data
        # Using a smaller model for efficiency, but can be swapped for facebook/bart-large-mnli
        self.classifier = pipeline("zero-shot-classification", model="valhalla/distilbart-mnli-12-1") 
        self.labels = ["Academic", "Internship", "Event", "Personal"]

    def classify(self, text):
        try:
            # Truncate to avoid model crashes on long inputs/edge cases
            # 512 characters is usually enough for a subject + snippet
            if text and len(text) > 512:
                text = text[:512]

            result = self.classifier(text, self.labels, truncation=True)
            # result['labels'] and result['scores'] are sorted by score descending
            return {
                "category": result['labels'][0],
                "confidence": result['scores'][0]
            }
        except Exception as e:
            print(f"Classification error: {e}")
            return {"category": "Unknown", "confidence": 0.0}
