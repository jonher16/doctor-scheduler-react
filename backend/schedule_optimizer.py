#!/usr/bin/env python3
"""
Hospital Staff Scheduler - MILP Optimization Algorithm

This module implements the Mixed-Integer Linear Programming (MILP) approach 
described in the technical report for optimizing hospital staff schedules.
It uses Google OR-Tools CP-SAT solver for efficient solutions.
"""

import time
import datetime
import json
import logging
from typing import Dict, List, Any, Tuple, Set, Callable
from ortools.sat.python import cp_model

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ScheduleOptimizer")


class ScheduleOptimizer:
    """Optimizes doctor schedules using the CP-SAT solver."""
    
    def __init__(self, doctors: List[Dict], holidays: Dict[str, str], 
                 availability: Dict[str, Dict[str, str]]):
        """Initialize with input data.
        
        Args:
            doctors: List of doctor dictionaries with name and seniority
            holidays: Dictionary mapping dates to holiday types ('Short' or 'Long')
            availability: Nested dictionary of doctor availability constraints
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        
        # Constants from technical report
        self.shifts = ["Day", "Evening", "Night"]
        self.shift_requirements = {"Day": 2, "Evening": 1, "Night": 2}
        self.shift_hours = {"Day": 8, "Evening": 8, "Night": 8}
        
        # Additional parameters
        self.seniors_holiday_target = 30  # Target hours for seniors (holidays/weekends)
        self.juniors_holiday_target = 55  # Target hours for juniors (holidays/weekends)
        self.max_monthly_variance = 10    # Maximum allowed variance in monthly hours
        
        # Generate all dates for the year 2025
        self.all_dates = self._generate_dates()
        self.weekends = self._identify_weekends()
        
        # Weights for objective function
        self.alpha = 1.0  # Weight for preference satisfaction
        self.beta = 3.0   # Weight for workload fairness
        self.gamma = 0.5  # Weight for schedule consistency

    def _generate_dates(self) -> List[str]:
        """Generate all dates for the year in YYYY-MM-DD format."""
        all_dates = []
        start_date = datetime.date(2025, 1, 1)
        
        for i in range(365):  # Full year, not accounting for leap years
            current = start_date + datetime.timedelta(days=i)
            date_str = current.isoformat()
            all_dates.append(date_str)
            
        return all_dates
    
    def _identify_weekends(self) -> Set[str]:
        """Identify all weekend dates."""
        weekends = set()
        
        for date_str in self.all_dates:
            date = datetime.date.fromisoformat(date_str)
            # 5 = Saturday, 6 = Sunday in Python's weekday()
            if date.weekday() >= 5:
                weekends.add(date_str)
                
        return weekends
    
    def _is_doctor_available(self, doctor: str, date: str, shift: str) -> bool:
        """Check if a doctor is available for a specific date and shift."""
        # If no availability info, assume available
        if doctor not in self.availability:
            return True
            
        # If date not specified, assume available
        if date not in self.availability[doctor]:
            return True
            
        avail = self.availability[doctor][date]
        
        # Specific availability rules
        if avail == "Not Available":
            return False
        elif avail == "Day Only":
            return shift == "Day"
        elif avail == "Evening Only":
            return shift == "Evening"
        elif avail == "Night Only":
            return shift == "Night"
            
        # Default case: fully available
        return True
    
    def _group_by_month(self, date_str: str) -> int:
        """Extract month from date string."""
        date = datetime.date.fromisoformat(date_str)
        return date.month
    
    def optimize(self, progress_callback: Callable = None) -> Tuple[Dict, Dict]:
        """Run the optimization algorithm and return the generated schedule.
        
        Args:
            progress_callback: Optional callback function to report progress (0-100)
            
        Returns:
            Tuple containing:
            - The optimized schedule dictionary
            - Statistics about the optimization
        """
        # Start timer for performance tracking
        start_time = time.time()
        logger.info("Starting optimization process")
        
        # Create the model
        model = cp_model.CpModel()
        logger.info("Creating CP-SAT model")
        
        # Report progress
        if progress_callback:
            progress_callback(5, "Initializing model")
            
        # Create variables
        assignments = {}
        doctor_names = [doctor["name"] for doctor in self.doctors]
        
        for doctor in doctor_names:
            for date in self.all_dates:
                for shift in self.shifts:
                    # Binary variable: 1 if doctor is assigned to shift on date, 0 otherwise
                    var_name = f"{doctor}_{date}_{shift}"
                    assignments[(doctor, date, shift)] = model.NewBoolVar(var_name)
        
        # Add constraints
        logger.info("Adding coverage constraints")
        if progress_callback:
            progress_callback(10, "Adding coverage constraints")
        self._add_coverage_constraints(model, assignments)
        
        logger.info("Adding availability constraints")
        if progress_callback:
            progress_callback(20, "Adding availability constraints")
        self._add_availability_constraints(model, assignments)
        
        logger.info("Adding one-shift-per-day constraints")
        if progress_callback:
            progress_callback(30, "Adding shift constraints")
        self._add_one_shift_per_day_constraints(model, assignments)
        
        logger.info("Adding rest constraints")
        if progress_callback:
            progress_callback(40, "Adding rest constraints")
        self._add_rest_constraints(model, assignments)
        
        logger.info("Adding holiday constraints")
        if progress_callback:
            progress_callback(50, "Adding holiday constraints")
        self._add_holiday_constraints(model, assignments)
        
        # Set up objective function
        objective_terms = []
        
        # Add monthly workload balance as part of objective
        monthly_balance_vars = self._add_workload_balance_objective(model, assignments)
        for var in monthly_balance_vars:
            objective_terms.append(self.beta * var)
        
        # Add weekend/holiday fairness as part of objective
        fairness_vars = self._add_weekend_fairness_objective(model, assignments)
        for var in fairness_vars:
            objective_terms.append(self.alpha * var)
            
        # Add preference penalty as part of objective
        preference_vars = self._add_preference_objective(model, assignments)
        for var in preference_vars:
            objective_terms.append(self.gamma * var)
        
        # Set objective: minimize the sum of all terms
        logger.info("Setting up objective function")
        if progress_callback:
            progress_callback(60, "Setting up objective function")
        model.Minimize(sum(objective_terms))
        
        # Create solver and solve the model
        logger.info("Creating solver and starting optimization")
        if progress_callback:
            progress_callback(70, "Starting solver")
        solver = cp_model.CpSolver()
        
        # Set a strict time limit - 1 minute max
        solver.parameters.max_time_in_seconds = 60.0
        
        # Create a solution callback to track progress and enforce timeout
        class SolutionCallback(cp_model.CpSolverSolutionCallback):
            def __init__(self, progress_callback=None):
                cp_model.CpSolverSolutionCallback.__init__(self)
                self._progress_callback = progress_callback
                self._solution_count = 0
                self._start_time = time.time()
                self._best_solution = None
                self._best_objective = float('inf')
                
            def on_solution_callback(self):
                self._solution_count += 1
                current_time = time.time() - self._start_time
                
                # Store the current solution
                current_objective = self.ObjectiveValue()
                if current_objective < self._best_objective:
                    self._best_objective = current_objective
                
                if self._solution_count % 10 == 0:  # Log every 10 solutions
                    logger.info(f"Solution {self._solution_count} found after {current_time:.2f} seconds, objective: {current_objective}")
                
                if self._progress_callback:
                    # Progress from 70 to 90 based on time compared to max time
                    progress = 70 + min(20, (current_time / 60.0) * 20)
                    self._progress_callback(int(progress), f"Found solution {self._solution_count}")
                
                # Check if we've spent too much time
                if current_time > 60.0:
                    logger.warning("Time limit reached, stopping optimization")
                    self.StopSearch()
        
        # Create and use the callback
        callback = SolutionCallback(progress_callback)
        status = solver.Solve(model, callback)
        
        # Process the solution
        logger.info(f"Solver status: {solver.StatusName(status)}")
        if progress_callback:
            progress_callback(90, "Processing solution")
            
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            logger.info("Solution found - constructing schedule")
            # Solution found - construct schedule
            schedule = {}
            doctor_shift_counts = {doc: 0 for doc in doctor_names}
            
            for doctor in doctor_names:
                for date in self.all_dates:
                    if date not in schedule:
                        schedule[date] = {"Day": [], "Evening": [], "Night": []}
                    
                    for shift in self.shifts:
                        if solver.Value(assignments[(doctor, date, shift)]) == 1:
                            schedule[date][shift].append(doctor)
                            doctor_shift_counts[doctor] += 1
            
            # Compute optimization statistics
            solution_time = time.time() - start_time
            logger.info(f"Optimization completed in {solution_time:.2f} seconds")
            if progress_callback:
                progress_callback(95, "Computing statistics")
            
            # Check for any unbalanced days (wrong number of doctors assigned)
            coverage_errors = 0
            for date in schedule:
                for shift in self.shifts:
                    if len(schedule[date][shift]) != self.shift_requirements[shift]:
                        coverage_errors += 1
            
            stats = {
                "status": solver.StatusName(status),
                "solution_time_seconds": solution_time,
                "objective_value": solver.ObjectiveValue(),
                "coverage_errors": coverage_errors,
                "doctor_shift_counts": doctor_shift_counts,
                "solutions_found": callback._solution_count,
                "variables": solver.NumBooleans(),
                "constraints": solver.NumConflicts()
            }
            
            if progress_callback:
                progress_callback(100, "Optimization complete")
            return schedule, stats
        else:
            logger.error("No feasible solution found")
            if progress_callback:
                progress_callback(100, "No solution found")
            # No solution found
            return {}, {
                "status": solver.StatusName(status),
                "solution_time_seconds": time.time() - start_time,
                "error": "No feasible solution found within the time limit."
            }
    
    def _add_coverage_constraints(self, model, assignments):
        """Add constraints to ensure proper shift coverage."""
        for date in self.all_dates:
            for shift in self.shifts:
                # Sum of assignments for this date and shift should equal requirements
                shift_vars = [
                    assignments[(doctor["name"], date, shift)]
                    for doctor in self.doctors
                ]
                
                model.Add(sum(shift_vars) == self.shift_requirements[shift])
    
    def _add_availability_constraints(self, model, assignments):
        """Add constraints based on doctor availability."""
        for doctor in self.doctors:
            doctor_name = doctor["name"]
            
            for date in self.all_dates:
                for shift in self.shifts:
                    # If doctor is not available, force assignment to 0
                    if not self._is_doctor_available(doctor_name, date, shift):
                        model.Add(assignments[(doctor_name, date, shift)] == 0)
    
    def _add_one_shift_per_day_constraints(self, model, assignments):
        """Add constraint that each doctor works at most one shift per day."""
        for doctor in self.doctors:
            doctor_name = doctor["name"]
            
            for date in self.all_dates:
                # Sum of all shifts for this doctor on this day should be <= 1
                daily_shifts = [
                    assignments[(doctor_name, date, shift)]
                    for shift in self.shifts
                ]
                
                model.Add(sum(daily_shifts) <= 1)
    
    def _add_rest_constraints(self, model, assignments):
        """Add constraints to ensure proper rest between shifts."""
        for doctor in self.doctors:
            doctor_name = doctor["name"]
            
            # For each day except the last one
            for i in range(len(self.all_dates) - 1):
                current_date = self.all_dates[i]
                next_date = self.all_dates[i + 1]
                
                # If doctor works night shift, they shouldn't work day/evening next day
                night_var = assignments[(doctor_name, current_date, "Night")]
                next_day_var = assignments[(doctor_name, next_date, "Day")]
                next_evening_var = assignments[(doctor_name, next_date, "Evening")]
                
                # Cannot work day shift after night shift
                model.Add(night_var + next_day_var <= 1)
                
                # Cannot work evening shift after night shift
                model.Add(night_var + next_evening_var <= 1)
    
    def _add_holiday_constraints(self, model, assignments):
        """Add constraints for holiday and senior doctor allocations."""
        logger.info("Adding specialized holiday and seniority constraints")
        
        # Define junior and senior doctor sets
        junior_doctors = [doc["name"] for doc in self.doctors if doc["seniority"] == "Junior"]
        senior_doctors = [doc["name"] for doc in self.doctors if doc["seniority"] == "Senior"]
        
        # 1. Senior doctors should not work on long holidays (strict constraint)
        for doctor_name in senior_doctors:
            for date in self.all_dates:
                if date in self.holidays and self.holidays[date] == "Long":
                    for shift in self.shifts:
                        model.Add(assignments[(doctor_name, date, shift)] == 0)
        
        # 2. For all holidays (including short ones), prefer juniors over seniors
        # Increased penalty from 10 to 30
        for date in self.all_dates:
            if date in self.holidays:
                for shift in self.shifts:
                    # Add higher penalty for seniors working on holidays
                    for doctor_name in senior_doctors:
                        # This variable will be minimized in the objective function
                        senior_holiday_var = model.NewBoolVar(f"senior_holiday_{doctor_name}_{date}_{shift}")
                        model.Add(senior_holiday_var >= assignments[(doctor_name, date, shift)])
                        # Increased penalty
                        model.Minimize(senior_holiday_var * 30)
        
        # 3. For weekends, prefer juniors over seniors when possible
        # Increased penalty from 5 to 20
        for date in self.all_dates:
            if date in self.weekends and date not in self.holidays:  # Only for weekends that aren't holidays
                for shift in self.shifts:
                    for doctor_name in senior_doctors:
                        senior_weekend_var = model.NewBoolVar(f"senior_weekend_{doctor_name}_{date}_{shift}")
                        model.Add(senior_weekend_var >= assignments[(doctor_name, date, shift)])
                        # Increased penalty
                        model.Minimize(senior_weekend_var * 20)
        
        # 4. Stronger constraints to ensure seniors work less overall
        if junior_doctors and senior_doctors:
            # Create variables to track total shifts for juniors and seniors
            junior_total = model.NewIntVar(0, 100000, "junior_total_shifts")
            senior_total = model.NewIntVar(0, 100000, "senior_total_shifts")
            
            # Sum all junior shifts
            junior_shifts = []
            for doc in junior_doctors:
                for date in self.all_dates:
                    for shift in self.shifts:
                        junior_shifts.append(assignments[(doc, date, shift)])
            model.Add(junior_total == sum(junior_shifts))
            
            # Sum all senior shifts
            senior_shifts = []
            for doc in senior_doctors:
                for date in self.all_dates:
                    for shift in self.shifts:
                        senior_shifts.append(assignments[(doc, date, shift)])
            model.Add(senior_total == sum(senior_shifts))
            
            # Lowered the target ratio from 85% to 75% of junior workload
            # Instead of: senior_total * 100 <= junior_total * 85 + senior_excess * 100
            # Doing: senior_total * 100 <= junior_total * 75 + senior_excess * 100
            senior_excess = model.NewIntVar(0, 100000, "senior_excess_workload")
            model.Add(senior_total * len(junior_doctors) * 100 <= 
                    junior_total * len(senior_doctors) * 75 + senior_excess * 100)
            
            # Higher penalty
            model.Minimize(senior_excess * 25)
            
        # 5. NEW: Add individual fairness constraints for weekend/holiday shifts
        # This ensures senior doctors get fewer weekend/holiday shifts individually, not just in total
        senior_wh_shifts = {}
        junior_wh_shifts = {}
        
        # Count weekend/holiday shifts for each doctor
        for doctor_name in senior_doctors:
            wh_var = model.NewIntVar(0, 1000, f"wh_shifts_{doctor_name}")
            wh_terms = []
            
            for date in self.all_dates:
                if date in self.weekends or date in self.holidays:
                    for shift in self.shifts:
                        wh_terms.append(assignments[(doctor_name, date, shift)])
            
            model.Add(wh_var == sum(wh_terms))
            senior_wh_shifts[doctor_name] = wh_var
        
        for doctor_name in junior_doctors:
            wh_var = model.NewIntVar(0, 1000, f"wh_shifts_{doctor_name}")
            wh_terms = []
            
            for date in self.all_dates:
                if date in self.weekends or date in self.holidays:
                    for shift in self.shifts:
                        wh_terms.append(assignments[(doctor_name, date, shift)])
            
            model.Add(wh_var == sum(wh_terms))
            junior_wh_shifts[doctor_name] = wh_var
        
        # Create a target maximum for senior doctors' weekend/holiday shifts
        # (approximately 60% of the average junior doctor)
        if junior_wh_shifts and senior_wh_shifts:
            for senior_name, senior_wh in senior_wh_shifts.items():
                for junior_name, junior_wh in junior_wh_shifts.items():
                    # Create penalty when senior works more weekend/holiday shifts than 60% of junior
                    excess = model.NewIntVar(0, 1000, f"wh_excess_{senior_name}_{junior_name}")
                    model.Add(excess >= senior_wh * 10 - junior_wh * 6)
                    model.Minimize(excess * 10)
    
    def _add_workload_balance_objective(self, model, assignments):
        """Create variables and constraints for monthly workload balance."""
        balance_vars = []
        
        # Group dates by month
        months = {}
        for date in self.all_dates:
            month = self._group_by_month(date)
            if month not in months:
                months[month] = []
            months[month].append(date)
        
        # For each month, create balance variables
        for month, dates in months.items():
            # Calculate monthly hours for each doctor
            doctor_hours = {}
            
            for doctor in self.doctors:
                doctor_name = doctor["name"]
                
                # Sum of hours for this doctor in this month
                month_hours = model.NewIntVar(0, 1000, f"hours_{doctor_name}_{month}")
                hour_terms = []
                
                for date in dates:
                    for shift in self.shifts:
                        # Each shift contributes its hours to the total
                        hour_terms.append(assignments[(doctor_name, date, shift)] * self.shift_hours[shift])
                
                model.Add(month_hours == sum(hour_terms))
                doctor_hours[doctor_name] = month_hours
            
            # Find max and min hours
            max_hours = model.NewIntVar(0, 1000, f"max_hours_month_{month}")
            min_hours = model.NewIntVar(0, 1000, f"min_hours_month_{month}")
            
            # Set max hours constraints
            for doc_name, hours in doctor_hours.items():
                model.Add(max_hours >= hours)
            
            # Set min hours constraints
            for doc_name, hours in doctor_hours.items():
                model.Add(min_hours <= hours)
            
            # Create variance variable (max - min)
            variance = model.NewIntVar(0, 1000, f"variance_month_{month}")
            model.Add(variance == max_hours - min_hours)
            
            # Create penalty for exceeding the maximum monthly variance
            penalty = model.NewIntVar(0, 1000, f"variance_penalty_{month}")
            model.Add(penalty >= variance - self.max_monthly_variance)
            
            # Add penalty to the list of variables for objective function
            balance_vars.append(penalty)
        
        return balance_vars
    
    def _add_weekend_fairness_objective(self, model, assignments):
        """Create variables for weekend/holiday fairness."""
        fairness_vars = []
        
        # Calculate weekend and holiday hours for each doctor
        for doctor in self.doctors:
            doctor_name = doctor["name"]
            is_senior = doctor["seniority"] == "Senior"
            
            # Create a variable for total weekend/holiday hours
            wh_hours = model.NewIntVar(0, 1000, f"wh_hours_{doctor_name}")
            
            # Sum hours for weekends and holidays
            hour_terms = []
            for date in self.all_dates:
                is_weekend = date in self.weekends
                is_holiday = date in self.holidays
                
                if is_weekend or is_holiday:
                    for shift in self.shifts:
                        hour_terms.append(assignments[(doctor_name, date, shift)] * self.shift_hours[shift])
            
            model.Add(wh_hours == sum(hour_terms))
            
            # Create penalty for deviation from target
            target = self.seniors_holiday_target if is_senior else self.juniors_holiday_target
            
            # Above target penalty
            above_penalty = model.NewIntVar(0, 1000, f"above_target_{doctor_name}")
            model.Add(above_penalty >= wh_hours - target)
            
            # Below target penalty
            below_penalty = model.NewIntVar(0, 1000, f"below_target_{doctor_name}")
            model.Add(below_penalty >= target - wh_hours)
            
            # Add both penalties to the objective
            fairness_vars.append(above_penalty)
            fairness_vars.append(below_penalty)
        
        return fairness_vars
    
    def _add_preference_objective(self, model, assignments):
        """Create variables for shift preferences."""
        preference_vars = []
        
        for doctor in self.doctors:
            doctor_name = doctor["name"]
            
            # Get doctor's preferences
            preferences = {}
            
            # Default preferences based on doctor's pref field
            if "pref" in doctor and doctor["pref"] != "None":
                if doctor["pref"] == "Day Only":
                    preferences = {"Day": 0, "Evening": 5, "Night": 10}
                elif doctor["pref"] == "Evening Only":
                    preferences = {"Day": 5, "Evening": 0, "Night": 5}
                elif doctor["pref"] == "Night Only":
                    preferences = {"Day": 10, "Evening": 5, "Night": 0}
            else:
                # Default preferences - equal weight
                preferences = {"Day": 1, "Evening": 1, "Night": 1}
            
            # Add preference penalties
            for date in self.all_dates:
                for shift in self.shifts:
                    penalty = preferences.get(shift, 1)  # Default penalty of 1
                    if penalty > 0:
                        var = assignments[(doctor_name, date, shift)]
                        preference_vars.append(var * penalty)
        
        return preference_vars


def optimize_schedule(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """Main function to optimize a schedule based on input data.
    
    Args:
        data: Dictionary containing doctors, holidays, and availability data
        progress_callback: Optional function to report progress
        
    Returns:
        Dictionary with optimized schedule and statistics
    """
    try:
        # Extract data
        doctors = data.get("doctors", [])
        holidays = data.get("holidays", {})
        availability = data.get("availability", {})
        
        # Create optimizer
        optimizer = ScheduleOptimizer(doctors, holidays, availability)
        
        # Run optimization
        schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        
        # Return results
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
    # Test with sample data
    sample_data = {
        "doctors": [
            {"name": "Doctor1", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor2", "seniority": "Junior", "pref": "None"},
            {"name": "Doctor3", "seniority": "Junior", "pref": "Evening"},
            {"name": "Doctor4", "seniority": "Junior", "pref": "Evening"},
            {"name": "Doctor5", "seniority": "Junior", "pref": "Evening"},
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
            # Add more holidays as needed
        },
        "availability": {
            # Example availability constraint
            "Doctor1": {
                "2025-01-01": "Not Available"
            }
        }
    }
    
    # Run optimization and print results
    result = optimize_schedule(sample_data)
    print(f"Optimization status: {result['statistics']['status']}")
    print(f"Solution time: {result['statistics'].get('solution_time_seconds', 'N/A')} seconds")
    print(f"Sample of schedule (first 3 days):")
    
    schedule = result["schedule"]
    dates = sorted(schedule.keys())[:3]
    
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            doctors = schedule[date][shift]
            print(f"  {shift}: {', '.join(doctors)}")