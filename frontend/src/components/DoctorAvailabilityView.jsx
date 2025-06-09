import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Chip,
  Alert,
  Divider,
  CircularProgress,
  Card,
  CardContent,
  IconButton,
  useTheme,
  Tooltip,
  Snackbar
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  KeyboardArrowRight as RightIcon,
  KeyboardArrowLeft as LeftIcon,
  CalendarMonth as CalendarIcon,
  Person as PersonIcon,
  Check as CheckIcon,
  Clear as ClearIcon,
  Warning as WarningIcon,
  Sync as SyncIcon
} from '@mui/icons-material';

const DoctorAvailabilityView = ({ doctorName, onBack, availability, initialMonth, initialYear, onSyncAvailability, isLoading }) => {
  const theme = useTheme();
  
  // Initialize with the month/year passed from sync page, or fall back to current date
  const [month, setMonth] = useState(initialMonth || new Date().getMonth() + 1);
  const [year, setYear] = useState(initialYear || 2025);
  const [loading, setLoading] = useState(false);
  const [doctorAvailability, setDoctorAvailability] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  // Load doctor's availability data from Firebase (via the availability prop)
  useEffect(() => {
    const loadDoctorAvailability = () => {
      if (availability && availability[doctorName]) {
        // Filter the availability data for the current month/year
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        const filteredAvailability = {};
        
        Object.keys(availability[doctorName]).forEach(dateKey => {
          if (dateKey.startsWith(monthPrefix)) {
            filteredAvailability[dateKey] = availability[doctorName][dateKey];
          }
        });
        
        setDoctorAvailability(filteredAvailability);
        console.log(`Loaded availability for ${doctorName} in ${monthPrefix}:`, filteredAvailability);
      } else {
        setDoctorAvailability({});
        console.log(`No availability data found for ${doctorName}`);
      }
    };
    
    loadDoctorAvailability();
  }, [doctorName, availability, month, year]);

  // Handle sync availability
  const handleSyncAvailability = async () => {
    if (onSyncAvailability) {
      setSyncing(true);
      try {
        await onSyncAvailability();
        setNotification({
          open: true,
          message: 'Availability data synced successfully!',
          severity: 'success'
        });
      } catch (error) {
        console.error('Error syncing availability:', error);
        setNotification({
          open: true,
          message: 'Failed to sync availability data. Please try again.',
          severity: 'error'
        });
      } finally {
        setSyncing(false);
      }
    }
  };

  // Handle notification close
  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // Helper to parse status string into a set of unavailable shifts
  const getUnavailableShiftsSet = (statusString) => {
    if (!statusString || statusString === "Available") {
      return new Set();
    }
    if (statusString === "Not Available") {
      return new Set(['Day', 'Evening', 'Night']);
    }
    if (statusString.startsWith("Not Available: ")) {
      const shifts = statusString.substring("Not Available: ".length).split(', ');
      return new Set(shifts);
    }
    return new Set();
  };

  // Helper function to go to previous month/year
  const handlePrevMonth = () => {
    if (month > 1) {
      setMonth(month - 1);
    } else {
      setMonth(12);
      setYear(year - 1);
    }
  };

  // Helper function to go to next month/year
  const handleNextMonth = () => {
    if (month < 12) {
      setMonth(month + 1);
    } else {
      setMonth(1);
      setYear(year + 1);
    }
  };

  // Generate calendar dates for the selected month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  // Function to get the first day of the month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month - 1, 1).getDay();
  };

  // Function to organize dates into calendar weeks
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Create array for all calendar cells
    const days = [];
    
    // Add empty cells for days before the 1st of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push(dateStr);
    }
    
    // Organize into weeks
    const weeks = [];
    let week = [];
    
    days.forEach((day, index) => {
      week.push(day);
      if (index % 7 === 6 || index === days.length - 1) {
        // Fill remaining cells in last week
        while (week.length < 7) {
          week.push(null);
        }
        weeks.push(week);
        week = [];
      }
    });
    
    return weeks;
  };

  // Helper to get month name
  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  const isWeekend = (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday
  };

  // Get the display status for a date
  const getDisplayStatus = (date) => {
    if (doctorAvailability[date]) {
      return doctorAvailability[date];
    }
    return "Available"; // Default to "Available"
  };

  // Update status color helper
  const getStatusColor = (status) => {
    if (status === 'Available') return 'success';
    if (status === 'Not Available') return 'error';
    if (status && status.startsWith('Not Available: ')) return 'warning';
    return 'default';
  };

  const getStatusBackground = (status) => {
    if (status === 'Available') return 'rgba(46, 125, 50, 0.08)';
    if (status === 'Not Available') return 'rgba(244, 67, 54, 0.08)';
    if (status && status.startsWith('Not Available: ')) return 'rgba(255, 152, 0, 0.08)';
    return 'transparent';
  };

  // Generate array of years for selection
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 10;
    
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }
    return years;
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Header with back button and sync button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={onBack}
            variant="outlined"
            sx={{ mr: 2 }}
          >
            Back to Sync
          </Button>
          <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h5" component="h1">
            {doctorName}'s Availability Calendar
          </Typography>
        </Box>
        
        <Tooltip title="Sync latest availability data">
          <Button
            variant="contained"
            color="primary"
            startIcon={syncing || isLoading ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
            onClick={handleSyncAvailability}
            disabled={syncing || isLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            {syncing || isLoading ? 'Syncing...' : 'Sync Data'}
          </Button>
        </Tooltip>
      </Box>
      
      <Card sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <IconButton
                  onClick={handlePrevMonth}
                  aria-label="previous month"
                  size="small"
                >
                  <LeftIcon />
                </IconButton>
                
                <Box sx={{ display: 'flex', flexGrow: 1 }}>
                  {/* Month Select */}
                  <FormControl size="small" sx={{ minWidth: 130, mr: 1 }}>
                    <InputLabel id="month-select-label">Month</InputLabel>
                    <Select
                      labelId="month-select-label"
                      value={month}
                      label="Month"
                      onChange={(e) => setMonth(e.target.value)}
                      disabled={loading}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <MenuItem key={m} value={m}>
                          {getMonthName(m)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  {/* Year Select */}
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel id="year-select-label">Year</InputLabel>
                    <Select
                      labelId="year-select-label"
                      value={year}
                      label="Year"
                      onChange={(e) => setYear(e.target.value)}
                      disabled={loading}
                    >
                      {generateYearOptions().map((y) => (
                        <MenuItem key={y} value={y}>
                          {y}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                
                <IconButton
                  onClick={handleNextMonth}
                  aria-label="next month"
                  size="small"
                >
                  <RightIcon />
                </IconButton>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={4} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                <Typography variant="caption">
                  Read-only view of {doctorName}'s availability. Click "Sync Data" for latest updates.
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Main Calendar Card */}
      <Card sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          {/* Calendar Controls */}
          <Box sx={{ mb: 2, pb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle2" gutterBottom>
              <CalendarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              {getMonthName(month)} {year} - Availability Calendar
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Viewing availability settings for {doctorName}. Days show as 'Available' by default unless marked otherwise.
            </Typography>
          </Box>
          
          {/* Calendar */}
          <Box sx={{ position: 'relative' }}>
            {/* Loading overlay during sync */}
            {(syncing || isLoading) && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  bgcolor: 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  borderRadius: 1
                }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <CircularProgress size={40} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Syncing availability data...
                  </Typography>
                </Box>
              </Box>
            )}
            
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={50} />
              </Box>
            ) : (
              <Box>
                {/* Show notice if no availability data found */}
                {Object.keys(doctorAvailability).length === 0 && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2">
                      No specific availability settings found for {doctorName} in {getMonthName(month)} {year}. 
                      All days will show as "Available" (default status).
                    </Typography>
                  </Alert>
                )}
                
                {/* Calendar Header with Days of Week */}
                <Grid container sx={{ mb: 1 }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <Grid item xs={12/7} key={day}>
                      <Typography 
                        variant="subtitle2"
                        align="center"
                        sx={{ 
                          fontWeight: 500,
                          py: 0.5,
                          color: (index === 0 || index === 6) ? 'error.main' : 'text.primary',
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        }}
                      >
                        {day}
                      </Typography>
                    </Grid>
                  ))}
                </Grid>
                
                {/* Calendar Grid */}
                {generateCalendarDays().map((week, weekIndex) => (
                  <Grid container key={`week-${weekIndex}`} sx={{ mb: 0.5 }}>
                    {week.map((date, dayIndex) => {
                      if (!date) {
                        // Empty cell
                        return (
                          <Grid item xs={12/7} key={`empty-${weekIndex}-${dayIndex}`} sx={{ px: 0.25 }}>
                            <Box
                              sx={{
                                height: 120,
                                bgcolor: 'rgba(0, 0, 0, 0.03)',
                                borderRadius: 1,
                                border: '1px dashed rgba(0, 0, 0, 0.08)'
                              }}
                            />
                          </Grid>
                        );
                      }
                      
                      const day = date.split('-')[2];
                      const currentFullStatus = getDisplayStatus(date);
                      const unavailableShifts = getUnavailableShiftsSet(currentFullStatus);
                      const isWeekendDay = isWeekend(date);
                      
                      return (
                        <Grid item xs={12/7} key={date} sx={{ p: 0.25 }}>
                          <Box
                            sx={{
                              minHeight: 110,
                              p: 0.5,
                              position: 'relative',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'rgba(0, 0, 0, 0.1)',
                              bgcolor: getStatusBackground(currentFullStatus),
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <Typography 
                                variant="body2"
                                sx={{ 
                                  fontWeight: 'bold',
                                  color: isWeekendDay ? 'error.main' : 'text.primary',
                                  pl: 0.5
                                }}
                              >
                                {day}
                              </Typography>
                              
                              {isWeekendDay && (
                                <Chip
                                  label="W"
                                  size="small"
                                  sx={{ 
                                    height: 14,
                                    fontSize: '0.55rem',
                                    px: 0.5,
                                    mr: 0.5,
                                    color: 'error.main',
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: 'error.light'
                                  }}
                                />
                              )}
                            </Box>
                            
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', p: '0 4px' }}>
                              {/* Show overall status */}
                              <Box sx={{ width: '100%', mb: 1 }}>
                                <Chip
                                  label={currentFullStatus === 'Available' ? 'Available' : 
                                         currentFullStatus === 'Not Available' ? 'Not Available' :
                                         'Partial'}
                                  size="small"
                                  color={getStatusColor(currentFullStatus)}
                                  sx={{ 
                                    fontSize: '0.6rem',
                                    height: 18,
                                    width: '100%'
                                  }}
                                />
                              </Box>
                              
                              {/* Show individual shift status */}
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: '100%' }}>
                                {['Day', 'Evening', 'Night'].map((shift) => (
                                  <Box 
                                    key={shift}
                                    sx={{ 
                                      display: 'flex', 
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      fontSize: '0.7rem'
                                    }}
                                  >
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                                      {shift}
                                    </Typography>
                                    {unavailableShifts.has(shift) ? (
                                      <ClearIcon sx={{ fontSize: 12, color: 'error.main' }} />
                                    ) : (
                                      <CheckIcon sx={{ fontSize: 12, color: 'success.main' }} />
                                    )}
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                ))}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      
      {/* Legend Card */}
      <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Status Legend
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          
          <Grid container spacing={1}>
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: 'rgba(46, 125, 50, 0.08)', 
                border: '1px solid #4caf50',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Available" color="success" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">Available for all shifts</Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: 'rgba(244, 67, 54, 0.08)', 
                border: '1px solid #f44336',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Not Available" color="error" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">Not available for any shifts</Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: 'rgba(255, 152, 0, 0.08)', 
                border: '1px solid #ff9800',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Partially Available" color="warning" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">Not available for specific shifts</Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DoctorAvailabilityView; 