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
                 availability: Dict[str, Dict[str, str]], month: int, year: int,
                 contract_specific_shifts: Dict[str, List[Dict[str, str]]] = None):
        """
        Initialize with input data for a specific month.
        
        Args:
            doctors: List of doctor dictionaries with name, seniority, and optional preference.
            holidays: Dictionary mapping dates to holiday types (e.g., 'Short' or 'Long').
            availability: Nested dictionary for doctor availability constraints.
            month: The month to generate the schedule for (1-12).
            year: The year for the schedule.
            contract_specific_shifts: Dictionary mapping doctor names to lists of shifts they are 
                                     contractually obligated to work. Each shift is a dictionary 
                                     with 'date' and 'shift' keys.
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        self.month = month
        self.year = year
        # Store contract-specific shifts
        self.contract_specific_shifts = contract_specific_shifts or {}

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
        self.max_doctor_hour_balance = 8  # Maximum difference in hours between doctors (1 shift)
        
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
        self.w_balance = 5000      # Increased for monthly (was 30 in yearly)
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
        # NEW: Unfilled slots penalty - make it a super hard constraint
        self.w_unfilled_slots = 999999  # Highest penalty for unfilled slots in template
        
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
                    
        # Make sure contract-specific shifts are marked as available
        for doctor, shifts in self.contract_specific_shifts.items():
            for shift_info in shifts:
                date = shift_info.get('date')
                shift_type = shift_info.get('shift')
                if date and shift_type and date in self.all_dates:
                    key = (doctor, date, shift_type)
                    self._availability_cache[key] = True

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
        Ensures no doctor appears more than once in the same shift and ALL SHIFTS ARE FILLED.
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
            
            # First, assign contract-specific shifts
            for doctor, shifts in self.contract_specific_shifts.items():
                for shift_info in shifts:
                    shift_date = shift_info.get('date')
                    shift_type = shift_info.get('shift')
                    
                    # Skip if not for this date
                    if shift_date != date:
                        continue
                        
                    # Create the shift if it doesn't exist
                    if shift_type not in schedule[date]:
                        schedule[date][shift_type] = []
                        
                    # Add doctor to the shift if not already there
                    if doctor not in schedule[date][shift_type]:
                        schedule[date][shift_type].append(doctor)
                        assigned_today.add(doctor)
                        
                        # Update assignment tracking
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
                
                # If shift already exists from contract assignments, count how many more doctors we need
                if shift in schedule[date]:
                    # Count doctors already assigned from contracts
                    already_assigned = len(schedule[date][shift])
                    # Update required count
                    required = max(0, required - already_assigned)
                    # If all slots are filled, skip to the next shift
                    if required == 0:
                        continue
                else:
                    # Create the shift
                    schedule[date][shift] = []
                
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
                        if doc not in unique_preferred and doc not in schedule[date][shift]:
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
                        d not in schedule[date][shift] and 
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
                        if doc not in other_selections and doc not in schedule[date][shift]:
                            other_selections.append(doc)
                
                # Add doctors to the shift
                for doc in preferred_selections + other_selections:
                    if doc not in schedule[date][shift]:  # Final uniqueness check
                        schedule[date][shift].append(doc)
                        assigned_today.add(doc)
                        
                        # Update assignment tracking
                        assignments[doc] += 1
                        if is_weekend_or_holiday:
                            weekend_holiday_assignments[doc] += 1
                        
                        # Update consecutive days tracking
                        d_date = datetime.date.fromisoformat(date)
                        if last_worked_day[doc] is not None:
                            last_d_date = datetime.date.fromisoformat(last_worked_day[doc])
                            if (d_date - last_d_date).days == 1:
                                consecutive_days[doc] += 1
                            else:
                                consecutive_days[doc] = 1
                        else:
                            consecutive_days[doc] = 1
                        
                        last_worked_day[doc] = date
                
                # If we still don't have enough doctors, try to relax "assigned today" constraint
                remaining_required = required - len(schedule[date][shift])
                if remaining_required > 0:
                    # Consider doctors already assigned today but available for this shift
                    additional_candidates = [
                        d for d in doctor_names
                        if d not in schedule[date][shift] and
                        d in assigned_today and
                        self._is_doctor_available(d, date, shift)
                    ]
                    
                    # Pick some with uniqueness check
                    additional_selections = []
                    for doc in additional_candidates:
                        if len(additional_selections) >= remaining_required:
                            break
                        if doc not in additional_selections and doc not in schedule[date][shift]:
                            additional_selections.append(doc)
                            
                    # Add doctors to the shift
                    for doc in additional_selections:
                        if doc not in schedule[date][shift]:  # Final uniqueness check
                            schedule[date][shift].append(doc)
                            
                            # Update assignment tracking
                            assignments[doc] += 1
                            if is_weekend_or_holiday:
                                weekend_holiday_assignments[doc] += 1
                
                # If still not enough, log the issue but continue with best effort
                remaining_required = required - len(schedule[date][shift])
                if remaining_required > 0:
                    logger.warning(f"Not enough available doctors for {date}, {shift}. Need {len(schedule[date][shift]) + remaining_required}, have {len(schedule[date][shift])}")
                    
                    # ENHANCED APPROACH: Try to fill all required slots while respecting availability
                    # Look for ANY available doctor for this shift, even if they're assigned elsewhere
                    # this might create duplicate assignments that the optimizer will fix later
                    additional_pool = [
                        d for d in doctor_names
                        if d not in schedule[date][shift] and
                        self._is_doctor_available(d, date, shift) and
                        self._can_assign_to_shift(d, shift)
                    ]
                    
                    # Sort by least assignments first
                    additional_pool.sort(key=lambda d: assignments[d])
                    
                    # Add doctors until we meet the required number
                    while remaining_required > 0 and additional_pool:
                        doctor = additional_pool.pop(0)
                        if doctor not in schedule[date][shift]:  # Final uniqueness check
                            schedule[date][shift].append(doctor)
                            assigned_today.add(doctor)
                            assignments[doctor] += 1
                            if is_weekend_or_holiday:
                                weekend_holiday_assignments[doctor] += 1
                            remaining_required -= 1
                            
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
        6. NEW: Extreme penalty for unfilled slots in the shift template
        7. NEW: Extreme penalty for contract-specific shift violations
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

        # NEW: Check for unfilled slots in the shift template (super hard constraint)
        for date in self.all_dates:
            # Skip if this date is not in the template
            has_shift_template = hasattr(self, 'shift_template') and date in self.shift_template
            if not has_shift_template:
                continue
                
            for shift in self.shifts:
                # Skip if this shift is not in the template for this date
                if shift not in self.shift_template[date]:
                    continue
                    
                # Get required slots from the template
                required_slots = self.shift_template[date][shift].get('slots', 0)
                if required_slots <= 0:
                    continue
                
                # Count the actual number of doctors assigned to this shift
                actual_slots = 0
                if date in schedule and shift in schedule[date]:
                    actual_slots = len(schedule[date][shift])
                
                # Penalize if fewer doctors are assigned than required
                if actual_slots < required_slots:
                    # Apply the highest penalty - this is a critical error
                    cost += self.w_unfilled_slots * (required_slots - actual_slots)
                    
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
        
        # Identify doctors with very limited availability (≤ 2 days per month)
        limited_availability_doctors = set()
        doctor_working_days = {doctor: 0 for doctor in monthly_hours.keys()}
        
        # Count working days for each doctor in this month
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift_name, doctors in schedule[date].items():
                for doctor in doctors:
                    doctor_working_days[doctor] = doctor_working_days.get(doctor, 0) + 1
        
        # Identify doctors with ≤ 2 working days in the month
        for doctor, days in doctor_working_days.items():
            if days <= 2:
                limited_availability_doctors.add(doctor)
                
        # Add doctors with contract-specific shifts to the limited availability set
        for doctor in self.contract_specific_shifts.keys():
            limited_availability_doctors.add(doctor)
        
        # Log information about doctors with limited availability
        if limited_availability_doctors:
            logger.info(f"Monthly optimizer: Excluding {len(limited_availability_doctors)} doctors with limited availability (≤ 2 days or contract-specific shifts) from monthly variance: {', '.join(limited_availability_doctors)}")
        
        # Calculate overall monthly variance across all doctors, excluding limited availability docs
        active_hours = []
        active_doctor_hours = {}
        for doctor, hours in monthly_hours.items():
            month_hours = hours.get(self.month, 0)
            if doctor not in limited_availability_doctors and month_hours > 0:
                active_hours.append(month_hours)
                active_doctor_hours[doctor] = month_hours
        
        if active_hours and len(active_hours) > 1:
            # Calculate target hours for better distribution
            total_hours = sum(active_hours)
            num_active_doctors = len(active_hours)
            target_hours_per_doctor = total_hours / num_active_doctors
            
            logger.info(f"Target hours per doctor: {target_hours_per_doctor:.2f}h (total: {total_hours}h, active doctors: {num_active_doctors})")
            
            # Calculate variance from target rather than just max-min
            variance_from_target = 0
            for doctor, hours in active_doctor_hours.items():
                deviation = abs(hours - target_hours_per_doctor)
                variance_from_target += deviation ** 2
            
            # Also check max-min variance for the original constraint
            max_hours = max(active_hours)
            min_hours = min(active_hours)
            max_min_variance = max_hours - min_hours
            
            # Apply penalty if either type of variance is too high
            if max_min_variance > self.max_doctor_hour_balance:
                excess = max_min_variance - self.max_doctor_hour_balance
                cost += self.w_balance * (excess ** 2)
                
            cost += (self.w_balance / 2) * (variance_from_target / num_active_doctors)
        
        # Calculate average hours for junior and senior doctors
        avg_junior = sum(junior_hours.values()) / max(len(junior_hours), 1)
        avg_senior = sum(senior_hours.values()) / max(len(senior_hours), 1)
        
        # Check if seniors are working more than juniors
        if junior_hours and senior_hours:
            # Calculate active senior and junior doctors (excluding those with limited availability)
            active_junior_hours = {doc: hrs for doc, hrs in junior_hours.items() if doc not in limited_availability_doctors}
            active_senior_hours = {doc: hrs for doc, hrs in senior_hours.items() if doc not in limited_availability_doctors}
            
            # Only proceed if we have active doctors in both groups
            if active_junior_hours and active_senior_hours:
                # Calculate averages for active doctors only
                avg_active_junior = sum(active_junior_hours.values()) / len(active_junior_hours)
                avg_active_senior = sum(active_senior_hours.values()) / len(active_senior_hours)
                
                # Penalize if seniors work more than juniors
                if avg_active_senior > avg_active_junior:
                    cost += self.w_senior_workload * ((avg_active_senior - avg_active_junior) ** 2)
                
                # Also penalize if seniors are not working less by the target amount
                if avg_active_senior > (avg_active_junior - self.senior_junior_monthly_diff):
                    diff_gap = (avg_active_senior - (avg_active_junior - self.senior_junior_monthly_diff))
                    cost += self.w_senior_workload * diff_gap

        # 7. Weekend/Holiday fairness
        wh_hours = self._calculate_weekend_holiday_hours(schedule)

        # Calculate hours for each group, excluding doctors with limited availability
        junior_wh_hours = {doc: wh_hours[doc] for doc in self.junior_doctors if doc not in limited_availability_doctors}
        senior_wh_hours = {doc: wh_hours[doc] for doc in self.senior_doctors if doc not in limited_availability_doctors}

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
            
            # Only include active doctors (exclude those with limited availability)
            active_doctors_with_pref = [doc for doc in doctors_with_pref if doc not in limited_availability_doctors]
            
            if len(active_doctors_with_pref) > 1:  # Only check if multiple active doctors share a preference
                # Get counts of preferred shifts for each active doctor
                counts = {}
                for doc in active_doctors_with_pref:
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
                        multiplier = len(active_doctors_with_pref) / 2 
                        if variance > 3:  # Allow small differences
                            cost += self.w_preference_fairness * multiplier * ((variance - 3) ** 2)
        
        # 10. Distribution of shifts across the month
        # A good schedule should distribute each doctor's shifts evenly across the month
        # Calculate how many of each doctor's shifts should be in each week
        weeks_in_month = len(self.all_dates) // 7 + (1 if len(self.all_dates) % 7 > 0 else 0)
        
        if weeks_in_month > 1:
            # Get doctor's total shifts in the month (only for active doctors)
            doctor_total_shifts = {doctor: 0 for doctor in doctor_names if doctor not in limited_availability_doctors}
            
            for date in self.all_dates:
                if date in schedule:
                    for shift in self.shifts:
                        if shift not in schedule[date]:
                            continue
                        for doctor in schedule[date][shift]:
                            if doctor in doctor_total_shifts:  # Only count active doctors
                                doctor_total_shifts[doctor] = doctor_total_shifts.get(doctor, 0) + 1
            
            # Group dates by week
            week_dates = defaultdict(list)
            for date in self.all_dates:
                d = datetime.date.fromisoformat(date)
                # Calculate week number (0-indexed) within the month
                week_num = (d.day - 1) // 7
                week_dates[week_num].append(date)
            
            # Count shifts per doctor per week (only for active doctors)
            doctor_week_shifts = {doctor: {week: 0 for week in range(weeks_in_month)} 
                                for doctor in doctor_total_shifts.keys()}
            
            for week, dates in week_dates.items():
                for date in dates:
                    if date in schedule:
                        for shift in self.shifts:
                            if shift not in schedule[date]:
                                continue
                            for doctor in schedule[date][shift]:
                                if doctor in doctor_week_shifts:  # Only count active doctors
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
        
        # NEW: Check for contract-specific shift compliance (super hard constraint)
        for doctor, shifts in self.contract_specific_shifts.items():
            for shift_info in shifts:
                date = shift_info.get('date')
                shift_type = shift_info.get('shift')
                
                # Skip if date is outside the month we're optimizing
                if date not in self.all_dates:
                    continue
                    
                # Check if doctor is assigned to this specific shift
                is_assigned = False
                if date in schedule and shift_type in schedule[date]:
                    is_assigned = doctor in schedule[date][shift_type]
                
                # Apply severe penalty if not assigned to a contract-specific shift
                if not is_assigned:
                    cost += self.w_avail * 2  # Using double the availability violation weight

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
                ["fix_contract_shifts", "evening_preference", "senior_workload", "monthly_balance", 
                "weekend_holiday_balance", "consecutive_days", "fix_duplicates", 
                "fill_template", "random"],
                weights=[0.8, 0.15, 0.15, 0.15, 0.15, 0.1, 0.3, 0.7, 0.05],  # Highest weight for contract shifts
                k=1
            )[0]
            
            # Highest priority: Fix contract shift violations
            if move_type == "fix_contract_shifts":
                # Find missing contract shifts that need to be filled
                missing_contract_shifts = []
                
                for doctor, shifts in self.contract_specific_shifts.items():
                    for shift_info in shifts:
                        date = shift_info.get('date')
                        shift_type = shift_info.get('shift')
                        
                        # Skip if date is outside the month we're optimizing
                        if date not in self.all_dates:
                            continue
                            
                        # Check if doctor is assigned to this specific shift
                        is_assigned = False
                        if date in current_schedule and shift_type in current_schedule[date]:
                            is_assigned = doctor in current_schedule[date][shift_type]
                        
                        # If not assigned, we need to fix this
                        if not is_assigned:
                            missing_contract_shifts.append((date, shift_type, doctor))
                
                # If we found any missing contract shifts, try to fix one
                if missing_contract_shifts:
                    # Pick a random missing contract shift to fix
                    date, shift_type, contract_doctor = random.choice(missing_contract_shifts)
                    
                    # Check if someone else is currently in that slot who we can replace
                    current_doctors = []
                    if date in current_schedule and shift_type in current_schedule[date]:
                        current_doctors = current_schedule[date][shift_type]
                    
                    # Two scenarios:
                    # 1. If there are doctors in this slot already, replace one with the contract doctor
                    if current_doctors:
                        # Find a non-contract doctor to replace
                        replaceable_indices = []
                        for idx, doc in enumerate(current_doctors):
                            # Check if this doctor has a contract for this specific shift
                            has_contract_for_this_shift = False
                            for contract_info in self.contract_specific_shifts.get(doc, []):
                                if contract_info.get('date') == date and contract_info.get('shift') == shift_type:
                                    has_contract_for_this_shift = True
                                    break
                            
                            # Only consider replacing doctors who don't have a contract for this shift
                            if not has_contract_for_this_shift:
                                replaceable_indices.append(idx)
                        
                        if replaceable_indices:
                            # Choose a doctor to replace
                            idx = random.choice(replaceable_indices)
                            old_doctor = current_doctors[idx]
                            
                            # Set up the move - replace old_doctor with contract_doctor
                            date = date
                            shift = shift_type
                            new_doctor = contract_doctor
                            move_successful = True
                            
                            # If we're removing this doctor from another shift, we must find a replacement
                            # for that shift to maintain contract requirements
                            
                            # First check if contract_doctor is already assigned elsewhere that day
                            is_assigned_elsewhere = False
                            other_shift_info = None
                            
                            if date in current_schedule:
                                for other_shift in self.shifts:
                                    if other_shift == shift_type:
                                        continue
                                    if (other_shift in current_schedule[date] and 
                                        contract_doctor in current_schedule[date][other_shift]):
                                        is_assigned_elsewhere = True
                                        other_shift_info = (date, other_shift, current_schedule[date][other_shift].index(contract_doctor))
                                        break
                            
                            # If contract doctor is assigned elsewhere, we need to find a replacement for that slot
                            if is_assigned_elsewhere:
                                other_date, other_shift, other_idx = other_shift_info
                                
                                # Find a valid replacement for the other shift
                                replacement_candidates = []
                                for doctor in [doc["name"] for doc in self.doctors]:
                                    # Skip if already in this shift
                                    if doctor in current_schedule[other_date][other_shift]:
                                        continue
                                    
                                    # Skip if not available for this shift
                                    if not self._is_doctor_available(doctor, other_date, other_shift):
                                        continue
                                    
                                    # Skip if already assigned to another shift on this date
                                    already_assigned = False
                                    for s in self.shifts:
                                        if s == other_shift:
                                            continue
                                        if s in current_schedule[other_date] and doctor in current_schedule[other_date][s]:
                                            already_assigned = True
                                            break
                                    
                                    if already_assigned:
                                        continue
                                    
                                    # Skip if this doctor has a contract for this specific shift
                                    has_contract_for_this_shift = False
                                    for contract_info in self.contract_specific_shifts.get(doctor, []):
                                        if contract_info.get('date') == other_date and contract_info.get('shift') == other_shift:
                                            has_contract_for_this_shift = True
                                            break
                                    
                                    if has_contract_for_this_shift:
                                        continue
                                    
                                    # Add to candidates
                                    replacement_candidates.append(doctor)
                                
                                # If we can't find a replacement, we can't make this move
                                if not replacement_candidates:
                                    move_successful = False
                                else:
                                    # Choose a replacement
                                    replacement_doctor = random.choice(replacement_candidates)
                                    
                                    # First make the swap for the other shift
                                    new_schedule = self._create_new_schedule(
                                        current_schedule, other_date, other_shift, other_idx, 
                                        contract_doctor, replacement_doctor
                                    )
                                    
                                    # Then make the swap for the contract shift
                                    new_schedule = self._create_new_schedule(
                                        new_schedule, date, shift, idx, old_doctor, contract_doctor
                                    )
                                    
                                    # Add to neighbors
                                    if move_successful:
                                        neighbors.append((new_schedule, (date, shift, old_doctor, contract_doctor)))
                                        continue  # Skip the rest of the loop
                            else:
                                # Contract doctor isn't assigned elsewhere, simple replacement
                                new_schedule = self._create_new_schedule(
                                    current_schedule, date, shift, idx, old_doctor, contract_doctor
                                )
                                
                                # Add to neighbors
                                if move_successful:
                                    neighbors.append((new_schedule, (date, shift, old_doctor, contract_doctor)))
                                    continue  # Skip the rest of the loop
                    
                    # 2. If there are no doctors in this slot, add the contract doctor
                    else:
                        # First check if contract_doctor is already assigned elsewhere that day
                        is_assigned_elsewhere = False
                        other_shift_info = None
                        
                        if date in current_schedule:
                            for other_shift in self.shifts:
                                if other_shift == shift_type:
                                    continue
                                if (other_shift in current_schedule[date] and 
                                    contract_doctor in current_schedule[date][other_shift]):
                                    is_assigned_elsewhere = True
                                    other_shift_info = (date, other_shift, current_schedule[date][other_shift].index(contract_doctor))
                                    break
                        
                        # If contract doctor is assigned elsewhere, we need to find a replacement for that slot
                        if is_assigned_elsewhere:
                            other_date, other_shift, other_idx = other_shift_info
                            
                            # Find a valid replacement for the other shift
                            replacement_candidates = []
                            for doctor in [doc["name"] for doc in self.doctors]:
                                # Skip if already in this shift
                                if doctor in current_schedule[other_date][other_shift]:
                                    continue
                                
                                # Skip if not available for this shift
                                if not self._is_doctor_available(doctor, other_date, other_shift):
                                    continue
                                
                                # Skip if already assigned to another shift on this date
                                already_assigned = False
                                for s in self.shifts:
                                    if s == other_shift:
                                        continue
                                    if s in current_schedule[other_date] and doctor in current_schedule[other_date][s]:
                                        already_assigned = True
                                        break
                                
                                if already_assigned:
                                    continue
                                
                                # Skip if this doctor has a contract for this specific shift
                                has_contract_for_this_shift = False
                                for contract_info in self.contract_specific_shifts.get(doctor, []):
                                    if contract_info.get('date') == other_date and contract_info.get('shift') == other_shift:
                                        has_contract_for_this_shift = True
                                        break
                                
                                if has_contract_for_this_shift:
                                    continue
                                
                                # Add to candidates
                                replacement_candidates.append(doctor)
                            
                            # If we can't find a replacement, we can't make this move
                            if not replacement_candidates:
                                move_successful = False
                            else:
                                # Choose a replacement
                                replacement_doctor = random.choice(replacement_candidates)
                                
                                # First make the swap for the other shift
                                new_schedule = self._create_new_schedule(
                                    current_schedule, other_date, other_shift, other_idx, 
                                    contract_doctor, replacement_doctor
                                )
                                
                                # Then add the contract doctor to the contract shift (using idx=-1 for add)
                                new_schedule = self._create_new_schedule(
                                    new_schedule, date, shift_type, -1, None, contract_doctor
                                )
                                
                                # Add to neighbors
                                if move_successful:
                                    neighbors.append((new_schedule, (date, shift_type, None, contract_doctor)))
                                    continue  # Skip the rest of the loop
                        else:
                            # Contract doctor isn't assigned elsewhere, simply add them
                            new_schedule = self._create_new_schedule(
                                current_schedule, date, shift_type, -1, None, contract_doctor
                            )
                            
                            # Add to neighbors
                            neighbors.append((new_schedule, (date, shift_type, None, contract_doctor)))
                            continue  # Skip the rest of the loop
            
            # NEW: Highest-priority move type - find and fill unfilled slots in the template
            elif move_type == "fill_template":
                # Check if we have a template
                has_template = hasattr(self, 'shift_template') and self.shift_template
                
                if has_template:
                    unfilled_slots = []
                    
                    # Look for unfilled slots in the template
                    for d in self.all_dates:
                        if d not in self.shift_template:
                            continue
                            
                        for s in self.shifts:
                            if s not in self.shift_template[d]:
                                continue
                                
                            # Get required slots from template
                            required = self.shift_template[d][s].get('slots', 0)
                            if required <= 0:
                                continue
                                
                            # Count actual assigned doctors
                            actual = 0
                            if d in current_schedule and s in current_schedule[d]:
                                actual = len(current_schedule[d][s])
                                
                            # If we need more doctors for this slot
                            if actual < required:
                                unfilled_slots.append((d, s, required - actual))
                    
                    if unfilled_slots:
                        # Pick a random unfilled slot to fix
                        d, s, missing = random.choice(unfilled_slots)
                        
                        # Find available doctors who could fill this slot
                        available_doctors = []
                        for doctor in [doc["name"] for doc in self.doctors]:
                            # Must be available for this shift
                            if not self._is_doctor_available(doctor, d, s):
                                continue
                                
                            # Must be able to work this shift (preference compatible)
                            if not self._can_assign_to_shift(doctor, s):
                                continue
                                
                            # Check if already assigned to this shift
                            already_in_shift = False
                            if d in current_schedule and s in current_schedule[d]:
                                already_in_shift = doctor in current_schedule[d][s]
                                
                            # Check if already assigned to another shift today
                            already_assigned_today = False
                            if d in current_schedule:
                                for other_s in self.shifts:
                                    if other_s == s:
                                        continue
                                    if other_s in current_schedule[d] and doctor in current_schedule[d][other_s]:
                                        already_assigned_today = True
                                        break
                                        
                            # Skip if already in this shift or another shift today
                            if already_in_shift or already_assigned_today:
                                continue
                                
                            # Add to available doctors
                            available_doctors.append(doctor)
                        
                        if available_doctors:
                            # Sort by least assigned doctors first to maintain balance
                            available_doctors.sort(key=lambda doc: 
                                monthly_hours[doc].get(self.month, 0))
                            
                            # Choose the doctor with least hours
                            new_doc = available_doctors[0]
                            
                            # Set up the move - this is an add operation, not a replacement
                            date = d
                            shift = s
                            idx = -1  # Special value to indicate adding, not replacing
                            old_doctor = None
                            new_doctor = new_doc
                            move_successful = True
                            
                            # Extra check for consecutive night shifts
                            if shift == "Night" and new_doctor is not None:
                                # Check if doctor worked night shift yesterday
                                date_idx = self.all_dates.index(date)
                                if date_idx > 0:
                                    prev_date = self.all_dates[date_idx - 1]
                                    if (prev_date in current_schedule and 
                                        "Night" in current_schedule[prev_date] and 
                                        new_doctor in current_schedule[prev_date]["Night"]):
                                        # Would create consecutive night shifts - reject
                                        move_successful = False
                                        
                                # Also check for next day's night shift
                                if date_idx < len(self.all_dates) - 1:
                                    next_date = self.all_dates[date_idx + 1]
                                    if (next_date in current_schedule and 
                                        "Night" in current_schedule[next_date] and 
                                        new_doctor in current_schedule[next_date]["Night"]):
                                        # Would create consecutive night shifts - reject
                                        move_successful = False
                
            # 0. Next high-priority move type - check for duplicate doctors in shifts
            elif move_type == "fix_duplicates":
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
        Create a new schedule by making a single change to the current schedule.
        Handles both replacements and additions depending on the parameters.
        
        Args:
            current_schedule: The current schedule
            date: The date to make a change on
            shift: The shift to make a change on
            idx: The index of the doctor to replace, or -1 for adding a new doctor
            old_doctor: The doctor to replace (can be None for additions)
            new_doctor: The doctor to add (can be None for removals)
            
        Returns:
            A new schedule with the change applied
        """
        # Create a deep copy of the current schedule
        new_schedule = copy.deepcopy(current_schedule)
        
        # Ensure date and shift exist in the new schedule
        if date not in new_schedule:
            new_schedule[date] = {}
        if shift not in new_schedule[date]:
            new_schedule[date][shift] = []
            
        # Special case: idx = -1 means we're adding a new doctor, not replacing
        if idx == -1 and new_doctor is not None:
            # Just add the new doctor to the shift
            if new_doctor not in new_schedule[date][shift]:
                new_schedule[date][shift].append(new_doctor)
        else:
            # Normal case: replace a doctor
            if 0 <= idx < len(new_schedule[date][shift]):
                # MODIFIED: Instead of removing then adding separately,
                # directly replace the old doctor with the new one to ensure a swap
                if old_doctor is not None and new_doctor is not None:
                    # Get the current doctors list
                    current_doctors = new_schedule[date][shift]
                    
                    # Create a new list with the replacement
                    new_doctors = []
                    for i, doctor in enumerate(current_doctors):
                        if i == idx and doctor == old_doctor:
                            # Replace with new doctor
                            new_doctors.append(new_doctor)
                        else:
                            new_doctors.append(doctor)
                    
                    # Update the schedule with the new list
                    new_schedule[date][shift] = new_doctors
                elif old_doctor is not None and new_doctor is None:
                    # Only if we explicitly want to remove without replacement
                    if old_doctor in new_schedule[date][shift]:
                        new_schedule[date][shift].remove(old_doctor)
            
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
        """Helper function to get a random neighbor as fallback. Always performs swaps, never just removals."""
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
                
            # Check which doctors can be replaced (skip doctors with contract for this shift)
            replaceable_indices = []
            for idx, doctor in enumerate(current_assignment):
                # Check if this doctor has a contract for this specific shift
                has_contract_for_this_shift = False
                for contract_info in self.contract_specific_shifts.get(doctor, []):
                    if contract_info.get('date') == date and contract_info.get('shift') == shift:
                        has_contract_for_this_shift = True
                        break
                
                # Only consider replacing doctors who don't have a contract for this shift
                if not has_contract_for_this_shift:
                    replaceable_indices.append(idx)
            
            # If no doctors can be replaced in this shift, try another shift
            if not replaceable_indices:
                continue
                
            # Select a random doctor to replace
            idx = random.choice(replaceable_indices)
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
            
            # If no available doctors found, try doctors with less strict requirements
            if not available_doctors:
                # Try doctors regardless of preference compatibility
                for doctor in [doc["name"] for doc in self.doctors]:
                    if doctor == old_doctor:
                        continue
                    
                    # Skip if already in this shift (would cause duplicate)
                    if doctor in current_assignment:
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
                        available_doctors.append(doctor)
            
            # If we still have no available doctors, try ANY available doctor 
            # (even if already assigned to another shift today)
            if not available_doctors:
                for doctor in [doc["name"] for doc in self.doctors]:
                    if doctor == old_doctor:
                        continue
                    
                    # Skip if already in this shift (would cause duplicate)
                    if doctor in current_assignment:
                        continue
                    
                    if not self._is_doctor_available(doctor, date, shift):
                        continue
                    
                    available_doctors.append(doctor)
                    
            # If still no available doctors, just skip this attempt
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
                # Check if this date has template requirements
                has_template = hasattr(self, 'shift_template') and date in self.shift_template
                
                if has_template:
                    # Count missing shifts specifically required by the template
                    for shift in self.shifts:
                        if shift in self.shift_template[date] and self.shift_template[date][shift].get('slots', 0) > 0:
                            coverage_errors += 1
                else:
                    # No template - use default shift requirements
                    coverage_errors += len(self.shifts)
                continue
                
            for shift in self.shifts:
                # Determine the required number of doctors for this shift
                has_template = hasattr(self, 'shift_template') and date in self.shift_template
                required_slots = 0
                
                if has_template and shift in self.shift_template[date]:
                    required_slots = self.shift_template[date][shift].get('slots', 0)
                elif not has_template:
                    required_slots = self.shift_requirements[shift]
                
                # Skip if no slots required for this shift
                if required_slots <= 0:
                    continue
                
                # Check if shift is missing
                if shift not in schedule[date]:
                    coverage_errors += 1
                    continue
                    
                # Check if shift is understaffed
                if len(schedule[date][shift]) < required_slots:
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
                    logger.warning(f"Duplicate doctor(s) detected in {date}, {shift}: {duplicates}")

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
        
        # NEW: Add a final verification for unfilled slots in the template
        unfilled_template_slots = []
        if hasattr(self, 'shift_template') and self.shift_template:
            for date in self.all_dates:
                if date not in self.shift_template:
                    continue
                    
                for shift in self.shifts:
                    if shift not in self.shift_template[date]:
                        continue
                    
                    # Get required slots from template
                    required = self.shift_template[date][shift].get('slots', 0)
                    if required <= 0:
                        continue
                    
                    # Count actual slots filled
                    filled = 0
                    if date in schedule and shift in schedule[date]:
                        filled = len(schedule[date][shift])
                    
                    # Check if all required slots are filled
                    if filled < required:
                        unfilled_template_slots.append((date, shift, required, filled))
        
        # Log unfilled slots as a critical issue
        if unfilled_template_slots:
            logger.critical(f"CRITICAL: Final schedule has {len(unfilled_template_slots)} unfilled template slots!")
            for date, shift, required, filled in unfilled_template_slots:
                logger.critical(f"  - {date}, {shift}: {filled}/{required} slots filled")
        
        stats = {
            "status": "Monthly Tabu Search completed",
            "solution_time_seconds": solution_time,
            "objective_value": best_cost,
            "coverage_errors": coverage_errors,
            "availability_violations": availability_violations,
            "duplicate_doctors": duplicate_count,
            "unfilled_template_slots": unfilled_template_slots,  # Add new field to stats
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
        contract_specific_shifts = data.get("contract_specific_shifts", {})  # Get contract-specific shifts
        
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
        optimizer = MonthlyScheduleOptimizer(doctors, holidays, availability, month, year, contract_specific_shifts)

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