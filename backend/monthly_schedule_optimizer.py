#!/usr/bin/env python3
"""
Hospital Staff Scheduler: Monthly Tabu Search Optimization

This module implements a specialized optimizer for monthly scheduling that focuses
on creating an optimal schedule for a single month rather than a full year.
Fixed to prevent duplicate doctors in the same shift.
"""

import datetime
import time
import logging
import threading
import random
import copy
from typing import Dict, List, Any, Tuple, Set, Callable
from collections import defaultdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("MonthlyScheduleOptimizer")

class MonthlyScheduleOptimizer:
    def __init__(self, doctors: List[Dict], holidays: Dict[str, str],
                 availability: Dict[str, Dict[str, str]], month: int, year: int):
        """
        Initialize with input data for a specific month.
        
        Args:
            doctors: List of doctor dictionaries with name, seniority, and optional preference.
            holidays: Dictionary mapping dates to holiday types (e.g., 'Short' or 'Long').
            availability: Nested dictionary for doctor availability constraints.
            month: The month to generate the schedule for (1-12).
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        self.month = month
        self.year = year

        # Create indices for faster lookups
        self.doctor_indices = {doc["name"]: i for i, doc in enumerate(doctors)}
        self.doctor_info = {
            doc["name"]: {
                "seniority": doc.get("seniority", "Junior"),
                "pref": doc.get("pref", "None")
            } for doc in doctors
        }
        
        # Group doctors by their preferences for faster lookup
        self.doctors_by_preference = defaultdict(list)
        for doc in doctors:
            self.doctors_by_preference[doc.get("pref", "None")].append(doc["name"])
        
        # Get lists of junior and senior doctors
        self.junior_doctors = [doc["name"] for doc in doctors if doc.get("seniority", "Junior") != "Senior"]
        self.senior_doctors = [doc["name"] for doc in doctors if doc.get("seniority", "Senior") == "Senior"]
        
        self.shifts = ["Day", "Evening", "Night"]
        self.shift_requirements = {"Day": 2, "Evening": 1, "Night": 2}
        self.shift_hours = {"Day": 8, "Evening": 8, "Night": 8}

        # Workload balance thresholds 
        # More strict for monthly scheduling since we're focusing on a single month
        self.max_monthly_variance = 8  # Tighter than yearly (was 10)
        
        # Target daily workload difference between juniors and seniors
        # Seniors should work less per month
        self.senior_junior_monthly_diff = 6  # Seniors should work ~6h less per month than juniors
        
        # Generate dates for the specified month
        self.all_dates = self._generate_dates_for_month(month)
        self.date_to_index = {date: i for i, date in enumerate(self.all_dates)}
        self.weekends = self._identify_weekends()
        self.weekdays = set(self.all_dates) - self.weekends
        
        # Precomputed date information for faster lookups
        self.date_info = {}
        for date in self.all_dates:
            d = datetime.date.fromisoformat(date)
            self.date_info[date] = {
                "month": d.month,
                "day": d.day,
                "weekday": d.weekday(),
                "is_weekend": date in self.weekends,
                "is_holiday": date in self.holidays,
                "holiday_type": self.holidays.get(date)
            }
        
        # Precompute dates in each month
        self.month_dates = defaultdict(list)
        for date in self.all_dates:
            month = self.date_info[date]["month"]
            self.month_dates[month].append(date)
        
        # Since we're optimizing for a shorter period, we can increase weights
        # for better results in fewer iterations
        # Weights for the objective function components
        self.w_avail = 999999    # Availability violations - super hard constraint
        self.w_one_shift = 999999    # Multiple shifts per day - super hard constraint
        self.w_rest = 999999     # UPGRADED to super hard constraint (no shift after night)
        self.w_consec_night = 999999  # NEW: Even higher penalty for consecutive night shifts
        self.w_senior_holiday = 1000  # Senior working on long holidays - hard constraint
        self.w_balance = 1000      # Increased for monthly (was 30 in yearly)
        self.w_wh = 40           # Increased for monthly (was 30 in yearly)
        self.w_pref = {          # Preference violations with seniors getting priority
            "Junior": 10000,     # UPGRADED to super hard constraint
            "Senior": 20000      # UPGRADED to super hard constraint
        }
        self.w_wrong_pref_night = 999999  # NEW: Separate extreme penalty for evening/day pref assigned to night
        self.w_senior_workload = 10000  # Higher penalty for seniors working more than juniors
        self.w_preference_fairness = 1000  # Higher penalty for unfair distribution
        self.w_duplicate_penalty = 999999  # super hard constraint for duplicate doctor in same shift
        # New weights for additional constraints
        self.w_night_day_gap = 999999   # Weight for night→off→day pattern (super hard constraint)
        self.w_evening_day = 100000     # Weight for evening→day pattern (super hard constraint)
        
        # Cache doctor availability status for improved performance
        self._availability_cache = {}
        self._initialize_availability_cache()
        
        # Track doctors with same preferences for fairness calculations
        self.evening_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Evening Only"]
        self.day_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Day Only"]
        self.night_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Night Only"]
        
        # For monthly optimization, we can also track consecutive shifts more closely
        self.max_consecutive_shifts = 5  # Maximum number of consecutive days a doctor should work
        self.w_consecutive_shifts = 50   # Penalty for exceeding consecutive shift limit

    def _initialize_availability_cache(self):
        """Initialize the availability cache for faster lookups."""
        for doctor in [doc["name"] for doc in self.doctors]:
            for date in self.all_dates:
                for shift in self.shifts:
                    key = (doctor, date, shift)
                    self._availability_cache[key] = self._calculate_doctor_availability(doctor, date, shift)

    def _calculate_doctor_availability(self, doctor: str, date: str, shift: str) -> bool:
        """Calculate the availability status without using cache."""
        if doctor not in self.availability:
            return True
        if date not in self.availability[doctor]:
            return True
            
        avail = self.availability[doctor][date]
        
        # Handle standard statuses
        if avail == "Not Available":
            return False
        elif avail == "Available":
            return True
        elif avail == "Day Only":
            return shift == "Day"
        elif avail == "Evening Only":
            return shift == "Evening"
        elif avail == "Night Only":
            return shift == "Night"
        # Handle new format: "Not Available: Shift1, Shift2, ..."
        elif avail.startswith("Not Available: "):
            unavailable_shifts_text = avail[len("Not Available: "):]
            unavailable_shifts = unavailable_shifts_text.split(", ")
            return shift not in unavailable_shifts
        # Handle legacy format: "No Shift1/Shift2"
        elif avail.startswith("No "):
            unavailable_shifts = avail[3:].split("/")
            return shift not in unavailable_shifts
            
        # Default to available
        return True

    def _is_doctor_available(self, doctor: str, date: str, shift: str) -> bool:
        """Check if a doctor is available for a specific date and shift (using cache)."""
        key = (doctor, date, shift)
        return self._availability_cache.get(key, True)  # Default to available if not in cache
    
    def _can_assign_to_shift(self, doctor: str, shift: str) -> bool:
        """
        Check if a doctor can be assigned to a shift based on their preferences.
        Implements the super hard constraint that:
        - Doctors with specific preferences should ONLY work those shifts
        - Night shifts can ONLY be worked by doctors with night preference or no preference
        
        Args:
            doctor: The doctor's name
            shift: The shift to check
            
        Returns:
            True if the doctor can be assigned to this shift, False otherwise
        """
        pref = self.doctor_info.get(doctor, {}).get("pref", "None")
        
        # No preference - can work any shift
        if pref == "None":
            return True
        
        # Specific preference - ONLY allow matching shifts
        if pref != "None":
            return pref == f"{shift} Only"
        
        return True
    
    def _generate_dates_for_month(self, month: int) -> List[str]:
        """Generate all dates for the specified month in self.year in YYYY-MM-DD format."""
        if month < 1 or month > 12:
            raise ValueError(f"Invalid month: {month}. Month must be between 1 and 12.")
            
        all_dates = []
        start_date = datetime.date(self.year, month, 1)
        
        # Find the last day of the month
        if month == 12:
            end_date = datetime.date(self.year, 12, 31)
        else:
            end_date = datetime.date(self.year, month + 1, 1) - datetime.timedelta(days=1)
        
        days_in_month = (end_date - start_date).days + 1
        
        for i in range(days_in_month):
            current = start_date + datetime.timedelta(days=i)
            all_dates.append(current.isoformat())
            
        return all_dates

    def _identify_weekends(self) -> Set[str]:
        """Identify all weekend dates within the month."""
        weekends = set()
        for date_str in self.all_dates:
            d = datetime.date.fromisoformat(date_str)
            if d.weekday() >= 5:  # Saturday=5, Sunday=6
                weekends.add(date_str)
        return weekends

    # -------------------------------
    # Tabu Search Helper Functions
    # -------------------------------

    def generate_initial_schedule(self) -> Dict[str, Dict[str, List[str]]]:
        """
        Generate an initial schedule for the month.
        For each date and shift, assign the required number of doctors randomly,
        ONLY choosing those who are available and not already assigned on that day.
        Ensures no doctor appears more than once in the same shift.
        """
        doctor_names = [doc["name"] for doc in self.doctors]
        schedule = {}
        
        # Track assignments for workload balancing
        assignments = {doctor: 0 for doctor in doctor_names}
        weekend_holiday_assignments = {doctor: 0 for doctor in doctor_names}
        
        # Track consecutive days worked
        consecutive_days = {doctor: 0 for doctor in doctor_names}
        last_worked_day = {doctor: None for doctor in doctor_names}
        
        # Process shifts in order of constraint difficulty (most constrained first)
        shift_order = ["Evening", "Night", "Day"]
        
        for date in self.all_dates:
            is_weekend_or_holiday = date in self.weekends or date in self.holidays
            
            schedule[date] = {}
            assigned_today = set()  # Track doctors assigned on this date
            
            # Process shifts in the determined order
            for shift in shift_order:
                # Check if this date has a template with this shift
                has_shift_template = hasattr(self, 'shift_template') and date in self.shift_template
                shift_in_template = has_shift_template and shift in self.shift_template[date]
                
                # Skip this shift if it's not in the template (and we have a template)
                if has_shift_template and not shift_in_template:
                    continue
                
                # Get the required doctor count from the template or defaults
                if shift_in_template:
                    required = self.shift_template[date][shift].get('slots', self.shift_requirements[shift])
                else:
                    required = self.shift_requirements[shift]
                
                # Skip if no slots required for this shift
                if required <= 0:
                    continue
                
                # Get doctors with preference for this shift first
                pref_key = f"{shift} Only"
                preferred_docs = [
                    d for d in self.doctors_by_preference.get(pref_key, [])
                    if d not in assigned_today and self._is_doctor_available(d, date, shift)
                ]
                
                # For Evening shift with multiple preferences, distribute fairly
                if shift == "Evening" and len(preferred_docs) > required:
                    # Sort by how often they've been assigned already
                    preferred_docs.sort(key=lambda d: assignments[d])
                    
                # For weekend/holiday shifts, prioritize juniors
                if is_weekend_or_holiday:
                    # Separate seniors and juniors
                    junior_candidates = [d for d in preferred_docs if d in self.junior_doctors]
                    senior_candidates = [d for d in preferred_docs if d in self.senior_doctors]
                    
                    # Use a probabilistic approach instead of strict prioritization
                    if random.random() < 0.7:  # 70% chance to favor juniors for holidays
                        # Interleave juniors and seniors with a 2:1 bias toward juniors
                        preferred_docs = []
                        j_idx, s_idx = 0, 0
                        while j_idx < len(junior_candidates) or s_idx < len(senior_candidates):
                            # Add two juniors then one senior (2:1 ratio)
                            if j_idx < len(junior_candidates):
                                preferred_docs.append(junior_candidates[j_idx])
                                j_idx += 1
                            if j_idx < len(junior_candidates):
                                preferred_docs.append(junior_candidates[j_idx])
                                j_idx += 1
                            if s_idx < len(senior_candidates):
                                preferred_docs.append(senior_candidates[s_idx])
                                s_idx += 1
                    else:
                        # Sometimes just randomize them
                        preferred_docs = junior_candidates + senior_candidates
                        random.shuffle(preferred_docs)
                
                # Take the required number of preferred doctors if available
                preferred_selections = []
                if preferred_docs:
                    # Ensure no duplicates
                    unique_preferred = []
                    for doc in preferred_docs:
                        if doc not in unique_preferred:
                            unique_preferred.append(doc)
                    
                    preferred_selections = unique_preferred[:required]
                
                # If we need more doctors, get other available doctors
                remaining_required = required - len(preferred_selections)
                other_selections = []

                if remaining_required > 0:
                    # Get available doctors who aren't already assigned today
                    other_candidates = [
                        d for d in doctor_names 
                        if d not in preferred_docs and 
                        d not in assigned_today and 
                        self._is_doctor_available(d, date, shift) and
                        # NEW: Check preference compatibility with shift
                        self._can_assign_to_shift(d, shift)
                    ]
                    
                    # Sort by consecutive days worked (prefer those with fewer consecutive days)
                    other_candidates.sort(key=lambda d: (consecutive_days[d], assignments[d]))
                    
                    # For weekend/holiday shifts, prioritize juniors among other candidates too
                    if is_weekend_or_holiday:
                        junior_others = [d for d in other_candidates if d in self.junior_doctors]
                        senior_others = [d for d in other_candidates if d in self.senior_doctors]
                        
                        # Sort each group by assignments, then combine
                        junior_others.sort(key=lambda d: assignments[d])
                        senior_others.sort(key=lambda d: assignments[d])
                        
                        other_candidates = junior_others + senior_others
                    
                    # Take what we need from other candidates, ensuring uniqueness
                    other_selections = []
                    for doc in other_candidates:
                        if len(other_selections) >= remaining_required:
                            break
                        if doc not in other_selections:
                            other_selections.append(doc)
                
                # Combine and assign doctors to this shift with uniqueness check
                assigned = []
                for doc in preferred_selections + other_selections:
                    if doc not in assigned:  # Ensure no duplicates
                        assigned.append(doc)
                
                # If we still don't have enough, try to relax "assigned today" constraint
                remaining_required = required - len(assigned)
                if remaining_required > 0:
                    # Consider doctors already assigned today but available for this shift
                    additional_candidates = [
                        d for d in doctor_names
                        if d not in assigned and
                        d in assigned_today and
                        self._is_doctor_available(d, date, shift)
                    ]
                    
                    # Pick some with uniqueness check
                    for doc in additional_candidates:
                        if len(assigned) >= required:
                            break
                        if doc not in assigned:  # Ensure no duplicates
                            assigned.append(doc)
                
                # Final uniqueness verification (belt and suspenders)
                final_assigned = []
                seen = set()
                for doc in assigned:
                    if doc not in seen:
                        final_assigned.append(doc)
                        seen.add(doc)
                
                # If still not enough, log the issue but continue with best effort
                if len(final_assigned) < required:
                    logger.warning(f"Not enough available doctors for {date}, {shift}. Need {required}, have {len(final_assigned)}")
                
                # Update the schedule
                schedule[date][shift] = final_assigned
                assigned_today.update(final_assigned)
                
                # Update assignment tracking
                for doctor in final_assigned:
                    assignments[doctor] += 1
                    
                    if is_weekend_or_holiday:
                        weekend_holiday_assignments[doctor] += 1
                    
                    # Update consecutive days tracking
                    d_date = datetime.date.fromisoformat(date)
                    if last_worked_day[doctor] is not None:
                        last_d_date = datetime.date.fromisoformat(last_worked_day[doctor])
                        if (d_date - last_d_date).days == 1:
                            consecutive_days[doctor] += 1
                        else:
                            consecutive_days[doctor] = 1
                    else:
                        consecutive_days[doctor] = 1
                    
                    last_worked_day[doctor] = date
        
        return schedule

    def objective(self, schedule: Dict[str, Dict[str, List[str]]]) -> float:
        """
        Compute the total penalty cost for a monthly schedule.
        Lower cost indicates fewer constraint violations.
        
        This version is specialized for monthly scheduling with:
        1. Higher penalties for workload balance within the month
        2. Stronger preference adherence enforcement
        3. Tracking consecutive workdays
        4. More aggressive enforcement of equitable weekend/holiday distribution
        5. Severe penalty for duplicate doctors in the same shift
        """
        cost = 0.0
        doctor_names = [doc["name"] for doc in self.doctors]

        # Pre-compute doctor assignments by date for faster access
        doctor_assignments = {}
        for doctor in doctor_names:
            doctor_assignments[doctor] = {}
            for date in self.all_dates:
                if date in schedule:
                    assigned_shift = None
                    for shift in self.shifts:
                        if shift in schedule[date] and doctor in schedule[date][shift]:
                            assigned_shift = shift
                            break
                    doctor_assignments[doctor][date] = assigned_shift

        # 1. Availability Violation Penalty (hard constraint)
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    if not self._is_doctor_available(doctor, date, shift):
                        cost += self.w_avail

        # 2a. One shift per day penalty (hard constraint)
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            assignments = {}
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue

                shift_doctors = schedule[date][shift]
                
                for doctor in shift_doctors:
                    assignments[doctor] = assignments.get(doctor, 0) + 1
                    
            for count in assignments.values():
                if count > 1:
                    cost += self.w_one_shift * (count - 1)

        # 2b. Duplicate doctor in the same shift penalty (severe constraint violation)
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                # Check for duplicates in this shift
                shift_doctors = schedule[date][shift]
                unique_doctors = set(shift_doctors)
                if len(shift_doctors) > len(unique_doctors):
                    # Apply severe penalty for each duplicate
                    duplicate_count = len(shift_doctors) - len(unique_doctors)
                    cost += self.w_duplicate_penalty * duplicate_count
                    
                    # Log the issue
                    duplicates = [d for d in shift_doctors if shift_doctors.count(d) > 1]
                    logger.warning(f"Duplicate doctor(s) detected in {date}, {shift}: {duplicates}")

        # 3. Rest constraints: penalize a night shift followed by a day or evening shift (hard constraint)
        for i in range(len(self.all_dates) - 1):
            current_date = self.all_dates[i]
            next_date = self.all_dates[i + 1]
            
            if current_date not in schedule or "Night" not in schedule[current_date]:
                continue
                
            if next_date not in schedule:
                continue
                
            for doctor in schedule[current_date].get("Night", []):
                if (doctor in schedule[next_date].get("Day", []) or 
                    doctor in schedule[next_date].get("Evening", [])):
                    cost += self.w_rest

        # 3a. NEW: Explicitly check for consecutive night shifts (super hard constraint)
        for i in range(len(self.all_dates) - 1):
            current_date = self.all_dates[i]
            next_date = self.all_dates[i + 1]
            
            if current_date not in schedule or "Night" not in schedule[current_date]:
                continue
                
            if next_date not in schedule or "Night" not in schedule[next_date]:
                continue
                
            for doctor in schedule[current_date].get("Night", []):
                if doctor in schedule[next_date].get("Night", []):
                    # Extremely severe penalty for consecutive night shifts
                    cost += self.w_avail  # Using the highest weight (100000)

        # 3b. NEW: Check for evening shift followed by day shift (soft constraint)
        for i in range(len(self.all_dates) - 1):
            current_date = self.all_dates[i]
            next_date = self.all_dates[i + 1]
            
            if current_date not in schedule or "Evening" not in schedule[current_date]:
                continue
            
            if next_date not in schedule or "Day" not in schedule[next_date]:
                continue
            
            for doctor in schedule[current_date].get("Evening", []):
                if doctor in schedule[next_date].get("Day", []):
                    cost += self.w_evening_day

        # 3c. NEW: Check for night shift followed by a day off then day shift (soft constraint)
        for i in range(len(self.all_dates) - 2):
            first_date = self.all_dates[i]
            middle_date = self.all_dates[i + 1]
            last_date = self.all_dates[i + 2]
            
            if first_date not in schedule or "Night" not in schedule[first_date]:
                continue
            
            if last_date not in schedule or "Day" not in schedule[last_date]:
                continue
            
            for doctor in schedule[first_date].get("Night", []):
                # Check if doctor is not working on middle date
                working_middle = False
                if middle_date in schedule:
                    for shift in self.shifts:
                        if shift in schedule[middle_date] and doctor in schedule[middle_date][shift]:
                            working_middle = True
                            break
                
                if not working_middle:
                    # Check if doctor is working day shift on last date
                    if doctor in schedule[last_date].get("Day", []):
                        cost += self.w_night_day_gap

        # 4. Long holiday constraint for seniors (hard constraint)
        for date in self.all_dates:
            if date in self.holidays and self.holidays[date] == "Long":
                for doctor in doctor_names:
                    if self.doctor_info[doctor]["seniority"] == "Senior":
                        if (date in schedule and 
                            any(shift in schedule[date] and doctor in schedule[date][shift] 
                                for shift in self.shifts)):
                            cost += self.w_senior_holiday

        # 5. NEW: Consecutive shift limits
        # Penalize doctors working more than max_consecutive_shifts days in a row
        consecutive_working_days = {doctor: 0 for doctor in doctor_names}
        
        for date in sorted(self.all_dates):
            # First, increment consecutive days for doctors working today
            working_today = set()
            if date in schedule:
                for shift in self.shifts:
                    if shift in schedule[date]:
                        working_today.update(schedule[date][shift])
            
            for doctor in doctor_names:
                if doctor in working_today:
                    consecutive_working_days[doctor] += 1
                    # Penalize if exceeding maximum consecutive days
                    if consecutive_working_days[doctor] > self.max_consecutive_shifts:
                        excess = consecutive_working_days[doctor] - self.max_consecutive_shifts
                        cost += self.w_consecutive_shifts * (excess ** 2)
                else:
                    # Reset counter if not working today
                    consecutive_working_days[doctor] = 0

        # 6. Monthly workload balance - more important for monthly scheduling
        monthly_hours = self._calculate_monthly_hours(schedule)
        
        # Calculate junior and senior hours separately
        junior_hours = {doc: monthly_hours[doc].get(self.month, 0) for doc in self.junior_doctors}
        senior_hours = {doc: monthly_hours[doc].get(self.month, 0) for doc in self.senior_doctors}
        
        # Calculate overall monthly variance across all doctors
        all_hours = [hours.get(self.month, 0) for doctor, hours in monthly_hours.items()]
        active_hours = [h for h in all_hours if h > 0]
        
        if active_hours:
            max_hours = max(active_hours)
            min_hours = min(active_hours)
            variance = max_hours - min_hours
            
            # Stronger penalty for monthly variance exceeding target
            if variance > self.max_monthly_variance:
                excess = variance - self.max_monthly_variance
                cost += self.w_balance * (excess ** 2)
        
        # Calculate average hours for junior and senior doctors
        avg_junior = sum(junior_hours.values()) / max(len(junior_hours), 1)
        avg_senior = sum(senior_hours.values()) / max(len(senior_hours), 1)
        
        # Check if seniors are working more than juniors
        if junior_hours and senior_hours:
            # Penalize if seniors work more than juniors
            if avg_senior > avg_junior:
                cost += self.w_senior_workload * ((avg_senior - avg_junior) ** 2)
            
            # Also penalize if seniors are not working less by the target amount
            if avg_senior > (avg_junior - self.senior_junior_monthly_diff):
                diff_gap = (avg_senior - (avg_junior - self.senior_junior_monthly_diff))
                cost += self.w_senior_workload * diff_gap

        # 7. Weekend/Holiday fairness
        wh_hours = self._calculate_weekend_holiday_hours(schedule)

        # Calculate hours for each group
        junior_wh_hours = {doc: wh_hours[doc] for doc in self.junior_doctors}
        senior_wh_hours = {doc: wh_hours[doc] for doc in self.senior_doctors}

        # Calculate within-group variance to ensure fairness within each group
        if junior_wh_hours:
            j_values = list(junior_wh_hours.values())
            junior_wh_variance = max(j_values) - min(j_values) if j_values else 0
            cost += self.w_wh * (junior_wh_variance ** 1.5)

        if senior_wh_hours:
            s_values = list(senior_wh_hours.values())
            senior_wh_variance = max(s_values) - min(s_values) if s_values else 0
            cost += self.w_wh * (senior_wh_variance ** 1.5)

        # Calculate averages for comparing groups
        avg_junior_wh = sum(junior_wh_hours.values()) / max(len(junior_wh_hours), 1)
        avg_senior_wh = sum(senior_wh_hours.values()) / max(len(senior_wh_hours), 1)

        # Instead of strict adherence to absolute targets, use a ratio approach
        target_ratio = 0.85  # Seniors should have ~85% of the weekend/holiday hours that juniors have

        # Calculate the ideal senior average based on junior average
        ideal_senior_avg = avg_junior_wh * target_ratio

        # Add a mild penalty if senior average deviates significantly from ideal
        if avg_senior_wh > avg_junior_wh:  # Seniors should never have more than juniors
            # Linear penalty if seniors work more than juniors
            cost += self.w_wh * 2 * (avg_senior_wh - avg_junior_wh)
        elif avg_senior_wh < ideal_senior_avg * 0.8:  # Too few shifts for seniors
            # Mild penalty if seniors work less than 80% of their ideal target
            cost += self.w_wh * (ideal_senior_avg * 0.8 - avg_senior_wh)
        
        # 8. Preference Adherence Penalty
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                
                shift_doctors = schedule[date][shift]
                
                # Super strict preference checking
                for doctor in shift_doctors:
                    pref = self.doctor_info[doctor]["pref"]
                    seniority = self.doctor_info[doctor]["seniority"]
                    
                    # Skip if no preference
                    if pref == "None":
                        continue
                    
                    # Exact preference match check
                    matches_pref = (pref == f"{shift} Only")
                    
                    # Apply extremely severe penalty for preference violations
                    if not matches_pref:
                        cost += self.w_pref.get(seniority, self.w_pref["Junior"]) * 2  # Double penalty as extra enforcement
                        
                        # Extra penalty for evening pref doctors assigned to night shifts
                        if pref == "Evening Only" and shift == "Night":
                            cost += self.w_avail  # Apply availability-level penalty (100000)
                            
                        # Extra penalty for day pref doctors assigned to night shifts
                        if pref == "Day Only" and shift == "Night":
                            cost += self.w_avail  # Apply availability-level penalty (100000)
        
        # 9. Fairness between doctors with same preference
        for pref_type in ["Evening Only", "Day Only", "Night Only"]:
            doctors_with_pref = self.doctors_by_preference.get(pref_type, [])
            
            if len(doctors_with_pref) > 1:  # Only check if multiple doctors share a preference
                # Get counts of preferred shifts for each doctor
                counts = {}
                for doc in doctors_with_pref:
                    # Count shifts of this doctor's preference
                    shift_type = pref_type.split()[0]  # "Evening", "Day", "Night"
                    
                    count = 0
                    for date in schedule:
                        if shift_type in schedule[date] and doc in schedule[date][shift_type]:
                            count += 1
                    
                    counts[doc] = count
                
                if counts:
                    # Calculate fairness metrics
                    values = list(counts.values())
                    if values:
                        max_val = max(values)
                        min_val = min(values)
                        variance = max_val - min_val
                        
                        # Penalize unfair distribution among same-preference doctors
                        multiplier = len(doctors_with_pref) / 2 
                        if variance > 3:  # Allow small differences
                            cost += self.w_preference_fairness * multiplier * ((variance - 3) ** 2)
        
        # 10. Distribution of shifts across the month
        # A good schedule should distribute each doctor's shifts evenly across the month
        # Calculate how many of each doctor's shifts should be in each week
        weeks_in_month = len(self.all_dates) // 7 + (1 if len(self.all_dates) % 7 > 0 else 0)
        
        if weeks_in_month > 1:
            # Get doctor's total shifts in the month
            doctor_total_shifts = {doctor: 0 for doctor in doctor_names}
            
            for date in self.all_dates:
                if date in schedule:
                    for shift in self.shifts:
                        if shift in schedule[date]:
                            for doctor in schedule[date][shift]:
                                doctor_total_shifts[doctor] = doctor_total_shifts.get(doctor, 0) + 1
            
            # Group dates by week
            week_dates = defaultdict(list)
            for date in self.all_dates:
                d = datetime.date.fromisoformat(date)
                # Calculate week number (0-indexed) within the month
                week_num = (d.day - 1) // 7
                week_dates[week_num].append(date)
            
            # Count shifts per doctor per week
            doctor_week_shifts = {doctor: {week: 0 for week in range(weeks_in_month)} 
                                for doctor in doctor_names}
            
            for week, dates in week_dates.items():
                for date in dates:
                    if date in schedule:
                        for shift in self.shifts:
                            if shift in schedule[date]:
                                for doctor in schedule[date][shift]:
                                    doctor_week_shifts[doctor][week] += 1
            
            # Penalize uneven distribution across weeks
            w_weekly_balance = 15  # Weight for weekly balance penalty
            
            for doctor, total in doctor_total_shifts.items():
                if total > 0:
                    # Calculate ideal shifts per week
                    ideal_per_week = total / weeks_in_month
                    
                    # Calculate variance from ideal
                    for week, count in doctor_week_shifts[doctor].items():
                        variance = abs(count - ideal_per_week)
                        
                        # Only penalize significant variance (over 1.5 shifts from ideal)
                        if variance > 1.5:
                            cost += w_weekly_balance * ((variance - 1.5) ** 2)
        
        return cost

    def _calculate_monthly_hours(self, schedule):
        """Calculate monthly hours for each doctor more efficiently."""
        doctor_names = [doc["name"] for doc in self.doctors]
        monthly_hours = {doctor: {} for doctor in doctor_names}
        
        # Only calculate for this month
        for doctor in doctor_names:
            monthly_hours[doctor][self.month] = 0
                
        # Calculate hours from schedule
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    monthly_hours[doctor][self.month] += self.shift_hours[shift]
                        
        return monthly_hours
    
    def _calculate_weekend_holiday_hours(self, schedule):
        """Calculate weekend and holiday hours for each doctor within the month."""
        doctor_names = [doc["name"] for doc in self.doctors]
        wh_hours = {doctor: 0 for doctor in doctor_names}
        
        for date in self.all_dates:
            # Skip if not weekend or holiday
            if date not in self.weekends and date not in self.holidays:
                continue
                
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                for doctor in schedule[date][shift]:
                    wh_hours[doctor] += self.shift_hours[shift]
                    
        return wh_hours

    def get_neighbors(self, current_schedule: Dict[str, Dict[str, List[str]]],
                  num_moves: int = 20) -> List[Tuple[Dict[str, Dict[str, List[str]]], Tuple[str, str, str, str]]]:
        """
        Generate neighbor schedules by selecting a random (date, shift) slot and replacing one doctor.
        Only consider available doctors for each shift based on their availability constraints.
        Ensures no duplicate doctors appear in the same shift.
        """
        neighbors = []
        attempts = 0
        max_attempts = num_moves * 10  # Allow more attempts to find valid moves
        
        # Pre-calculate workload to inform better moves
        monthly_hours = self._calculate_monthly_hours(current_schedule)
        weekend_holiday_hours = self._calculate_weekend_holiday_hours(current_schedule)
        
        # Track which doctors have preference for which shifts
        evening_pref_docs = [doc for doc in self.doctors if doc.get("pref", "None") == "Evening Only"]
        evening_pref_names = [doc["name"] for doc in evening_pref_docs]
        
        # Calculate preference satisfaction
        preference_satisfaction = defaultdict(int)
        for date in self.all_dates:
            if date not in current_schedule:
                continue
                
            for shift in self.shifts:
                if shift not in current_schedule[date]:
                    continue
                
                for doctor in current_schedule[date][shift]:
                    pref = self.doctor_info[doctor]["pref"]
                    if pref == f"{shift} Only":
                        preference_satisfaction[doctor] += 1
        
        # Track consecutive days worked
        consecutive_days = self._calculate_consecutive_days(current_schedule)
        
        # More intelligent neighbor generation to target problem areas
        while len(neighbors) < num_moves and attempts < max_attempts:
            attempts += 1
            
            # Initialize variables to None to check later
            date = None
            shift = None
            idx = None
            old_doctor = None
            new_doctor = None
            move_successful = False
            
            # Decide which type of move to prioritize based on issues
            move_type = random.choices(
                ["evening_preference", "senior_workload", "monthly_balance", 
                "weekend_holiday_balance", "consecutive_days", "fix_duplicates", "random"],
                weights=[0.25, 0.2, 0.25, 0.15, 0.1, 0.5, 0.05],  # Added high weight for fix_duplicates
                k=1
            )[0]
            
            # 0. New high-priority move type - check for duplicate doctors in shifts
            if move_type == "fix_duplicates":
                duplicates_found = False
                for d in self.all_dates:
                    if d not in current_schedule:
                        continue
                    
                    for s in self.shifts:
                        if s not in current_schedule[d]:
                            continue
                            
                        # Check for duplicates in this shift
                        shift_doctors = current_schedule[d][s]
                        seen_doctors = set()
                        duplicate_indices = []
                        
                        for i, doctor in enumerate(shift_doctors):
                            if doctor in seen_doctors:
                                duplicate_indices.append(i)
                            else:
                                seen_doctors.add(doctor)
                        
                        if duplicate_indices:
                            duplicates_found = True
                            # Get a duplicate doctor to replace
                            index = random.choice(duplicate_indices)
                            old_doc = shift_doctors[index]
                            
                            # Find alternative doctors who aren't in this shift
                            available_doctors = []
                            for doctor in [doc["name"] for doc in self.doctors]:
                                # Skip doctors already in this shift
                                if doctor in shift_doctors:
                                    continue
                                    
                                # Must be available for this shift
                                if not self._is_doctor_available(doctor, d, s):
                                    continue
                                    
                                # Check if not already assigned to another shift today
                                already_assigned = False
                                for other_shift in self.shifts:
                                    if other_shift == s:
                                        continue
                                    if other_shift in current_schedule[d] and doctor in current_schedule[d][other_shift]:
                                        already_assigned = True
                                        break
                                        
                                if not already_assigned:
                                    available_doctors.append(doctor)
                            
                            if available_doctors:
                                new_doc = random.choice(available_doctors)
                                
                                # Save the values
                                date = d
                                shift = s
                                idx = index
                                old_doctor = old_doc
                                new_doctor = new_doc
                                move_successful = True
                                # Check that this move doesn't create consecutive night shifts
                                if shift == "Night" and new_doctor is not None:
                                    # Check if doctor worked night shift yesterday
                                    date_idx = self.all_dates.index(date)
                                    if date_idx > 0:
                                        prev_date = self.all_dates[date_idx - 1]
                                        if (prev_date in current_schedule and 
                                            "Night" in current_schedule[prev_date] and 
                                            new_doctor in current_schedule[prev_date]["Night"]):
                                            move_successful = False  # Invalidate this move
                                    
                                    # Check if doctor would work night shift tomorrow
                                    if date_idx < len(self.all_dates) - 1:
                                        next_date = self.all_dates[date_idx + 1]
                                        if (next_date in current_schedule and 
                                            "Night" in current_schedule[next_date] and 
                                            new_doctor in current_schedule[next_date]["Night"]):
                                            move_successful = False  # Invalidate this move
                                break
                    
                    if duplicates_found and move_successful:
                        break
                    
            # 1. Evening shift preference issues
            elif move_type == "evening_preference" and evening_pref_names:
                # Find an evening shift that doesn't have a preference doctor
                potential_dates = []
                for d in self.all_dates:
                    if d in current_schedule and "Evening" in current_schedule[d]:
                        # Check if there's a non-preference doctor in this evening shift
                        current_doctors = current_schedule[d]["Evening"]
                        if any(doc not in evening_pref_names for doc in current_doctors):
                            potential_dates.append(d)
                
                if potential_dates:
                    date = random.choice(potential_dates)
                    shift = "Evening"
                    
                    # Find a non-preference doctor to replace
                    current_assignment = current_schedule[date][shift]
                    non_pref_indices = [i for i, doc in enumerate(current_assignment) 
                                    if doc not in evening_pref_names]
                    
                    if non_pref_indices:
                        idx = random.choice(non_pref_indices)
                        old_doctor = current_assignment[idx]
                        
                        # Find an evening preference doctor who's available and not already assigned
                        available_pref_docs = []
                        for doctor in evening_pref_names:
                            # Skip if already in this shift (would cause duplicate)
                            if doctor in current_assignment:
                                continue
                                
                            # Skip if same as doctor being replaced (no-op)
                            if doctor == old_doctor:
                                continue
                                
                            # Check if available and not already assigned to another shift that day
                            if not self._is_doctor_available(doctor, date, shift):
                                continue
                                
                            already_assigned = False
                            for other_shift in self.shifts:
                                if other_shift == shift:
                                    continue
                                if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                                    already_assigned = True
                                    break
                            
                            if not already_assigned:
                                available_pref_docs.append(doctor)
                        
                        if available_pref_docs:
                            # Choose the preference doctor who has the fewest preferred shifts so far
                            available_pref_docs.sort(key=lambda d: preference_satisfaction.get(d, 0))
                            new_doctor = available_pref_docs[0]
                            move_successful = True
                            # Check that this move doesn't create consecutive night shifts
                            if shift == "Night" and new_doctor is not None:
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        new_doctor in current_schedule[prev_date]["Night"]):
                                        move_successful = False  # Invalidate this move
                                
                                # Check if doctor would work night shift tomorrow
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        new_doctor in current_schedule[next_date]["Night"]):
                                        move_successful = False  # Invalidate this move
            
            # 2. Target senior workload issues
            elif move_type == "senior_workload":
                # Focus on weekend/holiday shifts with seniors
                potential_moves = []
                
                for d in self.all_dates:
                    is_wh = d in self.weekends or d in self.holidays
                    if not is_wh or d not in current_schedule:
                        continue
                    
                    for s in self.shifts:
                        if s not in current_schedule[d]:
                            continue
                        
                        # Find senior doctors in this shift
                        seniors_in_shift = [i for i, doc in enumerate(current_schedule[d][s])
                                        if doc in self.senior_doctors]
                        
                        if seniors_in_shift:
                            potential_moves.append((d, s, seniors_in_shift))
                
                if potential_moves:
                    # Choose a date, shift, and senior doctor to replace
                    date, shift, senior_indices = random.choice(potential_moves)
                    idx = random.choice(senior_indices)
                    old_doctor = current_schedule[date][shift][idx]
                    
                    # Find a junior doctor to replace the senior
                    available_juniors = []
                    for doctor in self.junior_doctors:
                        # Skip if already in this shift (would cause duplicate)
                        if doctor in current_schedule[date][shift]:
                            continue
                            
                        # Skip if same as doctor being replaced (no-op)
                        if doctor == old_doctor:
                            continue
                            
                        # Check if available and not already assigned
                        if not self._is_doctor_available(doctor, date, shift):
                            continue
                            
                        already_assigned = False
                        for other_shift in self.shifts:
                            if other_shift == shift:
                                continue
                            if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                                already_assigned = True
                                break
                        
                        if not already_assigned:
                            available_juniors.append(doctor)
                    
                    if available_juniors:
                        # Select a junior with lower weekend/holiday hours
                        available_juniors.sort(key=lambda d: weekend_holiday_hours.get(d, 0))
                        new_doctor = available_juniors[0] 
                        move_successful = True
                        # Check that this move doesn't create consecutive night shifts
                        if shift == "Night" and new_doctor is not None:
                            # Check if doctor worked night shift yesterday
                            date_idx = self.all_dates.index(date)
                            if date_idx > 0:
                                prev_date = self.all_dates[date_idx - 1]
                                if (prev_date in current_schedule and 
                                    "Night" in current_schedule[prev_date] and 
                                    new_doctor in current_schedule[prev_date]["Night"]):
                                    move_successful = False  # Invalidate this move
                            
                            # Check if doctor would work night shift tomorrow
                            if date_idx < len(self.all_dates) - 1:
                                next_date = self.all_dates[date_idx + 1]
                                if (next_date in current_schedule and 
                                    "Night" in current_schedule[next_date] and 
                                    new_doctor in current_schedule[next_date]["Night"]):
                                    move_successful = False  # Invalidate this move
            
            # 3. Target monthly balance issues
            elif move_type == "monthly_balance":
                # Find doctors with highest and lowest monthly hours
                month_doctors = {doc: hrs.get(self.month, 0) for doc, hrs in monthly_hours.items()}
                
                if month_doctors:
                    # Sort doctors by hours in this month
                    sorted_docs = sorted(month_doctors.items(), key=lambda x: x[1])
                    
                    if len(sorted_docs) >= 2:
                        # Try to move hours from highest to lowest
                        lowest_doc, lowest_hours = sorted_docs[0]
                        highest_doc, highest_hours = sorted_docs[-1]
                        
                        # Only proceed if there's a significant gap
                        if highest_hours - lowest_hours >= 8:
                            # Find a date where the highest doctor works
                            potential_moves = []
                            
                            for d in self.all_dates:
                                if d not in current_schedule:
                                    continue
                                
                                for s in self.shifts:
                                    if s not in current_schedule[d]:
                                        continue
                                    
                                    if highest_doc in current_schedule[d][s]:
                                        # Found a shift where the highest doctor works
                                        index = current_schedule[d][s].index(highest_doc)
                                        potential_moves.append((d, s, index))
                            
                            if potential_moves:
                                # Pick a move
                                date, shift, idx = random.choice(potential_moves)
                                old_doctor = highest_doc
                                
                                # Make sure the lowest doctor isn't already in this shift (would cause duplicate)
                                current_shift_doctors = current_schedule[date][shift]
                                
                                if lowest_doc not in current_shift_doctors:
                                    # Check if the lowest doctor is available for this slot
                                    if self._is_doctor_available(lowest_doc, date, shift):
                                        # Check if they're not already assigned to another shift that day
                                        already_assigned = False
                                        for other_shift in self.shifts:
                                            if other_shift == shift:
                                                continue
                                            if other_shift in current_schedule[date] and lowest_doc in current_schedule[date][other_shift]:
                                                already_assigned = True
                                                break
                                        
                                        if not already_assigned:
                                            new_doctor = lowest_doc
                                            move_successful = True
                                        else:
                                            # Find another doctor with low hours
                                            available_docs = []
                                            for doctor, hours in sorted_docs[:len(sorted_docs)//2]:  # Consider lowest half
                                                # Skip if already in this shift (would cause duplicate)
                                                if doctor in current_shift_doctors:
                                                    continue
                                                    
                                                if doctor == old_doctor:
                                                    continue
                                                    
                                                if not self._is_doctor_available(doctor, date, shift):
                                                    continue
                                                    
                                                already_assigned = False
                                                for other_shift in self.shifts:
                                                    if other_shift == shift:
                                                        continue
                                                    if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                                                        already_assigned = True
                                                        break
                                                    
                                                if not already_assigned:
                                                    available_docs.append(doctor)
                                            
                                            if available_docs:
                                                new_doctor = random.choice(available_docs)
                                                move_successful = True
                                                # Check that this move doesn't create consecutive night shifts
                                                if shift == "Night" and new_doctor is not None:
                                                    # Check if doctor worked night shift yesterday
                                                    date_idx = self.all_dates.index(date)
                                                    if date_idx > 0:
                                                        prev_date = self.all_dates[date_idx - 1]
                                                        if (prev_date in current_schedule and 
                                                            "Night" in current_schedule[prev_date] and 
                                                            new_doctor in current_schedule[prev_date]["Night"]):
                                                            move_successful = False  # Invalidate this move
                                                    
                                                    # Check if doctor would work night shift tomorrow
                                                    if date_idx < len(self.all_dates) - 1:
                                                        next_date = self.all_dates[date_idx + 1]
                                                        if (next_date in current_schedule and 
                                                            "Night" in current_schedule[next_date] and 
                                                            new_doctor in current_schedule[next_date]["Night"]):
                                                            move_successful = False  # Invalidate this move
                    
            # 4. Weekend/Holiday balance move
            elif move_type == "weekend_holiday_balance":
                # Calculate current weekend/holiday hours for all doctors
                wh_hours = weekend_holiday_hours
                
                # Sort doctors by weekend/holiday hours (within their seniority group)
                junior_wh = [(doc, wh_hours.get(doc, 0)) for doc in self.junior_doctors]
                senior_wh = [(doc, wh_hours.get(doc, 0)) for doc in self.senior_doctors]
                
                junior_wh.sort(key=lambda x: x[1])  # Sort by hours (ascending)
                senior_wh.sort(key=lambda x: x[1])  # Sort by hours (ascending)
                
                # Try to find a weekend/holiday shift to move from highest to lowest
                potential_moves = []
                
                # 1. First try to balance juniors
                if len(junior_wh) >= 2 and junior_wh[-1][1] - junior_wh[0][1] > 16:
                    highest_doc, highest_hours = junior_wh[-1]
                    lowest_doc, lowest_hours = junior_wh[0]
                    
                    # Find weekend/holiday shifts where the highest doctor works
                    for d in self.all_dates:
                        is_wh = d in self.weekends or d in self.holidays
                        if not is_wh or d not in current_schedule:
                            continue
                        
                        for s in self.shifts:
                            if s not in current_schedule[d]:
                                continue
                            
                            if highest_doc in current_schedule[d][s]:
                                index = current_schedule[d][s].index(highest_doc)
                                potential_moves.append((d, s, index, highest_doc, lowest_doc))
                
                # 2. Then try to balance seniors
                if len(senior_wh) >= 2 and senior_wh[-1][1] - senior_wh[0][1] > 16:
                    highest_doc, highest_hours = senior_wh[-1]
                    lowest_doc, lowest_hours = senior_wh[0]
                    
                    # Find weekend/holiday shifts where the highest doctor works
                    for d in self.all_dates:
                        is_wh = d in self.weekends or d in self.holidays
                        if not is_wh or d not in current_schedule:
                            continue
                        
                        for s in self.shifts:
                            if s not in current_schedule[d]:
                                continue
                            
                            if highest_doc in current_schedule[d][s]:
                                index = current_schedule[d][s].index(highest_doc)
                                potential_moves.append((d, s, index, highest_doc, lowest_doc))
                
                # 3. Finally, ensure proper junior/senior split
                if junior_wh and senior_wh:
                    avg_junior = sum(hrs for _, hrs in junior_wh) / len(junior_wh)
                    avg_senior = sum(hrs for _, hrs in senior_wh) / len(senior_wh)
                    
                    # If seniors are working too much compared to juniors
                    if avg_senior > avg_junior:
                        # Find a weekend/holiday where a senior works and replace with a junior
                        for d in self.all_dates:
                            is_wh = d in self.weekends or d in self.holidays
                            if not is_wh or d not in current_schedule:
                                continue
                            
                            for s in self.shifts:
                                if s not in current_schedule[d]:
                                    continue
                                
                                senior_indices = [(i, doc) for i, doc in enumerate(current_schedule[d][s]) 
                                                if doc in self.senior_doctors]
                                
                                if senior_indices:
                                    index, senior_doc = random.choice(senior_indices)
                                    junior_doc = junior_wh[0][0]  # Junior with lowest hours
                                    
                                    # Skip if junior already in this shift (would cause duplicate)
                                    if junior_doc not in current_schedule[d][s]:
                                        potential_moves.append((d, s, index, senior_doc, junior_doc))
                    
                    elif avg_senior < avg_junior * 0.7:  # Seniors have less than 70% of junior hours
                        # Find weekend/holiday shifts for juniors with highest hours
                        junior_with_most = max(junior_wh, key=lambda x: x[1])[0]
                        
                        # Look for shifts to transfer to seniors with lowest hours
                        senior_with_least = min(senior_wh, key=lambda x: x[1])[0]
                        
                        for d in self.all_dates:
                            is_wh = d in self.weekends or d in self.holidays
                            if not is_wh or d not in current_schedule:
                                continue
                            
                            for s in self.shifts:
                                if s not in current_schedule[d]:
                                    continue
                                
                                # Skip if senior already in this shift (would cause duplicate)
                                if senior_with_least not in current_schedule[d][s] and junior_with_most in current_schedule[d][s]:
                                    index = current_schedule[d][s].index(junior_with_most)
                                    potential_moves.append((d, s, index, junior_with_most, senior_with_least))
                                    
                if potential_moves:
                    # Choose one of the potential moves
                    date, shift, idx, old_doctor, new_doctor = random.choice(potential_moves)
                    
                    # Check if the replacement doctor is available
                    if self._is_doctor_available(new_doctor, date, shift):
                        # Check if already assigned to another shift that day
                        already_assigned = False
                        for other_shift in self.shifts:
                            if other_shift == shift:
                                continue
                            if other_shift in current_schedule[date] and new_doctor in current_schedule[date][other_shift]:
                                already_assigned = True
                                break
                        
                        if not already_assigned:
                            move_successful = True
                            # Check that this move doesn't create consecutive night shifts
                            if shift == "Night" and new_doctor is not None:
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        new_doctor in current_schedule[prev_date]["Night"]):
                                        move_successful = False  # Invalidate this move
                                
                                # Check if doctor would work night shift tomorrow
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        new_doctor in current_schedule[next_date]["Night"]):
                                        move_successful = False  # Invalidate this move
            
            # 5. Consecutive days move - try to fix doctors working too many consecutive days
            elif move_type == "consecutive_days":
                # Find doctors who are exceeding consecutive day limit
                overworked_doctors = []
                for doctor, days in consecutive_days.items():
                    if days > self.max_consecutive_shifts:
                        overworked_doctors.append((doctor, days))
                
                # Sort by most consecutive days first
                overworked_doctors.sort(key=lambda x: x[1], reverse=True)
                
                if overworked_doctors:
                    # Get the doctor with the most consecutive days
                    overworked_doc, _ = overworked_doctors[0]
                    
                    # Find a date where this doctor is working to replace them
                    potential_moves = []
                    
                    for d in self.all_dates:
                        if d not in current_schedule:
                            continue
                            
                        for s in self.shifts:
                            if s not in current_schedule[d]:
                                continue
                                
                            if overworked_doc in current_schedule[d][s]:
                                index = current_schedule[d][s].index(overworked_doc)
                                potential_moves.append((d, s, index))
                    
                    if potential_moves:
                        # Choose a move
                        date, shift, idx = random.choice(potential_moves)
                        old_doctor = overworked_doc
                        
                        # Find doctors who haven't been working consecutive days
                        rested_doctors = []
                        for doctor, days in consecutive_days.items():
                            if days <= 2 and doctor != old_doctor:  # Well rested doctors
                                # Skip if already in this shift (would cause duplicate)
                                if doctor in current_schedule[date][shift]:
                                    continue
                                    
                                if self._is_doctor_available(doctor, date, shift):
                                    # Check if not already assigned another shift that day
                                    already_assigned = False
                                    for other_shift in self.shifts:
                                        if other_shift == shift:
                                            continue
                                        if (other_shift in current_schedule[date] and 
                                            doctor in current_schedule[date][other_shift]):
                                            already_assigned = True
                                            break
                                            
                                    if not already_assigned:
                                        rested_doctors.append(doctor)
                        
                        if rested_doctors:
                            # Choose a rested doctor
                            new_doctor = random.choice(rested_doctors)
                            move_successful = True
            
            # 6. Random move as fallback
            else:
                # Select a random date and shift
                date = random.choice(self.all_dates)
                shift = random.choice(self.shifts)
                
                # Skip if date or shift not in schedule
                if date in current_schedule and shift in current_schedule[date]:
                    current_assignment = current_schedule[date][shift]
                    if current_assignment:
                        # Select a random doctor to replace
                        idx = random.randint(0, len(current_assignment) - 1)
                        old_doctor = current_assignment[idx]
                        
                        # Find all available doctors for this shift who aren't already assigned on this date
                        available_doctors = set()
                        for doctor in [doc["name"] for doc in self.doctors]:
                            # Skip if already in this shift (would cause duplicate)
                            if doctor in current_assignment:
                                continue
                                
                            # Check if doctor is available for this shift
                            if not self._is_doctor_available(doctor, date, shift):
                                continue
                            
                            # Check preference compatibility with shift
                            if not self._can_assign_to_shift(doctor, shift):
                                continue
                                
                            # CRUCIAL: For Night shifts, check for consecutive assignments
                            if shift == "Night":
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        doctor in current_schedule[prev_date]["Night"]):
                                        continue  # Skip this doctor
                                
                                # Also check if doctor is already scheduled for tomorrow's night shift
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        doctor in current_schedule[next_date]["Night"]):
                                        continue  # Skip this doctor
                            
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
                        
                        # If no available replacements, try another move
                        if available_doctors:
                            # Select a random available doctor as replacement
                            new_doctor = random.choice(list(available_doctors))
                            move_successful = True
                            # Check that this move doesn't create consecutive night shifts
                            if shift == "Night" and new_doctor is not None:
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        new_doctor in current_schedule[prev_date]["Night"]):
                                        move_successful = False  # Invalidate this move
                                
                                # Check if doctor would work night shift tomorrow
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        new_doctor in current_schedule[next_date]["Night"]):
                                        move_successful = False  # Invalidate this move

                            # Check that this move doesn't create consecutive night shifts
                            if shift == "Night" and new_doctor is not None:
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        new_doctor in current_schedule[prev_date]["Night"]):
                                        move_successful = False  # Invalidate this move
                                
                                # Check if doctor would work night shift tomorrow
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        new_doctor in current_schedule[next_date]["Night"]):
                                        move_successful = False  # Invalidate this move
            
            # Create a new schedule only if all variables are properly set and the move was successful
            if move_successful and date is not None and shift is not None and idx is not None and old_doctor is not None and new_doctor is not None:
                # Create new schedule with the selected move (using helper function)
                new_schedule = self._create_new_schedule(current_schedule, date, shift, idx, old_doctor, new_doctor)
                
                # Record the move
                move = (date, shift, old_doctor, new_doctor)
                neighbors.append((new_schedule, move))
        
        # If we couldn't generate enough smart moves, fall back to random ones
        fallback_attempts = 0
        max_fallback_attempts = num_moves * 10  # Limit attempts to avoid infinite loop
        while len(neighbors) < num_moves and fallback_attempts < max_fallback_attempts:
            fallback_attempts += 1
            # Keep trying until we get enough neighbors or reach max attempts
            random_neighbor = self._get_random_neighbor(current_schedule)
            if random_neighbor:
                neighbors.append(random_neighbor)
                
        return neighbors
    def _create_new_schedule(self, current_schedule, date, shift, idx, old_doctor, new_doctor):
        """
        Helper function to create a new schedule with a doctor replacement.
        This carefully ensures no duplicates are created.
        """
        # Copy the current assignment and make the replacement
        current_doctors = current_schedule[date][shift]
        
        # Validate idx (defensive programming)
        if idx >= len(current_doctors):
            logger.warning(f"Invalid idx {idx} for doctors list of length {len(current_doctors)}")
            # Fallback to a safe approach
            new_doctors = list(current_doctors)
            if old_doctor in new_doctors:
                # Replace old doctor with new doctor
                new_doctors[new_doctors.index(old_doctor)] = new_doctor
            elif new_doctor not in new_doctors:
                # If old doctor not found but new doctor not in list, add new doctor
                new_doctors.append(new_doctor)
        else:
            # First verify the replacement won't create a duplicate
            new_doctors = []
            seen_doctors = set()
            
            # For each position in the shift
            for i, doctor in enumerate(current_doctors):
                # If this is the position we're changing
                if i == idx:
                    # Make sure the new doctor isn't already in the list
                    if new_doctor not in seen_doctors:
                        new_doctors.append(new_doctor)
                        seen_doctors.add(new_doctor)
                    else:
                        # If would create duplicate, keep old doctor
                        new_doctors.append(old_doctor)
                        seen_doctors.add(old_doctor)
                else:
                    # Keep track of doctors we've seen
                    if doctor not in seen_doctors:
                        new_doctors.append(doctor)
                        seen_doctors.add(doctor)
                    # If we see a duplicate, skip it
        
        # Create a new schedule with the updated shift
        new_schedule = {
            k: v if k != date else {
                s: list(doctors) if s != shift else new_doctors
                for s, doctors in v.items()
            }
            for k, v in current_schedule.items()
        }
        
        return new_schedule

    def _calculate_consecutive_days(self, schedule):
        """Calculate consecutive working days for each doctor."""
        doctor_names = [doc["name"] for doc in self.doctors]
        consecutive_days = {doctor: 0 for doctor in doctor_names}
        
        # Track last day a doctor worked
        last_worked = {doctor: None for doctor in doctor_names}
        
        # Process dates in order
        for date in sorted(self.all_dates):
            # Find doctors working today
            working_today = set()
            if date in schedule:
                for shift in self.shifts:
                    if shift in schedule[date]:
                        working_today.update(schedule[date][shift])
            
            # Update consecutive days for each doctor
            for doctor in doctor_names:
                if doctor in working_today:
                    if last_worked[doctor] is not None:
                        # Check if this is a consecutive day
                        last_date = datetime.date.fromisoformat(last_worked[doctor])
                        current_date = datetime.date.fromisoformat(date)
                        
                        if (current_date - last_date).days == 1:
                            consecutive_days[doctor] += 1
                        else:
                            consecutive_days[doctor] = 1
                    else:
                        consecutive_days[doctor] = 1
                        
                    last_worked[doctor] = date
        
        return consecutive_days

    def _get_random_neighbor(self, current_schedule):
        """Helper function to get a random neighbor as fallback."""
        attempts = 0
        while attempts < 20:  # Limit attempts
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
            
            # Find available replacements
            available_doctors = []
            for doctor in [doc["name"] for doc in self.doctors]:
                if doctor == old_doctor:
                    continue
                    
                # Skip if already in this shift (would cause duplicate)
                if doctor in current_assignment:
                    continue
                    
                if not self._is_doctor_available(doctor, date, shift):
                    continue
                    
                # NEW: Check preference compatibility with shift
                if not self._can_assign_to_shift(doctor, shift):
                    continue
                    
                already_assigned = False
                for other_shift in self.shifts:
                    if other_shift == shift:
                        continue
                    if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                        already_assigned = True
                        break
                        
                if not already_assigned:
                    available_doctors.append(doctor)
            
            if not available_doctors:
                continue
                
            # Select a random replacement
            new_doctor = random.choice(available_doctors)
            
            # Create new schedule with safe replacement
            new_schedule = self._create_new_schedule(current_schedule, date, shift, idx, old_doctor, new_doctor)
            
            return (new_schedule, (date, shift, old_doctor, new_doctor))
            
        return None  # Failed to find a neighbor

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
        logger.info(f"Starting Monthly Tabu Search optimization for month {self.month}")
        if progress_callback:
            progress_callback(5, f"Initializing Monthly Tabu Search for {self.month}...")
            
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

        # Generate initial schedule with smarter starting point
        current_schedule = self.generate_initial_schedule()
        current_cost = self.objective(current_schedule)
        best_schedule = copy.deepcopy(current_schedule)  # Use deep copy to avoid reference issues
        best_cost = current_cost

        # For monthly optimization, we can use a smaller tabu tenure and fewer iterations
        # since the search space is smaller
        tabu_list = {}  # Map move (tuple) to expiration iteration
        tabu_tenure = 15  # Smaller for monthly - was 20 for yearly
        max_iterations = 1000  # Fewer iterations needed for monthly - was 1500 for yearly
        no_improve_count = 0
        iteration = 0
        
        # Phase tracking for targeted optimization
        current_phase = "general"  # Start with general optimization
        phase_iterations = 0
        phase_max = 200  # Switch phases more frequently in monthly (was 300)
        
        # Progress reporting interval - report progress less frequently to reduce overhead
        progress_interval = 15  # More frequent for monthly (was 20)

        while iteration < max_iterations and no_improve_count < 75:  # Reduced patience for monthly
            iteration += 1
            phase_iterations += 1
            
            # Switch optimization phase periodically
            if phase_iterations >= phase_max:
                phase_iterations = 0
                if current_phase == "general":
                    current_phase = "balance"
                elif current_phase == "balance":
                    current_phase = "senior"
                elif current_phase == "senior":
                    current_phase = "preference"
                else:
                    current_phase = "general"
                    
                logger.info(f"Switching to phase: {current_phase}")
                if progress_callback:
                    progress_callback(
                        50 + int(40 * iteration / max_iterations),
                        f"Iteration {iteration}: Starting {current_phase} optimization phase"
                    )
            
            # Get neighbors with smarter move generation
            neighbors = self.get_neighbors(current_schedule, num_moves=20)  # Fewer moves for monthly (was 25)
            
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
                if move_key in tabu_list and iteration < tabu_list[move_key] and neighbor_cost >= best_cost:
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
            
            # Clean up the tabu list periodically
            if iteration % 10 == 0:
                tabu_list = {m: exp for m, exp in tabu_list.items() if exp > iteration}

            if current_cost < best_cost:
                best_schedule = copy.deepcopy(current_schedule)  # Use deep copy to avoid reference issues
                best_cost = current_cost
                no_improve_count = 0
                
                # Every 40 iterations, log key metrics for monitoring (more frequent in monthly)
                if iteration % 40 == 0:
                    # Calculate important metrics for the best schedule
                    monthly_hours = self._calculate_monthly_hours(best_schedule)
                    wh_hours = self._calculate_weekend_holiday_hours(best_schedule)
                    
                    # Calculate workload variance for the month
                    month_values = [hrs.get(self.month, 0) for doc, hrs in monthly_hours.items() if hrs.get(self.month, 0) > 0]
                    workload_variance = max(month_values) - min(month_values) if month_values else 0
                    
                    # Senior vs junior workload
                    senior_avg = sum(monthly_hours[doc].get(self.month, 0) for doc in self.senior_doctors) / max(len(self.senior_doctors), 1)
                    junior_avg = sum(monthly_hours[doc].get(self.month, 0) for doc in self.junior_doctors) / max(len(self.junior_doctors), 1)
                    
                    # Weekend/holiday metrics
                    senior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.senior_doctors) / max(len(self.senior_doctors), 1)
                    junior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.junior_doctors) / max(len(self.junior_doctors), 1)
                    
                    logger.info(f"Iteration {iteration} metrics - Cost: {best_cost:.2f}, "
                               f"Month {self.month} balance: {workload_variance}h, "
                               f"Senior hours: {senior_avg:.1f}h, Junior hours: {junior_avg:.1f}h, "
                               f"Senior W/H: {senior_wh_avg:.1f}h, Junior W/H: {junior_wh_avg:.1f}h")
                    
                    # Special focus if metrics are not good
                    if workload_variance > 12:  # Monthly balance still too high
                        current_phase = "balance"
                        phase_iterations = 0
                        logger.info("Switching to balance focus due to high monthly variance")
                        
                    if senior_avg >= junior_avg:  # Seniors working too much
                        current_phase = "senior" 
                        phase_iterations = 0
                        logger.info("Switching to senior focus due to high senior workload")
                        
                    if senior_wh_avg > junior_wh_avg - 8:  # Senior weekend/holiday issue
                        current_phase = "senior"
                        phase_iterations = 0
                        logger.info("Switching to senior focus due to high senior weekend/holiday hours")
            else:
                no_improve_count += 1
            
            # Report progress less frequently
            if progress_callback and iteration % progress_interval == 0:
                progress_callback(50 + int(40 * iteration / max_iterations),
                                f"Iteration {iteration}: Best cost = {best_cost:.2f} ({current_phase} phase)")

        solution_time = time.time() - start_time

        # -------------------------------
        # Calculate final statistics
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

        # Check for duplicate doctors in the final schedule
        duplicate_count = 0
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                    
                # Check for duplicates in this shift
                shift_doctors = schedule[date][shift]
                unique_doctors = set(shift_doctors)
                if len(shift_doctors) > len(unique_doctors):
                    # Count duplicates
                    duplicate_count += len(shift_doctors) - len(unique_doctors)
                    
                    # Log the issue
                    duplicates = [d for d in shift_doctors if shift_doctors.count(d) > 1]
                    logger.warning(f"Duplicate doctor(s) in final schedule at {date}, {shift}: {duplicates}")

        if progress_callback:
            progress_callback(100, "Monthly optimization complete")

        # Calculate monthly hours for reporting
        monthly_hours = self._calculate_monthly_hours(schedule)
        
        # Calculate monthly stats (min, max, avg) for reporting
        month_values = [hours.get(self.month, 0) for doctor, hours in monthly_hours.items() if self.month in hours and hours[self.month] > 0]
        monthly_stats = {}
        
        if month_values:
            mean = sum(month_values) / len(month_values)
            monthly_stats[self.month] = {
                "min": min(month_values),
                "max": max(month_values),
                "avg": mean,
                "std_dev": (sum((v - mean) ** 2 for v in month_values) / len(month_values)) ** 0.5
            }
        
        # Calculate consecutive days stats for reporting
        consecutive_days = self._calculate_consecutive_days(schedule)
        max_consecutive = max(consecutive_days.values())
        avg_consecutive = sum(consecutive_days.values()) / len(consecutive_days)
        
        # Check for availability violations in final schedule
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
        
        stats = {
            "status": "Monthly Tabu Search completed",
            "solution_time_seconds": solution_time,
            "objective_value": best_cost,
            "coverage_errors": coverage_errors,
            "availability_violations": availability_violations,
            "duplicate_doctors": duplicate_count,
            "doctor_shift_counts": doctor_shift_counts,
            "preference_metrics": preference_metrics,
            "weekend_metrics": weekend_metrics,
            "holiday_metrics": holiday_metrics,
            "monthly_hours": monthly_hours,
            "monthly_stats": monthly_stats,
            "consecutive_days": {
                "max": max_consecutive,
                "avg": avg_consecutive
            },
            "iterations": iteration,
            "month": self.month
        }

        return schedule, stats

def optimize_monthly_schedule(data: Dict[str, Any], progress_callback: Callable = None) -> Dict[str, Any]:
    """
    Main function to optimize a schedule for a single month using Tabu Search.
    
    Args:
        data: Dictionary containing doctors, holidays, availability, and month.
        progress_callback: Optional function to report progress.
        
    Returns:
        Dictionary with the optimized schedule and statistics.
    """
    try:
        doctors = data.get("doctors", [])
        holidays = data.get("holidays", {})
        availability = data.get("availability", {})
        month = data.get("month")
        year = data.get("year")
        shift_template = data.get("shift_template", {})  # Get the shift template
        
        # Validate month is between 1 and 12
        if month is None:
            raise ValueError("Month parameter is required for monthly scheduling")
            
        try:
            month = int(month)
            if month < 1 or month > 12:
                raise ValueError(f"Invalid month: {month}. Month must be between 1 and 12.")
        except ValueError as e:
            if str(e).startswith("Invalid month"):
                raise
            raise ValueError(f"Invalid month format: {month}. Month must be an integer.")
        

        # Create optimizer for the specified month
        optimizer = MonthlyScheduleOptimizer(doctors, holidays, availability, month, year)

        # Set the shift template if provided
        if 'shift_template' in data and isinstance(data['shift_template'], dict) and len(data['shift_template']) > 0:
            # Filter the template to only include dates in the target month and year
            filtered_template = {}
            for date, shifts in data['shift_template'].items():
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
            
            # Set the filtered template as the shift template
            if filtered_template:
                optimizer.shift_template = filtered_template
                
                if progress_callback:
                    num_shifts = sum(len(shifts) for shifts in filtered_template.values())
                    progress_callback(5, f"Using template with {len(filtered_template)} days and {num_shifts} shifts")

        schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        
        return {
            "schedule": schedule,
            "statistics": stats
        }
    except Exception as e:
        logger.exception("Error in monthly optimization")
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
        },
        "month": 1  # January
    }

    import time
    start = time.time()
    result = optimize_monthly_schedule(sample_data)
    end = time.time()
    
    print(f"Monthly optimization completed in {end - start:.2f} seconds")
    print(f"Status: {result['statistics']['status']}")
    print(f"Solution time: {result['statistics'].get('solution_time_seconds', 'N/A')} seconds")
    print(f"Objective value: {result['statistics'].get('objective_value', 'N/A')}")
    
    # Print all doctors and their shift counts
    doctor_shifts = result['statistics']['doctor_shift_counts']
    print("\nDoctor shift counts:")
    for doctor, count in doctor_shifts.items():
        print(f"{doctor}: {count} shifts")
    
    # Print some schedule dates as an example
    schedule = result["schedule"]
    print("\nSample schedule (first 3 days):")
    dates = sorted(schedule.keys())[:3]
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            if shift in schedule[date]:
                assigned = schedule[date][shift]
                print(f"  {shift}: {', '.join(assigned)}")
            else:
                print(f"  {shift}: None")