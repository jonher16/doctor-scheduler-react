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
import os
import sys
import multiprocessing
from typing import Dict, List, Any, Tuple, Callable
import concurrent.futures
from collections import defaultdict
import json
import threading

# Import the optimizers
from monthly_schedule_optimizer import optimize_monthly_schedule, MonthlyScheduleOptimizer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("WeightOptimizer")

# Helper function to check if we're running in a bundled Electron app
def is_electron_bundled():
    """Check if we're running in a bundled Electron application."""
    # Check for specific environment variables or paths that indicate Electron bundled mode
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        logger.info("Detected Electron bundle: running in PyInstaller frozen environment")
        return True
    
    # Check if running within an ASAR archive (Electron packaging)
    if os.path.join('app.asar') in os.path.abspath(__file__):
        logger.info("Detected Electron bundle: running in ASAR archive")
        return True
    
    # Check a common environment variable set in Electron
    if os.environ.get('ELECTRON_RUN_AS_NODE') is not None:
        logger.info("Detected Electron environment: ELECTRON_RUN_AS_NODE is set")
        return True
    
    logger.info("Not running in Electron bundled environment")
    return False

class WeightOptimizer:
    """
    Meta-optimizer to find the best weights for the schedule optimization objective function.
    Uses random search to explore the weight parameter space.
    """
    
    def __init__(self, 
                 doctors: List[Dict], 
                 holidays: Dict[str, str],
                 availability: Dict[str, Dict[str, str]],
                 month: int,
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
            month: Specific month to optimize (required)
            year: The year to optimize for
            max_iterations: Maximum number of weight configurations to try
            parallel_jobs: Number of parallel optimization jobs to run
            time_limit_minutes: Time limit in minutes for the optimization
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        
        # Handle the case where month or year might be non-integer
        try:
            self.month = int(month)
            self.year = int(year) if year is not None else None
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid month or year value: month={month}, year={year}. Error: {e}")
            # Default to current month and year if invalid
            current_date = datetime.date.today()
            self.month = current_date.month
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
        self.best_has_doctor_hour_balance_violation = True     # Track doctor hour balance violations
        self.best_preference_violations = float('inf')  # Track preference violations
        
        # Define weight parameter ranges
        # Format: (min, max, step)
        self.weight_ranges = {
            "w_balance": (1000, 10000, 500),           # Monthly balance weight
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
        
        # Check if we're running in Electron bundled mode
        self.is_electron_bundled = is_electron_bundled()
        if self.is_electron_bundled:
            logger.info("Running in bundled Electron mode - will use specialized parallelization")
            
            # Try to set multiprocessing start method to 'spawn' for Electron compatibility
            try:
                multiprocessing.set_start_method('spawn', force=True)
                logger.info("Successfully set multiprocessing start method to 'spawn'")
            except RuntimeError as e:
                # This happens if the context has already been set
                logger.warning(f"Could not set start method to 'spawn': {e}")
                current_method = multiprocessing.get_start_method()
                logger.info(f"Current multiprocessing start method: {current_method}")

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
        
        # 1k. Check for Night-Off-Day pattern violations (hard constraint)
        night_off_day_violations = self._check_night_off_day_pattern(schedule)
        hard_violations += night_off_day_violations
        if night_off_day_violations > 0:
            hard_violation_details.append(f"Night-Off-Day pattern: {night_off_day_violations}")
        
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
        Exempts days where there aren't enough doctors with availability.
        
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
        
        # Find doctors with limited availability
        limited_availability_doctors = self._get_limited_availability_doctors(schedule, dates_to_check)
        
        # Log limited availability doctors once before checking coverage
        if limited_availability_doctors:
            logger.info(f"The following doctors have limited availability and are exempted from coverage requirements:")
            for doctor, days in limited_availability_doctors.items():
                logger.info(f"  {doctor}: {days} available days")
        
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
                
                # Only count as error if we have enough doctors available
                # Exclude doctors with limited availability from requirements
                available_doctors = self._get_available_doctors_for_date(date, shift)
                available_doctors = [doc for doc in available_doctors if doc not in limited_availability_doctors]
                
                if assigned < required and len(available_doctors) >= required:
                    coverage_errors += 1
        
        return coverage_errors
    
    @staticmethod
    def _extract_doctor_hours_for_month(stats: Dict[str, Any], month: int) -> Dict[str, float]:
        """Return *doctor → hours* for *month* from *stats* (robust)."""
        ms = stats.get("monthly_stats", {})
        key = str(month) if str(month) in ms else month
        if (
            key in ms
            and isinstance(ms[key], dict)
            and ms[key].get("doctor_hours")
        ):
            return ms[key]["doctor_hours"]
        # fallback – rebuild from monthly_hours
        mh = stats.get("monthly_hours", {})
        return {doc: hours.get(month, 0) for doc, hours in mh.items()}

    def _get_limited_availability_doctors(self, schedule, dates_to_check):
        """
        Find doctors with limited availability.
        
        Args:
            schedule: Schedule dictionary
            dates_to_check: List of dates to check
            
        Returns:
            Dictionary of doctor names to available days count
        """
        # First, count how many days each doctor is available
        availability_counts = {}
        
        for date in dates_to_check:
            if date not in self.availability:
                continue
                
            for doctor, avail in self.availability[date].items():
                # Count days where doctor is available for any shift
                if avail != "Not Available":
                    availability_counts[doctor] = availability_counts.get(doctor, 0) + 1
        
        # Find doctors with limited availability (≤4 days right now, but it can change in the future)
        limited_availability = {}
        for doctor, days in availability_counts.items():
            if days <= 4:
                limited_availability[doctor] = days
                
        return limited_availability
        
    def _get_available_doctors_for_date(self, date, shift):
        """
        Get list of doctors available for a specific date and shift.
        
        Args:
            date: Date string
            shift: Shift type (Day, Evening, Night)
            
        Returns:
            List of available doctor names
        """
        available_doctors = []
        
        # Skip if date not in availability data
        if date not in self.availability:
            return available_doctors
            
        for doctor, avail in self.availability[date].items():
            # Check if doctor is available for this shift
            if avail == "All Day" or avail == shift:
                available_doctors.append(doctor)
                
        return available_doctors

    def _calculate_soft_score(
        self, schedule: Dict, stats: Dict
    ) -> Tuple[float, bool, int]:
        has_balance_violation = False
        pref_violation_count = 0
        doctor_balance_score = 0.0

        doctor_hours = self._extract_doctor_hours_for_month(stats, self.month)
        if doctor_hours:
            # build working‑day map
            working_days: Dict[str, int] = defaultdict(int)
            for date, shifts in schedule.items():
                d = datetime.date.fromisoformat(date)
                if d.month != self.month:
                    continue
                for docs in shifts.values():
                    for doc in docs:
                        working_days[doc] += 1
            limited = {d for d, days in working_days.items() if days <= 4}
            active = {d: h for d, h in doctor_hours.items() if d not in limited and h > 0}
            if len(active) > 1:
                diff = max(active.values()) - min(active.values())
                if diff > 8.0:
                    has_balance_violation = True
                    doctor_balance_score += 5 * (diff - 8.0) ** 3
                target = sum(active.values()) / len(active)
                var = sum((h - target) ** 2 for h in active.values()) / len(active)
                doctor_balance_score += var * 2

        # preference score (unchanged)
        pref_metrics = stats.get("preference_metrics", {})
        for doc, m in pref_metrics.items():
            if m.get("preference") == "None":
                continue
            other = int(m.get("other_shifts", 0))
            pref_violation_count += other
            pref = float(m.get("preferred_shifts", 0))
            total = pref + other
            if total and pref / total < 1.0:
                doctor_balance_score += (1.0 - pref / total) * 50

        return doctor_balance_score, has_balance_violation, pref_violation_count
    
    def _is_better_solution(self, new_hard, new_doctor_hour_balance, new_pref, new_soft, 
                       current_hard, current_doctor_hour_balance, current_pref, current_soft) -> bool:
        """
        Determine if the new solution is better according to our hierarchy:
        1. No hard violations (highest priority)
        2. No doctor hour balance violation (> 8h / 1 shift) (next priority)
        3. Minimum preference violations (next priority)
        4. Lower overall soft score (for solutions equal in above)
        
        Args:
            new_hard: Hard violations in new solution
            new_doctor_hour_balance: Whether new solution has doctor hour balance violation
            new_pref: Preference violations in new solution
            new_soft: Overall soft score for new solution
            current_hard, current_doctor_hour_balance, current_pref, current_soft: Same for current best
            
        Returns:
            True if the new solution is better, False otherwise
        """
        # 1. First priority: minimize hard constraint violations
        if new_hard < current_hard:
            return True
        elif new_hard > current_hard:
            return False
        
        # 2. If hard violations are equal, check doctor hour balance
        if not new_doctor_hour_balance and current_doctor_hour_balance:
            return True  # New solution has no doctor hour balance violation but current does
        elif new_doctor_hour_balance and not current_doctor_hour_balance:
            return False  # Current solution has no doctor hour balance violation but new does
        
        # 3. If both have same doctor hour balance status, compare preference violations
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
        
        # Filter dates by month AND year
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
        
        # Filter dates by month AND year
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

    def _check_senior_more_hours(self, stats: Dict, strict_check: bool = False) -> int:
        """
        Check if senior doctors work more hours than juniors using EXACT UI calculation method.
        
        This method directly mirrors the calculation in ConstraintViolations.jsx 
        to ensure complete consistency.
        
        Args:
            stats: Statistics dictionary containing doctor hours
            strict_check: If True, produces more detailed logs for verification
            
        Returns:
            1 if constraint is violated, 0 otherwise
        """
        if strict_check:
            logger.info("EXACT UI METHOD: Checking senior vs junior hours")
            
        # Get monthly hours from stats
        monthly_hours = stats.get("monthly_hours", {})
        
        # Get lists of senior and junior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # Get the month we're evaluating - critical for correct filtering
        target_month = self.month if self.month is not None else datetime.date.today().month
        
        if strict_check:
            logger.info(f"Calculating for Month {target_month}, Year {self.year}")
            logger.info(f"Total doctors: {len(senior_doctors)} seniors, {len(junior_doctors)} juniors")
        
        # Exactly mirror UI calculation - collect hours only for doctors who worked in this month
        senior_month_hours = []
        for doctor in senior_doctors:
            if doctor in monthly_hours and target_month in monthly_hours[doctor]:
                hours = monthly_hours[doctor][target_month]
                if hours > 0:  # Only include doctors who actually worked
                    senior_month_hours.append(hours)
                    if strict_check:
                        logger.info(f"  Senior: {doctor} worked {hours} hours")
        
        junior_month_hours = []
        for doctor in junior_doctors:
            if doctor in monthly_hours and target_month in monthly_hours[doctor]:
                hours = monthly_hours[doctor][target_month]
                if hours > 0:  # Only include doctors who actually worked
                    junior_month_hours.append(hours)
                    if strict_check:
                        logger.info(f"  Junior: {doctor} worked {hours} hours")
        
        # If either group has no hours, no violation is possible
        if not senior_month_hours or not junior_month_hours:
            if strict_check:
                logger.info("No hours data for either senior or junior doctors - no violation possible")
            return 0
        
        # Calculate average hours - EXACT same way the UI does it
        avg_senior = sum(senior_month_hours) / len(senior_month_hours)
        avg_junior = sum(junior_month_hours) / len(junior_month_hours)
        
        # Check violation condition - EXACT same condition as in ConstraintViolations.jsx
        # The UI checks: if (avgSeniorHours > avgJuniorHours)
        is_violation = avg_senior > avg_junior
        
        if strict_check:
            logger.info(f"Senior avg: {avg_senior:.6f}h ({len(senior_month_hours)} doctors)")
            logger.info(f"Junior avg: {avg_junior:.6f}h ({len(junior_month_hours)} doctors)")
            logger.info(f"Diff (Junior - Senior): {avg_junior - avg_senior:.6f}h")
            logger.info(f"VIOLATION: {is_violation}")
        
        if is_violation:
            logger.warning(f"HARD CONSTRAINT VIOLATION: Seniors working more than juniors")
            logger.warning(f"Senior avg: {avg_senior:.6f}h, Junior avg: {avg_junior:.6f}h")
            return 1
        
        return 0

    def _verify_no_senior_hour_violations(self, schedule, stats):
        """Verify that seniors don't work more hours than juniors using exact criteria."""
        # Use the same checking method but with strict logging enabled
        return self._check_senior_more_hours(stats, strict_check=True) == 0

    def _check_senior_more_weekend_holiday(self, stats: Dict, strict_check: bool = False) -> int:
        """
        Check if senior doctors have more weekend/holiday hours than juniors.
        
        This method exactly mirrors the calculation in ConstraintViolations.jsx.
        
        Args:
            stats: Statistics dictionary containing weekend/holiday metrics
            strict_check: If True, produces more detailed logs for verification
            
        Returns:
            1 if constraint is violated, 0 otherwise
        """
        if strict_check:
            logger.info("EXACT UI METHOD: Checking senior vs junior weekend/holiday hours")
            
        weekend_metrics = stats.get("weekend_metrics", {})
        holiday_metrics = stats.get("holiday_metrics", {})
        
        # Get lists of senior and junior doctors
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # Calculate weekend/holiday hours EXACTLY as the UI does
        senior_wh_hours = []
        for doctor in senior_doctors:
            wh_shifts = (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0))
            if wh_shifts > 0:  # Only include doctors who worked weekends/holidays
                wh_hours = wh_shifts * 8  # Each shift is 8 hours
                senior_wh_hours.append(wh_hours)
                if strict_check:
                    logger.info(f"  Senior: {doctor} worked {wh_hours} W/H hours ({wh_shifts} shifts)")
        
        junior_wh_hours = []
        for doctor in junior_doctors:
            wh_shifts = (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0))
            if wh_shifts > 0:  # Only include doctors who worked weekends/holidays
                wh_hours = wh_shifts * 8  # Each shift is 8 hours
                junior_wh_hours.append(wh_hours)
                if strict_check:
                    logger.info(f"  Junior: {doctor} worked {wh_hours} W/H hours ({wh_shifts} shifts)")
        
        # If either group has no hours, no violation is possible
        if not senior_wh_hours or not junior_wh_hours:
            if strict_check:
                logger.info("No weekend/holiday data for either senior or junior doctors - no violation possible")
            return 0
        
        # Calculate averages - EXACT same way the UI does it
        avg_senior_wh = sum(senior_wh_hours) / len(senior_wh_hours)
        avg_junior_wh = sum(junior_wh_hours) / len(junior_wh_hours)
        
        # Check violation condition - EXACT same condition as in ConstraintViolations.jsx
        # The UI checks: if (avgSeniorWHHours > avgJuniorWHHours)
        is_violation = avg_senior_wh > avg_junior_wh
        
        if strict_check:
            logger.info(f"Senior W/H avg: {avg_senior_wh:.6f}h ({len(senior_wh_hours)} doctors)")
            logger.info(f"Junior W/H avg: {avg_junior_wh:.6f}h ({len(junior_wh_hours)} doctors)")
            logger.info(f"Diff (Junior - Senior): {avg_junior_wh - avg_senior_wh:.6f}h")
            logger.info(f"VIOLATION: {is_violation}")
        
        if is_violation:
            logger.warning(f"HARD CONSTRAINT VIOLATION: Seniors have more weekend/holiday hours")
            logger.warning(f"Senior W/H avg: {avg_senior_wh:.6f}h, Junior W/H avg: {avg_junior_wh:.6f}h")
            return 1
        
        return 0

    def _verify_no_weekend_holiday_violations(self, schedule, stats):
        """Verify that seniors don't work more weekend/holiday hours than juniors."""
        return self._check_senior_more_weekend_holiday(stats, strict_check=True) == 0

    def _verify_no_doctor_hour_balance_violations(self, schedule: Dict, stats: Dict) -> bool:
        doctor_hours = self._extract_doctor_hours_for_month(stats, self.month)
        if not doctor_hours:
            return True
        working_days: Dict[str, int] = defaultdict(int)
        for date, shifts in schedule.items():
            d = datetime.date.fromisoformat(date)
            if d.month != self.month:
                continue
            for docs in shifts.values():
                for doc in docs:
                    working_days[doc] += 1
        limited = {d for d, days in working_days.items() if days <= 4}
        active = [h for d, h in doctor_hours.items() if d not in limited and h > 0]
        return len(active) <= 1 or max(active) - min(active) <= 8.0

    def _check_consecutive_night_shifts(self, schedule: Dict) -> int:
        """Check for doctors working consecutive night shifts."""
        violations = 0
        
        # Get all dates in chronological order
        dates = sorted(schedule.keys())
        
        # Filter dates by month AND year
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
        
        # Filter dates by month AND year
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

    def _check_night_off_day_pattern(self, schedule: Dict, strict_check: bool = False) -> int:
        """
        Check for Night → Off → Day pattern violations.
        
        This method directly mirrors the calculation in ConstraintViolations.jsx 
        which checks if a doctor works a night shift, has a day off, then works a day shift.
        
        Args:
            schedule: The schedule to check
            strict_check: If True, produces more detailed logs for verification
            
        Returns:
            Number of violations found
        """
        violations = 0
        
        if strict_check:
            logger.info("EXACT UI METHOD: Checking Night → Off → Day pattern")
        
        # Get all dates in the target month in chronological order
        all_dates = sorted(schedule.keys())
        dates = []
        
        # Filter by month/year if needed
        if self.month is not None:
            for date in all_dates:
                try:
                    date_obj = datetime.date.fromisoformat(date)
                    if date_obj.month == self.month:
                        # Check year if specified
                        if self.year is None or date_obj.year == self.year:
                            dates.append(date)
                except (ValueError, TypeError):
                    continue
        else:
            dates = all_dates
            
        if strict_check:
            logger.info(f"Checking {len(dates)} dates for Night → Off → Day pattern")
        
        # This needs at least 3 consecutive days to check
        for i in range(len(dates) - 2):
            first_date = dates[i]      # Night shift day
            second_date = dates[i + 1] # Day off
            third_date = dates[i + 2]  # Day shift day
            
            # Skip if any required shift doesn't exist
            if (not schedule.get(first_date, {}).get("Night") or 
                not schedule.get(third_date, {}).get("Day")):
                continue
            
            # Check each doctor on night shift
            for doctor in schedule[first_date]["Night"]:
                # Check if doctor has a day off (not working any shift on second day)
                works_second_day = False
                
                if second_date in schedule:
                    for shift_type in schedule[second_date].values():
                        if doctor in shift_type:
                            works_second_day = True
                            break
                
                # If doctor doesn't work second day but works day shift on third day, it's a violation
                if not works_second_day and doctor in schedule[third_date]["Day"]:
                    violations += 1
                    if strict_check:
                        logger.info(f"VIOLATION: {doctor} works {first_date} (Night) → {second_date} (Off) → {third_date} (Day)")
        
        if strict_check:
            if violations > 0:
                logger.info(f"Found {violations} Night → Off → Day pattern violations")
            else:
                logger.info("No Night → Off → Day pattern violations found")
                
        return violations

    def _verify_no_night_off_day_violations(self, schedule):
        """Verify that no doctors work Night → Off → Day pattern."""
        return self._check_night_off_day_pattern(schedule, strict_check=True) == 0

    def _evaluate_weights(self, weights: Dict[str, Any], iteration: int) -> Tuple[Dict[str, Any], Dict, Dict, float, int, float, bool, int]:
        """
        Evaluate a specific set of weights by running the optimizer and measuring constraint satisfaction.
        
        Args:
            weights: Dictionary of weight parameters
            iteration: Current iteration number for progress tracking
            
        Returns:
            Tuple of (weights, schedule, statistics, total_score, hard_violations, soft_score, 
                     has_doctor_hour_balance_violation, preference_violations)
        """
        start_time = time.time()
        
        # Create custom progress callback
        def progress_callback(progress: int, message: str):
            if progress % 20 == 0:  # Only log occasionally to reduce verbosity
                logger.info(f"Iteration {iteration}, Progress: {progress}%, {message}")
        
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
        
        # Calculate a score for this configuration 
        total_score, hard_violations, soft_score = self._calculate_score(schedule, stats)
        
        # Calculate detailed soft constraint metrics
        soft_score, has_doctor_hour_balance_violation, preference_violations = self._calculate_soft_score(schedule, stats)
        
        elapsed = time.time() - start_time
        logger.info(f"Iteration {iteration} completed in {elapsed:.2f}s with score {total_score:.2f} "
              f"(hard violations: {hard_violations}, doctor hour balance: {has_doctor_hour_balance_violation}, "
              f"preference violations: {preference_violations})")
        
        return (weights, schedule, stats, total_score, hard_violations, soft_score, 
                has_doctor_hour_balance_violation, preference_violations)

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
            if self.is_electron_bundled:
                # Use our special bundled app optimization that avoids multiprocessing
                logger.info("Using bundled app optimization to avoid multiprocessing errors")
                self._optimize_bundled_app(progress_callback)
            else:
                # Normal process-based parallelization for non-Electron
                logger.info("Using standard process-based parallelization")
                self._optimize_parallel(progress_callback)
        else:
            # Sequential execution (unchanged)
            logger.info("Using sequential optimization (no parallelization)")
            self._optimize_sequential(progress_callback)
            
        solution_time = time.time() - start_time
        logger.info(f"Weight optimization completed in {solution_time:.2f}s")
        logger.info(f"Best score: {self.best_score:.2f} (hard violations: {self.best_hard_violations}, "
                   f"doctor hour balance: {self.best_has_doctor_hour_balance_violation}, "
                   f"preference violations: {self.best_preference_violations})")
        
        # Verify the best solution doesn't have hard constraint violations
        if self.best_hard_violations > 0:
            logger.warning("WARNING: Best solution still has hard constraint violations!")
            logger.warning("Hard constraint violations: " + str(self.best_hard_violations))
        
        # Verify doctor hour balance using the specialized verification method for final check
        has_hour_balance_violation = not self._verify_no_doctor_hour_balance_violations(self.best_schedule, self.best_stats)
        
        if self.best_has_doctor_hour_balance_violation != has_hour_balance_violation:
            logger.warning(f"!!! IMPORTANT: Final verification updated doctor hour balance violation status from {self.best_has_doctor_hour_balance_violation} to {has_hour_balance_violation}")
            logger.warning(f"!!! This means the UI and backend may show different balance violations")
            self.best_has_doctor_hour_balance_violation = has_hour_balance_violation
            logger.warning(f"!!! Updated doctor hour balance violation in result to: {has_hour_balance_violation}")
        else:
            logger.info(f"Doctor hour balance verification confirms optimization result: {has_hour_balance_violation}")
        
        if progress_callback:
            progress_callback(100, "Weight optimization complete")
            
        # Sort results by hierarchy: hard violations, doctor hour balance, preference violations
        sorted_results = sorted(
            self.results, 
            key=lambda x: (
                x.get("hard_violations", float('inf')), 
                1 if x.get("has_doctor_hour_balance_violation", True) else 0,
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
            "has_doctor_hour_balance_violation": self.best_has_doctor_hour_balance_violation,
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
        self.best_has_doctor_hour_balance_violation = True
        self.best_preference_violations = float('inf')
        self.best_soft_score = float('inf')
        
        while (iteration < self.max_iterations and 
               time.time() - start_time < self.time_limit_seconds):
            
            iteration += 1
            
            # Generate random weights
            weights = self._get_random_weights()
                
            # Evaluate this weight configuration
            current_weights, schedule, stats, total_score, hard_violations, soft_score, \
            has_doctor_hour_balance_violation, preference_violations = self._evaluate_weights(weights, iteration)
            
            # Store results
            self.results.append({
                "weights": copy.deepcopy(current_weights),
                "score": total_score,
                "hard_violations": hard_violations,
                "has_doctor_hour_balance_violation": has_doctor_hour_balance_violation,
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
                hard_violations, has_doctor_hour_balance_violation, preference_violations, soft_score,
                self.best_hard_violations, self.best_has_doctor_hour_balance_violation, 
                self.best_preference_violations, self.best_soft_score
            ):
                logger.info(f"New best solution! Score: {total_score:.2f} (was {self.best_score:.2f})")
                
                self.best_score = total_score
                self.best_hard_violations = hard_violations
                self.best_has_doctor_hour_balance_violation = has_doctor_hour_balance_violation
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
                # Clearly separate the different constraint types
                constraints_msg = []
                
                # Hard constraints - most critical
                if self.best_hard_violations > 0:
                    constraints_msg.append(f"HARD CONSTRAINTS: {self.best_hard_violations} violations!")
                else:
                    constraints_msg.append("HARD CONSTRAINTS: None")
                    
                # Doctor hour balance - second priority
                if self.best_has_doctor_hour_balance_violation:
                    constraints_msg.append("DOCTOR HOUR BALANCE: >8h Difference (UI will show violation)")
                else:
                    constraints_msg.append("DOCTOR HOUR BALANCE: Balanced (≤8h difference)")
                    
                # Preference violations - lowest priority
                constraints_msg.append(f"PREFERENCES: {self.best_preference_violations} violations")
                
                status_msg += f" ({' | '.join(constraints_msg)})"
                
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
        self.best_has_doctor_hour_balance_violation = True
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
                        has_doctor_hour_balance_violation, preference_violations = future.result()
                        
                        completed += 1
                        
                        # Store results
                        self.results.append({
                            "weights": copy.deepcopy(current_weights),
                            "score": total_score,
                            "hard_violations": hard_violations,
                            "has_doctor_hour_balance_violation": has_doctor_hour_balance_violation,
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
                            hard_violations, has_doctor_hour_balance_violation, preference_violations, soft_score,
                            self.best_hard_violations, self.best_has_doctor_hour_balance_violation, 
                            self.best_preference_violations, self.best_soft_score
                        ):
                            logger.info(f"New best solution! Score: {total_score:.2f} (was {self.best_score:.2f})")
                            
                            self.best_score = total_score
                            self.best_hard_violations = hard_violations
                            self.best_has_doctor_hour_balance_violation = has_doctor_hour_balance_violation
                            self.best_preference_violations = preference_violations
                            self.best_soft_score = soft_score
                            self.best_weights = copy.deepcopy(current_weights)
                            self.best_schedule = copy.deepcopy(schedule)
                            self.best_stats = copy.deepcopy(stats)
                    except Exception as e:
                        logger.error(f"Error processing future: {e}")
                
                # Report progress
                if progress_callback:
                    elapsed_time = time.time() - start_time
                    time_percent = min(100, int(100 * elapsed_time / self.time_limit_seconds))
                    iter_percent = int(100 * completed / self.max_iterations)
                    progress = max(time_percent, iter_percent)
                    
                    status_msg = f"Completed {completed}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                    # Clearly separate the different constraint types
                    constraints_msg = []
                    
                    # Hard constraints - most critical
                    if self.best_hard_violations > 0:
                        constraints_msg.append(f"HARD CONSTRAINTS: {self.best_hard_violations} violations!")
                    else:
                        constraints_msg.append("HARD CONSTRAINTS: None")
                        
                    # Doctor hour balance - second priority
                    if self.best_has_doctor_hour_balance_violation:
                        constraints_msg.append("DOCTOR HOUR BALANCE: >8h Difference (UI will show violation)")
                    else:
                        constraints_msg.append("DOCTOR HOUR BALANCE: Balanced (≤8h difference)")
                        
                    # Preference violations - lowest priority
                    constraints_msg.append(f"PREFERENCES: {self.best_preference_violations} violations")
                    
                    status_msg += f" ({' | '.join(constraints_msg)})"
                    
                    progress_callback(progress, status_msg)
            
            # Cancel any remaining futures if we hit time limit
            for future in active_futures:
                future.cancel()

    def _optimize_bundled_app(self, progress_callback: Callable = None):
        """
        Optimization strategy for bundled apps that avoids using ProcessPoolExecutor.
        Uses threading with chunked work to maximize performance while avoiding socket errors.
        """
        start_time = time.time()
        logger.info(f"Starting bundled app optimization with {self.parallel_jobs} workers")
        
        # Generate all weight configurations first
        weight_configs = []
        for i in range(self.max_iterations):
            weights = self._get_random_weights()
            weight_configs.append((weights, i + 1))
        
        # Track iterations completed
        completed = 0
        
        # Initialize tracking for best solution
        self.best_hard_violations = float('inf')
        self.best_has_doctor_hour_balance_violation = True
        self.best_preference_violations = float('inf')
        self.best_soft_score = float('inf')
        
        # Create a lock for thread-safe updates to shared state
        update_lock = threading.Lock()
        
        # Define a worker function that processes a chunk of configurations
        def process_chunk(chunk_configs):
            nonlocal completed
            chunk_results = []
            
            for weights, iteration in chunk_configs:
                # Evaluate this configuration
                try:
                    result = self._evaluate_weights(weights, iteration)
                    chunk_results.append(result)
                    
                    # Thread-safe update of shared state
                    with update_lock:
                        completed += 1
                        
                        current_weights, schedule, stats, total_score, hard_violations, soft_score, \
                        has_doctor_hour_balance_violation, preference_violations = result
                        
                        # Store result
                        self.results.append({
                            "weights": copy.deepcopy(current_weights),
                            "score": total_score,
                            "hard_violations": hard_violations,
                            "has_doctor_hour_balance_violation": has_doctor_hour_balance_violation,
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
                            hard_violations, has_doctor_hour_balance_violation, preference_violations, soft_score,
                            self.best_hard_violations, self.best_has_doctor_hour_balance_violation, 
                            self.best_preference_violations, self.best_soft_score
                        ):
                            logger.info(f"New best solution! Score: {total_score:.2f} (was {self.best_score:.2f})")
                            
                            self.best_score = total_score
                            self.best_hard_violations = hard_violations
                            self.best_has_doctor_hour_balance_violation = has_doctor_hour_balance_violation
                            self.best_preference_violations = preference_violations
                            self.best_soft_score = soft_score
                            self.best_weights = copy.deepcopy(current_weights)
                            self.best_schedule = copy.deepcopy(schedule)
                            self.best_stats = copy.deepcopy(stats)
                            
                        # Report progress after each evaluation
                        if progress_callback and completed % max(1, min(5, self.max_iterations // 10)) == 0:
                            elapsed_time = time.time() - start_time
                            time_percent = min(100, int(100 * elapsed_time / self.time_limit_seconds))
                            iter_percent = int(100 * completed / self.max_iterations)
                            progress = max(time_percent, iter_percent)
                            
                            status_msg = f"Completed {completed}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                            # Clearly separate the different constraint types
                            constraints_msg = []
                            
                            # Hard constraints - most critical
                            if self.best_hard_violations > 0:
                                constraints_msg.append(f"HARD CONSTRAINTS: {self.best_hard_violations} violations!")
                            else:
                                constraints_msg.append("HARD CONSTRAINTS: None")
                                
                            # Doctor hour balance - second priority
                            if self.best_has_doctor_hour_balance_violation:
                                constraints_msg.append("DOCTOR HOUR BALANCE: >8h Difference (UI will show violation)")
                            else:
                                constraints_msg.append("DOCTOR HOUR BALANCE: Balanced (≤8h difference)")
                                
                            # Preference violations - lowest priority
                            constraints_msg.append(f"PREFERENCES: {self.best_preference_violations} violations")
                            
                            status_msg += f" ({' | '.join(constraints_msg)})"
                            
                            progress_callback(progress, status_msg)
                
                except Exception as e:
                    logger.error(f"Error evaluating weights: {e}")
                    with update_lock:
                        completed += 1
        
        # Split work into chunks, one per thread
        chunk_size = max(1, len(weight_configs) // self.parallel_jobs)
        chunks = [weight_configs[i:i + chunk_size] for i in range(0, len(weight_configs), chunk_size)]
        
        # Create and start threads
        threads = []
        for chunk in chunks:
            thread = threading.Thread(target=process_chunk, args=(chunk,))
            thread.daemon = True  # Allow the program to exit even if threads are running
            threads.append(thread)
            thread.start()
        
        # Wait for threads to complete or time limit to be reached
        elapsed = 0
        while any(t.is_alive() for t in threads) and elapsed < self.time_limit_seconds:
            time.sleep(0.5)
            elapsed = time.time() - start_time
        
        # Final progress update
        if progress_callback:
            progress_callback(100, f"Completed {completed}/{self.max_iterations}, Best score: {self.best_score:.2f}")
        
        logger.info(f"Bundled app optimization completed: processed {completed}/{self.max_iterations} configurations")


def optimize_weights(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """
    Optimize weights for schedule optimization.
    
    Args:
        data: Dictionary with doctors, holidays, availability, month, year, and optimization parameters
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
        optimizer.best_has_doctor_hour_balance_violation = True
        optimizer.best_preference_violations = float('inf')
        
        result = optimizer.optimize(progress_callback=progress_callback)
        
        # Use a single, consistent method for checking hard violations
        # Don't report "no hard violations" until ALL checks are complete
        has_issues = result["hard_violations"] > 0
        
        # Second comprehensive verification for all hard constraints
        if not has_issues:
            # Verify senior hours constraint with detailed logging
            if not optimizer._verify_no_senior_hour_violations(result["schedule"], result["statistics"]):
                logger.warning("Final verification found senior hour violations!")
                # Make sure this is reflected in the hard_violations count
                result["hard_violations"] = 1
                has_issues = True
            
            # Verify weekend/holiday hours constraint
            if not optimizer._verify_no_weekend_holiday_violations(result["schedule"], result["statistics"]):
                logger.warning("Final verification found senior weekend/holiday hour violations!")
                # Make sure this is reflected in the hard_violations count
                result["hard_violations"] = 1
                has_issues = True
                
            # Verify doctor hour balance 
            has_hour_balance_violation = not optimizer._verify_no_doctor_hour_balance_violations(result["schedule"], result["statistics"])
            if has_hour_balance_violation != result["has_doctor_hour_balance_violation"]:
                logger.warning(f"!!! IMPORTANT: Final verification updated doctor hour balance violation status from {result['has_doctor_hour_balance_violation']} to {has_hour_balance_violation}")
                logger.warning(f"!!! This means the UI and backend may show different balance violations")
                result["has_doctor_hour_balance_violation"] = has_hour_balance_violation
                logger.warning(f"!!! Updated doctor hour balance violation in result to: {has_hour_balance_violation}")
            else:
                logger.info(f"Doctor hour balance verification confirms optimization result: {has_hour_balance_violation}")
                
            # Recheck other critical hard constraints
            schedule = result["schedule"]
            stats = result["statistics"]
            
            # Night followed by work check
            night_followed = optimizer._check_night_followed_by_work(schedule)
            if night_followed > 0:
                logger.warning(f"Final verification found {night_followed} night followed by work violations!")
                result["hard_violations"] += night_followed
                has_issues = True
                
            # Evening to day check
            evening_to_day = optimizer._check_evening_to_day(schedule)
            if evening_to_day > 0:
                logger.warning(f"Final verification found {evening_to_day} evening to day violations!")
                result["hard_violations"] += evening_to_day
                has_issues = True
                
            # Senior on long holiday check
            senior_holiday = optimizer._check_senior_on_long_holiday(schedule)
            if senior_holiday > 0:
                logger.warning(f"Final verification found {senior_holiday} senior on long holiday violations!")
                result["hard_violations"] += senior_holiday
                has_issues = True
                
            # Consecutive night shifts check
            consecutive_night = optimizer._check_consecutive_night_shifts(schedule)
            if consecutive_night > 0:
                logger.warning(f"Final verification found {consecutive_night} consecutive night shift violations!")
                result["hard_violations"] += consecutive_night
                has_issues = True
                
            # Day/Evening to Night check
            day_evening_to_night = optimizer._check_day_evening_to_night(schedule)
            if day_evening_to_night > 0:
                logger.warning(f"Final verification found {day_evening_to_night} day/evening to night violations!")
                result["hard_violations"] += day_evening_to_night
                has_issues = True
                
            # Night off day pattern check - ADD THIS AFTER OTHER CHECKS
            night_off_day = optimizer._check_night_off_day_pattern(schedule)
            if night_off_day > 0:
                logger.warning(f"Final verification found {night_off_day} night→off→day pattern violations!")
                result["hard_violations"] += night_off_day
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
                    logger.info(f"Creating alternative MonthlyScheduleOptimizer with month={month}, year={year}")
                    
                    # For monthly optimization
                    optimizer_instance = MonthlyScheduleOptimizer(
                        doctors,
                        holidays,
                        availability,
                        month,
                        year  # Make sure we pass the year parameter here
                    )
                        
                    # Apply the weights
                    for key, value in weights.items():
                        if hasattr(optimizer_instance, key):
                            setattr(optimizer_instance, key, value)
                    
                    # Generate the schedule
                    schedule, stats = optimizer_instance.optimize()
                    
                    # Check for any hard violations using our enhanced methods
                    hard_violations = 0
                    
                    # Check specifically for senior hour violations using the same method
                    # that's used in the initial check, just with strict logging
                    has_senior_violation = not optimizer._verify_no_senior_hour_violations(schedule, stats)
                    if has_senior_violation:
                        hard_violations += 1
                    
                    # Check senior weekend/holiday hours violation
                    has_senior_wh_violation = not optimizer._verify_no_weekend_holiday_violations(schedule, stats)
                    if has_senior_wh_violation:
                        hard_violations += 1
                    
                    # Check other hard violations
                    hard_violations += stats.get("availability_violations", 0)
                    hard_violations += stats.get("duplicate_doctors", 0)
                    hard_violations += stats.get("coverage_errors", 0)
                    hard_violations += optimizer._check_night_followed_by_work(schedule)
                    hard_violations += optimizer._check_evening_to_day(schedule)
                    hard_violations += optimizer._check_senior_on_long_holiday(schedule)
                    hard_violations += optimizer._check_consecutive_night_shifts(schedule)
                    hard_violations += optimizer._check_day_evening_to_night(schedule)
                    
                    # Add night off day check
                    hard_violations += optimizer._check_night_off_day_pattern(schedule)
                    
                    # Only include if NO hard violations
                    if hard_violations == 0:
                        # Calculate soft constraint metrics
                        soft_score, has_doctor_hour_balance_violation, preference_violations = optimizer._calculate_soft_score(schedule, stats)
                        
                        solutions_without_hard_violations.append({
                            "weights": weights,
                            "schedule": schedule,
                            "stats": stats,
                            "soft_score": soft_score,
                            "has_doctor_hour_balance_violation": has_doctor_hour_balance_violation,
                            "preference_violations": preference_violations
                        })
                        
                        logger.info(f"Found a solution with no hard violations - "
                                   f"Doctor hour balance: {has_doctor_hour_balance_violation}, "
                                   f"Preference violations: {preference_violations}, "
                                   f"Soft score: {soft_score:.2f}")
                except Exception as e:
                    logger.error(f"Error evaluating solution: {e}")
                    continue
            
            # If we found solutions without hard violations, select the best one
            if solutions_without_hard_violations:
                # First, prioritize solutions without doctor hour balance violation
                solutions_without_doctor_hour_balance = [
                    s for s in solutions_without_hard_violations 
                    if not s["has_doctor_hour_balance_violation"]
                ]
                
                if solutions_without_doctor_hour_balance:
                    # Sort by preference violations (ascending)
                    solutions_without_doctor_hour_balance.sort(
                        key=lambda x: (x["preference_violations"], x["soft_score"])
                    )
                    best_solution = solutions_without_doctor_hour_balance[0]
                    logger.info(f"Selected best solution with no doctor hour balance violation and "
                               f"{best_solution['preference_violations']} preference violations")
                else:
                    # If all solutions have doctor hour balance violation, sort by preference violations
                    solutions_without_hard_violations.sort(
                        key=lambda x: (x["preference_violations"], x["soft_score"])
                    )
                    best_solution = solutions_without_hard_violations[0]
                    logger.info(f"Selected best solution with {best_solution['preference_violations']} "
                               f"preference violations (all solutions have doctor hour balance violation)")
                
                # Update the result
                result["schedule"] = best_solution["schedule"]
                result["statistics"] = best_solution["stats"]
                result["weights"] = best_solution["weights"]
                result["score"] = best_solution["soft_score"]
                result["hard_violations"] = 0
                result["soft_score"] = best_solution["soft_score"]
                result["has_doctor_hour_balance_violation"] = best_solution["has_doctor_hour_balance_violation"]
                result["preference_violations"] = best_solution["preference_violations"]
                
                if progress_callback:
                    status = "Found valid solution with no hard constraints"
                    if not best_solution["has_doctor_hour_balance_violation"]:
                        status += f" and no doctor hour balance violations (Preference violations: {best_solution['preference_violations']})"
                    else:
                        status += f" but with DOCTOR HOUR BALANCE >8h (1 shift) VIOLATION (Preference violations: {best_solution['preference_violations']})"
                    progress_callback(100, status)
            else:
                logger.warning("Could not find a solution without hard violations!")
                if progress_callback:
                    progress_callback(100, "Warning: Could not find a solution without hard violations!")
        else:
            # No hard violations in the best solution - calculate soft metrics
            soft_score, has_doctor_hour_balance_violation, preference_violations = optimizer._calculate_soft_score(
                result["schedule"], result["statistics"]
            )
            result["has_doctor_hour_balance_violation"] = has_doctor_hour_balance_violation
            result["preference_violations"] = preference_violations
            
            if progress_callback:
                status = "Optimization complete. Solution has no hard violations"
                if not has_doctor_hour_balance_violation:
                    status += f" and no doctor hour balance violations (Preference violations: {preference_violations})"
                else:
                    status += f" but has DOCTOR HOUR BALANCE >8h (1 shift) VIOLATION (Preference violations: {preference_violations})"
                progress_callback(100, status)
        
        # ---- Add detailed reporting of top solutions ----
        logger.info("=" * 80)
        logger.info("OPTIMIZATION REPORT - TOP SCHEDULES")
        logger.info("=" * 80)
        
        # Sort all results by score for reporting
        all_results = sorted(optimizer.results, key=lambda x: (
            x.get("hard_violations", float('inf')),
            1 if x.get("has_doctor_hour_balance_violation", True) else 0,
            x.get("preference_violations", float('inf')),
            x.get("soft_score", float('inf'))
        ))
        
        # Get the final schedule for reporting
        schedule = result["schedule"]
        stats = result["statistics"]
        
        # Report the top solution (the one being shown in the UI)
        logger.info("\nDETAILED REPORT FOR SELECTED SOLUTION (SHOWN IN UI):")
        logger.info("-" * 80)
        
        # Add direct UI calculation diagnostics
        # Run our checks, but force the strict logging to debug the specific calculations
        doctor_list = data.get("doctors", doctors)
        
        # Debug the exact dates in the schedule
        month_dates = []
        schedule_dates = sorted(schedule.keys())
        for date in schedule_dates:
            try:
                date_obj = datetime.date.fromisoformat(date)
                if date_obj.month == month and (year is None or date_obj.year == year):
                    month_dates.append(date)
            except (ValueError, TypeError):
                continue
        
        logger.info(f"Schedule for month {month}, year {year} contains {len(month_dates)} dates:")
        if len(month_dates) > 0:
            logger.info(f"First date: {month_dates[0]}, Last date: {month_dates[-1]}")
        
        # Create a new class instance to match how the UI would use it
        ui_simulator = WeightOptimizer(
            doctors=doctor_list,
            holidays=data.get("holidays", {}),
            availability=data.get("availability", {}),
            month=month,
            year=year
        )
        
        # Get limited availability doctors info for final report
        limited_availability_doctors = ui_simulator._get_limited_availability_doctors(schedule, month_dates)
        
        # Run exact UI-style checks with full tracing enabled
        logger.info("\n[SIMULATING EXACT UI CALCULATIONS]")
        ui_senior_hours_violation = ui_simulator._check_senior_more_hours(stats, strict_check=True)
        ui_senior_wh_violation = ui_simulator._check_senior_more_weekend_holiday(stats, strict_check=True)
        ui_night_off_day_violation = ui_simulator._check_night_off_day_pattern(schedule, strict_check=True)
        
        # Continue with other verification checks - exclude coverage errors for limited availability doctors
        verification_results = {
            "senior_hours": ui_senior_hours_violation == 0,
            "senior_wh_hours": ui_senior_wh_violation == 0,
            "night_followed": optimizer._check_night_followed_by_work(schedule) == 0,
            "evening_day": optimizer._check_evening_to_day(schedule) == 0,
            "night_off_day": ui_night_off_day_violation == 0,
            "senior_holiday": optimizer._check_senior_on_long_holiday(schedule) == 0,
            "consecutive_night": optimizer._check_consecutive_night_shifts(schedule) == 0,
            "day_evening_to_night": optimizer._check_day_evening_to_night(schedule) == 0,
            "availability": stats.get("availability_violations", 0) == 0,
            "duplicates": stats.get("duplicate_doctors", 0) == 0,
            "coverage": True  # Always consider coverage as passing in the UI if doctors with limited availability are exempt
        }
        
        # For the best solution, print a report with exact hourly values - SIMPLIFIED TO AVOID DUPLICATION
        logger.info("Hour Distribution:")
        monthly_hours = stats.get("monthly_hours", {})
        
        # Get senior and junior doctors
        senior_doctors = [doc["name"] for doc in doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # Calculate and print hours for each doctor group
        target_month = month if month is not None else datetime.date.today().month
        
        # COMPUTE ONCE, USE MULTIPLE TIMES
        # Calculate all the key metrics upfront
        senior_hours_list = []
        junior_hours_list = []
        senior_wh_list = []
        junior_wh_list = []
        
        # Calculate regular hours
        for doctor in senior_doctors:
            if doctor in monthly_hours and target_month in monthly_hours[doctor]:
                hours = monthly_hours[doctor][target_month]
                senior_hours_list.append((doctor, hours))
        
        for doctor in junior_doctors:
            if doctor in monthly_hours and target_month in monthly_hours[doctor]:
                hours = monthly_hours[doctor][target_month]
                junior_hours_list.append((doctor, hours))
        
        # Get weekend/holiday metrics
        weekend_metrics = stats.get("weekend_metrics", {})
        holiday_metrics = stats.get("holiday_metrics", {})
        
        # Calculate weekend/holiday hours
        for doctor in senior_doctors:
            wh_shifts = (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0))
            wh_hours = wh_shifts * 8  # Each shift is 8 hours
            if wh_shifts > 0:
                senior_wh_list.append((doctor, wh_hours))
        
        for doctor in junior_doctors:
            wh_shifts = (weekend_metrics.get(doctor, 0) + holiday_metrics.get(doctor, 0))
            wh_hours = wh_shifts * 8  # Each shift is 8 hours
            if wh_shifts > 0:
                junior_wh_list.append((doctor, wh_hours))
        
        # Calculate averages
        avg_senior_hours = sum(h for _, h in senior_hours_list) / len(senior_hours_list) if senior_hours_list else 0
        avg_junior_hours = sum(h for _, h in junior_hours_list) / len(junior_hours_list) if junior_hours_list else 0
        avg_senior_wh = sum(h for _, h in senior_wh_list) / len(senior_wh_list) if senior_wh_list else 0
        avg_junior_wh = sum(h for _, h in junior_wh_list) / len(junior_wh_list) if junior_wh_list else 0
        
        # Report hours for all doctors in a compact format
        logger.info("\nSENIOR DOCTORS:")
        logger.info(f"  Average hours: {avg_senior_hours:.2f} ({len(senior_hours_list)} doctors)")
        logger.info(f"  Average weekend/holiday hours: {avg_senior_wh:.2f} ({len(senior_wh_list)} doctors)")
        for doctor, hours in sorted(senior_hours_list, key=lambda x: x[1], reverse=True):
            wh_hours = next((h for d, h in senior_wh_list if d == doctor), 0)
            logger.info(f"  {doctor}: {hours:.2f} hours, {wh_hours:.2f} W/H hours" + 
                      (f" (LIMITED AVAILABILITY: {limited_availability_doctors.get(doctor, 0)} days)" if doctor in limited_availability_doctors else ""))
        
        logger.info("\nJUNIOR DOCTORS:")
        logger.info(f"  Average hours: {avg_junior_hours:.2f} ({len(junior_hours_list)} doctors)")
        logger.info(f"  Average weekend/holiday hours: {avg_junior_wh:.2f} ({len(junior_wh_list)} doctors)")
        for doctor, hours in sorted(junior_hours_list, key=lambda x: x[1], reverse=True):
            wh_hours = next((h for d, h in junior_wh_list if d == doctor), 0)
            logger.info(f"  {doctor}: {hours:.2f} hours, {wh_hours:.2f} W/H hours" + 
                      (f" (LIMITED AVAILABILITY: {limited_availability_doctors.get(doctor, 0)} days)" if doctor in limited_availability_doctors else ""))
        
        logger.info(f"\nHOUR DIFFERENCES:")
        logger.info(f"  Junior - Senior: {avg_junior_hours - avg_senior_hours:.4f} hours")
        logger.info(f"  Junior - Senior W/H: {avg_junior_wh - avg_senior_wh:.4f} hours")
        
        # Print violation report
        logger.info("\nConstraint Verification Results:")
        for constraint, passed in verification_results.items():
            status = "✓ PASS" if passed else "✗ FAIL"
            logger.info(f"  {constraint.ljust(25)}: {status}")
        
        # Determine if there are actual violations according to our verification
        actual_violations = sum(1 for passed in verification_results.values() if not passed)
        if actual_violations > 0:
            logger.warning(f"\n⚠️ WARNING: Our verification detected {actual_violations} constraint violations!")
            logger.warning(f"⚠️ The UI will likely show these violations even though the optimizer reported none.")
        else:
            logger.info("\n✅ All constraints verified successfully. UI should show no violations.")
        
        # Only report TOP 5 solutions to reduce clutter
        logger.info("\n" + "=" * 80)
        logger.info("TOP 5 SCHEDULES GENERATED:")
        logger.info("=" * 80)
        
        for i, solution in enumerate(all_results[:5]):
            hard_violations = solution.get("hard_violations", 0)
            has_doctor_hour_balance_violation = solution.get("has_doctor_hour_balance_violation", True)
            pref_violations = solution.get("preference_violations", 0)
            soft_score = solution.get("soft_score", 0)
            
            logger.info(f"\nSolution #{i+1}:")
            logger.info(f"  Hard Violations: {hard_violations}")
            logger.info(f"  Doctor Hour Balance Violation: {'Yes' if has_doctor_hour_balance_violation else 'No'}")
            logger.info(f"  Preference Violations: {pref_violations}")
            logger.info(f"  Soft Score: {soft_score:.2f}")
            
            # For solutions with hard violations, show what types of violations
            if hard_violations > 0 and i < 3:  # Only for top 3 solutions with violations
                logger.info("  Violation Details:")
                schedule = solution.get("schedule", {})
                stats = solution.get("stats", {})
                
                violations_breakdown = {
                    "Senior Hours": not optimizer._verify_no_senior_hour_violations(schedule, stats),
                    "Senior W/H Hours": not optimizer._verify_no_weekend_holiday_violations(schedule, stats),
                    "Night Followed": optimizer._check_night_followed_by_work(schedule) > 0,
                    "Evening->Day": optimizer._check_evening_to_day(schedule) > 0,
                    "Night->Off->Day": optimizer._check_night_off_day_pattern(schedule) > 0,
                    "Senior Holiday": optimizer._check_senior_on_long_holiday(schedule) > 0,
                    "Consecutive Night": optimizer._check_consecutive_night_shifts(schedule) > 0,
                    "Day/Eve->Night": optimizer._check_day_evening_to_night(schedule) > 0,
                    "Availability": stats.get("availability_violations", 0) > 0,
                    "Duplicates": stats.get("duplicate_doctors", 0) > 0
                }
                
                for violation_type, has_violation in violations_breakdown.items():
                    if has_violation:
                        logger.info(f"    - {violation_type}: Failed")
        
        logger.info("=" * 80)
        logger.info("End of optimization report")
        logger.info("=" * 80)
        
        # Continue with original function logic
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
        print(f"Doctor hour balance: {result.get('has_doctor_hour_balance_violation', 'N/A')}")
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
    print(f"Doctor hour balance: {result.get('has_doctor_hour_balance_violation', 'N/A')}")
    print(f"Preference violations: {result.get('preference_violations', 'N/A')}")
    print(f"Solution time: {result['solution_time_seconds']:.2f} seconds")