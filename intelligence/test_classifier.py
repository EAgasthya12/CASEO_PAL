from classifier import EmailClassifier
import traceback

print("Initializing Classifier...")
try:
    classifier = EmailClassifier()
    print("Classifier initialized successfully.")
    
    text = "Assignment due tomorrow"
    print(f"Testing with text: '{text}'")
    
    result = classifier.classify(text)
    print(f"Result: {result}")
    
except Exception:
    traceback.print_exc()
