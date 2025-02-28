import React from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Avatar,
  LinearProgress
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend
} from 'chart.js';
import { HourglassEmpty, Timer, Timelapse } from '@mui/icons-material';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

function MonthlyHours({ doctors, schedule, selectedMonth }) {
  // Use the provided selectedMonth or default to 1 (January)
  const month = selectedMonth || 1;
  
  // Check if schedule and doctors are available
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No schedule data available
        </Typography>
      </Box>
    );
  }

  // Calculate monthly hours for each doctor
  const monthlyHours = {};
  const doctorShifts = {};
  const shiftTypeCounts = { Day: 0, Evening: 0, Night: 0 };
  
  doctors.forEach(doc => {
    monthlyHours[doc.name] = 0;
    doctorShifts[doc.name] = { Day: 0, Evening: 0, Night: 0 };
  });
  
  Object.keys(schedule).forEach(dateStr => {
    const date = new Date(dateStr);
    if (date.getMonth() + 1 === month) {
      const daySchedule = schedule[dateStr];
      if (!daySchedule || typeof daySchedule !== 'object') return;
      
      ["Day", "Evening", "Night"].forEach(shift => {
        const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : [];
        shiftArr.forEach(name => {
          // Add 8 hours per shift
          monthlyHours[name] = (monthlyHours[name] || 0) + 8;
          // Count shifts by type
          doctorShifts[name][shift] = (doctorShifts[name][shift] || 0) + 1;
          // Total shift types
          shiftTypeCounts[shift] += 1;
        });
      });
    }
  });

  // Prepare chart data
  const labels = Object.keys(monthlyHours);
  const dataForMonth = labels.map(doc => monthlyHours[doc]);

  // Sort doctors by hours worked (descending)
  const sortedDoctors = [...labels].sort((a, b) => monthlyHours[b] - monthlyHours[a]);

  // Calculate statistics
  const totalHours = Object.values(monthlyHours).reduce((a, b) => a + b, 0);
  const averageHours = totalHours / doctors.length;
  const maxHours = Math.max(...Object.values(monthlyHours));
  const minHours = Math.min(...Object.values(monthlyHours).filter(h => h > 0)); // Exclude zeros
  
  // Get doctor with max and min hours
  const maxHoursDoctor = Object.keys(monthlyHours).find(doc => monthlyHours[doc] === maxHours);
  const minHoursDoctor = Object.keys(monthlyHours).find(doc => monthlyHours[doc] === minHours);

  // Get month name
  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  // Chart configuration
  const data = {
    labels,
    datasets: [
      {
        label: `Hours in ${getMonthName(month)}`,
        data: dataForMonth,
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }
    ]
  };
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { 
        display: true, 
        text: `Monthly Hours per Doctor - ${getMonthName(month)} 2025`,
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          afterLabel: function(context) {
            const doctorName = context.label;
            const shifts = doctorShifts[doctorName];
            return [
              `Day shifts: ${shifts.Day}`,
              `Evening shifts: ${shifts.Evening}`,
              `Night shifts: ${shifts.Night}`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Hours',
          font: { weight: 'bold' }
        }
      },
      x: {
        title: {
          display: true,
          text: 'Doctors',
          font: { weight: 'bold' }
        }
      }
    }
  };

  return (
    <Box sx={{ minHeight: '400px' }}>
      <Grid container spacing={3}>
        {/* Main Chart */}
        <Grid item xs={12}>
          <Card sx={{ height: '100%', p: 2 }}>
            <Box sx={{ height: 400 }}>
              <Bar data={data} options={options} />
            </Box>
          </Card>
        </Grid>
        
        {/* Statistics Cards */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <HourglassEmpty />
                </Avatar>
                <Typography variant="h6">Total Hours</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Typography variant="h4" align="center" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main' }}>
                {totalHours}
              </Typography>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Average per doctor:</Typography>
                <Typography variant="body1" fontWeight="bold">{averageHours.toFixed(1)} hrs</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                  <Timer />
                </Avatar>
                <Typography variant="h6">Shift Distribution</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Box sx={{ mb: 1 }}>
                <Typography variant="body2" gutterBottom>Day Shifts</Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(shiftTypeCounts.Day / Object.values(shiftTypeCounts).reduce((a, b) => a + b, 0)) * 100} 
                  color="success"
                  sx={{ height: 10, borderRadius: 5, mb: 1 }}
                />
                <Typography variant="body2" align="right">{shiftTypeCounts.Day} shifts</Typography>
              </Box>
              
              <Box sx={{ mb: 1 }}>
                <Typography variant="body2" gutterBottom>Evening Shifts</Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(shiftTypeCounts.Evening / Object.values(shiftTypeCounts).reduce((a, b) => a + b, 0)) * 100} 
                  color="primary"
                  sx={{ height: 10, borderRadius: 5, mb: 1 }}
                />
                <Typography variant="body2" align="right">{shiftTypeCounts.Evening} shifts</Typography>
              </Box>
              
              <Box sx={{ mb: 1 }}>
                <Typography variant="body2" gutterBottom>Night Shifts</Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(shiftTypeCounts.Night / Object.values(shiftTypeCounts).reduce((a, b) => a + b, 0)) * 100} 
                  color="secondary"
                  sx={{ height: 10, borderRadius: 5, mb: 1 }}
                />
                <Typography variant="body2" align="right">{shiftTypeCounts.Night} shifts</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <Timelapse />
                </Avatar>
                <Typography variant="h6">Workload Spread</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Highest hours:</Typography>
                <Tooltip title={`${maxHoursDoctor} worked the most hours this month`}>
                  <Typography variant="body1" fontWeight="bold">
                    {maxHours} hrs ({maxHoursDoctor})
                  </Typography>
                </Tooltip>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Lowest hours:</Typography>
                <Tooltip title={`${minHoursDoctor} worked the least hours this month`}>
                  <Typography variant="body1" fontWeight="bold">
                    {minHours} hrs ({minHoursDoctor})
                  </Typography>
                </Tooltip>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Variance:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {(maxHours - minHours).toFixed(0)} hrs
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Table */}
        <Grid item xs={12}>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'primary.light' }}>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Total Hours</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Day Shifts</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Evening Shifts</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Night Shifts</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedDoctors.map((doctor) => (
                  <TableRow key={doctor} hover>
                    <TableCell component="th" scope="row">
                      {doctor}
                    </TableCell>
                    <TableCell align="center">
                      <Typography 
                        fontWeight={monthlyHours[doctor] === maxHours ? 'bold' : 'normal'}
                        color={monthlyHours[doctor] === maxHours ? 'primary.main' : 'text.primary'}
                      >
                        {monthlyHours[doctor]}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{doctorShifts[doctor].Day}</TableCell>
                    <TableCell align="center">{doctorShifts[doctor].Evening}</TableCell>
                    <TableCell align="center">{doctorShifts[doctor].Night}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Box>
  );
}

export default MonthlyHours;