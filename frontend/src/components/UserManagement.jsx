import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  TextField,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  AdminPanelSettings as AdminIcon,
  LocalHospital as HospitalIcon,
  Person as PersonIcon,
  Security as SecurityIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const UserManagement = () => {
  const { getAllUsers, updateUserProfile, currentUser, hasAdminAccess } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    seniority: '',
    pref: '',
    isAdmin: false,
    isHersAdmin: false
  });

  // Load doctors on component mount
  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    try {
      setLoading(true);
      setError(null);
      const doctorsData = await getAllUsers(); // This now gets doctors
      setDoctors(doctorsData);
    } catch (error) {
      console.error('Error loading doctors:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    setFormData({
      name: doctor.name || '',
      seniority: doctor.seniority || 'Junior',
      pref: doctor.pref || 'None',
      isAdmin: doctor.isAdmin || false,
      isHersAdmin: doctor.isHersAdmin || false
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedDoctor(null);
    setFormData({
      name: '',
      seniority: '',
      pref: '',
      isAdmin: false,
      isHersAdmin: false
    });
  };

  const handleSaveDoctor = async () => {
    if (!selectedDoctor) return;

    try {
      await updateUserProfile(selectedDoctor.id, formData);
      await loadDoctors(); // Reload doctors
      handleCloseDialog();
    } catch (error) {
      console.error('Error updating doctor:', error);
      setError(error.message);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <AdminIcon fontSize="small" />;
      case 'doctor':
        return <HospitalIcon fontSize="small" />;
      default:
        return <PersonIcon fontSize="small" />;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'doctor':
        return 'primary';
      default:
        return 'default';
    }
  };

  if (!hasAdminAccess()) {
    return (
      <Alert severity="warning">
        You don't have permission to access user management.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          Loading users...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Doctor Access Management
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage doctor permissions and HERS admin access. Toggle "H.E.R.S. Admin Access" to grant doctors access to this admin portal.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Seniority</TableCell>
              <TableCell>Preference</TableCell>
              <TableCell>HERS Admin Access</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {doctors.map((doctor) => (
              <TableRow key={doctor.id}>
                <TableCell>
                  {doctor.email}
                  {doctor.id === currentUser?.uid && (
                    <Chip 
                      label="You" 
                      size="small" 
                      color="primary" 
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell>{doctor.name || 'N/A'}</TableCell>
                <TableCell>
                  <Chip
                    icon={doctor.isHersAdmin ? <AdminIcon fontSize="small" /> : <HospitalIcon fontSize="small" />}
                    label={doctor.isHersAdmin ? "Admin" : "Doctor"}
                    size="small"
                    color={doctor.isHersAdmin ? "error" : "primary"}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={doctor.seniority || 'Junior'}
                    size="small"
                    color={doctor.seniority === 'Senior' ? 'primary' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={doctor.pref || 'None'}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {doctor.isHersAdmin ? (
                    <Chip 
                      icon={<SecurityIcon />} 
                      label="HERS Admin" 
                      size="small" 
                      color="warning" 
                    />
                  ) : (
                    <Chip 
                      label="No Access" 
                      size="small" 
                      variant="outlined" 
                    />
                  )}
                </TableCell>
                <TableCell>
                  {doctor.createdAt ? 
                    new Date(doctor.createdAt.seconds * 1000).toLocaleDateString() : 
                    'N/A'
                  }
                </TableCell>
                <TableCell>
                  <Tooltip title="Edit Doctor">
                    <IconButton 
                      size="small" 
                      onClick={() => handleEditDoctor(doctor)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {doctors.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="text.secondary">
            No doctors found
          </Typography>
        </Box>
      )}

      {/* Edit Doctor Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Doctor: {selectedDoctor?.name || selectedDoctor?.email}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              margin="normal"
            />
            
            <TextField
              fullWidth
              label="Seniority"
              value={formData.seniority}
              onChange={(e) => setFormData({ ...formData, seniority: e.target.value })}
              margin="normal"
              select
              SelectProps={{ native: true }}
            >
              <option value="Junior">Junior</option>
              <option value="Senior">Senior</option>
            </TextField>

            <TextField
              fullWidth
              label="Preference"
              value={formData.pref}
              onChange={(e) => setFormData({ ...formData, pref: e.target.value })}
              margin="normal"
              select
              SelectProps={{ native: true }}
            >
              <option value="None">None</option>
              <option value="Day">Day</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.isHersAdmin}
                  onChange={(e) => setFormData({ ...formData, isHersAdmin: e.target.checked })}
                />
              }
              label="H.E.R.S. Admin Access"
              sx={{ mt: 2, display: 'block' }}
            />

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>H.E.R.S. Admin Access:</strong> Grants access to the Hospital Emergency Room Scheduler admin portal. 
                Doctors without this access can still use the availability app but cannot access this admin interface.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            Cancel
          </Button>
          <Button 
            onClick={handleSaveDoctor} 
            variant="contained"
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement; 