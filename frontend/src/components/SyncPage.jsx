import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  CloudDownload as CloudDownloadIcon,
  CloudSync as CloudSyncIcon,
  PersonOutline as DoctorIcon,
  CalendarMonth as CalendarIcon,
  Info as InfoIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  ErrorOutline as ErrorIcon
} from '@mui/icons-material';
import { CloudSyncService } from '../services/CloudSyncService';
import { getMonthName } from '../utils/dateUtils';

const SyncPage = ({ doctors, setDoctors, availability, setAvailability }) => {
  // State for tracking sync operations
  const [loading, setLoading] = useState({
    doctors: false,
    availability: false,
    completion: false
  });
  const [results, setResults] = useState({
    doctors: null,
    availability: null
  });
  const [errors, setErrors] = useState({
    doctors: null,
    availability: null,
    completion: null
  });
  const [lastSynced, setLastSynced] = useState({
    doctors: localStorage.getItem('lastDoctorSync') ? new Date(localStorage.getItem('lastDoctorSync')) : null,
    availability: localStorage.getItem('lastAvailabilitySync') ? new Date(localStorage.getItem('lastAvailabilitySync')) : null,
    completion: localStorage.getItem('lastCompletionSync') ? new Date(localStorage.getItem('lastCompletionSync')) : null
  });
  
  // State for month selection and completion status
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(2025); // Hard-coded to 2025 as per your application
  const [completionStatus, setCompletionStatus] = useState(null);

  // Function to sync doctor data
  const syncDoctors = async () => {
    setLoading(prev => ({ ...prev, doctors: true }));
    setErrors(prev => ({ ...prev, doctors: null }));
    
    try {
      // Fetch doctor data from the cloud
      const cloudDoctors = await CloudSyncService.fetchDoctorPreferences();
      
      // Merge with existing data
      const mergedDoctors = CloudSyncService.mergeDoctors(doctors, cloudDoctors);
      
      // Update app state
      setDoctors(mergedDoctors);
      
      // Update results state
      const now = new Date();
      setResults(prev => ({ 
        ...prev, 
        doctors: {
          count: cloudDoctors.length,
          timestamp: now,
          data: cloudDoctors
        }
      }));
      
      // Save timestamp to localStorage
      localStorage.setItem('lastDoctorSync', now.toISOString());
      setLastSynced(prev => ({ ...prev, doctors: now }));
      
    } catch (error) {
      console.error('Error syncing doctor data:', error);
      setErrors(prev => ({ ...prev, doctors: error.toString() }));
    } finally {
      setLoading(prev => ({ ...prev, doctors: false }));
    }
  };

  // Function to sync availability data
  const syncAvailability = async () => {
    setLoading(prev => ({ ...prev, availability: true }));
    setErrors(prev => ({ ...prev, availability: null }));
    
    try {
      // Fetch availability data from the cloud
      const cloudAvailability = await CloudSyncService.fetchDoctorAvailability();
      
      // Merge with existing data
      const mergedAvailability = CloudSyncService.mergeAvailability(availability, cloudAvailability);
      
      // Update app state
      setAvailability(mergedAvailability);
      
      // Update results state
      const now = new Date();
      setResults(prev => ({ 
        ...prev, 
        availability: {
          count: Object.keys(cloudAvailability).length,
          timestamp: now,
          data: cloudAvailability
        }
      }));
      
      // Save timestamp to localStorage
      localStorage.setItem('lastAvailabilitySync', now.toISOString());
      setLastSynced(prev => ({ ...prev, availability: now }));
      
    } catch (error) {
      console.error('Error syncing availability data:', error);
      setErrors(prev => ({ ...prev, availability: error.toString() }));
    } finally {
      setLoading(prev => ({ ...prev, availability: false }));
    }
  };

  // Function to sync all data
  const syncAll = async () => {
    await syncDoctors();
    await syncAvailability();
    await checkMonthCompletion();
  };
  
  // Function to check month completion status
  const checkMonthCompletion = async () => {
    setLoading(prev => ({ ...prev, completion: true }));
    setErrors(prev => ({ ...prev, completion: null }));
    setCompletionStatus(null);
    
    try {
      // Fetch month completion status
      const monthStatus = await CloudSyncService.checkMonthCompletionForAllDoctors(
        selectedYear, 
        selectedMonth
      );
      
      // Update completion status
      setCompletionStatus(monthStatus);
      
      // Save timestamp to localStorage
      const now = new Date();
      localStorage.setItem('lastCompletionSync', now.toISOString());
      setLastSynced(prev => ({ ...prev, completion: now }));
      
    } catch (error) {
      console.error('Error checking month completion:', error);
      setErrors(prev => ({ ...prev, completion: error.toString() }));
    } finally {
      setLoading(prev => ({ ...prev, completion: false }));
    }
  };
  
  // Check month completion when month/year changes
  useEffect(() => {
    if (doctors.length > 0) {
      checkMonthCompletion();
    }
  }, [selectedMonth, selectedYear]);

  // Format time to human-readable
  const formatTime = (date) => {
    if (!date) return 'Never';
    return date.toLocaleString();
  };

  // Get relative time description
  const getTimeAgo = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);
    
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Cloud Synchronization
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Synchronize doctor information and availability data from the cloud portal. This allows you to import
          the latest doctor preferences and schedules that have been submitted remotely.
        </Typography>
      </Box>

      {/* Sync Action Card */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <CloudSyncIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Sync Data from Cloud
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose what data you want to download from the cloud portal
          </Typography>
          
          <Button
            variant="contained"
            color="primary"
            startIcon={<CloudDownloadIcon />}
            onClick={syncAll}
            disabled={loading.doctors || loading.availability || loading.completion}
            sx={{ m: 1 }}
            size="large"
          >
            Sync All Data
          </Button>
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DoctorIcon sx={{ mr: 1 }} />
                    Doctor Preferences
                  </Box>
                }
                subheader={
                  lastSynced.doctors ? 
                  `Last synced: ${formatTime(lastSynced.doctors)} (${getTimeAgo(lastSynced.doctors)})` : 
                  'Not yet synced'
                }
              />
              <Divider />
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" paragraph>
                    Sync doctor information including names, seniority levels, and shift preferences from the cloud.
                  </Typography>
                  
                  {results.doctors && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Successfully synced {results.doctors.count} doctors at {results.doctors.timestamp.toLocaleString()}
                    </Alert>
                  )}
                  
                  {errors.doctors && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      Error: {errors.doctors}
                    </Alert>
                  )}
                </Box>
                
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={loading.doctors ? <CircularProgress size={20} /> : <CloudDownloadIcon />}
                  onClick={syncDoctors}
                  disabled={loading.doctors}
                  fullWidth
                >
                  {loading.doctors ? 'Syncing...' : 'Sync Doctor Data'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CalendarIcon sx={{ mr: 1 }} />
                    Doctor Availability
                  </Box>
                }
                subheader={
                  lastSynced.availability ? 
                  `Last synced: ${formatTime(lastSynced.availability)} (${getTimeAgo(lastSynced.availability)})` : 
                  'Not yet synced'
                }
              />
              <Divider />
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" paragraph>
                    Sync doctor availability data including unavailable dates and shift preferences for specific dates.
                  </Typography>
                  
                  {results.availability && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Successfully synced availability for {results.availability.count} doctors at {results.availability.timestamp.toLocaleString()}
                    </Alert>
                  )}
                  
                  {errors.availability && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      Error: {errors.availability}
                    </Alert>
                  )}
                </Box>
                
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={loading.availability ? <CircularProgress size={20} /> : <CloudDownloadIcon />}
                  onClick={syncAvailability}
                  disabled={loading.availability}
                  fullWidth
                >
                  {loading.availability ? 'Syncing...' : 'Sync Availability Data'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Month Completion Status Card - NEW SECTION */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            <CalendarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Doctor Schedule Completion Status
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="month-select-label">Month</InputLabel>
              <Select
                labelId="month-select-label"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                label="Month"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <MenuItem key={month} value={month}>
                    {getMonthName(month)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <IconButton
              color="primary"
              onClick={checkMonthCompletion}
              disabled={loading.completion}
              size="small"
              sx={{ ml: 1 }}
              aria-label="Refresh completion status"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          Check which doctors have completed their availability settings for the selected month.
          Incomplete schedules may affect the accuracy of the scheduling algorithm.
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {loading.completion ? (
          <Box sx={{ py: 3 }}>
            <Typography variant="body2" align="center" sx={{ mb: 2 }}>
              Checking completion status for {getMonthName(selectedMonth - 1)} {selectedYear}...
            </Typography>
            <LinearProgress />
          </Box>
        ) : errors.completion ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Error checking completion status: {errors.completion}
          </Alert>
        ) : completionStatus ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                              <Typography variant="subtitle1">
                {getMonthName(selectedMonth)} {selectedYear} Completion Status:
              </Typography>
              
              <Chip 
                icon={completionStatus.isComplete ? <CheckIcon /> : <WarningIcon />}
                label={completionStatus.isComplete ? "All Complete" : "Incomplete"}
                color={completionStatus.isComplete ? "success" : "warning"}
                variant="outlined"
              />
            </Box>
            
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {completionStatus.stats.completed} of {completionStatus.stats.total} doctors have fully completed their schedule
                </Typography>
                
                <Typography variant="body2" color="text.secondary">
                  {completionStatus.stats.overallPercentage}% Complete overall
                </Typography>
              </Box>
              
              <LinearProgress 
                variant="determinate" 
                value={completionStatus.stats.overallPercentage}
                color={completionStatus.stats.overallPercentage === 100 ? "success" : 
                       completionStatus.stats.overallPercentage > 75 ? "info" :
                       completionStatus.stats.overallPercentage > 50 ? "warning" : "error"}
                sx={{ height: 8, borderRadius: 4 }}
              />
              
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                {completionStatus.stats.totalDaysCompleted} of {completionStatus.stats.totalPossibleDays} total days completed across all doctors
              </Typography>
            </Box>
            
            {!completionStatus.isComplete && (
              <Alert 
                severity="warning" 
                icon={<InfoIcon />}
                sx={{ mb: 3 }}
              >
                The scheduling algorithm may not produce optimal results until all doctors have completed
                their availability for this month.
              </Alert>
            )}
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {completionStatus.isComplete ? 
                    <CheckIcon fontSize="small" color="success" sx={{ mr: 1 }} /> :
                    <ErrorIcon fontSize="small" color="error" sx={{ mr: 1 }} />
                  }
                  Doctors completion status:
                </Box>
              </Typography>
              
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell width="50%">Doctor Name</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Completion</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {completionStatus.doctorDetails.map((doctor, index) => (
                      <TableRow key={index} hover>
                        <TableCell>{doctor.name}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={doctor.completed ? "Completed" : "Not Completed"} 
                            size="small" 
                            color={doctor.completed ? "success" : "error"}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Box sx={{ width: '100%', mr: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={doctor.percentComplete}
                                color={doctor.percentComplete === 100 ? "success" : 
                                       doctor.percentComplete > 75 ? "info" :
                                       doctor.percentComplete > 50 ? "warning" : "error"}
                                sx={{ height: 8, borderRadius: 4 }}
                              />
                            </Box>
                            <Box sx={{ minWidth: 65, textAlign: 'right' }}>
                              <Typography variant="body2" color="text.secondary">
                                {`${doctor.percentComplete}%`}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {`${doctor.daysCompleted}/${doctor.totalDays} days`}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            
            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Last checked: {lastSynced.completion ? formatTime(lastSynced.completion) : 'Never'}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              No completion data available. Sync the doctor data to check completion status.
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<RefreshIcon />}
              onClick={checkMonthCompletion}
            >
              Check Completion Status
            </Button>
          </Box>
        )}
      </Paper>

      {/* Sync Results */}
      {(results.doctors || results.availability) && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            <CheckIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Sync Results
          </Typography>
          
          <Grid container spacing={3}>
            {results.doctors && (
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title="Doctor Data Synced" />
                  <Divider />
                  <CardContent>
                    <Typography variant="body2" paragraph>
                      Successfully synced {results.doctors.count} doctors at {results.doctors.timestamp.toLocaleString()}
                    </Typography>
                    
                    {results.doctors.data.length > 0 && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          Synced Doctors:
                        </Typography>
                        <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                          {results.doctors.data.map((doctor, index) => (
                            <ListItem key={index} divider={index < results.doctors.data.length - 1}>
                              <ListItemText 
                                primary={doctor.name}
                                secondary={
                                  <Box>
                                    <Chip 
                                      label={doctor.seniority} 
                                      size="small" 
                                      color={doctor.seniority === 'Senior' ? 'primary' : 'default'}
                                      sx={{ mr: 1 }}
                                    />
                                    <Chip 
                                      label={doctor.pref || 'No Preference'} 
                                      size="small" 
                                      color={doctor.pref ? 'secondary' : 'default'}
                                    />
                                  </Box>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}
            
            {results.availability && (
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title="Availability Data Synced" />
                  <Divider />
                  <CardContent>
                    <Typography variant="body2" paragraph>
                      Successfully synced availability for {results.availability.count} doctors at {results.availability.timestamp.toLocaleString()}
                    </Typography>
                    
                    {Object.keys(results.availability.data).length > 0 && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          Doctors with availability settings:
                        </Typography>
                        <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                          {Object.keys(results.availability.data).map((doctorName, index) => {
                            const doctorAvail = results.availability.data[doctorName];
                            const entriesCount = Object.keys(doctorAvail).length;
                            
                            return (
                              <ListItem key={index} divider={index < Object.keys(results.availability.data).length - 1}>
                                <ListItemText 
                                  primary={doctorName}
                                  secondary={`${entriesCount} availability entries`}
                                />
                              </ListItem>
                            );
                          })}
                        </List>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default SyncPage;