import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Paper,
  Grid,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ErrorOutline as ErrorIcon,
  CheckCircleOutline as CheckIcon,
  Info as InfoIcon
} from '@mui/icons-material';

import { isWeekend } from '../utils/dateUtils';

function ConstraintViolations({ doctors, schedule, holidays, selectedMonth, selectedYear, availability}) {

  const [violations, setViolations] = useState({});
  const [totalViolations, setTotalViolations] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false); // Add this state variable

  // Helper function to get dates in the selected month
  const getDatesInMonth = (month) => {
    const dates = [];
    
    Object.keys(schedule).forEach(dateStr => {

      
      const date = new Date(dateStr);
      // Only check the month (1-12), ignore the year
      if (date.getMonth() + 1 === month) {
        dates.push(dateStr);
      }
    });
    
    return dates;
  };

  // Helper to check if a doctor is senior
  const isSeniorDoctor = (doctorName) => {
    const doctor = doctors.find(doc => doc.name === doctorName);
    return doctor && doctor.seniority === "Senior";
  };

  // Helper to get doctor preference
  const getDoctorPreference = (doctorName) => {
    const doctor = doctors.find(doc => doc.name === doctorName);
    return doctor ? doctor.pref || "None" : "None";
  };

  // Function to check all violations
  const checkViolations = () => {
    setIsLoading(true);
    console.log("Checking violations for month:", selectedMonth);
    console.log("Doctors:", doctors);
    
    const monthDates = getDatesInMonth(selectedMonth);
    console.log("Dates in month:", monthDates);
    
    // Filter schedule to only include dates in the selected month
    const monthlySchedule = {};
    for (const date of monthDates) {
        if (schedule[date]) {
        monthlySchedule[date] = schedule[date];
        }
    }

    console.log("Monthly schedule:", monthlySchedule);

    // Check if there's data for this month
    if (Object.keys(monthlySchedule).length === 0) {
        setHasData(false);
        setIsLoading(false);
        return; // Exit early if no data
        }

    setHasData(true);

    // Initialize violations object
    const violationsData = {
      nightShiftFollowedByWork: {
        count: 0,
        details: []
      },
      eveningToDayShift: {
        count: 0,
        details: []
      },
      nightOffDayPattern: {
        count: 0,
        details: []
      },
      preferenceViolations: {
        count: 0,
        details: []
      },
      // New hard constraint for Day/Evening preference assigned to Night shifts
      dayEveningToNightViolations: {
        count: 0,
        details: []
      },
      seniorOnLongHoliday: {
        count: 0,
        details: []
      },
      doctor_hour_balance: {
        count: 0,
        details: []
      },
      seniorMoreHoursThanJunior: {
        count: 0,
        details: []
      },
      seniorMoreWeekendHoliday: {
        count: 0,
        details: []
      },
      // Add new availability violation category
      availabilityViolations: {
        count: 0,
        details: []
      }
    };

    // 1. Check for doctors working the next day after a night shift
    for (let i = 0; i < monthDates.length - 1; i++) {
      const currentDate = monthDates[i];
      const nextDate = monthDates[i + 1];
      
      if (!schedule[currentDate] || !schedule[currentDate].Night || !schedule[nextDate]) {
        continue;
      }
      
      for (const doctor of schedule[currentDate].Night) {
        // Check if doctor works Day or Evening shift the next day
        if (
          (schedule[nextDate].Day && schedule[nextDate].Day.includes(doctor)) ||
          (schedule[nextDate].Evening && schedule[nextDate].Evening.includes(doctor))
        ) {
          violationsData.nightShiftFollowedByWork.count++;
          violationsData.nightShiftFollowedByWork.details.push({
            doctor,
            dates: `${currentDate} (Night) → ${nextDate} (${
              schedule[nextDate].Day && schedule[nextDate].Day.includes(doctor) ? 'Day' : 'Evening'
            })`
          });
        }
      }
    }

    // 2. Check for Evening -> Day shift pattern
    for (let i = 0; i < monthDates.length - 1; i++) {
      const currentDate = monthDates[i];
      const nextDate = monthDates[i + 1];
      
      if (!schedule[currentDate] || !schedule[currentDate].Evening || !schedule[nextDate] || !schedule[nextDate].Day) {
        continue;
      }
      
      for (const doctor of schedule[currentDate].Evening) {
        if (schedule[nextDate].Day && schedule[nextDate].Day.includes(doctor)) {
          violationsData.eveningToDayShift.count++;
          violationsData.eveningToDayShift.details.push({
            doctor,
            dates: `${currentDate} (Evening) → ${nextDate} (Day)`
          });
        }
      }
    }

    // 3. Check for Night -> off -> Day pattern
    for (let i = 0; i < monthDates.length - 2; i++) {
      const firstDate = monthDates[i];
      const secondDate = monthDates[i + 1];
      const thirdDate = monthDates[i + 2];
      
      if (!schedule[firstDate] || !schedule[firstDate].Night || !schedule[thirdDate] || !schedule[thirdDate].Day) {
        continue;
      }
      
      for (const doctor of schedule[firstDate].Night) {
        // Check if doctor has a day off and then works a day shift
        const worksSecondDay = schedule[secondDate] && 
          Object.values(schedule[secondDate]).some(shift => shift.includes(doctor));
        
        if (!worksSecondDay && schedule[thirdDate].Day.includes(doctor)) {
          violationsData.nightOffDayPattern.count++;
          violationsData.nightOffDayPattern.details.push({
            doctor,
            dates: `${firstDate} (Night) → ${secondDate} (Off) → ${thirdDate} (Day)`
          });
        }
      }
    }

    // 4. Check for doctors with preferences working other shifts
    for (const date of monthDates) {
      if (!schedule[date]) continue;
      
      for (const shift of ['Day', 'Evening', 'Night']) {
        if (!schedule[date][shift]) continue;
        
        for (const doctor of schedule[date][shift]) {
          const preference = getDoctorPreference(doctor);
          
          // Skip if no preference
          if (preference === "None") continue;
          
          // Check if doctor's preference doesn't match the shift
          if (preference !== `${shift} Only`) {
            // Special case: Day/Evening preference assigned to Night shift (hard constraint)
            if (shift === "Night" && (preference === "Day Only" || preference === "Evening Only")) {
              violationsData.dayEveningToNightViolations.count++;
              violationsData.dayEveningToNightViolations.details.push({
                doctor,
                date,
                shift,
                preference
              });
            } 
            // Regular preference violation (soft constraint)
            else {
              violationsData.preferenceViolations.count++;
              violationsData.preferenceViolations.details.push({
                doctor,
                date,
                shift,
                preference
              });
            }
          }
        }
      }
    }

    // 5. Check for seniors working on long holidays
    for (const date of monthDates) {
      if (holidays[date] && holidays[date] === "Long") {
        if (!schedule[date]) continue;
        
        for (const shift of ['Day', 'Evening', 'Night']) {
          if (!schedule[date][shift]) continue;
          
          for (const doctor of schedule[date][shift]) {
            if (isSeniorDoctor(doctor)) {
              violationsData.seniorOnLongHoliday.count++;
              violationsData.seniorOnLongHoliday.details.push({
                doctor,
                date,
                shift,
                holidayType: "Long"
              });
            }
          }
        }
      }
    }

    // 6. Calculate monthly hours for each doctor
    const doctorHours = {};
    const juniorHours = [];
    const seniorHours = [];
    
    // Initialize hours for all doctors
    for (const doctor of doctors) {
      doctorHours[doctor.name] = 0;
    }
    
    // Count hours from the schedule
    for (const date of monthDates) {
      if (!schedule[date]) continue;
      
      for (const shift of ['Day', 'Evening', 'Night']) {
        if (!schedule[date][shift]) continue;
        
        // Each shift is 8 hours
        const hoursPerShift = 8;
        
        for (const doctor of schedule[date][shift]) {
          doctorHours[doctor] = (doctorHours[doctor] || 0) + hoursPerShift;
        }
      }
    }
    
    // Save doctor hours for debugging
    console.log("Doctor hours calculated in ConstraintViolations:", doctorHours);
    
    // Separate junior and senior hours
    for (const doctor of doctors) {
      if (doctorHours[doctor.name] > 0) {
        if (doctor.seniority === "Senior") {
          seniorHours.push({ name: doctor.name, hours: doctorHours[doctor.name] });
        } else {
          juniorHours.push({ name: doctor.name, hours: doctorHours[doctor.name] });
        }
      }
    }
    
    // 6a. Check doctor hour balance - more than 1 shift (8h) difference
    if (Object.keys(doctorHours).length > 0) {
      console.log("Calculating doctor hour balance with hours:", doctorHours);
      
      // Count working days for each doctor in this month
      const doctorWorkingDays = {};
      for (const date of monthDates) {
        if (!schedule[date]) continue;
        
        for (const shift of ['Day', 'Evening', 'Night']) {
          if (!schedule[date][shift]) continue;
          
          for (const doctor of schedule[date][shift]) {
            doctorWorkingDays[doctor] = (doctorWorkingDays[doctor] || 0) + 1;
          }
        }
      }
      
      // Identify doctors with limited availability (≤ 4 days in the month)
      const limitedAvailabilityDoctors = new Set();
      for (const [doctor, days] of Object.entries(doctorWorkingDays)) {
        if (days <= 4) {
          limitedAvailabilityDoctors.add(doctor);
        }
      }
      
      if (limitedAvailabilityDoctors.size > 0) {
        console.log(`Excluding ${limitedAvailabilityDoctors.size} doctors with limited availability (≤ 4 days):`, 
          Array.from(limitedAvailabilityDoctors).join(', '));
      }
      
      // Only consider doctors who actually have hours in this month
      // AND exclude doctors with limited availability
      const activeDoctorHours = {};
      for (const [doctor, hours] of Object.entries(doctorHours)) {
        if (hours > 0 && !limitedAvailabilityDoctors.has(doctor)) {
          activeDoctorHours[doctor] = hours;
        }
      }
      
      console.log("Active doctor hours (excluding limited availability):", activeDoctorHours);
      
      // Only proceed if we have multiple active doctors
      if (Object.keys(activeDoctorHours).length > 1) {
        const activeHours = Object.values(activeDoctorHours);
        const maxHours = Math.max(...activeHours);
        const minHours = Math.min(...activeHours);
        const variance = maxHours - minHours;
        
        console.log(`Max hours: ${maxHours}, Min hours: ${minHours}, Variance: ${variance}`);
        
        // Per the requirements, variance should be no more than 8 hours (1 shift)
        if (variance > 8) {
          violationsData.doctor_hour_balance.count = 1;
          
          // Find doctors with max and min hours
          const doctorsWithMax = Object.entries(activeDoctorHours)
            .filter(([_, hours]) => hours === maxHours)
            .map(([name]) => name);
            
          const doctorsWithMin = Object.entries(activeDoctorHours)
            .filter(([_, hours]) => hours === minHours)
            .map(([name]) => name);
          
          console.log("Doctors with max hours:", doctorsWithMax);
          console.log("Doctors with min hours:", doctorsWithMin);
            
          violationsData.doctor_hour_balance.details.push({
            variance,
            maxHours,
            minHours,
            doctorsWithMax,
            doctorsWithMin,
            message: `Doctor hour balance variance of ${variance}h exceeds the 8h maximum (1 shift)`,
            excludedDoctors: Array.from(limitedAvailabilityDoctors)
          });
        }
      }
    }
    
    // 7. Check if seniors are working more hours than juniors
    if (juniorHours.length > 0 && seniorHours.length > 0) {
      const avgJuniorHours = juniorHours.reduce((sum, doc) => sum + doc.hours, 0) / juniorHours.length;
      const avgSeniorHours = seniorHours.reduce((sum, doc) => sum + doc.hours, 0) / seniorHours.length;
      
      if (avgSeniorHours > avgJuniorHours) {
        violationsData.seniorMoreHoursThanJunior.count = 1;
        violationsData.seniorMoreHoursThanJunior.details.push({
          avgJuniorHours,
          avgSeniorHours,
          difference: avgSeniorHours - avgJuniorHours
        });
      }
    }

    // 8. Calculate weekend/holiday hours for each doctor
    const weekendHolidayHours = {};
    const juniorWHHours = [];
    const seniorWHHours = [];
    
    for (const doctor of doctors) {
      weekendHolidayHours[doctor.name] = 0;
    }
    
    for (const date of monthDates) {
      // Skip if not a weekend or holiday
      if (!isWeekend(date) && !holidays[date]) continue;
      
      if (!schedule[date]) continue;
      
      for (const shift of ['Day', 'Evening', 'Night']) {
        if (!schedule[date][shift]) continue;
        
        // Each shift is 8 hours
        const hoursPerShift = 8;
        
        for (const doctor of schedule[date][shift]) {
          weekendHolidayHours[doctor] = (weekendHolidayHours[doctor] || 0) + hoursPerShift;
        }
      }
    }
    
    // Separate junior and senior weekend/holiday hours
    for (const doctor of doctors) {
      if (weekendHolidayHours[doctor.name] > 0) {
        if (doctor.seniority === "Senior") {
          seniorWHHours.push({ name: doctor.name, hours: weekendHolidayHours[doctor.name] });
        } else {
          juniorWHHours.push({ name: doctor.name, hours: weekendHolidayHours[doctor.name] });
        }
      }
    }
    
    // Check if seniors have more weekend/holiday hours than juniors
    if (juniorWHHours.length > 0 && seniorWHHours.length > 0) {
      const avgJuniorWHHours = juniorWHHours.reduce((sum, doc) => sum + doc.hours, 0) / juniorWHHours.length;
      const avgSeniorWHHours = seniorWHHours.reduce((sum, doc) => sum + doc.hours, 0) / seniorWHHours.length;
      
      if (avgSeniorWHHours > avgJuniorWHHours) {
        violationsData.seniorMoreWeekendHoliday.count = 1;
        violationsData.seniorMoreWeekendHoliday.details.push({
          avgJuniorWHHours,
          avgSeniorWHHours,
          difference: avgSeniorWHHours - avgJuniorWHHours
        });
      }
    }

    // New check for availability violations
    if (availability) {
      for (const date of monthDates) {
        if (!schedule[date]) continue;
        
        for (const shift of ['Day', 'Evening', 'Night']) {
          if (!schedule[date][shift]) continue;
          
          for (const doctor of schedule[date][shift]) {
            // Skip if no availability data for this doctor
            if (!availability[doctor]) continue;
            
            // Check if doctor is available for this date
            const doctorAvailability = availability[doctor][date];
            
            if (doctorAvailability) {
              // Check specific availability constraints
              if (doctorAvailability === 'Not Available') {
                // Doctor is completely unavailable for this date
                violationsData.availabilityViolations.count++;
                violationsData.availabilityViolations.details.push({
                  doctor,
                  date,
                  shift,
                  status: doctorAvailability
                });
              } else if (doctorAvailability.startsWith('Not Available: ')) {
                // Check for partial unavailability
                const unavailableShifts = doctorAvailability.substring('Not Available: '.length).split(', ');
                if (unavailableShifts.includes(shift)) {
                  violationsData.availabilityViolations.count++;
                  violationsData.availabilityViolations.details.push({
                    doctor,
                    date,
                    shift,
                    status: doctorAvailability
                  });
                }
              } else if (doctorAvailability === 'Day Only' && shift !== 'Day') {
                violationsData.availabilityViolations.count++;
                violationsData.availabilityViolations.details.push({
                  doctor,
                  date,
                  shift,
                  status: doctorAvailability
                });
              } else if (doctorAvailability === 'Evening Only' && shift !== 'Evening') {
                violationsData.availabilityViolations.count++;
                violationsData.availabilityViolations.details.push({
                  doctor,
                  date,
                  shift,
                  status: doctorAvailability
                });
              } else if (doctorAvailability === 'Night Only' && shift !== 'Night') {
                violationsData.availabilityViolations.count++;
                violationsData.availabilityViolations.details.push({
                  doctor,
                  date,
                  shift,
                  status: doctorAvailability
                });
              }
            }
          }
        }
      }
    }

    // Calculate total violations
    const total = Object.values(violationsData).reduce((sum, { count }) => sum + count, 0);
    
    setViolations(violationsData);
    setTotalViolations(total);
    setIsLoading(false);
  };

  useEffect(() => {
    if (doctors && schedule && holidays && selectedMonth) {
      checkViolations();
    }
  }, [doctors, schedule, holidays, selectedMonth, availability]);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">Loading constraint violations...</Typography>
      </Box>
    );
  }

  if (!hasData) {
    return (
      <Box sx={{ 
        minHeight: '400px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%' 
      }}>
        <Paper 
          elevation={0}
          sx={{ 
            width: '100%', 
            maxWidth: 600, 
            mx: 'auto', 
            border: '1px solid #ccc',
            p: 2,
            bgcolor: 'rgb(229, 246, 253)' // Info alert background color
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <InfoIcon color="info" sx={{ mb: 1 }} />
            <Typography variant="body1" color="info.main" sx={{ textAlign: 'center' }}>
              No data available for {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear}.
            </Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Constraint Violations for {new Date({selectedYear}, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear}
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        {totalViolations === 0 ? (
          <Alert severity="success">
            <AlertTitle>No Violations Found</AlertTitle>
            All scheduling constraints are satisfied for the selected month.
          </Alert>
        ) : (
          <Alert severity="warning">
            <AlertTitle>Violations Found</AlertTitle>
            {totalViolations} constraint violation(s) detected in the schedule.
            <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
              <Chip 
                size="small" 
                color="error" 
                label="Hard Constraints" 
                sx={{ fontWeight: 'bold' }}
              />
              <Chip 
                size="small" 
                color="warning" 
                label="Soft Constraints" 
                sx={{ fontWeight: 'bold' }}
              />
            </Box>
          </Alert>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Summary cards */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Rest Violations</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.nightShiftFollowedByWork.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Night → Work: ${violations.nightShiftFollowedByWork.count}`}
                      color={violations.nightShiftFollowedByWork.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.eveningToDayShift.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Evening → Day: ${violations.eveningToDayShift.count}`}
                      color={violations.eveningToDayShift.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.nightOffDayPattern.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Night → Off → Day: ${violations.nightOffDayPattern.count}`}
                      color={violations.nightOffDayPattern.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.availabilityViolations.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Availability: ${violations.availabilityViolations.count}`}
                      color={violations.availabilityViolations.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Preference & Seniority Violations</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.preferenceViolations.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Regular Pref: ${violations.preferenceViolations.count}`}
                      color={violations.preferenceViolations.count > 0 ? "warning" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.dayEveningToNightViolations.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Day/Eve → Night: ${violations.dayEveningToNightViolations.count}`}
                      color={violations.dayEveningToNightViolations.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.seniorOnLongHoliday.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Senior on Holiday: ${violations.seniorOnLongHoliday.count}`}
                      color={violations.seniorOnLongHoliday.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Workload Balance Violations</Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.doctor_hour_balance.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Doctor Hour Balance > 8h: ${violations.doctor_hour_balance.count}`}
                      color={violations.doctor_hour_balance.count > 0 ? "warning" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.seniorMoreHoursThanJunior.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Senior > Junior Hours: ${violations.seniorMoreHoursThanJunior.count}`}
                      color={violations.seniorMoreHoursThanJunior.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Chip 
                      icon={violations.seniorMoreWeekendHoliday.count > 0 ? <ErrorIcon /> : <CheckIcon />}
                      label={`Senior > Junior WE/Hol: ${violations.seniorMoreWeekendHoliday.count}`}
                      color={violations.seniorMoreWeekendHoliday.count > 0 ? "error" : "success"}
                      sx={{ width: '100%', justifyContent: 'flex-start' }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Detailed violations */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>Detailed Violations</Typography>
        
        {/* New accordion for availability violations */}
        <Accordion 
          disabled={violations.availabilityViolations.count === 0}
          sx={{
            borderLeft: violations.availabilityViolations.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Doctor Availability Violations ({violations.availabilityViolations.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Doctors are scheduled for shifts when they are not available.
            </Typography>
            {violations.availabilityViolations.details.length > 0 ? (
              <List>
                {violations.availabilityViolations.details.map((violation, index) => (
                  <ListItem key={`availability-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={`Date: ${violation.date}, Assigned: ${violation.shift} Shift, Availability: ${violation.status}`} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.nightShiftFollowedByWork.count === 0}
          sx={{
            borderLeft: violations.nightShiftFollowedByWork.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Night Shift Followed By Work ({violations.nightShiftFollowedByWork.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Doctors must have adequate rest after night shifts.
            </Typography>
            {violations.nightShiftFollowedByWork.details.length > 0 ? (
              <List>
                {violations.nightShiftFollowedByWork.details.map((violation, index) => (
                  <ListItem key={`night-work-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={violation.dates} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.eveningToDayShift.count === 0}
          sx={{
            borderLeft: violations.eveningToDayShift.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Evening to Day Shift ({violations.eveningToDayShift.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Evening shifts should not be followed by day shifts.
            </Typography>
            {violations.eveningToDayShift.details.length > 0 ? (
              <List>
                {violations.eveningToDayShift.details.map((violation, index) => (
                  <ListItem key={`evening-day-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={violation.dates} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.nightOffDayPattern.count === 0}
          sx={{
            borderLeft: violations.nightOffDayPattern.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Night → Off → Day Pattern ({violations.nightOffDayPattern.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Doctors working night shifts need adequate recovery time before day shifts.
            </Typography>
            {violations.nightOffDayPattern.details.length > 0 ? (
              <List>
                {violations.nightOffDayPattern.details.map((violation, index) => (
                  <ListItem key={`night-off-day-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={violation.dates} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        {/* New hard constraint section for Day/Evening preference assigned to Night */}
        <Accordion 
          disabled={violations.dayEveningToNightViolations.count === 0}
          sx={{
            borderLeft: violations.dayEveningToNightViolations.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Day/Evening Preference Assigned to Night ({violations.dayEveningToNightViolations.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Doctors with Day Only or Evening Only preference should never be assigned to Night shifts.
            </Typography>
            {violations.dayEveningToNightViolations.details.length > 0 ? (
              <List>
                {violations.dayEveningToNightViolations.details.map((violation, index) => (
                  <ListItem key={`dayeve-night-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={`Date: ${violation.date}, Assigned: Night Shift, Preference: ${violation.preference}`} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.preferenceViolations.count === 0}
          sx={{
            borderLeft: violations.preferenceViolations.count > 0 ? '4px solid' : 'none',
            borderColor: 'warning.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Other Preference Violations ({violations.preferenceViolations.count})</Typography>
              <Chip size="small" color="warning" label="Soft Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
              These preference violations (excluding Day/Evening → Night) are considered soft constraints and do not severely impact schedule quality.
            </Typography>
            {violations.preferenceViolations.details.length > 0 ? (
              <List>
                {violations.preferenceViolations.details.map((violation, index) => (
                  <ListItem key={`pref-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (${isSeniorDoctor(violation.doctor) ? 'Senior' : 'Junior'})`}
                      secondary={`Date: ${violation.date}, Assigned: ${violation.shift} Shift, Preference: ${violation.preference}`} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.seniorOnLongHoliday.count === 0}
          sx={{
            borderLeft: violations.seniorOnLongHoliday.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Senior on Long Holiday ({violations.seniorOnLongHoliday.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Senior doctors should not work on long holidays.
            </Typography>
            {violations.seniorOnLongHoliday.details.length > 0 ? (
              <List>
                {violations.seniorOnLongHoliday.details.map((violation, index) => (
                  <ListItem key={`senior-holiday-${index}`} divider>
                    <ListItemText 
                      primary={`${violation.doctor} (Senior)`}
                      secondary={`Date: ${violation.date}, Shift: ${violation.shift}, Holiday Type: ${violation.holidayType}`} 
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.doctor_hour_balance.count === 0}
          sx={{
            borderLeft: violations.doctor_hour_balance.count > 0 ? '4px solid' : 'none',
            borderColor: 'warning.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Doctor Hour Balance + 8h ({violations.doctor_hour_balance.count})</Typography>
              <Chip size="small" color="warning" label="Soft Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'warning.main' }}>
              Soft violation: Doctor hour balance should not exceed 8 hours (1 shift) difference between doctors.
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
              Note: Doctors with very limited availability (≤ 4 days per month) are automatically excluded from this constraint. The scheduler then uses an improved balancing approach for the remaining doctors to distribute workload more evenly.
            </Typography>
            {violations.doctor_hour_balance.details.length > 0 ? (
              <Box>
                {violations.doctor_hour_balance.details.map((violation, index) => (
                  <Box key={`variance-${index}`}>
                    <Typography variant="subtitle1" color="warning">Variance: {violation.variance}h</Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      <strong>Note</strong>: The dashboard shows variance in shifts (1 shift = 8h). 
                      The constraint requires doctor hour balance to be ≤ 8h (1 shift) difference.
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2">Max Hours: {violation.maxHours}h ({violation.maxHours/8} shifts) by {violation.doctorsWithMax.join(', ')}</Typography>
                    <Typography variant="body2">Min Hours: {violation.minHours}h ({violation.minHours/8} shifts) by {violation.doctorsWithMin.join(', ')}</Typography>
                    
                    {violation.excludedDoctors && violation.excludedDoctors.length > 0 && (
                      <>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2">
                          <strong>Excluded from variance calculation</strong>: {violation.excludedDoctors.length} doctors with limited availability (≤ 4 days):
                        </Typography>
                        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                          {violation.excludedDoctors.join(', ')}
                        </Typography>
                      </>
                    )}
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.seniorMoreHoursThanJunior.count === 0}
          sx={{
            borderLeft: violations.seniorMoreHoursThanJunior.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Senior Working More Hours Than Junior ({violations.seniorMoreHoursThanJunior.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Senior doctors should work fewer hours than junior doctors.
            </Typography>
            {violations.seniorMoreHoursThanJunior.details.length > 0 ? (
              <Box>
                {violations.seniorMoreHoursThanJunior.details.map((violation, index) => (
                  <Box key={`senior-hours-${index}`}>
                    <Typography variant="subtitle1">Senior-Junior Difference: {violation.difference.toFixed(1)}h</Typography>
                    <Typography variant="body2">Senior Average: {violation.avgSeniorHours.toFixed(1)}h</Typography>
                    <Typography variant="body2">Junior Average: {violation.avgJuniorHours.toFixed(1)}h</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
        
        <Accordion 
          disabled={violations.seniorMoreWeekendHoliday.count === 0}
          sx={{
            borderLeft: violations.seniorMoreWeekendHoliday.count > 0 ? '4px solid' : 'none',
            borderColor: 'error.main',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>Senior More Weekend/Holiday Than Junior ({violations.seniorMoreWeekendHoliday.count})</Typography>
              <Chip size="small" color="error" label="Hard Constraint" sx={{ ml: 2 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'error.main' }}>
              Critical violation: Senior doctors should work fewer weekend/holiday hours than junior doctors.
            </Typography>
            {violations.seniorMoreWeekendHoliday.details.length > 0 ? (
              <Box>
                {violations.seniorMoreWeekendHoliday.details.map((violation, index) => (
                  <Box key={`senior-wh-${index}`}>
                    <Typography variant="subtitle1">Senior-Junior Difference: {violation.difference.toFixed(1)}h</Typography>
                    <Typography variant="body2">Senior Weekend/Holiday Average: {violation.avgSeniorWHHours.toFixed(1)}h</Typography>
                    <Typography variant="body2">Junior Weekend/Holiday Average: {violation.avgJuniorWHHours.toFixed(1)}h</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography>No violations of this type.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}

export default ConstraintViolations;