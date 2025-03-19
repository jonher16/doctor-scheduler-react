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
                 max_iterations: int = 20,
                 parallel_jobs: int = 1,
                 time_limit_minutes: int = 10):
        """
        Initialize the weight optimizer.
        
        Args:
            doctors: List of doctor dictionaries
            holidays: Dictionary mapping dates to holiday types
            availability: Doctor availability constraints
            month: Specific month to optimize (None for full year)
            max_iterations: Maximum number of weight configurations to try
            parallel_jobs: Number of parallel optimization jobs to run
            time_limit_minutes: Time limit in minutes for the optimization
        """
        self.doctors = doctors
        self.holidays = holidays
        self.availability = availability
        self.month = month
        self.max_iterations = max_iterations
        self.parallel_jobs = max(1, min(parallel_jobs, 4))  # Between 1 and 4 jobs
        self.time_limit_seconds = time_limit_minutes * 60
        
        # Track the best configuration found
        self.best_weights = None
        self.best_schedule = None
        self.best_stats = None
        self.best_score = float('inf')
        
        # Define weight parameter ranges
        # Format: (min, max, step)
        self.weight_ranges = {
            "w_balance": (100, 1000, 10000),           # Monthly balance weight
            "w_wh": (10, 40, 100),                # Weekend/holiday weight
            "w_senior_workload": (100, 1000, 10000),   # Senior workload difference
            "w_pref_junior": (50, 300, 10000),        # Junior preference weight
            "w_pref_senior": (100, 500, 20000),       # Senior preference weight
            "w_preference_fairness": (10, 100, 1000), # Preference fairness weight
            "w_senior_holiday": (100,1000,999999)    # Senior working on long holidays
        }
        
        # Fixed weights (not optimized - hard constraints)
        self.fixed_weights = {
            "w_avail": 999999,           # Availability violations
            "w_one_shift": 999999,          # Multiple shifts per day
            "w_rest": 999999,               # Inadequate rest after night shift
            "w_duplicate_penalty": 999999, # Duplicate doctor penalty
            "w_night_day_gap": 999999,
            "w_night_gap": 100000, 
            "w_wrong_pref_night": 999999, # evening/day pref assigned to night
            "w_consec_night": 9999999, #consecutive night shifts
            "w_evening_day": 100000

        }

        
        # Track doctors with same preferences for fairness calculations
        self.evening_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Evening Only"]
        self.day_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Day Only"]
        self.night_preference_doctors = [d["name"] for d in doctors if d.get("pref", "None") == "Night Only"]
        
        # For monthly optimization, we can also track consecutive shifts more closely
        self.max_consecutive_shifts = 5  # Maximum number of consecutive days a doctor should work
        self.w_consecutive_shifts = 50   # Penalty for exceeding consecutive shift limit

        
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

    def _evaluate_weights(self, weights: Dict[str, Any], iteration: int) -> Tuple[Dict[str, Any], Dict, Dict, float]:
        """
        Evaluate a specific set of weights by running the optimizer and measuring constraint satisfaction.
        
        Args:
            weights: Dictionary of weight parameters
            iteration: Current iteration number for progress tracking
            
        Returns:
            Tuple of (weights, schedule, statistics, score)
        """
        start_time = time.time()
        
        # Create custom progress callback
        def progress_callback(progress: int, message: str):
            if progress % 20 == 0:  # Only log occasionally to reduce verbosity
                logger.info(f"Iteration {iteration}, Progress: {progress}%, {message}")
        
        # Run either monthly or yearly optimizer based on whether month is specified
        if self.month is not None:
            # Create instance with default settings first
            optimizer = MonthlyScheduleOptimizer(
                self.doctors,
                self.holidays,
                self.availability,
                self.month
            )
            
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
            
            # Override weights
            for key, value in weights.items():
                if hasattr(optimizer, key):
                    setattr(optimizer, key, value)
            
            schedule, stats = optimizer.optimize(progress_callback=progress_callback)
        
        # Calculate a score for this configuration 
        score = self._calculate_score(schedule, stats)
        
        elapsed = time.time() - start_time
        logger.info(f"Iteration {iteration} completed in {elapsed:.2f}s with score {score:.2f}")
        
        return weights, schedule, stats, score

    def _calculate_score(self, schedule: Dict, stats: Dict) -> float:
        """
        Calculate a composite score to evaluate how well the constraints are satisfied.
        Lower score is better (fewer violations).
        
        Args:
            schedule: The generated schedule
            stats: Schedule statistics
            
        Returns:
            score: A composite score where lower is better
        """
        score = 0.0
        
        # Penalize hard constraint violations severely
        score += stats.get("availability_violations", 0) * 1000
        score += stats.get("duplicate_doctors", 0) * 1000
        score += stats.get("coverage_errors", 0) * 100
        
        # Monthly balance penalties
        monthly_stats = stats.get("monthly_stats", {})
        for month, month_stats in monthly_stats.items():
            # Specific month filter for monthly optimization
            if self.month is not None and int(month) != self.month:
                continue
                
            # Penalize if max - min > 10 hours (monthly balance constraint)
            variance = month_stats.get("max", 0) - month_stats.get("min", 0)
            if variance > 10:
                score += (variance - 10) ** 2
        
        # Senior vs junior workload analysis
        monthly_hours = stats.get("monthly_hours", {})
        senior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") == "Senior"]
        junior_doctors = [doc["name"] for doc in self.doctors if doc.get("seniority", "Junior") != "Senior"]
        
        # For each month, check if seniors work less than juniors (by ~8 hours)
        for month in range(1, 13):
            if self.month is not None and month != self.month:
                continue
                
            senior_hours = [monthly_hours.get(doc, {}).get(month, 0) for doc in senior_doctors]
            junior_hours = [monthly_hours.get(doc, {}).get(month, 0) for doc in junior_doctors]
            
            # Skip if no data
            if not senior_hours or not junior_hours:
                continue
                
            avg_senior = sum(senior_hours) / len(senior_hours)
            avg_junior = sum(junior_hours) / len(junior_hours)
            
            # Seniors should work ~8 hours less than juniors
            if avg_senior > avg_junior:
                score += (avg_senior - avg_junior) ** 2
            elif avg_senior > (avg_junior - 8):
                score += (avg_senior - (avg_junior - 8)) ** 2
        
        # Check preference satisfaction
        preference_metrics = stats.get("preference_metrics", {})
        for doctor, metrics in preference_metrics.items():
            if metrics.get("preference") != "None":
                # Calculate percentage of preferred shifts
                preferred = metrics.get("preferred_shifts", 0)
                other = metrics.get("other_shifts", 0)
                total = preferred + other
                
                if total > 0:
                    percentage = preferred / total
                    # Penalize based on how far from 100% preference satisfaction
                    score += (1 - percentage) * 50
        
        # Check weekend/holiday balance
        weekend_metrics = stats.get("weekend_metrics", {})
        holiday_metrics = stats.get("holiday_metrics", {})
        
        # Calculate weekend/holiday hours
        wh_hours_senior = {}
        wh_hours_junior = {}
        
        for doctor in senior_doctors:
            wh_hours_senior[doctor] = weekend_metrics.get(doctor, 0) * 8 + holiday_metrics.get(doctor, 0) * 8
            
        for doctor in junior_doctors:
            wh_hours_junior[doctor] = weekend_metrics.get(doctor, 0) * 8 + holiday_metrics.get(doctor, 0) * 8
            
        # Calculate averages
        avg_wh_senior = sum(wh_hours_senior.values()) / max(len(wh_hours_senior), 1)
        avg_wh_junior = sum(wh_hours_junior.values()) / max(len(wh_hours_junior), 1)
        
        # Seniors should work ~20h less than juniors on weekends/holidays
        if avg_wh_senior > avg_wh_junior:
            score += (avg_wh_senior - avg_wh_junior) ** 2
        elif avg_wh_senior > (avg_wh_junior - 20):
            score += (avg_wh_senior - (avg_wh_junior - 20)) ** 2
        
        # Calculate variance within each group (fairness)
        if wh_hours_junior:
            junior_values = list(wh_hours_junior.values())
            junior_variance = max(junior_values) - min(junior_values)
            score += junior_variance
            
        if wh_hours_senior:
            senior_values = list(wh_hours_senior.values())
            senior_variance = max(senior_values) - min(senior_values)
            score += senior_variance
        
        return score

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
        logger.info(f"Best score: {self.best_score:.2f} with weights: {self.best_weights}")
        
        if progress_callback:
            progress_callback(100, "Weight optimization complete")
            
        # Sort results by score for better analysis
        sorted_results = sorted(self.results, key=lambda x: x.get("score", float('inf')))
        
        result = {
            "schedule": self.best_schedule,
            "statistics": self.best_stats,
            "weights": self.best_weights,
            "score": self.best_score,
            "all_results": sorted_results[:10],  # Return top 10 results
            "iterations_completed": len(self.results),
            "solution_time_seconds": solution_time
        }
        
        return result
    
    def _optimize_sequential(self, progress_callback: Callable = None):
        """Run optimization sequentially with time and iteration limits."""
        start_time = time.time()
        iteration = 0
        
        while (iteration < self.max_iterations and 
               time.time() - start_time < self.time_limit_seconds):
            
            iteration += 1
            
            # Generate random weights
            weights = self._get_random_weights()
                
            # Evaluate this weight configuration
            current_weights, schedule, stats, score = self._evaluate_weights(weights, iteration)
            
            # Store results
            self.results.append({
                "weights": copy.deepcopy(current_weights),
                "score": score,
                "stats": {
                    "availability_violations": stats.get("availability_violations", 0),
                    "duplicate_doctors": stats.get("duplicate_doctors", 0),
                    "coverage_errors": stats.get("coverage_errors", 0),
                    "objective_value": stats.get("objective_value", 0)
                }
            })
            
            # Update best if improved
            if score < self.best_score:
                logger.info(f"New best score: {score:.2f} (was {self.best_score:.2f})")
                self.best_score = score
                self.best_weights = copy.deepcopy(current_weights)
                self.best_schedule = copy.deepcopy(schedule)
                self.best_stats = copy.deepcopy(stats)
                
            # Report progress
            if progress_callback:
                elapsed_time = time.time() - start_time
                time_percent = min(100, int(100 * elapsed_time / self.time_limit_seconds))
                iter_percent = int(100 * iteration / self.max_iterations)
                progress = max(time_percent, iter_percent)
                
                progress_callback(
                    progress,
                    f"Iteration {iteration}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                )
    
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
                        current_weights, schedule, stats, score = future.result()
                        completed += 1
                        
                        # Store results
                        self.results.append({
                            "weights": copy.deepcopy(current_weights),
                            "score": score,
                            "stats": {
                                "availability_violations": stats.get("availability_violations", 0),
                                "duplicate_doctors": stats.get("duplicate_doctors", 0),
                                "coverage_errors": stats.get("coverage_errors", 0),
                                "objective_value": stats.get("objective_value", 0)
                            }
                        })
                        
                        # Update best if improved
                        if score < self.best_score:
                            logger.info(f"New best score: {score:.2f} (was {self.best_score:.2f})")
                            self.best_score = score
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
                    
                    progress_callback(
                        progress,
                        f"Completed {completed}/{self.max_iterations}, Best score: {self.best_score:.2f}"
                    )
            
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
        
        # Meta-optimization parameters
        max_iterations = data.get("max_iterations", 20)
        parallel_jobs = data.get("parallel_jobs", 1)
        time_limit_minutes = data.get("time_limit_minutes", 10)
        
        # Create and run the weight optimizer
        optimizer = WeightOptimizer(
            doctors=doctors,
            holidays=holidays,
            availability=availability,
            month=month,
            max_iterations=max_iterations,
            parallel_jobs=parallel_jobs,
            time_limit_minutes=time_limit_minutes
        )
        
        result = optimizer.optimize(progress_callback=progress_callback)
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
        "month": 1  # Just optimize January
    }

    result = optimize_weights(sample_data)
    
    print(f"Best weights found:")
    for key, value in result["weights"].items():
        print(f"  {key}: {value}")
    print(f"Best score: {result['score']:.2f}")
    print(f"Solution time: {result['solution_time_seconds']:.2f} seconds")