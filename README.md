# CASEO Project

## Prerequisites
- Node.js (v18 or higher)
- Python (v3.8 or higher)
- MongoDB (running locally or a URI)

## Setup Instructions

### 1. Backend Server (Node.js)
```bash
cd server
npm install
npm run dev
```
*Port: 5000*

### 2. Frontend Client (React/Vite)
open a new terminal
```bash
cd client
npm install
npm run dev
```
*Port: 5173 (http://localhost:5173)*

### 3. Intelligence Layer (Python)
open a new terminal
```bash
cd intelligence
python -m venv venv
# Activate venv:
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python app.py
```
*Port: 5001*

## Environment Variables
Ensure `.env` files are present in `server` and `intelligence` directories if they were not included in the zip (note: standard `.env` files are usually excluded from git but checking your zip, they seem to be included).
