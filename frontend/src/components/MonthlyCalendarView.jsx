import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  IconButton,
  Chip,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Snackbar,
  Alert,
  Divider,
  Card,
  CardContent,
  Stack
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Save as SaveIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getMonthName } from '../utils/dateUtils';

function MonthlyCalendarView({ doctors, schedule, holidays, onScheduleUpdate, selectedMonth, selectedYear, shiftTemplate = {} }) {
  const [calendarDays, setCalendarDays] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDay, setEditingDay] = useState(null);
  const [editedSchedule, setEditedSchedule] = useState({});
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Get default shift template from localStorage if not provided
  const [localShiftTemplate, setLocalShiftTemplate] = useState({});
  
  // Color mapping for doctors - to consistently color-code each doctor
  const [doctorColors, setDoctorColors] = useState({});
  
  // Initialize doctor colors
  useEffect(() => {
    // Generate consistent colors for all doctors
    const colorMap = {};
    const colorOptions = [
      '#3f51b5', '#f44336', '#009688', '#ff9800', '#9c27b0', 
      '#4caf50', '#2196f3', '#ff5722', '#607d8b', '#e91e63',
      '#673ab7', '#795548', '#00bcd4', '#8bc34a', '#ffc107'
    ];
    
    doctors.forEach((doctor, index) => {
      // Assign a color from the palette, or generate one if we run out
      colorMap[doctor.name] = colorOptions[index % colorOptions.length];
    });
    
    setDoctorColors(colorMap);
  }, [doctors]);
  
  useEffect(() => {
    // Try to load shift template from localStorage if not provided
    if (!shiftTemplate || Object.keys(shiftTemplate).length === 0) {
      try {
        const storedTemplate = localStorage.getItem('shiftTemplate');
        if (storedTemplate) {
          setLocalShiftTemplate(JSON.parse(storedTemplate));
        }
      } catch (error) {
        console.error('Error loading shift template:', error);
      }
    } else {
      setLocalShiftTemplate(shiftTemplate);
    }
  }, [shiftTemplate]);

  // Format month and year for display
  const monthName = getMonthName(selectedMonth);
  
  // Helper function to format dates
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Default shift requirements if not specified in template
  const DEFAULT_REQUIREMENTS = {
    "Day": 2,
    "Evening": 1,
    "Night": 2
  };

  // Helper function to get required doctors for a shift on a date
  const getRequiredDoctors = (date, shift) => {
    // Check the shift template first
    if (localShiftTemplate[date] && localShiftTemplate[date][shift]) {
      return localShiftTemplate[date][shift].slots;
    }
    
    // Fall back to defaults if not specified
    return DEFAULT_REQUIREMENTS[shift];
  };

  // Check if a shift is available for a specific date
  const isShiftAvailable = (date, shift) => {
    // If the shift is not in the template, it should not be available
    if (localShiftTemplate[date]) {
      return shift in localShiftTemplate[date];
    }
    
    // If date is not in template, default to all shifts being available
    return true;
  };

  // Generate calendar days for the selected month
  useEffect(() => {
    generateCalendarDays();
  }, [selectedMonth, selectedYear, schedule, holidays, localShiftTemplate]);

  const generateCalendarDays = () => {
    // Important: JS Date months are 0-based, but our selectedMonth is 1-based
    // so we need to subtract 1 when creating Date objects
    const jsMonth = selectedMonth - 1;
    
    // First day of the month
    const firstDay = new Date(selectedYear, jsMonth, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    // Last day of the month
    const lastDay = new Date(selectedYear, jsMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ 
        day: '', 
        month: jsMonth, 
        year: selectedYear, 
        empty: true 
      });
    }
    
    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${selectedYear}-${String(jsMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      // Check if this date is in the schedule
      const daySchedule = schedule[date] || {};
      
      // Check if date is a holiday
      const isHoliday = holidays[date] ? true : false;
      const holidayType = holidays[date] || null;
      
      // Check if date is a weekend
      const day = new Date(selectedYear, jsMonth, i);
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      
      days.push({ 
        day: i, 
        month: jsMonth, 
        year: selectedYear, 
        date: date,
        schedule: daySchedule,
        isHoliday,
        holidayType,
        isWeekend
      });
    }
    
    setCalendarDays(days);
  };

  // Navigate to previous month
  const prevMonth = () => {
    // This function is not typically used as the month is controlled by parent component
    // but keeping it for future functionality
    let newMonth = selectedMonth - 1;
    let newYear = selectedYear;
    
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    // Parent component should handle the month/year change
    console.log(`Navigate to previous month: ${newMonth}/${newYear}`);
  };

  // Navigate to next month
  const nextMonth = () => {
    // This function is not typically used as the month is controlled by parent component
    // but keeping it for future functionality
    let newMonth = selectedMonth + 1;
    let newYear = selectedYear;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    
    // Parent component should handle the month/year change
    console.log(`Navigate to next month: ${newMonth}/${newYear}`);
  };

  // Handle editing a specific day
  const handleEditDay = (day) => {
    if (day.empty) return;
    
    setEditingDay(day);
    setEditedSchedule(JSON.parse(JSON.stringify(day.schedule)));
    setDialogOpen(true);
  };

  // Handle closing the edit dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDay(null);
    setEditedSchedule({});
  };

  // Handle changes to doctor assignments
  const handleDoctorChange = (shift, index, value) => {
    const newSchedule = { ...editedSchedule };
    
    // Ensure the shift array exists
    if (!newSchedule[shift]) {
      newSchedule[shift] = [];
    }
    
    // Update the doctor at the specified index
    const updatedShift = [...newSchedule[shift]];
    updatedShift[index] = value;
    newSchedule[shift] = updatedShift;
    
    setEditedSchedule(newSchedule);
  };

  // Handle removing a doctor from a shift
  const handleRemoveDoctor = (shift, index) => {
    const newSchedule = { ...editedSchedule };
    
    if (newSchedule[shift] && newSchedule[shift].length > index) {
      const updatedShift = [...newSchedule[shift]];
      updatedShift.splice(index, 1);
      newSchedule[shift] = updatedShift;
      
      setEditedSchedule(newSchedule);
    }
  };

  // Handle adding a doctor to a shift
  const handleAddDoctor = (shift) => {
    const newSchedule = { ...editedSchedule };
    
    // Ensure the shift array exists
    if (!newSchedule[shift]) {
      newSchedule[shift] = [];
    }
    
    // Add an empty slot
    newSchedule[shift] = [...newSchedule[shift], ''];
    
    setEditedSchedule(newSchedule);
  };

  // Handle saving changes to the schedule
  const handleSaveChanges = () => {
    if (!editingDay) return;
    
    // Create a copy of the current schedule
    const updatedSchedule = JSON.parse(JSON.stringify(schedule));
    
    // Update the specific day
    updatedSchedule[editingDay.date] = editedSchedule;
    
    // Notify parent component of the update
    if (onScheduleUpdate) {
      onScheduleUpdate(updatedSchedule);
    }
    
    // Close dialog
    handleCloseDialog();
    
    // Show notification
    setNotification({
      open: true,
      message: `Updated schedule for ${formatDate(editingDay.date)}`,
      severity: 'success'
    });
  };

  // Handle closing notification
  const handleCloseNotification = () => {
    setNotification({
      ...notification,
      open: false
    });
  };
  
  // Determine color for holiday chip
  const getHolidayColor = (type) => {
    return type === 'Long' ? 'error' : 'warning';
  };

  // Get background color for date cells
  const getDateCellColor = (dayObj) => {
    if (dayObj.isHoliday) {
      return dayObj.holidayType === 'Long' ? 'rgba(244, 67, 54, 0.08)' : 'rgba(255, 152, 0, 0.08)';
    }
    if (dayObj.isWeekend) {
      return 'rgba(0, 0, 0, 0.02)';
    }
    return 'white';
  };
  
  // Get shift type color
  const getShiftColor = (shift) => {
    switch(shift) {
      case 'Day':
        return 'primary.light';
      case 'Evening':
        return 'success.light';
      case 'Night':
        return 'secondary.light';
      default:
        return 'default';
    }
  };
  
  // Helper to check if doctor is available for a shift
  const isDoctorAvailable = (doctorName, date, shift) => {
    // A placeholder for doctor availability logic
    // This should be implemented based on your application's availability data
    return true;
  };

  // Render the calendar view
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          {monthName} {selectedYear} Calendar
        </Typography>
        
        <Box>
          <IconButton onClick={prevMonth} disabled>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={nextMonth} disabled>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>
      
      {/* Doctor color legend */}
      <Box sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1, backgroundColor: '#f9f9f9' }}>
        <Typography variant="subtitle2" gutterBottom>Doctor Color Legend</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {doctors.map(doctor => (
            <Chip
              key={doctor.name}
              avatar={
                <Avatar style={{ backgroundColor: doctorColors[doctor.name] || '#ccc' }}>
                  {doctor.name.charAt(0)}
                </Avatar>
              }
              label={doctor.name}
              variant="outlined"
              size="small"
              sx={{ mb: 0.5 }}
            />
          ))}
        </Box>
      </Box>
      
      <Grid container spacing={0}>
        {/* Day headers (Sun-Sat) */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
          <Grid item xs={12/7} key={day} sx={{ px: 0.5, py: 0.5 }}>
            <Paper 
              sx={{ 
                p: 1, 
                textAlign: 'center',
                bgcolor: index === 0 || index === 6 ? 'rgba(0, 0, 0, 0.03)' : 'white',
                borderBottom: '2px solid',
                borderColor: index === 0 || index === 6 ? 'error.main' : 'primary.main'
              }}
              elevation={0}
            >
              <Typography 
                variant="subtitle2"
                sx={{
                  color: index === 0 || index === 6 ? 'error.main' : 'text.primary',
                  fontWeight: 'bold'
                }}
              >
                {day}
              </Typography>
            </Paper>
          </Grid>
        ))}
        
        {/* Calendar days */}
        {calendarDays.map((day, index) => (
          <Grid item xs={12/7} key={index} sx={{ px: 0.5, py: 0.5 }}>
            {day.empty ? (
              <Paper sx={{ height: 180, bgcolor: '#f9f9f9', opacity: 0.5 }} elevation={0} />
            ) : (
              <Paper 
                sx={{ 
                  height: 180, 
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  position: 'relative',
                  bgcolor: getDateCellColor(day),
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 3,
                    zIndex: 10
                  },
                  overflow: 'hidden'
                }}
                onClick={() => handleEditDay(day)}
              >
                {/* Day number */}
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  mb: 1,
                  pb: 0.5,
                  borderBottom: '1px dashed',
                  borderColor: 'divider',
                  width: '100%'
                }}>
                  <Typography 
                    variant="body1" 
                    sx={{
                      color: day.isWeekend ? 'error.main' : 'text.primary',
                      fontWeight: day.isWeekend ? 'bold' : 'medium',
                      flex: 'none'
                    }}
                  >
                    {day.day}
                  </Typography>
                  
                  {day.isHoliday && (
                    <Tooltip title={`${day.holidayType} Holiday`}>
                      <Chip 
                        label={day.holidayType} 
                        size="small" 
                        color={getHolidayColor(day.holidayType)}
                        sx={{ height: 20, fontSize: '0.6rem' }}
                      />
                    </Tooltip>
                  )}
                </Box>
                
                {/* Shifts */}
                <Box sx={{ flexGrow: 1 }}>
                  {['Day', 'Evening', 'Night'].map(shift => {
                    // Check if this shift is available in the template
                    const shiftAvailable = isShiftAvailable(day.date, shift);
                    
                    // Get required doctors for this shift from template
                    const requiredDoctors = shiftAvailable ? getRequiredDoctors(day.date, shift) : 0;
                    
                    // Get assigned doctors from schedule
                    const assignedDoctors = day.schedule[shift] || [];
                    
                    // Calculate if the shift is active (either has template entry or has doctors assigned)
                    const isActiveShift = shiftAvailable || assignedDoctors.length > 0;
                    
                    return (
                      <Box 
                        key={shift} 
                        sx={{ 
                          mb: 0.5, 
                          p: 0.5,
                          border: '1px solid',
                          borderColor: isActiveShift ? 'divider' : 'rgba(0,0,0,0.05)',
                          borderRadius: 1,
                          bgcolor: isActiveShift ? 
                            ((theme) => theme.palette.mode === 'dark' ? 
                              `${getShiftColor(shift)}33` : // 20% opacity for dark mode
                              `${getShiftColor(shift)}22`) : // 13% opacity for light mode
                            'rgba(0,0,0,0.02)', // very subtle background for inactive shifts
                          position: 'relative',
                          opacity: isActiveShift ? 1 : 0.7,
                          // Add a visual cue if there are not enough doctors assigned
                          '&::before': (isActiveShift && assignedDoctors.length < requiredDoctors) ? {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '0',
                            height: '0',
                            borderStyle: 'solid',
                            borderWidth: '0 8px 8px 0',
                            borderColor: 'transparent #f44336 transparent transparent',
                            zIndex: 1
                          } : {},
                          minHeight: 32, // Ensure minimum height for consistency
                          maxHeight: 40, // Limit maximum height
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              fontWeight: 'bold', 
                              display: 'block',
                              fontSize: '0.7rem',
                              flex: 'none',
                              mr: 0.5
                            }}
                          >
                            {shift} {isActiveShift ? `${assignedDoctors.length}/${requiredDoctors}` : ''}
                          </Typography>
                          
                          {assignedDoctors.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.5, overflow: 'hidden' }}>
                              {assignedDoctors.map((doctor, i) => (
                                <Tooltip key={i} title={doctor}>
                                  <Avatar 
                                    sx={{ 
                                      width: 20, 
                                      height: 20, 
                                      fontSize: '0.7rem',
                                      bgcolor: doctorColors[doctor] || '#ccc',
                                      border: '1px solid white',
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                      flex: 'none'
                                    }}
                                  >
                                    {doctor.charAt(0)}
                                  </Avatar>
                                </Tooltip>
                              ))}
                            </Box>
                          ) : (
                            <Typography 
                              variant="caption" 
                              color="text.secondary" 
                              sx={{ 
                                fontStyle: 'italic',
                                fontSize: '0.65rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {isActiveShift ? 'No doctors' : 'Not scheduled'}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                
                {/* Edit icon */}
                <IconButton 
                  size="small" 
                  sx={{ 
                    position: 'absolute', 
                    bottom: 2, 
                    right: 2,
                    width: 24,
                    height: 24,
                    bgcolor: 'background.paper',
                    boxShadow: 1,
                    '&:hover': {
                      bgcolor: 'primary.light',
                      color: 'white'
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditDay(day);
                  }}
                >
                  <EditIcon sx={{ fontSize: '0.9rem' }} />
                </IconButton>
              </Paper>
            )}
          </Grid>
        ))}
      </Grid>
      
      {/* Edit dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        {editingDay && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">
                  Edit Schedule for {formatDate(editingDay.date)}
                </Typography>
                <Box>
                  {editingDay.isHoliday && (
                    <Chip 
                      label={`${editingDay.holidayType} Holiday`}
                      color={getHolidayColor(editingDay.holidayType)}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                  {editingDay.isWeekend && !editingDay.isHoliday && (
                    <Chip 
                      label="Weekend"
                      color="default"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ py: 2 }}>
                {['Day', 'Evening', 'Night'].map(shift => {
                  // Check if this shift is available in the template
                  const shiftAvailable = isShiftAvailable(editingDay.date, shift);
                  
                  // Get required doctors from template (0 if not available)
                  const requiredDoctors = shiftAvailable ? getRequiredDoctors(editingDay.date, shift) : 0;
                  
                  const currentDoctors = editedSchedule[shift] || [];
                  
                  // Calculate if the shift is active (either has template entry or has doctors assigned)
                  const isActiveShift = shiftAvailable || currentDoctors.length > 0;
                  
                  return (
                    <Card 
                      key={shift} 
                      sx={{ 
                        mb: 2,
                        borderLeft: '4px solid',
                        borderColor: isActiveShift ? 
                          (theme) => theme.palette[shift === 'Day' ? 'primary' : 
                                                shift === 'Evening' ? 'success' : 'secondary'].main :
                          'rgba(0,0,0,0.1)',
                        opacity: isActiveShift ? 1 : 0.7,
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Typography variant="h6" sx={{ 
                            color: shift === 'Day' ? 'primary.main' : 
                                  shift === 'Evening' ? 'success.main' : 'secondary.main' 
                          }}>
                            {shift} Shift {!isActiveShift && '(Inactive)'}
                          </Typography>
                          {isActiveShift ? (
                            <Chip 
                              icon={<PersonIcon />}
                              label={`${currentDoctors.length}/${requiredDoctors} doctors`}
                              color={currentDoctors.length < requiredDoctors ? "warning" : "success"}
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="Not Scheduled"
                              color="default"
                              variant="outlined"
                              size="small"
                            />
                          )}
                        </Box>
                        
                        <Divider sx={{ mb: 2 }} />
                        
                        {currentDoctors.length > 0 ? (
                          <>
                            {currentDoctors.map((doctor, index) => (
                              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <Avatar 
                                  sx={{ 
                                    mr: 1, 
                                    bgcolor: doctorColors[doctor] || '#ccc',
                                    width: 32,
                                    height: 32
                                  }}
                                >
                                  {doctor ? doctor.charAt(0) : '?'}
                                </Avatar>
                                <FormControl fullWidth sx={{ mr: 1 }}>
                                  <InputLabel id={`doctor-${shift}-${index}-label`}>Doctor</InputLabel>
                                  <Select
                                    labelId={`doctor-${shift}-${index}-label`}
                                    value={doctor}
                                    label="Doctor"
                                    onChange={(e) => handleDoctorChange(shift, index, e.target.value)}
                                    sx={{
                                      '& .MuiSelect-select': {
                                        display: 'flex',
                                        alignItems: 'center'
                                      }
                                    }}
                                    renderValue={(selected) => (
                                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        {selected}
                                      </Box>
                                    )}
                                  >
                                    <MenuItem value="">
                                      <em>None</em>
                                    </MenuItem>
                                    {doctors.map(doc => {
                                      const isAvailable = isDoctorAvailable(doc.name, editingDay.date, shift);
                                      const doctorInfo = `${doc.name} (${doc.seniority}${doc.pref !== 'None' ? ` - ${doc.pref}` : ''})`;
                                      
                                      return (
                                        <MenuItem 
                                          key={doc.name} 
                                          value={doc.name}
                                          disabled={!isAvailable}
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center'
                                          }}
                                        >
                                          <Avatar 
                                            sx={{ 
                                              mr: 1, 
                                              bgcolor: doctorColors[doc.name] || '#ccc',
                                              width: 24,
                                              height: 24,
                                              fontSize: '0.75rem'
                                            }}
                                          >
                                            {doc.name.charAt(0)}
                                          </Avatar>
                                          {doctorInfo}
                                        </MenuItem>
                                      );
                                    })}
                                  </Select>
                                </FormControl>
                                <IconButton 
                                  color="error" 
                                  onClick={() => handleRemoveDoctor(shift, index)}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            ))}
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
                            No doctors assigned to this shift
                          </Typography>
                        )}
                        
                        <Button
                          variant="outlined"
                          startIcon={<AddIcon />}
                          onClick={() => handleAddDoctor(shift)}
                          sx={{ mt: 1 }}
                          color={shift === 'Day' ? 'primary' : 
                                 shift === 'Evening' ? 'success' : 'secondary'}
                        >
                          Add Doctor
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button 
                variant="contained" 
                startIcon={<SaveIcon />}
                onClick={handleSaveChanges}
              >
                Save Changes
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      
      {/* Notification */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default MonthlyCalendarView;