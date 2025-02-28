#!/usr/bin/env python3
"""
Hospital Doctor Scheduling Optimization Algorithm

This script implements the Mixed-Integer Linear Programming (MILP) approach
described in the technical report to generate an optimal yearly schedule
for hospital doctors.

Requirements:
- PuLP: pip install pulp
- JSON: for data input/output

Usage:
python optimize_schedule.py input_data.json output_schedule.json

The input JSON should contain:
- doctors: List of doctor objects with name, seniority, and preferences
- holidays: Dictionary mapping dates to holiday types (Short/Long)
- availability: Dictionary mapping doctor names to dates and availability
"""

import json
import sys
from datetime import datetime, timedelta
import pulp


def generate_schedule(input_data):
    """
    Main function to generate an optimized schedule using MILP.
    
    Args:
        input_data: Dictionary containing doctors, holidays, and availability data
        
    Returns:
        Dictionary representing the optimized schedule
    """
    # Extract input data
    doctors = input_data.get('doctors', [])
    holidays = input_data.get('holidays', {})
    availability = input_data.get('availability', {})
    
    # Parameters
    year = 2025  # Fixed year as per the application
    days_in_year = 365
    shifts = ["Day", "Evening", "Night"]
    shift_coverage = {"Day": 2, "Evening": 1, "Night": 2}
    shift_hours = {"Day": 8, "Evening": 8, "Night": 8}  # Hours per shift
    
    # Create date objects for all days in the year
    start_date = datetime(year, 1, 1)
    dates = [start_date + timedelta(days=d) for d in range(days_in_year)]
    date_strings = [d.strftime("%Y-%m-%d") for d in dates]
    
    # Categorize days
    is_weekend = {d: datetime.strptime(d, "%Y-%m-%d").weekday() >= 5 for d in date_strings}
    is_holiday = {d: d in holidays for d in date_strings}
    holiday_type = {d: holidays.get(d, "") for d in date_strings}
    
    # Group days by month for workload balancing
    months = {}
    for date_str in date_strings:
        month = datetime.strptime(date_str, "%Y-%m-%d").month
        if month not in months:
            months[month] = []
        months[month].append(date_str)
    
    # Create doctor data
    doctor_names = [doc["name"] for doc in doctors]
    seniority = {doc["name"]: doc["seniority"] for doc in doctors}
    preferences = {doc["name"]: doc["pref"] for doc in doctors}
    
    # Process availability
    doctor_availability = {}
    for doctor in doctor_names:
        doctor_availability[doctor] = {}
        for date_str in date_strings:
            if doctor in availability and date_str in availability[doctor]:
                avail_status = availability[doctor][date_str]
                doctor_availability[doctor][date_str] = {
                    "Available": {"Day": True, "Evening": True, "Night": True},
                    "Not Available": {"Day": False, "Evening": False, "Night": False},
                    "Day Only": {"Day": True, "Evening": False, "Night": False},
                    "Evening Only": {"Day": False, "Evening": True, "Night": False},
                    "Night Only": {"Day": False, "Evening": False, "Night": True}
                }.get(avail_status, {"Day": True, "Evening": True, "Night": True})
            else:
                # Default: doctor is available for all shifts
                doctor_availability[doctor][date_str] = {"Day": True, "Evening": True, "Night": True}
    
    # Process preferences
    shift_preferences = {}
    for doctor in doctor_names:
        shift_preferences[doctor] = {"Day": 1, "Evening": 1, "Night": 1}  # Default: no preference (penalty=1)
        pref = preferences.get(doctor, "None")
        if pref == "Day Only":
            shift_preferences[doctor] = {"Day": 0, "Evening": 3, "Night": 3}
        elif pref == "Evening Only":
            shift_preferences[doctor] = {"Day": 3, "Evening": 0, "Night": 3}
        elif pref == "Night Only":
            shift_preferences[doctor] = {"Day": 3, "Evening": 3, "Night": 0}
    
    # Create the MILP problem
    problem = pulp.LpProblem("Doctor_Scheduling", pulp.LpMinimize)
    
    # Decision variables: x[doctor, date, shift] = 1 if assigned, 0 otherwise
    x = {}
    for doctor in doctor_names:
        for date_str in date_strings:
            for shift in shifts:
                x[(doctor, date_str, shift)] = pulp.LpVariable(
                    f"x_{doctor}_{date_str}_{shift}", 
                    cat=pulp.LpBinary
                )
    
    # Helper variables for workload tracking
    monthly_hours = {}
    for doctor in doctor_names:
        for month in months:
            monthly_hours[(doctor, month)] = pulp.LpVariable(
                f"monthly_hours_{doctor}_{month}", 
                lowBound=0,
                cat=pulp.LpContinuous
            )
    
    # Min and max monthly hours variables
    min_monthly_hours = {}
    max_monthly_hours = {}
    for month in months:
        min_monthly_hours[month] = pulp.LpVariable(
            f"min_monthly_hours_{month}", 
            lowBound=0,
            cat=pulp.LpContinuous
        )
        max_monthly_hours[month] = pulp.LpVariable(
            f"max_monthly_hours_{month}", 
            lowBound=0,
            cat=pulp.LpContinuous
        )
    
    # Weekend/holiday hours variables
    weekend_holiday_hours = {}
    for doctor in doctor_names:
        weekend_holiday_hours[doctor] = pulp.LpVariable(
            f"weekend_holiday_hours_{doctor}", 
            lowBound=0,
            cat=pulp.LpContinuous
        )
    
    # Objective function components
    preference_penalty = pulp.lpSum(
        shift_preferences[doctor][shift] * x[(doctor, date_str, shift)]
        for doctor in doctor_names
        for date_str in date_strings
        for shift in shifts
    )
    
    monthly_variance = pulp.lpSum(
        max_monthly_hours[month] - min_monthly_hours[month]
        for month in months
    )
    
    # Weekend/holiday penalty for seniors exceeding target
    senior_weekend_penalty = pulp.lpSum(
        pulp.LpAffineExpression([(weekend_holiday_hours[doctor], 1), (30, -1)])
        for doctor in doctor_names
        if seniority[doctor] == "Senior"
    )
    
    # Objective: minimize weighted sum of penalties
    alpha = 1    # Preference weight
    beta = 10    # Monthly variance weight
    gamma = 5    # Weekend/holiday weight
    
    problem += alpha * preference_penalty + beta * monthly_variance + gamma * senior_weekend_penalty
    
    # CONSTRAINTS
    
    # 1. Shift Coverage: Exact number of doctors per shift
    for date_str in date_strings:
        for shift in shifts:
            problem += (
                pulp.lpSum(x[(doctor, date_str, shift)] for doctor in doctor_names) == shift_coverage[shift],
                f"Coverage_{date_str}_{shift}"
            )
    
    # 2. Doctor Availability: Can't assign if unavailable
    for doctor in doctor_names:
        for date_str in date_strings:
            for shift in shifts:
                if not doctor_availability[doctor][date_str][shift]:
                    problem += (
                        x[(doctor, date_str, shift)] == 0,
                        f"Availability_{doctor}_{date_str}_{shift}"
                    )
    
    # 3. One Shift Per Day: Each doctor works at most one shift per day
    for doctor in doctor_names:
        for date_str in date_strings:
            problem += (
                pulp.lpSum(x[(doctor, date_str, shift)] for shift in shifts) <= 1,
                f"OneShiftPerDay_{doctor}_{date_str}"
            )
    
    # 4. Rest after Night Shift: No day or evening shift after night shift
    for doctor in doctor_names:
        for i in range(len(date_strings) - 1):
            date_str = date_strings[i]
            next_date_str = date_strings[i+1]
            problem += (
                x[(doctor, date_str, "Night")] + x[(doctor, next_date_str, "Day")] <= 1,
                f"RestAfterNight_Day_{doctor}_{date_str}"
            )
            problem += (
                x[(doctor, date_str, "Night")] + x[(doctor, next_date_str, "Evening")] <= 1,
                f"RestAfterNight_Evening_{doctor}_{date_str}"
            )
    
    # 5. Monthly Working Hours Calculation
    for doctor in doctor_names:
        for month in months:
            problem += (
                monthly_hours[(doctor, month)] == pulp.lpSum(
                    shift_hours[shift] * x[(doctor, date_str, shift)]
                    for date_str in months[month]
                    for shift in shifts
                ),
                f"MonthlyHours_{doctor}_{month}"
            )
    
    # 6. Min/Max Monthly Hours Constraints
    for month in months:
        for doctor in doctor_names:
            problem += (
                monthly_hours[(doctor, month)] >= min_monthly_hours[month],
                f"MinHours_{doctor}_{month}"
            )
            problem += (
                monthly_hours[(doctor, month)] <= max_monthly_hours[month],
                f"MaxHours_{doctor}_{month}"
            )
        
        # Ensure max difference is at most 10 hours
        problem += (
            max_monthly_hours[month] - min_monthly_hours[month] <= 10,
            f"MaxVariance_{month}"
        )
    
    # 7. Weekend/Holiday Hours Calculation
    for doctor in doctor_names:
        problem += (
            weekend_holiday_hours[doctor] == pulp.lpSum(
                shift_hours[shift] * x[(doctor, date_str, shift)]
                for date_str in date_strings
                if is_weekend[date_str] or is_holiday[date_str]
                for shift in shifts
            ),
            f"WeekendHolidayHours_{doctor}"
        )
    
    # 8. Senior Doctor Holiday Restrictions: No long holidays for seniors
    for doctor in doctor_names:
        if seniority[doctor] == "Senior":
            for date_str in date_strings:
                if is_holiday[date_str] and holiday_type[date_str] == "Long":
                    for shift in shifts:
                        problem += (
                            x[(doctor, date_str, shift)] == 0,
                            f"NoLongHolidays_{doctor}_{date_str}_{shift}"
                        )
    
    # 9. Weekend/Holiday Targets for Juniors (soft constraint via objective)
    for doctor in doctor_names:
        if seniority[doctor] == "Junior":
            # Target is 50-55 hours, encourage through penalties
            problem += (
                weekend_holiday_hours[doctor] >= 30,  # Minimum 30 hours
                f"MinWeekendHoliday_{doctor}"
            )
    
    # Solve the problem
    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=300)  # 5-minute time limit
    problem.solve(solver)
    
    if problem.status != pulp.LpStatusOptimal:
        print(f"Warning: Solution status is {pulp.LpStatus[problem.status]}, not optimal.")
        if problem.status == pulp.LpStatusInfeasible:
            print("The problem is infeasible - no solution exists that satisfies all constraints.")
            # Try to generate a feasible schedule using a simple approach
            return generate_fallback_schedule(input_data)
    
    # Extract the solution
    schedule = {}
    for date_str in date_strings:
        schedule[date_str] = {"Day": [], "Evening": [], "Night": []}
        for doctor in doctor_names:
            for shift in shifts:
                if pulp.value(x[(doctor, date_str, shift)]) > 0.5:  # Binary variable is assigned
                    schedule[date_str][shift].append(doctor)
    
    # Print some statistics
    print(f"Objective value: {pulp.value(problem.objective)}")
    print(f"Total variables: {len(problem.variables())}")
    print(f"Total constraints: {len(problem.constraints)}")
    
    for month in months:
        print(f"Month {month}: Min hours = {pulp.value(min_monthly_hours[month]):.1f}, " +
              f"Max hours = {pulp.value(max_monthly_hours[month]):.1f}, " +
              f"Variance = {pulp.value(max_monthly_hours[month] - min_monthly_hours[month]):.1f}")
    
    for doctor in doctor_names:
        print(f"{doctor} - Weekend/Holiday hours: {pulp.value(weekend_holiday_hours[doctor]):.1f}")
    
    return schedule


def generate_fallback_schedule(input_data):
    """
    Generate a fallback schedule using a simpler heuristic when the MILP is infeasible.
    This implements a round-robin assignment that tries to respect basic constraints.
    
    Args:
        input_data: Dictionary containing doctors, holidays, and availability data
        
    Returns:
        Dictionary representing the schedule
    """
    print("Using fallback scheduling algorithm...")
    
    # Extract input data
    doctors = input_data.get('doctors', [])
    holidays = input_data.get('holidays', {})
    availability = input_data.get('availability', {})
    
    year = 2025
    days_in_year = 365
    shifts = ["Day", "Evening", "Night"]
    shift_coverage = {"Day": 2, "Evening": 1, "Night": 2}
    
    # Create date objects for all days in the year
    start_date = datetime(year, 1, 1)
    dates = [start_date + timedelta(days=d) for d in range(days_in_year)]
    date_strings = [d.strftime("%Y-%m-%d") for d in dates]
    
    # Create the empty schedule
    schedule = {}
    for date_str in date_strings:
        schedule[date_str] = {"Day": [], "Evening": [], "Night": []}
    
    # Create doctor data
    doctor_names = [doc["name"] for doc in doctors]
    seniority = {doc["name"]: doc["seniority"] for doc in doctors}
    preferences = {doc["name"]: doc["pref"] for doc in doctors}
    
    # Process availability
    doctor_availability = {}
    for doctor in doctor_names:
        doctor_availability[doctor] = {}
        for date_str in date_strings:
            if doctor in availability and date_str in availability[doctor]:
                avail_status = availability[doctor][date_str]
                doctor_availability[doctor][date_str] = {
                    "Available": ["Day", "Evening", "Night"],
                    "Not Available": [],
                    "Day Only": ["Day"],
                    "Evening Only": ["Evening"],
                    "Night Only": ["Night"]
                }.get(avail_status, ["Day", "Evening", "Night"])
            else:
                # Default: doctor is available for all shifts
                doctor_availability[doctor][date_str] = ["Day", "Evening", "Night"]
    
    # Track the last night shift for each doctor to enforce rest
    last_night_shift = {doctor: None for doctor in doctor_names}
    
    # Round-robin assignment
    doctor_index = 0
    
    # For each day and shift
    for date_str in date_strings:
        date = datetime.strptime(date_str, "%Y-%m-%d")
        is_weekend = date.weekday() >= 5
        is_holiday = date_str in holidays
        holiday_type = holidays.get(date_str, "")
        
        # Assign shifts in order: Day, Evening, Night
        for shift in shifts:
            # Number of doctors needed for this shift
            needed = shift_coverage[shift]
            assigned = []
            
            # Try to find enough doctors for this shift
            attempts = 0
            while len(assigned) < needed and attempts < len(doctor_names) * 2:
                doctor = doctor_names[doctor_index]
                doctor_index = (doctor_index + 1) % len(doctor_names)
                attempts += 1
                
                # Skip if doctor already assigned today
                if any(doctor in schedule[date_str][s] for s in shifts):
                    continue
                
                # Skip if doctor not available for this shift
                if shift not in doctor_availability[doctor][date_str]:
                    continue
                
                # Skip if doctor had night shift yesterday (enforce rest)
                if last_night_shift[doctor] and (date - last_night_shift[doctor]).days == 1 and shift in ["Day", "Evening"]:
                    continue
                
                # Skip if senior doctor and long holiday
                if seniority[doctor] == "Senior" and is_holiday and holiday_type == "Long":
                    continue
                
                # Doctor is available and can be assigned
                assigned.append(doctor)
                
                # Update night shift tracking
                if shift == "Night":
                    last_night_shift[doctor] = date
                    
            # Add assigned doctors to the schedule
            schedule[date_str][shift].extend(assigned)
    
    return schedule


def main():
    """Main function to run the script from command line"""
    if len(sys.argv) != 3:
        print("Usage: python optimize_schedule.py input_data.json output_schedule.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)
    except Exception as e:
        print(f"Error reading input file: {e}")
        sys.exit(1)
    
    # Generate the schedule
    schedule = generate_schedule(input_data)
    
    # Write the output
    try:
        with open(output_file, 'w') as f:
            json.dump(schedule, f, indent=2)
        print(f"Schedule successfully written to {output_file}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()