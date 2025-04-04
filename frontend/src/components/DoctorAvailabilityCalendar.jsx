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

function DoctorAvailabilityCalendar({ doctors, availability, initialYear }) {
  
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => {
    // Convert to number in case it's a string and validate
    const year = Number(initialYear);
    // Return the initialYear if valid, or current year as fallback
    return !isNaN(year) ? year : new Date().getFullYear();
  });
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [calendarDays, setCalendarDays] = useState([]);

  // Colors for different availability types
  const availabilityColors = {
    'Available': '#4caf50',
    'Not Available': '#f44336'
  };

  useEffect(() => {
    if (initialYear !== undefined && initialYear !== null) {
      const year = Number(initialYear);
      if (!isNaN(year)) {
        setCurrentYear(year);
      }
    }
  }, [initialYear]);

  // Generate days for the current month view
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, currentYear, selectedDoctor, availability]);

  const generateCalendarDays = () => {
    // Use currentYear instead of initialYear to ensure it's properly validated
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
      // Ensure proper formatting of dates with leading zeros
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
  
  // Get color for an availability status
  const getAvailabilityColor = (status) => {
    if (status.startsWith('Not Available: ')) {
      return '#ff9800'; // Use warning color (orange) for partial unavailability
    }
    
    return availabilityColors[status] || '#4caf50'; // Default to available (green)
  };

  // Get availability summary for a day, including doctor names
  const getAvailabilitySummary = (doctorAvailability) => {
    // Initialize summary with default categories - but only include not available statuses
    const summary = {
      'Not Available': { count: 0, doctors: [] }
      // Custom "Not Available: X, Y" statuses will be added dynamically
    };
    
    Object.entries(doctorAvailability).forEach(([doctor, avail]) => {
      // Skip doctors who are available
      if (avail === 'Available') {
        return;
      }
      
      // Handle standard availability types
      if (summary[avail] !== undefined) {
        summary[avail].count++;
        summary[avail].doctors.push(doctor);
      } 
      // Handle "Not Available: X, Y" statuses
      else if (avail.startsWith('Not Available: ')) {
        if (!summary[avail]) {
          summary[avail] = { count: 0, doctors: [] };
        }
        summary[avail].count++;
        summary[avail].doctors.push(doctor);
      }
      // Handle legacy formats for backward compatibility
      else if (avail === 'Day Only' || avail === 'Evening Only' || avail === 'Night Only' || avail.startsWith('No ')) {
        const legacyKey = avail;
        if (!summary[legacyKey]) {
          summary[legacyKey] = { count: 0, doctors: [] };
        }
        summary[legacyKey].count++;
        summary[legacyKey].doctors.push(doctor);
      }
    });
    
    return summary;
  };

  // Render availability indicators for a day
  const renderAvailabilityIndicators = (doctorAvailability) => {
    // If a specific doctor is selected, show their availability only if they are not available
    if (selectedDoctor !== 'all') {
      const availability = doctorAvailability[selectedDoctor] || 'Available';
      
      // Only show non-available statuses
      if (availability === 'Available') {
        return null;
      }
      
      return (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
          <Chip 
            size="small" 
            label={availability} 
            sx={{ 
              bgcolor: getAvailabilityColor(availability),
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
    
    // If there are no non-available doctors, return null
    if (Object.keys(summary).length === 0 || 
        Object.values(summary).every(({ count }) => count === 0)) {
      return null;
    }
    
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
                  bgcolor: getAvailabilityColor(avail),
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
          <IconButton onClick={prevMonth}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6">
            {monthNames[currentMonth]} {currentYear}
          </Typography>
          <IconButton onClick={nextMonth}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
        
        {/* Calendar days header */}
        <Grid container spacing={1} sx={{ mb: 1 }}>
          {dayNames.map((day, index) => (
            <Grid item xs={12/7} key={index}>
              <Typography 
                variant="subtitle2" 
                align="center" 
                sx={{ 
                  fontWeight: 'bold',
                  color: (index === 0 || index === 6) ? 'error.main' : 'inherit'
                }}
              >
                {day}
              </Typography>
            </Grid>
          ))}
        </Grid>
        
        {/* Calendar days grid */}
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
                    
                    {/* Show number of non-available doctors when in "all" view */}
                    {selectedDoctor === 'all' && (
                      <Tooltip 
                        title={
                          <Typography variant="caption">
                            {Object.values(dayObj.doctorAvailability).filter(a => a !== 'Available').length} unavailable doctors
                          </Typography>
                        }
                      >
                        <Box sx={{ 
                          position: 'absolute', 
                          bottom: 2, 
                          right: 2,
                          backgroundColor: 'background.default',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          // Only show if there are unavailable doctors
                          visibility: Object.values(dayObj.doctorAvailability).some(a => a !== 'Available') ? 'visible' : 'hidden'
                        }}>
                          {Object.values(dayObj.doctorAvailability).filter(a => a !== 'Available').length}
                        </Box>
                      </Tooltip>
                    )}
                  </>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
        
        {/* Legend - updated to only show non-availability statuses */}
        <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="subtitle2" sx={{ width: '100%', mb: 1 }}>
            Legend:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ 
              width: 16, 
              height: 16, 
              backgroundColor: availabilityColors['Not Available'],
              marginRight: 1
            }} />
            <Typography variant="caption">
              Not Available
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ 
              width: 16, 
              height: 16, 
              backgroundColor: '#ff9800', // Partial unavailability
              marginRight: 1
            }} />
            <Typography variant="caption">
              Partially Available
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

export default DoctorAvailabilityCalendar;