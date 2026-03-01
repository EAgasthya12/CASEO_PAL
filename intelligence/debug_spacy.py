import spacy
try:
    import confection
    print("Confection version:", confection.__version__)
except ImportError:
    print("Confection not installed directly")

try:
    import pydantic
    print("Pydantic version:", pydantic.VERSION)
except AttributeError:
    print("Pydantic version:", pydantic.__version__)

print("Spacy version:", spacy.__version__)

try:
    nlp = spacy.load("en_core_web_sm")
    print("Success loading model")
except Exception as e:
    import traceback
    traceback.print_exc()
