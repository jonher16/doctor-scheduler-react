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
  Alert,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Card,
  CardContent,
  Stack,
  Divider,
  CardHeader,
  Avatar,
  InputAdornment
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  WbSunny as DayIcon,
  Nightlight as NightIcon,
  Brightness4 as EveningIcon
} from '@mui/icons-material';
import ConfigImportExport from './ConfigImportExport';

function DoctorConfig({ doctors, setDoctors }) {
  const [localDoctors, setLocalDoctors] = useState(doctors);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [newDoctor, setNewDoctor] = useState({ 
    name: '', 
    seniority: 'Junior', 
    pref: 'None',
    hasContractShifts: false,
    contractShifts: {
      day: 0,
      evening: 0,
      night: 0
    },
    maxShiftsPerWeek: 0
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Define shift types and their corresponding MUI colors
  const shiftTypes = {
    day: {
      icon: <DayIcon fontSize="small" />,
      label: "Day",
      color: "success"
    },
    evening: {
      icon: <EveningIcon fontSize="small" />,
      label: "Evening",
      color: "info"
    },
    night: {
      icon: <NightIcon fontSize="small" />,
      label: "Night",
      color: "secondary"
    }
  };

  // Update local state when doctors prop changes
  useEffect(() => {
    setLocalDoctors(doctors);
  }, [doctors]);

  // Handle dialog open for adding a new doctor
  const handleAddDoctor = () => {
    setEditingDoctor(null);
    setNewDoctor({ 
      name: '', 
      seniority: 'Junior', 
      pref: 'None',
      hasContractShifts: false,
      contractShifts: {
        day: 0,
        evening: 0,
        night: 0
      },
      maxShiftsPerWeek: 0
    });
    setOpenDialog(true);
  };

  // Handle dialog open for editing a doctor
  const handleEditDoctor = (doctor, index) => {
    setEditingDoctor(index);
    
    // Initialize contract shifts object
    let contractShiftsObj = { day: 0, evening: 0, night: 0 };
    
    // First check if we have detailed breakdown
    if (doctor.contractShiftsDetail) {
      contractShiftsObj = { ...doctor.contractShiftsDetail };
    } 
    // If doctor has contract but no detail, try to infer from total
    else if (doctor.contract && doctor.contractShifts > 0) {
      // Default to all day shifts if we only have the total
      contractShiftsObj = { 
        day: doctor.contractShifts, 
        evening: 0, 
        night: 0 
      };
      
      // Log warning about missing detail
      console.warn(`Doctor ${doctor.name} has contract shifts (${doctor.contractShifts}) but no breakdown detail`);
    }
    
    setNewDoctor({ 
      ...doctor, 
      hasContractShifts: doctor.contract || false,
      contractShifts: contractShiftsObj,
      maxShiftsPerWeek: doctor.maxShiftsPerWeek || 0
    });
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

  // Handle contract shift input changes
  const handleContractShiftChange = (shiftType, value) => {
    // Ensure value is a valid number
    const numValue = parseInt(value) || 0;
    
    setNewDoctor({
      ...newDoctor,
      contractShifts: {
        ...newDoctor.contractShifts,
        [shiftType]: numValue
      }
    });
  };

  // Handle checkbox change
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    const updatedDoctor = { ...newDoctor, [name]: checked };
    
    // If contract shifts checkbox is checked, disable preferences
    if (name === 'hasContractShifts' && checked) {
      updatedDoctor.pref = 'None';
    }
    
    setNewDoctor(updatedDoctor);
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

    // Create a copy of the doctor object to modify
    const doctorToSave = { ...newDoctor };

    // Validate contract shifts if checkbox is checked
    if (doctorToSave.hasContractShifts) {
      const { day, evening, night } = doctorToSave.contractShifts;
      if (day === 0 && evening === 0 && night === 0) {
        setSnackbar({
          open: true,
          message: 'Please specify at least one shift in the contract',
          severity: 'error'
        });
        return;
      }
      
      // Calculate total shifts for the doctor's contract
      const totalShifts = day + evening + night;
      
      // Store both the detailed breakdown and the total
      doctorToSave.contract = true;
      doctorToSave.contractShiftsDetail = {
        day, 
        evening, 
        night
      };
      doctorToSave.contractShifts = totalShifts;
      
      console.log(`Setting contract shifts for ${doctorToSave.name}: ${totalShifts} total shifts (${day} day, ${evening} evening, ${night} night)`);
    } else {
      // Ensure contract properties are cleared if checkbox is unchecked
      doctorToSave.contract = false;
      doctorToSave.contractShifts = 0;
      doctorToSave.contractShiftsDetail = null;
    }

    // Validate maxShiftsPerWeek as a non-negative integer
    if (doctorToSave.maxShiftsPerWeek < 0) {
      setSnackbar({
        open: true,
        message: 'Maximum shifts per week cannot be negative',
        severity: 'error'
      });
      return;
    }
    
    // Ensure it's saved as a number
    doctorToSave.maxShiftsPerWeek = parseInt(doctorToSave.maxShiftsPerWeek) || 0;

    let updatedDoctors;
    if (editingDoctor !== null) {
      // Update existing doctor
      updatedDoctors = [...localDoctors];
      updatedDoctors[editingDoctor] = doctorToSave;
      setSnackbar({
        open: true,
        message: `Dr. ${doctorToSave.name} updated successfully`,
        severity: 'success'
      });
    } else {
      // Add new doctor
      updatedDoctors = [...localDoctors, doctorToSave];
      setSnackbar({
        open: true,
        message: `Dr. ${doctorToSave.name} added successfully`,
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

  // Render contract shift chips
  const renderContractShiftChips = (contractShifts) => {
    if (!contractShifts) return <Typography variant="body2" color="text.secondary">None</Typography>;
    
    // Handle string format (backwards compatibility)
    if (typeof contractShifts === 'string') {
      return <Chip label={contractShifts} color="warning" size="small" />;
    }
    
    // Check if we have detailed breakdown
    if (typeof contractShifts === 'number') {
      // If we have contractShiftsDetail, use that instead
      const doctor = localDoctors.find(d => d.contractShifts === contractShifts && d.contractShiftsDetail);
      if (doctor && doctor.contractShiftsDetail) {
        contractShifts = doctor.contractShiftsDetail;
      } else {
        // If we only have the total, show it as a single chip
        return <Chip label={`${contractShifts} shifts total`} color="warning" size="small" />;
      }
    }
    
    const { day, evening, night } = contractShifts;
    const shifts = [];
    
    if (day > 0) {
      shifts.push(
        <Chip
          key="day"
          icon={shiftTypes.day.icon}
          label={`${day} ${shiftTypes.day.label}`}
          size="small"
          color={shiftTypes.day.color}
          sx={{ mr: 0.5, mb: 0.5 }}
        />
      );
    }
    
    if (evening > 0) {
      shifts.push(
        <Chip
          key="evening"
          icon={shiftTypes.evening.icon}
          label={`${evening} ${shiftTypes.evening.label}`}
          size="small"
          color={shiftTypes.evening.color}
          sx={{ mr: 0.5, mb: 0.5 }}
        />
      );
    }
    
    if (night > 0) {
      shifts.push(
        <Chip
          key="night"
          icon={shiftTypes.night.icon}
          label={`${night} ${shiftTypes.night.label}`}
          size="small"
          color={shiftTypes.night.color}
          sx={{ mb: 0.5 }}
        />
      );
    }
    
    return shifts.length > 0 ? 
      <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>{shifts}</Box> : 
      <Typography variant="body2" color="text.secondary">None</Typography>;
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

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Doctor List</Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={handleAddDoctor}
            sx={{ mr: 2 }}
            color="error"
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
      </Box>

      {/* Add ConfigImportExport component */}
      <ConfigImportExport 
        doctors={doctors} 
        setDoctors={setDoctors} 
        holidays={{}} 
        setHolidays={() => {}}
        availability={{}} 
        setAvailability={() => {}}
      />

      <Paper elevation={1} sx={{ mb: 4 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="subtitle2">Name</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Seniority</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Preference</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Contract Shifts</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Max Shifts/Week</Typography></TableCell>
                <TableCell><Typography variant="subtitle2">Actions</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {localDoctors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No doctors configured. Add a doctor to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                localDoctors.map((doctor, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body2">{doctor.name}</Typography>
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
                      {doctor.hasContractShifts ? 
                        renderContractShiftChips(doctor.contractShiftsDetail || doctor.contractShifts) : 
                        <Typography variant="body2" color="text.secondary">None</Typography>
                      }
                    </TableCell>
                    <TableCell>
                      {doctor.maxShiftsPerWeek > 0 ? 
                        <Chip 
                          label={`${doctor.maxShiftsPerWeek} shifts`} 
                          color="warning" 
                          size="small"
                        /> : 
                        <Typography variant="body2" color="text.secondary">No limit</Typography>
                      }
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton 
                          color="primary" 
                          onClick={() => handleEditDoctor(doctor, index)}
                          size="small"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton 
                          color="error" 
                          onClick={() => handleRemoveDoctor(index)}
                          size="small"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Legend */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Contract Shift Types
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Grid container spacing={1}>
          {Object.entries(shiftTypes).map(([type, details]) => (
            <Grid item xs={6} sm={3} key={type}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip 
                  icon={details.icon} 
                  label={details.label} 
                  size="small" 
                  color={details.color}
                />
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

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
              <FormControl fullWidth disabled={newDoctor.hasContractShifts}>
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
                {newDoctor.hasContractShifts && (
                  <FormHelperText>Disabled when contract shifts are specified</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Card variant="outlined">
                <CardHeader
                  title={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            name="hasContractShifts"
                            checked={newDoctor.hasContractShifts}
                            onChange={handleCheckboxChange}
                            color="primary"
                          />
                        }
                        label={<Typography variant="subtitle1">Contract Shift Requirements</Typography>}
                        sx={{ mr: 0 }}
                      />
                    </Box>
                  }
                  subheader={newDoctor.hasContractShifts ? 
                    "Specify how many of each shift type the doctor is required to work per month" : 
                    "Enable if the doctor has a contract specifying required shifts"}
                />
                {newDoctor.hasContractShifts && (
                  <>
                    <Divider />
                    <CardContent>
                      <Grid container spacing={2}>
                        {Object.entries(shiftTypes).map(([type, details]) => (
                          <Grid item xs={12} key={type}>
                            <TextField
                              label={`${details.label} Shifts Per Month`}
                              type="number"
                              fullWidth
                              size="small"
                              variant="outlined"
                              InputProps={{ 
                                inputProps: { min: 0 },
                                startAdornment: (
                                  <InputAdornment position="start">
                                    {details.icon}
                                  </InputAdornment>
                                )
                              }}
                              value={newDoctor.contractShifts[type]}
                              onChange={(e) => handleContractShiftChange(type, e.target.value)}
                            />
                          </Grid>
                        ))}
                        
                        {/* Maximum Shifts Per Week field moved inside contract section */}
                        <Grid item xs={12}>
                          <Divider sx={{ my: 2 }} />
                          <Typography variant="subtitle2" gutterBottom>
                            Weekly Shift Limit
                          </Typography>
                          <TextField
                            label="Maximum Shifts Per Week"
                            type="number"
                            fullWidth
                            size="small"
                            variant="outlined"
                            InputProps={{ 
                              inputProps: { min: 0 },
                            }}
                            value={newDoctor.maxShiftsPerWeek}
                            onChange={(e) => handleInputChange({
                              target: {
                                name: 'maxShiftsPerWeek',
                                value: parseInt(e.target.value) || 0
                              }
                            })}
                            helperText="Hard constraint: Maximum number of shifts the doctor can work in a single week (0 = no limit)"
                          />
                        </Grid>
                      </Grid>
                    </CardContent>
                  </>
                )}
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmitDoctor} variant="contained" color="primary">
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