import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  IconButton,
  Typography,
  Paper,
  Button
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CalendarMonth as CalendarIcon
} from '@mui/icons-material';
import { isLeapYear, getDaysInMonth } from '../utils/dateUtils';
import { useYear } from '../contexts/YearContext';

function EnhancedCalendar({ value, onChange, minDate, maxDate, isRangeMode = false }) {
  const { selectedYear } = useYear();
  
  // Parse the initial date(s) if provided or use current date
  const parseInitialDate = () => {
    if (value) {
      // For date range mode
      if (isRangeMode && Array.isArray(value) && value.length === 2) {
        return new Date(value[0] || new Date());
      }
      // For single date mode
      else if (typeof value === 'string') {
        const [year, month, day] = value.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return new Date(year, month - 1, day);
        }
      }
    }
    return new Date();
  };

  const [currentDate, setCurrentDate] = useState(parseInitialDate());
  const [selectedDate, setSelectedDate] = useState(value || '');
  const [rangeStart, setRangeStart] = useState(isRangeMode && Array.isArray(value) ? value[0] : null);
  const [rangeEnd, setRangeEnd] = useState(isRangeMode && Array.isArray(value) ? value[1] : null);
  const [selectionStep, setSelectionStep] = useState(rangeStart ? 'end' : 'start');

  // Update the calendar when the external value changes
  useEffect(() => {
    if (!isRangeMode && value && typeof value === 'string' && value !== selectedDate) {
      setSelectedDate(value);
      const [year, month, day] = value.split('-').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        setCurrentDate(new Date(year, month - 1, day));
      }
    } else if (isRangeMode && Array.isArray(value)) {
      const [start, end] = value;
      setRangeStart(start);
      setRangeEnd(end);
      
      // Set the current view to the first date in the range
      if (start) {
        const [year, month, day] = start.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          setCurrentDate(new Date(year, month - 1, day));
        }
        setSelectionStep(end ? 'start' : 'end');
      } else {
        setSelectionStep('start');
      }
    }
  }, [value, isRangeMode]);

  // Month names for display
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Day names for display
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Generate days for the current month view
  const generateDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    // Last day of the month - account for leap years
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    const days = [];
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ day: '', month: month, year: year, empty: true });
    }
    
    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month: month, year: year, empty: false });
    }
    
    return days;
  };

  // Navigate to previous month
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // Navigate to next month
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Format a day object into a YYYY-MM-DD string
  const formatDayObj = (dayObj) => {
    const year = dayObj.year;
    const month = (dayObj.month + 1).toString().padStart(2, '0'); // JavaScript months are 0-indexed
    const day = dayObj.day.toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };

  // Handle day selection logic
  const handleDayClick = (dayObj) => {
    if (dayObj.empty) return;
    
    const formattedDate = formatDayObj(dayObj);
    
    if (!isRangeMode) {
      // Single date selection mode
      setSelectedDate(formattedDate);
      if (onChange) {
        onChange(formattedDate);
      }
    } else {
      // Range selection mode
      if (selectionStep === 'start') {
        setRangeStart(formattedDate);
        setRangeEnd(null);
        setSelectionStep('end');
        
        if (onChange) {
          onChange([formattedDate, null]);
        }
      } else {
        // Ensure end date is after start date
        if (rangeStart && formattedDate < rangeStart) {
          // If clicking a date before start date, swap them
          setRangeEnd(rangeStart);
          setRangeStart(formattedDate);
        } else {
          setRangeEnd(formattedDate);
        }
        
        setSelectionStep('start'); // Reset for next range selection
        
        if (onChange) {
          onChange(formattedDate < rangeStart 
            ? [formattedDate, rangeStart] 
            : [rangeStart, formattedDate]);
        }
      }
    }
  };

  // Reset the current range selection
  const resetRange = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setSelectionStep('start');
    
    if (onChange) {
      onChange([null, null]);
    }
  };

  // Check if a date is selected
  const isSelectedDate = (dayObj) => {
    if (dayObj.empty) return false;
    
    const formattedDate = formatDayObj(dayObj);
    
    if (!isRangeMode) {
      // Single date selection
      return formattedDate === selectedDate;
    } else {
      // Range selection - exactly matches start or end
      return formattedDate === rangeStart || formattedDate === rangeEnd;
    }
  };

  // Check if a date is within the selected range (but not start/end)
  const isInRange = (dayObj) => {
    if (!isRangeMode || dayObj.empty || !rangeStart || !rangeEnd) return false;
    
    const formattedDate = formatDayObj(dayObj);
    return formattedDate > rangeStart && formattedDate < rangeEnd;
  };

  // Check if a date is disabled (before minDate or after maxDate)
  const isDisabledDate = (dayObj) => {
    if (dayObj.empty) return true;
    
    const formattedDate = formatDayObj(dayObj);
    
    if (minDate && formattedDate < minDate) return true;
    if (maxDate && formattedDate > maxDate) return true;
    
    return false;
  };

  // Generate array of calendar days
  const days = generateDays();

  return (
    <Paper elevation={3} sx={{ p: 2, maxWidth: 360, mx: 'auto' }}>
      {/* Calendar header with month and navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={prevMonth} size="small">
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h6">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Typography>
        <IconButton onClick={nextMonth} size="small">
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {/* Range mode indicator */}
      {isRangeMode && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="primary">
            {selectionStep === 'start' ? 'Select start date' : 'Select end date'}
          </Typography>
          {(rangeStart || rangeEnd) && (
            <Button size="small" variant="outlined" onClick={resetRange}>
              Reset Range
            </Button>
          )}
        </Box>
      )}

      {/* Day names header */}
      <Grid container spacing={1} sx={{ mb: 1 }}>
        {dayNames.map((day, index) => (
          <Grid item xs={12/7} key={index}>
            <Typography variant="caption" align="center" sx={{ fontWeight: 'bold' }}>
              {day}
            </Typography>
          </Grid>
        ))}
      </Grid>
      
      {/* Calendar grid */}
      <Grid container spacing={1}>
        {days.map((dayObj, index) => (
          <Grid item xs={12/7} key={index}>
            <Button
              fullWidth
              variant={isSelectedDate(dayObj) ? "contained" : "text"}
              color={isSelectedDate(dayObj) ? "primary" : "inherit"}
              disabled={dayObj.empty || isDisabledDate(dayObj)}
              onClick={() => handleDayClick(dayObj)}
              sx={{
                height: 36,
                minWidth: 36,
                p: 0,
                backgroundColor: isInRange(dayObj) ? 'primary.light' : undefined,
                color: isInRange(dayObj) ? 'common.white' : undefined,
                border: isSelectedDate(dayObj) ? 'none' : '1px solid transparent',
                borderRadius: 1,
                '&:hover': {
                  border: dayObj.empty ? 'none' : '1px solid',
                  borderColor: 'primary.main',
                },
              }}
            >
              {dayObj.day}
            </Button>
          </Grid>
        ))}
      </Grid>

      {/* Selected date/range display */}
      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        <CalendarIcon sx={{ mr: 1, color: 'primary.main' }} />
        {!isRangeMode && selectedDate && (
          <Typography variant="body2">
            Selected: <strong>{selectedDate}</strong>
          </Typography>
        )}
        {isRangeMode && (
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            {rangeStart ? (
              <>
                From: <strong>{rangeStart}</strong>
                {rangeEnd ? (
                  <> To: <strong>{rangeEnd}</strong></>
                ) : (
                  <> (Select end date)</>
                )}
              </>
            ) : (
              "No date range selected"
            )}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

export default EnhancedCalendar;