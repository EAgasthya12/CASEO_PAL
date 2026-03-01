@echo off
echo Setting up CASEO Intelligence Environment...

REM Check for Python 3.12
py -3.12 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python 3.12 is not installed or not found in PATH.
    echo Please install Python 3.12 to proceed.
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    py -3.12 -m venv venv
) else (
    echo Virtual environment already exists.
)

REM Activate and install requirements
echo Installing dependencies...
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Download spaCy model
echo Downloading spaCy model...
python -m spacy download en_core_web_sm

echo.
echo Setup complete!
echo To start the app, run:
echo venv\Scripts\activate
echo python app.py
pause
