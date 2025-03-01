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
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Dashboard as DashboardIcon,
  Psychology as PsychologyIcon
} from '@mui/icons-material';

// API URL (configurable based on environment)
const API_BASE_URL = 'http://localhost:5000/api';

function GenerateSchedule({ doctors, holidays, availability, setSchedule }) {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generationStats, setGenerationStats] = useState(null);
  const [useOptimizedAlgorithm, setUseOptimizedAlgorithm] = useState(true);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null); // Store the optimization result

  // Check server availability on mount
  useEffect(() => {
    checkServerStatus().then(isAvailable => {
      setServerAvailable(isAvailable);
      // If server is not available, default to simple algorithm
      if (!isAvailable) {
        setUseOptimizedAlgorithm(false);
      }
    });
  }, []);

  // Update progress simulation for simple algorithm
  const updateProgress = (current, total) => {
    const progressValue = Math.min(100, Math.round((current / total) * 100));
    setProgress(progressValue);
  };

  // Simple schedule generation (original algorithm)
  const generateSimpleSchedule = () => {
    // Create a schedule with a null prototype to avoid any hidden keys like __proto__
    const schedule = Object.create(null);

    const daysInYear = 365;
    const startDate = new Date("2025-01-01");
    const shifts = ["Day", "Evening", "Night"];
    const shiftCoverage = { "Day": 2, "Evening": 1, "Night": 2 };

    setStatus("Assigning doctors to shifts...");

    let doctorIndex = 0;
    for (let d = 0; d < daysInYear; d++) {
      updateProgress(d, daysInYear);
      
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Always create the structure for each date
      schedule[dateStr] = { "Day": [], "Evening": [], "Night": [] };

      // For each shift, assign required number of doctors (round-robin)
      shifts.forEach(shift => {
        for (let i = 0; i < shiftCoverage[shift]; i++) {
          // If there's a "Long" holiday, skip the next doctor if they're senior, etc.
          if (holidays[dateStr] === "Long") {
            // Prefer junior doctors for holidays
            while (doctorIndex < doctors.length && 
                  doctors[doctorIndex].seniority === "Senior") {
              doctorIndex = (doctorIndex + 1) % doctors.length;
            }
          }
          
          // Check doctor availability
          const currentDoctor = doctors[doctorIndex].name;
          const doctorAvail = availability[currentDoctor] && 
                            availability[currentDoctor][dateStr];
          
          // Skip if doctor is not available or has specific shift constraints
          if (doctorAvail === "Not Available" ||
              (doctorAvail === "Day Only" && shift !== "Day") ||
              (doctorAvail === "Evening Only" && shift !== "Evening") ||
              (doctorAvail === "Night Only" && shift !== "Night")) {
            // Find next available doctor
            let nextIndex = (doctorIndex + 1) % doctors.length;
            let attempts = 0;
            
            while (attempts < doctors.length) {
              const nextDoctor = doctors[nextIndex].name;
              const nextAvail = availability[nextDoctor] && 
                              availability[nextDoctor][dateStr];
              
              if (nextAvail !== "Not Available" &&
                  !(nextAvail === "Day Only" && shift !== "Day") &&
                  !(nextAvail === "Evening Only" && shift !== "Evening") &&
                  !(nextAvail === "Night Only" && shift !== "Night")) {
                break;
              }
              
              nextIndex = (nextIndex + 1) % doctors.length;
              attempts++;
            }
            
            doctorIndex = nextIndex;
          }
          
          schedule[dateStr][shift].push(doctors[doctorIndex].name);
          doctorIndex = (doctorIndex + 1) % doctors.length;
        }
      });
    }

    return schedule;
  };

  // Optimized schedule generation using the Python API
  const generateOptimizedSchedule = async () => {
    try {
      // Set up progress tracking
      setStatus("Connecting to optimization server...");
      updateProgress(5, 100);
      
      // Prepare input data for the optimizer
      const inputData = {
        doctors: doctors,
        holidays: holidays,
        availability: availability
      };
      
      // Start the optimization request
      const optimizationResponse = await fetch(`${API_BASE_URL}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputData),
      });
      
      // Check for HTTP errors
      if (!optimizationResponse.ok) {
        const errorText = await optimizationResponse.text();
        throw new Error(`API request failed: ${errorText}`);
      }
      
      // Parse the response to get the result
      const responseData = await optimizationResponse.json();
      setOptimizationResult(responseData);
      
      // Start polling for progress updates
      let isCompleted = false;
      const startTime = Date.now();
      
      while (!isCompleted) {
        // Check if we've been polling for too long (5 minutes max)
        if (Date.now() - startTime > 5 * 60 * 1000) {
          throw new Error("Optimization timed out after 5 minutes");
        }
        
        try {
          // Get progress update
          const progressResponse = await fetch(`${API_BASE_URL}/optimize/progress`);
          
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            
            // Update the UI with progress
            setProgress(progressData.current);
            setStatus(progressData.message || "Optimizing schedule...");
            
            // Check if completed or error
            if (progressData.status === "completed") {
              isCompleted = true;
            } else if (progressData.status === "error") {
              throw new Error(progressData.message || "Optimization failed");
            } else {
              // Wait before polling again
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } else {
            // If progress endpoint fails, wait and try again
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (progressError) {
          console.warn("Error checking progress:", progressError);
          // If progress check fails, wait and try again
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Check if we have a valid optimization result
      if (!responseData || !responseData.schedule || !responseData.statistics) {
        throw new Error("Invalid optimization result");
      }
      
      // Return the schedule and statistics
      return { 
        schedule: responseData.schedule, 
        optimizationStats: responseData.statistics 
      };
    } catch (error) {
      console.error("Optimization API error:", error);
      throw error;
    }
  };

  // Generate schedule - main function
  const generate = async () => {
    if (doctors.length === 0) {
      setError("No doctors configured! Please add doctors before generating a schedule.");
      return;
    }

    setIsGenerating(true);
    setStatus("Initializing schedule generation...");
    setProgress(0);
    setError("");
    setOptimizationResult(null);

    try {
      let schedule;
      let stats = {
        totalShifts: 0,
        doctorShifts: {},
        seniorCoverage: 0,
        holidayCoverage: 0
      };
      
      // Initialize doctor shifts count
      doctors.forEach(doc => {
        stats.doctorShifts[doc.name] = 0;
      });
      
      if (useOptimizedAlgorithm && serverAvailable) {
        // Use the MILP optimization
        const result = await generateOptimizedSchedule();
        schedule = result.schedule;
        
        // Add optimizer-specific stats
        stats.optimized = true;
        stats.optimizationMetrics = result.optimizationStats;
      } else {
        // Use the simple algorithm
        schedule = generateSimpleSchedule();
        stats.optimized = false;
      }
      
      // Count shifts for statistics
      Object.keys(schedule).forEach(date => {
        const shiftsForDay = schedule[date];
        Object.keys(shiftsForDay).forEach(shift => {
          const doctors = shiftsForDay[shift];
          stats.totalShifts += doctors.length;
          
          doctors.forEach(doctorName => {
            stats.doctorShifts[doctorName] = (stats.doctorShifts[doctorName] || 0) + 1;
          });
        });
      });
      
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

  // Check server status
  async function checkServerStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      return response.ok;
    } catch (error) {
      console.error("Server status check failed:", error);
      return false;
    }
  }

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Generate Schedule
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body1" color="text.secondary" paragraph>
          Generate an optimized yearly schedule for all doctors based on your configurations, availability constraints, and hospital requirements.
        </Typography>
      </Box>

      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => setError("")}
            >
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
          You can try restarting the server by running the <code>run.sh</code> script.
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
                <Typography variant="body1" fontWeight="bold">
                  {doctors.length}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1">Holidays configured:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {Object.keys(holidays).length}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1">Availability constraints:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {Object.keys(availability).length}
                </Typography>
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
                "Using Mixed-Integer Linear Programming (MILP) optimization algorithm based on the technical report" : 
                "Using simple round-robin scheduling algorithm"}>
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
                    Schedule generated successfully! You can now view it in the Dashboard.
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
                    Click the "Generate Schedule" button to create a new schedule based on your configurations.
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