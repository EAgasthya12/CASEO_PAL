# CASEO Intelligence Layer

This module provides AI capabilities for the CASEO platform, including email classification and deadline extraction.

## Prerequisites

- **Python 3.12** is REQUIRED for this project.
  - Download: [Python 3.12](https://www.python.org/downloads/release/python-3120/)
  - Note: Python 3.14 is currently NOT supported due to library incompatibilities.

## Quick Setup (Windows)

1.  Double-click `setup_env.bat` to automatically create the environment and install dependencies.
2.  Activate the environment:
    ```cmd
    venv\Scripts\activate
    ```
3.  Run the application:
    ```cmd
    python app.py
    ```

## Manual Setup

If you prefer to set it up manually:

1.  Create a virtual environment using Python 3.12:
    ```cmd
    py -3.12 -m venv venv
    ```

2.  Activate the environment:
    ```cmd
    venv\Scripts\activate
    ```

3.  Install dependencies:
    ```cmd
    pip install -r requirements.txt
    ```

4.  Download the spaCy model:
    ```cmd
    python -m spacy download en_core_web_sm
    ```

## Running the App

```cmd
python app.py
```
