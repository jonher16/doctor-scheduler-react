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
    FormControlLabel,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Tabs,
    Tab
  } from '@mui/material';
  import {
    PlayArrow as PlayArrowIcon,
    Dashboard as DashboardIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    ExpandMore as ExpandMoreIcon,
    Psychology as PsychologyIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    WeekendOutlined as WeekendIcon,
    EventOutlined as HolidayIcon
  } from '@mui/icons-material';

  import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer
  } from 'recharts';

  // Update the function signature to accept apiUrl prop
  function GenerateSchedule({ doctors, holidays, availability, setSchedule, apiUrl }) {
    // States to store progress and status messages
    const [status, setStatus] = useState("");
    const [progress, setProgress] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState("");
    const [generationStats, setGenerationStats] = useState(null);
    const [useOptimizedAlgorithm, setUseOptimizedAlgorithm] = useState(true);
    const [serverAvailable, setServerAvailable] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState(null);
    const [statsTabValue, setStatsTabValue] = useState(0);
    const [optimizationProgress, setOptimizationProgress] = useState([]);
    const [optimizationStage, setOptimizationStage] = useState("initializing");

    // Use the provided API URL or fall back to default
    const BACKEND_API_URL = apiUrl || 'http://localhost:5000/api';

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
    useEffect(() => {
      if (!isGenerating) return;
  
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${BACKEND_API_URL}/optimize/progress`);
          if (response.ok) {
            const data = await response.json();
            
            // More realistic progress tracking
            let calculatedProgress = data.current;
            let stage = optimizationStage;
            
            // Update the optimization stage based on the message or progress
            if (data.message.includes("Initializing")) {
              stage = "initializing";
              // Limit initializing stage to 0-10%
              calculatedProgress = Math.min(10, data.current);
            } else if (data.message.includes("Checking constraints") || data.message.includes("Building model")) {
              stage = "building";
              // Building stage maps to 10-30%
              calculatedProgress = 10 + (data.current * 20 / 100);
            } else if (data.message.includes("Iteration")) {
              stage = "optimizing";
              // Main optimization maps to 30-90%
              if (data.current < 50) {
                calculatedProgress = 30 + (data.current * 60 / 100);
              } else {
                calculatedProgress = 30 + (data.current * 60 / 100);
              }
              
              // Add the current progress point to our chart data
              const iterationMatch = data.message.match(/Iteration (\d+)/);
              if (iterationMatch && iterationMatch[1]) {
                const iteration = parseInt(iterationMatch[1]);
                const costMatch = data.message.match(/cost = ([\d.]+)/);
                const cost = costMatch ? parseFloat(costMatch[1]) : null;
                
                if (cost !== null) {
                  setOptimizationProgress(prev => {
                    // Don't add duplicate iterations
                    if (!prev.find(p => p.iteration === iteration)) {
                      return [...prev, { iteration, cost }];
                    }
                    return prev;
                  });
                }
              }
            } // New code
            else if (data.message.includes("complete") || data.current >= 95) {
              stage = "finalizing";
              // If backend reports 100% or "complete", set to 100%
              if (data.current >= 100 || data.status === "completed") {
                calculatedProgress = 100;
              } else {
                // Otherwise map 95-99% to 90-99%
                calculatedProgress = 90 + ((data.current - 95) * 9 / 5);
              }
            }
            
            // And ensure completion status sets progress to 100%
            if (data.status === "completed") {
              calculatedProgress = 100;
            }
            
            setOptimizationStage(stage);
            setProgress(Math.min(100, Math.max(0, Math.round(calculatedProgress))));
            setStatus(data.message || "Optimizing schedule...");
            
            if (data.status === "completed" || data.status === "error") {
              setIsGenerating(false);
              clearInterval(interval);
            }
          } else {
            console.warn("Progress endpoint returned an error.");
          }
        } catch (err) {
          console.error("Error polling progress:", err);
        }
      }, 1000);
  
      return () => clearInterval(interval);
    }, [isGenerating, BACKEND_API_URL, optimizationStage]);

    // Function to check if the server is available.
    async function checkServerStatus() {
      try {
        const response = await fetch(`${BACKEND_API_URL}/status`);
        return response.ok;
      } catch (error) {
        console.error("Server status check failed:", error);
        return false;
      }
    }

    // Optimized schedule generation using the Python API.
    const generateOptimizedSchedule = async () => {
      try {
        // Reset optimization progress chart data
        setOptimizationProgress([]);
        setOptimizationStage("initializing");
        
        setStatus("Connecting to optimization server...");
        setProgress(5);
        // Prepare input data for the optimizer.
        const inputData = { doctors, holidays, availability };
  
        // Start the optimization by calling the /optimize endpoint.
        const optimizationResponse = await fetch(`${BACKEND_API_URL}/optimize`, {
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
        setProgress(100);
        setStatus("Schedule generated successfully!");

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
      setGenerationStats(null);
      setOptimizationProgress([]);
  
      try {
        let schedule;
        let stats = {};

        if (useOptimizedAlgorithm && serverAvailable) {
          // Start the optimization request.
          const result = await generateOptimizedSchedule();
          schedule = result.schedule;
          stats.optimized = true;
          stats.optimizationMetrics = result.optimizationStats;
          stats.preferenceMetrics = result.optimizationStats.preference_metrics;
          stats.weekendMetrics = result.optimizationStats.weekend_metrics;
          stats.holidayMetrics = result.optimizationStats.holiday_metrics;
        } else {
          // Fallback to simple algorithm if optimization server is not available.
          schedule = generateSimpleSchedule();
          stats.optimized = false;
        }
        
        // Calculate additional statistics
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
      // Use a more detailed progress simulation for the simple algorithm
      let progressTimer;
      // New code
    const startProgress = () => {
      let simProgress = 0;
      progressTimer = setInterval(() => {
        simProgress += 3;
        // Only go up to 90% in simulation, leave last 10% for actual completion
        setProgress(Math.min(90, simProgress));
        
        if (simProgress < 30) {
          setStatus("Initializing schedule generation...");
        } else if (simProgress < 60) {
          setStatus("Assigning doctors to shifts...");
        } else if (simProgress < 90) {
          setStatus("Finalizing schedule...");
        }
        
        if (simProgress >= 90) {
          clearInterval(progressTimer);
        }
      }, 300);
    };
      
      // Start the progress simulation
      startProgress();
      
      // Generate the schedule
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
      
      // Clean up timer
      clearInterval(progressTimer);
      setProgress(100);
      setStatus("Schedule generated successfully!");

      return schedule;
    };

    // Helper function to calculate preference adherence percentage
    const calculatePreferenceAdherence = (doctor) => {
      if (!generationStats?.preferenceMetrics) return null;
      
      const metrics = generationStats.preferenceMetrics[doctor];
      if (!metrics) return null;
      
      // If no preference is set, return null
      if (metrics.preference === "None") return null;
      
      const preferredShifts = metrics.preferred_shifts || 0;
      const totalShifts = preferredShifts + (metrics.other_shifts || 0);
      
      if (totalShifts === 0) return 0;
      return Math.round((preferredShifts / totalShifts) * 100);
    };

    // Function to get senior doctor names
    const getSeniorDoctors = () => {
      return doctors
        .filter(doc => doc.seniority === "Senior")
        .map(doc => doc.name);
    };
    
    // Function to get junior doctor names
    const getJuniorDoctors = () => {
      return doctors
        .filter(doc => doc.seniority !== "Senior")
        .map(doc => doc.name);
    };

    const handleTabChange = (event, newValue) => {
      setStatsTabValue(newValue);
    };
    
    // Function to get a friendly description of the current optimization stage
    const getStageDescription = () => {
      switch (optimizationStage) {
        case "initializing":
          return "Setting up the optimization problem";
        case "building":
          return "Building constraints and variables";
        case "optimizing":
          return "Running main optimization algorithm";
        case "finalizing":
          return "Finalizing and validating results";
        default:
          return "Processing";
      }
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
                  "Using TabuSearch optimization algorithm" : "Using simple scheduling algorithm"}>
                  <Alert severity={useOptimizedAlgorithm && serverAvailable ? "info" : "warning"} sx={{ mb: 2 }}>
                    {useOptimizedAlgorithm && serverAvailable
                      ? "TabuSearch optimization will be used to generate an optimal schedule" 
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
                      <Box>
                        <Typography variant="body1">
                          {status || "Preparing to generate schedule..."}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {getStageDescription()}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Box sx={{ width: '100%', mb: 1 }}>
                      <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 5 }} />
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {optimizationStage.charAt(0).toUpperCase() + optimizationStage.slice(1)}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {progress}% complete
                      </Typography>
                    </Box>
                    
                    {/* Show optimization progress chart if we have data */}
                    {optimizationProgress.length > 2 && useOptimizedAlgorithm && serverAvailable && (
                      <Box sx={{ mt: 3, height: 300 }}>
                        <Typography variant="subtitle1" gutterBottom>
                          Optimization Progress
                        </Typography>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={optimizationProgress}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="iteration" 
                              label={{ value: 'Iteration', position: 'insideBottomRight', offset: -10 }} 
                            />
                            <YAxis 
                              label={{ value: 'Objective Cost', angle: -90, position: 'insideLeft' }}
                            />
                            <RechartsTooltip 
                              formatter={(value) => [`Cost: ${value.toFixed(2)}`, 'Objective']}
                              labelFormatter={(value) => `Iteration ${value}`}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="cost" 
                              stroke="#8884d8" 
                              name="Objective Cost"
                              strokeWidth={2} 
                              dot={{ r: 2 }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                        <Typography variant="caption" color="text.secondary" align="center" display="block">
                          Lower objective cost values indicate a better schedule (fewer constraint violations)
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ) : progress === 100 ?  (
                  <Box>
                    <Alert severity="success" sx={{ mb: 2 }}>
                      <AlertTitle>Success</AlertTitle>
                      Schedule generated successfully!
                    </Alert>
                    {generationStats && (
                      <Accordion sx={{ mt: 2 }} defaultExpanded>
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
                          
                          {generationStats.optimized && (
                            <Box sx={{ width: '100%', mb: 3 }}>
                              <Tabs
                                value={statsTabValue}
                                onChange={handleTabChange}
                                variant="scrollable"
                                scrollButtons="auto"
                                aria-label="schedule statistics tabs"
                              >
                                <Tab icon={<PsychologyIcon />} label="Preferences" iconPosition="start" />
                                <Tab icon={<WeekendIcon />} label="Weekends" iconPosition="start" />
                                <Tab icon={<HolidayIcon />} label="Holidays" iconPosition="start" />
                              </Tabs>
                              
                              <Box sx={{ mt: 2 }}>
                                {/* Preferences Tab */}
                                {statsTabValue === 0 && generationStats.preferenceMetrics && (
                                  <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Doctor</TableCell>
                                          <TableCell>Preference</TableCell>
                                          <TableCell align="center">Preferred Shifts</TableCell>
                                          <TableCell align="center">Other Shifts</TableCell>
                                          <TableCell align="center">Adherence %</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {Object.entries(generationStats.preferenceMetrics)
                                          .filter(([_, metrics]) => metrics.preference !== "None")
                                          .sort(([, a], [, b]) => {
                                            const aPerc = a.preferred_shifts / (a.preferred_shifts + a.other_shifts) || 0;
                                            const bPerc = b.preferred_shifts / (b.preferred_shifts + b.other_shifts) || 0;
                                            return bPerc - aPerc; // Sort by adherence percentage descending
                                          })
                                          .map(([doctor, metrics]) => {
                                            const adherencePercentage = calculatePreferenceAdherence(doctor);
                                            
                                            return (
                                              <TableRow key={doctor} hover>
                                                <TableCell>{doctor}</TableCell>
                                                <TableCell>
                                                  <Chip 
                                                    size="small" 
                                                    label={metrics.preference} 
                                                    color="primary"
                                                  />
                                                </TableCell>
                                                <TableCell align="center">{metrics.preferred_shifts}</TableCell>
                                                <TableCell align="center">{metrics.other_shifts}</TableCell>
                                                <TableCell align="center">
                                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {adherencePercentage >= 75 ? (
                                                      <CheckCircleIcon fontSize="small" sx={{ color: 'success.main', mr: 0.5 }} />
                                                    ) : adherencePercentage < 50 ? (
                                                      <CancelIcon fontSize="small" sx={{ color: 'error.main', mr: 0.5 }} />
                                                    ) : null}
                                                    <Typography 
                                                      variant="body2" 
                                                      color={
                                                        adherencePercentage >= 75 ? 'success.main' : 
                                                        adherencePercentage < 50 ? 'error.main' : 
                                                        'text.primary'
                                                      }
                                                    >
                                                      {adherencePercentage}%
                                                    </Typography>
                                                  </Box>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                )}
                                
                                {/* Weekend Shifts Tab */}
                                {statsTabValue === 1 && generationStats.weekendMetrics && (
                                  <Box>
                                    {/* Senior Weekend Stats */}
                                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                                      Senior Doctors - Weekend Shifts
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Doctor</TableCell>
                                            <TableCell align="center">Weekend Shifts</TableCell>
                                            <TableCell align="right">Total Shifts</TableCell>
                                            <TableCell align="right">Weekend %</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {getSeniorDoctors().map(doctorName => {
                                            const weekendShifts = generationStats.weekendMetrics[doctorName] || 0;
                                            const totalShifts = generationStats.doctorShifts[doctorName] || 0;
                                            const weekendPercentage = totalShifts === 0 ? 0 : 
                                              Math.round((weekendShifts / totalShifts) * 100);
                                              
                                            return (
                                              <TableRow key={doctorName} hover>
                                                <TableCell>{doctorName}</TableCell>
                                                <TableCell align="center">
                                                  <Chip 
                                                    size="small"
                                                    label={weekendShifts}
                                                    color="primary"
                                                  />
                                                </TableCell>
                                                <TableCell align="right">{totalShifts}</TableCell>
                                                <TableCell align="right">
                                                  <Typography 
                                                    variant="body2" 
                                                    color={
                                                      weekendPercentage <= 15 ? 'success.main' : 
                                                      weekendPercentage > 25 ? 'error.main' : 
                                                      'text.primary'
                                                    }
                                                  >
                                                    {weekendPercentage}%
                                                  </Typography>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                    
                                    {/* Junior Weekend Stats */}
                                    <Typography variant="subtitle2" gutterBottom>
                                      Junior Doctors - Weekend Shifts
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Doctor</TableCell>
                                            <TableCell align="center">Weekend Shifts</TableCell>
                                            <TableCell align="right">Total Shifts</TableCell>
                                            <TableCell align="right">Weekend %</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {getJuniorDoctors().map(doctorName => {
                                            const weekendShifts = generationStats.weekendMetrics[doctorName] || 0;
                                            const totalShifts = generationStats.doctorShifts[doctorName] || 0;
                                            const weekendPercentage = totalShifts === 0 ? 0 : 
                                              Math.round((weekendShifts / totalShifts) * 100);
                                              
                                            return (
                                              <TableRow key={doctorName} hover>
                                                <TableCell>{doctorName}</TableCell>
                                                <TableCell align="center">
                                                  <Chip 
                                                    size="small"
                                                    label={weekendShifts}
                                                    color="primary"
                                                  />
                                                </TableCell>
                                                <TableCell align="right">{totalShifts}</TableCell>
                                                <TableCell align="right">
                                                  <Typography 
                                                    variant="body2" 
                                                    color={
                                                      Math.abs(weekendPercentage - 20) <= 3 ? 'success.main' : 
                                                      Math.abs(weekendPercentage - 20) > 7 ? 'error.main' : 
                                                      'text.primary'
                                                    }
                                                  >
                                                    {weekendPercentage}%
                                                  </Typography>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                )}
                                
                                {/* Holiday Shifts Tab */}
                                {statsTabValue === 2 && generationStats.holidayMetrics && (
                                  <Box>
                                    {/* Senior Holiday Stats */}
                                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                                      Senior Doctors - Holiday Shifts
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Doctor</TableCell>
                                            <TableCell align="center">Holiday Shifts</TableCell>
                                            <TableCell align="right">Total Shifts</TableCell>
                                            <TableCell align="right">Holiday %</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {getSeniorDoctors().map(doctorName => {
                                            const holidayShifts = generationStats.holidayMetrics[doctorName] || 0;
                                            const totalShifts = generationStats.doctorShifts[doctorName] || 0;
                                            const holidayPercentage = totalShifts === 0 ? 0 : 
                                              Math.round((holidayShifts / totalShifts) * 100);
                                              
                                            return (
                                              <TableRow key={doctorName} hover>
                                                <TableCell>{doctorName}</TableCell>
                                                <TableCell align="center">
                                                  <Chip 
                                                    size="small"
                                                    label={holidayShifts}
                                                    color="secondary"
                                                  />
                                                </TableCell>
                                                <TableCell align="right">{totalShifts}</TableCell>
                                                <TableCell align="right">
                                                  <Typography 
                                                    variant="body2" 
                                                    color={
                                                      holidayPercentage <= 3 ? 'success.main' : 
                                                      holidayPercentage > 6 ? 'error.main' : 
                                                      'text.primary'
                                                    }
                                                  >
                                                    {holidayPercentage}%
                                                  </Typography>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                    
                                    {/* Junior Holiday Stats */}
                                    <Typography variant="subtitle2" gutterBottom>
                                      Junior Doctors - Holiday Shifts
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Doctor</TableCell>
                                            <TableCell align="center">Holiday Shifts</TableCell>
                                            <TableCell align="right">Total Shifts</TableCell>
                                            <TableCell align="right">Holiday %</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {getJuniorDoctors().map(doctorName => {
                                            const holidayShifts = generationStats.holidayMetrics[doctorName] || 0;
                                            const totalShifts = generationStats.doctorShifts[doctorName] || 0;
                                            const holidayPercentage = totalShifts === 0 ? 0 : 
                                              Math.round((holidayShifts / totalShifts) * 100);
                                              
                                            return (
                                              <TableRow key={doctorName} hover>
                                                <TableCell>{doctorName}</TableCell>
                                                <TableCell align="center">
                                                  <Chip 
                                                    size="small"
                                                    label={holidayShifts}
                                                    color="secondary"
                                                  />
                                                </TableCell>
                                                <TableCell align="right">{totalShifts}</TableCell>
                                                <TableCell align="right">
                                                  <Typography 
                                                    variant="body2" 
                                                    color={
                                                      Math.abs(holidayPercentage - 5) <= 1 ? 'success.main' : 
                                                      Math.abs(holidayPercentage - 5) > 3 ? 'error.main' : 
                                                      'text.primary'
                                                    }
                                                  >
                                                    {holidayPercentage}%
                                                  </Typography>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          )}
                          
                          <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
                            Doctor Workload Summary
                          </Typography>
                          <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Doctor</TableCell>
                                  <TableCell>Seniority</TableCell>
                                  <TableCell align="right">Total Shifts</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {Object.entries(generationStats.doctorShifts)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([doctor, shifts]) => {
                                    const doctorInfo = doctors.find(d => d.name === doctor);
                                    const seniority = doctorInfo ? doctorInfo.seniority : 'Unknown';
                                    
                                    return (
                                      <TableRow key={doctor} hover>
                                        <TableCell>{doctor}</TableCell>
                                        <TableCell>
                                          <Chip
                                            size="small"
                                            label={seniority}
                                            color={seniority === 'Senior' ? 'primary' : 'default'}
                                            variant={seniority === 'Senior' ? 'filled' : 'outlined'}
                                          />
                                        </TableCell>
                                        <TableCell align="right">{shifts}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          
                          {generationStats.optimized && generationStats.optimizationMetrics && (
                            <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Optimization Metrics
                              </Typography>
                              <Grid container spacing={1}>
                                <Grid item xs={6}>
                                  <Typography variant="body2">
                                    Objective value: <strong>{generationStats.optimizationMetrics.objective_value?.toFixed(2) || 'N/A'}</strong>
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