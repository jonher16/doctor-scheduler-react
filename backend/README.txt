# Hospital Staff Scheduler Optimization Server

This server implements the MILP (Mixed-Integer Linear Programming) optimization algorithm described in the technical report for hospital staff scheduling.

## Features

- Optimizes doctor schedules based on:
  - Workload distribution
  - Sufficient rest periods
  - Holiday and weekend treatment
  - Doctor availability and preferences
- RESTful API for integration with frontend applications
- Persistent storage of optimization results

## Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

### Setup

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/hospital-scheduler-optimizer.git
   cd hospital-scheduler-optimizer
   ```

2. Create and activate a virtual environment (recommended):
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Running the Server

1. Start the server:
   ```
   python app.py
   ```

   For production, use Gunicorn:
   ```
   gunicorn app:app -b 0.0.0.0:5000
   ```

2. The server will be available at http://localhost:5000

## API Documentation

### `POST /api/optimize`

Runs the optimization algorithm to generate a schedule.

**Request Body:**
```json
{
  "doctors": [
    {"name": "Doctor1", "seniority": "Junior", "pref": "None"},
    {"name": "Doctor2", "seniority": "Senior", "pref": "Day Only"}
    // ...more doctors
  ],
  "holidays": {
    "2025-01-01": "Short",
    "2025-12-25": "Short"
    // ...more holidays
  },
  "availability": {
    "Doctor1": {
      "2025-01-01": "Not Available"
      // ...more availability constraints
    }
  }
}
```

**Response:**
```json
{
  "schedule": {
    "2025-01-01": {
      "Day": ["Doctor2", "Doctor3"],
      "Evening": ["Doctor4"],
      "Night": ["Doctor5", "Doctor6"]
    },
    // ...more dates
  },
  "statistics": {
    "status": "OPTIMAL",
    "solution_time_seconds": 12.45,
    "objective_value": 156.2,
    "coverage_errors": 0,
    "doctor_shift_counts": {
      "Doctor1": 73,
      "Doctor2": 82
      // ...more doctors
    },
    "variables": 28470,
    "constraints": 12543
  }
}
```

### `GET /api/status`

Checks if the server is running.

**Response:**
```json
{
  "status": "up",
  "version": "1.0.0",
  "timestamp": "2025-03-01T12:34:56.789Z"
}
```

### `GET /api/previous_runs`

Gets a list of previous optimization runs.

**Response:**
```json
{
  "runs": [
    {
      "id": "optimization_20250301_123456.json",
      "timestamp": "20250301_123456",
      "status": "OPTIMAL",
      "solution_time": 12.45,
      "objective_value": 156.2
    },
    // ...more runs
  ]
}
```

### `GET /api/run/<run_id>`

Gets full results of a specific optimization run.

**Response:**
Same as the `/api/optimize` response.

## Connecting to the React Frontend

Update the `GenerateSchedule.jsx` component to call this API instead of using the simulated optimization. The main change would be in the `generateOptimizedSchedule` function to send a request to `/api/optimize`.

## License

MIT License