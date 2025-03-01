import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Button,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Alert,
  AlertTitle,
  Divider,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Dashboard as DashboardIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  Psychology as PsychologyIcon
} from '@mui/icons-material';

const API_BASE_URL = 'http://localhost:5000/api';

function GenerateSchedule({ doctors, holidays, availability, setSchedule }) {
  // States to store progress and status messages
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generationStats, setGenerationStats] = useState(null);
  const [useOptimizedAlgorithm, setUseOptimizedAlgorithm] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);

  // Check server availability on mount
  useEffect(() => {
    checkServerStatus().then(isAvailable => {
      setServerAvailable(isAvailable);
      if (!isAvailable) {
        setUseOptimizedAlgorithm(false);
      }
    });
  }, []);

  // useEffect to poll the /optimize/progress endpoint every second while optimization is running.
  // This hook updates the progress and status in real time.
  useEffect(() => {
    // Only poll when an optimization is in progress.
    if (!isGenerating) return;

    // Set up an interval timer to poll progress every 1 second.
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/optimize/progress`);
        if (response.ok) {
          const data = await response.json();
          // Update local state with current progress and status message.
          setProgress(data.current);
          setStatus(data.message || "Optimizing schedule...");
          // If the optimization status is completed or an error occurred, stop polling.
          if (data.status === "completed" || data.status === "error") {
            setIsGenerating(false);
            clearInterval(interval);
          }
        } else {
          // If the endpoint fails, you can choose to log or display an error.
          console.warn("Progress endpoint returned an error.");
        }
      } catch (err) {
        console.error("Error polling progress:", err);
      }
    }, 1000);

    // Clear the interval when the component unmounts or when isGenerating changes.
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Function to check if the server is available.
  async function checkServerStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      return response.ok;
    } catch (error) {
      console.error("Server status check failed:", error);
      return false;
    }
  }

  // Optimized schedule generation using the Python API.
  const generateOptimizedSchedule = async () => {
    try {
      setStatus("Connecting to optimization server...");
      setProgress(5);
      // Prepare input data for the optimizer.
      const inputData = { doctors, holidays, availability };

      // Start the optimization by calling the /optimize endpoint.
      const optimizationResponse = await fetch(`${API_BASE_URL}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData),
      });
      
      if (!optimizationResponse.ok) {
        const errorText = await optimizationResponse.text();
        throw new Error(`API request failed: ${errorText}`);
      }
      
      // Parse the final optimization result.
      const responseData = await optimizationResponse.json();
      setOptimizationResult(responseData);
      return { 
        schedule: responseData.schedule, 
        optimizationStats: responseData.statistics 
      };
    } catch (error) {
      console.error("Optimization API error:", error);
      throw error;
    }
  };

  // Main function to generate schedule
  const generate = async () => {
    if (doctors.length === 0) {
      setError("No doctors configured! Please add doctors before generating a schedule.");
      return;
    }

    // Reset all relevant states.
    setIsGenerating(true);
    setStatus("Initializing schedule generation...");
    setProgress(0);
    setError("");
    setOptimizationResult(null);

    try {
      let schedule;
      let stats = {};

      if (useOptimizedAlgorithm && serverAvailable) {
        // Start the optimization request.
        // The useEffect above will handle progress updates while isGenerating is true.
        const result = await generateOptimizedSchedule();
        schedule = result.schedule;
        stats.optimized = true;
        stats.optimizationMetrics = result.optimizationStats;
      } else {
        // Fallback to simple algorithm if optimization server is not available.
        schedule = generateSimpleSchedule();
        stats.optimized = false;
      }
      
      // (Optional) Calculate additional statistics here if needed.
      // For example, count total shifts and shifts per doctor.
      let totalShifts = 0;
      const doctorShifts = {};
      doctors.forEach(doc => { doctorShifts[doc.name] = 0; });
      Object.keys(schedule).forEach(date => {
        Object.keys(schedule[date]).forEach(shift => {
          const assignedDoctors = schedule[date][shift];
          totalShifts += assignedDoctors.length;
          assignedDoctors.forEach(name => {
            doctorShifts[name] += 1;
          });
        });
      });
      stats.totalShifts = totalShifts;
      stats.doctorShifts = doctorShifts;
      
      // Update state with final schedule and stats.
      setGenerationStats(stats);
      setSchedule(schedule);
      setStatus("Schedule generated successfully!");
      setProgress(100);
    } catch (err) {
      console.error("Error generating schedule:", err);
      setError(`An error occurred while generating the schedule: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Simple schedule generation (fallback algorithm)
  const generateSimpleSchedule = () => {
    const schedule = {};
    const daysInYear = 365;
    const startDate = new Date("2025-01-01");
    const shifts = ["Day", "Evening", "Night"];
    const shiftCoverage = { "Day": 2, "Evening": 1, "Night": 2 };

    let doctorIndex = 0;
    for (let d = 0; d < daysInYear; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];
      schedule[dateStr] = { "Day": [], "Evening": [], "Night": [] };

      shifts.forEach(shift => {
        for (let i = 0; i < shiftCoverage[shift]; i++) {
          // Round-robin assignment (simple logic for demonstration)
          schedule[dateStr][shift].push(doctors[doctorIndex].name);
          doctorIndex = (doctorIndex + 1) % doctors.length;
        }
      });
    }
    return schedule;
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Generate Schedule
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Generate an optimized yearly schedule for all doctors based on your configurations.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}
          action={
            <IconButton aria-label="close" color="inherit" size="small" onClick={() => setError("")}>
              <ErrorIcon fontSize="inherit" />
            </IconButton>
          }
        >
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}

      {!serverAvailable && useOptimizedAlgorithm && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Optimization Server Unavailable</AlertTitle>
          The optimization server is not responding. The application will use the simple scheduling algorithm instead.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Configuration Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1">Doctors configured:</Typography>
                <Typography variant="body1" fontWeight="bold">{doctors.length}</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1">Holidays configured:</Typography>
                <Typography variant="body1" fontWeight="bold">{Object.keys(holidays).length}</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1">Availability constraints:</Typography>
                <Typography variant="body1" fontWeight="bold">{Object.keys(availability).length}</Typography>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <PsychologyIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="body1">Use Optimization Algorithm</Typography>
                </Box>
                <Switch
                  checked={useOptimizedAlgorithm}
                  onChange={(e) => setUseOptimizedAlgorithm(e.target.checked)}
                  color="primary"
                  disabled={!serverAvailable}
                />
              </Box>
              
              <Tooltip title={useOptimizedAlgorithm ? 
                "Using MILP optimization algorithm" : "Using simple scheduling algorithm"}>
                <Alert severity={useOptimizedAlgorithm && serverAvailable ? "info" : "warning"} sx={{ mb: 2 }}>
                  {useOptimizedAlgorithm && serverAvailable
                    ? "MILP optimization will be used to generate an optimal schedule" 
                    : "Simple scheduling will be used (no optimization)"}
                </Alert>
              </Tooltip>
              
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrowIcon />}
                  onClick={generate}
                  disabled={isGenerating}
                  fullWidth
                  size="large"
                  sx={{ py: 1.5 }}
                >
                  {isGenerating ? "Generating..." : "Generate Schedule"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Generation Status
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {isGenerating ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CircularProgress size={24} sx={{ mr: 2 }} />
                    <Typography variant="body1">{status || "Preparing to generate schedule..."}</Typography>
                  </Box>
                  
                  <Box sx={{ width: '100%', mb: 2 }}>
                    <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 5 }} />
                  </Box>
                  
                  <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    {progress}% complete
                  </Typography>
                </Box>
              ) : progress === 100 ? (
                <Box>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <AlertTitle>Success</AlertTitle>
                    Schedule generated successfully!
                  </Alert>
                  {generationStats && (
                    <Accordion sx={{ mt: 2 }}>
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="panel1a-content"
                        id="panel1a-header"
                      >
                        <Typography>Schedule Statistics</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>
                          Total shifts scheduled: <strong>{generationStats.totalShifts}</strong>
                        </Typography>
                        
                        <Typography variant="body2">Doctor workload summary:</Typography>
                        <Box sx={{ ml: 2 }}>
                          {Object.entries(generationStats.doctorShifts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([doctor, shifts]) => (
                              <Typography key={doctor} variant="body2">
                                {doctor}: <strong>{shifts}</strong> shifts
                              </Typography>
                            ))}
                        </Box>
                        
                        {generationStats.optimized && generationStats.optimizationMetrics && (
                          <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Optimization Metrics
                            </Typography>
                            <Grid container spacing={1}>
                              <Grid item xs={6}>
                                <Typography variant="body2">
                                  Objective value: <strong>{generationStats.optimizationMetrics.objective_value}</strong>
                                </Typography>
                              </Grid>
                              <Grid item xs={6}>
                                <Typography variant="body2">
                                  Solution time: <strong>{generationStats.optimizationMetrics.solution_time_seconds?.toFixed(2) || 'N/A'} seconds</strong>
                                </Typography>
                              </Grid>
                              <Grid item xs={6}>
                                <Typography variant="body2">
                                  Constraints: <strong>{generationStats.optimizationMetrics.constraints || 'N/A'}</strong>
                                </Typography>
                              </Grid>
                              <Grid item xs={6}>
                                <Typography variant="body2">
                                  Variables: <strong>{generationStats.optimizationMetrics.variables || 'N/A'}</strong>
                                </Typography>
                              </Grid>
                              <Grid item xs={12}>
                                <Typography variant="body2">
                                  Status: <strong>{generationStats.optimizationMetrics.status || 'N/A'}</strong>
                                </Typography>
                              </Grid>
                            </Grid>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                  <InfoIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
                  <Typography variant="body1" align="center">
                    Click the "Generate Schedule" button to create a new schedule.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {progress === 100 && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<DashboardIcon />}
              sx={{ mt: 2, float: 'right' }}
              onClick={() => window.scrollTo(0, 0)}
            >
              View in Dashboard
            </Button>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

export default GenerateSchedule;
