#!/usr/bin/env python3
"""
Hospital Staff Scheduler - Tabu Search Optimization (Revised)

This version uses a tabu search heuristic to tackle the scheduling problem.
It retains the same inputs, outputs, and naming conventions as the MILP version.
In this update we remove the strong penalty on shift preferences so that a doctor’s 
preference does not lead to them working significantly fewer hours, and we enforce a 
tighter monthly workload balance.
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
        
        # Monthly workload balance thresholds:
        self.max_monthly_variance_junior = 10  # For juniors, work hours should not vary by more than 10h/month
        self.max_monthly_variance_senior = 15  # For seniors, a slightly higher variance is allowed

        # Generate date collections
        self.all_dates = self._generate_dates()
        self.weekends = self._identify_weekends()
        self.weekdays = set(self.all_dates) - self.weekends
        
        # Weights for the objective function
        self.alpha = 1.0   # Weekend/holiday fairness
        self.beta = 2.0    # Monthly workload balance
        # Shift preference penalty is removed.
        self.delta = 10.0  # Senior workload penalty
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

    def _group_by_month(self, date_str: str) -> int:
        """Extract month from date string."""
        d = datetime.date.fromisoformat(date_str)
        return d.month
        
    def _dates_in_month(self, month: int) -> List[str]:
        """Get all dates in a specific month."""
        return [d for d in self.all_dates if self._group_by_month(d) == month]

    # -------------------------------
    # Tabu Search Helper Functions
    # -------------------------------

    def generate_initial_schedule(self) -> Dict[str, Dict[str, List[str]]]:
        """
        Generate an initial schedule.
        For each date and shift, assign the required number of doctors randomly,
        preferring those available and not already assigned on that day.
        """
        doctor_names = [doc["name"] for doc in self.doctors]
        schedule = {}
        for date in self.all_dates:
            schedule[date] = {}
            for shift in self.shifts:
                required = self.shift_requirements[shift]
                candidates = [d for d in doctor_names if self._is_doctor_available(d, date, shift)]
                already_assigned = set()
                for s in self.shifts:
                    if s in schedule[date]:
                        already_assigned.update(schedule[date][s])
                candidates = [d for d in candidates if d not in already_assigned]
                if len(candidates) >= required:
                    assigned = random.sample(candidates, required)
                else:
                    assigned = candidates.copy()
                    while len(assigned) < required:
                        assigned.append(random.choice(doctor_names))
                schedule[date][shift] = assigned
        return schedule

    def objective(self, schedule: Dict[str, Dict[str, List[str]]]) -> float:
        """
        Compute the total penalty cost for a schedule.
        Lower cost indicates fewer constraint violations.
        Note: In this version we do NOT penalize shift preference mismatches,
        so that a preference does not lead to fewer overall hours.
        """
        cost = 0.0
        doctor_names = [doc["name"] for doc in self.doctors]

        # 1. Availability penalty.
        for date in self.all_dates:
            for shift in self.shifts:
                for doctor in schedule[date][shift]:
                    if not self._is_doctor_available(doctor, date, shift):
                        cost += 1000

        # 2. One shift per day penalty.
        for date in self.all_dates:
            assignments = {}
            for shift in self.shifts:
                for doctor in schedule[date][shift]:
                    assignments[doctor] = assignments.get(doctor, 0) + 1
            for count in assignments.values():
                if count > 1:
                    cost += 500 * (count - 1)

        # 3. Rest constraints: penalize a night shift followed by a day or evening shift.
        for i in range(len(self.all_dates) - 1):
            current_date = self.all_dates[i]
            next_date = self.all_dates[i + 1]
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
                    for shift in self.shifts:
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
                    cost += self.beta * (variance_senior - self.max_monthly_variance_senior)
            if junior_hours:
                variance_junior = max(junior_hours) - min(junior_hours)
                if variance_junior > self.max_monthly_variance_junior:
                    cost += self.beta * (variance_junior - self.max_monthly_variance_junior)

        # 6. Weekend/Holiday fairness:
        for doctor in doctor_names:
            wh_hours = 0
            for date in self.all_dates:
                if (date in self.weekends) or (date in self.holidays):
                    for shift in self.shifts:
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
                for shift in self.shifts:
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
        Each move is represented as a tuple: (date, shift, removed_doctor, new_doctor).
        """
        neighbors = []
        doctor_names = [doc["name"] for doc in self.doctors]
        for _ in range(num_moves):
            date = random.choice(self.all_dates)
            shift = random.choice(self.shifts)
            current_assignment = current_schedule[date][shift]
            if not current_assignment:
                continue
            idx = random.randint(0, len(current_assignment) - 1)
            old_doctor = current_assignment[idx]
            doctors_assigned_today = set()
            for s in self.shifts:
                doctors_assigned_today.update(current_schedule[date][s])
            candidates = [d for d in doctor_names if d not in doctors_assigned_today or d == old_doctor]
            candidates = [d for d in candidates if d != old_doctor]
            if not candidates:
                continue
            new_doctor = random.choice(candidates)
            new_schedule = copy.deepcopy(current_schedule)
            new_schedule[date][shift][idx] = new_doctor
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

        current_schedule = self.generate_initial_schedule()
        current_cost = self.objective(current_schedule)
        best_schedule = current_schedule
        best_cost = current_cost

        tabu_list = {}  # Map move (tuple) to expiration iteration
        tabu_tenure = 10
        max_iterations = 500
        no_improve_count = 0
        iteration = 0

        while iteration < max_iterations and no_improve_count < 50:
            iteration += 1
            neighbors = self.get_neighbors(current_schedule, num_moves=20)
            best_neighbor = None
            best_neighbor_cost = float('inf')
            best_move = None

            for neighbor_schedule, move in neighbors:
                move_key = move
                neighbor_cost = self.objective(neighbor_schedule)
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
            else:
                no_improve_count += 1

            if progress_callback and iteration % 10 == 0:
                progress_callback(50 + int(40 * iteration / max_iterations),
                                  f"Iteration {iteration}: Best cost = {best_cost}")

        solution_time = time.time() - start_time

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
            for shift in self.shifts:
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
            for shift in self.shifts:
                if len(schedule[date][shift]) != self.shift_requirements[shift]:
                    coverage_errors += 1

        if progress_callback:
            progress_callback(100, "Optimization complete")

        stats = {
            "status": "Tabu Search completed",
            "solution_time_seconds": solution_time,
            "objective_value": best_cost,
            "coverage_errors": coverage_errors,
            "doctor_shift_counts": doctor_shift_counts,
            "preference_metrics": preference_metrics,
            "weekend_metrics": weekend_metrics,
            "holiday_metrics": holiday_metrics,
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
