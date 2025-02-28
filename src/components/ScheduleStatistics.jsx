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
  Alert
} from '@mui/material';

function ScheduleStatistics({ doctors, schedule }) {
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
  
  // Initialize monthly hours for each doctor
  const monthlyHours = {};
  
  // Safely initialize the doctors
  validDoctors.forEach(doc => {
    monthlyHours[doc.name] = Array(12).fill(0);
  });
  
  // Process schedule
  Object.keys(schedule).forEach(dateStr => {
    const daySchedule = schedule[dateStr];
    if (!daySchedule || typeof daySchedule !== 'object') return;
    
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-indexed
    
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
      shiftArr.forEach(name => {
        // Only count hours for doctors that exist in our monthlyHours object
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

  // Sort doctors by total hours worked (descending)
  const sortedDoctors = [...Object.keys(monthlyHours)].sort((a, b) => totalHours[b] - totalHours[a]);

  // Get month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Calculate total hours across all doctors
  const grandTotalHours = Object.values(totalHours).reduce((sum, hours) => sum + hours, 0);
  
  // Calculate average hours per doctor
  const averageHours = grandTotalHours / (validDoctors.length || 1); // Avoid division by zero
  
  // Calculate total hours per month across all doctors
  const monthlyTotals = Array(12).fill(0);
  Object.values(monthlyHours).forEach(doctorMonths => {
    doctorMonths.forEach((hours, monthIndex) => {
      monthlyTotals[monthIndex] += hours;
    });
  });
  
  // Find the busiest month
  const busiestMonthIndex = monthlyTotals.indexOf(Math.max(...monthlyTotals));
  const busiestMonth = monthNames[busiestMonthIndex];
  
  // Check if we have any hours to display
  if (grandTotalHours === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No hours recorded in the schedule.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '400px' }}>
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
    </Box>
  );
}

export default ScheduleStatistics;