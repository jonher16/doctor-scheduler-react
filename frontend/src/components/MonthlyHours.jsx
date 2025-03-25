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
  LinearProgress,
  Alert
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

function MonthlyHours({ doctors, schedule, selectedMonth, selectedYear }) {

  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  // Use the provided selectedMonth or default to 1 (January)
  const month = selectedMonth || 1;
  
  // Check if schedule and doctors are available
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No schedule data available
          </Typography>
        </Alert>
      </Box>
    );
  }

  const monthDates = [];
  Object.keys(schedule).forEach(dateStr => {
    if (dateStr !== '_metadata') { // Skip metadata entry
      const date = new Date(dateStr);
      if (date.getMonth() + 1 === selectedMonth) {
        monthDates.push(dateStr);
      }
    }
  });

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

  // Calculate monthly hours for each doctor
  const monthlyHours = {};
  const doctorShifts = {};
  const shiftTypeCounts = { Day: 0, Evening: 0, Night: 0 };
  
  validDoctors.forEach(doc => {
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
          // Only process if this doctor exists in our validDoctors list
          if (monthlyHours.hasOwnProperty(name)) {
            // Add 8 hours per shift
            monthlyHours[name] = (monthlyHours[name] || 0) + 8;
            // Count shifts by type
            doctorShifts[name][shift] = (doctorShifts[name][shift] || 0) + 1;
            // Total shift types
            shiftTypeCounts[shift] += 1;
          }
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
  const validDoctorCount = Object.keys(monthlyHours).length || 1; // Prevent division by zero
  const averageHours = totalHours / validDoctorCount;
  
  // Handle edge cases
  const valuesGreaterThanZero = Object.values(monthlyHours).filter(h => h > 0);
  const maxHours = Math.max(...Object.values(monthlyHours), 0); // Default to 0 if empty
  const minHours = valuesGreaterThanZero.length > 0 ? 
                   Math.min(...valuesGreaterThanZero) : 
                   0; // Handle empty array
  
  // Get doctor with max and min hours
  const maxHoursDoctor = Object.keys(monthlyHours).find(doc => monthlyHours[doc] === maxHours) || "N/A";
  const minHoursDoctor = Object.keys(monthlyHours).find(doc => monthlyHours[doc] === minHours) || "N/A";

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
        text: `Monthly Hours per Doctor - ${getMonthName(month)} ${selectedYear}`,
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          afterLabel: function(context) {
            const doctorName = context.label;
            const shifts = doctorShifts[doctorName];
            if (!shifts) return [];
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

  // Check if we have any data to display
  const hasData = totalHours > 0;
  
  if (!hasData) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No data available for {getMonthName(month)}
          </Typography>
        </Alert>
      </Box>
    );
  }

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
              
              {Object.entries(shiftTypeCounts).map(([shift, count]) => {
                const total = Object.values(shiftTypeCounts).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? (count / total) * 100 : 0;
                const color = shift === 'Day' ? 'success' : (shift === 'Evening' ? 'primary' : 'secondary');
                
                return (
                  <Box sx={{ mb: 1 }} key={shift}>
                    <Typography variant="body2" gutterBottom>{shift} Shifts</Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={percentage} 
                      color={color}
                      sx={{ height: 10, borderRadius: 5, mb: 1 }}
                    />
                    <Typography variant="body2" align="right">{count} shifts</Typography>
                  </Box>
                );
              })}
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