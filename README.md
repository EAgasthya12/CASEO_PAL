# CASEO PAL

**Cognitive Adaptive Smart Email Organiser & Personal Assistant Layer**

CASEO PAL is a full-stack AI-powered email intelligence platform. It connects to your Gmail account, automatically classifies emails into smart categories, extracts deadlines, scores urgency, generates AI summaries, and syncs with Google Calendar — all in one dashboard.

---

## How It Works (Simple Overview)

```
  Your Browser
      │
      ▼
  React Frontend  (port 5173)
      │  talks to
      ▼
  Node.js Backend  (port 5000)
      │                    │
      ▼                    ▼
  Gmail API         Python AI Engine  (port 5001)
  Calendar API      (Gemini + spaCy NLP)
      │
      ▼
  MongoDB Database
```

- The **frontend** is a React app where you log in with Google and see your emails.
- The **backend** (Node.js) handles authentication, fetches your Gmail, and stores data in MongoDB.
- The **intelligence layer** (Python/Flask) is a mini AI service that classifies emails, extracts deadlines, and summarises content using Google Gemini AI.

---

## Tech Stack

| Part        | What it uses                                  |
|-------------|-----------------------------------------------|
| Frontend    | React 19, Vite, React Router, Axios           |
| Backend     | Node.js, Express, Passport.js, Mongoose       |
| Database    | MongoDB                                       |
| AI Engine   | Python, Flask, Google Gemini 2.5 Flash, spaCy |
| Auth        | Google OAuth 2.0                              |
| Google APIs | Gmail API, Google Calendar API                |

---

## Features

- ✅ Sign in with Google (OAuth 2.0)
- ✅ Auto-sync Gmail inbox into a clean dashboard
- ✅ AI email classification (3-tier: keywords → Gemini AI → fallback)
- ✅ Custom user-defined email categories
- ✅ Deadline detection from email content
- ✅ Urgency scoring: `Low` / `Medium` / `High` / `Critical`
- ✅ AI-generated email summaries on demand
- ✅ Google Calendar integration (view & create events)
- ✅ User learning profile (AI adapts to your preferences)
- ✅ Protected dashboard (only logged-in users can access)

---

## Project Structure

```
CASEO_PAL/
│
├── client/                 ← React frontend
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── components/
│           ├── Login.jsx           ← Google login page
│           ├── Dashboard.jsx       ← Main email dashboard
│           ├── ProtectedRoute.jsx  ← Blocks unauthenticated access
│           ├── PrivacyPolicy.jsx
│           ├── TermsOfService.jsx
│           └── dashboard/
│               ├── Sidebar.jsx     ← Category sidebar
│               ├── TopBar.jsx      ← Top navigation bar
│               ├── EmailItem.jsx   ← Single email row
│               ├── EmailModal.jsx  ← Full email view + AI summary
│               └── Icons.jsx       ← SVG icons
│
├── server/                 ← Node.js backend
│   ├── config/
│   │   └── passport.js     ← Google OAuth setup
│   ├── controllers/
│   │   ├── emailController.js      ← Email sync, classify, fetch
│   │   └── calendarController.js   ← Calendar events
│   ├── models/
│   │   ├── User.js         ← User data + tokens + learning profile
│   │   └── Email.js        ← Email data + categories + urgency
│   ├── routes/
│   │   ├── authRoutes.js   ← Login/logout/me endpoints
│   │   └── apiRoutes.js    ← Email & calendar API endpoints
│   ├── services/
│   │   ├── gmailService.js         ← Gmail API calls
│   │   ├── calendarService.js      ← Calendar API calls
│   │   └── pythonBridge.js         ← Talks to Python AI service
│   └── index.js            ← Server entry point
│
├── intelligence/           ← Python AI microservice
│   ├── app.py              ← Flask routes (/classify, /summarize, etc.)
│   ├── classifier.py       ← 3-tier email classifier
│   ├── extractor_strict.py ← Deadline & urgency extractor
│   ├── requirements.txt    ← Python packages
│   └── setup_env.bat       ← Windows quick-start script
│
└── README.md
```

---

## Prerequisites

Make sure you have the following installed before starting:

- **Node.js** v18 or higher — https://nodejs.org
- **Python** v3.8 or higher — https://python.org
- **MongoDB** running locally on port `27017` — https://www.mongodb.com/try/download/community
- A **Google Cloud Project** with:
  - OAuth 2.0 credentials created
  - **Gmail API** enabled
  - **Google Calendar API** enabled
  - Redirect URI set to: `http://localhost:5000/auth/google/callback`
- A **Google Gemini API Key** — https://aistudio.google.com/app/apikey

---

## Setup & Installation

> You need **3 terminals** running at the same time — one for each part of the app.

---

### Terminal 1 — Backend Server (Node.js)

```bash
cd server
npm install
npm run dev
```

✅ Runs on: `http://localhost:5000`

---

### Terminal 2 — Frontend (React)

```bash
cd client
npm install
npm run dev
```

✅ Runs on: `http://localhost:5173`

---

### Terminal 3 — AI Intelligence Layer (Python)

```bash
cd intelligence

# Step 1: Create a virtual environment
python -m venv venv

# Step 2: Activate it
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

# Step 3: Install dependencies
pip install -r requirements.txt

# Step 4: Download the spaCy language model (only once)
python -m spacy download en_core_web_sm

# Step 5: Start the service
python app.py
```

✅ Runs on: `http://localhost:5001`

> **Windows shortcut:** You can also just run `.\setup_env.bat` to do steps 1–3 automatically.

---

## Environment Variables

You need two `.env` files — one in `server/` and one in `intelligence/`.

---

### `server/.env`

Create this file at `server/.env` and fill in all values:

```env
# Port the backend runs on
PORT=5000

# MongoDB connection string (default local)
MONGO_URI=mongodb://127.0.0.1:27017/caseo_db

# Google OAuth credentials
# Get these from: https://console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Must exactly match what you set in Google Cloud Console
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# URL of the frontend (used for CORS)
CLIENT_URL=http://localhost:5173

# A long random string used to sign sessions (make this unique and secret)
# Example: openssl rand -base64 32
SESSION_SECRET=replace_this_with_a_long_random_secret_string
```

**Where to get the Google credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized redirect URI: `http://localhost:5000/auth/google/callback`
7. Copy the **Client ID** and **Client Secret**

---

### `intelligence/.env`

Create this file at `intelligence/.env`:

```env
# Port the Python AI service runs on
PORT=5001

# Google Gemini API Key
# Get this from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here
```

**Where to get the Gemini API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API Key**
3. Copy the key and paste it above

---

> ⚠️ **Important:** Never share your `.env` files or commit them to GitHub. They are listed in `.gitignore` and should stay private.

---

## Running the App

Once all three terminals are running and `.env` files are set up:

1. Open your browser and go to `http://localhost:5173`
2. Click **Sign in with Google**
3. Allow the required permissions (Gmail + Calendar access)
4. Your emails will start syncing and being classified automatically

---

## API Quick Reference

### Backend (port 5000)

| Endpoint                | Method | What it does                      |
|-------------------------|--------|-----------------------------------|
| `/auth/google`          | GET    | Start Google login                |
| `/auth/google/callback` | GET    | Google redirects here after login |
| `/auth/me`              | GET    | Get current logged-in user        |
| `/auth/logout`          | GET    | Log out                           |
| `/api/emails`           | GET    | Get all stored emails             |
| `/api/emails/sync`      | POST   | Sync new emails from Gmail        |
| `/api/calendar`         | GET    | Get upcoming calendar events      |
| `/api/calendar/create`  | POST   | Create a new calendar event       |

### AI Service (port 5001)

| Endpoint          | Method | What it does                       |
|-------------------|--------|------------------------------------|
| `/health`         | GET    | Check if service is running        |
| `/classify`       | POST   | Classify a single email            |
| `/classify-batch` | POST   | Classify up to 10 emails at once   |
| `/summarize`      | POST   | Generate an AI summary of an email |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| MongoDB not connecting | Make sure MongoDB is running: `mongod` |
| Google login not working | Check `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and redirect URI in Google Console |
| AI service not responding | Make sure `python app.py` is running in Terminal 3 |
| Gemini errors | Check that `GEMINI_API_KEY` is set correctly in `intelligence/.env` |
| spaCy model missing | Run `python -m spacy download en_core_web_sm` inside the venv |
| CORS errors | Make sure `CLIENT_URL` in `server/.env` matches the frontend port |
