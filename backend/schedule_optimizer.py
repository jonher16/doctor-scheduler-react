#!/usr/bin/env python3
"""
Hospital Staff Scheduler - MILP Optimization using PuLP

This version reimplements the scheduling model with PuLP. It creates binary
decision variables for each (doctor, date, shift) assignment, enforces
constraints for coverage, availability, one shift per day, rest between shifts,
and holiday rules. Seniority rules are prioritized over shift preferences.
Here, the monthly workload (hours) is balanced (<= 10 hour difference),
the weekend/holiday assignments are balanced according to targets, and 
junior doctors are encouraged to work more weekend/holiday shifts. Moreover,
senior doctors are strictly prohibited from working on long holidays.
"""

import datetime
import time
import logging
import threading  # Import threading to simulate progress updates
from typing import Dict, List, Any, Tuple, Set, Callable
import pulp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ScheduleOptimizer")

class ScheduleOptimizer:
    def __init__(self, doctors: List[Dict], holidays: Dict[str, str],
                 availability: Dict[str, Dict[str, str]]):
        """
        Initialize with input data.

        Args:
            doctors: List of doctor dictionaries with name, seniority, and optional preference.
            holidays: Dictionary mapping dates to holiday types (e.g., 'Short' or 'Long').
            availability: Nested dictionary for doctor availability constraints.
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability

        self.shifts = ["Day", "Evening", "Night"]
        self.shift_requirements = {"Day": 2, "Evening": 1, "Night": 2}
        self.shift_hours = {"Day": 8, "Evening": 8, "Night": 8}

        # Adjusted targets for weekend/holiday assignments:
        # Seniors should have significantly fewer weekend/holiday hours.
        self.seniors_holiday_target = 30  # Lower target for seniors
        self.juniors_holiday_target = 55  # Higher target for juniors

        # Maximum allowed monthly hours difference (hard constraint)
        self.max_monthly_variance = 10

        self.all_dates = self._generate_dates()
        self.weekends = self._identify_weekends()

        # Weights for the objective function
        self.alpha = 1.0  # Weight for weekend/holiday fairness penalty
        self.beta = 3.0   # Weight for monthly workload balance (enforced as hard constraint)
        self.gamma = 0.5  # Weight for shift preference penalty (only applied to juniors)

    def _generate_dates(self) -> List[str]:
        """Generate all dates for the year 2025 in YYYY-MM-DD format."""
        all_dates = []
        start_date = datetime.date(2025, 1, 1)
        for i in range(365):
            current = start_date + datetime.timedelta(days=i)
            all_dates.append(current.isoformat())
        return all_dates

    def _identify_weekends(self) -> Set[str]:
        """Identify all weekend dates."""
        weekends = set()
        for date_str in self.all_dates:
            d = datetime.date.fromisoformat(date_str)
            if d.weekday() >= 5:  # Saturday=5, Sunday=6
                weekends.add(date_str)
        return weekends

    def _is_doctor_available(self, doctor: str, date: str, shift: str) -> bool:
        """Check if a doctor is available for a specific date and shift."""
        if doctor not in self.availability:
            return True
        if date not in self.availability[doctor]:
            return True
        avail = self.availability[doctor][date]
        if avail == "Not Available":
            return False
        elif avail == "Day Only":
            return shift == "Day"
        elif avail == "Evening Only":
            return shift == "Evening"
        elif avail == "Night Only":
            return shift == "Night"
        return True

    def _group_by_month(self, date_str: str) -> int:
        """Extract month from date string."""
        d = datetime.date.fromisoformat(date_str)
        return d.month

    def optimize(self, progress_callback: Callable = None) -> Tuple[Dict, Dict]:
        """
        Run the optimization using PuLP and return the schedule and statistics.
        
        Simulated progress updates (from 50% to 90%) are provided via a separate thread.
        
        Args:
            progress_callback: Optional callback to report progress.
            
        Returns:
            Tuple of (schedule dictionary, statistics dictionary).
        """
        start_time = time.time()
        logger.info("Starting optimization with PuLP")

        if progress_callback:
            progress_callback(5, "Initializing model...")

        # Create the MILP model.
        prob = pulp.LpProblem("HospitalStaffScheduling", pulp.LpMinimize)

        # Create decision variables.
        doctor_names = [doc["name"] for doc in self.doctors]
        x = {}
        for doctor in doctor_names:
            for date in self.all_dates:
                for shift in self.shifts:
                    var_name = f"{doctor}_{date}_{shift}"
                    x[(doctor, date, shift)] = pulp.LpVariable(var_name, cat='Binary')

        # --- Constraints ---

        # 1. Coverage: Ensure each shift on each day is covered by the required number of doctors.
        for date in self.all_dates:
            for shift in self.shifts:
                prob += (pulp.lpSum(x[(doctor, date, shift)] for doctor in doctor_names)
                         == self.shift_requirements[shift],
                         f"Coverage_{date}_{shift}")

        # 2. Availability: Do not assign doctors when they are unavailable.
        for doctor in doctor_names:
            for date in self.all_dates:
                for shift in self.shifts:
                    if not self._is_doctor_available(doctor, date, shift):
                        prob += (x[(doctor, date, shift)] == 0,
                                 f"Avail_{doctor}_{date}_{shift}")

        # 3. One shift per day: Each doctor works at most one shift per day.
        for doctor in doctor_names:
            for date in self.all_dates:
                prob += (pulp.lpSum(x[(doctor, date, shift)] for shift in self.shifts) <= 1,
                         f"OneShift_{doctor}_{date}")

        # 4. Rest constraints: No day or evening shift immediately after a night shift.
        for doctor in doctor_names:
            for i in range(len(self.all_dates) - 1):
                current_date = self.all_dates[i]
                next_date = self.all_dates[i + 1]
                prob += (x[(doctor, current_date, "Night")] + x[(doctor, next_date, "Day")] <= 1,
                         f"Rest1_{doctor}_{current_date}_{next_date}")
                prob += (x[(doctor, current_date, "Night")] + x[(doctor, next_date, "Evening")] <= 1,
                         f"Rest2_{doctor}_{current_date}_{next_date}")

        # 5. Long Holiday Constraint for Seniors:
        # Senior doctors must not work on long holidays.
        for doc in self.doctors:
            if doc.get("seniority", "") == "Senior":
                doctor_name = doc["name"]
                for date in self.all_dates:
                    if date in self.holidays and self.holidays[date] == "Long":
                        for shift in self.shifts:
                            prob += (x[(doctor_name, date, shift)] == 0,
                                     f"SeniorLongHoliday_{doctor_name}_{date}_{shift}")

        # --- Objective Function ---

        # a) Monthly workload balance (hard constraint):
        # The difference between the maximum and minimum monthly hours across all doctors must not exceed 10.
        months = {}
        for date in self.all_dates:
            m = self._group_by_month(date)
            months.setdefault(m, []).append(date)
        for m, dates in months.items():
            monthly_hours = {}
            for doctor in doctor_names:
                monthly_hours[doctor] = pulp.lpSum(
                    x[(doctor, date, shift)] * self.shift_hours[shift]
                    for date in dates for shift in self.shifts
                )
            max_hours = pulp.LpVariable(f"max_hours_{m}", lowBound=0)
            min_hours = pulp.LpVariable(f"min_hours_{m}", lowBound=0)
            for doctor in doctor_names:
                prob += (max_hours >= monthly_hours[doctor],
                         f"MaxHours_{m}_{doctor}")
                prob += (min_hours <= monthly_hours[doctor],
                         f"MinHours_{m}_{doctor}")
            prob += (max_hours - min_hours <= self.max_monthly_variance,
                     f"MonthlyVariance_{m}")

        # b) Weekend/Holiday Fairness Penalty:
        # Encourage doctors to have weekend/holiday assignments near target values.
        fairness_penalties = []
        for doc in self.doctors:
            doctor_name = doc["name"]
            target = self.seniors_holiday_target if doc.get("seniority", "") == "Senior" else self.juniors_holiday_target
            wh_hours = pulp.lpSum(
                x[(doctor_name, date, shift)] * self.shift_hours[shift]
                for date in self.all_dates
                if date in self.weekends or date in self.holidays
                for shift in self.shifts
            )
            above = pulp.LpVariable(f"above_target_{doctor_name}", lowBound=0)
            below = pulp.LpVariable(f"below_target_{doctor_name}", lowBound=0)
            prob += (wh_hours - target <= above, f"Above_{doctor_name}")
            prob += (target - wh_hours <= below, f"Below_{doctor_name}")
            fairness_penalties.append(self.alpha * (above + below))

        # c) Shift Preference Penalty (only for juniors):
        # Apply penalties for deviations from preferred shifts.
        preference_penalties = []
        for doc in self.doctors:
            if doc.get("seniority", "") == "Senior":
                continue  # Skip preferences for seniors.
            doctor_name = doc["name"]
            if "pref" in doc and doc["pref"] != "None":
                if doc["pref"] == "Day Only":
                    prefs = {"Day": 0, "Evening": 5, "Night": 10}
                elif doc["pref"] == "Evening Only":
                    prefs = {"Day": 5, "Evening": 0, "Night": 5}
                elif doc["pref"] == "Night Only":
                    prefs = {"Day": 10, "Evening": 5, "Night": 0}
                else:
                    prefs = {"Day": 1, "Evening": 1, "Night": 1}
            else:
                prefs = {"Day": 1, "Evening": 1, "Night": 1}
            for date in self.all_dates:
                for shift in self.shifts:
                    preference_penalties.append(self.gamma * prefs.get(shift, 1) * x[(doctor_name, date, shift)])

        # d) (Optional) Additional penalties for weekend/holiday assignments
        # can be added here if further fine-tuning is needed.

        # e) Senior Workload Constraint Penalty:
        # Encourage senior doctors to work fewer total hours than juniors.
        senior_names = [doc["name"] for doc in self.doctors if doc.get("seniority", "") == "Senior"]
        junior_names = [doc["name"] for doc in self.doctors if doc.get("seniority", "") != "Senior"]
        senior_excess_penalty_term = 0
        if senior_names and junior_names:
            senior_total_all = pulp.lpSum(
                x[(doctor, date, shift)] * self.shift_hours[shift]
                for doctor in senior_names for date in self.all_dates for shift in self.shifts
            )
            junior_total_all = pulp.lpSum(
                x[(doctor, date, shift)] * self.shift_hours[shift]
                for doctor in junior_names for date in self.all_dates for shift in self.shifts
            )
            num_juniors = len(junior_names)
            num_seniors = len(senior_names)
            senior_excess = pulp.LpVariable("senior_excess", lowBound=0)
            prob += senior_total_all * num_juniors <= junior_total_all * num_seniors * 0.85 + senior_excess, "SeniorWorkloadConstraint"
            senior_excess_penalty_term = 500 * senior_excess

        # Combine all objective terms.
        prob += (pulp.lpSum(fairness_penalties) +
                 pulp.lpSum(preference_penalties) +
                 senior_excess_penalty_term), "TotalObjective"
        
        if progress_callback:
            progress_callback(10, "Constraints added, starting solver...")

        # --- Simulate Progress Updates ---
        solved_flag = {"done": False}  # Mutable flag shared with the simulation thread

        def progress_simulation():
            current = 10
            while not solved_flag["done"]:
                if progress_callback:
                    progress_callback(current, f"Solving... ({current}%)")
                current += 3
                if current > 90:
                    current = 90
                time.sleep(1)

        progress_thread = threading.Thread(target=progress_simulation)
        progress_thread.start()    

        # --- Solve the Model ---
        solver = pulp.PULP_CBC_CMD(timeLimit=60, msg=True)
        result_status = prob.solve(solver)

        # Signal the simulation thread to stop.
        solved_flag["done"] = True
        progress_thread.join()
        
        if progress_callback:
            progress_callback(100, "Optimization complete")

        logger.info(f"Solver status: {pulp.LpStatus[result_status]}")
        solution_time = time.time() - start_time

        # --- Construct the Schedule ---
        schedule = {}
        doctor_shift_counts = {doc: 0 for doc in doctor_names}
        if pulp.LpStatus[result_status] in ["Optimal", "Feasible"]:
            for date in self.all_dates:
                schedule[date] = {shift: [] for shift in self.shifts}
                for doctor in doctor_names:
                    for shift in self.shifts:
                        if pulp.value(x[(doctor, date, shift)]) == 1:
                            schedule[date][shift].append(doctor)
                            doctor_shift_counts[doctor] += 1
        else:
            logger.error("No feasible solution found")
            if progress_callback:
                progress_callback(100, "No solution found")
            return {}, {
                "status": pulp.LpStatus[result_status],
                "solution_time_seconds": solution_time,
                "error": "No feasible solution found within the time limit."
            }

        # Check for coverage errors.
        coverage_errors = 0
        for date in schedule:
            for shift in self.shifts:
                if len(schedule[date][shift]) != self.shift_requirements[shift]:
                    coverage_errors += 1

        stats = {
            "status": pulp.LpStatus[result_status],
            "solution_time_seconds": solution_time,
            "objective_value": pulp.value(prob.objective),
            "coverage_errors": coverage_errors,
            "doctor_shift_counts": doctor_shift_counts,
            "variables": len(prob.variables()),
            "constraints": len(prob.constraints)
        }

        return schedule, stats

def optimize_schedule(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """Main function to optimize a schedule using PuLP.

    Args:
        data: Dictionary containing doctors, holidays, and availability.
        progress_callback: Optional function to report progress.

    Returns:
        Dictionary with the optimized schedule and statistics.
    """
    try:
        doctors = data.get("doctors", [])
        holidays = data.get("holidays", {})
        availability = data.get("availability", {})

        optimizer = ScheduleOptimizer(doctors, holidays, availability)
        schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        return {
            "schedule": schedule,
            "statistics": stats
        }
    except Exception as e:
        logger.exception("Error in optimization")
        return {
            "error": str(e),
            "schedule": {},
            "statistics": {
                "status": "ERROR",
                "error_message": str(e)
            }
        }

if __name__ == "__main__":
    # Test with sample data.
    sample_data = {
        "doctors": [
            {"name": "Doctor1", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor2", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor3", "seniority": "Junior", "pref": "Evening Only"},
            {"name": "Doctor4", "seniority": "Junior", "pref": "Evening Only"},
            {"name": "Doctor5", "seniority": "Junior", "pref": "Evening Only"},
            {"name": "Doctor6", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor7", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor8", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor9", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor10", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor11", "seniority": "Senior", "pref": "None"},
            {"name": "Doctor12", "seniority": "Senior", "pref": "None"},
            {"name": "Doctor13", "seniority": "Senior", "pref": "None"}
        ],
        "holidays": {
            "2025-01-01": "Short",
            "2025-12-25": "Short",
            "2025-07-04": "Long"  # Example long holiday; seniors will not work this day.
        },
        "availability": {
            "Doctor1": {
                "2025-01-01": "Not Available"
            }
        }
    }

    result = optimize_schedule(sample_data)
    print(f"Optimization status: {result['statistics']['status']}")
    print(f"Solution time: {result['statistics'].get('solution_time_seconds', 'N/A')} seconds")
    print("Sample of schedule (first 3 days):")
    schedule = result["schedule"]
    dates = sorted(schedule.keys())[:3]
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            assigned = schedule[date][shift]
            print(f"  {shift}: {', '.join(assigned)}")
