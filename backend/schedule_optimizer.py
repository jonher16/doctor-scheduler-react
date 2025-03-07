#!/usr/bin/env python3
"""
Hospital Staff Scheduler - Tabu Search Optimization (Revised)

This version uses a tabu search heuristic to tackle the scheduling problem.
It retains the same inputs, outputs, and naming conventions as the MILP version.
In this update we remove the strong penalty on shift preferences so that a doctor's 
preference does not lead to them working significantly fewer hours, and we enforce a 
tighter monthly workload balance.

UPDATED: Doctor availability is now implemented as a hard constraint rather than a soft constraint.
"""

import datetime
import time
import logging
import threading
import random
import copy
from typing import Dict, List, Any, Tuple, Set, Callable

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

        # Targets for weekend/holiday assignments:
        self.seniors_holiday_target = 30  # Target for seniors (they should rest more)
        self.juniors_holiday_target = 55  # Target for juniors
        
        # Monthly workload balance thresholds - much stricter now:
        self.max_monthly_variance_junior = 5   # For juniors, work hours should not vary by more than 5h/month
        self.max_monthly_variance_senior = 8   # For seniors, slightly higher variance allowed but still strict

        # Generate date collections
        self.all_dates = self._generate_dates()
        self.weekends = self._identify_weekends()
        self.weekdays = set(self.all_dates) - self.weekends
        
        # Weights for the objective function
        self.alpha = 1.0   # Weekend/holiday fairness
        self.beta = 10.0   # Monthly workload balance - increased significantly
        # Shift preference penalty is removed.
        self.delta = 5.0   # Senior workload penalty
        self.epsilon = 1.0 # Weekend/holiday deviation

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

    def _get_available_doctors_for_shift(self, date: str, shift: str, schedule: Dict[str, Dict[str, List[str]]]) -> List[str]:
        """
        Get a list of doctors available for a specific shift on a specific date, 
        excluding doctors already assigned to other shifts on the same day.
        """
        doctor_names = [doc["name"] for doc in self.doctors]
        
        # Filter doctors already assigned to other shifts on this date
        doctors_assigned_today = set()
        if date in schedule:
            for other_shift in self.shifts:
                if other_shift in schedule[date]:
                    doctors_assigned_today.update(schedule[date][other_shift])
        
        # Filter doctors by availability for this shift
        available_doctors = [
            doctor for doctor in doctor_names 
            if self._is_doctor_available(doctor, date, shift) and doctor not in doctors_assigned_today
        ]
        
        return available_doctors

    def _group_by_month(self, date_str: str) -> int:
        """Extract month from date string."""
        d = datetime.date.fromisoformat(date_str)
        return d.month
        
    def _dates_in_month(self, month: int) -> List[str]:
        """Get all dates in a specific month."""
        return [d for d in self.all_dates if self._group_by_month(d) == month]
        
    def _check_monthly_workload_balance(self, schedule: Dict[str, Dict[str, List[str]]]) -> Dict[int, float]:
        """
        Check the workload balance for each month.
        Returns a dictionary mapping month number to the maximum difference between any two doctors.
        """
        monthly_imbalances = {}
        doctor_names = [doc["name"] for doc in self.doctors]
        
        for month in range(1, 13):
            month_dates = self._dates_in_month(month)
            doctor_hours = {doctor: 0 for doctor in doctor_names}
            
            # Count hours for each doctor in this month
            for date in month_dates:
                if date not in schedule:
                    continue
                    
                for shift in self.shifts:
                    if shift not in schedule[date]:
                        continue
                        
                    for doctor in schedule[date][shift]:
                        doctor_hours[doctor] += self.shift_hours[shift]
            
            # Only consider doctors who worked in this month
            active_hours = [hours for doctor, hours in doctor_hours.items() if hours > 0]
            
            if active_hours:
                imbalance = max(active_hours) - min(active_hours)
                monthly_imbalances[month] = imbalance
                
        return monthly_imbalances

    # -------------------------------
    # Tabu Search Helper Functions
    # -------------------------------

    def generate_initial_schedule(self) -> Dict[str, Dict[str, List[str]]]:
        """
        Generate an initial schedule.
        For each date and shift, assign the required number of doctors randomly,
        ONLY choosing those who are available and not already assigned on that day.
        """
        doctor_names = [doc["name"] for doc in self.doctors]
        schedule = {}
        
        for date in self.all_dates:
            schedule[date] = {}
            assigned_today = set()  # Track doctors assigned on this date
            
            for shift in self.shifts:
                required = self.shift_requirements[shift]
                
                # Only consider doctors who are available for this shift and not already assigned today
                candidates = [
                    d for d in doctor_names 
                    if self._is_doctor_available(d, date, shift) and d not in assigned_today
                ]
                
                # If not enough available doctors, we need to relax the "not already assigned today" constraint
                # but still respect availability constraints
                if len(candidates) < required:
                    additional_candidates = [
                        d for d in doctor_names 
                        if self._is_doctor_available(d, date, shift) and d not in candidates
                    ]
                    candidates.extend(additional_candidates)
                
                # If still not enough, log the issue but continue with best effort
                if len(candidates) < required:
                    logger.warning(f"Not enough available doctors for {date}, {shift}. Need {required}, have {len(candidates)}")
                
                # Select doctors for this shift
                if candidates:
                    if len(candidates) <= required:
                        assigned = candidates
                    else:
                        assigned = random.sample(candidates, required)
                else:
                    # Emergency case - no available doctors
                    assigned = []
                
                schedule[date][shift] = assigned
                assigned_today.update(assigned)
        
        return schedule

    def objective(self, schedule: Dict[str, Dict[str, List[str]]]) -> float:
        """
        Compute the total penalty cost for a schedule.
        Lower cost indicates fewer constraint violations.
        Note: Availability constraints are now treated as hard constraints and 
        should not be violated in properly constructed neighbor solutions.
        """
        cost = 0.0
        doctor_names = [doc["name"] for doc in self.doctors]

        # 1. Check for availability violations (should be rare or non-existent due to hard constraint)
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    if not self._is_doctor_available(doctor, date, shift):
                        # Extremely high penalty as this should not happen
                        cost += 100000

        # 2. One shift per day penalty.
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            assignments = {}
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    assignments[doctor] = assignments.get(doctor, 0) + 1
                    
            for count in assignments.values():
                if count > 1:
                    cost += 500 * (count - 1)

        # 3. Rest constraints: penalize a night shift followed by a day or evening shift.
        for i in range(len(self.all_dates) - 1):
            current_date = self.all_dates[i]
            next_date = self.all_dates[i + 1]
            
            if current_date not in schedule or "Night" not in schedule[current_date]:
                continue
                
            if next_date not in schedule:
                continue
                
            for doctor in doctor_names:
                if doctor in schedule[current_date].get("Night", []):
                    if (doctor in schedule[next_date].get("Day", [])) or (doctor in schedule[next_date].get("Evening", [])):
                        cost += 500

        # 4. Long holiday constraint for seniors.
        for date in self.all_dates:
            if date in self.holidays and self.holidays[date] == "Long":
                for doc in self.doctors:
                    if doc.get("seniority", "") == "Senior":
                        name = doc["name"]
                        
                        if date not in schedule:
                            continue
                            
                        if (name in schedule[date].get("Day", []) or
                            name in schedule[date].get("Evening", []) or
                            name in schedule[date].get("Night", [])):
                            cost += 1000

        # 5. Monthly workload balance:
        #    Calculate total hours per doctor per month and penalize if variance exceeds the threshold.
        for m in range(1, 13):
            month_dates = self._dates_in_month(m)
            senior_hours = []
            junior_hours = []
            
            for doctor in doctor_names:
                total = 0
                for date in month_dates:
                    if date not in schedule:
                        continue
                        
                    for shift in self.shifts:
                        if shift not in schedule[date]:
                            continue
                            
                        if doctor in schedule[date][shift]:
                            total += self.shift_hours[shift]
                            
                doc_info = next((d for d in self.doctors if d["name"] == doctor), None)
                if doc_info and doc_info.get("seniority", "") == "Senior":
                    senior_hours.append(total)
                else:
                    junior_hours.append(total)
                    
            if senior_hours:
                variance_senior = max(senior_hours) - min(senior_hours)
                if variance_senior > self.max_monthly_variance_senior:
                    # Apply exponential penalty to severely penalize large variances
                    excess = variance_senior - self.max_monthly_variance_senior
                    cost += self.beta * (excess ** 2)
                    
            if junior_hours:
                variance_junior = max(junior_hours) - min(junior_hours)
                if variance_junior > self.max_monthly_variance_junior:
                    # Apply exponential penalty to severely penalize large variances
                    excess = variance_junior - self.max_monthly_variance_junior
                    cost += self.beta * (excess ** 2)
                    
            # Add new penalty for extreme monthly hour disparities
            if senior_hours and len(senior_hours) > 1:
                # Calculate standard deviation
                mean_hours = sum(senior_hours) / len(senior_hours)
                std_dev = (sum((h - mean_hours) ** 2 for h in senior_hours) / len(senior_hours)) ** 0.5
                if std_dev > 5:  # Penalize standard deviations greater than 5 hours
                    cost += self.beta * 2 * (std_dev - 5) ** 2
                    
            if junior_hours and len(junior_hours) > 1:
                # Calculate standard deviation
                mean_hours = sum(junior_hours) / len(junior_hours)
                std_dev = (sum((h - mean_hours) ** 2 for h in junior_hours) / len(junior_hours)) ** 0.5
                if std_dev > 5:  # Penalize standard deviations greater than 5 hours
                    cost += self.beta * 2 * (std_dev - 5) ** 2

        # 6. Weekend/Holiday fairness:
        for doctor in doctor_names:
            wh_hours = 0
            for date in self.all_dates:
                if date not in schedule:
                    continue
                    
                if (date in self.weekends) or (date in self.holidays):
                    for shift in self.shifts:
                        if shift not in schedule[date]:
                            continue
                            
                        if doctor in schedule[date][shift]:
                            wh_hours += self.shift_hours[shift]
                            
            doc_info = next((d for d in self.doctors if d["name"] == doctor), None)
            if doc_info:
                if doc_info.get("seniority", "") == "Senior":
                    if wh_hours > self.seniors_holiday_target:
                        cost += self.epsilon * (wh_hours - self.seniors_holiday_target)
                else:
                    if wh_hours < self.juniors_holiday_target:
                        cost += self.epsilon * (self.juniors_holiday_target - wh_hours)

        # 7. (Removed) Shift preference penalty.
        
        # 8. Senior workload constraint: encourage seniors to work fewer total hours than juniors.
        senior_total = 0
        junior_total = 0
        num_seniors = 0
        num_juniors = 0
        
        for doctor in doctor_names:
            total = 0
            for date in self.all_dates:
                if date not in schedule:
                    continue
                    
                for shift in self.shifts:
                    if shift not in schedule[date]:
                        continue
                        
                    if doctor in schedule[date][shift]:
                        total += self.shift_hours[shift]
                        
            doc_info = next((d for d in self.doctors if d["name"] == doctor), None)
            if doc_info and doc_info.get("seniority", "") == "Senior":
                senior_total += total
                num_seniors += 1
            else:
                junior_total += total
                num_juniors += 1
                
        if num_seniors > 0 and num_juniors > 0:
            avg_senior = senior_total / num_seniors
            avg_junior = junior_total / num_juniors
            if avg_senior > 0.9 * avg_junior:
                cost += self.delta * (avg_senior - 0.9 * avg_junior)

        return cost

    def get_neighbors(self, current_schedule: Dict[str, Dict[str, List[str]]],
                      num_moves: int = 20) -> List[Tuple[Dict[str, Dict[str, List[str]]], Tuple[str, str, str, str]]]:
        """
        Generate neighbor schedules by selecting a random (date, shift) slot and replacing one doctor.
        UPDATED: Only consider available doctors for each shift based on their availability constraints.
        Each move is represented as a tuple: (date, shift, removed_doctor, new_doctor).
        """
        neighbors = []
        attempts = 0
        max_attempts = num_moves * 10  # Allow more attempts to find valid moves
        
        while len(neighbors) < num_moves and attempts < max_attempts:
            attempts += 1
            
            # Select a random date and shift
            date = random.choice(self.all_dates)
            shift = random.choice(self.shifts)
            
            # Skip if date or shift not in schedule
            if date not in current_schedule or shift not in current_schedule[date]:
                continue
                
            current_assignment = current_schedule[date][shift]
            if not current_assignment:
                continue
                
            # Select a random doctor to replace
            idx = random.randint(0, len(current_assignment) - 1)
            old_doctor = current_assignment[idx]
            
            # Find all available doctors for this shift who aren't already assigned on this date
            available_doctors = set()
            for doctor in [doc["name"] for doc in self.doctors]:
                # Check if doctor is available for this shift
                if not self._is_doctor_available(doctor, date, shift):
                    continue
                
                # Check if doctor is already assigned to another shift on this date
                already_assigned = False
                for other_shift in self.shifts:
                    if other_shift == shift:
                        continue
                    if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                        already_assigned = True
                        break
                
                if not already_assigned:
                    available_doctors.add(doctor)
            
            # Remove the doctor we're replacing from candidates list (no-op replacement)
            if old_doctor in available_doctors:
                available_doctors.remove(old_doctor)
            
            # If no available replacements, try another move
            if not available_doctors:
                continue
            
            # Select a random available doctor as replacement
            new_doctor = random.choice(list(available_doctors))
            
            # Create a new schedule with the doctor replacement
            new_schedule = copy.deepcopy(current_schedule)
            new_schedule[date][shift][idx] = new_doctor
            
            # Record the move
            move = (date, shift, old_doctor, new_doctor)
            neighbors.append((new_schedule, move))
        
        return neighbors

    # -------------------------------
    # Tabu Search Main Loop
    # -------------------------------

    def optimize(self, progress_callback: Callable = None) -> Tuple[Dict, Dict]:
        """
        Run the tabu search optimization and return the schedule and statistics.
        
        Args:
            progress_callback: Optional callback to report progress.
            
        Returns:
            Tuple of (schedule dictionary, statistics dictionary).
        """
        start_time = time.time()
        logger.info("Starting Tabu Search optimization")
        if progress_callback:
            progress_callback(5, "Initializing Tabu Search...")
            
        # Check doctor availability to warn about potential workload imbalance
        total_shifts_needed = 0
        for date in self.all_dates:
            for shift in self.shifts:
                total_shifts_needed += self.shift_requirements[shift]
                
        doctor_names = [doc["name"] for doc in self.doctors]
        availability_counts = {doctor: 0 for doctor in doctor_names}
        
        for date in self.all_dates:
            for shift in self.shifts:
                for doctor in doctor_names:
                    if self._is_doctor_available(doctor, date, shift):
                        availability_counts[doctor] += 1
        
        # Log doctors with very limited availability
        for doctor, count in availability_counts.items():
            availability_percentage = (count / (len(self.all_dates) * len(self.shifts))) * 100
            if availability_percentage < 50:
                logger.warning(f"Doctor {doctor} is only available for {availability_percentage:.1f}% of all possible shifts")
                if progress_callback:
                    progress_callback(10, f"Note: Doctor {doctor} has limited availability ({availability_percentage:.1f}%)")

        current_schedule = self.generate_initial_schedule()
        current_cost = self.objective(current_schedule)
        best_schedule = current_schedule
        best_cost = current_cost

        tabu_list = {}  # Map move (tuple) to expiration iteration
        tabu_tenure = 15  # Increased to allow more exploration
        max_iterations = 1000  # Doubled to allow more time to find balanced solutions
        no_improve_count = 0
        iteration = 0
        
        # Add adaptive parameters for workload balancing
        focus_on_balance = False
        balance_iterations = 0

        while iteration < max_iterations and no_improve_count < 50:
            iteration += 1
            neighbors = self.get_neighbors(current_schedule, num_moves=20)
            
            # If no valid neighbors could be generated, break
            if not neighbors:
                logger.warning(f"No valid neighbors found at iteration {iteration}. Stopping early.")
                break
                
            best_neighbor = None
            best_neighbor_cost = float('inf')
            best_move = None

            for neighbor_schedule, move in neighbors:
                move_key = move
                neighbor_cost = self.objective(neighbor_schedule)
                
                # Skip tabu moves unless they would be the best solution found so far
                if move_key in tabu_list and neighbor_cost >= best_cost:
                    continue
                    
                if neighbor_cost < best_neighbor_cost:
                    best_neighbor = neighbor_schedule
                    best_neighbor_cost = neighbor_cost
                    best_move = move

            if best_neighbor is None:
                break

            current_schedule = best_neighbor
            current_cost = best_neighbor_cost

            tabu_list[best_move] = iteration + tabu_tenure
            tabu_list = {m: exp for m, exp in tabu_list.items() if exp > iteration}

            if current_cost < best_cost:
                best_schedule = current_schedule
                best_cost = current_cost
                no_improve_count = 0
                
                # Check for balance issues every 50 iterations
                if iteration % 50 == 0:
                    # Calculate monthly workload stats
                    monthly_imbalances = self._check_monthly_workload_balance(best_schedule)
                    worst_imbalance = max(monthly_imbalances.values()) if monthly_imbalances else 0
                    
                    # If there's a significant imbalance, switch to balance focus
                    if worst_imbalance > 20:  # More than 20 hours difference in a month
                        focus_on_balance = True
                        balance_iterations = 50  # Focus on balance for the next 50 iterations
                        logger.info(f"Switching to workload balance focus (imbalance: {worst_imbalance}h)")
                        if progress_callback:
                            progress_callback(50 + int(40 * iteration / max_iterations),
                                            f"Iteration {iteration}: Focusing on workload balance")
            else:
                no_improve_count += 1
                
            # If we're in balance focus mode, adjust the objective function temporarily
            if focus_on_balance:
                balance_iterations -= 1
                if balance_iterations <= 0:
                    focus_on_balance = False
                    
                # During balance focus, we might accept slightly worse solutions that improve balance
                if not focus_on_balance and iteration % 10 == 0:
                    monthly_imbalances = self._check_monthly_workload_balance(current_schedule)
                    current_worst_imbalance = max(monthly_imbalances.values()) if monthly_imbalances else 0
                    
                    monthly_imbalances = self._check_monthly_workload_balance(best_schedule)
                    best_worst_imbalance = max(monthly_imbalances.values()) if monthly_imbalances else 0
                    
                    # If current solution has much better balance, consider it even if objective is slightly worse
                    if current_worst_imbalance < best_worst_imbalance - 10 and current_cost < best_cost * 1.05:
                        logger.info(f"Accepting more balanced solution: imbalance {best_worst_imbalance}h -> {current_worst_imbalance}h")
                        best_schedule = current_schedule
                        best_cost = current_cost

            if progress_callback and iteration % 10 == 0:
                progress_callback(50 + int(40 * iteration / max_iterations),
                                  f"Iteration {iteration}: Best cost = {best_cost}")

        solution_time = time.time() - start_time

        # -------------------------------
        # Check for Availability Violations
        # -------------------------------
        availability_violations = 0
        for date in self.all_dates:
            if date not in best_schedule:
                continue
                
            for shift in self.shifts:
                if shift not in best_schedule[date]:
                    continue
                    
                for doctor in best_schedule[date][shift]:
                    if not self._is_doctor_available(doctor, date, shift):
                        availability_violations += 1
                        
        if availability_violations > 0:
            logger.error(f"Found {availability_violations} availability violations in final solution!")

        # -------------------------------
        # Build Statistics
        # -------------------------------
        schedule = best_schedule
        doctor_names = [doc["name"] for doc in self.doctors]
        doctor_shift_counts = {doc: 0 for doc in doctor_names}
        preference_metrics = {}
        weekend_metrics = {}
        holiday_metrics = {}

        for doc in self.doctors:
            name = doc["name"]
            pref = doc.get("pref", "None")
            preference_metrics[name] = {"preference": pref, "preferred_shifts": 0, "other_shifts": 0}
            weekend_metrics[name] = 0
            holiday_metrics[name] = 0

        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    doctor_shift_counts[doctor] += 1
                    
                    if date in self.weekends:
                        weekend_metrics[doctor] += 1
                        
                    if date in self.holidays:
                        holiday_metrics[doctor] += 1
                        
                    doc_info = next((d for d in self.doctors if d["name"] == doctor), None)
                    if doc_info and "pref" in doc_info and doc_info["pref"] != "None":
                        if (doc_info["pref"] == "Day Only" and shift == "Day") or \
                           (doc_info["pref"] == "Evening Only" and shift == "Evening") or \
                           (doc_info["pref"] == "Night Only" and shift == "Night"):
                            preference_metrics[doctor]["preferred_shifts"] += 1
                        else:
                            preference_metrics[doctor]["other_shifts"] += 1

        coverage_errors = 0
        for date in self.all_dates:
            if date not in schedule:
                coverage_errors += len(self.shifts)
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    coverage_errors += 1
                    continue
                    
                if len(schedule[date][shift]) != self.shift_requirements[shift]:
                    coverage_errors += 1

        if progress_callback:
            progress_callback(100, "Optimization complete")

        # Calculate monthly hours for each doctor for reporting
        monthly_hours = {}
        for doctor in doctor_names:
            monthly_hours[doctor] = {}
            for month in range(1, 13):
                monthly_total = 0
                month_dates = self._dates_in_month(month)
                for date in month_dates:
                    if date not in schedule:
                        continue
                        
                    for shift in self.shifts:
                        if shift not in schedule[date]:
                            continue
                            
                        if doctor in schedule[date][shift]:
                            monthly_total += self.shift_hours[shift]
                
                monthly_hours[doctor][month] = monthly_total
        
        # Calculate monthly stats (min, max, avg) for reporting
        monthly_stats = {}
        for month in range(1, 13):
            month_values = [monthly_hours[doctor][month] for doctor in doctor_names]
            if month_values:
                monthly_stats[month] = {
                    "min": min(month_values),
                    "max": max(month_values),
                    "avg": sum(month_values) / len(month_values),
                    "std_dev": (sum((v - (sum(month_values) / len(month_values))) ** 2 for v in month_values) / len(month_values)) ** 0.5
                }
        
        stats = {
            "status": "Tabu Search completed",
            "solution_time_seconds": solution_time,
            "objective_value": best_cost,
            "coverage_errors": coverage_errors,
            "availability_violations": availability_violations,
            "doctor_shift_counts": doctor_shift_counts,
            "preference_metrics": preference_metrics,
            "weekend_metrics": weekend_metrics,
            "holiday_metrics": holiday_metrics,
            "monthly_hours": monthly_hours,
            "monthly_stats": monthly_stats,
            "iterations": iteration
        }

        return schedule, stats

def optimize_schedule(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """
    Main function to optimize a schedule using Tabu Search.
    
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
            "2025-07-04": "Long"
        },
        "availability": {
            "Doctor1": {
                "2025-01-01": "Not Available",
                "2025-01-02": "Day Only",
                "2025-01-03": "Evening Only",
                "2025-01-04": "Night Only"
            },
            "Doctor2": {
                "2025-02-01": "Not Available"
            }
        }
    }

    result = optimize_schedule(sample_data)
    print(f"Optimization status: {result['statistics']['status']}")
    print(f"Solution time: {result['statistics'].get('solution_time_seconds', 'N/A')} seconds")
    print(f"Objective value: {result['statistics'].get('objective_value', 'N/A')}")
    if 'availability_violations' in result['statistics']:
        print(f"Availability violations: {result['statistics']['availability_violations']}")
    print("Sample of schedule (first 3 days):")
    schedule = result["schedule"]
    dates = sorted(schedule.keys())[:3]
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            assigned = schedule[date][shift]
            print(f"  {shift}: {', '.join(assigned)}")