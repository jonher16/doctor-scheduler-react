// Updated App.jsx with support for schedule editing

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
  Dashboard as DashboardIcon
} from '@mui/icons-material';

// Import components
import DoctorConfig from './components/DoctorConfig';
import HolidayConfig from './components/HolidayConfig';
import DoctorNeeds from './components/DoctorNeeds';
import GenerateSchedule from './components/GenerateSchedule';
import Dashboard from './components/Dashboard';
import MonthlyCalendarView from './components/MonthlyCalendarView';

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
  { text: 'Doctor Configuration', icon: <PersonIcon />, component: 'doctors' },
  { text: 'Holiday Configuration', icon: <EventNoteIcon />, component: 'holidays' },
  { text: 'Doctor Availability', icon: <CalendarTodayIcon />, component: 'availability' },
  { text: 'Generate Schedule', icon: <EventIcon />, component: 'generate' },
  { text: 'Dashboard', icon: <DashboardIcon />, component: 'dashboard' },
];

function App() {
  const [doctors, setDoctorsState] = useState([]);
  const [holidays, setHolidaysState] = useState({});
  const [availability, setAvailabilityState] = useState({});
  const [schedule, setScheduleState] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeComponent, setActiveComponent] = useState('doctors');
  
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
    // Try to load from localStorage first, then fall back to JSON files
    
    // Load doctors
    const localDoctors = localStorage.getItem('doctors');
    if (localDoctors) {
      try {
        setDoctorsState(JSON.parse(localDoctors));
        console.log("Loaded doctors from localStorage");
      } catch (err) {
        console.error('Error parsing doctors from localStorage', err);
        // Fall back to JSON file
        loadDoctorsFromFile();
      }
    } else {
      loadDoctorsFromFile();
    }

    // Load holidays
    const localHolidays = localStorage.getItem('holidays');
    if (localHolidays) {
      try {
        setHolidaysState(JSON.parse(localHolidays));
        console.log("Loaded holidays from localStorage");
      } catch (err) {
        console.error('Error parsing holidays from localStorage', err);
        // Fall back to JSON file
        loadHolidaysFromFile();
      }
    } else {
      loadHolidaysFromFile();
    }

    // Load availability
    const localAvailability = localStorage.getItem('availability');
    if (localAvailability) {
      try {
        setAvailabilityState(JSON.parse(localAvailability));
        console.log("Loaded availability from localStorage");
      } catch (err) {
        console.error('Error parsing availability from localStorage', err);
        // Initialize as empty object
        setAvailabilityState({});
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
        // Initialize as empty object
        setScheduleState({});
      }
    }
  }, []);

  const loadDoctorsFromFile = () => {
    fetch('/doctors.json')
      .then(res => res.json())
      .then(data => {
        setDoctorsState(data);
        console.log("Loaded doctors from file:", data);
      })
      .catch(err => console.error('Error loading doctors.json', err));
  };

  const loadHolidaysFromFile = () => {
    fetch('/holidays.json')
      .then(res => res.json())
      .then(data => {
        setHolidaysState(data);
        console.log("Loaded holidays from file:", data);
      })
      .catch(err => console.error('Error loading holidays.json', err));
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
      }
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
              Hospital Staff Scheduler
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