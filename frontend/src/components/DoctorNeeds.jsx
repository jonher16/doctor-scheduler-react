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
  Switch
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Event as EventIcon,
  CalendarToday as CalendarTodayIcon,
  ViewList as ViewListIcon,
  CalendarViewMonth as CalendarViewMonthIcon
} from '@mui/icons-material';
import EnhancedCalendar from './EnhancedCalendar';
import DoctorAvailabilityCalendar from './DoctorAvailabilityCalendar';
import { useYear } from '../contexts/YearContext';


function DoctorNeeds({ doctors, setAvailability, availability }) {
  const { selectedYear } = useYear();

  // Store constraints with support for date ranges
  const [constraints, setConstraints] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [newConstraint, setNewConstraint] = useState({
    doctor: '',
    date: '',
    avail: 'Available'
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
          constraintsArray.push({
            doctor: doctor,
            date: date,
            avail: doctorAvailability[date]
          });
        });
      });
      
      setConstraints(constraintsArray);
    }
  }, [availability]);

  // Handle opening the add constraint dialog
  const handleOpenDialog = () => {
    setNewConstraint({
      doctor: '',
      date: isRangeMode ? [null, null] : '',
      avail: 'Available'
    });
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

  // Handle adding a new constraint
  const addConstraint = () => {
    if (!newConstraint.doctor) {
      setSnackbar({
        open: true,
        message: 'Please select a doctor',
        severity: 'error'
      });
      return;
    }

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
      
      // Add constraints for each date in the range
      const newConstraints = [...constraints];
      
      // Convert dates to Date objects for comparison
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Create a new date to iterate through the range
      const current = new Date(start);
      
      // Count new constraints added
      let addedCount = 0;
      let updatedCount = 0;
      
      // Loop through each date in the range
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // Check if constraint already exists for this doctor and date
        const existingIndex = newConstraints.findIndex(
          c => c.doctor === newConstraint.doctor && c.date === dateStr
        );
        
        if (existingIndex !== -1) {
          // Update existing constraint
          newConstraints[existingIndex] = {
            ...newConstraints[existingIndex],
            avail: newConstraint.avail
          };
          updatedCount++;
        } else {
          // Add new constraint
          newConstraints.push({
            doctor: newConstraint.doctor,
            date: dateStr,
            avail: newConstraint.avail
          });
          addedCount++;
        }
        
        // Move to next day
        current.setDate(current.getDate() + 1);
      }
      
      setConstraints(newConstraints);
      setSnackbar({
        open: true,
        message: `Updated availability for Dr. ${newConstraint.doctor}: ${addedCount} new entries, ${updatedCount} updated entries`,
        severity: 'success'
      });
      
    } else {
      // Single date validation
      if (!newConstraint.date || !isValidDate(newConstraint.date)) {
        setSnackbar({
          open: true,
          message: 'Please enter a valid date in YYYY-MM-DD format',
          severity: 'error'
        });
        return;
      }
      
      // Check if constraint already exists
      const existingIndex = constraints.findIndex(
        c => c.doctor === newConstraint.doctor && c.date === newConstraint.date
      );

      if (existingIndex !== -1) {
        // Update existing constraint
        const newConstraints = [...constraints];
        newConstraints[existingIndex] = {
          ...newConstraints[existingIndex],
          avail: newConstraint.avail
        };
        setConstraints(newConstraints);
        setSnackbar({
          open: true,
          message: `Updated availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
          severity: 'info'
        });
      } else {
        // Add new constraint
        const constraintToAdd = {
          doctor: newConstraint.doctor,
          date: newConstraint.date,
          avail: newConstraint.avail
        };
        setConstraints([...constraints, constraintToAdd]);
        setSnackbar({
          open: true,
          message: `Added availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
          severity: 'success'
        });
      }
    }
    
    setOpenDialog(false);
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
    // Build availability object: { doctor: { date: avail, ... }, ... }
    const avail = {};
    constraints.forEach(({ doctor, date, avail: a }) => {
      if (!avail[doctor]) avail[doctor] = {};
      avail[doctor][date] = a;
    });
    setAvailability(avail);
    setSnackbar({
      open: true,
      message: 'Doctor availability saved successfully!',
      severity: 'success'
    });
  };

  // Handle closing snackbar
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Get color for availability chip
  const getAvailabilityColor = (avail) => {
    switch(avail) {
      case 'Available':
        return 'success';
      case 'Not Available':
        return 'error';
      case 'Day Only':
        return 'primary';
      case 'Evening Only':
        return 'info';
      case 'Night Only':
        return 'secondary';
      default:
        return 'default';
    }
  };

  // Handle changing view mode
  const handleViewModeChange = (event, newMode) => {
    if (newMode) {
      setViewMode(newMode);
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Doctor Availability
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage individual doctor availability and shift preferences for specific dates. This helps in creating optimal schedules that accommodate doctor needs.
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
          >
            Add Availability
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

      {/* Table View */}
      {viewMode === 'table' && (
        <TableContainer component={Paper} sx={{ mb: 4 }}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.light' }}>
                <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Availability</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body1" sx={{ py: 2 }}>
                      No availability constraints set. Add availability constraints to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                constraints.map((constraint, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body1">
                        {constraint.doctor}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body1">
                        {constraint.date}
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
                      <Tooltip title="Remove">
                        <IconButton 
                          color="error" 
                          onClick={() => removeConstraint(index)}
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
        />
      )}

      {/* Add Availability Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {isRangeMode ? 'Add Availability Range' : 'Add Doctor Availability'}
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
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="availability-label">Availability</InputLabel>
                <Select
                  labelId="availability-label"
                  value={newConstraint.avail}
                  label="Availability"
                  onChange={(e) => setNewConstraint({...newConstraint, avail: e.target.value})}
                >
                  <MenuItem value="Available">Available</MenuItem>
                  <MenuItem value="Not Available">Not Available</MenuItem>
                  <MenuItem value="Day Only">Day Shift Only</MenuItem>
                  <MenuItem value="Evening Only">Evening Shift Only</MenuItem>
                  <MenuItem value="Night Only">Night Shift Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={addConstraint} variant="contained">
            {isRangeMode ? 'Add Range' : 'Add'}
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