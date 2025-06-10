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
  CalendarViewMonth as CalendarViewMonthIcon,
  Edit as EditIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import EnhancedCalendar from './EnhancedCalendar';
import HolidayCalendar from './HolidayCalendar';
import { useYear } from '../contexts/YearContext';
import ConfigImportExport from './ConfigImportExport';

// Constants for localStorage keys
const LAST_POPUP_HOLIDAY_MONTH_KEY = 'holidayConfig_popupLastViewedMonth';

function HolidayConfig({ 
  holidays, 
  setHolidays,
  setNavigationBlock, 
  onNavigationAfterSave, 
  onNavigationCancel, 
  pendingNavigation 
}) {
  const { selectedYear } = useYear();
  const [localHolidays, setLocalHolidays] = useState(holidays);
  const [savedHolidays, setSavedHolidays] = useState(holidays);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  
  // Changed selectedDate to store either a string (single date) or an array (date range)
  const [selectedDate, setSelectedDate] = useState('');
  const [holidayType, setHolidayType] = useState('Short');
  const [openDialog, setOpenDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Add state for range mode toggle
  const [isRangeMode, setIsRangeMode] = useState(false);
  
  // Add state for view mode (table or calendar)
  const [viewMode, setViewMode] = useState('calendar'); // Default to calendar view

  // Add state to track if we're editing an existing holiday
  const [editMode, setEditMode] = useState(false);
  const [editDates, setEditDates] = useState([]);

  // State for merged holidays in the table view
  const [mergedHolidays, setMergedHolidays] = useState([]);

  // State to remember last selected month for popup calendar
  const [lastPopupMonth, setLastPopupMonth] = useState(null);

  // Get the current month's index (0-11)
  const getCurrentMonth = () => {
    return new Date().getMonth();
  };

  // Get the next month's index (0-11)
  const getNextMonth = () => {
    return (getCurrentMonth() + 1) % 12;
  };

  // Get stored month from localStorage or use next month as fallback
  const getStoredOrNextMonth = () => {
    const savedMonth = localStorage.getItem(LAST_POPUP_HOLIDAY_MONTH_KEY);
    if (savedMonth !== null) {
      const month = parseInt(savedMonth, 10);
      if (!isNaN(month) && month >= 0 && month <= 11) {
        return month;
      }
    }
    return getNextMonth();
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

  // Load initial popup month from localStorage
  useEffect(() => {
    setLastPopupMonth(getStoredOrNextMonth());
  }, []);

  // Update local state when holidays prop changes
  useEffect(() => {
    setLocalHolidays(holidays);
    setSavedHolidays(holidays);
  }, [holidays]);

  // Check for unsaved changes when local holidays change
  useEffect(() => {
    const isDifferent = JSON.stringify(localHolidays) !== JSON.stringify(savedHolidays);
    setHasUnsavedChanges(isDifferent);
    
    // Register navigation blocking if setNavigationBlock is provided
    if (setNavigationBlock) {
      setNavigationBlock(isDifferent);
    }
  }, [localHolidays, savedHolidays, setNavigationBlock]);

  // Add page reload warning when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes in your holiday configuration. Are you sure you want to leave?';
        return 'You have unsaved changes in your holiday configuration. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Save popup month to localStorage when it changes
  const handlePopupMonthChange = (month) => {
    setLastPopupMonth(month);
    localStorage.setItem(LAST_POPUP_HOLIDAY_MONTH_KEY, month.toString());
  };

  // Handle opening the add holiday dialog
  const handleOpenDialog = () => {
    // Reset selected date when opening dialog
    setSelectedDate(isRangeMode ? [null, null] : '');
    setHolidayType('Short');
    setEditMode(false);
    setEditDates([]);
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

  // Group consecutive holidays of the same type
  useEffect(() => {
    // First filter holidays by the selected year
    const filteredHolidays = Object.entries(localHolidays)
      .filter(([date, _]) => {
        const dateYear = date.split('-')[0];
        return dateYear === selectedYear.toString();
      })
      .map(([date, type]) => ({
        date,
        type
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    const mergedArray = [];
    
    if (filteredHolidays.length === 0) {
      setMergedHolidays([]);
      return;
    }
    
    let currentGroup = {
      type: filteredHolidays[0].type,
      dates: [filteredHolidays[0].date]
    };
    
    for (let i = 1; i < filteredHolidays.length; i++) {
      const current = filteredHolidays[i];
      const lastDateInGroup = currentGroup.dates[currentGroup.dates.length - 1];
      
      // Check if this holiday is consecutive and has the same type
      if (
        current.type === currentGroup.type &&
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
          type: current.type,
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
    
    setMergedHolidays(mergedArray);
  }, [localHolidays, selectedYear]);

  // Handle editing a holiday group
  const handleEditHoliday = (index) => {
    const holidayToEdit = mergedHolidays[index];
    
    // Set the date range to edit
    const dateRange = [holidayToEdit.startDate, holidayToEdit.endDate];
    
    setSelectedDate(dateRange);
    setHolidayType(holidayToEdit.type);
    setIsRangeMode(true); // Always use range mode for editing
    setEditMode(true);
    setEditDates(holidayToEdit.dates);
    setOpenDialog(true);
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
      
      // If we're in edit mode, first remove the old dates
      if (editMode && editDates.length > 0) {
        editDates.forEach(date => {
          delete newHolidays[date];
        });
      }
      
      // Convert dates to Date objects for comparison
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Create a new date to iterate through the range
      const current = new Date(start);
      
      // Loop through each date in the range
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        
        // Check if this date already exists as a holiday (skip in edit mode)
        if (!editMode && newHolidays[dateStr]) {
          // Skip this date
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
        message: editMode 
          ? `Updated ${holidayType} holidays from ${startDate} to ${endDate}`
          : `Added ${holidayType} holidays from ${startDate} to ${endDate}`,
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
      
      // Check if date already exists (not needed in edit mode)
      if (!editMode && localHolidays[selectedDate]) {
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
        message: editMode 
          ? `Updated ${holidayType} holiday on ${selectedDate}`
          : `Added ${holidayType} holiday on ${selectedDate}`,
        severity: 'success'
      });
    }
    
    setOpenDialog(false);
  };

  // Handle removing a holiday
  const removeHoliday = (dates) => {
    const newHolidays = { ...localHolidays };
    
    // Remove all dates in the group
    if (Array.isArray(dates)) {
      dates.forEach(date => {
        delete newHolidays[date];
      });
    } else {
      delete newHolidays[dates];
    }
    
    setLocalHolidays(newHolidays);
    setSnackbar({
      open: true,
      message: Array.isArray(dates) && dates.length > 1
        ? `Removed ${dates.length} holiday dates`
        : `Removed holiday on ${Array.isArray(dates) ? dates[0] : dates}`,
      severity: 'info'
    });
  };

  // Save holidays back to parent component
  const saveHolidays = () => {
    setHolidays(localHolidays);
    setSavedHolidays(localHolidays);
    setHasUnsavedChanges(false);
    
    // Clear navigation blocking
    if (setNavigationBlock) {
      setNavigationBlock(false);
    }
    
    // Handle pending navigation
    if (onNavigationAfterSave && pendingNavigation) {
      onNavigationAfterSave();
    }
    
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

  // Handle discarding changes
  const handleDiscardChanges = () => {
    setLocalHolidays(savedHolidays);
    setHasUnsavedChanges(false);
    
    // Clear navigation blocking
    if (setNavigationBlock) {
      setNavigationBlock(false);
    }
    
    // Handle pending navigation
    if (onNavigationAfterSave && pendingNavigation) {
      onNavigationAfterSave();
    }
    
    setSnackbar({
      open: true,
      message: 'Changes discarded',
      severity: 'info'
    });
  };

  const handleSaveAndContinue = () => {
    saveHolidays();
    setShowUnsavedWarning(false);
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
          variant="scrollable"
          scrollButtons={false}
          allowScrollButtonsMobile
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTabs-scrollButtons': {
              opacity: 0.6,
              '&.Mui-disabled': {
                opacity: 0,
              },
            },
            '& .MuiTab-root': {
              minHeight: '64px',
              textTransform: 'none',
              fontSize: '0.9rem',
              transition: 'all 0.2s ease-in-out',
              px: 2,
              mx: 0.3,
              borderRadius: '8px 8px 0 0',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                color: 'primary.main',
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
                '& .MuiSvgIcon-root': {
                  transform: 'scale(1.1)',
                  color: 'primary.main',
                }
              },
              '&.Mui-selected': {
                fontWeight: 'bold',
                '& .MuiSvgIcon-root': {
                  color: 'primary.main',
                }
              },
              '&:focus': {
                outline: 'none'
              },
              '&.Mui-focusVisible': {
                backgroundColor: 'rgba(25, 118, 210, 0.12)',
                outline: 'none',
                boxShadow: 'inset 0px 0px 0px 1px rgba(25, 118, 210, 0.5)'
              }
            },
            '& .MuiTab-iconWrapper': {
              transition: 'transform 0.2s ease-in-out',
              marginRight: 1
            }
          }}
          TabIndicatorProps={{
            style: {
              height: '3px',
              borderRadius: '3px 3px 0 0',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }
          }}
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

        <Box>
          {hasUnsavedChanges && (
            <Chip
              label="Draft - Unsaved Changes"
              color="warning"
              size="small"
              icon={<WarningIcon />}
              sx={{ 
                fontWeight: 'bold',
                mr: 2
              }}
            />
          )}
          {hasUnsavedChanges && (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDiscardChanges}
              sx={{ mr: 2 }}
            >
              Discard Changes
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<EventNoteIcon />}
            onClick={handleOpenDialog}
            sx={{ mr: 2 }}
            color="error"
          >
            Add Holiday
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={saveHolidays}
            color="primary"
            sx={hasUnsavedChanges ? { 
              fontWeight: 'bold',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.7 },
                '100%': { opacity: 1 }
              }
            } : {}}
          >
            Save Holidays
          </Button>
        </Box>
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
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="subtitle2">Date Range</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Type</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Actions</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mergedHolidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No holidays configured. Add a holiday to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                mergedHolidays.map((holiday, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body1">
                        {holiday.startDate === holiday.endDate 
                          ? holiday.startDate 
                          : `${holiday.startDate} to ${holiday.endDate} (${holiday.dates.length} days)`}
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
                      <Tooltip title="Edit">
                        <IconButton 
                          color="primary" 
                          onClick={() => handleEditHoliday(index)}
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton 
                          color="error" 
                          onClick={() => removeHoliday(holiday.dates)}
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

      {/* Add Holiday Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editMode 
            ? 'Edit Holiday' 
            : (isRangeMode ? 'Add Holiday Range' : 'Add New Holiday')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {!editMode && (
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
                value={selectedDate}
                onChange={handleDateChange}
                isRangeMode={isRangeMode || editMode}
                initialYear={selectedYear}
                initialMonth={
                  editMode && Array.isArray(selectedDate) && selectedDate[0]
                    ? getMonthFromDateString(selectedDate[0])
                    : isRangeMode && Array.isArray(selectedDate) && selectedDate[0]
                      ? getMonthFromDateString(selectedDate[0])
                      : typeof selectedDate === 'string' && selectedDate
                        ? getMonthFromDateString(selectedDate)
                        : lastPopupMonth || getNextMonth()
                }
                onMonthChange={handlePopupMonthChange}
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
            {editMode ? 'Update Holiday' : `Add Holiday${isRangeMode ? 's' : ''}`}
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

      {/* Unsaved Changes Warning Dialog */}
      <Dialog open={showUnsavedWarning || !!pendingNavigation} onClose={() => {
        setShowUnsavedWarning(false);
        if (onNavigationCancel) onNavigationCancel();
      }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          Unsaved Changes
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            {pendingNavigation 
              ? 'You have unsaved changes in your holiday configuration. What would you like to do before navigating away?'
              : 'You have unsaved changes in your holiday configuration. What would you like to do?'
            }
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Save Changes: Keep your modifications and save them
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Discard Changes: Revert to the last saved configuration
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setShowUnsavedWarning(false);
            if (onNavigationCancel) onNavigationCancel();
          }} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDiscardChanges} color="error" variant="outlined">
            Discard Changes
          </Button>
          <Button onClick={handleSaveAndContinue} color="primary" variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add ConfigImportExport component */}
      <ConfigImportExport 
        doctors={[]} 
        setDoctors={() => {}} 
        holidays={localHolidays} 
        setHolidays={setLocalHolidays}
        availability={{}} 
        setAvailability={() => {}}
      />
    </Box>
  );
}

export default HolidayConfig;