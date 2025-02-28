import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Event as EventIcon,
  CalendarToday as CalendarTodayIcon
} from '@mui/icons-material';

function DoctorNeeds({ doctors, setAvailability }) {
  const [constraints, setConstraints] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [newConstraint, setNewConstraint] = useState({
    doctor: '',
    date: '',
    avail: 'Available'
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Handle opening the add constraint dialog
  const handleOpenDialog = () => {
    setNewConstraint({
      doctor: '',
      date: '',
      avail: 'Available'
    });
    setOpenDialog(true);
  };

  // Handle closing the dialog
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Validate date format (YYYY-MM-DD)
  const isValidDate = (dateString) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const parts = dateString.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    return date.getFullYear() === year && 
           date.getMonth() === month && 
           date.getDate() === day;
  };

  // Handle adding a new constraint
  const addConstraint = () => {
    if (!newConstraint.doctor) {
      setSnackbar({
        open: true,
        message: 'Please select a doctor',
        severity: 'error'
      });
      return;
    }

    if (!newConstraint.date || !isValidDate(newConstraint.date)) {
      setSnackbar({
        open: true,
        message: 'Please enter a valid date in YYYY-MM-DD format',
        severity: 'error'
      });
      return;
    }
    
    // Check if constraint already exists
    const existingIndex = constraints.findIndex(
      c => c.doctor === newConstraint.doctor && c.date === newConstraint.date
    );

    if (existingIndex !== -1) {
      // Update existing constraint
      const newConstraints = [...constraints];
      newConstraints[existingIndex] = {
        ...newConstraints[existingIndex],
        avail: newConstraint.avail
      };
      setConstraints(newConstraints);
      setSnackbar({
        open: true,
        message: `Updated availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
        severity: 'info'
      });
    } else {
      // Add new constraint
      const constraintToAdd = {
        doctor: newConstraint.doctor,
        date: newConstraint.date,
        avail: newConstraint.avail
      };
      setConstraints([...constraints, constraintToAdd]);
      setSnackbar({
        open: true,
        message: `Added availability for Dr. ${newConstraint.doctor} on ${newConstraint.date}`,
        severity: 'success'
      });
    }
    
    setOpenDialog(false);
  };

  // Handle removing a constraint
  const removeConstraint = (index) => {
    const constraintToRemove = constraints[index];
    const newConstraints = [...constraints];
    newConstraints.splice(index, 1);
    setConstraints(newConstraints);
    setSnackbar({
      open: true,
      message: `Removed constraint for Dr. ${constraintToRemove.doctor} on ${constraintToRemove.date}`,
      severity: 'info'
    });
  };

  // Save constraints back to parent component
  const saveConstraints = () => {
    // Build availability object: { doctor: { date: avail, ... }, ... }
    const avail = {};
    constraints.forEach(({ doctor, date, avail: a }) => {
      if (!avail[doctor]) avail[doctor] = {};
      avail[doctor][date] = a;
    });
    setAvailability(avail);
    setSnackbar({
      open: true,
      message: 'Doctor availability saved successfully!',
      severity: 'success'
    });
  };

  // Handle closing snackbar
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Get color for availability chip
  const getAvailabilityColor = (avail) => {
    switch(avail) {
      case 'Available':
        return 'success';
      case 'Not Available':
        return 'error';
      case 'Day Only':
        return 'primary';
      case 'Evening Only':
        return 'info';
      case 'Night Only':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Doctor Availability
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage individual doctor availability and shift preferences for specific dates. This helps in creating optimal schedules that accommodate doctor needs.
        </Typography>
      </Box>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<CalendarTodayIcon />}
          onClick={handleOpenDialog}
          sx={{ mr: 2 }}
        >
          Add Availability
        </Button>
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={saveConstraints}
          color="primary"
        >
          Save Availability
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.light' }}>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Doctor</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Availability</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {constraints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography variant="body1" sx={{ py: 2 }}>
                    No availability constraints set. Add availability constraints to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              constraints.map((constraint, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Typography variant="body1">
                      {constraint.doctor}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1">
                      {constraint.date}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={constraint.avail} 
                      color={getAvailabilityColor(constraint.avail)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Remove">
                      <IconButton 
                        color="error" 
                        onClick={() => removeConstraint(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Availability Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add Doctor Availability</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={doctors.map(doc => doc.name)}
                value={newConstraint.doctor}
                onChange={(event, newValue) => {
                  setNewConstraint({...newConstraint, doctor: newValue || ''});
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Doctor Name"
                    fullWidth
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Date (YYYY-MM-DD)"
                value={newConstraint.date}
                onChange={(e) => setNewConstraint({...newConstraint, date: e.target.value})}
                fullWidth
                required
                placeholder="2025-01-15"
                helperText="Enter date in YYYY-MM-DD format"
                error={newConstraint.date && !isValidDate(newConstraint.date)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="availability-label">Availability</InputLabel>
                <Select
                  labelId="availability-label"
                  value={newConstraint.avail}
                  label="Availability"
                  onChange={(e) => setNewConstraint({...newConstraint, avail: e.target.value})}
                >
                  <MenuItem value="Available">Available</MenuItem>
                  <MenuItem value="Not Available">Not Available</MenuItem>
                  <MenuItem value="Day Only">Day Shift Only</MenuItem>
                  <MenuItem value="Evening Only">Evening Shift Only</MenuItem>
                  <MenuItem value="Night Only">Night Shift Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={addConstraint} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity} 
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default DoctorNeeds;