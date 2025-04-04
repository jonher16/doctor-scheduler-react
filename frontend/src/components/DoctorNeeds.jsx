import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Checkbox,
  FormGroup,
  FormHelperText
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Event as EventIcon,
  CalendarToday as CalendarTodayIcon,
  ViewList as ViewListIcon,
  CalendarViewMonth as CalendarViewMonthIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import EnhancedCalendar from './EnhancedCalendar';
import DoctorAvailabilityCalendar from './DoctorAvailabilityCalendar';
import { useYear } from '../contexts/YearContext';


function DoctorNeeds({ doctors, setAvailability, availability }) {
  const { selectedYear } = useYear();

  // Store constraints with support for date ranges
  const [constraints, setConstraints] = useState([]);
  const [mergedConstraints, setMergedConstraints] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editConstraintIndex, setEditConstraintIndex] = useState(null);
  const [newConstraint, setNewConstraint] = useState({
    doctor: '',
    date: '',
    unavailableShifts: {
      Day: false,
      Evening: false,
      Night: false
    }
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Add state for range mode toggle
  const [isRangeMode, setIsRangeMode] = useState(false);
  
  // Add state for view mode (table or calendar)
  const [viewMode, setViewMode] = useState('table');

  // Load existing constraints when component mounts or availability changes
  useEffect(() => {
    // Convert availability object to array format for display
    if (availability && typeof availability === 'object') {
      const constraintsArray = [];
      
      // Iterate through each doctor in availability
      Object.keys(availability).forEach(doctor => {
        const doctorAvailability = availability[doctor];
        
        // Iterate through each date for this doctor
        Object.keys(doctorAvailability).forEach(date => {
          // Check if the date matches the selected year
          const dateYear = date.split('-')[0];
          if (dateYear !== selectedYear.toString()) {
            return; // Skip dates that don't match the selected year
          }
          
          const availStatus = doctorAvailability[date];
          // Only add constraints for non-available days
          if (availStatus !== 'Available') {
            constraintsArray.push({
              doctor: doctor,
              date: date,
              avail: availStatus
            });
          }
        });
      });
      
      setConstraints(constraintsArray);
    }
  }, [availability, selectedYear]);

  // Merge consecutive days of the same non-availability type
  useEffect(() => {
    // Group constraints by doctor and availability type
    const mergedArray = [];
    
    // Sort constraints by doctor, then by date
    const sortedConstraints = [...constraints].sort((a, b) => {
      if (a.doctor !== b.doctor) return a.doctor.localeCompare(b.doctor);
      return a.date.localeCompare(b.date);
    });
    
    if (sortedConstraints.length === 0) {
      setMergedConstraints([]);
      return;
    }
    
    let currentGroup = {
      doctor: sortedConstraints[0].doctor,
      avail: sortedConstraints[0].avail,
      dates: [sortedConstraints[0].date]
    };
    
    // Helper function to check if a date is consecutive to the last date in the group
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
    
    // Group consecutive days with the same doctor and availability
    for (let i = 1; i < sortedConstraints.length; i++) {
      const current = sortedConstraints[i];
      const lastDateInGroup = currentGroup.dates[currentGroup.dates.length - 1];
      
      // Check if this constraint is consecutive and has the same doctor and availability
      if (
        current.doctor === currentGroup.doctor && 
        current.avail === currentGroup.avail &&
        isConsecutiveDate(lastDateInGroup, current.date)
      ) {
        // Add to current group
        currentGroup.dates.push(current.date);
      } else {
        // Save the current group and start a new one
        mergedArray.push({
          ...currentGroup,
          startDate: currentGroup.dates[0],
          endDate: currentGroup.dates[currentGroup.dates.length - 1]
        });
        
        currentGroup = {
          doctor: current.doctor,
          avail: current.avail,
          dates: [current.date]
        };
      }
    }
    
    // Add the last group
    mergedArray.push({
      ...currentGroup,
      startDate: currentGroup.dates[0],
      endDate: currentGroup.dates[currentGroup.dates.length - 1]
    });
    
    setMergedConstraints(mergedArray);
  }, [constraints]);

  // Handle opening the edit constraint dialog
  const handleEditConstraint = (index) => {
    const constraintToEdit = mergedConstraints[index];
    
    // Set the date range to edit
    const dateRange = [constraintToEdit.startDate, constraintToEdit.endDate];
    
    // Parse the availability status to set unavailable shifts
    const unavailableShifts = {
      Day: false,
      Evening: false,
      Night: false
    };
    
    if (constraintToEdit.avail === 'Not Available') {
      // All shifts are unavailable
      unavailableShifts.Day = true;
      unavailableShifts.Evening = true;
      unavailableShifts.Night = true;
    } else if (constraintToEdit.avail.startsWith('Not Available: ')) {
      // Specific shifts are unavailable
      const unavailableShiftsText = constraintToEdit.avail.substring('Not Available: '.length);
      const unavailableShiftsList = unavailableShiftsText.split(', ');
      
      unavailableShiftsList.forEach(shift => {
        if (shift === 'Day' || shift === 'Evening' || shift === 'Night') {
          unavailableShifts[shift] = true;
        }
      });
    }
    
    setNewConstraint({
      doctor: constraintToEdit.doctor,
      date: dateRange,
      unavailableShifts
    });
    
    setIsRangeMode(true); // Always use range mode for editing
    setEditConstraintIndex(index);
    setOpenDialog(true);
  };

  // Handle opening the add constraint dialog
  const handleOpenDialog = () => {
    setNewConstraint({
      doctor: '',
      date: isRangeMode ? [null, null] : '',
      unavailableShifts: {
        Day: false,
        Evening: false,
        Night: false
      }
    });
    setEditConstraintIndex(null);
    setOpenDialog(true);
  };

  // Handle closing the dialog
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Handle toggling range mode
  const handleRangeModeToggle = (event) => {
    const rangeEnabled = event.target.checked;
    setIsRangeMode(rangeEnabled);
    // Reset selected date when switching modes
    setNewConstraint(prev => ({
      ...prev,
      date: rangeEnabled ? [null, null] : ''
    }));
  };

  // Handle date selection change
  const handleDateChange = (date) => {
    setNewConstraint({
      ...newConstraint,
      date: date
    });
  };

  // Handle shift checkbox change
  const handleShiftChange = (event) => {
    setNewConstraint({
      ...newConstraint,
      unavailableShifts: {
        ...newConstraint.unavailableShifts,
        [event.target.name]: event.target.checked
      }
    });
  };

  // Validate date format (YYYY-MM-DD)
  const isValidDate = (dateString) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const parts = dateString.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    return date.getFullYear() === year && 
           date.getMonth() === month && 
           date.getDate() === day;
  };

  // Converts unavailable shifts to availability status
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

  // Modified addConstraint to handle edit mode
  const addConstraint = () => {
    if (!newConstraint.doctor) {
      setSnackbar({
        open: true,
        message: 'Please select a doctor',
        severity: 'error'
      });
      return;
    }
    
    // Check if at least one shift is marked as unavailable
    const anyShiftUnavailable = Object.values(newConstraint.unavailableShifts).some(value => value);
    if (!anyShiftUnavailable) {
      setSnackbar({
        open: true,
        message: 'Please select at least one unavailable shift',
        severity: 'error'
      });
      return;
    }

    // Convert unavailable shifts to availability status
    const availStatus = getAvailabilityStatus(newConstraint.unavailableShifts);
    
    // Create a new array of constraints to modify
    let newConstraints = [...constraints];
    
    // Create a copy of current availability to update
    let newAvailability = JSON.parse(JSON.stringify(availability || {}));

    if (isRangeMode) {
      // Range mode validation
      if (!newConstraint.date || !Array.isArray(newConstraint.date) || 
          !newConstraint.date[0] || !newConstraint.date[1]) {
        setSnackbar({
          open: true,
          message: 'Please select both start and end dates',
          severity: 'error'
        });
        return;
      }
      
      // Extract start and end dates from the range
      const [startDate, endDate] = newConstraint.date;
      
      // If we're editing, first remove all existing dates for this constraint
      if (editConstraintIndex !== null) {
        const constraintToEdit = mergedConstraints[editConstraintIndex];
        
        // Remove all existing dates for this doctor in the date range
        newConstraints = constraints.filter(c => {
          // Keep constraint if it's not for the same doctor
          if (c.doctor !== constraintToEdit.doctor) return true;
          
          // Keep constraint if date is outside the edited range
          const date = new Date(c.date);
          const startDateObj = new Date(constraintToEdit.startDate);
          const endDateObj = new Date(constraintToEdit.endDate);
          
          return date < startDateObj || date > endDateObj;
        });
      }
      
      // Convert dates to Date objects for comparison
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Create a new date to iterate through the range
      const current = new Date(start);
      
      // Count new constraints added
      let addedCount = 0;
      
      // Initialize doctor in newAvailability if needed
      if (!newAvailability[newConstraint.doctor]) {
        newAvailability[newConstraint.doctor] = {};
      }
      
      // Loop through each date in the range
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // Add the new constraint for this date
        newConstraints.push({
          doctor: newConstraint.doctor,
          date: dateStr,
          avail: availStatus
        });
        
        // Also update availability data for immediate use
        newAvailability[newConstraint.doctor][dateStr] = availStatus;
        
        addedCount++;
        
        // Move to next day
        current.setDate(current.getDate() + 1);
      }
      
      // Update constraints
      setConstraints(newConstraints);
      
      // Update parent availability state immediately
      setAvailability(newAvailability);
      
      // Close dialog
      setOpenDialog(false);
      
      setSnackbar({
        open: true,
        message: editConstraintIndex !== null 
          ? `Availability updated for ${addedCount} days` 
          : `Non-availability added for ${addedCount} days`,
        severity: 'success'
      });
    } else {
      // Single date validation
      if (!newConstraint.date) {
        setSnackbar({
          open: true,
          message: 'Please select a date',
          severity: 'error'
        });
        return;
      }
      
      // Initialize doctor in newAvailability if needed
      if (!newAvailability[newConstraint.doctor]) {
        newAvailability[newConstraint.doctor] = {};
      }
      
      // Check if this constraint already exists
      const existingIndex = newConstraints.findIndex(
        c => c.doctor === newConstraint.doctor && c.date === newConstraint.date
      );
      
      if (existingIndex !== -1) {
        // Update existing constraint
        newConstraints[existingIndex] = {
          ...newConstraints[existingIndex],
          avail: availStatus
        };
        
        // Update availability data for immediate use
        newAvailability[newConstraint.doctor][newConstraint.date] = availStatus;
        
        // Update states
        setConstraints(newConstraints);
        setAvailability(newAvailability);
        
        setOpenDialog(false);
        
        setSnackbar({
          open: true,
          message: `Updated non-availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
          severity: 'success'
        });
      } else {
        // Add new constraint
        newConstraints.push({
          doctor: newConstraint.doctor,
          date: newConstraint.date,
          avail: availStatus
        });
        
        // Update availability data for immediate use
        newAvailability[newConstraint.doctor][newConstraint.date] = availStatus;
        
        // Update states
        setConstraints(newConstraints);
        setAvailability(newAvailability);
        
        setOpenDialog(false);
        
        setSnackbar({
          open: true,
          message: `Added non-availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
          severity: 'success'
        });
      }
    }
  };

  // Handle removing a constraint
  const removeConstraint = (index) => {
    const constraintToRemove = constraints[index];
    const newConstraints = [...constraints];
    newConstraints.splice(index, 1);
    setConstraints(newConstraints);
    setSnackbar({
      open: true,
      message: `Removed constraint for Dr. ${constraintToRemove.doctor} on ${constraintToRemove.date}`,
      severity: 'info'
    });
  };

  // Save constraints back to parent component
  const saveConstraints = () => {
    // Create new availability object only with entries for the current year
    const newAvailability = {};
    
    constraints.forEach(constraint => {
      // Initialize doctor if not already in newAvailability
      if (!newAvailability[constraint.doctor]) {
        newAvailability[constraint.doctor] = {};
      }
      
      // Add/update date for this doctor
      newAvailability[constraint.doctor][constraint.date] = constraint.avail;
    });
    
    // Preserve entries from other years that aren't in our constraints
    if (availability) {
      Object.entries(availability).forEach(([doctor, dates]) => {
        if (!newAvailability[doctor]) {
          newAvailability[doctor] = {};
        }
        
        Object.entries(dates).forEach(([date, avail]) => {
          // Only keep dates from other years (current year dates come from constraints)
          const dateYear = date.split('-')[0];
          if (dateYear !== selectedYear.toString()) {
            newAvailability[doctor][date] = avail;
          }
        });
      });
    }
    
    setAvailability(newAvailability);
    setSnackbar({
      open: true,
      message: 'Availability constraints saved successfully',
      severity: 'success'
    });
  };
  
  // Close snackbar
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };
  
  // Get color for availability chip
  const getAvailabilityColor = (avail) => {
    if (avail.startsWith("Not Available: ")) {
      return "warning";  // Use warning color for partial unavailability
    }
    
    switch (avail) {
      case 'Not Available':
        return 'error';
      case 'Available':
        return 'success';
      default:
        return 'default';
    }
  };
  
  // Handle view mode change
  const handleViewModeChange = (event, newMode) => {
    setViewMode(newMode);
  };

  // Get the current month's index (0-11)
  const getCurrentMonth = () => {
    return new Date().getMonth();
  };

  // Get the next month's index (0-11)
  const getNextMonth = () => {
    return (getCurrentMonth() + 1) % 12;
  };

  // Get month from a date string in format 'YYYY-MM-DD'
  const getMonthFromDateString = (dateString) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!isNaN(month)) {
      return month - 1; // Convert from 1-12 to 0-11
    }
    return null;
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Doctor Availability
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage individual doctor non-availability for specific dates and shifts. By default, doctors are considered available for all shifts on all days unless specified otherwise.
        </Typography>
      </Box>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tabs 
          value={viewMode} 
          onChange={handleViewModeChange}
          variant="standard"
          aria-label="View mode tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            value="table" 
            label="Table View" 
            icon={<ViewListIcon />} 
            iconPosition="start"
          />
          <Tab 
            value="calendar" 
            label="Calendar View" 
            icon={<CalendarViewMonthIcon />} 
            iconPosition="start"
          />
        </Tabs>

        <Box>
          <Button
            variant="contained"
            startIcon={<CalendarTodayIcon />}
            onClick={handleOpenDialog}
            sx={{ mr: 2 }}
            color="error"
          >
            Mark As Unavailable
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={saveConstraints}
            color="primary"
          >
            Save Availability
          </Button>
        </Box>
      </Box>

      {/* Table View - modified to show merged constraints */}
      {viewMode === 'table' && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="subtitle2">Doctor</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Date Range</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Availability</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Actions</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mergedConstraints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No availability constraints added yet. By default, all doctors are available on all dates.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                mergedConstraints.map((constraint, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body1">
                        {constraint.doctor}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1">
                        {constraint.startDate === constraint.endDate 
                          ? constraint.startDate 
                          : `${constraint.startDate} to ${constraint.endDate} (${constraint.dates.length} days)`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={constraint.avail} 
                        color={getAvailabilityColor(constraint.avail)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton 
                          color="primary" 
                          onClick={() => handleEditConstraint(index)}
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton 
                          color="error" 
                          onClick={() => {
                            // Remove all constraints in this merged group
                            const newConstraints = constraints.filter(c => 
                              !(constraint.doctor === c.doctor && constraint.dates.includes(c.date))
                            );
                            setConstraints(newConstraints);
                          }}
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <DoctorAvailabilityCalendar 
          doctors={doctors}
          availability={availability}
          initialYear={selectedYear}
          setAvailability={setAvailability}
        />
      )}

      {/* Dialog title now reflects add or edit mode */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editConstraintIndex !== null 
            ? 'Edit Non-Availability' 
            : (isRangeMode ? 'Add Non-Availability Range' : 'Add Doctor Non-Availability')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={doctors.map(doc => doc.name)}
                value={newConstraint.doctor}
                onChange={(event, newValue) => {
                  setNewConstraint({...newConstraint, doctor: newValue || ''});
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Doctor Name"
                    fullWidth
                    required
                  />
                )}
              />
            </Grid>
            {editConstraintIndex === null && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={isRangeMode}
                      onChange={handleRangeModeToggle}
                      color="primary"
                    />
                  }
                  label="Select Date Range"
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                {isRangeMode ? 'Select Date Range' : 'Select Date'}
              </Typography>
              <EnhancedCalendar 
                value={newConstraint.date}
                onChange={handleDateChange}
                minDate={new Date().toISOString().split('T')[0]} // Today as min date
                isRangeMode={isRangeMode}
                initialYear={selectedYear}
                initialMonth={
                  editConstraintIndex !== null && Array.isArray(newConstraint.date) && newConstraint.date[0]
                    ? getMonthFromDateString(newConstraint.date[0])
                    : getNextMonth()
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Select Shifts NOT Available:
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={newConstraint.unavailableShifts.Day}
                      onChange={handleShiftChange}
                      name="Day"
                      color="primary"
                    />
                  }
                  label="Day Shift"
                />
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={newConstraint.unavailableShifts.Evening}
                      onChange={handleShiftChange}
                      name="Evening"
                      color="success"
                    />
                  }
                  label="Evening Shift"
                />
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={newConstraint.unavailableShifts.Night}
                      onChange={handleShiftChange}
                      name="Night"
                      color="secondary"
                    />
                  }
                  label="Night Shift"
                />
              </FormGroup>
              <FormHelperText>
                Note: By default, doctors are available for all shifts. Select the shifts this doctor CANNOT work on the selected date(s).
              </FormHelperText>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={addConstraint} variant="contained">
            {editConstraintIndex !== null ? 'Update' : (isRangeMode ? 'Add Range' : 'Add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default DoctorNeeds;