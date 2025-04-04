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
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Divider,
  Zoom,
  TextField
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  EventNote as EventNoteIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon
} from '@mui/icons-material';

import { monthNames, dayNames } from '../utils/dateUtils';

import { useYear } from '../contexts/YearContext';

function HolidayCalendar({ holidays, setHolidays }) {

  const { selectedYear } = useYear();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(selectedYear);
  const [calendarDays, setCalendarDays] = useState([]);
  
  // State for managing the context menu
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  
  // State for the edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [holidayType, setHolidayType] = useState('Short');
  const [currentHolidayDate, setCurrentHolidayDate] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // State for handling consecutive date selections
  const [consecutiveDays, setConsecutiveDays] = useState([]);
  const [selectingConsecutive, setSelectingConsecutive] = useState(false);

  // Colors for different holiday types
  const holidayColors = {
    'Short': '#ff9800', // Orange
    'Long': '#f44336'   // Red
  };

  // Generate days for the current month view
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, currentYear, holidays]);

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
        isHoliday: false,
        holidayType: null
      });
    }
    
    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      // Check if this day is a holiday
      const isHoliday = holidays.hasOwnProperty(date);
      const holidayType = isHoliday ? holidays[date] : null;
      
      days.push({ 
        day: i, 
        month, 
        year, 
        empty: false,
        date,
        isHoliday,
        holidayType
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
  
  // Helper function to check if a date is consecutive to another date
  const isConsecutiveDate = (dateStr1, dateStr2) => {
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);
    
    // Set both dates to midnight to compare just the dates
    date1.setHours(0, 0, 0, 0);
    date2.setHours(0, 0, 0, 0);
    
    // Calculate the difference in days
    const diffTime = date2 - date1;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays === 1;
  };
  
  // Get consecutive days for a given day and type
  const getConsecutiveDaysGroup = (dayObj) => {
    if (!dayObj || !dayObj.isHoliday) return [];
    
    const consecutiveDays = [dayObj.date];
    const holidayType = dayObj.holidayType;
    
    // Find previous consecutive days with the same holiday type
    let prevDate = dayObj.date;
    while (true) {
      const prevDay = new Date(prevDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDateStr = prevDay.toISOString().split('T')[0];
      
      if (holidays[prevDateStr] && holidays[prevDateStr] === holidayType) {
        consecutiveDays.unshift(prevDateStr);
        prevDate = prevDateStr;
      } else {
        break;
      }
    }
    
    // Find next consecutive days with the same holiday type
    let nextDate = dayObj.date;
    while (true) {
      const nextDay = new Date(nextDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDateStr = nextDay.toISOString().split('T')[0];
      
      if (holidays[nextDateStr] && holidays[nextDateStr] === holidayType) {
        consecutiveDays.push(nextDateStr);
        nextDate = nextDateStr;
      } else {
        break;
      }
    }
    
    return consecutiveDays;
  };

  // Handle right-click on a day to open context menu
  const handleDayRightClick = (event, dayObj) => {
    if (dayObj.empty) return;
    
    event.preventDefault();
    
    setSelectedDay(dayObj);
    
    // Get all consecutive days if this is a holiday
    if (dayObj.isHoliday) {
      setConsecutiveDays(getConsecutiveDaysGroup(dayObj));
    } else {
      setConsecutiveDays([]);
    }
    
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
    });
  };
  
  // Handle click on a day to add/edit holiday
  const handleDayClick = (dayObj) => {
    if (dayObj.empty) return;
    
    setSelectedDay(dayObj);
    setCurrentHolidayDate(dayObj.date);
    
    if (dayObj.isHoliday) {
      // Edit existing holiday
      setHolidayType(dayObj.holidayType);
      setIsEditMode(true);
      setConsecutiveDays(getConsecutiveDaysGroup(dayObj));
    } else {
      // Add new holiday
      setHolidayType('Short');
      setIsEditMode(false);
      setConsecutiveDays([]);
    }
    
    setDialogOpen(true);
  };

  // Close context menu
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Remove holiday (single day or group)
  const handleRemoveHoliday = () => {
    if (!selectedDay) return;
    
    const newHolidays = { ...holidays };
    
    // If it's a single day
    if (!selectingConsecutive || consecutiveDays.length === 0) {
      if (selectedDay.isHoliday) {
        delete newHolidays[selectedDay.date];
      }
    } else {
      // Remove entire consecutive group
      consecutiveDays.forEach(date => {
        delete newHolidays[date];
      });
    }
    
    setHolidays(newHolidays);
    handleCloseContextMenu();
  };
  
  // Open edit dialog from context menu
  const handleEditHoliday = () => {
    if (!selectedDay) return;
    
    setCurrentHolidayDate(selectedDay.date);
    setHolidayType(selectedDay.isHoliday ? selectedDay.holidayType : 'Short');
    setIsEditMode(selectedDay.isHoliday);
    
    // If in consecutive mode and we're editing a holiday
    if (selectingConsecutive && selectedDay.isHoliday && consecutiveDays.length > 0) {
      // This will be handled by the dialog's range mode
    }
    
    setDialogOpen(true);
    handleCloseContextMenu();
  };
  
  // Toggle selection of consecutive days
  const handleToggleConsecutive = () => {
    setSelectingConsecutive(!selectingConsecutive);
    handleCloseContextMenu();
  };
  
  // Handle dialog close
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };
  
  // Save holiday from dialog
  const handleSaveHoliday = () => {
    if (!currentHolidayDate || !holidayType) return;
    
    const newHolidays = { ...holidays };
    
    // If we're in consecutive mode and editing
    if (isEditMode && selectingConsecutive && consecutiveDays.length > 0) {
      // Update all consecutive days with the new holiday type
      consecutiveDays.forEach(date => {
        newHolidays[date] = holidayType;
      });
    } else {
      // Just update/add the single date
      newHolidays[currentHolidayDate] = holidayType;
    }
    
    setHolidays(newHolidays);
    setDialogOpen(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="h3">
          Holiday Calendar
        </Typography>
        
        <Button
          variant="outlined"
          startIcon={<EventNoteIcon />}
          onClick={() => {
            setSelectedDay(null);
            setCurrentHolidayDate(null);
            setHolidayType('Short');
            setIsEditMode(false);
            setConsecutiveDays([]);
            setDialogOpen(true);
          }}
        >
          Add Holiday
        </Button>
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
                elevation={dayObj.empty ? 0 : (dayObj.isHoliday ? 2 : 1)} 
                sx={{ 
                  height: 80, 
                  p: 1,
                  position: 'relative',
                  opacity: dayObj.empty ? 0.3 : 1,
                  bgcolor: dayObj.isHoliday 
                    ? `${holidayColors[dayObj.holidayType]}20`  // 20% opacity of the holiday color
                    : 'background.paper',
                  border: dayObj.isHoliday 
                    ? `2px solid ${holidayColors[dayObj.holidayType]}`
                    : 'none',
                  cursor: dayObj.empty ? 'default' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: dayObj.empty ? 'none' : 'scale(1.03)',
                    boxShadow: dayObj.empty ? 'none' : '0 4px 8px rgba(0,0,0,0.1)'
                  }
                }}
                onClick={() => !dayObj.empty && handleDayClick(dayObj)}
                onContextMenu={(e) => handleDayRightClick(e, dayObj)}
              >
                {!dayObj.empty && (
                  <>
                    <Typography 
                      variant="body2" 
                      align="center" 
                      sx={{ 
                        fontWeight: dayObj.isHoliday ? 'bold' : 'medium',
                        color: (new Date(dayObj.date).getDay() === 0 || new Date(dayObj.date).getDay() === 6) 
                          ? 'error.main' 
                          : 'inherit'
                      }}
                    >
                      {dayObj.day}
                    </Typography>
                    
                    {/* Holiday indicator */}
                    {dayObj.isHoliday && (
                      <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'center' }}>
                        <Zoom in={true}>
                          <Chip 
                            size="small" 
                            label={dayObj.holidayType} 
                            sx={{ 
                              bgcolor: holidayColors[dayObj.holidayType],
                              color: 'white',
                              fontSize: '0.7rem',
                              height: '20px'
                            }}
                            deleteIcon={<DeleteIcon fontSize="small" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Check if we should handle consecutive days
                              const group = getConsecutiveDaysGroup(dayObj);
                              if (group.length > 1) {
                                setConsecutiveDays(group);
                                setSelectedDay(dayObj);
                                setSelectingConsecutive(true);
                                handleDayClick(dayObj);
                              } else {
                                handleDayClick(dayObj);
                              }
                            }}
                            onDelete={(e) => {
                              e.stopPropagation();
                              setSelectedDay(dayObj);
                              // Check if we should handle consecutive days
                              const group = getConsecutiveDaysGroup(dayObj);
                              if (group.length > 1) {
                                setConsecutiveDays(group);
                                setSelectedDay(dayObj);
                                
                                // Ask user if they want to delete all consecutive days
                                const newHolidays = { ...holidays };
                                group.forEach(date => {
                                  delete newHolidays[date];
                                });
                                setHolidays(newHolidays);
                              } else {
                                handleRemoveHoliday();
                              }
                            }}
                          />
                        </Zoom>
                      </Box>
                    )}
                    
                    {/* Add indicator for non-holidays */}
                    {!dayObj.isHoliday && (
                      <Tooltip title="Add Holiday">
                        <IconButton 
                          size="small" 
                          sx={{ 
                            position: 'absolute', 
                            bottom: 2, 
                            right: 2,
                            opacity: 0.3,
                            '&:hover': { opacity: 1 }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDayClick(dayObj);
                          }}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
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
          Holiday Types
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Grid container spacing={1}>
          {Object.entries(holidayColors).map(([type, color]) => (
            <Grid item xs={6} sm={3} key={type}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="body2">{type} Holiday</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2 }}>
        <EventNoteIcon color="info" fontSize="small" sx={{ mr: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Click on any day to add or edit a holiday. Right-click for more options.
        </Typography>
      </Box>
      
      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {selectedDay && selectedDay.isHoliday ? (
          [
            <MenuItem key="edit" onClick={handleEditHoliday}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Edit Holiday
            </MenuItem>,
            <MenuItem key="delete" onClick={handleRemoveHoliday}>
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Remove Holiday
            </MenuItem>,
            // Only show the consecutive option if there are consecutive days
            getConsecutiveDaysGroup(selectedDay).length > 1 ? (
              <MenuItem key="consecutive" onClick={handleToggleConsecutive}>
                <EventNoteIcon fontSize="small" sx={{ mr: 1 }} />
                {selectingConsecutive ? "Select Single Day" : "Select Consecutive Days"}
              </MenuItem>
            ) : null
          ]
        ) : (
          <MenuItem onClick={handleEditHoliday}>
            <AddIcon fontSize="small" sx={{ mr: 1 }} />
            Add Holiday
          </MenuItem>
        )}
      </Menu>
      
      {/* Add/Edit Holiday Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>
          {isEditMode 
            ? (selectingConsecutive && consecutiveDays.length > 1 
                ? 'Edit Holiday Group' 
                : 'Edit Holiday')
            : 'Add Holiday'}
        </DialogTitle>
        <DialogContent sx={{ minWidth: 300 }}>
          {!currentHolidayDate && !isEditMode && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Please select a date for this holiday:
            </Typography>
          )}
          
          {/* If adding without a preselected date, show date input */}
          {!currentHolidayDate && !isEditMode && (
            <TextField
              label="Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
              onChange={(e) => setCurrentHolidayDate(e.target.value)}
              value={currentHolidayDate || ''}
            />
          )}
          
          {/* Show selected date or date range for consecutive days */}
          {currentHolidayDate && (
            <Typography variant="body1" sx={{ mb: 2 }}>
              {selectingConsecutive && consecutiveDays.length > 1 
                ? `Date Range: ${consecutiveDays[0]} to ${consecutiveDays[consecutiveDays.length - 1]} (${consecutiveDays.length} days)`
                : `Date: ${currentHolidayDate}`}
            </Typography>
          )}
          
          {/* Holiday type selection */}
          <FormControl fullWidth>
            <InputLabel id="holiday-type-label">Holiday Type</InputLabel>
            <Select
              labelId="holiday-type-label"
              value={holidayType}
              label="Holiday Type"
              onChange={(e) => setHolidayType(e.target.value)}
            >
              <MenuItem value="Short">Short (1 day)</MenuItem>
              <MenuItem value="Long">Long (multi-day)</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button 
            onClick={handleSaveHoliday} 
            variant="contained"
            disabled={!currentHolidayDate}
          >
            {isEditMode ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default HolidayCalendar;