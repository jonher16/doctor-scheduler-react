#!/usr/bin/env python3
"""
Hospital Staff Scheduler: Tabu Search Optimization

This version implements the Tabu Search optimization with specific corrections for:
1. Proper senior/junior workload distribution
2. Tighter monthly workload balance (targeting 10h variance max)
3. Better shift preference handling, especially for evening shifts
4. Proper seniority-preference hierarchy
5. Fixed duplicate doctor prevention in the same shift
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

        # Create indices for faster lookups
        self.doctor_indices = {doc["name"]: i for i, doc in enumerate(doctors)}
        self.doctor_info = {
            doc["name"]: {
                "seniority": doc.get("seniority", "Junior"),
                "pref": doc.get("pref", "None"),
                "maxShiftsPerWeek": doc.get("maxShiftsPerWeek", 0)  # Get maxShiftsPerWeek with default of 0 (no limit)
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

        # Targets for weekend/holiday assignments
        # Making these more explicit - juniors should work more weekend/holidays
        self.juniors_holiday_target = 50  # Target for juniors
        self.seniors_holiday_target = 42  # Target for seniors (20h less)
        self.junior_senior_holiday_diff = self.juniors_holiday_target - self.seniors_holiday_target
        # Monthly workload balance thresholds
        # Set this to exactly 10h as requested
        self.max_monthly_variance = 10  # Max difference between doctors in a month
        
        # Target monthly workload difference between juniors and seniors
        # Seniors should work less per month
        self.senior_junior_monthly_diff = 8  # Seniors should work ~8h less per month than juniors
        
        # Generate date collections
        self.all_dates = self._generate_dates()
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
        
        # Weights for the objective function components - adjusted for the issues
        self.w_avail = 100000    # Availability violations - hard constraint
        self.w_one_shift = 500   # Multiple shifts per day - hard constraint
        self.w_rest = 500        # Inadequate rest after night shift - hard constraint
        self.w_senior_holiday = 1000  # Senior working on long holidays - hard constraint
        self.w_balance = 30      # Increased penalty for monthly workload balance (was 10)
        self.w_wh = 30            # Increased penalty for weekend/holiday distribution (was 1)
        self.w_pref = {          # Preference violations with seniors getting priority
            "Junior": 10,        # For juniors
            "Senior": 25         # For seniors - increased to give seniors higher priority
        }
        self.w_senior_workload = 20  # New penalty for seniors working more than juniors
        self.w_preference_fairness = 5  # New penalty for unfair distribution among same-preference doctors
        self.w_duplicate_penalty = 10000  # New severe penalty for duplicate doctor in same shift (must be severe)
        self.w_max_shifts_per_week = 5000  # New severe penalty for exceeding max shifts per week (hard constraint)
        
        # Cache doctor availability status for improved performance
        self._availability_cache = {}
        self._initialize_availability_cache()
        
        # Track doctors with same preferences for fairness calculations
        self.evening_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Evening Only"]
        self.day_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Day Only"]
        self.night_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Night Only"]

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

    # -------------------------------
    # Tabu Search Helper Functions
    # -------------------------------

    def generate_initial_schedule(self) -> Dict[str, Dict[str, List[str]]]:
        """
        Generate an initial schedule.
        For each date and shift, assign the required number of doctors randomly,
        ONLY choosing those who are available and not already assigned on that day.
        
        This modified version prioritizes appropriate allocation from the start:
        - Evening shifts prioritize doctors with Evening Only preference
        - Senior doctors get fewer weekend/holiday assignments initially
        - Ensures no doctor appears more than once in the same shift
        """
        doctor_names = [doc["name"] for doc in self.doctors]
        schedule = {}
        
        # Track assignments for workload balancing
        month_assignments = {doctor: {month: 0 for month in range(1, 13)} for doctor in doctor_names}
        weekend_holiday_assignments = {doctor: 0 for doctor in doctor_names}
        
        # Process shifts in order of constraint difficulty (most constrained first)
        # Typically evening shifts are most constrained since there's only one slot
        shift_order = ["Evening", "Night", "Day"]
        
        for date in self.all_dates:
            month = self.date_info[date]["month"]
            is_weekend_or_holiday = date in self.weekends or date in self.holidays
            
            schedule[date] = {}
            assigned_today = set()  # Track doctors assigned on this date
            
            # Process shifts in the determined order
            for shift in shift_order:
                required = self.shift_requirements[shift]
                
                # Get doctors with preference for this shift first
                pref_key = f"{shift} Only"
                preferred_docs = [
                    d for d in self.doctors_by_preference.get(pref_key, [])
                    if d not in assigned_today and self._is_doctor_available(d, date, shift)
                ]
                
                # For Evening shift with multiple preferences, distribute fairly
                if shift == "Evening" and len(preferred_docs) > required:
                    # Sort by how often they've been assigned to this shift
                    preferred_docs.sort(key=lambda d: sum(1 for dt in schedule if dt in schedule and 
                                                         shift in schedule[dt] and 
                                                         d in schedule[dt][shift]))
                    
                # For weekend/holiday shifts, prioritize juniors
                if is_weekend_or_holiday:
                    # Separate seniors and juniors
                    junior_candidates = [d for d in preferred_docs if d in self.junior_doctors]
                    senior_candidates = [d for d in preferred_docs if d in self.senior_doctors]
                    
                    # Use a probabilistic approach instead of strict prioritization
                    if random.random() < 0.6:  # 60% chance to slightly favor juniors
                        # Interleave juniors and seniors with a slight bias toward juniors
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
                    # Ensure we don't add duplicates
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
                        self._is_doctor_available(d, date, shift)
                    ]
                    
                    # For weekend/holiday shifts, prioritize juniors among other candidates too
                    if is_weekend_or_holiday:
                        junior_others = [d for d in other_candidates if d in self.junior_doctors]
                        senior_others = [d for d in other_candidates if d in self.senior_doctors]
                        other_candidates = junior_others + senior_others
                    
                    # For regular days, try to balance monthly hours
                    else:
                        # Sort by monthly assignments so far (fewer assignments first)
                        other_candidates.sort(key=lambda d: month_assignments[d][month])
                    
                    # Take what we need from other candidates
                    if len(other_candidates) <= remaining_required:
                        # Ensure uniqueness
                        other_selections = []
                        for doc in other_candidates:
                            if doc not in other_selections:
                                other_selections.append(doc)
                    else:
                        # Take the subset we need, ensuring uniqueness
                        other_selections = []
                        for doc in other_candidates:
                            if len(other_selections) >= remaining_required:
                                break
                            if doc not in other_selections:
                                other_selections.append(doc)
                
                # Combine and assign doctors to this shift (ensuring no duplicates)
                assigned = []
                for doc in preferred_selections + other_selections:
                    if doc not in assigned:  # Enforce no duplicates
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
                    
                    # Apply same uniqueness check
                    additional_selections = []
                    for doc in additional_candidates:
                        if len(additional_selections) >= remaining_required:
                            break
                        if doc not in additional_selections:
                            additional_selections.append(doc)
                            
                    assigned.extend(additional_selections)
                
                # Final check for uniqueness (belt and suspenders)
                final_assigned = []
                for doc in assigned:
                    if doc not in final_assigned:
                        final_assigned.append(doc)
                
                # If still not enough, log the issue but continue with best effort
                if len(final_assigned) < required:
                    logger.warning(f"Not enough available doctors for {date}, {shift}. Need {required}, have {len(final_assigned)}")
                
                # Update the schedule
                schedule[date][shift] = final_assigned
                assigned_today.update(final_assigned)
                
                # Update assignment tracking
                for doctor in final_assigned:
                    month_assignments[doctor][month] += 1
                    if is_weekend_or_holiday:
                        weekend_holiday_assignments[doctor] += 1
        
        return schedule

    def objective(self, schedule: Dict[str, Dict[str, List[str]]]) -> float:
        """
        Compute the total penalty cost for a schedule.
        Lower cost indicates fewer constraint violations.
        
        Modified to address specific issues:
        1. Stronger penalties for senior workload
        2. Tighter monthly balance enforcement
        3. Better shift preference handling
        4. Preference fairness among doctors with same preference
        5. Added severe penalty for duplicate doctors in the same shift
        6. Added maximum shifts per week constraint
        """
        cost = 0.0
        doctor_names = [doc["name"] for doc in self.doctors]

        # ---- Performance Optimization ----
        # Pre-compute doctor assignments by date and shift for faster access
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

                for doctor in schedule[date][shift]:
                    assignments[doctor] = assignments.get(doctor, 0) + 1
                    
            for count in assignments.values():
                if count > 1:
                    cost += self.w_one_shift * (count - 1)

        # 2b. Check for duplicate doctors in the same shift (severe constraint violation)
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
                    # Count duplicates and apply severe penalty
                    duplicate_count = len(shift_doctors) - len(unique_doctors)
                    cost += self.w_duplicate_penalty * duplicate_count
                    
                    # Log the issue for debugging
                    duplicates = [d for d in shift_doctors if shift_doctors.count(d) > 1]
                    logger.warning(f"Duplicate doctor(s) detected in {date}, {shift}: {duplicates}")

        # New penalty: Maximum shifts per week constraint
        weekly_shifts = self._calculate_weekly_shifts(schedule)
        for doctor, shifts_by_week in weekly_shifts.items():
            max_shifts = self.doctor_info[doctor]["maxShiftsPerWeek"]
            if max_shifts > 0:  # Only check if there's a limit set (>0)
                for week, shift_count in shifts_by_week.items():
                    if shift_count > max_shifts:
                        # Apply a severe penalty for each shift over the maximum
                        excess = shift_count - max_shifts
                        cost += self.w_max_shifts_per_week * excess
                        logger.warning(f"Doctor {doctor} has {shift_count} shifts in week {week}, "
                                      f"which exceeds their maximum of {max_shifts}")

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

        # 4. Long holiday constraint for seniors (hard constraint)
        for date in self.all_dates:
            if date in self.holidays and self.holidays[date] == "Long":
                for doctor in doctor_names:
                    if self.doctor_info[doctor]["seniority"] == "Senior":
                        if (date in schedule and 
                            any(shift in schedule[date] and doctor in schedule[date][shift] 
                                for shift in self.shifts)):
                            cost += self.w_senior_holiday

        # 5. Monthly workload balance - use optimized calculation with stricter penalties
        monthly_hours = self._calculate_monthly_hours(schedule)
        
        for month in range(1, 13):
            # Calculate junior and senior hours separately for this month
            junior_hours = {doc: monthly_hours[doc].get(month, 0) for doc in self.junior_doctors}
            senior_hours = {doc: monthly_hours[doc].get(month, 0) for doc in self.senior_doctors}
            
            # Calculate overall monthly variance across all doctors (should be ≤ 10h)
            all_hours = [hours.get(month, 0) for doctor, hours in monthly_hours.items()]
            active_hours = [h for h in all_hours if h > 0]
            
            if active_hours:
                max_hours = max(active_hours)
                min_hours = min(active_hours)
                variance = max_hours - min_hours
                
                # Stronger penalty for exceeding the target variance
                if variance > self.max_monthly_variance:
                    # Increase to cubic penalty with a large multiplier to aggressively enforce this constraint
                    # This makes monthly variance much more important than preference violations
                    excess = variance - self.max_monthly_variance
                    cost += self.w_balance * 5 * (excess ** 3)
            
            # Calculate average hours for junior and senior doctors
            avg_junior = sum(junior_hours.values()) / max(len(junior_hours), 1)
            avg_senior = sum(senior_hours.values()) / max(len(senior_hours), 1)
            
            # NEW: Check if seniors are working more than juniors within a month
            if junior_hours and senior_hours:
                # Penalize if seniors work more than juniors
                if avg_senior > avg_junior:
                    cost += self.w_senior_workload * ((avg_senior - avg_junior) ** 2)
                
                # Also penalize if seniors are not working less by the target amount
                # They should work senior_junior_monthly_diff hours less than juniors
                if avg_senior > (avg_junior - self.senior_junior_monthly_diff):
                    # Linear penalty for this - how far from target difference
                    diff_gap = (avg_senior - (avg_junior - self.senior_junior_monthly_diff))
                    cost += self.w_senior_workload * diff_gap

        # 6. Weekend/Holiday fairness
        wh_hours = self._calculate_weekend_holiday_hours(schedule)

        # Calculate hours for each group
        junior_wh_hours = {doc: wh_hours[doc] for doc in self.junior_doctors}
        senior_wh_hours = {doc: wh_hours[doc] for doc in self.senior_doctors}

        # Calculate within-group variance to ensure fairness within each group
        if junior_wh_hours:
            j_values = list(junior_wh_hours.values())
            junior_wh_variance = max(j_values) - min(j_values) if j_values else 0
            cost += self.w_wh * (junior_wh_variance ** 1.5)  # Penalize variance within juniors

        if senior_wh_hours:
            s_values = list(senior_wh_hours.values())
            senior_wh_variance = max(s_values) - min(s_values) if s_values else 0
            cost += self.w_wh * (senior_wh_variance ** 1.5)  # Penalize variance within seniors

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
            # This prevents seniors from getting almost no weekend/holiday shifts
            cost += self.w_wh * (ideal_senior_avg * 0.8 - avg_senior_wh)
        
        # 7. Preference Adherence Penalty - modified to better handle preferences
        # Calculate preference adherence counts first
        preference_counts = defaultdict(lambda: defaultdict(int))
        
        for date in self.all_dates:
            if date not in schedule:
                continue
                
            for shift in self.shifts:
                if shift not in schedule[date]:
                    continue
                
                shift_doctors = schedule[date][shift]
                
                # Count preferred vs non-preferred assignments for each doctor
                for doctor in shift_doctors:
                    pref = self.doctor_info[doctor]["pref"]
                    if pref == "None":
                        continue
                    
                    if (pref == "Day Only" and shift == "Day") or \
                       (pref == "Evening Only" and shift == "Evening") or \
                       (pref == "Night Only" and shift == "Night"):
                        preference_counts[pref]['preferred'] += 1
                        preference_counts[pref][doctor] = preference_counts[pref].get(doctor, 0) + 1
                    else:
                        preference_counts[pref]['non_preferred'] += 1
                
                # Penalize non-preferred assignments
                for doctor in doctor_names:
                    pref = self.doctor_info[doctor]["pref"]
                    seniority = self.doctor_info[doctor]["seniority"]
                    
                    # Skip if no preference or doctor not in this shift
                    if pref == "None" or doctor not in shift_doctors:
                        continue
                    
                    # Check if shift matches preference
                    matches_pref = (
                        (pref == "Day Only" and shift == "Day") or
                        (pref == "Evening Only" and shift == "Evening") or
                        (pref == "Night Only" and shift == "Night")
                    )
                    
                    # Penalize if not matching preference
                    if not matches_pref:
                        cost += self.w_pref.get(seniority, self.w_pref["Junior"])
        
        # 8. NEW: Fairness between doctors with same preference
        # Check if shifts are fairly distributed among doctors with the same preference
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
                        # The more doctors with the same preference, the more important this is
                        multiplier = len(doctors_with_pref) / 2  # Scale by number of doctors
                        if variance > 3:  # Allow small differences
                            cost += self.w_preference_fairness * multiplier * ((variance - 3) ** 2)
        
        return cost

    def _calculate_monthly_hours(self, schedule):
        """Calculate monthly hours for each doctor more efficiently."""
        doctor_names = [doc["name"] for doc in self.doctors]
        monthly_hours = {doctor: {} for doctor in doctor_names}
        
        for month in range(1, 13):
            # Initialize month hours
            for doctor in doctor_names:
                monthly_hours[doctor][month] = 0
                
            # Calculate hours from schedule
            for date in self.month_dates[month]:
                if date not in schedule:
                    continue
                    
                for shift in self.shifts:
                    if shift not in schedule[date]:
                        continue
                        
                    for doctor in schedule[date][shift]:
                        monthly_hours[doctor][month] += self.shift_hours[shift]
                        
        return monthly_hours
    
    def _calculate_weekend_holiday_hours(self, schedule):
        """Calculate weekend and holiday hours for each doctor."""
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

    def _calculate_weekly_shifts(self, schedule: Dict[str, Dict[str, List[str]]]) -> Dict[str, Dict[int, int]]:
        """
        Calculate the number of shifts per week for each doctor.
        Returns a dictionary mapping doctor name to a dictionary mapping week number to shift count.
        """
        # Initialize result
        weekly_shifts = {doc["name"]: {} for doc in self.doctors}
        
        # Maps date string to ISO week number
        date_to_week = {}
        for date_str in self.all_dates:
            date = datetime.date.fromisoformat(date_str)
            week = date.isocalendar()[1]  # Get ISO week number
            date_to_week[date_str] = week
        
        # Count shifts per week
        for date, shifts in schedule.items():
            week = date_to_week[date]
            for shift_type, doctors in shifts.items():
                for doctor in doctors:
                    if doctor in weekly_shifts:
                        if week not in weekly_shifts[doctor]:
                            weekly_shifts[doctor][week] = 0
                        weekly_shifts[doctor][week] += 1
        
        return weekly_shifts

    def get_neighbors(self, current_schedule: Dict[str, Dict[str, List[str]]],
                  num_moves: int = 20) -> List[Tuple[Dict[str, Dict[str, List[str]]], Tuple[str, str, str, str]]]:
        """
        Generate neighbor schedules by selecting a random (date, shift) slot and replacing one doctor.
        Only consider available doctors for each shift based on their availability constraints.
        
        This improved version prioritizes moves that are likely to address the target issues:
        - Evening shift preference doctors getting more evening shifts
        - Seniors working fewer hours, especially on weekends/holidays
        - Monthly workload balance
        - Checks for and prevents duplicate doctors in the same shift
        - Respects maximum shifts per week constraint
        """
        neighbors = []
        attempts = 0
        max_attempts = num_moves * 10  # Allow more attempts to find valid moves
        
        # Pre-calculate monthly workload to inform better moves
        monthly_hours = self._calculate_monthly_hours(current_schedule)
        weekend_holiday_hours = self._calculate_weekend_holiday_hours(current_schedule)
        weekly_shifts = self._calculate_weekly_shifts(current_schedule)
        
        # Calculate monthly averages
        avg_monthly_hours = {}
        for month in range(1, 13):
            month_values = [hours.get(month, 0) for doctor, hours in monthly_hours.items()]
            if month_values:
                avg_monthly_hours[month] = sum(month_values) / len(month_values)
        
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
        
        # Check for violations of maximum shifts per week
        max_shifts_violations = {}
        for doctor, shifts_by_week in weekly_shifts.items():
            max_allowed = self.doctor_info[doctor]["maxShiftsPerWeek"]
            if max_allowed > 0:  # Only check if a limit is set
                for week, count in shifts_by_week.items():
                    if count > max_allowed:
                        if doctor not in max_shifts_violations:
                            max_shifts_violations[doctor] = []
                        max_shifts_violations[doctor].append((week, count, max_allowed))
        
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
            move_types = ["evening_preference", "senior_workload", "monthly_balance", "weekend_holiday_balance", "fix_duplicates", "random"]
            weights = [0.3, 0.3, 0.2, 0.2, 0.5, 0.1]
            
            # Add max_shifts_per_week move type with high priority if there are violations
            if max_shifts_violations:
                move_types.append("max_shifts_per_week")
                weights.append(0.8)  # High priority for this move type
            
            move_type = random.choices(
                move_types,
                weights=weights,
                k=1
            )[0]
            
            # New move type: Fix maximum shifts per week violations
            if move_type == "max_shifts_per_week" and max_shifts_violations:
                # Select a doctor with violations
                doctor_with_violation = random.choice(list(max_shifts_violations.keys()))
                # Get one of their violations
                week_info = random.choice(max_shifts_violations[doctor_with_violation])
                week_num, current_count, max_allowed = week_info
                
                # Find a date in this week where the doctor works
                week_dates = []
                for date_str in self.all_dates:
                    date_obj = datetime.date.fromisoformat(date_str)
                    if date_obj.isocalendar()[1] == week_num:
                        week_dates.append(date_str)
                
                # Find shifts where this doctor works in this week
                potential_moves = []
                for d in week_dates:
                    if d not in current_schedule:
                        continue
                    
                    for s in self.shifts:
                        if s not in current_schedule[d]:
                            continue
                        
                        if doctor_with_violation in current_schedule[d][s]:
                            idx = current_schedule[d][s].index(doctor_with_violation)
                            potential_moves.append((d, s, idx))
                
                if potential_moves:
                    # Select a random shift to change
                    d, s, index = random.choice(potential_moves)
                    date = d
                    shift = s
                    idx = index
                    old_doctor = doctor_with_violation
                    
                    # Find an available doctor who doesn't have max shift violations
                    available_doctors = []
                    for doctor in [doc["name"] for doc in self.doctors]:
                        if doctor == old_doctor:
                            continue
                        
                        if doctor in current_schedule[date][shift]:
                            continue  # Skip if already in this shift
                        
                        # Skip doctors who already have max shifts violations
                        if doctor in max_shifts_violations:
                            continue
                        
                        # Check weekly shifts - skip if this would cause a new violation
                        max_allowed_for_doc = self.doctor_info[doctor]["maxShiftsPerWeek"]
                        if max_allowed_for_doc > 0:  # Only check if they have a limit
                            week = datetime.date.fromisoformat(date).isocalendar()[1]
                            current_shifts = weekly_shifts.get(doctor, {}).get(week, 0)
                            if current_shifts >= max_allowed_for_doc:
                                continue  # This would cause a new violation
                        
                        if not self._is_doctor_available(doctor, date, shift):
                            continue
                        
                        # Check if not already assigned to another shift that day
                        already_assigned = False
                        for other_shift in self.shifts:
                            if other_shift == shift:
                                continue
                            if other_shift in current_schedule[date] and doctor in current_schedule[date][other_shift]:
                                already_assigned = True
                                break
                        
                        if not already_assigned:
                            available_doctors.append(doctor)
                    
                    if available_doctors:
                        new_doctor = random.choice(available_doctors)
                        move_successful = True
                        logger.info(f"Generated max_shifts_per_week move: {date}, {shift}, replacing {old_doctor} with {new_doctor}")
            
            # New special mode: Look for and fix duplicate doctors in shifts
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
                    
                    if duplicates_found and move_successful:
                        break
                
            # 1. Target evening shift preference issues
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
                            # Skip if same as doctor being replaced (no-op)
                            if doctor == old_doctor:
                                continue
                            
                            # Check if already in this shift (would cause duplicate)
                            if doctor in current_assignment:
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
                        # Skip if same as doctor being replaced (no-op)
                        if doctor == old_doctor:
                            continue
                        
                        # Check if already in this shift (would cause duplicate)
                        if doctor in current_schedule[date][shift]:
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
            
            # 3. Target monthly balance issues
            elif move_type == "monthly_balance":
                # Find doctors with highest and lowest monthly hours
                month = random.randint(1, 12)
                month_doctors = {doc: hrs.get(month, 0) for doc, hrs in monthly_hours.items()}
                
                if month_doctors:
                    # Sort doctors by hours in this month
                    sorted_docs = sorted(month_doctors.items(), key=lambda x: x[1])
                    if len(sorted_docs) >= 2:
                        # Try to move hours from highest to lowest
                        lowest_doc, lowest_hours = sorted_docs[0]
                        highest_doc, highest_hours = sorted_docs[-1]
                        
                        # Only proceed if there's a significant gap
                        if highest_hours - lowest_hours >= 8:
                            # Find a date in this month where the highest doctor works
                            month_dates = self.month_dates[month]
                            potential_moves = []
                            
                            for d in month_dates:
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
                                
                                # Check if the lowest doctor is available for this slot
                                if lowest_doc != old_doctor and lowest_doc not in current_schedule[date][shift] and self._is_doctor_available(lowest_doc, date, shift):
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
                                            if doctor == old_doctor:
                                                continue
                                                
                                            if doctor in current_schedule[date][shift]:
                                                continue  # Skip if already in this shift
                                                
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
                                
                                if junior_with_most in current_schedule[d][s]:
                                    index = current_schedule[d][s].index(junior_with_most)
                                    potential_moves.append((d, s, index, junior_with_most, senior_with_least))
                
                if potential_moves:
                    # Choose one of the potential moves
                    date, shift, idx, old_doctor, new_doctor = random.choice(potential_moves)
                    
                    # Make sure we're not adding a duplicate doctor to the shift
                    if new_doctor not in current_schedule[date][shift]:
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
            
            # 5. Random move as fallback
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
                            # Skip if same as doctor being replaced (no-op)
                            if doctor == old_doctor:
                                continue
                                
                            # Skip if already in this shift (would cause duplicate)
                            if doctor in current_assignment:
                                continue
                                
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
                        
                        # If available replacements, pick one
                        if available_doctors:
                            # Select a random available doctor as replacement
                            new_doctor = random.choice(list(available_doctors))
                            move_successful = True
            
            # Create a new schedule only if all variables are properly set and the move was successful
            if move_successful and date is not None and shift is not None and idx is not None and old_doctor is not None and new_doctor is not None:
                # Create a new schedule with the selected move (using helper function)
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
                    
                if doctor in current_assignment:
                    continue  # Skip if already in this shift (would cause duplicate)
                    
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
            
            if not available_doctors:
                continue
                
            # Select a random replacement
            new_doctor = random.choice(available_doctors)
            
            # Create new schedule
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

        # Generate initial schedule with smarter starting point
        current_schedule = self.generate_initial_schedule()
        current_cost = self.objective(current_schedule)
        best_schedule = copy.deepcopy(current_schedule)  # Use deep copy to avoid reference issues
        best_cost = current_cost

        tabu_list = {}  # Map move (tuple) to expiration iteration
        tabu_tenure = 20  # Increased tabu tenure to avoid cycling
        max_iterations = 1500  # More iterations for better convergence
        no_improve_count = 0
        iteration = 0
        
        # Phase tracking for targeted optimization
        current_phase = "general"  # Start with general optimization
        phase_iterations = 0
        phase_max = 300  # Switch phases every 300 iterations
        
        # Phases: "general" -> "balance" -> "senior" -> "preference" -> repeat
        
        # Report progress less frequently to reduce overhead
        progress_interval = 20

        while iteration < max_iterations and no_improve_count < 100:  # Increased patience
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
            neighbors = self.get_neighbors(current_schedule, num_moves=25)  # More neighbors
            
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
                
                # Every 50 iterations, log key metrics for monitoring
                if iteration % 50 == 0:
                    # Calculate important metrics for the best schedule
                    monthly_hours = self._calculate_monthly_hours(best_schedule)
                    wh_hours = self._calculate_weekend_holiday_hours(best_schedule)
                    weekly_shifts = self._calculate_weekly_shifts(best_schedule)
                    
                    # Monthly balance metrics
                    monthly_imbalances = {}
                    for month in range(1, 13):
                        month_values = [hrs.get(month, 0) for doc, hrs in monthly_hours.items() if hrs.get(month, 0) > 0]
                        if month_values:
                            monthly_imbalances[month] = max(month_values) - min(month_values)
                    
                    worst_month = max(monthly_imbalances.items(), key=lambda x: x[1]) if monthly_imbalances else (0, 0)
                    
                    # Senior vs junior workload
                    senior_avg = sum(monthly_hours[doc].get(1, 0) for doc in self.senior_doctors) / max(len(self.senior_doctors), 1)
                    junior_avg = sum(monthly_hours[doc].get(1, 0) for doc in self.junior_doctors) / max(len(self.junior_doctors), 1)
                    
                    # Weekend/holiday metrics
                    senior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.senior_doctors) / max(len(self.senior_doctors), 1)
                    junior_wh_avg = sum(wh_hours.get(doc, 0) for doc in self.junior_doctors) / max(len(self.junior_doctors), 1)
                    
                    logger.info(f"Iteration {iteration} metrics - Cost: {best_cost:.2f}, "
                               f"Worst month balance: {worst_month[0]} ({worst_month[1]}h), "
                               f"Senior hours: {senior_avg:.1f}h, Junior hours: {junior_avg:.1f}h, "
                               f"Senior W/H: {senior_wh_avg:.1f}h, Junior W/H: {junior_wh_avg:.1f}h")
                    
                    # Special focus if metrics are not good
                    if worst_month[1] > 15:  # Monthly balance still too high
                        current_phase = "balance"
                        phase_iterations = 0
                        logger.info("Switching to balance focus due to high monthly variance")
                        
                    if senior_avg >= junior_avg:  # Seniors working too much
                        current_phase = "senior" 
                        phase_iterations = 0
                        logger.info("Switching to senior focus due to high senior workload")
                        
                    if senior_wh_avg > junior_wh_avg - 10:  # Senior weekend/holiday issue
                        current_phase = "senior"
                        phase_iterations = 0
                        logger.info("Switching to senior focus due to high senior weekend/holiday hours")
            else:
                no_improve_count += 1
            
            # Report progress less frequently
            if progress_callback and iteration % progress_interval == 0:
                progress_callback(50 + int(40 * iteration / max_iterations),
                                f"Iteration {iteration}: Best cost = {best_cost:.2f} ({current_phase} phase)")

        end_time = time.time()
        logger.info(f"Optimization complete. Best cost: {best_cost}")
        
        # Track and return statistics about the schedule
        stats = {}
        
        # Calculate monthly hours for each doctor
        monthly_hours = self._calculate_monthly_hours(best_schedule)
        
        # Find monthly hour distribution for each month
        monthly_stats = {}
        for month in range(1, 13):
            month_values = [hrs.get(month, 0) for doc, hrs in monthly_hours.items() if hrs.get(month, 0) > 0]
            if month_values:
                monthly_stats[month] = {
                    "min": min(month_values),
                    "max": max(month_values),
                    "avg": sum(month_values) / len(month_values),
                    "variance": max(month_values) - min(month_values)
                }
        
        stats["monthly"] = monthly_stats
        
        # Calculate totals for each doctor
        doctor_totals = {}
        for doctor, months in monthly_hours.items():
            doctor_totals[doctor] = sum(months.values())
        
        stats["totals"] = doctor_totals
        
        # Calculate preference satisfaction
        pref_stats = {
            "Day Only": {"total": 0, "satisfied": 0},
            "Evening Only": {"total": 0, "satisfied": 0},
            "Night Only": {"total": 0, "satisfied": 0}
        }
        
        for date in self.all_dates:
            if date not in best_schedule:
                continue
                
            for shift in self.shifts:
                if shift not in best_schedule[date]:
                    continue
                    
                for doctor in best_schedule[date][shift]:
                    pref = self.doctor_info[doctor]["pref"]
                    if pref in pref_stats:
                        pref_stats[pref]["total"] += 1
                        if pref.startswith(f"{shift} Only"):
                            pref_stats[pref]["satisfied"] += 1
        
        stats["preferences"] = pref_stats
        
        # Calculate weekend/holiday distribution
        wh_hours = self._calculate_weekend_holiday_hours(best_schedule)
        
        # Calculate WH stats by seniority
        junior_wh = [wh_hours[doc] for doc in self.junior_doctors if doc in wh_hours]
        senior_wh = [wh_hours[doc] for doc in self.senior_doctors if doc in wh_hours]
        
        wh_stats = {
            "junior": {
                "min": min(junior_wh) if junior_wh else 0,
                "max": max(junior_wh) if junior_wh else 0,
                "avg": sum(junior_wh) / len(junior_wh) if junior_wh else 0
            },
            "senior": {
                "min": min(senior_wh) if senior_wh else 0,
                "max": max(senior_wh) if senior_wh else 0,
                "avg": sum(senior_wh) / len(senior_wh) if senior_wh else 0
            }
        }
        
        stats["weekend_holiday"] = wh_stats
        
        # Calculate max shifts per week violations
        weekly_shifts = self._calculate_weekly_shifts(best_schedule)
        max_shifts_violations = {}
        
        for doctor, shifts_by_week in weekly_shifts.items():
            max_allowed = self.doctor_info[doctor]["maxShiftsPerWeek"]
            if max_allowed > 0:  # Only check if a limit is set
                violations = []
                for week, count in shifts_by_week.items():
                    if count > max_allowed:
                        violations.append({
                            "week": week,
                            "count": count,
                            "max_allowed": max_allowed,
                            "excess": count - max_allowed
                        })
                
                if violations:
                    max_shifts_violations[doctor] = violations
        
        stats["max_shifts_violations"] = max_shifts_violations
        stats["total_max_shifts_violations"] = sum(len(v) for v in max_shifts_violations.values())
        
        if progress_callback:
            progress_callback(100, "Optimization complete!")
            
        return best_schedule, stats

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

    import time
    start = time.time()
    result = optimize_schedule(sample_data)
    end = time.time()
    
    print(f"Optimization completed in {end - start:.2f} seconds")
    print(f"Status: {result['statistics']['status']}")
    print(f"Solution time: {result['statistics'].get('solution_time_seconds', 'N/A')} seconds")
    print(f"Objective value: {result['statistics'].get('objective_value', 'N/A')}")
    
    # Print senior vs junior workload for month 1
    monthly_hours = result['statistics']['monthly_hours']
    senior_hours = {doc: monthly_hours[doc].get(1, 0) for doc in ["Doctor11", "Doctor12", "Doctor13"]}
    junior_hours = {doc: monthly_hours[doc].get(1, 0) for doc in ["Doctor1", "Doctor2", "Doctor3", "Doctor4", "Doctor5", 
                                                         "Doctor6", "Doctor7", "Doctor8", "Doctor9", "Doctor10"]}
    
    print("\nMonth 1 Hours:")
    print(f"Senior avg: {sum(senior_hours.values())/max(len(senior_hours), 1):.1f}h")
    print(f"Junior avg: {sum(junior_hours.values())/max(len(junior_hours), 1):.1f}h")
    
    # Print evening shift preference stats
    evening_pref_docs = ["Doctor3", "Doctor4", "Doctor5"]
    evening_shifts = {doc: 0 for doc in evening_pref_docs}
    
    for date in result['schedule']:
        if "Evening" in result['schedule'][date]:
            for doc in evening_pref_docs:
                if doc in result['schedule'][date]["Evening"]:
                    evening_shifts[doc] += 1
    
    print("\nEvening shift allocation:")
    for doc, count in evening_shifts.items():
        print(f"{doc}: {count} evening shifts")
    
    # Print sample of schedule
    print("\nSample of schedule (first 3 days):")
    schedule = result["schedule"]
    dates = sorted(schedule.keys())[:3]
    for date in dates:
        print(f"\n{date}:")
        for shift in ["Day", "Evening", "Night"]:
            if shift in schedule[date]:
                assigned = schedule[date][shift]
                print(f"  {shift}: {', '.join(assigned)}")
            else:
                print(f"  {shift}: None")