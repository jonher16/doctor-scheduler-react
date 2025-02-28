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
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  EventNote as EventNoteIcon
} from '@mui/icons-material';

function HolidayConfig({ holidays, setHolidays }) {
  const [localHolidays, setLocalHolidays] = useState(holidays);
  const [selectedDate, setSelectedDate] = useState('');
  const [holidayType, setHolidayType] = useState('Short');
  const [openDialog, setOpenDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Update local state when holidays prop changes
  useEffect(() => {
    setLocalHolidays(holidays);
  }, [holidays]);

  // Handle opening the add holiday dialog
  const handleOpenDialog = () => {
    setSelectedDate('');
    setHolidayType('Short');
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

  // Handle adding a new holiday
  const markHoliday = () => {
    if (!selectedDate || !isValidDate(selectedDate)) {
      setSnackbar({
        open: true,
        message: 'Please enter a valid date in YYYY-MM-DD format',
        severity: 'error'
      });
      return;
    }
    
    // Check if date already exists
    if (localHolidays[selectedDate]) {
      setSnackbar({
        open: true,
        message: `${selectedDate} is already marked as a holiday`,
        severity: 'warning'
      });
      return;
    }

    const newHolidays = { ...localHolidays, [selectedDate]: holidayType };
    setLocalHolidays(newHolidays);
    setSnackbar({
      open: true,
      message: `Added ${holidayType} holiday on ${selectedDate}`,
      severity: 'success'
    });
    setOpenDialog(false);
  };

  // Handle removing a holiday
  const removeHoliday = (date) => {
    const newHolidays = { ...localHolidays };
    delete newHolidays[date];
    setLocalHolidays(newHolidays);
    setSnackbar({
      open: true,
      message: `Removed holiday on ${date}`,
      severity: 'info'
    });
  };

  // Save holidays back to parent component
  const saveHolidays = () => {
    setHolidays(localHolidays);
    setSnackbar({
      open: true,
      message: 'Holiday configuration saved successfully!',
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

  // Get color for holiday type chip
  const getHolidayTypeColor = (type) => {
    return type === 'Long' ? 'error' : 'warning';
  };

  // Convert holidays object to array for table display
  const holidaysArray = Object.entries(localHolidays).map(([date, type]) => ({
    date,
    type
  })).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Holiday Configuration
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage hospital holidays for the year. Add important dates and specify whether they are short (1-day) or long (multi-day) holidays.
        </Typography>
      </Box>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<EventNoteIcon />}
          onClick={handleOpenDialog}
          sx={{ mr: 2 }}
        >
          Add Holiday
        </Button>
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={saveHolidays}
          color="primary"
        >
          Save Holidays
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.light' }}>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {holidaysArray.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body1" sx={{ py: 2 }}>
                    No holidays configured. Add a holiday to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              holidaysArray.map((holiday) => (
                <TableRow key={holiday.date} hover>
                  <TableCell>
                    <Typography variant="body1">
                      {holiday.date}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={holiday.type} 
                      color={getHolidayTypeColor(holiday.type)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Remove">
                      <IconButton 
                        color="error" 
                        onClick={() => removeHoliday(holiday.date)}
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

      {/* Add Holiday Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Holiday</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Date (YYYY-MM-DD)"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                fullWidth
                placeholder="2025-12-25"
                helperText="Enter date in YYYY-MM-DD format"
                error={selectedDate && !isValidDate(selectedDate)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="holiday-type-label">Holiday Type</InputLabel>
                <Select
                  labelId="holiday-type-label"
                  value={holidayType}
                  label="Holiday Type"
                  onChange={(e) => setHolidayType(e.target.value)}
                >
                  <MenuItem value="Short">Short (1 day)</MenuItem>
                  <MenuItem value="Long">Long (multi-day)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={markHoliday} variant="contained">
            Add Holiday
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

export default HolidayConfig;