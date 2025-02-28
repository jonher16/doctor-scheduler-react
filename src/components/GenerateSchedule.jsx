import React, { useState } from 'react';
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
  AccordionDetails
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Dashboard as DashboardIcon
} from '@mui/icons-material';

function GenerateSchedule({ doctors, holidays, availability, setSchedule }) {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generationStats, setGenerationStats] = useState(null);

  // Mock function to simulate progress update
  const updateProgress = (current, total) => {
    const progressValue = Math.round((current / total) * 100);
    setProgress(progressValue);
  };

  // Generate schedule with progress simulation
  const generate = () => {
    if (doctors.length === 0) {
      setError("No doctors configured! Please add doctors before generating a schedule.");
      return;
    }

    setIsGenerating(true);
    setStatus("Initializing schedule generation...");
    setProgress(0);
    setError("");

    // Simulate the schedule generation process with progress updates
    setTimeout(() => {
      setStatus("Analyzing doctor availability and preferences...");
      setProgress(20);
      
      setTimeout(() => {
        setStatus("Processing holiday constraints...");
        setProgress(40);
        
        setTimeout(() => {
          setStatus("Generating shifts...");
          setProgress(60);
          
          // Actual schedule generation logic
          try {
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
                  // If there's a "Long" holiday, skip the next doctor if they're senior, etc. (Enhanced logic)
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

            setProgress(80);
            setStatus("Finalizing schedule...");
            
            // Calculate some basic statistics
            const stats = {
              totalShifts: 0,
              doctorShifts: {},
              seniorCoverage: 0,
              holidayCoverage: 0
            };
            
            // Initialize doctor shifts count
            doctors.forEach(doc => {
              stats.doctorShifts[doc.name] = 0;
            });
            
            // Count shifts
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
            setError("An error occurred while generating the schedule. Please try again.");
          } finally {
            setIsGenerating(false);
          }
        }, 1000);
      }, 800);
    }, 500);
  };

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
              
              <Box sx={{ mt: 3 }}>
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