#!/usr/bin/env python3
"""
Weight Optimizer for Hospital Staff Scheduler

This module implements a meta-optimizer that searches for the best weights
for the objective function used in the Tabu Search optimization.
"""

import time
import logging
import random
import copy
import datetime
from typing import Dict, List, Any, Tuple, Callable
import concurrent.futures
from collections import defaultdict
import json

# Import the optimizers
from schedule_optimizer import optimize_schedule, ScheduleOptimizer
from monthly_schedule_optimizer import optimize_monthly_schedule, MonthlyScheduleOptimizer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("WeightOptimizer")

class WeightOptimizer:
    """
    Meta-optimizer to find the best weights for the schedule optimization objective function.
    Uses random search to explore the weight parameter space.
    """
    
    def __init__(self, 
                 doctors: List[Dict], 
                 holidays: Dict[str, str],
                 availability: Dict[str, Dict[str, str]],
                 month: int = None,
                 year: int = None,
                 max_iterations: int = 20,
                 parallel_jobs: int = 1,
                 time_limit_minutes: int = 10,
                 shift_template: Dict[str, Dict[str, Dict[str, int]]] = None
                 ):
        """
        Initialize the weight optimizer.
        
        Args:
            doctors: List of doctor dictionaries
            holidays: Dictionary mapping dates to holiday types
            availability: Doctor availability constraints
            month: Specific month to optimize (None for full year)
            year: The year to optimize for
            max_iterations: Maximum number of weight configurations to try
            parallel_jobs: Number of parallel optimization jobs to run
            time_limit_minutes: Time limit in minutes for the optimization
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        
        # Handle the case where month or year might be None or non-integer
        try:
            self.month = int(month) if month is not None else None
            self.year = int(year) if year is not None else None
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid month or year value: month={month}, year={year}. Error: {e}")
            # Default to current month and year if invalid
            current_date = datetime.date.today()
            self.month = self.month if self.month is not None else current_date.month
            self.year = self.year if self.year is not None else current_date.year
            
        logger.info(f"Weight Optimizer initialized with month={self.month}, year={self.year}")
            
        self.max_iterations = max_iterations
        self.parallel_jobs = max(1, min(parallel_jobs, 10))  # Between 1 and 10 jobs
        self.time_limit_seconds = time_limit_minutes * 60
        
        # Track the best configuration found
        self.best_weights = None
        self.best_schedule = None
        self.best_stats = None
        self.best_score = float('inf')
        self.best_hard_violations = float('inf')  # Track hard violations separately
        self.best_soft_score = float('inf')       # Track soft score separately
        self.best_has_monthly_variance = True     # Track monthly variance violations
        self.best_preference_violations = float('inf')  # Track preference violations
        
        # Define weight parameter ranges
        # Format: (min, max, step)
        self.weight_ranges = {
            "w_balance": (100, 10000, 500),           # Monthly balance weight
            "w_wh": (10, 100, 10),                # Weekend/holiday weight
            "w_senior_workload": (500, 10000, 1000),   # Senior workload difference
            "w_pref_junior": (50, 10000, 200),        # Junior preference weight
            "w_pref_senior": (100, 20000, 400),       # Senior preference weight
            "w_preference_fairness": (10, 1000, 100), # Preference fairness weight
            "w_senior_holiday": (100, 999999, 1000)    # Senior working on long holidays
        }
        
        # Fixed weights (not optimized - hard constraints)
        self.fixed_weights = {
            "w_avail": 999999,           # Availability violations
            "w_one_shift": 999999,          # Multiple shifts per day
            "w_rest": 999999,               # Inadequate rest after night shift
            "w_duplicate_penalty": 999999, # Duplicate doctor penalty
            "w_night_day_gap": 999999,
            "w_night_gap": 999999, 
            "w_wrong_pref_night": 999999, # evening/day pref assigned to night
            "w_consec_night": 999999, #consecutive night shifts
            "w_evening_day": 999999
        }
        
        # Track doctors with same preferences for fairness calculations
        self.evening_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Evening Only"]
        self.day_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Day Only"]
        self.night_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Night Only"]
        
        # For monthly optimization, we can also track consecutive shifts more closely
        self.max_consecutive_shifts = 5  # Maximum number of consecutive days a doctor should work
        self.w_consecutive_shifts = 50   # Penalty for exceeding consecutive shift limit
        
        # Store the shift template
        self.shift_template = shift_template
        if shift_template:
            logger.info(f"Initialized with shift template containing {len(shift_template)} days")

        # Results storage
        self.results = []

    def _get_random_weights(self) -> Dict[str, Any]:
        """Generate a random set of weights within the defined ranges."""
        weights = copy.deepcopy(self.fixed_weights)
        
        for param, (min_val, max_val, step) in self.weight_ranges.items():
            if step == 1:
                # For integer parameters
                weights[param] = random.randint(min_val, max_val)
            else:
                # For parameters with specific steps
                steps = list(range(min_val, max_val + 1, step))
                weights[param] = random.choice(steps)
        
        # Special handling for preference weights dictionary
        weights["w_pref"] = {
            "Junior": weights.pop("w_pref_junior"),
            "Senior": weights.pop("w_pref_senior")
        }
        
        return weights

    def _calculate_score(self, schedule: Dict, stats: Dict) -> Tuple[float, int, float]:
        """
        Calculate a hierarchical score to evaluate how well the constraints are satisfied.
        - First priority: No hard constraint violations (absolute requirement)
        - Second priority: Minimize soft constraint violations
        
        Args:
            schedule: The generated schedule
            stats: Schedule statistics
            
        Returns:
            Tuple of (total_score, hard_violations, soft_score)
        """
        # PART 1: Check for hard constraint violations
        hard_violations = 0
        hard_violation_details = []
        
        # 1a. Availability violations (hard constraint)
        avail_violations = stats.get("availability_violations", 0)
        hard_violations += avail_violations
        if avail_violations > 0:
            hard_violation_details.append(f"Availability violations: {avail_violations}")
        
        # 1b. Duplicate doctors (hard constraint)
        duplicate_doctors = stats.get("duplicate_doctors", 0)
        hard_violations += duplicate_doctors
        if duplicate_doctors > 0:
            hard_violation_details.append(f"Duplicate doctors: {duplicate_doctors}")
        
        # 1c. Coverage errors - now using our template-aware method
        coverage_errors = self._check_coverage_errors(schedule)
        hard_violations += coverage_errors
        if coverage_errors > 0:
            hard_violation_details.append(f"Coverage errors: {coverage_errors}")
        
        # 1d. Check for Night shift followed by Day/Evening shift (hard constraint)
        night_followed_violations = self._check_night_followed_by_work(schedule)
        hard_violations += night_followed_violations
        if night_followed_violations > 0:
            hard_violation_details.append(f"Night shift followed by work: {night_followed_violations}")
        
        # 1e. Check for Evening to Day shift pattern (hard constraint)
        evening_to_day_violations = self._check_evening_to_day(schedule)
        hard_violations += evening_to_day_violations
        if evening_to_day_violations > 0:
            hard_violation_details.append(f"Evening to Day shift: {evening_to_day_violations}")
        
        # 1f. Check for seniors working on long holidays (hard constraint)
        senior_holiday_violations = self._check_senior_on_long_holiday(schedule)
        hard_violations += senior_holiday_violations
        if senior_holiday_violations > 0:
            hard_violation_details.append(f"Senior on long holiday: {senior_holiday_violations}")
        
        # 1g. Check if seniors work more hours than juniors (hard constraint)
        senior_more_hours = self._check_senior_more_hours(stats)
        hard_violations += senior_more_hours
        if senior_more_hours > 0:
            hard_violation_details.append("Seniors working more hours than juniors")
        
        # 1h. Check if seniors have more weekend/holiday hours (hard constraint)
        senior_more_wh = self._check_senior_more_weekend_holiday(stats)
        hard_violations += senior_more_wh
        if senior_more_wh > 0:
            hard_violation_details.append("Seniors with more weekend/holiday hours than juniors")
        
        # 1i. Check for consecutive night shifts (hard constraint)
        consecutive_night_violations = self._check_consecutive_night_shifts(schedule)
        hard_violations += consecutive_night_violations
        if consecutive_night_violations > 0:
            hard_violation_details.append(f"Consecutive night shifts: {consecutive_night_violations}")

        # 1j. Check for Day/Evening preference doctors assigned to Night shifts (hard constraint)
        day_evening_to_night_violations = self._check_day_evening_to_night(schedule)
        hard_violations += day_evening_to_night_violations
        if day_evening_to_night_violations > 0:
            hard_violation_details.append(f"Day/Evening pref assigned to Night shifts: {day_evening_to_night_violations}")
        
        # PART 2: Calculate soft constraint score
        soft_score, _, _ = self._calculate_soft_score(schedule, stats)
        
        # If any hard constraints are violated, return a very high score
        if hard_violations > 0:
            logger.info(f"Hard constraint violations: {hard_violations} - {hard_violation_details}")
        else:
            logger.info(f"No hard constraint violations!")
            logger.info(f"Soft score: {soft_score:.2f}")
            
        # Return tuple of (total_score, hard_violations, soft_score)
        # This helps track and compare solutions more accurately
        if hard_violations > 0:
            # Hard violations make the total score very high
            total_score = 1000000.0 + hard_violations
        else:
            # No hard violations, score is just the soft score
            total_score = soft_score
            
        return (total_score, hard_violations, soft_score)
    
    def _check_coverage_errors(self, schedule: Dict) -> int:
        """
        Check for coverage errors while respecting the shift template.
        Only counts as an error if a required shift (according to template) is not properly staffed.
        
        Args:
            schedule: The schedule to check
            
        Returns:
            Number of coverage errors
        """
        coverage_errors = 0
        
        # Default shift requirements if not using template
        default_shift_requirements = {"Day": 2, "Evening": 1, "Night": 2}
        
        # Get a list of dates to check - filtered by month if monthly optimization
        dates_to_check = []
        for date in schedule.keys():
            # Skip if not in the target month for monthly optimization
            if self.month is not None:
                d_date = datetime.date.fromisoformat(date)
                if d_date.month != self.month:
                    continue
                # Also check year if it's provided
                if self.year is not None and d_date.year != self.year:
                    continue
            dates_to_check.append(date)
        
        # Check each date
        for date in dates_to_check:
            # Determine which shifts should be present on this date according to template
            expected_shifts = {}
            
            # If we have a shift template and this date is in it, use that
            if hasattr(self, 'shift_template') and self.shift_template and date in self.shift_template:
                for shift, shift_data in self.shift_template[date].items():
                    slots = shift_data.get('slots', 0)
                    # Only include shifts with slots > 0
                    if slots > 0:
                        expected_shifts[shift] = slots
            else:
                # Otherwise use default requirements
                expected_shifts = default_shift_requirements
            
            # Check that all expected shifts are in the schedule with the right number of doctors
            for shift, required in expected_shifts.items():
                # Check if shift exists in schedule
                if shift not in schedule.get(date, {}):
                    coverage_errors += 1
                    continue
                
                # Check if enough doctors are assigned
                assigned = len(schedule[date][shift])
                if assigned != required:
                    coverage_errors += 1
        
        return coverage_errors

    def _calculate_soft_score(self, schedule: Dict, stats: Dict) -> Tuple[float, bool, int]:
        """
        Calculate soft constraint scores with a hierarchy.
        
        Args:
            schedule: The schedule to evaluate
            stats: The statistics for the schedule
            
        Returns:
            Tuple of (total_soft_score, has_monthly_variance_violation, preference_violations_count)
        """
        # Initialize counters
        has_monthly_variance_violation = False
        preference_violations_count = 0
        
        # 1. Monthly balance (soft constraint, higher priority)
        monthly_variance_score = 0.0
        monthly_stats = stats.get("monthly_stats", {})
        for month_key, month_stats in monthly_stats.items():
            # Convert month key to int if needed
            month_int = int(month_key) if isinstance(month_key, str) else month_key
            
            # Specific month filter for monthly optimization
            if self.month is not None and month_int != self.month:
                continue
                
            # Check if max - min > 10 hours (monthly balance constraint)
            variance = float(month_stats.get("max", 0)) - float(month_stats.get("min", 0))
            if variance > 10.0:
                has_monthly_variance_violation = True
                monthly_variance_score += (variance - 10.0) ** 2
        
        # 2. Preference satisfaction (soft constraint, lower priority)
        preference_score = 0.0
        preference_metrics = stats.get("preference_metrics", {})
        
        for doctor, metrics in preference_metrics.items():
            if metrics.get("preference") != "None":
                # Calculate preference violations
                other = int(metrics.get("other_shifts", 0))
                preference_violations_count += other
                
                # Calculate percentage of preferred shifts
                preferred = float(metrics.get("preferred_shifts", 0))
                total = preferred + float(other)
                
                if total > 0:
                    percentage = preferred / total
                    if percentage < 1.0:  # If not 100% preference satisfaction
                        # Penalize based on how far from 100% preference satisfaction
                        preference_score += (1.0 - percentage) * 50.0
        
        # Calculate total soft score (still needed for comparing solutions with same category)
        total_soft_score = monthly_variance_score + preference_score
        
        # Log detailed information about soft constraints
        if has_monthly_variance_violation:
            logger.info(f"Monthly variance violation detected. Score: {monthly_variance_score:.2f}")
        else:
            logger.info(f"No monthly variance violation.")
            
        logger.info(f"Preference violations: {preference_violations_count}. Score: {preference_score:.2f}")
        logger.info(f"Total soft score: {total_soft_score:.2f}")
        
        return (total_soft_score, has_monthly_variance_violation, preference_violations_count)

    def _is_better_solution(self, new_hard, new_monthly, new_pref, new_soft, 
                       current_hard, current_monthly, current_pref, current_soft) -> bool:
        """
        Determine if the new solution is better according to our hierarchy:
        1. No hard violations (highest priority)
        2. No monthly variance > 10h (next priority)
        3. Minimum preference violations (next priority)
        4. Lower overall soft score (for solutions equal in above)
        
        Args:
            new_hard: Hard violations in new solution
            new_monthly: Whether new solution has monthly variance violation
            new_pref: Preference violations in new solution
            new_soft: Overall soft score for new solution
            current_hard, current_monthly, current_pref, current_soft: Same for current best
            
        Returns:
            True if the new solution is better, False otherwise
        """
        # 1. First priority: minimize hard constraint violations
        if new_hard < current_hard:
            return True
        elif new_hard > current_hard:
            return False
        
        # 2. If hard violations are equal, check monthly variance
        if not new_monthly and current_monthly:
            return True  # New solution has no monthly variance violation but current does
        elif new_monthly and not current_monthly:
            return False  # Current solution has no monthly variance violation but new does
        
        # 3. If both have same monthly variance status, compare preference violations
        if new_pref < current_pref:
            return True
        elif new_pref > current_pref:
            return False
        
        # 4. If all above are equal, compare overall soft score
        return new_soft < current_soft

    def _check_night_followed_by_work(self, schedule: Dict) -> int:
        """Check for doctors working the day after a night shift."""
        violations = 0
        
        # Get all dates in chronological order
        dates = sorted(schedule.keys())
        
        # Filter dates by month AND year if monthly optimization
        if self.month is not None:
            if self.year is not None:
                # Filter by both month and year
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month and 
                                              datetime.date.fromisoformat(d).year == self.year]
            else:
                # If year is None, just filter by month
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month]
        
        for i in range(len(dates) - 1):
            current_date = dates[i]
            next_date = dates[i + 1]
            
            # Check if current date has Night shift
            if "Night" not in schedule.get(current_date, {}):
                continue
            
            # Check if next date has any shift
            if next_date not in schedule:
                continue
            
            # For each doctor working Night shift on current date
            for doctor in schedule[current_date]["Night"]:
                # Check if they work Day or Evening shift the next day
                if ("Day" in schedule[next_date] and doctor in schedule[next_date]["Day"]) or \
                   ("Evening" in schedule[next_date] and doctor in schedule[next_date]["Evening"]):
                    violations += 1
        
        return violations

    def _check_evening_to_day(self, schedule: Dict) -> int:
        """Check for doctors working Day shift right after Evening shift."""
        violations = 0
        
        # Get all dates in chronological order
        dates = sorted(schedule.keys())
        
        # Filter dates by month AND year if monthly optimization
        if self.month is not None:
            if self.year is not None:
                # Filter by both month and year
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month and 
                                              datetime.date.fromisoformat(d).year == self.year]
            else:
                # If year is None, just filter by month
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month]
        
        for i in range(len(dates) - 1):
            current_date = dates[i]
            next_date = dates[i + 1]
            
            # Check if current date has Evening shift
            if "Evening" not in schedule.get(current_date, {}):
                continue
            
            # Check if next date has Day shift
            if "Day" not in schedule.get(next_date, {}):
                continue
            
            # For each doctor working Evening shift on current date
            for doctor in schedule[current_date]["Evening"]:
                # Check if they work Day shift the next day
                if doctor in schedule[next_date]["Day"]:
                    violations += 1
        
        return violations

    def _check_senior_on_long_holiday(self, schedule: Dict) -> int:
        """Check for senior doctors working on long holidays."""
        violations = 0
        
        # Get senior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        
        # Check each long holiday
        for date, holiday_type in self.holidays.items():
            # Skip if not a long holiday or not in target month
            if holiday_type != "Long" or date not in schedule:
                continue
                
            # Skip if not in the target month (and year if provided) for monthly optimization
            if self.month is not None:
                d_date = datetime.date.fromisoformat(date)
                if d_date.month != self.month:
                    continue
                # Only check year if it's not None
                if self.year is not None and d_date.year != self.year:
                    continue
            
            for shift in ["Day", "Evening", "Night"]:
                if shift not in schedule[date]:
                    continue
                
                for doctor in schedule[date][shift]:
                    if doctor in senior_doctors:
                        violations += 1
        
        return violations

    def _check_senior_more_hours(self, stats: Dict) -> int:
        """
        Check if senior doctors work more hours than junior doctors.
        This method is more strict to match exactly what the UI displays.
        """
        monthly_hours = stats.get("monthly_hours", {})
        
        # Get lists of senior and junior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # Extra logging
        logger.info(f"Checking senior hours violation. Seniors: {len(senior_doctors)}, Juniors: {len(junior_doctors)}")

        # For each month, check if seniors work more than juniors on average
        for month in range(1, 13):
            if self.month is not None and month != self.month:
                continue
            
            # Calculate average hours for each group
            senior_hours = [float(monthly_hours.get(doc, {}).get(month, 0)) for doc in senior_doctors]
            junior_hours = [float(monthly_hours.get(doc, {}).get(month, 0)) for doc in junior_doctors]
            
            # Skip if no data
            if not senior_hours or not junior_hours or sum(senior_hours) == 0 or sum(junior_hours) == 0:
                continue
            
            avg_senior = sum(senior_hours) / len(senior_hours)
            avg_junior = sum(junior_hours) / len(junior_hours)
            
            # Use a very small threshold to ensure we catch ANY case where seniors work more
            # This is to match the UI's exact calculation
            if avg_senior >= avg_junior - 0.001:  # If senior average is greater OR almost equal (floating point safety)
                logger.warning(f"HARD CONSTRAINT VIOLATION: Seniors working more than juniors in month {month}")
                logger.warning(f"Senior avg: {avg_senior:.2f}, Junior avg: {avg_junior:.2f}, Diff: {avg_senior - avg_junior:.2f}")
                return 1
                
            logger.info(f"Month {month}: Senior avg: {avg_senior:.2f}, Junior avg: {avg_junior:.2f}, Diff: {avg_junior - avg_senior:.2f}")
        
        logger.info("No senior hours violations found!")
        return 0

    def _verify_no_senior_hour_violations(self, schedule, stats):
        """Verify that seniors don't work more hours than juniors using exact criteria."""
        monthly_hours = stats.get("monthly_hours", {})
        
        # Get lists of senior and junior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        for month in range(1, 13):
            if self.month is not None and month != self.month:
                continue
            
            # Calculate average hours for each group
            senior_hours = [float(monthly_hours.get(doc, {}).get(month, 0)) for doc in senior_doctors]
            junior_hours = [float(monthly_hours.get(doc, {}).get(month, 0)) for doc in junior_doctors]
            
            # Skip if no data
            if not senior_hours or not junior_hours or sum(senior_hours) == 0 or sum(junior_hours) == 0:
                continue
            
            avg_senior = sum(senior_hours) / len(senior_hours)
            avg_junior = sum(junior_hours) / len(junior_hours)
            
            # If seniors work even slightly more hours than juniors, it's a violation
            if avg_senior >= avg_junior - 0.001:
                return False
        
        return True

    def _check_senior_more_weekend_holiday(self, stats: Dict) -> int:
        """Check if senior doctors have more weekend/holiday hours than junior doctors."""
        weekend_metrics = stats.get("weekend_metrics", {})
        holiday_metrics = stats.get("holiday_metrics", {})
        
        # Get lists of senior and junior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # Calculate weekend/holiday hours for each group
        senior_wh_hours = 0
        junior_wh_hours = 0
        senior_count = 0
        junior_count = 0
        
        for doctor in senior_doctors:
            if doctor in weekend_metrics or doctor in holiday_metrics:
                senior_wh_hours += (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0)) * 8
                senior_count += 1
        
        for doctor in junior_doctors:
            if doctor in weekend_metrics or doctor in holiday_metrics:
                junior_wh_hours += (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0)) * 8
                junior_count += 1
        
        # Skip if no data
        if senior_count == 0 or junior_count == 0:
            return 0
        
        # Calculate averages
        avg_senior_wh = senior_wh_hours / senior_count
        avg_junior_wh = junior_wh_hours / junior_count
        
        # Return violation if seniors have more weekend/holiday hours
        if avg_senior_wh > avg_junior_wh:
            return 1
        
        return 0

    def _check_consecutive_night_shifts(self, schedule: Dict) -> int:
        """Check for doctors working consecutive night shifts."""
        violations = 0
        
        # Get all dates in chronological order
        dates = sorted(schedule.keys())
        
        # Filter dates by month AND year if monthly optimization
        if self.month is not None:
            if self.year is not None:
                # Filter by both month and year
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month and 
                                              datetime.date.fromisoformat(d).year == self.year]
            else:
                # If year is None, just filter by month
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month]
        
        for i in range(len(dates) - 1):
            current_date = dates[i]
            next_date = dates[i + 1]
            
            # Check if both dates have Night shift
            if "Night" not in schedule.get(current_date, {}) or "Night" not in schedule.get(next_date, {}):
                continue
            
            # Check for doctors working both nights
            for doctor in schedule[current_date]["Night"]:
                if doctor in schedule[next_date]["Night"]:
                    violations += 1
        
        return violations
    
    def _check_day_evening_to_night(self, schedule: Dict) -> int:
        """Check for doctors with Day/Evening preference assigned to Night shifts."""
        violations = 0
        
        # Get all dates in chronological order
        dates = sorted(schedule.keys())
        
        # Filter dates by month AND year if monthly optimization
        if self.month is not None:
            if self.year is not None:
                # Filter by both month and year
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month and 
                                            datetime.date.fromisoformat(d).year == self.year]
            else:
                # If year is None, just filter by month
                dates = [d for d in dates if datetime.date.fromisoformat(d).month == self.month]
        
        for date in dates:
            # Skip if no Night shift on this date
            if not schedule.get(date, {}).get("Night"):
                continue
            
            for doctor in schedule[date]["Night"]:
                # Get doctor's preference
                pref = None
                for doc in self.doctors:
                    if doc["name"] == doctor:
                        pref = doc.get("pref", "None")
                        break
                
                # Check if doctor has Day Only or Evening Only preference
                if pref in ["Day Only", "Evening Only"]:
                    violations += 1
        
        return violations

    def _evaluate_weights(self, weights: Dict[str, Any], iteration: int) -> Tuple[Dict[str, Any], Dict, Dict, float, int, float, bool, int]:
        """
        Evaluate a specific set of weights by running the optimizer and measuring constraint satisfaction.
        
        Args:
            weights: Dictionary of weight parameters
            iteration: Current iteration number for progress tracking
            
        Returns:
            Tuple of (weights, schedule, statistics, total_score, hard_violations, soft_score, 
                     has_monthly_variance, preference_violations)
        """
        start_time = time.time()
        
        # Create custom progress callback
        def progress_callback(progress: int, message: str):
            if progress % 20 == 0:  # Only log occasionally to reduce verbosity
                logger.info(f"Iteration {iteration}, Progress: {progress}%, {message}")
        
        # Run either monthly or yearly optimizer based on whether month is specified
        if self.month is not None:
            # Log the parameters for debugging
            logger.info(f"Creating MonthlyScheduleOptimizer with month={self.month}, year={self.year}")
            
            try:
                # Create instance with default settings first
                optimizer = MonthlyScheduleOptimizer(
                    self.doctors,
                    self.holidays,
                    self.availability,
                    self.month,
                    self.year
                )
            except Exception as e:
                logger.error(f"Error creating MonthlyScheduleOptimizer: {e}")
                # Re-raise the exception
                raise
            
            # Set shift template if available
            if hasattr(self, 'shift_template') and self.shift_template:
                # Make sure to copy the shift template to avoid modifications
                optimizer.shift_template = copy.deepcopy(self.shift_template)
                logger.info(f"Applied shift template with {len(self.shift_template)} days to optimizer")
            
            # Override weights
            for key, value in weights.items():
                if hasattr(optimizer, key):
                    setattr(optimizer, key, value)
            
            schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        else:
            # Create instance with default settings first
            optimizer = ScheduleOptimizer(
                self.doctors,
                self.holidays,
                self.availability
            )

            # Set shift template if available
            if hasattr(self, 'shift_template') and self.shift_template:
                # Make sure to copy the shift template to avoid modifications
                optimizer.shift_template = copy.deepcopy(self.shift_template)
                logger.info(f"Applied shift template with {len(self.shift_template)} days to optimizer")
                        
            # Override weights
            for key, value in weights.items():
                if hasattr(optimizer, key):
                    setattr(optimizer, key, value)
            
            schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        
        # Calculate a score for this configuration 
        total_score, hard_violations, soft_score = self._calculate_score(schedule, stats)
        
        # Calculate detailed soft constraint metrics
        soft_score, has_monthly_variance, preference_violations = self._calculate_soft_score(schedule, stats)
        
        elapsed = time.time() - start_time
        logger.info(f"Iteration {iteration} completed in {elapsed:.2f}s with score {total_score:.2f} "
              f"(hard violations: {hard_violations}, monthly variance: {has_monthly_variance}, "
              f"preference violations: {preference_violations})")
        
        return (weights, schedule, stats, total_score, hard_violations, soft_score, 
                has_monthly_variance, preference_violations)

    def optimize(self, progress_callback: Callable = None) -> Dict[str, Any]:
        """
        Run the meta-optimization to find the best weights.
        
        Args:
            progress_callback: Function to report progress
            
        Returns:
            Dictionary with the best weights, schedule, and statistics
        """
        start_time = time.time()
        logger.info(f"Starting weight optimization with {self.max_iterations} iterations, "
                  f"{self.time_limit_seconds//60} minute time limit")
        
        if progress_callback:
            progress_callback(0, "Starting weight optimization...")
        
        # Run optimization with different weights
        if self.parallel_jobs > 1:
            # Parallel execution
            self._optimize_parallel(progress_callback)
        else:
            # Sequential execution
            self._optimize_sequential(progress_callback)
            
        solution_time = time.time() - start_time
        logger.info(f"Weight optimization completed in {solution_time:.2f}s")
        logger.info(f"Best score: {self.best_score:.2f} (hard violations: {self.best_hard_violations}, "
                   f"monthly variance: {self.best_has_monthly_variance}, "
                   f"preference violations: {self.best_preference_violations})")
        
        # Verify the best solution doesn't have hard constraint violations
        if self.best_hard_violations > 0:
            logger.warning("WARNING: Best solution still has hard constraint violations!")
            logger.warning("Hard constraint violations: " + str(self.best_hard_violations))
        
        if progress_callback:
            progress_callback(100, "Weight optimization complete")
            
        # Sort results by hierarchy: hard violations, monthly variance, preference violations
        sorted_results = sorted(
            self.results, 
            key=lambda x: (
                x.get("hard_violations", float('inf')), 
                1 if x.get("has_monthly_variance", True) else 0,
                x.get("preference_violations", float('inf')),
                x.get("soft_score", float('inf'))
            )
        )
        
        result = {
            "schedule": self.best_schedule,
            "statistics": self.best_stats,
            "weights": self.best_weights,
            "score": self.best_score,
            "hard_violations": self.best_hard_violations,
            "has_monthly_variance": self.best_has_monthly_variance,
            "preference_violations": self.best_preference_violations,
            "soft_score": self.best_soft_score,
            "all_results": sorted_results[:10],  # Return top 10 results
            "iterations_completed": len(self.results),
            "solution_time_seconds": solution_time
        }
        
        return result
    
    def _optimize_sequential(self, progress_callback: Callable = None):
        """Run optimization sequentially with time and iteration limits."""
        start_time = time.time()
        iteration = 0
        
        # Initialize tracking for best solution with soft constraint hierarchy
        self.best_hard_violations = float('inf')
        self.best_has_monthly_variance = True
        self.best_preference_violations = float('inf')
        self.best_soft_score = float('inf')
        
        while (iteration < self.max_iterations and 
               time.time() - start_time < self.time_limit_seconds):
            
            iteration += 1
            
            # Generate random weights
            weights = self._get_random_weights()
                
            # Evaluate this weight configuration
            current_weights, schedule, stats, total_score, hard_violations, soft_score, \
            has_monthly_variance, preference_violations = self._evaluate_weights(weights, iteration)
            
            # Store results
            self.results.append({
                "weights": copy.deepcopy(current_weights),
                "score": total_score,
                "hard_violations": hard_violations,
                "has_monthly_variance": has_monthly_variance,
                "preference_violations": preference_violations,
                "soft_score": soft_score,
                "stats": {
                    "availability_violations": stats.get("availability_violations", 0),
                    "duplicate_doctors": stats.get("duplicate_doctors", 0),
                    "coverage_errors": stats.get("coverage_errors", 0),
                    "objective_value": stats.get("objective_value", 0)
                }
            })
            
            # Update best if improved
            if self._is_better_solution(
                hard_violations, has_monthly_variance, preference_violations, soft_score,
                self.best_hard_violations, self.best_has_monthly_variance, 
                self.best_preference_violations, self.best_soft_score
            ):
                logger.info(f"New best solution! Score: {total_score:.2f} (was {self.best_score:.2f})")
                logger.info(f"Hard violations: {hard_violations} (was {self.best_hard_violations}), "
                           f"Monthly variance: {has_monthly_variance} (was {self.best_has_monthly_variance}), "
                           f"Preference violations: {preference_violations} (was {self.best_preference_violations})")
                
                self.best_score = total_score
                self.best_hard_violations = hard_violations
                self.best_has_monthly_variance = has_monthly_variance
                self.best_preference_violations = preference_violations
                self.best_soft_score = soft_score
                self.best_weights = copy.deepcopy(current_weights)
                self.best_schedule = copy.deepcopy(schedule)
                self.best_stats = copy.deepcopy(stats)
                
            # Report progress
            if progress_callback:
                elapsed_time = time.time() - start_time
                time_percent = min(100, int(100 * elapsed_time / self.time_limit_seconds))
                iter_percent = int(100 * iteration / self.max_iterations)
                progress = max(time_percent, iter_percent)
                
                status_msg = f"Iteration {iteration}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                if self.best_hard_violations > 0:
                    status_msg += f" (WARNING: {self.best_hard_violations} hard violations!)"
                elif self.best_has_monthly_variance:
                    status_msg += f" (Monthly variance > 10h, Preference violations: {self.best_preference_violations})"
                else:
                    status_msg += f" (No hard/monthly violations, Preference violations: {self.best_preference_violations})"
                
                progress_callback(progress, status_msg)
    
    def _optimize_parallel(self, progress_callback: Callable = None):
        """Run optimization in parallel using ProcessPoolExecutor with time and iteration limits."""
        start_time = time.time()
        max_workers = self.parallel_jobs
        
        # Generate all weight configurations first
        weight_configs = []
        
        for i in range(self.max_iterations):
            weights = self._get_random_weights()
            weight_configs.append((weights, i + 1))
        
        # Track iterations completed
        completed = 0
        active_futures = set()
        
        # Initialize tracking for best solution with soft constraint hierarchy
        self.best_hard_violations = float('inf')
        self.best_has_monthly_variance = True
        self.best_preference_violations = float('inf')
        self.best_soft_score = float('inf')
        
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            while (completed < self.max_iterations and 
                   time.time() - start_time < self.time_limit_seconds and
                   weight_configs):
                
                # Submit new tasks if we have capacity and configs left
                while len(active_futures) < max_workers and weight_configs:
                    weights, i = weight_configs.pop(0)
                    future = executor.submit(self._evaluate_weights, weights, i)
                    active_futures.add(future)
                
                # Wait for any future to complete
                done, active_futures = concurrent.futures.wait(
                    active_futures, 
                    timeout=1,
                    return_when=concurrent.futures.FIRST_COMPLETED
                )
                
                # Process completed futures
                for future in done:
                    try:
                        current_weights, schedule, stats, total_score, hard_violations, soft_score, \
                        has_monthly_variance, preference_violations = future.result()
                        
                        completed += 1
                        
                        # Store results
                        self.results.append({
                            "weights": copy.deepcopy(current_weights),
                            "score": total_score,
                            "hard_violations": hard_violations,
                            "has_monthly_variance": has_monthly_variance,
                            "preference_violations": preference_violations,
                            "soft_score": soft_score,
                            "stats": {
                                "availability_violations": stats.get("availability_violations", 0),
                                "duplicate_doctors": stats.get("duplicate_doctors", 0),
                                "coverage_errors": stats.get("coverage_errors", 0),
                                "objective_value": stats.get("objective_value", 0)
                            }
                        })
                        
                        # Update best if improved
                        if self._is_better_solution(
                            hard_violations, has_monthly_variance, preference_violations, soft_score,
                            self.best_hard_violations, self.best_has_monthly_variance, 
                            self.best_preference_violations, self.best_soft_score
                        ):
                            logger.info(f"New best solution! Score: {total_score:.2f} (was {self.best_score:.2f})")
                            logger.info(f"Hard violations: {hard_violations} (was {self.best_hard_violations}), "
                                       f"Monthly variance: {has_monthly_variance} (was {self.best_has_monthly_variance}), "
                                       f"Preference violations: {preference_violations} (was {self.best_preference_violations})")
                            
                            self.best_score = total_score
                            self.best_hard_violations = hard_violations
                            self.best_has_monthly_variance = has_monthly_variance
                            self.best_preference_violations = preference_violations
                            self.best_soft_score = soft_score
                            self.best_weights = copy.deepcopy(current_weights)
                            self.best_schedule = copy.deepcopy(schedule)
                            self.best_stats = copy.deepcopy(stats)
                            
                    except Exception as exc:
                        logger.error(f"Iteration generated an exception: {exc}")
                        completed += 1
                
                # Report progress
                if progress_callback:
                    elapsed_time = time.time() - start_time
                    time_percent = min(100, int(100 * elapsed_time / self.time_limit_seconds))
                    iter_percent = int(100 * completed / self.max_iterations)
                    progress = max(time_percent, iter_percent)
                    
                    status_msg = f"Completed {completed}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                    if self.best_hard_violations > 0:
                        status_msg += f" (WARNING: {self.best_hard_violations} hard violations!)"
                    elif self.best_has_monthly_variance:
                        status_msg += f" (Monthly variance > 10h, Preference violations: {self.best_preference_violations})"
                    else:
                        status_msg += f" (No hard/monthly violations, Preference violations: {self.best_preference_violations})"
                    
                    progress_callback(progress, status_msg)
            
            # Cancel any remaining futures if we hit time limit
            for future in active_futures:
                future.cancel()


def optimize_weights(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """
    Main function to optimize the weights for the schedule optimizer.
    
    Args:
        data: Dictionary containing doctors, holidays, availability, and meta-optimization parameters
        progress_callback: Optional function to report progress
        
    Returns:
        Dictionary with the best weights, schedule, and statistics
    """
    try:
        doctors = data.get("doctors", [])
        holidays = data.get("holidays", {})
        availability = data.get("availability", {})
        month = data.get("month")
        year = data.get("year")
        
        # Log the received data for debugging
        logger.info(f"optimize_weights received: month={month}, year={year}")
        
        # Ensure month and year are integers if provided
        if month is not None:
            try:
                month = int(month)
            except (ValueError, TypeError):
                logger.warning(f"Invalid month value: {month}, using current month")
                month = datetime.date.today().month
                
        if year is not None:
            try:
                year = int(year)
            except (ValueError, TypeError):
                logger.warning(f"Invalid year value: {year}, using current year")
                year = datetime.date.today().year
        else:
            # If year is None, set it to current year as a fallback
            year = datetime.date.today().year
            logger.info(f"Year was None, using current year: {year}")
        
        # Meta-optimization parameters
        max_iterations = data.get("max_iterations", 20)
        parallel_jobs = data.get("parallel_jobs", 1)
        time_limit_minutes = data.get("time_limit_minutes", 10)
        
        # Extract shift template from data
        shift_template = data.get('shift_template', {})

        # Filter the template if provided to only include dates in the target month and year
        filtered_template = {}
        if shift_template and isinstance(shift_template, dict) and len(shift_template) > 0:
            for date, shifts in shift_template.items():
                # Skip metadata or non-date entries
                if date == '_metadata' or not isinstance(date, str):
                    continue
                    
                try:
                    date_obj = datetime.date.fromisoformat(date)
                    if date_obj.month == month and date_obj.year == year:
                        filtered_template[date] = shifts
                except (ValueError, TypeError):
                    # Skip invalid dates
                    continue
            
            if filtered_template:
                logger.info(f"Filtered shift template to {len(filtered_template)} days for month {month}, year {year}")
                if progress_callback:
                    progress_callback(5, f"Using template with {len(filtered_template)} days")

        # Create and run the weight optimizer with the filtered template
        optimizer = WeightOptimizer(
            doctors=doctors,
            holidays=holidays,
            availability=availability,
            month=month,
            year=year,
            max_iterations=max_iterations,
            parallel_jobs=parallel_jobs,
            time_limit_minutes=time_limit_minutes,
            shift_template=filtered_template  # Pass the filtered template here
        )
        
        # Initialize additional tracking for soft constraint hierarchy
        optimizer.best_has_monthly_variance = True
        optimizer.best_preference_violations = float('inf')
        
        result = optimizer.optimize(progress_callback=progress_callback)
        
        # First verification: Check for any hard violations
        has_issues = result["hard_violations"] > 0
        
        # Second verification: Specifically check for senior hours violation even if no hard violations reported
        if not has_issues:
            if not optimizer._verify_no_senior_hour_violations(result["schedule"], result["statistics"]):
                logger.warning("Final verification found senior hour violations despite zero hard violations reported!")
                has_issues = True
        
        # If we found any issues, look for better solutions in all our results
        if has_issues:
            logger.warning("Looking for alternative solutions without violations...")
            
            # Find solutions with no hard violations
            solutions_without_hard_violations = []
            
            for result_item in optimizer.results:
                weights = result_item.get("weights")
                if not weights:
                    continue
                
                # Skip solutions with known hard violations
                if result_item.get("hard_violations", float('inf')) > 0:
                    continue
                
                try:
                    # Create an optimizer instance with these weights
                    if month is not None:
                        # Log parameters for debugging
                        logger.info(f"Creating alternative MonthlyScheduleOptimizer with month={month}, year={year}")
                        
                        # For monthly optimization
                        optimizer_instance = MonthlyScheduleOptimizer(
                            doctors,
                            holidays,
                            availability,
                            month,
                            year  # Make sure we pass the year parameter here
                        )
                except Exception as e:
                    logger.error(f"Error creating alternative optimizer: {e}")
                    continue
                else:
                    # For yearly optimization
                    optimizer_instance = ScheduleOptimizer(
                        doctors,
                        holidays,
                        availability
                    )
                
                # Apply the weights
                for key, value in weights.items():
                    if hasattr(optimizer_instance, key):
                        setattr(optimizer_instance, key, value)
                
                # Generate the schedule
                try:
                    schedule, stats = optimizer_instance.optimize()
                    
                    # Check for any hard violations using our enhanced methods
                    hard_violations = 0
                    
                    # Check specifically for senior hour violations
                    has_senior_violation = not optimizer._verify_no_senior_hour_violations(schedule, stats)
                    if has_senior_violation:
                        hard_violations += 1
                    
                    # Check other hard violations
                    hard_violations += stats.get("availability_violations", 0)
                    hard_violations += stats.get("duplicate_doctors", 0)
                    hard_violations += stats.get("coverage_errors", 0)
                    hard_violations += optimizer._check_night_followed_by_work(schedule)
                    hard_violations += optimizer._check_evening_to_day(schedule)
                    hard_violations += optimizer._check_senior_on_long_holiday(schedule)
                    hard_violations += optimizer._check_consecutive_night_shifts(schedule)
                    hard_violations += optimizer._check_senior_more_weekend_holiday(schedule)
                    
                    # Only include if NO hard violations
                    if hard_violations == 0:
                        # Calculate soft constraint metrics
                        soft_score, has_monthly_variance, preference_violations = optimizer._calculate_soft_score(schedule, stats)
                        
                        solutions_without_hard_violations.append({
                            "weights": weights,
                            "schedule": schedule,
                            "stats": stats,
                            "soft_score": soft_score,
                            "has_monthly_variance": has_monthly_variance,
                            "preference_violations": preference_violations
                        })
                        
                        logger.info(f"Found a solution with no hard violations - "
                                   f"Monthly variance: {has_monthly_variance}, "
                                   f"Preference violations: {preference_violations}, "
                                   f"Soft score: {soft_score:.2f}")
                except Exception as e:
                    logger.error(f"Error evaluating solution: {e}")
                    continue
            
            # If we found solutions without hard violations, select the best one
            if solutions_without_hard_violations:
                # First, prioritize solutions without monthly variance
                solutions_without_monthly_variance = [
                    s for s in solutions_without_hard_violations 
                    if not s["has_monthly_variance"]
                ]
                
                if solutions_without_monthly_variance:
                    # Sort by preference violations (ascending)
                    solutions_without_monthly_variance.sort(
                        key=lambda x: (x["preference_violations"], x["soft_score"])
                    )
                    best_solution = solutions_without_monthly_variance[0]
                    logger.info(f"Selected best solution with no monthly variance violation and "
                               f"{best_solution['preference_violations']} preference violations")
                else:
                    # If all solutions have monthly variance, sort by preference violations
                    solutions_without_hard_violations.sort(
                        key=lambda x: (x["preference_violations"], x["soft_score"])
                    )
                    best_solution = solutions_without_hard_violations[0]
                    logger.info(f"Selected best solution with {best_solution['preference_violations']} "
                               f"preference violations (all solutions have monthly variance)")
                
                # Update the result
                result["schedule"] = best_solution["schedule"]
                result["statistics"] = best_solution["stats"]
                result["weights"] = best_solution["weights"]
                result["score"] = best_solution["soft_score"]
                result["hard_violations"] = 0
                result["soft_score"] = best_solution["soft_score"]
                result["has_monthly_variance"] = best_solution["has_monthly_variance"]
                result["preference_violations"] = best_solution["preference_violations"]
                
                if progress_callback:
                    status = "Found valid solution with no hard constraints"
                    if not best_solution["has_monthly_variance"]:
                        status += f" and no monthly variance (Preference violations: {best_solution['preference_violations']})"
                    else:
                        status += f" but with monthly variance (Preference violations: {best_solution['preference_violations']})"
                    progress_callback(100, status)
            else:
                logger.warning("Could not find a solution without hard violations!")
                if progress_callback:
                    progress_callback(100, "Warning: Could not find a solution without hard violations!")
        else:
            # No hard violations in the best solution - calculate soft metrics
            soft_score, has_monthly_variance, preference_violations = optimizer._calculate_soft_score(
                result["schedule"], result["statistics"]
            )
            result["has_monthly_variance"] = has_monthly_variance
            result["preference_violations"] = preference_violations
            
            if progress_callback:
                status = "Optimization complete. Solution has no hard violations"
                if not has_monthly_variance:
                    status += f" and no monthly variance (Preference violations: {preference_violations})"
                else:
                    status += f" but has monthly variance (Preference violations: {preference_violations})"
                progress_callback(100, status)
        
        return result
        
    except Exception as e:
        logger.exception("Error in weight optimization")
        return {
            "error": str(e),
            "schedule": {},
            "statistics": {
                "status": "ERROR",
                "error_message": str(e)
            }
        }


if __name__ == "__main__":
    # Simple test with sample data
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
        "availability": {},
        "max_iterations": 5,  # Small number for testing
        "parallel_jobs": 1,
        "time_limit_minutes": 5,
        "month": 1,  # Just optimize January
        "year": 2025  # Add the year parameter
    }

    # Configure logging for console output when running as standalone
    if logging.getLogger().level == logging.NOTSET:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    # Run the test and catch any exceptions
    try:
        result = optimize_weights(sample_data)
        
        print(f"Best weights found:")
        for key, value in result["weights"].items():
            print(f"  {key}: {value}")
        print(f"Best score: {result['score']:.2f}")
        print(f"Hard violations: {result.get('hard_violations', 'N/A')}")
        print(f"Monthly variance: {result.get('has_monthly_variance', 'N/A')}")
        print(f"Preference violations: {result.get('preference_violations', 'N/A')}")
        print(f"Solution time: {result['solution_time_seconds']:.2f} seconds")
    except Exception as e:
        print(f"Error running test: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"Best weights found:")
    for key, value in result["weights"].items():
        print(f"  {key}: {value}")
    print(f"Best score: {result['score']:.2f}")
    print(f"Hard violations: {result.get('hard_violations', 'N/A')}")
    print(f"Monthly variance: {result.get('has_monthly_variance', 'N/A')}")
    print(f"Preference violations: {result.get('preference_violations', 'N/A')}")
    print(f"Solution time: {result['solution_time_seconds']:.2f} seconds")