#!/usr/bin/env python3
"""
Hospital Staff Scheduler - MILP Optimization using PuLP

This relaxed version converts hard constraints into soft constraints
to ensure the optimization problem is feasible.
"""

import datetime
import time
import logging
import threading
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
        
        # Maximum allowed monthly hours difference (soft constraint)
        self.max_monthly_variance = 15  # Relaxed from 10 to 15

        # Generate date collections
        self.all_dates = self._generate_dates()
        self.weekends = self._identify_weekends()
        self.weekdays = set(self.all_dates) - self.weekends
        
        # Weights for the objective function
        self.alpha = 1.0   # Weight for weekend/holiday fairness 
        self.beta = 2.0    # Weight for monthly workload balance
        self.gamma = 2.0   # Weight for shift preference penalty
        self.delta = 10.0  # Weight for senior excess penalty
        self.epsilon = 1.0 # Weight for weekend/holiday balance between doctors

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
        
    def _dates_in_month(self, month: int) -> List[str]:
        """Get all dates in a specific month."""
        return [d for d in self.all_dates if self._group_by_month(d) == month]
        
    def _weekends_in_month(self, month: int) -> List[str]:
        """Get all weekend dates in a specific month."""
        month_dates = self._dates_in_month(month)
        return [d for d in month_dates if d in self.weekends]
        
    def _weekdays_in_month(self, month: int) -> List[str]:
        """Get all weekday dates in a specific month."""
        month_dates = self._dates_in_month(month)
        return [d for d in month_dates if d not in self.weekends]
        
    def _holidays_in_month(self, month: int) -> List[str]:
        """Get all holiday dates in a specific month."""
        month_dates = self._dates_in_month(month)
        return [d for d in month_dates if d in self.holidays]

    def optimize(self, progress_callback: Callable = None) -> Tuple[Dict, Dict]:
        """
        Run the optimization using PuLP and return the schedule and statistics.
        
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
        senior_names = [doc["name"] for doc in self.doctors if doc.get("seniority", "") == "Senior"]
        junior_names = [doc["name"] for doc in self.doctors if doc.get("seniority", "") != "Senior"]
        
        x = {}
        for doctor in doctor_names:
            for date in self.all_dates:
                for shift in self.shifts:
                    var_name = f"{doctor}_{date}_{shift}"
                    x[(doctor, date, shift)] = pulp.LpVariable(var_name, cat='Binary')

        if progress_callback:
            progress_callback(10, "Creating variables...")

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

        if progress_callback:
            progress_callback(30, "Adding hard constraints...")

        if progress_callback:
            progress_callback(50, "Building objective function, starting solver...")

        # --- Objective Function Terms ---

        # 1. Weekend/Holiday Fairness Penalty:
        # Encourage doctors to have weekend/holiday assignments near target values.
        fairness_penalties = []
        
        # Weekend balance for seniors
        senior_weekend_shifts = {}
        for doctor in senior_names:
            senior_weekend_shifts[doctor] = pulp.lpSum(
                x[(doctor, date, shift)]
                for date in self.weekends
                for shift in self.shifts
            )
        
        # If we have multiple seniors, balance their weekend shifts
        if len(senior_names) > 1:
            senior_weekend_avg = pulp.lpSum(senior_weekend_shifts.values()) / len(senior_names)
            for doctor in senior_names:
                above = pulp.LpVariable(f"senior_weekend_above_{doctor}", lowBound=0)
                below = pulp.LpVariable(f"senior_weekend_below_{doctor}", lowBound=0)
                prob += (senior_weekend_shifts[doctor] - senior_weekend_avg <= above)
                prob += (senior_weekend_avg - senior_weekend_shifts[doctor] <= below)
                fairness_penalties.append(self.epsilon * (above + below))
        
        # Weekend balance for juniors
        junior_weekend_shifts = {}
        for doctor in junior_names:
            junior_weekend_shifts[doctor] = pulp.lpSum(
                x[(doctor, date, shift)]
                for date in self.weekends
                for shift in self.shifts
            )
        
        # If we have multiple juniors, balance their weekend shifts
        if len(junior_names) > 1:
            junior_weekend_avg = pulp.lpSum(junior_weekend_shifts.values()) / len(junior_names)
            for doctor in junior_names:
                above = pulp.LpVariable(f"junior_weekend_above_{doctor}", lowBound=0)
                below = pulp.LpVariable(f"junior_weekend_below_{doctor}", lowBound=0)
                prob += (junior_weekend_shifts[doctor] - junior_weekend_avg <= above)
                prob += (junior_weekend_avg - junior_weekend_shifts[doctor] <= below)
                fairness_penalties.append(self.epsilon * (above + below))
        
        # Ensure seniors have fewer weekend shifts than juniors (as a penalty)
        if senior_names and junior_names:
            senior_avg_weekend = pulp.lpSum(senior_weekend_shifts.values()) / len(senior_names)
            junior_avg_weekend = pulp.lpSum(junior_weekend_shifts.values()) / len(junior_names)
            senior_excess = pulp.LpVariable("senior_weekend_excess", lowBound=0)
            prob += (senior_avg_weekend <= junior_avg_weekend * 0.7 + senior_excess)
            fairness_penalties.append(5 * self.alpha * senior_excess)

        # 2. Holiday Balance
        holiday_penalties = []
        
        # Holiday balance for seniors
        senior_holiday_shifts = {}
        for doctor in senior_names:
            senior_holiday_shifts[doctor] = pulp.lpSum(
                x[(doctor, date, shift)]
                for date in self.holidays
                for shift in self.shifts
            )
        
        # If we have multiple seniors, balance their holiday shifts
        if len(senior_names) > 1:
            senior_holiday_avg = pulp.lpSum(senior_holiday_shifts.values()) / len(senior_names)
            for doctor in senior_names:
                above = pulp.LpVariable(f"senior_holiday_above_{doctor}", lowBound=0)
                below = pulp.LpVariable(f"senior_holiday_below_{doctor}", lowBound=0)
                prob += (senior_holiday_shifts[doctor] - senior_holiday_avg <= above)
                prob += (senior_holiday_avg - senior_holiday_shifts[doctor] <= below)
                holiday_penalties.append(self.epsilon * (above + below))
        
        # Holiday balance for juniors
        junior_holiday_shifts = {}
        for doctor in junior_names:
            junior_holiday_shifts[doctor] = pulp.lpSum(
                x[(doctor, date, shift)]
                for date in self.holidays
                for shift in self.shifts
            )
        
        # If we have multiple juniors, balance their holiday shifts
        if len(junior_names) > 1:
            junior_holiday_avg = pulp.lpSum(junior_holiday_shifts.values()) / len(junior_names)
            for doctor in junior_names:
                above = pulp.LpVariable(f"junior_holiday_above_{doctor}", lowBound=0)
                below = pulp.LpVariable(f"junior_holiday_below_{doctor}", lowBound=0)
                prob += (junior_holiday_shifts[doctor] - junior_holiday_avg <= above)
                prob += (junior_holiday_avg - junior_holiday_shifts[doctor] <= below)
                holiday_penalties.append(self.epsilon * (above + below))
        
        # Ensure seniors have fewer holiday shifts than juniors (as a penalty)
        if senior_names and junior_names:
            senior_avg_holiday = pulp.lpSum(senior_holiday_shifts.values()) / len(senior_names)
            junior_avg_holiday = pulp.lpSum(junior_holiday_shifts.values()) / len(junior_names)
            senior_excess = pulp.LpVariable("senior_holiday_excess", lowBound=0)
            prob += (senior_avg_holiday <= junior_avg_holiday * 0.7 + senior_excess)
            holiday_penalties.append(5 * self.alpha * senior_excess)

        # 3. Monthly Workload Balance (soft constraint with penalties)
        monthly_balance_penalties = []
        months = range(1, 13)  # 1-12 for all months
        
        for m in months:
            dates = self._dates_in_month(m)
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
            
            # Soft constraint on monthly variance
            monthly_variance = pulp.LpVariable(f"monthly_variance_{m}", lowBound=0)
            prob += (max_hours - min_hours <= self.max_monthly_variance + monthly_variance,
                     f"MonthlyVariance_{m}")
            monthly_balance_penalties.append(self.beta * monthly_variance)

        # 4. Shift Preference Penalty:
        # Apply penalties for deviations from preferred shifts for ALL doctors
        preference_penalties = []
        for doc in self.doctors:
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
                
            # Apply stronger preference enforcement for juniors
            weight_modifier = 1.0 if doc.get("seniority", "") == "Senior" else 1.5
                
            for date in self.all_dates:
                for shift in self.shifts:
                    preference_penalties.append(
                        self.gamma * weight_modifier * prefs.get(shift, 1) * 
                        x[(doctor_name, date, shift)]
                    )

        # 5. Senior Workload Constraint Penalty:
        # Encourage senior doctors to work fewer total hours than juniors.
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
            prob += senior_total_all * num_juniors <= junior_total_all * num_seniors * 0.9 + senior_excess, "SeniorWorkloadConstraint"
            senior_excess_penalty_term = self.delta * senior_excess

        # Combine all objective terms.
        prob += (pulp.lpSum(fairness_penalties) +
                 pulp.lpSum(holiday_penalties) +
                 pulp.lpSum(monthly_balance_penalties) +
                 pulp.lpSum(preference_penalties) +
                 senior_excess_penalty_term), "TotalObjective"

        # --- Simulate Progress Updates ---
        solved_flag = {"done": False}  # Mutable flag shared with the simulation thread

        def progress_simulation():
            current = 50
            while not solved_flag["done"]:
                if progress_callback:
                    progress_callback(current, f"Solving... ({current}%)")
                current += 2
                if current > 90:
                    current = 90
                time.sleep(1)

        progress_thread = threading.Thread(target=progress_simulation)
        progress_thread.start()    

        # --- Solve the Model ---
        solver = pulp.PULP_CBC_CMD(timeLimit=120, msg=True)  # Increased to 120 seconds
        result_status = prob.solve(solver)

        # Signal the simulation thread to stop.
        solved_flag["done"] = True
        progress_thread.join()
        
        if progress_callback:
            progress_callback(95, "Processing results...")

        logger.info(f"Solver status: {pulp.LpStatus[result_status]}")
        solution_time = time.time() - start_time

        # --- Construct the Schedule ---
        schedule = {}
        doctor_shift_counts = {doc: 0 for doc in doctor_names}
        preference_metrics = {}
        weekend_metrics = {}
        holiday_metrics = {}
        
        if pulp.LpStatus[result_status] in ["Optimal", "Feasible"]:
            # Initialize metrics
            for doc in self.doctors:
                doctor_name = doc["name"]
                pref = doc.get("pref", "None")
                preference_metrics[doctor_name] = {
                    "preference": pref,
                    "preferred_shifts": 0,
                    "other_shifts": 0
                }
                weekend_metrics[doctor_name] = 0
                holiday_metrics[doctor_name] = 0
            
            # Process all assignments
            for date in self.all_dates:
                schedule[date] = {shift: [] for shift in self.shifts}
                is_weekend = date in self.weekends
                is_holiday = date in self.holidays
                
                for doctor in doctor_names:
                    for shift in self.shifts:
                        if pulp.value(x[(doctor, date, shift)]) > 0.5:  # Use threshold to handle floating point issues
                            schedule[date][shift].append(doctor)
                            doctor_shift_counts[doctor] += 1
                            
                            # Track weekend/holiday metrics
                            if is_weekend:
                                weekend_metrics[doctor] += 1
                            if is_holiday:
                                holiday_metrics[doctor] += 1
                            
                            # Track preference metrics
                            doc_data = next((d for d in self.doctors if d["name"] == doctor), None)
                            if doc_data:
                                pref = doc_data.get("pref", "None")
                                is_preferred = False
                                
                                if pref == "Day Only" and shift == "Day":
                                    is_preferred = True
                                elif pref == "Evening Only" and shift == "Evening":
                                    is_preferred = True
                                elif pref == "Night Only" and shift == "Night":
                                    is_preferred = True
                                
                                if is_preferred:
                                    preference_metrics[doctor]["preferred_shifts"] += 1
                                else:
                                    preference_metrics[doctor]["other_shifts"] += 1
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
                    
        if progress_callback:
            progress_callback(100, "Optimization complete")

        stats = {
            "status": pulp.LpStatus[result_status],
            "solution_time_seconds": solution_time,
            "objective_value": pulp.value(prob.objective),
            "coverage_errors": coverage_errors,
            "doctor_shift_counts": doctor_shift_counts,
            "preference_metrics": preference_metrics,
            "weekend_metrics": weekend_metrics,
            "holiday_metrics": holiday_metrics,
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
    print(f"Objective value: {result['statistics'].get('objective_value', 'N/A')}")
    print("Sample of schedule (first 3 days):")
    schedule = result["schedule"]
    dates = sorted(schedule.keys())[:3]
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            assigned = schedule[date][shift]
            print(f"  {shift}: {', '.join(assigned)}")