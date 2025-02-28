import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Chip,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Edit as EditIcon,
} from '@mui/icons-material';

function MonthlyCalendarView({ schedule, doctors, holidays, onScheduleUpdate }) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(2025); // Fixed to 2025 for this app
  const [calendarDays, setCalendarDays] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDoctors, setSelectedDoctors] = useState([]);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [currentSchedule, setCurrentSchedule] = useState({});
  
  // Initialize schedule
  useEffect(() => {
    if (schedule && Object.keys(schedule).length > 0) {
      setCurrentSchedule(JSON.parse(JSON.stringify(schedule))); // Deep copy
    }
  }, [schedule]);
  
  // Generate calendar days for the selected month
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, currentYear, currentSchedule]);
  
  const generateCalendarDays = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    
    // Create an array to hold all days for the calendar
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ day: null, isCurrentMonth: false });
    }
    
    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = formatDateToYYYYMMDD(date);
      
      // Check if this date is a holiday
      const isHoliday = holidays && holidays[dateStr];
      
      // Check if this date is a weekend
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      days.push({
        day,
        date: dateStr,
        isCurrentMonth: true,
        isWeekend,
        isHoliday,
        holidayType: isHoliday ? holidays[dateStr] : null,
        shifts: currentSchedule[dateStr] || { Day: [], Evening: [], Night: [] }
      });
    }
    
    // Add empty cells for days after the last day of the month to complete the grid
    const totalCells = Math.ceil(days.length / 7) * 7;
    for (let i = days.length; i < totalCells; i++) {
      days.push({ day: null, isCurrentMonth: false });
    }
    
    setCalendarDays(days);
  };
  
  // Helper function to format date to YYYY-MM-DD
  const formatDateToYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Handle month navigation
  const handlePreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };
  
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };
  
  // Get month name
  const getMonthName = (month) => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return monthNames[month];
  };
  
  // Open edit dialog
  const handleOpenEditDialog = (date, shift) => {
    setSelectedDate(date);
    setSelectedShift(shift);
    
    // Get current doctors for this shift and date
    const currentDoctorsForShift = currentSchedule[date] && 
                                  currentSchedule[date][shift] || [];
    
    setSelectedDoctors([...currentDoctorsForShift]);
    
    // Set available doctors (all doctors from the props)
    setAvailableDoctors(doctors.map(doc => doc.name));
    
    setEditDialogOpen(true);
  };
  
  // Handle doctor selection
  const handleDoctorToggle = (doctorName) => {
    const currentIndex = selectedDoctors.indexOf(doctorName);
    const newSelectedDoctors = [...selectedDoctors];
    
    if (currentIndex === -1) {
      // Add the doctor
      newSelectedDoctors.push(doctorName);
    } else {
      // Remove the doctor
      newSelectedDoctors.splice(currentIndex, 1);
    }
    
    setSelectedDoctors(newSelectedDoctors);
  };
  
  // Handle save changes
  const handleSaveChanges = () => {
    // Create a copy of the schedule
    const updatedSchedule = JSON.parse(JSON.stringify(currentSchedule));
    
    // Make sure the date exists in the schedule
    if (!updatedSchedule[selectedDate]) {
      updatedSchedule[selectedDate] = {
        Day: [],
        Evening: [],
        Night: []
      };
    }
    
    // Update the specified shift with the selected doctors
    updatedSchedule[selectedDate][selectedShift] = [...selectedDoctors];
    
    // Update the local state
    setCurrentSchedule(updatedSchedule);
    
    // Close the dialog
    setEditDialogOpen(false);
    
    // Notify parent component about the update
    if (onScheduleUpdate) {
      onScheduleUpdate(updatedSchedule);
    }
  };
  
  // Get shift cell color
  const getShiftCellColor = (shift) => {
    switch (shift) {
      case 'Day':
        return '#e3f2fd'; // Light blue
      case 'Evening':
        return '#e8f5e9'; // Light green
      case 'Night':
        return '#f3e5f5'; // Light purple
      default:
        return '#ffffff'; // White
    }
  };
  
  // Get day cell background color
  const getDayCellBackground = (dayInfo) => {
    if (!dayInfo.isCurrentMonth) return '#f5f5f5'; // Gray for days outside current month
    if (dayInfo.isHoliday) return dayInfo.holidayType === 'Long' ? '#ffebee' : '#fff8e1'; // Red for long holidays, yellow for short
    if (dayInfo.isWeekend) return '#fafafa'; // Light gray for weekends
    return '#ffffff'; // White for regular days
  };
  
  return (
    <Box sx={{ minHeight: '400px', mb: 4 }}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              {getMonthName(currentMonth)} {currentYear}
            </Typography>
            <Box>
              <IconButton onClick={handlePreviousMonth}>
                <ChevronLeft />
              </IconButton>
              <IconButton onClick={handleNextMonth}>
                <ChevronRight />
              </IconButton>
            </Box>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          {/* Calendar grid */}
          <Grid container spacing={1}>
            {/* Day header row */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <Grid item xs={12/7} key={`header-${index}`}>
                <Box sx={{ 
                  p: 1, 
                  textAlign: 'center', 
                  fontWeight: 'bold',
                  bgcolor: index === 0 || index === 6 ? '#f5f5f5' : 'transparent'
                }}>
                  {day}
                </Box>
              </Grid>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map((dayInfo, index) => (
              <Grid item xs={12/7} key={`day-${index}`}>
                <Box sx={{ 
                  height: '210px', // Fixed height for consistency
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: getDayCellBackground(dayInfo),
                  opacity: dayInfo.isCurrentMonth ? 1 : 0.5,
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {dayInfo.day && (
                    <>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 0.5,
                        borderBottom: '1px solid #e0e0e0'
                      }}>
                        <Typography variant="body2" fontWeight={dayInfo.isHoliday ? 'bold' : 'normal'}>
                          {dayInfo.day}
                        </Typography>
                        {dayInfo.isHoliday && (
                          <Chip 
                            size="small"
                            label={dayInfo.holidayType || 'Holiday'}
                            color={dayInfo.holidayType === 'Long' ? 'error' : 'warning'}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                      
                      {/* Shifts with consistent layout */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 0.5 }}>
                        {['Day', 'Evening', 'Night'].map(shift => {
                          const doctors = dayInfo.shifts[shift] || [];
                          
                          return (
                            <Box 
                              key={`${dayInfo.date}-${shift}`}
                              sx={{ 
                                p: 0.5,
                                mb: 0.5,
                                bgcolor: getShiftCellColor(shift),
                                borderRadius: 1,
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                                minHeight: '50px', // Ensure minimum height even when empty
                              }}
                            >
                              {/* Header with shift name and edit button */}
                              <Box sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px dashed rgba(0,0,0,0.1)',
                                pb: 0.5,
                                mb: 0.5
                              }}>
                                <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                                  {shift}:
                                </Typography>
                                <Tooltip title={`Edit ${shift} shift`}>
                                  <IconButton 
                                    size="small" 
                                    onClick={() => handleOpenEditDialog(dayInfo.date, shift)}
                                    sx={{ p: 0.3 }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                              
                              {/* Doctor grid - uniform layout */}
                              <Box sx={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(2, 1fr)', 
                                gap: 0.5,
                                overflow: 'auto',
                                flex: 1,
                                
                                
                              }}>
                                {doctors.length > 0 ? (
                                  doctors.map((doctor, idx) => (
                                    <Box
                                      key={idx}
                                      sx={{
                                        bgcolor: 'background.paper',
                                        border: '1px solid rgba(0,0,0,0.1)',
                                        borderRadius: '4px',
                                        p: 0.5,
                                        textAlign: 'center',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontSize: '0.7rem',
                                        
                                      }}
                                    >
                                      {doctor}
                                    </Box>
                                  ))
                                ) : (
                                  <Typography variant="caption" color="text.secondary" sx={{ gridColumn: 'span 2' }}>
                                    No doctors assigned
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
      
      {/* Edit Dialog - Improved */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Edit {selectedShift} Shift Assignment - {selectedDate}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ minWidth: 300 }}>
            <Typography variant="subtitle1" gutterBottom>
              Select doctors for this shift:
            </Typography>
            
            <List dense>
              {availableDoctors.map((doctor) => {
                const isSelected = selectedDoctors.includes(doctor);
                
                // Find the doctor's seniority
                const doctorInfo = doctors.find(d => d.name === doctor);
                const seniority = doctorInfo ? doctorInfo.seniority : '';
                
                return (
                  <ListItem
                    key={doctor}
                    button
                    onClick={() => handleDoctorToggle(doctor)}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      bgcolor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                    }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={isSelected}
                        tabIndex={-1}
                        disableRipple
                        color="primary"
                      />
                    </ListItemIcon>
                    <ListItemText 
                      primary={doctor} 
                      secondary={seniority}
                    />
                  </ListItem>
                );
              })}
            </List>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle1" gutterBottom>
              Selected doctors:
            </Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedDoctors.length > 0 ? (
                selectedDoctors.map((doctor, index) => (
                  <Chip 
                    key={index}
                    label={doctor}
                    onDelete={() => handleDoctorToggle(doctor)}
                    color="primary"
                  />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No doctors selected
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveChanges} variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default MonthlyCalendarView;