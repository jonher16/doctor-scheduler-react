// Updated App.jsx with userData file loading

import React, { useState, useEffect } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Box, 
  Container, 
  Paper, 
  CssBaseline,
  Button,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  ThemeProvider,
  createTheme,
  Snackbar,
  Alert
} from '@mui/material';
import {
  Menu as MenuIcon,
  Person as PersonIcon,
  EventNote as EventNoteIcon,
  CalendarToday as CalendarTodayIcon,
  Event as EventIcon,
  Dashboard as DashboardIcon,
  CloudSync as CloudSyncIcon
} from '@mui/icons-material';

// Import components
import DoctorConfig from './components/DoctorConfig';
import HolidayConfig from './components/HolidayConfig';
import DoctorNeeds from './components/DoctorNeeds';
import GenerateSchedule from './components/GenerateSchedule';
import Dashboard from './components/Dashboard';
import MonthlyCalendarView from './components/MonthlyCalendarView';
import BackendMonitor from './components/BackendMonitor';
import SyncPage from './components/SyncPage';

// Create a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Professional blue color
      light: '#4791db',
      dark: '#115293',
    },
    secondary: {
      main: '#f50057',
      light: '#f73378',
      dark: '#ab003c',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 500,
      fontSize: '1.5rem',
    },
    h6: {
      fontWeight: 500,
      fontSize: '1.25rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
        },
      },
    },
  },
});

// Menu items
const menuItems = [
  { text: 'Generate Schedule', icon: <EventIcon />, component: 'generate' },
  { text: 'Dashboard', icon: <DashboardIcon />, component: 'dashboard' },
  { text: 'Doctor Configuration', icon: <PersonIcon />, component: 'doctors' },
  { text: 'Holiday Configuration', icon: <EventNoteIcon />, component: 'holidays' },
  { text: 'Doctor Availability', icon: <CalendarTodayIcon />, component: 'availability' },
  { text: 'Cloud Sync', icon: <CloudSyncIcon />, component: 'sync' }
  
];

// Determine if we're running in Electron
const isElectron = window.platform?.isElectron;

// Set the API URL based on environment
const API_URL = isElectron 
  ? 'http://localhost:5000/api'  // Local backend when in Electron
  : import.meta.env.VITE_API_URL || 'http://localhost:5000/api'; // From env or default

function App() {
  const [doctors, setDoctorsState] = useState([]);
  const [holidays, setHolidaysState] = useState({});
  const [availability, setAvailabilityState] = useState({});
  const [schedule, setScheduleState] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeComponent, setActiveComponent] = useState('generate');
  const [isLoading, setIsLoading] = useState(true);
  const [appPaths, setAppPaths] = useState(null);
  
  // For notifications
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  // Custom setter functions that also update localStorage
  const setDoctors = (newDoctors) => {
    localStorage.setItem('doctors', JSON.stringify(newDoctors));
    setDoctorsState(newDoctors);
  };

  const setHolidays = (newHolidays) => {
    localStorage.setItem('holidays', JSON.stringify(newHolidays));
    setHolidaysState(newHolidays);
  };

  const setAvailability = (newAvailability) => {
    localStorage.setItem('availability', JSON.stringify(newAvailability));
    setAvailabilityState(newAvailability);
  };

  const setSchedule = (newSchedule) => {
    // When a schedule is generated, save it with the current configuration state
    const scheduleData = {
      schedule: newSchedule,
      metadata: {
        doctors: JSON.parse(JSON.stringify(doctors)), // Deep copy
        holidays: JSON.parse(JSON.stringify(holidays)), // Deep copy
        generatedAt: new Date().toISOString()
      }
    };
    
    localStorage.setItem('scheduleData', JSON.stringify(scheduleData));
    setScheduleState(newSchedule);
    
    if (newSchedule && Object.keys(newSchedule).length > 0) {
      setNotification({
        open: true,
        message: 'Schedule generated successfully!',
        severity: 'success'
      });
      
      // Navigate to dashboard after generating schedule
      setActiveComponent('dashboard');
    }
  };
  
  // Handle schedule updates from the dashboard
  const handleScheduleUpdate = (updatedSchedule) => {
    if (!updatedSchedule) return;
    
    // Update the schedule in state
    setScheduleState(updatedSchedule);
    
    // Get the current schedule data with metadata
    let scheduleData;
    try {
      const storedData = localStorage.getItem('scheduleData');
      scheduleData = storedData ? JSON.parse(storedData) : { metadata: {} };
    } catch (error) {
      console.error("Error parsing schedule data:", error);
      scheduleData = { metadata: {} };
    }
    
    // Update the schedule while keeping the metadata
    const updatedData = {
      schedule: updatedSchedule,
      metadata: {
        ...scheduleData.metadata,
        lastModified: new Date().toISOString()
      }
    };
    
    // Save to localStorage
    localStorage.setItem('scheduleData', JSON.stringify(updatedData));
    
    setNotification({
      open: true,
      message: 'Schedule updated successfully!',
      severity: 'success'
    });
  };

  // Load data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      
      try {
        // If in Electron mode, try to get app paths for debugging
        if (isElectron && window.electron) {
          const paths = await window.electron.getAppPaths();
          console.log("Application paths:", paths);
          setAppPaths(paths);
        }
        
        // Try to load from localStorage first
        const localDataLoaded = await loadFromLocalStorage();
        
        // If in Electron mode, try to load default files from userData
        if (isElectron && window.electron) {
          // Only load defaults if localStorage didn't have the data
          if (!localDataLoaded) {
            await loadFromUserData();
          }
        }
        // If in web mode, try to load from public JSON files
        else if (!localDataLoaded) {
          await loadFromPublicFiles();
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
        // Show error notification
        setNotification({
          open: true,
          message: `Error loading initial data: ${error.message}`,
          severity: 'error'
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadInitialData();
  }, []);
  
  // Load data from localStorage
  const loadFromLocalStorage = async () => {
    let loadedDoctors = false;
    let loadedHolidays = false;
    
    // Load doctors
    const localDoctors = localStorage.getItem('doctors');
    if (localDoctors) {
      try {
        const doctorsData = JSON.parse(localDoctors);
        if (doctorsData && doctorsData.length > 0) {
          setDoctorsState(doctorsData);
          console.log("Loaded doctors from localStorage");
          loadedDoctors = true;
        }
      } catch (err) {
        console.error('Error parsing doctors from localStorage', err);
      }
    }

    // Load holidays
    const localHolidays = localStorage.getItem('holidays');
    if (localHolidays) {
      try {
        const holidaysData = JSON.parse(localHolidays);
        if (holidaysData && Object.keys(holidaysData).length > 0) {
          setHolidaysState(holidaysData);
          console.log("Loaded holidays from localStorage");
          loadedHolidays = true;
        }
      } catch (err) {
        console.error('Error parsing holidays from localStorage', err);
      }
    }

    // Load availability
    const localAvailability = localStorage.getItem('availability');
    if (localAvailability) {
      try {
        setAvailabilityState(JSON.parse(localAvailability));
        console.log("Loaded availability from localStorage");
      } catch (err) {
        console.error('Error parsing availability from localStorage', err);
      }
    }

    // Load schedule with its metadata
    const scheduleData = localStorage.getItem('scheduleData');
    if (scheduleData) {
      try {
        const parsedData = JSON.parse(scheduleData);
        setScheduleState(parsedData.schedule || {});
        console.log("Loaded schedule from localStorage");
      } catch (err) {
        console.error('Error parsing schedule from localStorage', err);
      }
    }
    
    return loadedDoctors && loadedHolidays;
  };
  
  // Load data from userData directory via Electron
  const loadFromUserData = async () => {
    if (!isElectron || !window.electron) return false;
    
    let loadedDoctors = false;
    let loadedHolidays = false;
    
    // Load doctors if not available
    if (!doctors || doctors.length === 0) {
      try {
        const defaultDoctors = await window.electron.loadUserDataFile('doctors.json');
        if (defaultDoctors && defaultDoctors.length > 0) {
          console.log("Loaded doctors from userData directory");
          setDoctors(defaultDoctors); // This also saves to localStorage
          loadedDoctors = true;
        }
      } catch (err) {
        console.error("Error loading doctors from userData directory", err);
      }
    } else {
      loadedDoctors = true;
    }
    
    // Load holidays if not available
    if (!holidays || Object.keys(holidays).length === 0) {
      try {
        const defaultHolidays = await window.electron.loadUserDataFile('holidays.json');
        if (defaultHolidays && Object.keys(defaultHolidays).length > 0) {
          console.log("Loaded holidays from userData directory");
          setHolidays(defaultHolidays); // This also saves to localStorage
          loadedHolidays = true;
        }
      } catch (err) {
        console.error("Error loading holidays from userData directory", err);
      }
    } else {
      loadedHolidays = true;
    }
    
    return loadedDoctors && loadedHolidays;
  };
  
  // Load data from public JSON files
  const loadFromPublicFiles = async () => {
    let loadedDoctors = false;
    let loadedHolidays = false;
    
    // Load doctors if not available
    if (!doctors || doctors.length === 0) {
      try {
        const response = await fetch('/doctors.json');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            console.log("Loaded doctors from public file");
            setDoctors(data); // This also saves to localStorage
            loadedDoctors = true;
          }
        }
      } catch (err) {
        console.error("Error loading public doctors.json", err);
      }
    } else {
      loadedDoctors = true;
    }
    
    // Load holidays if not available
    if (!holidays || Object.keys(holidays).length === 0) {
      try {
        const response = await fetch('/holidays.json');
        if (response.ok) {
          const data = await response.json();
          if (data && Object.keys(data).length > 0) {
            console.log("Loaded holidays from public file");
            setHolidays(data); // This also saves to localStorage
            loadedHolidays = true;
          }
        }
      } catch (err) {
        console.error("Error loading public holidays.json", err);
      }
    } else {
      loadedHolidays = true;
    }
    
    return loadedDoctors && loadedHolidays;
  };

  const toggleDrawer = (open) => (event) => {
    if (
      event.type === 'keydown' &&
      (event.key === 'Tab' || event.key === 'Shift')
    ) {
      return;
    }
    setDrawerOpen(open);
  };

  const handleMenuItemClick = (component) => {
    setActiveComponent(component);
    setDrawerOpen(false);
  };
  
  const handleCloseNotification = () => {
    setNotification({...notification, open: false});
  };

  // Drawer content
  const drawerContent = (
    <Box
      sx={{ width: 250 }}
      role="presentation"
      onClick={toggleDrawer(false)}
      onKeyDown={toggleDrawer(false)}
    >
      <Box sx={{ height: 64, display: 'flex', alignItems: 'center', px: 2 }}>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Menu
        </Typography>
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem 
            button 
            key={item.component} 
            onClick={() => handleMenuItemClick(item.component)}
            selected={activeComponent === item.component}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.12)',
                },
              }
            }}
          >
            <ListItemIcon>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
    </Box>
  );

  // Get schedule metadata from localStorage for dashboard
  const getScheduleData = () => {
    try {
      const scheduleData = localStorage.getItem('scheduleData');
      if (scheduleData) {
        const { schedule: savedSchedule, metadata } = JSON.parse(scheduleData);
        // If there's valid schedule data with metadata, return it
        if (savedSchedule && Object.keys(savedSchedule).length > 0 && metadata) {
          return {
            schedule: savedSchedule,
            doctors: metadata.doctors || doctors, // Fall back to current doctors if needed
            holidays: metadata.holidays || holidays // Fall back to current holidays if needed
          };
        }
      }
    } catch (error) {
      console.error("Error loading schedule data:", error);
    }
    
    // If there's no valid saved schedule data with metadata, use current state
    return { schedule, doctors, holidays };
  };

  // Render the active component
  const renderComponent = () => {
    if (isLoading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
          <Typography variant="h6">Loading application data...</Typography>
        </Box>
      );
    }
    
    // Check if we have required data
    const hasDoctors = doctors && doctors.length > 0;
    const hasHolidays = holidays && Object.keys(holidays).length > 0;
    
    // If data is missing, show message with app paths for debugging
    if ((!hasDoctors || !hasHolidays) && isElectron) {
      return (
        <Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Missing Data</AlertTitle>
            {!hasDoctors && <p>No doctors data available. Please add doctors or check application installation.</p>}
            {!hasHolidays && <p>No holidays data available. Please add holidays or check application installation.</p>}
          </Alert>
          
          {appPaths && (
            <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h6">Application Paths (Debug Info)</Typography>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                {JSON.stringify(appPaths, null, 2)}
              </pre>
            </Box>
          )}
          
          <Box sx={{ mt: 3 }}>
            <Button 
              variant="contained" 
              onClick={() => window.location.reload()}
              sx={{ mr: 2 }}
            >
              Reload Application
            </Button>
          </Box>
        </Box>
      );
    }
    
    switch (activeComponent) {
      case 'doctors':
        return <DoctorConfig doctors={doctors} setDoctors={setDoctors} />;
      case 'holidays':
        return <HolidayConfig holidays={holidays} setHolidays={setHolidays} />;
      case 'availability':
        return <DoctorNeeds doctors={doctors} setAvailability={setAvailability} availability={availability} />;
      case 'generate':
        return (
          <GenerateSchedule
            doctors={doctors}
            holidays={holidays}
            availability={availability}
            setSchedule={setSchedule}
            apiUrl={API_URL}  // Pass API URL to component
          />
        );
      case 'dashboard': {
        // Get the schedule data with its snapshot of doctors/holidays
        const { schedule: dashboardSchedule, doctors: dashboardDoctors, holidays: dashboardHolidays } = getScheduleData();
        return <Dashboard 
          doctors={dashboardDoctors} 
          schedule={dashboardSchedule} 
          holidays={dashboardHolidays}
          onScheduleUpdate={handleScheduleUpdate}
        />;
      };
      case 'sync':
        return <SyncPage 
          doctors={doctors} 
          setDoctors={setDoctors} 
          availability={availability} 
          setAvailability={setAvailability} 
        />;
      default:
        return <DoctorConfig doctors={doctors} setDoctors={setDoctors} />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="fixed">
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={toggleDrawer(true)}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Hospital Doctor Scheduler
            </Typography>
          </Toolbar>
        </AppBar>
        
        {/* Drawer */}
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={toggleDrawer(false)}
        >
          {drawerContent}
        </Drawer>
        
        {/* Main content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            mt: 8, // To account for AppBar height
            backgroundColor: theme.palette.background.default,
            display: 'flex',
            justifyContent: 'center',
            width: '100%'
          }}
        >
          <Container 
            maxWidth="lg" 
            sx={{ 
              mx: 'auto'  // Center horizontally
            }}
          >
            <Paper 
              elevation={2}
              sx={{ 
                p: 3, 
                borderRadius: 2,
                minHeight: 'calc(100vh - 150px)'
              }}
            >
              {renderComponent()}
            </Paper>
          </Container>
        </Box>
        
        {/* Backend Monitor - only in Electron mode */}
        <BackendMonitor />
        
        {/* Notification */}
        <Snackbar 
          open={notification.open} 
          autoHideDuration={6000} 
          onClose={handleCloseNotification}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            onClose={handleCloseNotification} 
            severity={notification.severity} 
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;