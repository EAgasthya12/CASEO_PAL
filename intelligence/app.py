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
        # logging.info(f"Received classify request. Data keys: {data.keys() if data else 'None'}")
        
        text = data.get('text', '')
        # logging.debug(f"Text snippet: {text[:50]}...") 
        
        if not text:
            logging.warning("No text provided in request")
            return jsonify({"error": "No text provided"}), 400

        # Classification
        # logging.info("Calling classifier...")
        cls_result = classifier.classify(text)
        # logging.info(f"Classifier result: {cls_result}")
        
        # Extraction
        # logging.info("Calling extractor...")
        deadlines, urgency = extractor.extract_deadlines(text)
        # logging.info(f"Extractor result: deadlines={len(deadlines)}, urgency={urgency}")
        
        return jsonify({
            "category": cls_result['category'],
            "confidence": cls_result['confidence'],
            "deadlines": deadlines,
            "urgency": urgency
        })
    except Exception as e:
        logging.error(f"Error in /classify endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    logging.info(f"Starting app on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
