import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  IconButton,
  Button,
  Tooltip,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Event as EventIcon,
  Info as InfoIcon
} from '@mui/icons-material';

import { monthNames, dayNames } from '../utils/dateUtils';

function DoctorAvailabilityCalendar({ doctors, availability }) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(2025); // Fixed to 2025 for the application
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [calendarDays, setCalendarDays] = useState([]);

  // Colors for different availability types
  const availabilityColors = {
    'Available': '#4caf50',
    'Not Available': '#f44336',
    'Day Only': '#2196f3',
    'Evening Only': '#9c27b0',
    'Night Only': '#ff9800'
  };

  // Generate days for the current month view
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, currentYear, selectedDoctor, availability]);

  const generateCalendarDays = () => {
    const year = currentYear;
    const month = currentMonth;
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ 
        day: '', 
        month, 
        year, 
        empty: true,
        date: null,
        doctorAvailability: {}
      });
    }
    
    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      // Get availability for this date for all or selected doctor
      const doctorAvailability = {};
      
      if (selectedDoctor === 'all') {
        // Get availability for all doctors
        doctors.forEach(doc => {
          const doctorName = doc.name;
          if (availability[doctorName] && availability[doctorName][date]) {
            doctorAvailability[doctorName] = availability[doctorName][date];
          } else {
            doctorAvailability[doctorName] = 'Available'; // Default if not specified
          }
        });
      } else {
        // Get availability for selected doctor
        if (availability[selectedDoctor] && availability[selectedDoctor][date]) {
          doctorAvailability[selectedDoctor] = availability[selectedDoctor][date];
        } else {
          doctorAvailability[selectedDoctor] = 'Available'; // Default if not specified
        }
      }
      
      days.push({ 
        day: i, 
        month, 
        year, 
        empty: false,
        date,
        doctorAvailability
      });
    }
    
    setCalendarDays(days);
  };

  // Navigate to previous month
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  // Navigate to next month
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Handle doctor selector change
  const handleDoctorChange = (event) => {
    setSelectedDoctor(event.target.value);
  };
  
  // Get availability summary for a day, including doctor names
  const getAvailabilitySummary = (doctorAvailability) => {
    const summary = {
      'Available': { count: 0, doctors: [] },
      'Not Available': { count: 0, doctors: [] },
      'Day Only': { count: 0, doctors: [] },
      'Evening Only': { count: 0, doctors: [] },
      'Night Only': { count: 0, doctors: [] }
    };
    
    Object.entries(doctorAvailability).forEach(([doctor, avail]) => {
      if (summary[avail] !== undefined) {
        summary[avail].count++;
        summary[avail].doctors.push(doctor);
      }
    });
    
    return summary;
  };

  // Render availability indicators for a day
  const renderAvailabilityIndicators = (doctorAvailability) => {
    // If a specific doctor is selected, show their availability
    if (selectedDoctor !== 'all') {
      const availability = doctorAvailability[selectedDoctor] || 'Available';
      return (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
          <Chip 
            size="small" 
            label={availability} 
            sx={{ 
              bgcolor: availabilityColors[availability],
              color: 'white',
              fontSize: '0.7rem',
              height: '20px'
            }}
          />
        </Box>
      );
    }
    
    // For "all" view, show a summary of doctors' availability
    const summary = getAvailabilitySummary(doctorAvailability);
    
    return (
      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        {Object.entries(summary).map(([avail, { count, doctors }]) => {
          if (count > 0) {
            // Format doctor names for tooltip
            const doctorNames = doctors.join(', ');
            return (
              <Tooltip 
                key={avail} 
                title={
                  <React.Fragment>
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{avail} ({count}):</Typography>
                    <Typography variant="caption" component="div" sx={{ maxWidth: 220, wordWrap: 'break-word' }}>
                      {doctorNames}
                    </Typography>
                  </React.Fragment>
                }
                placement="top"
                arrow
              >
                <Box sx={{ 
                  width: '100%', 
                  height: '4px', 
                  bgcolor: availabilityColors[avail],
                  borderRadius: '2px',
                  opacity: count > 0 ? 1 : 0.3,
                  cursor: 'pointer'
                }} />
              </Tooltip>
            );
          }
          return null;
        })}
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="h3">
          Availability Calendar
        </Typography>
        
        <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="doctor-select-label">Doctor</InputLabel>
          <Select
            labelId="doctor-select-label"
            value={selectedDoctor}
            onChange={handleDoctorChange}
            label="Doctor"
          >
            <MenuItem value="all">All Doctors</MenuItem>
            {doctors.map((doctor) => (
              <MenuItem key={doctor.name} value={doctor.name}>{doctor.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      <Paper elevation={3} sx={{ p: 2, mb: 4 }}>
        {/* Calendar header with month/year and navigation */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={prevMonth} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6">
            {monthNames[currentMonth]} {currentYear}
          </Typography>
          <IconButton onClick={nextMonth} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Box>
        
        {/* Day names header */}
        <Grid container spacing={1} sx={{ mb: 1 }}>
          {dayNames.map((day, index) => (
            <Grid item xs={12/7} key={index}>
              <Typography 
                variant="caption" 
                align="center" 
                sx={{ 
                  fontWeight: 'bold', 
                  display: 'block',
                  color: index === 0 || index === 6 ? 'error.main' : 'inherit'
                }}
              >
                {day}
              </Typography>
            </Grid>
          ))}
        </Grid>
        
        {/* Calendar grid */}
        <Grid container spacing={1}>
          {calendarDays.map((dayObj, index) => (
            <Grid item xs={12/7} key={index}>
              <Paper 
                elevation={dayObj.empty ? 0 : 1} 
                sx={{ 
                  height: 80, 
                  p: 1,
                  position: 'relative',
                  opacity: dayObj.empty ? 0.3 : 1,
                  bgcolor: dayObj.empty ? 'transparent' : 'background.paper',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {!dayObj.empty && (
                  <>
                    <Typography 
                      variant="body2" 
                      align="center" 
                      sx={{ 
                        fontWeight: 'medium',
                        color: (new Date(dayObj.date).getDay() === 0 || new Date(dayObj.date).getDay() === 6) 
                          ? 'error.main' 
                          : 'inherit'
                      }}
                    >
                      {dayObj.day}
                    </Typography>
                    
                    {/* Render availability indicators */}
                    {renderAvailabilityIndicators(dayObj.doctorAvailability)}
                    
                    {/* Show number of available doctors when in "all" view */}
                    {selectedDoctor === 'all' && (
                      <Typography 
                        variant="caption" 
                        align="center" 
                        sx={{ 
                          position: 'absolute',
                          bottom: 2,
                          right: 4,
                          fontSize: '0.6rem',
                          color: 'text.secondary'
                        }}
                      >
                        {Object.values(dayObj.doctorAvailability).filter(status => status !== 'Not Available').length} / {Object.keys(dayObj.doctorAvailability).length} docs
                      </Typography>
                    )}
                  </>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
      
      {/* Legend */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Availability Legend
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Grid container spacing={1}>
          {Object.entries(availabilityColors).map(([type, color]) => (
            <Grid item xs={6} sm={4} md={2} key={type}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption">{type}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2 }}>
        <InfoIcon color="info" fontSize="small" sx={{ mr: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {selectedDoctor === 'all' 
            ? "The colored bars indicate how many doctors have each availability type for that day." 
            : "The chip shows the selected doctor's availability for each day."}
        </Typography>
      </Box>
    </Box>
  );
}

export default DoctorAvailabilityCalendar;