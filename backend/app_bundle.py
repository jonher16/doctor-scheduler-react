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
import threading
import time


# Import the optimizers
from monthly_schedule_optimizer import optimize_monthly_schedule, MonthlyScheduleOptimizer
from weight_optimizer import optimize_weights


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

tasks = {}

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

# Add this new route to your Flask application
@app.route('/api/optimize-weights', methods=['POST'])
def api_optimize_weights():
    """API endpoint for running weight optimization to find the best constraint weights."""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    # Check for required fields
    if 'doctors' not in data or 'holidays' not in data:
        return jsonify({"error": "Missing required data (doctors or holidays)"}), 400
    
    # Get weight optimization parameters
    max_iterations = data.get('max_iterations', 20)
    parallel_jobs = data.get('parallel_jobs', 1)
    time_limit_minutes = data.get('time_limit_minutes', 10)
    month = data.get('month')
    
    # Prepare data for optimizer
    optimization_data = {
        "doctors": data.get('doctors', []),
        "holidays": data.get('holidays', {}),
        "availability": data.get('availability', {}),
        "month": month,
        "year": data.get('year'),
        "max_iterations": max_iterations,
        "parallel_jobs": parallel_jobs,
        "time_limit_minutes": time_limit_minutes,
        "shift_template": data.get('shift_template', {})  # Add shift template
    }
    
    # Log the shift template structure for debugging
    shift_template = data.get('shift_template', {})
    if shift_template:
        logger.info(f"Received shift template with {len(shift_template)} days")
        # Log a sample of the template
        sample_keys = list(shift_template.keys())[:3]
        for key in sample_keys:
            logger.info(f"Template sample - {key}: {shift_template[key]}")

    # Create a socket for progress updates
    task_id = f"optimize_weights_{int(time.time())}"
    tasks[task_id] = {"status": "PENDING", "progress": 0, "message": "Initializing..."}
    
    # Define progress callback
    def progress_callback(progress, message):
        tasks[task_id] = {"status": "RUNNING", "progress": progress, "message": message}
    
    # Start optimization in a thread
    def run_optimization():
        try:
            tasks[task_id] = {"status": "RUNNING", "progress": 0, "message": "Starting weight optimization..."}
            result = optimize_weights(optimization_data, progress_callback=progress_callback)
            tasks[task_id] = {"status": "COMPLETED", "progress": 100, "message": "Complete", "result": result}
        except Exception as e:
            logger.exception("Error in weight optimization")
            tasks[task_id] = {"status": "ERROR", "progress": 0, "message": str(e)}
    
    thread = threading.Thread(target=run_optimization)
    thread.daemon = True
    thread.start()
    
    return jsonify({"task_id": task_id})

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
        scheduling_mode = data.get("scheduling_mode", "monthly")  # Default to monthly now
        
        # Always use monthly optimization since yearly is not used
        month = data.get("month")
        if month is None:
            return jsonify({
                "error": "Month parameter is required for scheduling"
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
        mode_prefix = "monthly"  # Always use monthly prefix
        filename = f"{mode_prefix}_optimization_{timestamp}_month{month}.json"
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
                
                # All schedules are monthly
                scheduling_mode = "monthly"
                
                # Extract timestamp from filename
                parts = filename.split("_")
                if len(parts) >= 3:
                    timestamp = parts[2]
                else:
                    timestamp = "unknown"
                
                # Get month for monthly optimizations
                month = None
                if "_month" in filename:
                    try:
                        month_part = filename.split("_month")[1].split(".")[0]
                        month = int(month_part)
                    except (IndexError, ValueError):
                        pass
                
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
    
@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Get the status of a running task."""
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404
        
    task_info = tasks[task_id]
    
    # If the task is complete and has a result, return it
    if task_info.get("status") == "COMPLETED" and "result" in task_info:
        return jsonify(task_info)
    
    # Otherwise just return the status information
    return jsonify(task_info)


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
