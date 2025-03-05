#!/usr/bin/env python3
"""
Flask API server for Hospital Staff Scheduler optimization.

This server exposes endpoints to run the schedule optimization algorithm and 
get information about previous optimization runs.
"""

import os
import json
import datetime
import logging
import threading
import time
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

# Import the relaxed optimizer
from schedule_optimizer import optimize_schedule, ScheduleOptimizer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SchedulerServer")

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

# Directory to store optimization results
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)


# Global variable to store optimization progress
optimization_progress = {
    "current": 0,
    "total": 100,
    "status": "idle",
    "message": ""
}

# Function to update progress
def update_progress(progress, message=""):
    global optimization_progress
    optimization_progress["current"] = progress
    optimization_progress["message"] = message
    optimization_progress["status"] = "running" if progress < 100 else "completed"
    logger.info(f"Progress: {progress}% - {message}")

@app.route('/api/optimize', methods=['POST'])
def optimize():
    """
    Endpoint to run the optimization algorithm.
    
    Request body should contain:
    {
        "doctors": [...],
        "holidays": {...},
        "availability": {...}
    }
    
    Returns:
        JSON response with optimized schedule and statistics
    """
    try:
        # Get request data
        data = request.json
        
        if not data:
            return jsonify({
                "error": "No data provided"
            }), 400
        
        # Validate required fields
        if "doctors" not in data:
            return jsonify({
                "error": "Doctors list is required"
            }), 400
        
        # Reset progress
        global optimization_progress
        optimization_progress = {
            "current": 0,
            "total": 100,
            "status": "starting",
            "message": "Initializing optimization"
        }
        
        # Extract data for the optimizer
        doctors = data.get("doctors", [])
        holidays = data.get("holidays", {})
        availability = data.get("availability", {})
        
        # Run optimization with progress callback
        result = optimize_schedule(
            {"doctors": doctors, "holidays": holidays, "availability": availability}, 
            progress_callback=update_progress
        )
        
        # Check for errors from the optimizer
        if "error" in result and result["error"]:
            optimization_progress["status"] = "error"
            optimization_progress["message"] = result["error"]
            return jsonify({
                "error": result["error"]
            }), 500
        
        # Get schedule and statistics
        schedule = result.get("schedule", {})
        stats = result.get("statistics", {})
        
        # Create result
        result_data = {
            "schedule": schedule,
            "statistics": stats
        }
        
        # Save result to file with timestamp
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"optimization_{timestamp}.json"
        filepath = os.path.join(RESULTS_DIR, filename)
        
        with open(filepath, 'w') as f:
            json.dump(result_data, f, indent=2)
        
        # Update progress to completed
        update_progress(100, "Optimization complete")
        
        # Return result
        return jsonify(result_data)
    
    except Exception as e:
        logger.exception("Error in optimization")
        optimization_progress["status"] = "error"
        optimization_progress["message"] = str(e)
        return jsonify({
            "error": str(e)
        }), 500


@app.route('/api/optimize/progress', methods=['GET'])
def get_progress():
    """
    Endpoint to get the current optimization progress.
    
    Returns:
        JSON response with current progress
    """
    return jsonify(optimization_progress)


@app.route('/api/status', methods=['GET'])
def status():
    """
    Endpoint to check server status.
    
    Returns:
        JSON response with server status
    """
    return jsonify({
        "status": "up",
        "version": "1.0.0",
        "timestamp": datetime.datetime.now().isoformat()
    })


@app.route('/api/previous_runs', methods=['GET'])
def previous_runs():
    """
    Endpoint to get information about previous optimization runs.
    
    Returns:
        JSON response with list of previous runs
    """
    try:
        runs = []
        
        # List all optimization result files
        for filename in os.listdir(RESULTS_DIR):
            if filename.startswith("optimization_") and filename.endswith(".json"):
                filepath = os.path.join(RESULTS_DIR, filename)
                timestamp = filename.split("_")[1].split(".")[0]
                
                # Get basic statistics from file
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        stats = data.get("statistics", {})
                        
                        runs.append({
                            "id": filename,
                            "timestamp": timestamp,
                            "status": stats.get("status", "UNKNOWN"),
                            "solution_time": stats.get("solution_time_seconds", 0),
                            "objective_value": stats.get("objective_value", 0)
                        })
                except Exception as e:
                    runs.append({
                        "id": filename,
                        "timestamp": timestamp,
                        "status": "ERROR",
                        "error": str(e)
                    })
        
        # Sort by timestamp (newest first)
        runs.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return jsonify({
            "runs": runs
        })
    
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


@app.route('/api/run/<run_id>', methods=['GET'])
def get_run(run_id):
    """
    Endpoint to get full results of a specific optimization run.
    
    Args:
        run_id: ID of the optimization run
        
    Returns:
        JSON response with full optimization results
    """
    try:
        filepath = os.path.join(RESULTS_DIR, run_id)
        
        if not os.path.exists(filepath):
            return jsonify({
                "error": f"Run {run_id} not found"
            }), 404
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        return jsonify(data)
    
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


if __name__ == "__main__":
    # Start server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
# Add a __main__ block to ensure app can be run directly
if __name__ == "__main__":
    import sys
    print("Starting Hospital Scheduler Backend...", file=sys.stderr)
    print("Python version:", sys.version, file=sys.stderr)
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    except Exception as e:
        print(f"Error starting Flask app: {e}", file=sys.stderr)
        sys.exit(1)
