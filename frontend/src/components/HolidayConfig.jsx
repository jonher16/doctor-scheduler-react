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
  Switch,
  FormControlLabel,
  Tabs,
  Tab
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  EventNote as EventNoteIcon,
  ViewList as ViewListIcon,
  CalendarViewMonth as CalendarViewMonthIcon
} from '@mui/icons-material';
import EnhancedCalendar from './EnhancedCalendar';
import HolidayCalendar from './HolidayCalendar';
import { useYear } from '../contexts/YearContext';
function HolidayConfig({ holidays, setHolidays }) {
  const { selectedYear } = useYear();
  const [localHolidays, setLocalHolidays] = useState(holidays);
  
  // Changed selectedDate to store either a string (single date) or an array (date range)
  const [selectedDate, setSelectedDate] = useState('');
  const [holidayType, setHolidayType] = useState('Short');
  const [openDialog, setOpenDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Add state for range mode toggle
  const [isRangeMode, setIsRangeMode] = useState(false);
  
  // Add state for view mode (table or calendar)
  const [viewMode, setViewMode] = useState('calendar'); // Default to calendar view

  // Update local state when holidays prop changes
  useEffect(() => {
    setLocalHolidays(holidays);
  }, [holidays]);

  // Handle opening the add holiday dialog
  const handleOpenDialog = () => {
    // Reset selected date when opening dialog
    setSelectedDate(isRangeMode ? [null, null] : '');
    setHolidayType('Short');
    setOpenDialog(true);
  };

  // Handle closing the dialog
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Handle date selection from calendar
  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  // Handle toggling range mode
  const handleRangeModeToggle = (event) => {
    const rangeEnabled = event.target.checked;
    setIsRangeMode(rangeEnabled);
    // Reset selected date when switching modes
    setSelectedDate(rangeEnabled ? [null, null] : '');
    // Default to "Long" holiday type when in range mode
    if (rangeEnabled) {
      setHolidayType('Long');
    }
  };

  // Handle view mode change
  const handleViewModeChange = (event, newMode) => {
    if (newMode) {
      setViewMode(newMode);
    }
  };

  // Handle adding a new holiday
  const markHoliday = () => {
    if (isRangeMode) {
      // Range mode validation
      if (!selectedDate || !Array.isArray(selectedDate) || !selectedDate[0] || !selectedDate[1]) {
        setSnackbar({
          open: true,
          message: 'Please select both start and end dates',
          severity: 'error'
        });
        return;
      }
      
      // Extract start and end dates from the range
      const [startDate, endDate] = selectedDate;
      
      // Process date range
      const newHolidays = { ...localHolidays };
      
      // Convert dates to Date objects for comparison
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Create a new date to iterate through the range
      const current = new Date(start);
      
      // Loop through each date in the range
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // Check if this date already exists as a holiday
        if (newHolidays[dateStr]) {
          // Skip this date or update it if you prefer
          current.setDate(current.getDate() + 1);
          continue;
        }
        
        // Add the date to holidays
        newHolidays[dateStr] = holidayType;
        
        // Move to next day
        current.setDate(current.getDate() + 1);
      }
      
      setLocalHolidays(newHolidays);
      setSnackbar({
        open: true,
        message: `Added ${holidayType} holidays from ${startDate} to ${endDate}`,
        severity: 'success'
      });
    } else {
      // Single date mode
      if (!selectedDate) {
        setSnackbar({
          open: true,
          message: 'Please select a date',
          severity: 'error'
        });
        return;
      }
      
      // Check if date already exists
      if (localHolidays[selectedDate]) {
        setSnackbar({
          open: true,
          message: `${selectedDate} is already marked as a holiday`,
          severity: 'warning'
        });
        return;
      }

      const newHolidays = { ...localHolidays, [selectedDate]: holidayType };
      setLocalHolidays(newHolidays);
      setSnackbar({
        open: true,
        message: `Added ${holidayType} holiday on ${selectedDate}`,
        severity: 'success'
      });
    }
    
    setOpenDialog(false);
  };

  // Handle removing a holiday
  const removeHoliday = (date) => {
    const newHolidays = { ...localHolidays };
    delete newHolidays[date];
    setLocalHolidays(newHolidays);
    setSnackbar({
      open: true,
      message: `Removed holiday on ${date}`,
      severity: 'info'
    });
  };

  // Save holidays back to parent component
  const saveHolidays = () => {
    setHolidays(localHolidays);
    setSnackbar({
      open: true,
      message: 'Holiday configuration saved successfully!',
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

  // Get color for holiday type chip
  const getHolidayTypeColor = (type) => {
    return type === 'Long' ? 'error' : 'warning';
  };

  // Convert holidays object to array for table display
  const holidaysArray = Object.entries(localHolidays).map(([date, type]) => ({
    date,
    type
  })).sort((a, b) => a.date.localeCompare(b.date));
  
  // Handle updates from the calendar view
  const handleCalendarUpdate = (updatedHolidays) => {
    setLocalHolidays(updatedHolidays);
    setSnackbar({
      open: true,
      message: 'Holiday updated. Don\'t forget to save your changes!',
      severity: 'info'
    });
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Holiday Configuration
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage hospital holidays for the year. Add important dates and specify whether they are short (1-day) or long (multi-day) holidays.
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
            value="calendar" 
            label="Calendar View" 
            icon={<CalendarViewMonthIcon />} 
            iconPosition="start"
          />
          <Tab 
            value="table" 
            label="Table View" 
            icon={<ViewListIcon />} 
            iconPosition="start"
          />
        </Tabs>

        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={saveHolidays}
          color="primary"
        >
          Save Holidays
        </Button>
      </Box>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <HolidayCalendar 
          holidays={localHolidays} 
          setHolidays={handleCalendarUpdate} 
        />
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<EventNoteIcon />}
              onClick={handleOpenDialog}
              sx={{ mr: 2 }}
            >
              Add Holiday
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.light' }}>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {holidaysArray.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      <Typography variant="body1" sx={{ py: 2 }}>
                        No holidays configured. Add a holiday to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  holidaysArray.map((holiday) => (
                    <TableRow key={holiday.date} hover>
                      <TableCell>
                        <Typography variant="body1">
                          {holiday.date}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={holiday.type} 
                          color={getHolidayTypeColor(holiday.type)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Remove">
                          <IconButton 
                            color="error" 
                            onClick={() => removeHoliday(holiday.date)}
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
        </>
      )}

      {/* Add Holiday Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {isRangeMode ? 'Add Holiday Range' : 'Add New Holiday'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
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
                value={selectedDate}
                onChange={handleDateChange}
                minDate={new Date().toISOString().split('T')[0]} // Today as min date
                isRangeMode={isRangeMode}
                initialYear={selectedYear}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="holiday-type-label">Holiday Type</InputLabel>
                <Select
                  labelId="holiday-type-label"
                  name="holidayType"
                  value={holidayType}
                  label="Holiday Type"
                  onChange={(e) => setHolidayType(e.target.value)}
                >
                  <MenuItem value="Short">Short (1 day)</MenuItem>
                  <MenuItem value="Long">Long (multi-day)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={markHoliday} variant="contained">
            Add Holiday{isRangeMode ? 's' : ''}
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

export default HolidayConfig;