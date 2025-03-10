import React from 'react'
import { 
  Typography, 
  Box, 
  Table, 
  TableHead, 
  TableRow, 
  TableCell, 
  TableBody,
  Alert,
  Paper,
  TableContainer
} from '@mui/material'

function YearlySchedule({ doctors, schedule }) {
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No schedule generated yet!
          </Typography>
        </Alert>
      </Box>
    )
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
  
  // Initialize totals object with validDoctors
  const totals = {}
  validDoctors.forEach(doc => { totals[doc.name] = 0 })
  
  // Calculate totals from schedule
  Object.keys(schedule).forEach(date => {
    const daySchedule = schedule[date]
    if (!daySchedule || typeof daySchedule !== 'object') return
    
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
      shiftArr.forEach(name => {
        // Only count shifts for doctors that exist in our totals object
        if (totals.hasOwnProperty(name)) {
          totals[name] += 1
        }
      })
    })
  })

  // Sort doctors by total shifts (descending)
  const sortedDoctors = Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);
    
  // Check if we have any shifts to display
  const totalShifts = Object.values(totals).reduce((sum, count) => sum + count, 0);
  
  if (totalShifts === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No shifts assigned in the schedule.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '400px' }}>
      <Typography variant="h5" gutterBottom>Yearly Shifts</Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.light' }}>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }} align="center">Total Shifts (Year)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedDoctors.map((doctor) => (
              <TableRow key={doctor} hover>
                <TableCell>{doctor}</TableCell>
                <TableCell align="center">{totals[doctor]}</TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>{totalShifts}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default YearlySchedule