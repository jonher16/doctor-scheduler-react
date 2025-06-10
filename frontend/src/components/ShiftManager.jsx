import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  IconButton,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Snackbar,
  Alert,
  Divider,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  ButtonGroup
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
  RestartAlt as ResetIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

import { monthNames, dayNames } from '../utils/dateUtils';
import { useYear } from '../contexts/YearContext';

// Default shift requirements
const DEFAULT_REQUIREMENTS = {
  "Day": 2,
  "Evening": 1,
  "Night": 2
};

// Constants for localStorage keys
const LAST_VIEWED_SHIFT_MONTH_KEY = 'shiftManager_lastViewedMonth';

function ShiftManager({ 
  setNavigationBlock, 
  onNavigationAfterSave, 
  onNavigationCancel, 
  pendingNavigation 
}) {
  const { selectedYear } = useYear();
  
  // Get the last viewed month from localStorage or default to current month
  const getInitialMonth = () => {
    const savedMonth = localStorage.getItem(LAST_VIEWED_SHIFT_MONTH_KEY);
    if (savedMonth !== null) {
      const month = parseInt(savedMonth, 10);
      if (!isNaN(month) && month >= 0 && month <= 11) {
        return month;
      }
    }
    return new Date().getMonth();
  };
  
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);
  const [calendarDays, setCalendarDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [shiftTemplate, setShiftTemplate] = useState({});
  const [savedShiftTemplate, setSavedShiftTemplate] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  
  // Bulk operations dialog
  const [bulkDialog, setBulkDialog] = useState({
    open: false,
    operation: 'set', // 'set', 'add', 'remove'
    shiftType: 'Day',
    dayOfWeek: 1, // Monday = 1, Sunday = 0
    slotCount: 2
  });
  
  // Shift edit dialog
  const [shiftDialog, setShiftDialog] = useState({
    open: false,
    date: '',
    shift: '',
    slotCount: 0
  });
  
  // Notification snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Save current month to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(LAST_VIEWED_SHIFT_MONTH_KEY, currentMonth.toString());
  }, [currentMonth]);

  // Check for unsaved changes when shift template changes
  useEffect(() => {
    const isDifferent = JSON.stringify(shiftTemplate) !== JSON.stringify(savedShiftTemplate);
    console.log('Change detection:', {
      isDifferent,
      shiftTemplateKeys: Object.keys(shiftTemplate).length,
      savedShiftTemplateKeys: Object.keys(savedShiftTemplate).length,
      shiftTemplateStr: JSON.stringify(shiftTemplate).substring(0, 100) + '...',
      savedShiftTemplateStr: JSON.stringify(savedShiftTemplate).substring(0, 100) + '...'
    });
    
    setHasUnsavedChanges(isDifferent);
    
    // Register navigation blocking if setNavigationBlock is provided
    if (setNavigationBlock) {
      setNavigationBlock(isDifferent);
    }
  }, [shiftTemplate, savedShiftTemplate, setNavigationBlock]);

  // Add page reload warning when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes in your shift template. Are you sure you want to leave?';
        return 'You have unsaved changes in your shift template. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Initialize template with default shifts when component mounts
  useEffect(() => {
    // Try to load existing template first
    try {
      const storedTemplate = localStorage.getItem('shiftTemplate');
      if (storedTemplate) {
        const template = JSON.parse(storedTemplate);
        // Ensure the template has all dates for the current month
        const normalizedTemplate = ensureMonthTemplate(template);
        setShiftTemplate(normalizedTemplate);
        setSavedShiftTemplate(normalizedTemplate);
      } else {
        // If no stored template, create default template for the current month
        initializeDefaultTemplate();
      }
    } catch (error) {
      console.error('Error loading shift template:', error);
      // Initialize default template as fallback
      initializeDefaultTemplate();
    }
  }, [selectedYear, currentMonth]);

  // Ensure template has all dates for the current month
  const ensureMonthTemplate = (template) => {
    const normalizedTemplate = { ...template };
    const year = selectedYear;
    const month = currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Create default shifts for each date that doesn't exist
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!normalizedTemplate[date]) {
        normalizedTemplate[date] = createDefaultShifts();
      }
    }
    
    return normalizedTemplate;
  };

  // Generate days for the current month view
  useEffect(() => {
    generateCalendarDays();
  }, [currentMonth, selectedYear, shiftTemplate]);

  const generateCalendarDays = () => {
    const year = selectedYear;
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
        date: null
      });
    }
    
    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      // Get shifts for this date from the template
      const dateShifts = shiftTemplate[date] || createDefaultShifts();
      
      days.push({ 
        day: i, 
        month, 
        year, 
        empty: false,
        date,
        shifts: dateShifts
      });
    }
    
    setCalendarDays(days);
  };

  // Initialize default template for the current month (used only on initial load)
  const initializeDefaultTemplate = () => {
    const defaultTemplate = {};
    
    // Get all dates in the current month
    const year = selectedYear;
    const month = currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Create default shifts for each date
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      defaultTemplate[date] = createDefaultShifts();
    }
    
    // For initial load, both templates should be the same (no unsaved changes)
    setShiftTemplate(defaultTemplate);
    setSavedShiftTemplate(defaultTemplate);
  };
  
  // Create default shifts for a date
  const createDefaultShifts = () => {
    return {
      "Day": { slots: DEFAULT_REQUIREMENTS["Day"] },
      "Evening": { slots: DEFAULT_REQUIREMENTS["Evening"] },
      "Night": { slots: DEFAULT_REQUIREMENTS["Night"] }
    };
  };

  // Navigate to previous month
  const prevMonth = () => {
    let newMonth, newYear = selectedYear;
    if (currentMonth === 0) {
      newMonth = 11;
      // Note: We don't change year for month navigation within the selected year
    } else {
      newMonth = currentMonth - 1;
    }
    setCurrentMonth(newMonth);
    
    // Normalize template for the new month
    const normalizedTemplate = ensureMonthTemplate(shiftTemplate);
    if (JSON.stringify(normalizedTemplate) !== JSON.stringify(shiftTemplate)) {
      setShiftTemplate(normalizedTemplate);
    }
  };

  // Navigate to next month
  const nextMonth = () => {
    let newMonth, newYear = selectedYear;
    if (currentMonth === 11) {
      newMonth = 0;
      // Note: We don't change year for month navigation within the selected year
    } else {
      newMonth = currentMonth + 1;
    }
    setCurrentMonth(newMonth);
    
    // Normalize template for the new month
    const normalizedTemplate = ensureMonthTemplate(shiftTemplate);
    if (JSON.stringify(normalizedTemplate) !== JSON.stringify(shiftTemplate)) {
      setShiftTemplate(normalizedTemplate);
    }
  };

  // Handle click on a day to view/edit shifts
  const handleDayClick = (dayObj) => {
    if (dayObj.empty) return;
    setSelectedDay(dayObj);
  };

  // Handle opening the shift edit dialog
  const handleOpenShiftDialog = (date, shift) => {
    // Get current slot count or default
    const shiftData = shiftTemplate[date]?.[shift];
    const slotCount = shiftData ? shiftData.slots : DEFAULT_REQUIREMENTS[shift];
    
    setShiftDialog({
      open: true,
      date,
      shift,
      slotCount
    });
  };
  
  // Handle closing the shift dialog
  const handleCloseShiftDialog = () => {
    setShiftDialog(prev => ({...prev, open: false}));
  };
  
  // Handle saving the shift changes
  const handleSaveShift = () => {
    const { date, shift, slotCount } = shiftDialog;
    const updatedTemplate = { ...shiftTemplate };
    
    // Create date entry if it doesn't exist
    if (!updatedTemplate[date]) {
      updatedTemplate[date] = createDefaultShifts();
    }
    
    // Update slot count or remove shift if slotCount is 0
    if (slotCount === 0) {
      // Remove shift if no slots
      if (updatedTemplate[date][shift]) {
        delete updatedTemplate[date][shift];
      }
      
      // If no shifts left for this date, remove the date
      if (Object.keys(updatedTemplate[date]).length === 0) {
        delete updatedTemplate[date];
      }
      
      setSnackbar({
        open: true,
        message: `Removed ${shift} shift for ${date}`,
        severity: 'info'
      });
    } else {
      // Update slot count
      updatedTemplate[date][shift] = { slots: slotCount };
      
      setSnackbar({
        open: true,
        message: `Updated ${shift} shift for ${date} to ${slotCount} slots`,
        severity: 'success'
      });
    }
    
    setShiftTemplate(updatedTemplate);
    handleCloseShiftDialog();
    
    // Update selected day to reflect changes
    if (selectedDay && selectedDay.date === date) {
      setSelectedDay({
        ...selectedDay,
        shifts: updatedTemplate[date] || {}
      });
    }
  };

  // Open dialog for bulk operations
  const handleOpenBulkDialog = () => {
    setBulkDialog({
      ...bulkDialog,
      open: true
    });
  };

  // Close bulk operations dialog
  const handleCloseBulkDialog = () => {
    setBulkDialog({
      ...bulkDialog,
      open: false
    });
  };

  // Execute bulk operation
  const handleExecuteBulkOperation = () => {
    const { operation, shiftType, dayOfWeek, slotCount } = bulkDialog;
    const updatedTemplate = { ...shiftTemplate };
    let operationCount = 0;
    
    // Get all dates in the current month
    const year = selectedYear;
    const month = currentMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      // Create date string and check if it's the selected day of week
      const date = new Date(year, month, day);
      if (date.getDay() === dayOfWeek) {
        // Format date as YYYY-MM-DD
        const dateStr = date.toISOString().split('T')[0];
        
        // Create date entry if it doesn't exist
        if (!updatedTemplate[dateStr]) {
          updatedTemplate[dateStr] = createDefaultShifts();
        }
        
        switch (operation) {
          case 'set':
            // Set exact slot count
            if (slotCount === 0) {
              // Remove shift if setting to 0
              if (updatedTemplate[dateStr][shiftType]) {
                delete updatedTemplate[dateStr][shiftType];
                
                // If no shifts left for this date, remove the date
                if (Object.keys(updatedTemplate[dateStr]).length === 0) {
                  delete updatedTemplate[dateStr];
                }
              }
            } else {
              // Set to specified slots
              updatedTemplate[dateStr][shiftType] = { slots: slotCount };
            }
            operationCount++;
            break;
            
          case 'add':
            // Add to existing slot count
            const currentSlots = updatedTemplate[dateStr][shiftType]?.slots || 0;
            updatedTemplate[dateStr][shiftType] = { slots: currentSlots + slotCount };
            operationCount++;
            break;
            
          case 'remove':
            // Decrease slot count or remove
            const existingSlots = updatedTemplate[dateStr][shiftType]?.slots || 0;
            const newSlots = Math.max(0, existingSlots - slotCount);
            
            if (newSlots === 0) {
              // Remove shift if no slots left
              if (updatedTemplate[dateStr][shiftType]) {
                delete updatedTemplate[dateStr][shiftType];
                
                // If no shifts left for this date, remove the date
                if (Object.keys(updatedTemplate[dateStr]).length === 0) {
                  delete updatedTemplate[dateStr];
                }
              }
            } else {
              // Update to reduced slots
              updatedTemplate[dateStr][shiftType] = { slots: newSlots };
            }
            operationCount++;
            break;
        }
      }
    }
    
    setShiftTemplate(updatedTemplate);
    handleCloseBulkDialog();
    
    setSnackbar({
      open: true,
      message: `Bulk operation completed: ${operationCount} shifts affected`,
      severity: 'success'
    });
  };

  // Save changes to localStorage
  const saveTemplate = () => {
    try {
      localStorage.setItem('shiftTemplate', JSON.stringify(shiftTemplate));
      setSavedShiftTemplate(shiftTemplate);
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
        message: 'Shift template saved successfully!',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error saving shift template:', error);
      
      setSnackbar({
        open: true,
        message: 'Error saving shift template',
        severity: 'error'
      });
    }
  };

  // Handle closing snackbar
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({...snackbar, open: false});
  };

  // Handle unsaved warning dialog actions
  const handleDiscardChanges = () => {
    setShiftTemplate(savedShiftTemplate);
    setHasUnsavedChanges(false);
    setShowUnsavedWarning(false);
    
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
    saveTemplate();
    setShowUnsavedWarning(false);
  };

  // Get color based on shift type
  const getShiftColor = (shift) => {
    switch(shift) {
      case 'Day':
        return '#4caf50'; // Green
      case 'Evening':
        return '#2196f3'; // Blue
      case 'Night':
        return '#9c27b0'; // Purple
      default:
        return '#757575'; // Grey
    }
  };

  // Reset current month to defaults
  const resetMonthTemplate = () => {
    const confirmMessage = hasUnsavedChanges 
      ? `Are you sure you want to reset all shifts for ${monthNames[currentMonth]} ${selectedYear} to default requirements?\n\nWARNING: This will discard your current unsaved changes!`
      : `Are you sure you want to reset all shifts for ${monthNames[currentMonth]} ${selectedYear} to default requirements?`;
      
    if (window.confirm(confirmMessage)) {
      const defaultTemplate = {};
      
      // Get all dates in the current month
      const year = selectedYear;
      const month = currentMonth;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // Create default shifts for each date
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        defaultTemplate[date] = createDefaultShifts();
      }
      
      // Save the reset template immediately
      try {
        localStorage.setItem('shiftTemplate', JSON.stringify(defaultTemplate));
        setShiftTemplate(defaultTemplate);
        setSavedShiftTemplate(defaultTemplate);
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
          message: `Reset and saved all shifts for ${monthNames[currentMonth]} to default requirements`,
          severity: 'success'
        });
      } catch (error) {
        console.error('Error saving reset template:', error);
        setSnackbar({
          open: true,
          message: 'Error saving reset template',
          severity: 'error'
        });
      }
    }
  };

  // Quick adjust shift slots (used in the calendar view)
  const quickAdjustSlots = (date, shift, adjustment) => {
    console.log(`quickAdjustSlots called: ${date}, ${shift}, ${adjustment}`);
    
    const updatedTemplate = { ...shiftTemplate };
    
    // Ensure the date exists in the template
    if (!updatedTemplate[date]) {
      updatedTemplate[date] = createDefaultShifts();
    } else {
      // Make a deep copy of the date's shifts
      updatedTemplate[date] = { ...updatedTemplate[date] };
    }
    
    // Get current slots - if shift doesn't exist, use default
    const currentSlots = updatedTemplate[date][shift]?.slots || DEFAULT_REQUIREMENTS[shift];
    const newSlots = Math.max(0, currentSlots + adjustment);
    
    console.log(`Current slots: ${currentSlots}, New slots: ${newSlots}`);
    
    if (newSlots === 0) {
      // Remove shift if no slots
      if (updatedTemplate[date][shift]) {
        delete updatedTemplate[date][shift];
      }
      
      // If no shifts left for this date, remove the date
      if (Object.keys(updatedTemplate[date]).length === 0) {
        delete updatedTemplate[date];
      }
    } else {
      // Update slots
      updatedTemplate[date][shift] = { slots: newSlots };
    }
    
    console.log('Setting updated template:', JSON.stringify(updatedTemplate) !== JSON.stringify(shiftTemplate));
    setShiftTemplate(updatedTemplate);
    
    // Update selected day to reflect changes
    if (selectedDay && selectedDay.date === date) {
      setSelectedDay({
        ...selectedDay,
        shifts: updatedTemplate[date] || {}
      });
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Shift Manager
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage doctor slots for each shift. Adjust the number of doctors needed for each shift or remove shifts completely. The optimizer will assign doctors according to this template.
        </Typography>
      </Box>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={handleOpenBulkDialog}
        >
          Bulk Operations
        </Button>
        
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          {hasUnsavedChanges && (
            <Chip
              label="Draft - Unsaved Changes"
              color="warning"
              size="small"
              icon={<WarningIcon />}
              sx={{ 
                fontWeight: 'bold'
              }}
            />
          )}
          {hasUnsavedChanges && (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDiscardChanges}
            >
              Discard Changes
            </Button>
          )}
          <Button
            variant="outlined"
            color="warning"
            startIcon={<ResetIcon />}
            onClick={resetMonthTemplate}
          >
            Reset Month
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={saveTemplate}
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
            Save Template
          </Button>
        </Stack>
      </Box>

      {/* Calendar View */}
      <Paper elevation={3} sx={{ p: 2, mb: 4 }}>
        {/* Month Navigation */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={prevMonth} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6">
            {monthNames[currentMonth]} {selectedYear}
          </Typography>
          <IconButton onClick={nextMonth} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Box>
        
        {/* Day Names Header */}
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
        
        {/* Calendar Grid */}
        <Grid container spacing={1}>
          {calendarDays.map((dayObj, index) => (
            <Grid item xs={12/7} key={index}>
              <Paper 
                elevation={dayObj.empty ? 0 : 1} 
                sx={{ 
                  height: 120, 
                  p: 1,
                  position: 'relative',
                  opacity: dayObj.empty ? 0.3 : 1,
                  cursor: dayObj.empty ? 'default' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'background.paper',
                  transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
                  '&:hover': {
                    boxShadow: dayObj.empty ? 'none' : '0 6px 12px rgba(0,0,0,0.1)',
                    backgroundColor: dayObj.empty ? 'background.paper' : 'rgba(25, 118, 210, 0.04)',
                  }
                }}
                onClick={() => !dayObj.empty && handleDayClick(dayObj)}
              >
                {!dayObj.empty && (
                  <>
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
                    
                    {/* Shifts */}
                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1 }}>
                      {['Day', 'Evening', 'Night'].map(shift => {
                        const shiftData = dayObj.shifts?.[shift];
                        const hasShift = shiftData !== undefined;
                        const slotCount = hasShift ? shiftData.slots : 0;
                        
                        return (
                          <Box 
                            key={shift}
                            sx={{ 
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 0.5,
                              py: 0.2,
                              borderRadius: 1,
                              bgcolor: hasShift ? `${getShiftColor(shift)}22` : 'transparent',
                              border: hasShift ? `1px solid ${getShiftColor(shift)}` : '1px dashed #ccc',
                            }}
                          >
                            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                              {shift}
                            </Typography>
                            
                            <Box 
                              sx={{ 
                                display: 'flex',
                                alignItems: 'center' 
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {hasShift ? (
                                <>
                                  <IconButton 
                                    size="small" 
                                    onClick={() => quickAdjustSlots(dayObj.date, shift, -1)}
                                    sx={{ p: 0.2 }}
                                  >
                                    <RemoveIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                  
                                  <Chip 
                                    size="small"
                                    label={slotCount}
                                    sx={{ 
                                      height: 18, 
                                      fontSize: '0.6rem',
                                      mx: 0.5,
                                      minWidth: 24,
                                      bgcolor: getShiftColor(shift),
                                      color: 'white'
                                    }}
                                    onClick={() => handleOpenShiftDialog(dayObj.date, shift)}
                                  />
                                  
                                  <IconButton 
                                    size="small" 
                                    onClick={() => quickAdjustSlots(dayObj.date, shift, 1)}
                                    sx={{ p: 0.2 }}
                                  >
                                    <AddIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </>
                              ) : (
                                <IconButton 
                                  size="small" 
                                  onClick={() => quickAdjustSlots(dayObj.date, shift, 1)}
                                  sx={{ p: 0.2 }}
                                >
                                  <AddIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Selected Day View */}
      {selectedDay && (
        <Card sx={{ mb: 4 }}>
          <CardHeader 
            title={`Shifts for ${selectedDay.date}`}
            subheader={`${monthNames[selectedDay.month]} ${selectedDay.day}, ${selectedDay.year}`}
          />
          <CardContent>
            <Grid container spacing={2}>
              {['Day', 'Evening', 'Night'].map(shift => {
                const shiftData = selectedDay.shifts?.[shift];
                const hasShift = shiftData !== undefined;
                const slotCount = hasShift ? shiftData.slots : 0;
                
                return (
                  <Grid item xs={12} md={4} key={shift}>
                    <Card 
                      variant="outlined"
                      sx={{ 
                        bgcolor: hasShift ? `${getShiftColor(shift)}11` : 'transparent',
                        borderColor: hasShift ? getShiftColor(shift) : 'rgba(0, 0, 0, 0.12)'
                      }}
                    >
                      <CardHeader 
                        title={`${shift} Shift`}
                        titleTypographyProps={{ variant: 'subtitle1' }}
                      />
                      <Divider />
                      <CardContent>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          {hasShift ? (
                            <>
                              <Typography variant="h6" color={getShiftColor(shift)}>
                                {slotCount} Doctor{slotCount !== 1 ? 's' : ''}
                              </Typography>
                              
                              <ButtonGroup variant="outlined">
                                <Button 
                                  onClick={() => quickAdjustSlots(selectedDay.date, shift, -1)}
                                  startIcon={<RemoveIcon />}
                                >
                                  Reduce
                                </Button>
                                <Button 
                                  onClick={() => quickAdjustSlots(selectedDay.date, shift, 1)}
                                  startIcon={<AddIcon />}
                                >
                                  Add
                                </Button>
                              </ButtonGroup>
                              
                              <Button
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={() => quickAdjustSlots(selectedDay.date, shift, -slotCount)}
                              >
                                Remove Shift
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="contained"
                              color="primary"
                              startIcon={<AddIcon />}
                              onClick={() => quickAdjustSlots(selectedDay.date, shift, DEFAULT_REQUIREMENTS[shift])}
                            >
                              Add Shift ({DEFAULT_REQUIREMENTS[shift]} doctors)
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Shift Edit Dialog */}
      <Dialog open={shiftDialog.open} onClose={handleCloseShiftDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit {shiftDialog.shift} Shift for {shiftDialog.date}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              label="Number of Doctor Slots"
              type="number"
              fullWidth
              variant="outlined"
              value={shiftDialog.slotCount}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                setShiftDialog(prev => ({
                  ...prev, 
                  slotCount: isNaN(value) ? 0 : Math.max(0, value)
                }));
              }}
              InputProps={{ inputProps: { min: 0 } }}
              helperText={shiftDialog.slotCount === 0 ? "Setting to 0 will remove this shift" : " "}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseShiftDialog}>Cancel</Button>
          <Button 
            onClick={handleSaveShift} 
            variant="contained"
            color="primary"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Operations Dialog */}
      <Dialog open={bulkDialog.open} onClose={handleCloseBulkDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Bulk Shift Operations
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Operation Settings
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Operation</InputLabel>
                  <Select
                    value={bulkDialog.operation}
                    label="Operation"
                    onChange={(e) => setBulkDialog({...bulkDialog, operation: e.target.value})}
                  >
                    <MenuItem value="set">Set Exact Count</MenuItem>
                    <MenuItem value="add">Add Slots</MenuItem>
                    <MenuItem value="remove">Remove Slots</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Number of Slots"
                  type="number"
                  fullWidth
                  value={bulkDialog.slotCount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setBulkDialog({
                      ...bulkDialog, 
                      slotCount: isNaN(value) ? 0 : Math.max(0, value)
                    });
                  }}
                  InputProps={{ inputProps: { min: 0 } }}
                  helperText={bulkDialog.operation === 'set' && bulkDialog.slotCount === 0 ? 
                    "Setting to 0 will remove these shifts" : " "}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Shift Type</InputLabel>
                  <Select
                    value={bulkDialog.shiftType}
                    label="Shift Type"
                    onChange={(e) => setBulkDialog({...bulkDialog, shiftType: e.target.value})}
                  >
                    <MenuItem value="Day">Day Shift</MenuItem>
                    <MenuItem value="Evening">Evening Shift</MenuItem>
                    <MenuItem value="Night">Night Shift</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Day of Week</InputLabel>
                  <Select
                    value={bulkDialog.dayOfWeek}
                    label="Day of Week"
                    onChange={(e) => setBulkDialog({...bulkDialog, dayOfWeek: e.target.value})}
                  >
                    <MenuItem value={0}>Sunday</MenuItem>
                    <MenuItem value={1}>Monday</MenuItem>
                    <MenuItem value={2}>Tuesday</MenuItem>
                    <MenuItem value={3}>Wednesday</MenuItem>
                    <MenuItem value={4}>Thursday</MenuItem>
                    <MenuItem value={5}>Friday</MenuItem>
                    <MenuItem value={6}>Saturday</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1, color: 'info.contrastText' }}>
              <Typography variant="body2">
                This operation will affect all {bulkDialog.shiftType} shifts on {dayNames[bulkDialog.dayOfWeek]} in the current month.
                {bulkDialog.operation === 'set' ? 
                  ` Each shift will be set to exactly ${bulkDialog.slotCount} doctor slots.` :
                  bulkDialog.operation === 'add' ?
                  ` Each shift will have ${bulkDialog.slotCount} doctor slots added.` :
                  ` Each shift will have ${bulkDialog.slotCount} doctor slots removed.`
                }
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBulkDialog}>Cancel</Button>
          <Button 
            onClick={handleExecuteBulkOperation} 
            variant="contained"
            color="primary"
          >
            Execute
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
              ? 'You have unsaved changes in your shift template. What would you like to do before navigating away?'
              : 'You have unsaved changes in your shift template. What would you like to do?'
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
    </Box>
  );
}

export default ShiftManager;