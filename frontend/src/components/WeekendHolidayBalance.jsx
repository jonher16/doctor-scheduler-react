import React from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Divider,
  Alert,
  Chip
} from '@mui/material';
import { Bar } from 'recharts';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar as BarChart } from 'react-chartjs-2';

import { getMonthName } from '../utils/dateUtils';
import { useYear } from '../contexts/YearContext';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function WeekendHolidayBalance({ doctors, schedule, holidays, selectedMonth }) {

  const { selectedYear } = useYear();
  
  // Filter schedule data by selected month
  const getFilteredSchedule = () => {
    const filteredSchedule = {};
    
    Object.keys(schedule).forEach(dateStr => {
      const date = new Date(dateStr);
      const month = date.getMonth() + 1; // JavaScript months are 0-indexed
      
      if (month === selectedMonth) {
        filteredSchedule[dateStr] = schedule[dateStr];
      }
    });
    
    return filteredSchedule;
  };
  
  // Get filtered schedule based on selected month
  const filteredSchedule = getFilteredSchedule();
  
  // Check if the filtered schedule has any data
  if (Object.keys(filteredSchedule).length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No schedule data available for {getMonthName(selectedMonth)}.
          </Typography>
        </Alert>
      </Box>
    );
  }
  
  // Create a set of all doctors that appear in the schedule
  const doctorsInSchedule = new Set();
  Object.values(filteredSchedule).forEach(daySchedule => {
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

  // Initialize counters
  const weekendShifts = {};
  const holidayShifts = {};
  
  // Safely initialize the doctors
  validDoctors.forEach(doc => {
    weekendShifts[doc.name] = 0;
    holidayShifts[doc.name] = 0;
  });

  // Make sure holidays is an object before using it
  const safeHolidays = holidays && typeof holidays === 'object' ? holidays : {};

  // Process schedule
  Object.keys(filteredSchedule).forEach(dateStr => {
    const daySchedule = filteredSchedule[dateStr];
    if (!daySchedule || typeof daySchedule !== 'object') return;
    
    const date = new Date(dateStr);
    const isWeekend = (date.getDay() === 6 || date.getDay() === 0); // Saturday or Sunday
    const isHoliday = dateStr in safeHolidays; // Check if date is in holidays
    
    ["Day", "Evening", "Night"].forEach(shift => {
      if (!daySchedule[shift] || !Array.isArray(daySchedule[shift])) return;
      
      daySchedule[shift].forEach(name => {
        // Only count for doctors that exist in our valid list
        if (weekendShifts.hasOwnProperty(name)) {
          if (isHoliday) {
            holidayShifts[name] += 1;
          } else if (isWeekend) {
            weekendShifts[name] += 1;
          }
        }
      });
    });
  });

  // Prepare chart data
  const labels = Object.keys(weekendShifts);
  
  // Check if we have any data to show
  const totalWeekendShifts = Object.values(weekendShifts).reduce((a, b) => a + b, 0);
  const totalHolidayShifts = Object.values(holidayShifts).reduce((a, b) => a + b, 0);
  
  if (totalWeekendShifts === 0 && totalHolidayShifts === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No weekend or holiday shifts found in {getMonthName(selectedMonth)} {selectedYear}.
          </Typography>
        </Alert>
      </Box>
    );
  }
  
  const data = {
    labels,
    datasets: [
      {
        label: 'Weekend Shifts',
        data: labels.map(doc => weekendShifts[doc]),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
      {
        label: 'Holiday Shifts',
        data: labels.map(doc => holidayShifts[doc]),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
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
        text: `${getMonthName(selectedMonth)} ${selectedYear} Weekend and Holiday Shift Distribution`,
        font: { size: 16 }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Shifts',
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

  // Find the doctor with most weekend and holiday shifts
  let maxWeekendShifts = 0;
  let maxHolidayShifts = 0;
  let maxWeekendDoctor = 'N/A';
  let maxHolidayDoctor = 'N/A';
  
  Object.entries(weekendShifts).forEach(([doctor, shifts]) => {
    if (shifts > maxWeekendShifts) {
      maxWeekendShifts = shifts;
      maxWeekendDoctor = doctor;
    }
  });
  
  Object.entries(holidayShifts).forEach(([doctor, shifts]) => {
    if (shifts > maxHolidayShifts) {
      maxHolidayShifts = shifts;
      maxHolidayDoctor = doctor;
    }
  });

  return (
    <Box sx={{ minHeight: '400px' }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%', p: 2 }}>
            <Box sx={{ height: 400 }}>
              <BarChart data={data} options={options} />
            </Box>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {getMonthName(selectedMonth)} {selectedYear} Weekend & Holiday Distribution
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Weekend Coverage
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Total weekend shifts:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {totalWeekendShifts}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Highest weekend load:</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Chip 
                      size="small" 
                      label={`${maxWeekendShifts} shifts`} 
                      color="primary"
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="body2">{maxWeekendDoctor}</Typography>
                  </Box>
                </Box>
              </Box>
              
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Holiday Coverage
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Total holiday shifts:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {totalHolidayShifts}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Highest holiday load:</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Chip 
                      size="small" 
                      label={`${maxHolidayShifts} shifts`} 
                      color="secondary"
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="body2">{maxHolidayDoctor}</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default WeekendHolidayBalance;