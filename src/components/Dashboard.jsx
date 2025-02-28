import React, { useState } from 'react';
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
  MenuItem
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  Timeline as TimelineIcon,
  CalendarMonth as CalendarMonthIcon,
  Analytics as AnalyticsIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import MonthlyHours from './MonthlyHours';
import WeekendHolidayBalance from './WeekendHolidayBalance';
import YearlySchedule from './YearlySchedule';
import ScheduleStatistics from './ScheduleStatistics';

function Dashboard({ doctors, schedule, holidays }) {
  const [tabValue, setTabValue] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth() + 1); // Current month (1-12)

  // Check if schedule exists
  const hasSchedule = schedule && Object.keys(schedule).length > 0 && doctors && doctors.length > 0;

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Quick statistics
  const getQuickStats = () => {
    if (!hasSchedule) return null;
    
    // Total shifts
    let totalShifts = 0;
    // Shifts per doctor
    const doctorShifts = {};
    doctors.forEach(doc => { doctorShifts[doc.name] = 0 });
    
    // Calculate statistics
    Object.keys(schedule).forEach(date => {
      const daySchedule = schedule[date];
      if (!daySchedule || typeof daySchedule !== 'object') return;
      
      ["Day", "Evening", "Night"].forEach(shift => {
        const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
        totalShifts += shiftArr.length;
        
        shiftArr.forEach(name => {
          doctorShifts[name] = (doctorShifts[name] || 0) + 1;
        });
      });
    });
    
    // Find min and max shifts
    let minShifts = Infinity;
    let maxShifts = 0;
    let minDoctor = "";
    let maxDoctor = "";
    
    Object.entries(doctorShifts).forEach(([doctor, shifts]) => {
      if (shifts < minShifts) {
        minShifts = shifts;
        minDoctor = doctor;
      }
      if (shifts > maxShifts) {
        maxShifts = shifts;
        maxDoctor = doctor;
      }
    });
    
    // Average shifts per doctor
    const avgShifts = totalShifts / doctors.length;
    
    return {
      totalShifts,
      avgShifts: avgShifts.toFixed(1),
      minDoctor,
      minShifts,
      maxDoctor,
      maxShifts
    };
  };

  const quickStats = hasSchedule ? getQuickStats() : null;

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
                    <Typography variant="body1" fontWeight="bold">{quickStats.totalShifts}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Avg. Shifts per Doctor:</Typography>
                    <Typography variant="body1" fontWeight="bold">{quickStats.avgShifts}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Doctors Scheduled:</Typography>
                    <Typography variant="body1" fontWeight="bold">{doctors.length}</Typography>
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
                        label={quickStats.maxShifts + " shifts"} 
                        color="primary"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="body2">{quickStats.maxDoctor}</Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Lowest Workload:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Chip 
                        size="small" 
                        label={quickStats.minShifts + " shifts"} 
                        color="secondary"
                        sx={{ mr: 1 }}
                      />
                      <Typography variant="body2">{quickStats.minDoctor}</Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Variance:</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {quickStats.maxShifts - quickStats.minShifts} shifts
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
                <MonthlyHours doctors={doctors} schedule={schedule} selectedMonth={month} />
              )}
              {tabValue === 1 && (
                <WeekendHolidayBalance doctors={doctors} schedule={schedule} />
              )}
              {tabValue === 2 && (
                <YearlySchedule doctors={doctors} schedule={schedule} />
              )}
              {tabValue === 3 && (
                <ScheduleStatistics doctors={doctors} schedule={schedule} />
              )}
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}

export default Dashboard;