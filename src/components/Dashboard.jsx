// Updated Dashboard.jsx with Monthly Calendar View
import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Tab,
  Tabs,
  Grid,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  IconButton,
  Divider,
  Chip,
  Avatar,
  TextField,
  InputAdornment,
  MenuItem,
  Snackbar
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  Timeline as TimelineIcon,
  CalendarMonth as CalendarMonthIcon,
  Analytics as AnalyticsIcon,
  Search as SearchIcon,
  CalendarViewMonth as CalendarViewMonthIcon
} from '@mui/icons-material';
import MonthlyHours from './MonthlyHours';
import WeekendHolidayBalance from './WeekendHolidayBalance';
import YearlySchedule from './YearlySchedule';
import ScheduleStatistics from './ScheduleStatistics';
import MonthlyCalendarView from './MonthlyCalendarView';

function Dashboard({ doctors, schedule, holidays, onScheduleUpdate }) {
  const [tabValue, setTabValue] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth() + 1); // Current month (1-12)
  
  // Create local copies of the data to prevent issues when props change
  const [localDoctors, setLocalDoctors] = useState([]);
  const [localSchedule, setLocalSchedule] = useState({});
  const [localHolidays, setLocalHolidays] = useState({});
  const [hasSchedule, setHasSchedule] = useState(false);
  const [quickStats, setQuickStats] = useState(null);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Update local data when schedule is generated but not when doctors/holidays change
  useEffect(() => {
    // Only update local state when a new schedule is generated (not when doctors change)
    if (schedule && Object.keys(schedule).length > 0) {
      setLocalSchedule(schedule);
      
      // If we have a schedule, also take a snapshot of the doctors and holidays
      // that were used to generate it
      if (doctors && doctors.length > 0) {
        setLocalDoctors(JSON.parse(JSON.stringify(doctors)));
      }
      
      if (holidays && Object.keys(holidays).length > 0) {
        setLocalHolidays(JSON.parse(JSON.stringify(holidays)));
      }
      
      setHasSchedule(true);
    }
  }, [schedule, doctors, holidays]);
  
  // Recalculate quick stats when local data changes
  useEffect(() => {
    if (hasSchedule) {
      setQuickStats(getQuickStats());
    }
  }, [localSchedule, localDoctors, hasSchedule]);

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Handle schedule updates from the calendar view
  const handleScheduleUpdate = (updatedSchedule) => {
    setLocalSchedule(updatedSchedule);
    
    // Notify parent component if provided
    if (onScheduleUpdate) {
      onScheduleUpdate(updatedSchedule);
    }
    
    // Show notification
    setNotification({
      open: true,
      message: 'Schedule updated successfully',
      severity: 'success'
    });
  };
  
  const handleCloseNotification = () => {
    setNotification({...notification, open: false});
  };

  // Quick statistics
  const getQuickStats = () => {
    if (!hasSchedule || !localSchedule || Object.keys(localSchedule).length === 0 || 
        !localDoctors || localDoctors.length === 0) {
      return null;
    }
    
    // Total shifts
    let totalShifts = 0;
    // Shifts per doctor
    const doctorShifts = {};
    localDoctors.forEach(doc => { doctorShifts[doc.name] = 0 });
    
    // Calculate statistics
    Object.keys(localSchedule).forEach(date => {
      const daySchedule = localSchedule[date];
      if (!daySchedule || typeof daySchedule !== 'object') return;
      
      ["Day", "Evening", "Night"].forEach(shift => {
        const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
        totalShifts += shiftArr.length;
        
        shiftArr.forEach(name => {
          // Make sure the doctor still exists in our local copy
          if (doctorShifts.hasOwnProperty(name)) {
            doctorShifts[name] = (doctorShifts[name] || 0) + 1;
          }
        });
      });
    });
    
    // Find min and max shifts
    let minShifts = Infinity;
    let maxShifts = 0;
    let minDoctor = "";
    let maxDoctor = "";
    
    Object.entries(doctorShifts).forEach(([doctor, shifts]) => {
      if (shifts < minShifts && shifts > 0) {
        minShifts = shifts;
        minDoctor = doctor;
      }
      if (shifts > maxShifts) {
        maxShifts = shifts;
        maxDoctor = doctor;
      }
    });
    
    // Handle edge case of no shifts assigned
    if (minShifts === Infinity) minShifts = 0;
    
    // Average shifts per doctor
    const avgShifts = totalShifts / (Object.keys(doctorShifts).length || 1);
    
    return {
      totalShifts,
      avgShifts: avgShifts.toFixed(1),
      minDoctor,
      minShifts,
      maxDoctor,
      maxShifts
    };
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Schedule Dashboard
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          View and analyze the generated schedule with different visualizations and statistics.
        </Typography>
      </Box>

      {!hasSchedule ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          <AlertTitle>No Schedule Available</AlertTitle>
          No schedule has been generated yet. Please go to the Generate Schedule section to create a schedule.
        </Alert>
      ) : (
        <>
          {/* Quick Statistics Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                      <BarChartIcon />
                    </Avatar>
                    <Typography variant="h6">Schedule Overview</Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Total Shifts:</Typography>
                    <Typography variant="body1" fontWeight="bold">{quickStats?.totalShifts || 0}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Avg. Shifts per Doctor:</Typography>
                    <Typography variant="body1" fontWeight="bold">{quickStats?.avgShifts || '0.0'}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Doctors Scheduled:</Typography>
                    <Typography variant="body1" fontWeight="bold">{localDoctors.length}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                      <TimelineIcon />
                    </Avatar>
                    <Typography variant="h6">Distribution</Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Highest Workload:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Chip 
                        size="small" 
                        label={`${quickStats?.maxShifts || 0} shifts`} 
                        color="primary"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="body2">{quickStats?.maxDoctor || 'N/A'}</Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Lowest Workload:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Chip 
                        size="small" 
                        label={`${quickStats?.minShifts || 0} shifts`} 
                        color="secondary"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="body2">{quickStats?.minDoctor || 'N/A'}</Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Variance:</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {quickStats ? (quickStats.maxShifts - quickStats.minShifts) : 0} shifts
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                      <CalendarMonthIcon />
                    </Avatar>
                    <Typography variant="h6">Time Period</Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Period:</Typography>
                    <Typography variant="body1" fontWeight="bold">January - December 2025</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Days Covered:</Typography>
                    <Typography variant="body1" fontWeight="bold">365</Typography>
                  </Box>
                  
                  <Box sx={{ mt: 2 }}>
                    <TextField
                      select
                      label="View Month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      fullWidth
                      variant="outlined"
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const months = [
                          'January', 'February', 'March', 'April', 
                          'May', 'June', 'July', 'August', 
                          'September', 'October', 'November', 'December'
                        ];
                        return (
                          <MenuItem key={m} value={m}>
                            {months[m-1]}
                          </MenuItem>
                        );
                      })}
                    </TextField>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Dashboard Tabs */}
          <Paper sx={{ mb: 4 }}>
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTab-root': {
                  minHeight: '64px',
                  textTransform: 'none',
                  fontSize: '0.9rem',
                }
              }}
            >
              <Tab 
                icon={<CalendarViewMonthIcon />} 
                label="Monthly Calendar" 
                iconPosition="start" 
              />
              <Tab 
                icon={<BarChartIcon />} 
                label="Monthly Hours" 
                iconPosition="start" 
              />
              <Tab 
                icon={<TimelineIcon />} 
                label="Weekend/Holiday Balance" 
                iconPosition="start" 
              />
              <Tab 
                icon={<CalendarMonthIcon />} 
                label="Yearly Schedule" 
                iconPosition="start" 
              />
              <Tab 
                icon={<AnalyticsIcon />} 
                label="Statistics" 
                iconPosition="start" 
              />
            </Tabs>
            
            <Box sx={{ p: 3 }}>
              {tabValue === 0 && (
                <MonthlyCalendarView
                  doctors={localDoctors}
                  schedule={localSchedule}
                  holidays={localHolidays}
                  onScheduleUpdate={handleScheduleUpdate}
                />
              )}
              {tabValue === 1 && (
                <MonthlyHours doctors={localDoctors} schedule={localSchedule} selectedMonth={month} />
              )}
              {tabValue === 2 && (
                <WeekendHolidayBalance doctors={localDoctors} schedule={localSchedule} holidays={localHolidays} />
              )}
              {tabValue === 3 && (
                <YearlySchedule doctors={localDoctors} schedule={localSchedule} />
              )}
              {tabValue === 4 && (
                <ScheduleStatistics doctors={localDoctors} schedule={localSchedule} />
              )}
            </Box>
          </Paper>
          
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
        </>
      )}
    </Box>
  );
}

export default Dashboard;