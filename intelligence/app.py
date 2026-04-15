import sys
import io
import os
import logging

# ── UTF-8 stdout/stderr fix (must be FIRST on Windows) ───────────────────────
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ── Logging (must be set up before model loading)
logging.basicConfig(
    filename='app_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    encoding='utf-8'
)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
logging.getLogger().addHandler(console_handler)

from flask import Flask, request, jsonify
from dotenv import load_dotenv

URGENCY_RANK = {"Critical": 3, "High": 2, "Medium": 1, "Low": 0}
rank_to_urs = {3: "Critical", 2: "High", 1: "Medium", 0: "Low"}

def combine_urgency(u1, u2):
    r1 = URGENCY_RANK.get(u1, 0)
    r2 = URGENCY_RANK.get(u2, 0)
    return rank_to_urs[max(r1, r2)]

load_dotenv()

app = Flask(__name__)

# ── Request size limit: 2 MB max (prevents huge email bodies from crashing Flask)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024

# ── CORS headers on every response ───────────────────────────────────────────
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

from classifier import EmailClassifier
from extractor_strict import DateExtractor

logging.info("Loading models...")
classifier = EmailClassifier()
extractor = DateExtractor()
logging.info("Models loaded and ready.")


@app.route('/health', methods=['GET'])
def health():
    gemini_configured = bool(os.getenv("GEMINI_API_KEY"))
    return jsonify({
        "status": "running",
        "service": "CASEO Intelligence Layer",
        "gemini_configured": gemini_configured,
    })


@app.route('/classify', methods=['POST'])
def classify():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        text = data.get('text', '')
        user_categories = data.get('user_categories', [])
        sender = data.get('sender', '')
        learning_profile = data.get('learning_profile', {})

        if not text:
            logging.warning("No text provided in request")
            return jsonify({"error": "No text provided"}), 400

        # Classification (Tier 1: keyword, Tier 2: Gemini 2.5 Flash, Tier 3: fallback)
        cls_result = classifier.classify(
            text,
            user_categories=user_categories,
            sender=sender,
            learning_profile=learning_profile,
        )

        # Deadline + urgency extraction
        deadlines, date_urgency = extractor.extract_deadlines(text)
        
        # Combine: take the more urgent signal
        final_urgency = combine_urgency(cls_result.get('urgency', 'Low'), date_urgency)

        return jsonify({
            "category": cls_result['category'],
            "confidence": cls_result['confidence'],
            "is_new_category": cls_result.get('is_new_category', False),
            "deadlines": deadlines,
            "urgency": final_urgency
        })
    except Exception as e:
        logging.error(f"Error in /classify endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/classify-batch', methods=['POST'])
def classify_batch():
    """
    Batch classify multiple emails in a single Gemini call.
    Body: { "emails": [{"id": "msgId", "text": "subject + snippet"}, ...], "user_categories": [...] }
    Returns: { "results": {"msgId": {"category": ..., "confidence": ..., "is_new_category": ..., "deadlines": [...], "urgency": ...}} }
    """
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        emails = data.get('emails', [])
        user_categories = data.get('user_categories', [])
        learning_profile = data.get('learning_profile', {})

        if not emails:
            return jsonify({"error": "No emails provided"}), 400

        labels = user_categories if user_categories else ["Academic", "Internship", "Job", "Event", "Finance", "Newsletter", "Personal"]

        all_results = {}
        batch_size = 10  # Gemini can comfortably handle 10 emails per call

        for i in range(0, len(emails), batch_size):
            batch = emails[i:i + batch_size]
            # Re-index within the batch for the prompt
            indexed = [{"id": j, "text": item.get("text", ""), "sender": item.get("sender", "")} for j, item in enumerate(batch)]
            batch_result = classifier.classify_batch(indexed, labels, learning_profile=learning_profile)

            for j, item in enumerate(batch):
                msg_id = item["id"]
                cls = batch_result.get(j, {
                    "category": labels[0], "confidence": 0.50, "is_new_category": False, "urgency": "Low"
                })
                deadlines, date_urgency = extractor.extract_deadlines(item["text"])
                
                final_urgency = combine_urgency(cls.get("urgency", "Low"), date_urgency)
                
                all_results[msg_id] = {
                    "category": cls["category"],
                    "confidence": cls["confidence"],
                    "is_new_category": cls.get("is_new_category", False),
                    "deadlines": deadlines,
                    "urgency": final_urgency
                }

        return jsonify({"results": all_results})

    except Exception as e:
        logging.error(f"Error in /classify-batch endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/summarize', methods=['POST'])
def summarize():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        text = data.get('text', '')
        sender = data.get('sender', '')
        subject = data.get('subject', '')

        if not text:
            return jsonify({"error": "No text provided"}), 400

        result = classifier.summarize_email(text, sender=sender, subject=subject)
        return jsonify(result)
    except Exception as e:
        logging.error(f"Error in /summarize endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    logging.info(f"Starting CASEO Intelligence Layer on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
