#!/usr/bin/env python
# Wrapper script for the Flask backend server
import os
import sys
import importlib.util

# Add the backend directory to the path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)

# Import and run the Flask app
from app import app

if __name__ == "__main__":
    # Run the app on localhost:5000
    app.run(host="0.0.0.0", port=5000)
