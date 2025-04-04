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
  Divider,
  Badge,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Stack
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Event as EventIcon,
  Info as InfoIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Edit as EditIcon
} from '@mui/icons-material';

import { monthNames, dayNames } from '../utils/dateUtils';

function DoctorAvailabilityCalendar({ doctors, availability, initialYear, setAvailability }) {
  
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => {
    // Convert to number in case it's a string and validate
    const year = Number(initialYear);
    // Return the initialYear if valid, or current year as fallback
    return !isNaN(year) ? year : new Date().getFullYear();
  });
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [calendarDays, setCalendarDays] = useState([]);
  
  // Add state for availability changes that haven't been saved yet
  const [localAvailability, setLocalAvailability] = useState(availability);
  
  // Add state for unavailability editor dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDay, setEditingDay] = useState(null);
  const [unavailableShifts, setUnavailableShifts] = useState({
    Day: false,
    Evening: false,
    Night: false
  });
  const [editingDoctor, setEditingDoctor] = useState('');

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
  
  // Update local availability when the prop changes
  useEffect(() => {
    // Always update from the parent availability to ensure we stay in sync with changes
    // from "Mark as Unavailable" and other external updates
    const deepCopy = JSON.parse(JSON.stringify(availability || {}));
    setLocalAvailability(deepCopy);
  }, [availability]);

  // Generate days for the current month view
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, currentYear, selectedDoctor, localAvailability]);

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
          if (localAvailability[doctorName] && localAvailability[doctorName][date]) {
            doctorAvailability[doctorName] = localAvailability[doctorName][date];
          } else {
            doctorAvailability[doctorName] = 'Available'; // Default if not specified
          }
        });
      } else {
        // Get availability for selected doctor
        if (localAvailability[selectedDoctor] && localAvailability[selectedDoctor][date]) {
          doctorAvailability[selectedDoctor] = localAvailability[selectedDoctor][date];
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

  // Get initials from a doctor's name
  const getInitials = (name) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2); // Limit to max 2 characters
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
  
  // Handle day click to open unavailability editor
  const handleDayClick = (dayObj) => {
    if (dayObj.empty) return;
    
    // Set default doctor selection
    let doctorToEdit = selectedDoctor !== 'all' ? selectedDoctor : doctors[0]?.name || '';
    
    // Initialize unavailable shifts based on current availability status
    const currentStatus = dayObj.doctorAvailability[doctorToEdit] || 'Available';
    const shifts = {
      Day: false,
      Evening: false,
      Night: false
    };
    
    if (currentStatus === 'Not Available') {
      // All shifts are unavailable
      shifts.Day = true;
      shifts.Evening = true;
      shifts.Night = true;
    } else if (currentStatus.startsWith('Not Available: ')) {
      // Parse which shifts are unavailable
      const unavailableShiftsText = currentStatus.substring('Not Available: '.length);
      const unavailableShiftsList = unavailableShiftsText.split(', ');
      
      unavailableShiftsList.forEach(shift => {
        if (shift in shifts) {
          shifts[shift] = true;
        }
      });
    }
    
    setEditingDay(dayObj);
    setEditingDoctor(doctorToEdit);
    setUnavailableShifts(shifts);
    setOpenDialog(true);
  };
  
  // Handle dialog close
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingDay(null);
    setUnavailableShifts({
      Day: false,
      Evening: false,
      Night: false
    });
  };
  
  // Handle shift checkbox changes
  const handleShiftChange = (event) => {
    setUnavailableShifts({
      ...unavailableShifts,
      [event.target.name]: event.target.checked
    });
  };
  
  // Handle doctor change in the dialog
  const handleEditingDoctorChange = (event) => {
    const doctorName = event.target.value;
    setEditingDoctor(doctorName);
    
    // Update unavailable shifts based on selected doctor's current availability
    if (editingDay) {
      const currentStatus = editingDay.doctorAvailability[doctorName] || 'Available';
      const shifts = {
        Day: false,
        Evening: false,
        Night: false
      };
      
      if (currentStatus === 'Not Available') {
        // All shifts are unavailable
        shifts.Day = true;
        shifts.Evening = true;
        shifts.Night = true;
      } else if (currentStatus.startsWith('Not Available: ')) {
        // Parse which shifts are unavailable
        const unavailableShiftsText = currentStatus.substring('Not Available: '.length);
        const unavailableShiftsList = unavailableShiftsText.split(', ');
        
        unavailableShiftsList.forEach(shift => {
          if (shift in shifts) {
            shifts[shift] = true;
          }
        });
      }
      
      setUnavailableShifts(shifts);
    }
  };
  
  // Get availability status based on unavailable shifts
  const getAvailabilityStatus = (unavailableShifts) => {
    const { Day, Evening, Night } = unavailableShifts;
    
    // Count how many shifts are unavailable
    const unavailableCount = Object.values(unavailableShifts).filter(Boolean).length;
    
    if (unavailableCount === 0) {
      return "Available";
    }
    
    // All shifts unavailable
    if (Day && Evening && Night) {
      return "Not Available";
    } 
    
    // Create a descriptive status consistently showing what shifts are NOT available
    const unavailableShiftNames = [];
    if (Day) unavailableShiftNames.push("Day");
    if (Evening) unavailableShiftNames.push("Evening");
    if (Night) unavailableShiftNames.push("Night");
    
    return `Not Available: ${unavailableShiftNames.join(", ")}`;
  };
  
  // Save unavailability from dialog
  const saveUnavailability = () => {
    if (!editingDay || !editingDoctor) return;
    
    // Create a deep copy of the current local availability
    const newAvailability = JSON.parse(JSON.stringify(localAvailability || {}));
    
    // Initialize doctor if needed
    if (!newAvailability[editingDoctor]) {
      newAvailability[editingDoctor] = {};
    }
    
    // Determine the availability status based on selected shifts
    const availabilityStatus = getAvailabilityStatus(unavailableShifts);
    
    // If status is "Available", remove the entry to keep the object clean
    if (availabilityStatus === "Available") {
      if (newAvailability[editingDoctor][editingDay.date]) {
        delete newAvailability[editingDoctor][editingDay.date];
      }
    } else {
      // Otherwise, set the new status
      newAvailability[editingDoctor][editingDay.date] = availabilityStatus;
    }
    
    // Update local availability for immediate UI updates
    setLocalAvailability(newAvailability);
    
    // If setAvailability is provided, update parent state immediately
    // This matches how the "Mark as Unavailable" button works
    if (setAvailability) {
      setAvailability(newAvailability);
    }
    
    // Close the dialog
    handleCloseDialog();
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
            icon={availability === 'Available' ? <CheckIcon fontSize="small" /> : <CloseIcon fontSize="small" />}
            label={availability} 
            sx={{ 
              bgcolor: getAvailabilityColor(availability),
              color: 'white',
              fontSize: '0.7rem',
              height: '24px',
              width: '100%',
              '& .MuiChip-label': {
                px: 1
              }
            }}
          />
        </Box>
      );
    }
    
    // For "all" view, show avatar-like circles for each unavailable doctor
    const unavailableDoctors = Object.entries(doctorAvailability)
      .filter(([_, status]) => status !== 'Available')
      .map(([doctorName, status]) => ({ doctorName, status }));
    
    if (unavailableDoctors.length === 0) {
      return null;
    }
    
    // If there are too many doctors to show, we'll show the first few and a "+X more" indicator
    const MAX_VISIBLE_DOCTORS = 6;
    const visibleDoctors = unavailableDoctors.slice(0, MAX_VISIBLE_DOCTORS);
    const hiddenDoctorsCount = Math.max(0, unavailableDoctors.length - MAX_VISIBLE_DOCTORS);
    
    return (
      <Box sx={{ 
        mt: 1, 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 0.5, 
        justifyContent: 'center',
        maxHeight: 50,  // Limit height but don't add scrollbar
        overflow: 'hidden' // Hide overflow instead of scrolling
      }}>
        {visibleDoctors.map(({ doctorName, status }, index) => (
          <Tooltip
            key={doctorName}
            title={
              <React.Fragment>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{doctorName}</Typography>
                <Typography variant="caption" component="div">
                  {status}
                </Typography>
              </React.Fragment>
            }
            placement="top"
            arrow
          >
            <Avatar 
              sx={{ 
                width: 22, 
                height: 22, 
                fontSize: '0.7rem', 
                bgcolor: getAvailabilityColor(status),
                cursor: 'pointer',
                border: '1px solid white',
                '&:hover': {
                  transform: 'scale(1.1)',
                  zIndex: 10  // Bring to front when hovered
                }
              }}
            >
              {getInitials(doctorName)}
            </Avatar>
          </Tooltip>
        ))}
        
        {/* Show "+X more" indicator if there are hidden doctors */}
        {hiddenDoctorsCount > 0 && (
          <Tooltip
            title={
              <React.Fragment>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Additional doctors unavailable:</Typography>
                <Typography variant="caption" component="div">
                  {unavailableDoctors.slice(MAX_VISIBLE_DOCTORS).map(d => (
                    <div key={d.doctorName}>
                      {d.doctorName} - {d.status}
                    </div>
                  ))}
                </Typography>
              </React.Fragment>
            }
            placement="top"
            arrow
          >
            <Avatar 
              sx={{ 
                width: 22, 
                height: 22,
                fontSize: '0.6rem', 
                bgcolor: 'grey.500',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'scale(1.1)',
                  bgcolor: 'grey.600',
                  zIndex: 10
                }
              }}
            >
              +{hiddenDoctorsCount}
            </Avatar>
          </Tooltip>
        )}
      </Box>
    );
  };
  
  // Save all changes back to parent component
  const saveAllChanges = () => {
    if (setAvailability) {
      // Create a deep copy to ensure we pass a new object reference to the parent
      const deepCopy = JSON.parse(JSON.stringify(localAvailability || {}));
      setAvailability(deepCopy);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="h3">
          Availability Calendar
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControl variant="outlined" size="small" sx={{ minWidth: 200, mr: 2 }}>
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
          
          {setAvailability && JSON.stringify(localAvailability) !== JSON.stringify(availability) && (
            <Button 
              variant="contained" 
              color="primary" 
              size="small" 
              onClick={saveAllChanges}
            >
              Save Changes
            </Button>
          )}
        </Box>
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
                  height: 95, // Slightly increased height to better fit avatars
                  p: 1,
                  position: 'relative',
                  opacity: dayObj.empty ? 0.3 : 1,
                  bgcolor: dayObj.empty ? 'transparent' : 'background.paper',
                  display: 'flex',
                  flexDirection: 'column',
                  border: !dayObj.empty && selectedDoctor !== 'all' && 
                         (dayObj.doctorAvailability[selectedDoctor] === 'Available') 
                         ? '1px solid #4caf50' // Green border for available days when a doctor is selected
                         : 'none',
                  '&:hover': {
                    boxShadow: dayObj.empty ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
                  },
                  cursor: dayObj.empty ? 'default' : 'pointer'
                }}
                onClick={() => !dayObj.empty && handleDayClick(dayObj)}
              >
                {!dayObj.empty && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 'medium',
                          color: (new Date(dayObj.date).getDay() === 0 || new Date(dayObj.date).getDay() === 6) 
                            ? 'error.main' 
                            : 'inherit'
                        }}
                      >
                        {dayObj.day}
                      </Typography>
                      <Tooltip title="Edit Availability">
                        <EditIcon fontSize="small" sx={{ color: 'action.active', opacity: 0.6, fontSize: '0.8rem' }} />
                      </Tooltip>
                    </Box>
                    
                    {/* Render availability indicators */}
                    {renderAvailabilityIndicators(dayObj.doctorAvailability)}
                  </>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
        
        {/* Calendar Legend */}
        <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="subtitle2" sx={{ width: '100%', mb: 1 }}>
            Legend:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar 
              sx={{ 
                width: 20, 
                height: 20, 
                fontSize: '0.6rem',
                bgcolor: availabilityColors['Not Available'],
                marginRight: 1
              }}
            >
              DR
            </Avatar>
            <Typography variant="caption">
              Not Available Doctor
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Avatar 
              sx={{ 
                width: 20, 
                height: 20, 
                fontSize: '0.6rem',
                bgcolor: '#ff9800', // Partial unavailability
                marginRight: 1
              }}
            >
              DR
            </Avatar>
            <Typography variant="caption">
              Partially Available Doctor
            </Typography>
          </Box>
          {selectedDoctor !== 'all' && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ 
                width: 20, 
                height: 20,
                border: '1px solid #4caf50',
                backgroundColor: 'white',
                marginRight: 1
              }} />
              <Typography variant="caption">
                Available Day
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
      
      {/* Unavailability Editor Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit Doctor Availability
          {editingDay && <Typography variant="subtitle2">{editingDay.date}</Typography>}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="edit-doctor-label">Doctor</InputLabel>
              <Select
                labelId="edit-doctor-label"
                value={editingDoctor}
                onChange={handleEditingDoctorChange}
                label="Doctor"
              >
                {doctors.map((doctor) => (
                  <MenuItem key={doctor.name} value={doctor.name}>{doctor.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Typography variant="subtitle2" gutterBottom>
              Mark Unavailable Shifts:
            </Typography>
            
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={unavailableShifts.Day} 
                    onChange={handleShiftChange} 
                    name="Day"
                  />
                }
                label="Day Shift"
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={unavailableShifts.Evening} 
                    onChange={handleShiftChange} 
                    name="Evening"
                  />
                }
                label="Evening Shift"
              />
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={unavailableShifts.Night} 
                    onChange={handleShiftChange} 
                    name="Night"
                  />
                }
                label="Night Shift"
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={saveUnavailability} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DoctorAvailabilityCalendar;