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
import numpy as np

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

    def _get_limited_availability_doctors(self) -> Dict[str, int]:
        """
        Identify doctors with limited availability (available ≤ 20% of month's shifts).
        
        Returns:
            Dictionary mapping doctor names to their available days count
        """
        # Count total possible shifts in the month
        total_possible_shifts = len(self.all_dates) * len(self.shifts)
        threshold_percentage = 0.2  # 20% availability threshold
        threshold_shifts = total_possible_shifts * threshold_percentage
        
        # Count available shifts for each doctor
        doctor_availability_counts = {}
        for doctor in [doc["name"] for doc in self.doctors]:
            available_shifts = 0
            for date in self.all_dates:
                for shift in self.shifts:
                    if self._is_doctor_available(doctor, date, shift):
                        available_shifts += 1
            doctor_availability_counts[doctor] = available_shifts
        
        # Identify doctors with limited availability
        limited_availability_doctors = {}
        for doctor, available_shifts in doctor_availability_counts.items():
            if available_shifts <= threshold_shifts:
                available_days = len([date for date in self.all_dates 
                                     if any(self._is_doctor_available(doctor, date, shift) 
                                            for shift in self.shifts)])
                limited_availability_doctors[doctor] = available_days
                
        return limited_availability_doctors

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
        
        # NEW: Track contract doctors and their shift requirements
        contract_doctors = [d for d in self.doctors if d.get("contract") and d.get("contractShiftsDetail")]
        contract_shift_requirements = {}
        contract_shift_counts = {}
        
        for doctor in contract_doctors:
            doctor_name = doctor["name"]
            contract_shift_requirements[doctor_name] = {
                "Day": doctor.get("contractShiftsDetail", {}).get("day", 0),
                "Evening": doctor.get("contractShiftsDetail", {}).get("evening", 0),
                "Night": doctor.get("contractShiftsDetail", {}).get("night", 0)
            }
            contract_shift_counts[doctor_name] = {
                "Day": 0,
                "Evening": 0,
                "Night": 0
            }
        
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
                
                # NEW: First priority - contract doctors who need more of this shift type
                contract_selections = []
                
                if contract_doctors:
                    # Find contract doctors who still need shifts of this type
                    contract_candidates = []
                    for doc in contract_doctors:
                        doctor_name = doc["name"]
                        # Only consider if they're not already assigned today
                        if doctor_name in assigned_today:
                            continue
                            
                        # Only consider if they're available for this shift
                        if not self._is_doctor_available(doctor_name, date, shift):
                            continue
                            
                        # Get current count and required count for this shift type
                        current_count = contract_shift_counts[doctor_name][shift]
                        required_count = contract_shift_requirements[doctor_name][shift]
                        
                        # If they still need shifts of this type and are available, add them
                        if current_count < required_count:
                            # Calculate how many shifts they still need
                            remaining_needed = required_count - current_count
                            contract_candidates.append((doctor_name, remaining_needed))
                    
                    # Sort by those who need the most shifts first
                    contract_candidates.sort(key=lambda x: x[1], reverse=True)
                    
                    # Take as many contract doctors as needed, up to the required number for this shift
                    for doctor_name, _ in contract_candidates:
                        if len(contract_selections) >= required:
                            break
                        if doctor_name not in contract_selections:
                            contract_selections.append(doctor_name)
                            # Update contract shift counts
                            contract_shift_counts[doctor_name][shift] += 1
                
                # Get doctors with preference for this shift after contract doctors
                pref_key = f"{shift} Only"
                preferred_docs = [
                    d for d in self.doctors_by_preference.get(pref_key, [])
                    if d not in assigned_today and d not in contract_selections and 
                    self._is_doctor_available(d, date, shift)
                ]
                
                # For Evening shift with multiple preferences, distribute fairly
                if shift == "Evening" and len(preferred_docs) > required - len(contract_selections):
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
                
                # Take the required number of preferred doctors if available (after contracts)
                preferred_selections = []
                remaining_slots = required - len(contract_selections)
                
                if preferred_docs and remaining_slots > 0:
                    # Ensure no duplicates
                    unique_preferred = []
                    for doc in preferred_docs:
                        if doc not in unique_preferred:
                            unique_preferred.append(doc)
                    
                    preferred_selections = unique_preferred[:remaining_slots]
                
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
                # NEW: Start with contract doctors first
                for doc in contract_selections:
                    if doc not in assigned:  # Ensure no duplicates
                        assigned.append(doc)
                # Then add preference doctors
                for doc in preferred_selections:
                    if doc not in assigned:  # Ensure no duplicates
                        assigned.append(doc)
                # Finally add other doctors
                for doc in other_selections:
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
                    
                    # ENHANCED APPROACH: Try to fill all required slots while respecting availability
                    # Look for ANY available doctor for this shift, even if they're assigned elsewhere
                    # this might create duplicate assignments that the optimizer will fix later
                    additional_pool = [
                        d for d in doctor_names
                        if d not in final_assigned and
                        self._is_doctor_available(d, date, shift) and
                        self._can_assign_to_shift(d, shift)
                    ]
                    
                    # Sort by least assignments first
                    additional_pool.sort(key=lambda d: assignments[d])
                    
                    # Add doctors until we meet the required number
                    while len(final_assigned) < required and additional_pool:
                        doctor = additional_pool.pop(0)
                        if doctor not in final_assigned:  # Final uniqueness check
                            final_assigned.append(doctor)
                            
                    # If we STILL don't have enough doctors, try more aggressive measures
                    # while respecting the hard availability constraint
                    if len(final_assigned) < required:
                        # Find doctors who have the fewest assignments overall
                        # and are available for this shift
                        least_assigned_doctors = sorted(
                            [(d, assignments[d]) for d in doctor_names 
                             if d not in final_assigned and 
                             self._is_doctor_available(d, date, shift) and
                             self._can_assign_to_shift(d, shift)],
                            key=lambda x: x[1]
                        )
                        
                        # Keep adding doctors until we fill all slots
                        for doctor, _ in least_assigned_doctors:
                            if len(final_assigned) >= required:
                                break
                            if doctor not in final_assigned:
                                final_assigned.append(doctor)
                                
                    # STRONGER MEASURE: If we STILL can't fill all slots, then as a last resort,
                    # use any available doctor even if they have preference conflicts
                    if len(final_assigned) < required:
                        last_resort_pool = [
                            d for d in doctor_names
                            if d not in final_assigned and
                            self._is_doctor_available(d, date, shift)
                            # Note: Not checking preference compatibility here
                        ]
                        
                        # Sort by least assignments
                        last_resort_pool.sort(key=lambda d: assignments[d])
                        
                        while len(final_assigned) < required and last_resort_pool:
                            doctor = last_resort_pool.pop(0)
                            if doctor not in final_assigned:
                                final_assigned.append(doctor)
                                logger.warning(f"Using doctor {doctor} who has preference conflicts for {date}, {shift} as last resort")
                                
                    # ABSOLUTE LAST RESORT: If we STILL can't fill slots, pick any doctor at all
                    # even if they have other assignments or availability conflicts
                    if len(final_assigned) < required:
                        # Use literally any doctor, sorted by who has fewest assignments
                        emergency_pool = sorted(doctor_names, key=lambda d: assignments[d])
                        
                        while len(final_assigned) < required and emergency_pool:
                            doctor = emergency_pool.pop(0)
                            if doctor not in final_assigned:
                                final_assigned.append(doctor)
                                logger.critical(f"EMERGENCY: Using doctor {doctor} for {date}, {shift} regardless of availability as absolute last resort")
                        
                # NEW: Ensure we don't have more doctors than required
                # After all the attempts to find doctors, trim the list if we have too many
                if len(final_assigned) > required:
                    logger.warning(f"Too many doctors assigned to {date}, {shift}. Need {required}, have {len(final_assigned)}. Trimming list.")
                    # Sort by consecutive days worked and assignments to keep the best ones
                    final_assigned.sort(key=lambda d: (consecutive_days.get(d, 0), assignments.get(d, 0)))
                    # Keep only the required number of doctors
                    final_assigned = final_assigned[:required]
                        
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
                    
                    # NEW: Update contract shift counts for this doctor if they have a contract
                    if doctor in contract_shift_counts:
                        contract_shift_counts[doctor][shift] += 1
        
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
        7. NEW: Extreme penalty for contract shift violations
        8. NEW: Doctors with shift contracts or limited availability are excluded from hour balance calculations.
           - Limited availability is defined as doctors available for ≤20% of the total possible shifts in the month.
           - These doctors are still assigned shifts but do not factor into workload balance penalties.
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

        # Get list of doctors to exclude from hour balance (contract doctors and limited availability doctors)
        monthly_hours, doctors_to_exclude = self._calculate_monthly_hours(schedule)
        weekend_holiday_hours, _ = self._calculate_weekend_holiday_hours(schedule)
        
        # Log limited availability doctors for clarity
        limited_availability_doctors = self._get_limited_availability_doctors()
        if limited_availability_doctors:
            logger.info(f"The following doctors have limited availability and are exempted from hour balance calculations:")
            for doctor, days in limited_availability_doctors.items():
                logger.info(f"  {doctor}: {days} available days")
        
        # NEW: Check for contract shift violations (hard constraint)
        # Find doctors with contracts
        contract_doctors = [d["name"] for d in self.doctors if d.get("contract") and d.get("contractShiftsDetail")]
        if contract_doctors:
            # Initialize shift counts for each contract doctor
            doctor_shift_counts = {}
            for doctor in self.doctors:
                if doctor["name"] in contract_doctors:
                    doctor_shift_counts[doctor["name"]] = {
                        "Day": 0,
                        "Evening": 0,
                        "Night": 0
                    }
            
            # Count the actual shifts worked by each doctor
            for date in self.all_dates:
                if date not in schedule:
                    continue
                
                for shift in self.shifts:
                    if shift not in schedule[date]:
                        continue
                    
                    for doctor in schedule[date][shift]:
                        # Check if this is a contract doctor
                        if doctor in doctor_shift_counts:
                            doctor_shift_counts[doctor][shift] += 1
            
            # Compare with expected contract shift numbers and count violations
            for doctor in self.doctors:
                if doctor["name"] in contract_doctors:
                    doctor_name = doctor["name"]
                    actual_shifts = doctor_shift_counts[doctor_name]
                    expected_shifts = {
                        "Day": doctor.get("contractShiftsDetail", {}).get("day", 0),
                        "Evening": doctor.get("contractShiftsDetail", {}).get("evening", 0),
                        "Night": doctor.get("contractShiftsDetail", {}).get("night", 0)
                    }
                    
                    # Check if there's a mismatch between actual and expected shifts
                    if (actual_shifts["Day"] != expected_shifts["Day"] or
                        actual_shifts["Evening"] != expected_shifts["Evening"] or
                        actual_shifts["Night"] != expected_shifts["Night"]):
                        # Apply the highest weight (same as availability violations) to make this a hard constraint
                        cost += self.w_avail
                        logger.warning(f"Contract shift violation for {doctor_name}: Expected {expected_shifts}, got {actual_shifts}")

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
                # NEW: Also penalize if more doctors are assigned than required
                elif actual_slots > required_slots:
                    # Apply a high penalty for overstaffing as well
                    cost += self.w_unfilled_slots * (actual_slots - required_slots)
        
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
        monthly_hours, _ = self._calculate_monthly_hours(schedule)
        
        # Calculate junior and senior hours separately
        # Get consistent list of limited availability doctors
        limited_availability_doctors = self._get_limited_availability_doctors()
        
        # Exclude contract doctors and limited availability doctors from workload balance calculations
        junior_hours = {doc: monthly_hours[doc][self.month] 
                      for doc in self.junior_doctors 
                      if doc not in limited_availability_doctors and doc not in contract_doctors}
        
        senior_hours = {doc: monthly_hours[doc][self.month] 
                      for doc in self.senior_doctors 
                      if doc not in limited_availability_doctors and doc not in contract_doctors}
        
        # Calculate within-group variance to ensure fairness within each group
        if len(junior_hours) > 1:
            junior_vals = list(junior_hours.values())
            junior_variance = np.var(junior_vals)
            # Penalize more severely as variance increases
            if junior_variance > 24:  # More than 3 shift difference
                cost += self.w_balance * 3 * junior_variance
            elif junior_variance > 9:  # More than 1 shift difference
                cost += self.w_balance * junior_variance
            elif junior_variance > 1:  # Small differences
                cost += self.w_balance * 0.1 * junior_variance
                
        if len(senior_hours) > 1:
            senior_vals = list(senior_hours.values())
            senior_variance = np.var(senior_vals)
            # Penalize more severely as variance increases
            if senior_variance > 24:  # More than 3 shift difference
                cost += self.w_balance * 3 * senior_variance
            elif senior_variance > 9:  # More than 1 shift difference
                cost += self.w_balance * senior_variance
            elif senior_variance > 1:  # Small differences
                cost += self.w_balance * 0.1 * senior_variance
                
        # Ensure that, on average, seniors work less than juniors (comparing averages)
        if junior_hours and senior_hours:
            junior_avg = np.mean(list(junior_hours.values()))
            senior_avg = np.mean(list(senior_hours.values()))
            
            # Apply penalty if seniors work more than juniors on average
            if senior_avg > junior_avg:
                cost += self.w_senior_workload * (senior_avg - junior_avg)
        
        # 7. Weekend/Holiday fairness
        wh_hours, _ = self._calculate_weekend_holiday_hours(schedule)
        
        # Calculate hours for each group, excluding doctors with limited availability and contract doctors
        junior_wh_hours = {doc: wh_hours.get(doc, 0) for doc in self.junior_doctors 
                          if doc not in limited_availability_doctors and doc not in contract_doctors}
        senior_wh_hours = {doc: wh_hours.get(doc, 0) for doc in self.senior_doctors 
                          if doc not in limited_availability_doctors and doc not in contract_doctors}
        
        # Calculate within-group variance to ensure fairness within each group
        if len(junior_wh_hours) > 1:
            junior_vals = list(junior_wh_hours.values())
            junior_variance = np.var(junior_vals)
            cost += self.w_wh * junior_variance
                
        if len(senior_wh_hours) > 1:
            senior_vals = list(senior_wh_hours.values())
            senior_variance = np.var(senior_vals)
            cost += self.w_wh * senior_variance

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
            active_doctors_with_pref = [doc for doc in doctors_with_pref if doc not in limited_availability_doctors.keys()]
            
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
            doctor_total_shifts = {doctor: 0 for doctor in doctor_names if doctor not in limited_availability_doctors.keys()}
            
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
        
        # 4. Monthly hours balance between doctors
        # Calculate monthly hours for each doctor and exclude contract doctors
        doctor_hours = {}
        non_excluded_doctors = []
        
        for doctor, hours in monthly_hours.items():
            # Skip doctors that should be excluded from balance calculations
            if doctor in doctors_to_exclude:
                continue
                
            doctor_hours[doctor] = hours[self.month]
            non_excluded_doctors.append(doctor)
        
        if len(non_excluded_doctors) > 1:
            # Find min and max hours worked by any doctor this month
            min_hours = min(doctor_hours[d] for d in non_excluded_doctors)
            max_hours = max(doctor_hours[d] for d in non_excluded_doctors)
            
            # Calculate hour balance penalty if the difference is too large
            if max_hours - min_hours > self.max_doctor_hour_balance:
                # Apply quadratic penalty for larger differences
                hour_balance_diff = max_hours - min_hours - self.max_doctor_hour_balance
                cost += self.w_balance * hour_balance_diff**2
        
        # 5. Weekend/holiday balance between doctors
        non_excluded_wh_hours = {d: h for d, h in weekend_holiday_hours.items() if d not in doctors_to_exclude}
        
        if len(non_excluded_wh_hours) > 1:
            # Find min and max weekend/holiday hours
            min_wh = min(non_excluded_wh_hours.values())
            max_wh = max(non_excluded_wh_hours.values())
            
            # Calculate weekend/holiday balance penalty
            wh_diff = max_wh - min_wh
            cost += self.w_wh * wh_diff
        
        return cost

    def _calculate_monthly_hours(self, schedule):
        """Calculate monthly hours for each doctor more efficiently."""
        doctor_names = [doc["name"] for doc in self.doctors]
        monthly_hours = {doctor: {} for doctor in doctor_names}
        
        # Identify doctors with shift contracts to exclude them
        contract_doctors = [d["name"] for d in self.doctors if d.get("contract") and d.get("contractShiftsDetail")]
        
        # Identify doctors with limited availability to exclude them
        limited_availability_doctors = self._get_limited_availability_doctors()
        
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
        
        # Zero out hours for contract doctors so they don't affect hour balancing
        for doctor in contract_doctors:
            # We still track their hours for contract fulfillment, but set to 0 
            # for hour balancing across non-contract doctors
            monthly_hours[doctor][self.month] = 0
        
        # Zero out hours for limited availability doctors
        for doctor in limited_availability_doctors:
            # We still track their hours for reporting, but set to 0
            # for hour balancing across regular availability doctors
            monthly_hours[doctor][self.month] = 0
        
        # Return the calculated hours, and also pass along which doctors to exclude from balancing
        doctors_to_exclude = list(set(contract_doctors) | set(limited_availability_doctors.keys()))
        return monthly_hours, doctors_to_exclude
    
    def _calculate_weekend_holiday_hours(self, schedule):
        """Calculate weekend and holiday hours for each doctor within the month."""
        doctor_names = [doc["name"] for doc in self.doctors]
        wh_hours = {doctor: 0 for doctor in doctor_names}
        
        # Identify doctors with shift contracts to exclude them
        contract_doctors = [d["name"] for d in self.doctors if d.get("contract") and d.get("contractShiftsDetail")]
        
        # Identify doctors with limited availability to exclude them
        limited_availability_doctors = self._get_limited_availability_doctors()
        
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
        
        # Zero out hours for contract doctors so they don't affect hour balancing
        for doctor in contract_doctors:
            # We still track their hours for contract fulfillment, but set to 0 
            # for hour balancing across non-contract doctors
            wh_hours[doctor] = 0
            
        # Zero out hours for limited availability doctors
        for doctor in limited_availability_doctors:
            # We still track their hours for reporting, but set to 0
            # for hour balancing across regular availability doctors
            wh_hours[doctor] = 0
                    
        # Return the calculated hours and doctors to exclude
        doctors_to_exclude = list(set(contract_doctors) | set(limited_availability_doctors.keys()))
        return wh_hours, doctors_to_exclude

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
        monthly_hours, doctors_to_exclude = self._calculate_monthly_hours(current_schedule)
        weekend_holiday_hours, _ = self._calculate_weekend_holiday_hours(current_schedule)
        
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
        
        # NEW: Get contract doctors and their actual vs required shifts
        contract_doctors = [d for d in self.doctors if d.get("contract") and d.get("contractShiftsDetail")]
        
        # If there are contract doctors, count their current shifts
        contract_shift_counts = {}
        contract_shift_requirements = {}
        if contract_doctors:
            for doctor in contract_doctors:
                doctor_name = doctor["name"]
                contract_shift_counts[doctor_name] = {
                    "Day": 0,
                    "Evening": 0,
                    "Night": 0
                }
                contract_shift_requirements[doctor_name] = {
                    "Day": doctor.get("contractShiftsDetail", {}).get("day", 0),
                    "Evening": doctor.get("contractShiftsDetail", {}).get("evening", 0),
                    "Night": doctor.get("contractShiftsDetail", {}).get("night", 0)
                }
            
            # Count current shifts
            for date in self.all_dates:
                if date not in current_schedule:
                    continue
                
                for shift in self.shifts:
                    if shift not in current_schedule[date]:
                        continue
                    
                    for doctor in current_schedule[date][shift]:
                        if doctor in contract_shift_counts:
                            contract_shift_counts[doctor][shift] += 1
            
            # Identify contract violations
            contract_violations = {}
            for doctor_name, actual_shifts in contract_shift_counts.items():
                required_shifts = contract_shift_requirements[doctor_name]
                shift_diff = {
                    "Day": required_shifts["Day"] - actual_shifts["Day"],
                    "Evening": required_shifts["Evening"] - actual_shifts["Evening"],
                    "Night": required_shifts["Night"] - actual_shifts["Night"]
                }
                # If any shift type doesn't match requirements, it's a violation
                if shift_diff["Day"] != 0 or shift_diff["Evening"] != 0 or shift_diff["Night"] != 0:
                    contract_violations[doctor_name] = shift_diff
                    
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
            
            # NEW: Add fix_contract move with HIGHEST priority if there are contract violations
            move_types = ["evening_preference", "senior_workload", "monthly_balance", 
                        "weekend_holiday_balance", "consecutive_days", "fix_duplicates", 
                        "fill_template", "random"]
            
            move_weights = [0.15, 0.15, 0.15, 0.15, 0.1, 0.3, 0.7, 0.05]
            
            # Prioritize fixing contract violations if they exist
            if contract_doctors and any(contract_violations):
                move_types.insert(0, "fix_contract")
                # Give highest priority to fixing contracts
                move_weights.insert(0, 1.5)  
            
            # Decide which type of move to prioritize based on issues
            move_type = random.choices(
                move_types,
                weights=move_weights,
                k=1
            )[0]
            
            # NEW: High-priority move type to fix contract violations
            if move_type == "fix_contract" and contract_violations:
                # Select a doctor with contract violation
                doctor_name = random.choice(list(contract_violations.keys()))
                shift_diff = contract_violations[doctor_name]
                
                # 1. FIRST PRIORITY: Add shifts where the doctor needs more
                shifts_to_add = [s for s, diff in shift_diff.items() if diff > 0]
                if shifts_to_add:
                    shift_to_add = random.choice(shifts_to_add)
                    
                    # Find dates where we can add this doctor to this shift
                    potential_dates = []
                    for d in self.all_dates:
                        # Check if doctor is available
                        if not self._is_doctor_available(doctor_name, d, shift_to_add):
                            continue
                            
                        # Check if already working another shift that day
                        already_working = False
                        if d in current_schedule:
                            for s in self.shifts:
                                if s in current_schedule[d] and doctor_name in current_schedule[d][s]:
                                    already_working = True
                                    break
                        
                        if already_working:
                            continue
                        
                        # Check if this shift exists
                        shift_exists = d in current_schedule and shift_to_add in current_schedule[d]
                        
                        # For non-existent shifts, we would need to create it
                        if not shift_exists:
                            # We'll just skip these cases for simplicity
                            continue
                            
                        # If shift exists, check if this doctor is already in it
                        if shift_exists and doctor_name in current_schedule[d][shift_to_add]:
                            continue
                            
                        # This date is a candidate
                        potential_dates.append(d)
                    
                    if potential_dates:
                        date = random.choice(potential_dates)
                        shift = shift_to_add
                        
                        # We want to add this doctor - could either replace someone or add
                        if date in current_schedule and shift in current_schedule[date]:
                            # If shift is already full, replace someone
                            if len(current_schedule[date][shift]) >= self.shift_requirements[shift]:
                                # Try to replace a non-contract doctor if possible
                                replaceable_indices = []
                                for i, doc in enumerate(current_schedule[date][shift]):
                                    if doc not in contract_shift_counts:
                                        replaceable_indices.append(i)
                                
                                if replaceable_indices:
                                    idx = random.choice(replaceable_indices)
                                    old_doctor = current_schedule[date][shift][idx]
                                    new_doctor = doctor_name
                                    move_successful = True
                            else:
                                # Shift not full, simply add this doctor
                                idx = -1  # Special code to indicate adding not replacing
                                old_doctor = None
                                new_doctor = doctor_name
                                move_successful = True
                
                # 2. SECOND PRIORITY: Remove shifts where the doctor has too many
                if not move_successful:
                    shifts_to_remove = [s for s, diff in shift_diff.items() if diff < 0]
                    if shifts_to_remove:
                        shift_to_remove = random.choice(shifts_to_remove)
                        
                        # Find dates where this doctor is working this shift
                        potential_dates = []
                        for d in self.all_dates:
                            if d in current_schedule and shift_to_remove in current_schedule[d]:
                                if doctor_name in current_schedule[d][shift_to_remove]:
                                    potential_dates.append(d)
                        
                        if potential_dates:
                            date = random.choice(potential_dates)
                            shift = shift_to_remove
                            
                            # Find the index of this doctor in the shift
                            idx = current_schedule[date][shift].index(doctor_name)
                            old_doctor = doctor_name
                            
                            # Find a replacement doctor who's available
                            available_replacements = []
                            for doc in [d["name"] for d in self.doctors]:
                                # Skip if it's the same doctor
                                if doc == doctor_name:
                                    continue
                                    
                                # Skip other contract doctors to avoid creating new violations
                                if doc in contract_shift_counts:
                                    continue
                                    
                                # Check availability
                                if not self._is_doctor_available(doc, date, shift):
                                    continue
                                    
                                # Check if already working another shift
                                already_working = False
                                for s in self.shifts:
                                    if s == shift:
                                        continue
                                    if s in current_schedule[date] and doc in current_schedule[date][s]:
                                        already_working = True
                                        break
                                
                                if already_working:
                                    continue
                                    
                                # Doctor is a potential replacement
                                available_replacements.append(doc)
                            
                            if available_replacements:
                                new_doctor = random.choice(available_replacements)
                                move_successful = True
            
            # Existing move type - find and fill unfilled slots in the template
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
                            # Exclude contract doctors from sorting by workload
                            non_contract_doctors = [doc for doc in available_doctors if doc not in contract_doctors]
                            contract_doctor_list = [doc for doc in available_doctors if doc in contract_doctors]
                            
                            # Sort non-contract doctors by hours, keeping contract doctors separate
                            non_contract_doctors.sort(key=lambda doc: 
                                monthly_hours[doc].get(self.month, 0))
                            
                            # Prioritize non-contract doctors first to maintain hour balance
                            sorted_doctors = non_contract_doctors + contract_doctor_list
                            
                            # Choose the doctor with least hours
                            new_doc = sorted_doctors[0] if sorted_doctors else None
                            
                            if new_doc is not None:
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
                # Find doctors with highest and lowest monthly hours, excluding contract doctors and limited availability doctors
                month_doctors = {doc: hrs.get(self.month, 0) for doc, hrs in monthly_hours.items() 
                               if doc not in doctors_to_exclude}
                
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
                
                # Sort doctors by weekend/holiday hours (within their seniority group), excluding doctors with limited availability
                junior_wh = [(doc, wh_hours.get(doc, 0)) for doc in self.junior_doctors 
                            if doc not in doctors_to_exclude]
                senior_wh = [(doc, wh_hours.get(doc, 0)) for doc in self.senior_doctors 
                            if doc not in doctors_to_exclude]
                
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
                    # Calculate averages, excluding contract doctors
                    avg_junior = sum(hrs for _, hrs in junior_wh) / len(junior_wh) if junior_wh else 0
                    avg_senior = sum(hrs for _, hrs in senior_wh) / len(senior_wh) if senior_wh else 0
                    
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
                                                if doc in self.senior_doctors and doc not in contract_doctors]
                                
                                if senior_indices:
                                    index, senior_doc = random.choice(senior_indices)
                                    # Find junior doctors that are not contract doctors
                                    available_juniors = [doc[0] for doc in junior_wh if doc[0] not in current_schedule[d][s]]
                                    
                                    if available_juniors:
                                        junior_doc = available_juniors[0]  # Junior with lowest hours
                                        potential_moves.append((d, s, index, senior_doc, junior_doc))
                    
                    elif avg_senior < avg_junior * 0.7:  # Seniors have less than 70% of junior hours
                        # Find weekend/holiday shifts for juniors with highest hours
                        # Ensure we're only considering non-contract doctors
                        if junior_wh:
                            junior_with_most = max(junior_wh, key=lambda x: x[1])[0]
                            
                            # Look for shifts to transfer to seniors with lowest hours
                            if senior_wh:
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
        Create a new schedule by applying a move:
        1. Replace a doctor at a specific index
        2. Add a doctor if idx is -1
        3. Remove a doctor if new_doctor is None
        
        Returns the new schedule.
        """
        # Create a deep copy of the current schedule
        new_schedule = copy.deepcopy(current_schedule)
        
        # If the date doesn't exist in the schedule, create it
        if date not in new_schedule:
            new_schedule[date] = {}
        
        # If the shift doesn't exist for this date, create it
        if shift not in new_schedule[date]:
            new_schedule[date][shift] = []
        
        # Special case: adding a new doctor (idx = -1)
        if idx == -1 and new_doctor is not None:
            # NEW: Before adding, check if we would exceed the required number
            # Get required slots from template or default requirements
            required_slots = self.shift_requirements[shift]  # Default
            if hasattr(self, 'shift_template') and date in self.shift_template and shift in self.shift_template[date]:
                required_slots = self.shift_template[date][shift].get('slots', self.shift_requirements[shift])
            
            # Check if adding would exceed the required slots
            current_slots = len(new_schedule[date][shift])
            if current_slots >= required_slots:
                logger.warning(f"Not adding doctor {new_doctor} to {date}, {shift} - would exceed required slots ({required_slots})")
                return new_schedule  # Return without making changes
            
            new_schedule[date][shift].append(new_doctor)
            return new_schedule
        
        # Special case: removing a doctor (new_doctor is None)
        if old_doctor is not None and new_doctor is None:
            try:
                # Find the doctor to remove
                if old_doctor in new_schedule[date][shift]:
                    new_schedule[date][shift].remove(old_doctor)
            except (KeyError, ValueError):
                # Doctor not found or other error
                pass
            return new_schedule
        
        # Normal case: replacing a doctor
        if old_doctor is not None and new_doctor is not None:
            # First verify the doctor is in the list
            if old_doctor not in new_schedule[date][shift]:
                # Something went wrong - doctor not in the shift
                logger.warning(f"Doctor {old_doctor} not found in {date}, {shift} for replacement")
                return new_schedule
            
            # Use list comprehension for cleaner replacement while ensuring no duplicates
            already_in_shift = new_doctor in new_schedule[date][shift]
            if already_in_shift:
                # Would create duplicate - abort
                logger.warning(f"Not replacing {old_doctor} with {new_doctor} in {date}, {shift} - would create duplicate")
                return new_schedule
            
            # Replace the doctor
            new_schedule[date][shift] = [new_doctor if d == old_doctor else d for d in new_schedule[date][shift]]
            
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
                    monthly_hours, doctors_to_exclude = self._calculate_monthly_hours(best_schedule)
                    wh_hours, _ = self._calculate_weekend_holiday_hours(best_schedule)
                    
                    # Calculate workload variance for the month, excluding doctors with limited availability
                    month_values = [hrs.get(self.month, 0) for doc, hrs in monthly_hours.items() 
                                   if hrs.get(self.month, 0) > 0 and doc not in doctors_to_exclude]
                    workload_variance = max(month_values) - min(month_values) if month_values else 0
                    
                    # Senior vs junior workload, excluding doctors with limited availability
                    senior_avg = sum(monthly_hours[doc].get(self.month, 0) for doc in self.senior_doctors 
                                   if doc not in doctors_to_exclude) / max(len([d for d in self.senior_doctors 
                                                                             if d not in doctors_to_exclude]), 1)
                    junior_avg = sum(monthly_hours[doc].get(self.month, 0) for doc in self.junior_doctors 
                                   if doc not in doctors_to_exclude) / max(len([d for d in self.junior_doctors 
                                                                             if d not in doctors_to_exclude]), 1)
                    
                    # Weekend/holiday metrics, excluding doctors with limited availability
                    senior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.senior_doctors 
                                     if doc not in doctors_to_exclude) / max(len([d for d in self.senior_doctors 
                                                                              if d not in doctors_to_exclude]), 1)
                    junior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.junior_doctors 
                                     if doc not in doctors_to_exclude) / max(len([d for d in self.junior_doctors 
                                                                              if d not in doctors_to_exclude]), 1)
                    
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
                    logger.warning(f"Duplicate doctor(s) in final schedule at {date}, {shift}: {duplicates}")

        if progress_callback:
            progress_callback(100, "Monthly optimization complete")

        # Calculate monthly hours for reporting
        monthly_hours, doctors_to_exclude = self._calculate_monthly_hours(schedule)
        
        # Calculate monthly stats (min, max, avg) for reporting, excluding doctors with limited availability
        month_values = [hours.get(self.month, 0) for doctor, hours in monthly_hours.items() 
                      if self.month in hours and hours[self.month] > 0 and doctor not in doctors_to_exclude]
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
        
        # NEW: Add a final validation step to fix any shifts with too many doctors
        overstaffed_shifts = []
        for date in self.all_dates:
            if date not in best_schedule:
                continue
                
            for shift in self.shifts:
                if shift not in best_schedule[date]:
                    continue
                    
                # Determine the required number of doctors for this shift
                required_slots = self.shift_requirements[shift]  # Default
                if hasattr(self, 'shift_template') and date in self.shift_template and shift in self.shift_template[date]:
                    required_slots = self.shift_template[date][shift].get('slots', self.shift_requirements[shift])
                
                # Count how many doctors are assigned
                actual_slots = len(best_schedule[date][shift])
                
                # Fix overstaffed shifts
                if actual_slots > required_slots:
                    overstaffed_shifts.append((date, shift, actual_slots, required_slots))
                    logger.warning(f"Fixing overstaffed shift: {date}, {shift}. Has {actual_slots}, needs {required_slots}")
                    
                    # Sort doctors by some criteria (e.g., consecutive days worked, total assignments)
                    # to decide which ones to keep
                    shift_doctors = best_schedule[date][shift].copy()
                    
                    # Calculate monthly assignments for each doctor
                    doctor_assignments = {doctor: 0 for doctor in shift_doctors}
                    for d in self.all_dates:
                        if d not in best_schedule:
                            continue
                        for s in self.shifts:
                            if s not in best_schedule[d]:
                                continue
                            for doctor in best_schedule[d][s]:
                                if doctor in doctor_assignments:
                                    doctor_assignments[doctor] += 1
                    
                    # Sort by total assignments (keep doctors with fewer assignments)
                    shift_doctors.sort(key=lambda d: doctor_assignments.get(d, 0))
                    
                    # Keep only the required number of doctors
                    best_schedule[date][shift] = shift_doctors[:required_slots]
        
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
            "month": self.month,
            "limited_availability_doctors": self._get_limited_availability_doctors()  # Add limited availability doctors
        }

        return schedule, stats

    def _verify_solution(self, schedule):
        """Final validation of solution to ensure it meets all requirements."""
        # ... existing code ...
        
        # Calculate metrics for verification and reporting
        monthly_hours, doctors_to_exclude = self._calculate_monthly_hours(schedule)
        
        # ... existing code ...

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