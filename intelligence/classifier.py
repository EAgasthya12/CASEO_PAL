import google.generativeai as genai
import os
import time
import json
import re
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

CONFIDENCE_THRESHOLD = 0.50

DEFAULT_CATEGORIES = ["Academic", "Internship", "Job", "Event", "Personal"]

# ── Tier 1: Keyword rules (ordered by priority, higher score = stronger signal) ──
# Each rule: (category, score, [keywords_lower])
KEYWORD_RULES = [
    # Internship — check BEFORE Job (trainee/intern are subsets of job-like emails)
    ("Internship", 0.92, [
        "internship", "intern position", "intern role", "internship program",
        "internship opportunity", "summer intern", "winter intern", "off-campus internship",
        "internship offer", "intern hiring",
    ]),
    ("Internship", 0.80, [
        "stipend", "paid internship",
    ]),

    # Job
    ("Job", 0.95, [
        "job profile", "job opening", "job opportunity", "job application",
        "job offer", "open for application", "accepting applications", "new job opening",
    ]),
    ("Job", 0.85, [
        "we are hiring", "currently hiring", "open position", "open role",
        "career opportunity", "full-time role", "developer role", "engineer role",
        "software engineer", "business development", "apply now", "ctc",
        "salary package", "shortlisted for", "you have been shortlisted",
        "stage 1", "stage 2", "gd round", "interview scheduled",
        "joining date", "offer letter", "placement drive",
    ]),
    ("Job", 0.75, [
        "vacancy", "recruiter", "recruitment", "hiring for",
    ]),

    # Academic
    ("Academic", 0.95, [
        "nptel", "assignment due", "exam schedule", "exam timetable",
        "cgpa", "semester exam", "university portal", "academic calendar",
        "research paper", "thesis submission", "phd",
    ]),
    ("Academic", 0.85, [
        "lecture", "tutorial", "course material", "submit your report",
        "faculty", "professor", "attendance", "local chapter",
        "study material", "college", "department of", "academic",
        "marks", "grade", "result declared", "backlogs",
    ]),
    ("Academic", 0.75, [
        "semester", "timetable", "syllabus",
    ]),

    # Event
    ("Event", 0.90, [
        "hackathon", "webinar", "conference", "seminar", "fest",
        "cultural event", "sports event", "tech event",
    ]),
    ("Event", 0.80, [
        "workshop", "meetup", "rsvp", "register now", "open talk",
        "summit", "you are invited", "join us for", "event details",
        "live session", "online session", "quiz competition",
    ]),

    # Finance / Banking
    ("Finance", 0.92, [
        "transaction alert", "debit alert", "credit alert", "bank statement",
        "account statement", "payment received", "payment failed",
        "emi due", "loan statement", "upi transaction",
    ]),
    ("Finance", 0.80, [
        "invoice", "receipt", "order confirmation", "refund", "subscription renewed",
        "bill generated", "due amount", "payment reminder",
    ]),

    # Newsletter / Promotions
    ("Newsletter", 0.88, [
        "unsubscribe", "newsletter", "weekly digest", "monthly update",
        "you're receiving this because", "view in browser",
        "this email was sent to",
    ]),
    ("Newsletter", 0.78, [
        "latest news", "product update", "new feature", "what's new",
        "now available", "introducing", "check it out",
    ]),

    # Personal
    ("Personal", 0.90, [
        "dear friend", "happy birthday", "best wishes", "congratulations",
        "personal note", "family", "vacation", "hi there",
    ]),
]

# Senders that strongly imply a category
SENDER_RULES = [
    ("Job",        0.88, ["superset", "joinsuperset", "instahyre", "naukri", "linkedin", "foundit", "hirist"]),
    ("Academic",   0.85, ["nptel", "swayam", "coursera", "udemy", "edx"]),
    ("Event",      0.80, ["eventbrite", "meetup.com", "townscript", "unstop"]),
    ("Finance",    0.90, ["noreply@hdfcbank", "alerts@axisbank", "noreply@icicibank",
                          "sbi.", "kotak", "paytm", "razorpay", "stripe", "paypal"]),
    ("Newsletter", 0.82, ["substack", "mailchimp", "sendgrid", "campaigns.medi"]),
]


def keyword_classify(text_lower, sender_lower, labels):
    best_cat = None
    best_score = 0.0

    # Sender rules (checked first — high signal)
    for category, score, patterns in SENDER_RULES:
        if category not in labels:
            continue
        for pat in patterns:
            if pat in sender_lower:
                if score > best_score:
                    best_score = score
                    best_cat = category

    # Keyword rules
    for category, score, keywords in KEYWORD_RULES:
        if category not in labels:
            continue
        for kw in keywords:
            if kw in text_lower:
                if score > best_score:
                    best_score = score
                    best_cat = category
                break  # one match per rule group is enough

    return best_cat, best_score


def _call_gemini_with_retry(model, prompt, max_attempts=3):
    last_err = None
    for attempt in range(max_attempts):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            last_err = e
            wait = 2 ** attempt
            print(f"[Classifier] Gemini attempt {attempt + 1} failed, retrying in {wait}s…")
            time.sleep(wait)
    raise last_err


class EmailClassifier:
    def __init__(self):
        self.gemini = genai.GenerativeModel("gemini-1.5-flash") # Fixed model name
        print("[Classifier] Ready - Tier 1 keywords + Tier 2 Gemini Flash.")

    def classify(self, text, user_categories=None, sender=""):
        if text and len(text) > 2000:
            text = text[:2000]

        labels = user_categories if user_categories and len(user_categories) > 0 else DEFAULT_CATEGORIES
        text_lower = text.lower()
        sender_lower = sender.lower() if sender else ""

        cat, score = keyword_classify(text_lower, sender_lower, labels)
        if cat and score >= CONFIDENCE_THRESHOLD:
            return {"category": cat, "confidence": score, "is_new_category": False, "urgency": "Low"}

        existing_str = ", ".join(f'"{c}"' for c in labels)
        prompt = f"""You are an intelligent email categorisation assistant.

Existing categories: [{existing_str}]

Email content:
\"\"\"{text}\"\"\"

Respond with ONLY raw JSON (no markdown):
{{
  "category": "<name>", 
  "is_new": true/false, 
  "confidence": 0.0-1.0, 
  "urgency": "Critical" | "High" | "Medium" | "Low"
}}

Urgency Rules:
- "Critical": Immediate action today or extremely impactful (e.g. interview today, deadline today).
- "High": Important with a deadline in 1-3 days (e.g. new assignment, meeting invite).
- "Medium": Standard informative mail.
- "Low": General promotion or non-urgent mail.

Rules:
1. Always pick the best category.
2. Only set "is_new": true if it doesn't fit existing categories."""

        try:
            raw_text = _call_gemini_with_retry(self.gemini, prompt)
            raw = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE).strip()
            parsed = json.loads(raw)
            category = parsed.get("category", labels[0])
            is_new = parsed.get("is_new", False)
            confidence = float(parsed.get("confidence", 0.9))
            urgency = parsed.get("urgency", "Low")
            
            if urgency not in ["Critical", "High", "Medium", "Low"]:
                urgency = "Low"
            if category in labels:
                is_new = False

            return {"category": category, "confidence": confidence, "is_new_category": is_new, "urgency": urgency}

        except Exception as e:
            print(f"[Classifier] Gemini fallback to keyword due to error: {e}")
            if cat:
                return {"category": cat, "confidence": 0.5, "is_new_category": False, "urgency": "Low"}
            return {"category": "Personal", "confidence": 0.4, "is_new_category": False, "urgency": "Low"}

    def classify_batch(self, emails, labels):
        if not emails: return {}
        existing_str = ", ".join(f'"{c}"' for c in labels)
        email_block = "\n".join(f'{e["id"]}. """{e["text"][:600]}"""' for e in emails)

        prompt = f"""Classify each email. Existing: [{existing_str}]
Respond ONLY with JSON mapping ID to result:
{{
  "0": {{"category": "<name>", "is_new": false, "confidence": 0.85, "urgency": "Low"}},
  ...
}}
Urgency: Critical, High, Medium, Low."""

        try:
            raw_text = _call_gemini_with_retry(self.gemini, prompt)
            raw = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE).strip()
            parsed = json.loads(raw)

            results = {}
            for e in emails:
                key = str(e["id"])
                cls = parsed.get(key, {})
                category = cls.get("category", labels[0] if labels else "Personal")
                urgency = cls.get("urgency", "Low")
                results[e["id"]] = {
                    "category": category,
                    "confidence": float(cls.get("confidence", 0.85)),
                    "is_new_category": cls.get("is_new", False),
                    "urgency": urgency if urgency in ["Critical", "High", "Medium", "Low"] else "Low"
                }
            return results
        except Exception as e:
            print(f"[Classifier] Batch failed: {e}")
            return {e["id"]: {"category": "Personal", "confidence": 0.5, "is_new_category": False, "urgency": "Low"} for e in emails}
