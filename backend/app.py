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
from flask.logging import default_handler
import werkzeug._internal as _werkzeug_internal


# Import the optimizers
from schedule_optimizer import optimize_schedule, ScheduleOptimizer
from monthly_schedule_optimizer import optimize_monthly_schedule, MonthlyScheduleOptimizer

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
        "availability": {...},
        "scheduling_mode": "yearly" or "monthly",
        "month": <integer 1-12> (required when scheduling_mode is "monthly")
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
        
        # Check scheduling mode
        scheduling_mode = data.get("scheduling_mode", "yearly")
        
        if scheduling_mode == "monthly":
            month = data.get("month")
            if month is None:
                return jsonify({
                    "error": "Month parameter is required for monthly scheduling"
                }), 400
                
            try:
                month = int(month)
                if month < 1 or month > 12:
                    return jsonify({
                        "error": f"Invalid month: {month}. Month must be between 1 and 12."
                    }), 400
            except ValueError:
                return jsonify({
                    "error": f"Invalid month format: {month}. Month must be an integer."
                }), 400
                
            optimization_progress["message"] = f"Initializing optimization for month {month}"
            
            # Run monthly optimization
            result = optimize_monthly_schedule(data, progress_callback=update_progress)
        else:
            # Run yearly optimization
            result = optimize_schedule(data, progress_callback=update_progress)
        
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
        mode_prefix = "monthly" if scheduling_mode == "monthly" else "yearly"
        month_suffix = f"_month{month}" if scheduling_mode == "monthly" else ""
        filename = f"{mode_prefix}_optimization_{timestamp}{month_suffix}.json"
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
            if (filename.startswith("optimization_") or 
                filename.startswith("yearly_optimization_") or
                filename.startswith("monthly_optimization_")) and filename.endswith(".json"):
                
                filepath = os.path.join(RESULTS_DIR, filename)
                
                # Extract timestamp and scheduling mode
                scheduling_mode = "yearly"
                if filename.startswith("monthly_optimization_"):
                    scheduling_mode = "monthly"
                    
                timestamp_part = filename.split("_")[2] if scheduling_mode == "yearly" else filename.split("_")[2]
                timestamp = timestamp_part.split(".")[0]
                
                # Get month for monthly optimizations
                month = None
                if scheduling_mode == "monthly" and "_month" in filename:
                    month_part = filename.split("_month")[1]
                    if month_part and month_part[0].isdigit():
                        month = int(month_part[0])
                
                # Get basic statistics from file
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                        stats = data.get("statistics", {})
                        
                        runs.append({
                            "id": filename,
                            "timestamp": timestamp,
                            "scheduling_mode": scheduling_mode,
                            "month": month,
                            "status": stats.get("status", "UNKNOWN"),
                            "solution_time": stats.get("solution_time_seconds", 0),
                            "objective_value": stats.get("objective_value", 0)
                        })
                except Exception as e:
                    runs.append({
                        "id": filename,
                        "timestamp": timestamp,
                        "scheduling_mode": scheduling_mode,
                        "month": month,
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