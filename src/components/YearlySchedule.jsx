import React from 'react'
import { Typography, Box, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material'

function YearlySchedule({ doctors, schedule }) {
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return <Box sx={{ minHeight: '400px' }}><Typography>No schedule generated yet!</Typography></Box>
  }
  const totals = {}
  doctors.forEach(doc => { totals[doc.name] = 0 })
  Object.keys(schedule).forEach(date => {
    const daySchedule = schedule[date]
    if (!daySchedule || typeof daySchedule !== 'object') return
    ["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
      shiftArr.forEach(name => {
        totals[name] += 1
      })
    })
  })

  return (
    <Box sx={{ minHeight: '400px' }}>
      <Typography variant="h5" gutterBottom>Yearly Schedule Overview</Typography>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Doctor</TableCell>
            <TableCell>Total Shifts (Year)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(totals).map(([doc, total]) => (
            <TableRow key={doc}>
              <TableCell>{doc}</TableCell>
              <TableCell>{total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

export default YearlySchedule
