from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)

from classifier import EmailClassifier
from extractor import DateExtractor

# Initialize models (singleton pattern for this simple app)
print("Loading models...")
classifier = EmailClassifier()
extractor = DateExtractor()
print("Models loaded.")

import logging
import sys
import io

# Force UTF-8 for stdout/stderr to prevent Windows UnicodeEncodeError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Configure logging
logging.basicConfig(
    filename='app_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    encoding='utf-8'
)
# Also log to stdout for immediate visibility in terminal
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
logging.getLogger().addHandler(console_handler)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "service": "CASEO Intelligence Layer"})

@app.route('/classify', methods=['POST'])
def classify():
    try:
        data = request.json
        text = data.get('text', '')
        user_categories = data.get('user_categories', [])
        
        if not text:
            logging.warning("No text provided in request")
            return jsonify({"error": "No text provided"}), 400

        # Classification (Tier 1: zero-shot, Tier 2: Gemini fallback)
        cls_result = classifier.classify(text, user_categories=user_categories)
        
        # Extraction
        deadlines, urgency = extractor.extract_deadlines(text)
        
        return jsonify({
            "category": cls_result['category'],
            "confidence": cls_result['confidence'],
            "is_new_category": cls_result.get('is_new_category', False),
            "deadlines": deadlines,
            "urgency": urgency
        })
    except Exception as e:
        logging.error(f"Error in /classify endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/classify-batch', methods=['POST'])
def classify_batch():
    """
    Batch classify multiple emails in a single request.
    Expects: { "emails": [{"id": "msgId", "text": "subject + snippet"}, ...], "user_categories": [...] }
    Returns: { "results": {"msgId": {"category": ..., "confidence": ..., "is_new_category": ...}, ...} }
    """
    try:
        data = request.json
        emails = data.get('emails', [])
        user_categories = data.get('user_categories', [])

        if not emails:
            return jsonify({"error": "No emails provided"}), 400

        labels = user_categories if user_categories else ["Academic", "Internship", "Job", "Event", "Personal"]

        all_results = {}
        batch_size = 10  # Classify 10 emails per Gemini call

        for i in range(0, len(emails), batch_size):
            batch = emails[i:i + batch_size]
            # Re-index within the batch for the prompt
            indexed = [{"id": j, "text": item["text"]} for j, item in enumerate(batch)]
            batch_result = classifier.classify_batch(indexed, labels)

            for j, item in enumerate(batch):
                msg_id = item["id"]
                cls = batch_result.get(j, {"category": labels[0], "confidence": 0.5, "is_new_category": False})

                # Also run deadline extraction for this email
                deadlines, urgency = extractor.extract_deadlines(item["text"])
                all_results[msg_id] = {
                    "category": cls["category"],
                    "confidence": cls["confidence"],
                    "is_new_category": cls.get("is_new_category", False),
                    "deadlines": deadlines,
                    "urgency": urgency
                }

        return jsonify({"results": all_results})

    except Exception as e:
        logging.error(f"Error in /classify-batch endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    logging.info(f"Starting app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
