import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Checkbox,
  TextField,
  MenuItem,
  Grid,
  LinearProgress,
  Alert,
  AlertTitle,
  Divider,
  Card,
  CardContent,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  PlayArrow as StartIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';

const GenerateSchedule = ({ doctors, holidays, availability, setSchedule, apiUrl }) => {
  // Change default to 'monthly' instead of 'yearly'
  const [scheduleType, setScheduleType] = useState('monthly');
  const [month, setMonth] = useState(new Date().getMonth() + 1); // Current month (1-12)
  const [optimizing, setOptimizing] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [error, setError] = useState(null);
  const [advancedOptions, setAdvancedOptions] = useState(false);
  
  // Weight optimization options - only available for monthly scheduling
  const [useWeightOptimization, setUseWeightOptimization] = useState(false);
  const [weightMaxIterations, setWeightMaxIterations] = useState(20);
  const [weightParallelJobs, setWeightParallelJobs] = useState(1);
  const [weightTimeLimit, setWeightTimeLimit] = useState(10);
  
  // For polling task progress
  const pollingInterval = useRef(null);
  const abortControllerRef = useRef(null);

  // Clean up polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle schedule type change
  const handleScheduleTypeChange = (event) => {
    const newType = event.target.value;
    setScheduleType(newType);
    
    // If switching to yearly, disable weight optimization
    if (newType === 'yearly') {
      setUseWeightOptimization(false);
    }
  };

  // Handle month change
  const handleMonthChange = (event) => {
    setMonth(parseInt(event.target.value, 10));
  };

  // Toggle advanced options
  const toggleAdvancedOptions = () => {
    setAdvancedOptions(!advancedOptions);
  };

  // Start generation process
  const generate = async () => {
    try {
      setOptimizing(true);
      setProgress(0);
      setProgressMessage('Preparing optimization...');
      setError(null);
      setGeneratedSchedule(null);
      
      if (useWeightOptimization && scheduleType === 'monthly') {
        await generateWithWeightOptimization();
      } else if (scheduleType === 'monthly') {
        await generateMonthlySchedule();
      } else {
        await generateYearlySchedule();
      }
    } catch (error) {
      console.error('Error generating schedule:', error);
      setError(error.toString());
      setOptimizing(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  // Generate yearly schedule
  const generateYearlySchedule = async () => {
    try {
      const result = await generateOptimizedSchedule('/optimize', {
        doctors,
        holidays,
        availability,
        scheduling_mode: 'yearly'
      });
      
      handleScheduleResult(result);
    } catch (error) {
      console.error('Yearly optimization API error:', error);
      setError(error.toString());
      setOptimizing(false);
    }
  };

  // Generate monthly schedule
  const generateMonthlySchedule = async () => {
    try {
      const result = await generateOptimizedSchedule('/optimize', {
        doctors,
        holidays,
        availability,
        scheduling_mode: 'monthly',
        month
      });
      
      handleScheduleResult(result);
    } catch (error) {
      console.error('Monthly optimization API error:', error);
      setError(error.toString());
      setOptimizing(false);
    }
  };

  // Generate with weight optimization
  const generateWithWeightOptimization = async () => {
    try {
      const result = await generateOptimizedSchedule('/optimize-weights', {
        doctors,
        holidays,
        availability,
        month,
        max_iterations: weightMaxIterations,
        parallel_jobs: weightParallelJobs,
        time_limit_minutes: weightTimeLimit
      });
      
      handleScheduleResult(result);
    } catch (error) {
      console.error('Weight optimization API error:', error);
      setError(error.toString());
      setOptimizing(false);
    }
  };

  // Generic function to handle API calls with progress tracking
  const generateOptimizedSchedule = async (endpoint, data) => {
    try {
      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;
      
      // Start the optimization task
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (result.task_id) {
        // Task started, begin polling for progress
        setTaskId(result.task_id);
        return await pollTaskProgress(result.task_id);
      } else {
        // Task completed immediately
        return result;
      }
    } catch (error) {
      // Re-throw the error to be handled by the caller
      throw error;
    }
  };

  // Poll task progress
  const pollTaskProgress = (task_id) => {
    return new Promise((resolve, reject) => {
      // Clear any existing polling interval
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
      
      // Start polling
      pollingInterval.current = setInterval(async () => {
        try {
          // Use the correct endpoint as shown in the backend code
          const response = await fetch(`${apiUrl}/task/${task_id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (!response.ok) {
            clearInterval(pollingInterval.current);
            reject(new Error(`Failed to fetch task progress: ${response.status}`));
            return;
          }
          
          const taskInfo = await response.json();
          
          // Update progress
          if (taskInfo.progress !== undefined) {
            setProgress(taskInfo.progress);
          }
          
          if (taskInfo.message) {
            setProgressMessage(taskInfo.message);
          }
          
          // Check if task is complete
          if (taskInfo.status === "COMPLETED") {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
            
            // The result is already included in the taskInfo for completed tasks
            if (taskInfo.result) {
              resolve(taskInfo.result);
            } else {
              reject(new Error("Task completed but no result was returned"));
            }
          } else if (taskInfo.status === "ERROR") {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
            reject(new Error(taskInfo.message || 'Task failed'));
          }
          // Otherwise, continue polling
          
        } catch (error) {
          console.error('Error polling task progress:', error);
          // Don't clear the interval or reject here - allow it to retry
          // unless the error is because we aborted the request
          if (error.name === 'AbortError') {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
            reject(new Error('Request aborted'));
          }
        }
      }, 1000); // Poll every second
    });
  };

  // Handle schedule result
  const handleScheduleResult = (result) => {
    if (result.error) {
      setError(result.error);
      setOptimizing(false);
      return;
    }
    
    if (result.schedule) {
      setGeneratedSchedule(result.schedule);
      // Set the schedule in parent component to update global state
      setSchedule(result.schedule);
    } else if (result.weights && result.schedule) {
      // Weight optimization result
      setGeneratedSchedule(result.schedule);
      // Set the schedule in parent component to update global state
      setSchedule(result.schedule);
    }
    
    // Clear task polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    setOptimizing(false);
    setProgress(100);
    setProgressMessage('Schedule generation complete!');
  };

  // Cancel optimization
  const cancelOptimization = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    setOptimizing(false);
    setProgress(0);
    setProgressMessage('');
    setTaskId(null);
  };

  // Go to dashboard - should only be enabled when schedule is generated
  const goToDashboard = () => {
    if (generatedSchedule) {
      // This will use the schedule already set in parent component
      // Additional call to ensure the parent state is updated
      setSchedule(generatedSchedule);
    }
  };

  // Get month name from number
  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  // Prevent optimization if required data is missing
  const canOptimize = doctors && doctors.length > 0 && 
                     holidays && Object.keys(holidays).length > 0;

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Generate Schedule
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Generate an optimized schedule for hospital staff based on doctor availability,
          preferences, and constraints.
        </Typography>
      </Box>

      {!canOptimize && (
        <Alert severity="warning" sx={{ mb: 4 }}>
          <AlertTitle>Missing Data</AlertTitle>
          You need to have doctors and holidays configured before generating a schedule.
          Please go to the Doctor Configuration and Holiday Configuration sections to add the necessary data.
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Schedule Options
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Schedule Type
              </Typography>
              <RadioGroup
                name="schedule-type"
                value={scheduleType}
                onChange={handleScheduleTypeChange}
              >
                <FormControlLabel 
                  value="monthly" 
                  control={<Radio />} 
                  label="Monthly Schedule (Recommended)" 
                />
                {/* <FormControlLabel 
                  value="yearly" 
                  control={<Radio />} 
                  label="Yearly Schedule (Full Year)" 
                /> */}
              </RadioGroup>
            </FormControl>
          </Grid>
          
          {scheduleType === 'monthly' && (
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Select Month
              </Typography>
              <FormControl fullWidth>
                <TextField
                  select
                  value={month}
                  onChange={handleMonthChange}
                  variant="outlined"
                  fullWidth
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <MenuItem key={m} value={m}>
                      {getMonthName(m)} 2025
                    </MenuItem>
                  ))}
                </TextField>
              </FormControl>
              
              {/* Only show weight optimization for monthly scheduling */}
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={useWeightOptimization}
                      onChange={(e) => setUseWeightOptimization(e.target.checked)}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2">Use Weight Optimization</Typography>
                      <Tooltip title="Weight optimization tries different constraint weights to find the best schedule. This takes longer but may produce better results.">
                        <IconButton size="small">
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                />
              </Box>
            </Grid>
          )}
        </Grid>
        
        {/* Advanced options - only show for monthly with weight optimization */}
        {scheduleType === 'monthly' && useWeightOptimization && (
          <Box sx={{ mt: 2 }}>
            <Button
              startIcon={<SettingsIcon />}
              onClick={toggleAdvancedOptions}
              variant="outlined"
              size="small"
              sx={{ mb: 2 }}
            >
              {advancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
            </Button>
            
            {advancedOptions && (
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={4}>
                  <Typography variant="subtitle2" gutterBottom>
                    Max Iterations
                  </Typography>
                  <TextField
                    type="number"
                    value={weightMaxIterations}
                    onChange={(e) => setWeightMaxIterations(parseInt(e.target.value, 10))}
                    InputProps={{ inputProps: { min: 5, max: 100 } }}
                    variant="outlined"
                    fullWidth
                  />
                  <Typography variant="caption" color="text.secondary">
                    Number of weight configurations to try (5-100)
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <Typography variant="subtitle2" gutterBottom>
                    Parallel Jobs
                  </Typography>
                  <TextField
                    type="number"
                    value={weightParallelJobs}
                    onChange={(e) => setWeightParallelJobs(parseInt(e.target.value, 10))}
                    InputProps={{ inputProps: { min: 1, max: 4 } }}
                    variant="outlined"
                    fullWidth
                  />
                  <Typography variant="caption" color="text.secondary">
                    Number of parallel optimization jobs (1-4)
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <Typography variant="subtitle2" gutterBottom>
                    Time Limit (minutes)
                  </Typography>
                  <TextField
                    type="number"
                    value={weightTimeLimit}
                    onChange={(e) => setWeightTimeLimit(parseInt(e.target.value, 10))}
                    InputProps={{ inputProps: { min: 1, max: 30 } }}
                    variant="outlined"
                    fullWidth
                  />
                  <Typography variant="caption" color="text.secondary">
                    Maximum optimization time (1-30 minutes)
                  </Typography>
                </Grid>
              </Grid>
            )}
          </Box>
        )}
        
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<StartIcon />}
            onClick={generate}
            disabled={optimizing || !canOptimize}
          >
            {optimizing ? 'Optimizing...' : 'Generate Schedule'}
          </Button>
          
          {generatedSchedule && !optimizing && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<DashboardIcon />}
              onClick={goToDashboard}
            >
              Go to Dashboard
            </Button>
          )}
          
          {optimizing && (
            <Button
              variant="outlined"
              color="error"
              onClick={cancelOptimization}
            >
              Cancel
            </Button>
          )}
        </Box>
      </Paper>
      
      {/* Progress Section */}
      {optimizing && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Optimization Progress
            </Typography>
            
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              sx={{ height: 10, borderRadius: 5, mb: 2 }} 
            />
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {progressMessage}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {`${Math.round(progress)}%`}
              </Typography>
            </Box>
            
            <Typography variant="caption" color="text.secondary">
              This process may take several minutes depending on the complexity of the schedule.
              {scheduleType === 'yearly' && ' Yearly schedules take longer to generate than monthly schedules.'}
              {useWeightOptimization && ' Weight optimization requires additional processing time.'}
            </Typography>
          </CardContent>
        </Card>
      )}
      
      {/* Result Section */}
      {!optimizing && generatedSchedule && (
        <Card sx={{ mb: 4, bgcolor: 'success.light' }}>
          <CardContent>
            <Typography variant="h6" color="white" gutterBottom>
              Schedule Generated Successfully!
            </Typography>
            
            <Typography variant="body2" color="white" sx={{ mb: 2 }}>
              {scheduleType === 'monthly' 
                ? `Monthly schedule for ${getMonthName(month)} 2025 has been generated.`
                : 'Yearly schedule for 2025 has been generated.'}
            </Typography>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<DashboardIcon />}
              onClick={goToDashboard}
              sx={{ mt: 1 }}
            >
              View Schedule in Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Error Section */}
      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          <AlertTitle>Error</AlertTitle>
          <Typography variant="body2">
            {error}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default GenerateSchedule;