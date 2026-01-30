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

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "running", "service": "CASEO Intelligence Layer"})

@app.route('/classify', methods=['POST'])
def classify():
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400

    # Classification
    cls_result = classifier.classify(text)
    
    # Extraction
    deadlines, urgency = extractor.extract_deadlines(text)
    
    return jsonify({
        "category": cls_result['category'],
        "confidence": cls_result['confidence'],
        "deadlines": deadlines,
        "urgency": urgency
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
