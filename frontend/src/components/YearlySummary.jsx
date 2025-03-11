import React from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Tabs,
  Tab
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

function YearlySummary({ doctors, schedule, holidays }) {
  const [tabValue, setTabValue] = React.useState(0);

  // Check if schedule and doctors are available
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No schedule data available. Please generate a schedule first.
          </Typography>
        </Alert>
      </Box>
    );
  }
  
  // Create a set of all doctors that appear in the schedule
  const doctorsInSchedule = new Set();
  Object.values(schedule).forEach(daySchedule => {
    if (!daySchedule || typeof daySchedule !== 'object') return;
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
      shiftArr.forEach(name => doctorsInSchedule.add(name));
    });
  });
  
  // Get the intersection of doctors from props and doctors in schedule
  const validDoctors = doctors.filter(doc => doctorsInSchedule.has(doc.name));
  
  // If there are no valid doctors, show an error message
  if (validDoctors.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="warning" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            Cannot display data: doctors in schedule don't match current doctors configuration
          </Typography>
        </Alert>
      </Box>
    );
  }
  
  // --- YEARLY SHIFTS CALCULATION (from YearlySchedule.jsx) ---
  const totalShifts = {};
  validDoctors.forEach(doc => { totalShifts[doc.name] = 0 });
  
  Object.keys(schedule).forEach(date => {
    const daySchedule = schedule[date];
    if (!daySchedule || typeof daySchedule !== 'object') return;
    
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
      shiftArr.forEach(name => {
        if (totalShifts.hasOwnProperty(name)) {
          totalShifts[name] += 1;
        }
      });
    });
  });

  // Sort doctors by total shifts (descending)
  const sortedDoctors = Object.entries(totalShifts)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);
    
  // Calculate the total number of shifts
  const totalShiftsAll = Object.values(totalShifts).reduce((sum, count) => sum + count, 0);
  
  // --- MONTHLY HOURS CALCULATION (from ScheduleStatistics.jsx) ---
  const monthlyHours = {};
  
  validDoctors.forEach(doc => {
    monthlyHours[doc.name] = Array(12).fill(0);
  });
  
  Object.keys(schedule).forEach(dateStr => {
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-indexed
    
    const daySchedule = schedule[dateStr];
    if (!daySchedule || typeof daySchedule !== 'object') return;
    
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
      shiftArr.forEach(name => {
        if (name in monthlyHours) {
          monthlyHours[name][month] += 8; // 8 hours per shift
        }
      });
    });
  });

  // Calculate total hours per doctor
  const totalHours = {};
  Object.keys(monthlyHours).forEach(name => {
    totalHours[name] = monthlyHours[name].reduce((a, b) => a + b, 0);
  });
  
  // Calculate total hours across all doctors
  const grandTotalHours = Object.values(totalHours).reduce((sum, hours) => sum + hours, 0);
  
  // Calculate average hours per doctor
  const averageHours = grandTotalHours / (validDoctors.length || 1);
  
  // Calculate total hours per month across all doctors
  const monthlyTotals = Array(12).fill(0);
  Object.values(monthlyHours).forEach(doctorMonths => {
    doctorMonths.forEach((hours, monthIndex) => {
      monthlyTotals[monthIndex] += hours;
    });
  });
  
  // Find the busiest month
  const busiestMonthIndex = monthlyTotals.indexOf(Math.max(...monthlyTotals));
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const busiestMonth = monthNames[busiestMonthIndex];
  
  // --- WEEKEND/HOLIDAY CALCULATION ---
  const weekendHolidayHours = {};
  validDoctors.forEach(doc => {
    weekendHolidayHours[doc.name] = { weekends: 0, holidays: 0 };
  });
  
  Object.keys(schedule).forEach(dateStr => {
    const date = new Date(dateStr);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday
    const isHoliday = holidays && dateStr in holidays;
    
    if (!isWeekend && !isHoliday) return;
    
    const daySchedule = schedule[dateStr];
    if (!daySchedule || typeof daySchedule !== 'object') return;
    
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
      shiftArr.forEach(name => {
        if (name in weekendHolidayHours) {
          if (isWeekend) weekendHolidayHours[name].weekends += 1;
          if (isHoliday) weekendHolidayHours[name].holidays += 1;
        }
      });
    });
  });
  
  // Prepare data for charts
  const yearlyShiftsChartData = sortedDoctors.map(doctor => ({
    name: doctor,
    shifts: totalShifts[doctor],
    hours: totalHours[doctor],
    weekends: weekendHolidayHours[doctor].weekends,
    holidays: weekendHolidayHours[doctor].holidays
  }));
  
  const seniorDoctors = validDoctors.filter(doc => doc.seniority === 'Senior').map(doc => doc.name);
  const juniorDoctors = validDoctors.filter(doc => doc.seniority !== 'Senior').map(doc => doc.name);
  
  // Weekend/Holiday data by seniority for bar chart
  const weekendHolidayData = [
    {
      group: 'Senior Doctors',
      weekends: seniorDoctors.reduce((sum, doc) => sum + weekendHolidayHours[doc].weekends, 0) / (seniorDoctors.length || 1),
      holidays: seniorDoctors.reduce((sum, doc) => sum + weekendHolidayHours[doc].holidays, 0) / (seniorDoctors.length || 1)
    },
    {
      group: 'Junior Doctors',
      weekends: juniorDoctors.reduce((sum, doc) => sum + weekendHolidayHours[doc].weekends, 0) / (juniorDoctors.length || 1),
      holidays: juniorDoctors.reduce((sum, doc) => sum + weekendHolidayHours[doc].holidays, 0) / (juniorDoctors.length || 1)
    }
  ];
  
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ minHeight: '400px' }}>
      <Typography variant="h5" gutterBottom>Yearly Summary</Typography>
      
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        textColor="primary"
        indicatorColor="primary"
        sx={{ mb: 3 }}
      >
        <Tab label="Yearly Hours" />
        <Tab label="Yearly Shifts" />
        <Tab label="Weekend & Holiday" />
      </Tabs>
      
      {/* Tab 1: Yearly Hours Summary (from ScheduleStatistics) */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Yearly Hours Summary
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <TableContainer component={Paper} sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'primary.light' }}>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Total Hours</TableCell>
                        {monthNames.map((month, index) => (
                          <TableCell key={index} sx={{ fontWeight: 'bold', color: 'white' }} align="center">
                            {month.substring(0, 3)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedDoctors.map((doctor) => (
                        <TableRow key={doctor} hover>
                          <TableCell component="th" scope="row">
                            {doctor}
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={totalHours[doctor]} 
                              color="primary" 
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          {monthlyHours[doctor].map((hours, monthIndex) => (
                            <TableCell key={monthIndex} align="center">
                              {hours > 0 ? hours : '-'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Monthly Totals</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                          <Chip 
                            label={grandTotalHours} 
                            color="secondary" 
                            size="small"
                          />
                        </TableCell>
                        {monthlyTotals.map((total, index) => (
                          <TableCell key={index} align="center" sx={{ fontWeight: 'bold' }}>
                            {total > 0 ? total : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Key Statistics
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">
                          Total Yearly Hours
                        </Typography>
                        <Typography variant="h5" color="primary.main">
                          {grandTotalHours}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">
                          Average Hours per Doctor
                        </Typography>
                        <Typography variant="h5" color="primary.main">
                          {averageHours.toFixed(1)}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">
                          Busiest Month
                        </Typography>
                        <Typography variant="h5" color="primary.main">
                          {busiestMonth}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* Tab 2: Yearly Shifts (from YearlySchedule) */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Total Yearly Shifts by Doctor</Typography>
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={yearlyShiftsChartData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        angle={-45} 
                        textAnchor="end" 
                        height={70} 
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="shifts" name="Total Shifts" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Shift Distribution</Typography>
                <Divider sx={{ mb: 2 }} />
                
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'primary.light' }}>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Total Shifts</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedDoctors.map((doctor) => (
                        <TableRow key={doctor} hover>
                          <TableCell>{doctor}</TableCell>
                          <TableCell align="center">{totalShifts[doctor]}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>{totalShiftsAll}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* Tab 3: Weekend & Holiday Balance */}
      {tabValue === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Weekend & Holiday Shift Distribution</Typography>
                <Box sx={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weekendHolidayData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="group" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="weekends" name="Average Weekend Shifts" fill="#82ca9d" />
                      <Bar dataKey="holidays" name="Average Holiday Shifts" fill="#ff7300" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Weekend & Holiday Details</Typography>
                <Divider sx={{ mb: 2 }} />
                
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'primary.light' }}>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Weekend Shifts</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Holiday Shifts</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedDoctors.map((doctor) => (
                        <TableRow key={doctor} hover>
                          <TableCell>{doctor}</TableCell>
                          <TableCell align="center">
                            <Chip 
                              size="small" 
                              label={weekendHolidayHours[doctor].weekends} 
                              color="primary"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              size="small" 
                              label={weekendHolidayHours[doctor].holidays} 
                              color="secondary"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Seniority Comparison
                  </Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Typography variant="body2">Senior Weekend Avg:</Typography>
                      <Typography variant="h6">{weekendHolidayData[0].weekends.toFixed(1)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2">Junior Weekend Avg:</Typography>
                      <Typography variant="h6">{weekendHolidayData[1].weekends.toFixed(1)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2">Senior Holiday Avg:</Typography>
                      <Typography variant="h6">{weekendHolidayData[0].holidays.toFixed(1)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2">Junior Holiday Avg:</Typography>
                      <Typography variant="h6">{weekendHolidayData[1].holidays.toFixed(1)}</Typography>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default YearlySummary;