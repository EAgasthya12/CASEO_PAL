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

# ── Tier 1: Keyword rules (ordered by priority, higher = stronger signal) ────
# Each rule: (category, score, [keywords_lower])
KEYWORD_RULES = [
    # Internship — check BEFORE Job (trainee/intern are subsets of job-like emails)
    ("Internship", 0.90, [
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
        "job offer", "open for application", "accepting applications",
        "new job opening",
    ]),
    ("Job", 0.85, [
        "we are hiring", "currently hiring", "open position", "open role",
        "career opportunity", "full-time role", "developer role", "engineer role",
        "software engineer", "business development", "apply now", "ctc",
        "salary package", "shortlisted for", "you have been shortlisted",
        "stage 1", "stage 2", "gd round", "interview scheduled",
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
        "live session", "online session",
    ]),

    # Personal
    ("Personal", 0.90, [
        "dear friend", "happy birthday", "best wishes", "congratulations",
        "personal note",
    ]),
]

# Senders that strongly imply a category
SENDER_RULES = [
    ("Job",        0.85, ["superset", "joinsuperset", "instahyre", "naukri", "linkedin", "foundit"]),
    ("Academic",   0.85, ["nptel", "swayam", "coursera", "udemy", "edx"]),
    ("Event",      0.80, ["eventbrite", "meetup.com", "townscript"]),
    ("Personal",   0.85, ["gmail.com"]),  # Personal Gmail senders
]


def keyword_classify(text_lower, sender_lower, labels):
    """
    Returns (category, confidence) if a strong keyword/sender match is found.
    Returns (None, 0) if no confident match.
    """
    best_cat = None
    best_score = 0.0

    # Check sender rules first
    for category, score, patterns in SENDER_RULES:
        if category not in labels:
            continue
        for pat in patterns:
            if pat in sender_lower:
                if score > best_score:
                    best_score = score
                    best_cat = category

    # Check text keywords
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


class EmailClassifier:
    def __init__(self):
        self.gemini = genai.GenerativeModel("gemini-2.5-flash")
        print("[Classifier] Ready — keyword Tier 1 + Gemini Tier 2.")

    def classify(self, text, user_categories=None, sender=""):
        if text and len(text) > 1000:
            text = text[:1000]

        labels = user_categories if user_categories and len(user_categories) > 0 else DEFAULT_CATEGORIES
        text_lower = text.lower()
        sender_lower = sender.lower() if sender else ""

        # ── Tier 1: Keyword + sender matching (instant) ───────────────────────
        cat, score = keyword_classify(text_lower, sender_lower, labels)
        if cat and score >= CONFIDENCE_THRESHOLD:
            print(f"[Classifier] Tier 1 (keyword) → '{cat}' ({score:.2f})")
            return {"category": cat, "confidence": score, "is_new_category": False}

        print(f"[Classifier] No strong keyword match (best={score:.2f}), calling Gemini...")

        # ── Tier 2: Gemini — one attempt only, fail fast to keyword fallback ─────
        existing_str = ", ".join(f'"{c}"' for c in labels)
        prompt = f"""You are an intelligent email categorization assistant.

Existing categories: [{existing_str}]

Email content:
\"\"\"{text}\"\"\"

Rules:
1. Pick the single most appropriate existing category.
2. ONLY create a new category (1-3 words, Title Case) if this email genuinely doesn't fit any existing one.
3. "Unknown" is NOT valid. Always return a real category.

Respond with ONLY raw JSON:
{{"category": "<name>", "is_new": true/false, "confidence": 0.0-1.0}}"""

        try:
            response = self.gemini.generate_content(prompt)
            raw = re.sub(r"^```json\s*|\s*```$", "", response.text.strip(), flags=re.MULTILINE).strip()
            parsed = json.loads(raw)
            category   = parsed.get("category", "")
            is_new     = parsed.get("is_new", False)
            confidence = float(parsed.get("confidence", 0.9))

            if not category or category == "Unknown":
                raise ValueError("Empty/Unknown response from Gemini")
            if category in labels:
                is_new = False

            print(f"[Classifier] Tier 2 (Gemini) → '{category}' (new={is_new}, conf={confidence:.2f})")
            return {"category": category, "confidence": confidence, "is_new_category": is_new}

        except Exception as e:
            print(f"[Classifier] Gemini unavailable ({type(e).__name__}), using keyword fallback instantly.")

        # ── Tier 3: Best keyword match as final fallback ──────────────────────
        if cat:
            print(f"[Classifier] Keyword fallback → '{cat}'")
            return {"category": cat, "confidence": 0.5, "is_new_category": False}

        print("[Classifier] No match, defaulting to 'Personal'")
        return {"category": "Personal", "confidence": 0.4, "is_new_category": False}
