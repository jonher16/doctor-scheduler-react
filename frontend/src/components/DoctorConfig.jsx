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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  Tooltip,
  Snackbar,
  Alert
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon
} from '@mui/icons-material';

function DoctorConfig({ doctors, setDoctors }) {
  const [localDoctors, setLocalDoctors] = useState(doctors);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [newDoctor, setNewDoctor] = useState({ name: '', seniority: 'Junior', pref: 'None' });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Update local state when doctors prop changes
  useEffect(() => {
    setLocalDoctors(doctors);
  }, [doctors]);

  // Handle dialog open for adding a new doctor
  const handleAddDoctor = () => {
    setEditingDoctor(null);
    setNewDoctor({ name: '', seniority: 'Junior', pref: 'None' });
    setOpenDialog(true);
  };

  // Handle dialog open for editing a doctor
  const handleEditDoctor = (doctor, index) => {
    setEditingDoctor(index);
    setNewDoctor({ ...doctor });
    setOpenDialog(true);
  };

  // Handle dialog close
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewDoctor({ ...newDoctor, [name]: value });
  };

  // Handle form submission
  const handleSubmitDoctor = () => {
    // Validate input
    if (!newDoctor.name.trim()) {
      setSnackbar({
        open: true,
        message: 'Doctor name cannot be empty',
        severity: 'error'
      });
      return;
    }

    let updatedDoctors;
    if (editingDoctor !== null) {
      // Update existing doctor
      updatedDoctors = [...localDoctors];
      updatedDoctors[editingDoctor] = newDoctor;
      setSnackbar({
        open: true,
        message: `Dr. ${newDoctor.name} updated successfully`,
        severity: 'success'
      });
    } else {
      // Add new doctor
      updatedDoctors = [...localDoctors, newDoctor];
      setSnackbar({
        open: true,
        message: `Dr. ${newDoctor.name} added successfully`,
        severity: 'success'
      });
    }
    
    setLocalDoctors(updatedDoctors);
    setOpenDialog(false);
  };

  // Handle doctor removal
  const handleRemoveDoctor = (index) => {
    const doctorName = localDoctors[index].name;
    const newList = localDoctors.filter((_, i) => i !== index);
    setLocalDoctors(newList);
    setSnackbar({
      open: true,
      message: `Dr. ${doctorName} removed from the list`,
      severity: 'info'
    });
  };

  // Save configuration back to parent component
  const saveConfig = () => {
    setDoctors(localDoctors);
    setSnackbar({
      open: true,
      message: 'Doctor configuration saved successfully!',
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

  // Get color for seniority chip
  const getSeniorityColor = (seniority) => {
    return seniority === 'Senior' ? 'primary' : 'default';
  };

  // Get color for preference chip
  const getPreferenceColor = (pref) => {
    switch(pref) {
      case 'Day Only':
        return 'success';
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
        Doctor Configuration
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Manage the list of doctors available for scheduling. Add doctors, specify their seniority level, and set shift preferences.
        </Typography>
      </Box>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={handleAddDoctor}
          sx={{ mr: 2 }}
        >
          Add Doctor
        </Button>
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={saveConfig}
          color="primary"
        >
          Save Configuration
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.light' }}>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Seniority</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Preference</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {localDoctors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography variant="body1" sx={{ py: 2 }}>
                    No doctors configured. Add a doctor to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              localDoctors.map((doctor, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Typography variant="body1">{doctor.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={doctor.seniority} 
                      color={getSeniorityColor(doctor.seniority)}
                      size="small"
                      variant={doctor.seniority === 'Senior' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={doctor.pref} 
                      color={getPreferenceColor(doctor.pref)}
                      size="small"
                      variant={doctor.pref === 'None' ? 'outlined' : 'filled'}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton 
                        color="primary" 
                        onClick={() => handleEditDoctor(doctor, index)}
                        size="small"
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton 
                        color="error" 
                        onClick={() => handleRemoveDoctor(index)}
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

      {/* Add/Edit Doctor Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingDoctor !== null ? 'Edit Doctor' : 'Add New Doctor'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                name="name"
                label="Doctor Name"
                type="text"
                fullWidth
                variant="outlined"
                value={newDoctor.name}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="seniority-label">Seniority</InputLabel>
                <Select
                  labelId="seniority-label"
                  name="seniority"
                  value={newDoctor.seniority}
                  label="Seniority"
                  onChange={handleInputChange}
                >
                  <MenuItem value="Junior">Junior</MenuItem>
                  <MenuItem value="Senior">Senior</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="preference-label">Shift Preference</InputLabel>
                <Select
                  labelId="preference-label"
                  name="pref"
                  value={newDoctor.pref}
                  label="Shift Preference"
                  onChange={handleInputChange}
                >
                  <MenuItem value="None">No Preference</MenuItem>
                  <MenuItem value="Day Only">Day Shifts Only</MenuItem>
                  <MenuItem value="Evening Only">Evening Shifts Only</MenuItem>
                  <MenuItem value="Night Only">Night Shifts Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmitDoctor} variant="contained">
            {editingDoctor !== null ? 'Update' : 'Add'}
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

export default DoctorConfig;