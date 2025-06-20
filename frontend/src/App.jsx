// Updated App.jsx with userData file loading and multi-year support

import React, { useState, useEffect } from 'react';
import YearSelector from './components/YearSelector';
import { YearProvider, useYear } from './contexts/YearContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
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
  Alert,
  AlertTitle,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Avatar,
  Badge,
  Tooltip,
  Menu,
  ListItemButton
} from '@mui/material';
import {
  Menu as MenuIcon,
  Person as PersonIcon,
  EventNote as EventNoteIcon,
  CalendarToday as CalendarTodayIcon,
  Event as EventIcon,
  Dashboard as DashboardIcon,
  CloudSync as CloudSyncIcon,
  LocalHospital as HospitalIcon,
  AccountCircle as AccountCircleIcon,
  ExitToApp as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

// Import components
import DoctorConfig from './components/DoctorConfig';
import HolidayConfig from './components/HolidayConfig';
import DoctorNeeds from './components/DoctorNeeds';
import GenerateSchedule from './components/GenerateSchedule';
import Dashboard from './components/Dashboard';
import BackendMonitor from './components/BackendMonitor';
import SyncPage from './components/SyncPage';
import ShiftManager from './components/ShiftManager';
import UserManagement from './components/UserManagement';

// Import utility functions
import { getYearRange } from './utils/dateUtils';

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

// Determine if we're running in Electron
const isElectron = window.platform?.isElectron;

// Set the API URL based on environment
const API_URL = isElectron 
  ? 'http://localhost:5000/api'  // Local backend when in Electron
  : '/api'; // Use relative path for web version - will be proxied by Nginx or environment variables

function App() {
  // Get the year range from the utility function for the selector options
  const { years } = getYearRange();
  
  const [doctors, setDoctorsState] = useState([]);
  const [holidays, setHolidaysState] = useState({});
  const [availability, setAvailabilityState] = useState({});
  const [schedule, setScheduleState] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeComponent, setActiveComponent] = useState('generate');
  const [isLoading, setIsLoading] = useState(true);
  const [appPaths, setAppPaths] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  
  // Use the year context instead of local state
  const { selectedYear, yearChanged, resetYearChanged } = useYear();
  
  // Get auth context
  const { currentUser, userProfile, logout, hasAdminAccess } = useAuth();
  
  // For notifications
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  // Menu items - now includes user management for admins
  const getMenuItems = () => {
    const baseItems = [
      { text: 'Generate Schedule', icon: <EventIcon />, component: 'generate' },
      { text: 'Dashboard', icon: <DashboardIcon />, component: 'dashboard' },
      { text: 'Doctor Configuration', icon: <PersonIcon />, component: 'doctors' },
      { text: 'Holiday Configuration', icon: <EventNoteIcon />, component: 'holidays' },
      { text: 'Doctor Availability', icon: <CalendarTodayIcon />, component: 'availability' },
      { text: 'Shift Manager', icon: <EventIcon />, component: 'shiftmanager' },
      { text: 'Cloud Sync', icon: <CloudSyncIcon />, component: 'sync' },
    ];

    // Add user management for admin users
    if (hasAdminAccess()) {
      baseItems.push({ text: 'User Management', icon: <AdminIcon />, component: 'usermanagement' });
    }

    return baseItems;
  };

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
        year: selectedYear, // Add the year to the metadata
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

  useEffect(() => {
    if (yearChanged) {
      // Clear schedule data
      setScheduleState({});
      
      // Set active component to generate schedule
      setActiveComponent('generate');
      
      // Reset the year changed flag
      resetYearChanged();
      
      // Show notification to the user
      setNotification({
        open: true,
        message: `Year changed to ${selectedYear}. Please generate a new schedule.`,
        severity: 'info'
      });
    }
  }, [yearChanged, resetYearChanged, selectedYear]);

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
    
    return loadedHolidays;
  };
  
  // Load data from userData directory via Electron
  const loadFromUserData = async () => {
    if (!isElectron || !window.electron) return false;
    
    let loadedHolidays = false;
    
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
    
    return loadedHolidays;
  };
  
  // Load data from public JSON files
  const loadFromPublicFiles = async () => {
    let loadedHolidays = false;
    
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
    
    return loadedHolidays;
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
    // Check if navigation is blocked (unsaved changes)
    if (navigationBlocked && (activeComponent === 'doctors' || activeComponent === 'shiftmanager' || activeComponent === 'holidays' || activeComponent === 'availability')) {
      setPendingNavigation(component);
      return;
    }
    
    setActiveComponent(component);
    setDrawerOpen(false);
  };
  
  const handleCloseNotification = () => {
    setNotification({...notification, open: false});
  };

  // User profile menu handlers
  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      handleProfileMenuClose();
    } catch (error) {
      console.error('Logout failed:', error);
      setNotification({
        open: true,
        message: 'Failed to logout',
        severity: 'error'
      });
    }
  };

  // Helper to check if menu item is active
  const isActiveRoute = (component) => {
    return activeComponent === component;
  };

  // Get first letter of Hospital Scheduler for Avatar
  const getAvatarLetter = () => {
    return "H";
  };

  // Drawer content with improved styling
  const drawerContent = (
    <Box
      sx={{ width: 280 }}
      role="presentation"
      onClick={toggleDrawer(false)}
      onKeyDown={toggleDrawer(false)}
    >
      <Box sx={{ 
        height: 170, 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: 'primary.main',
        color: 'white',
        px: 2,
        position: 'relative'
      }}>
        <Avatar 
          sx={{ 
            width: 70, 
            height: 70, 
            bgcolor: 'white', 
            color: 'primary.main',
            fontSize: 32,
            fontWeight: 'bold',
            mb: 1
          }}
        >
          {getAvatarLetter()}
        </Avatar>
        
        <Typography variant="h6" align="center" sx={{ fontWeight: 500 }}>
          HERS Menu
        </Typography>
        
        <Typography variant="body2" align="center" sx={{ opacity: 0.8 }}>
          {`Year: ${selectedYear}`}
        </Typography>
        
        <HospitalIcon sx={{ 
          position: 'absolute', 
          right: 20, 
          top: 20, 
          fontSize: 28,
          opacity: 0.7
        }} />
      </Box>
      
      <Divider />
      
      <Box sx={{ py: 1 }}>
        {navigationBlocked && (activeComponent === 'doctors' || activeComponent === 'shiftmanager' || activeComponent === 'holidays' || activeComponent === 'availability') && (
          <Box sx={{ px: 2, py: 1, mx: 1, bgcolor: 'warning.light', borderRadius: 1, mb: 1 }}>
            <Typography variant="caption" color="warning.contrastText" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WarningIcon fontSize="small" />
              You have unsaved changes in {activeComponent === 'doctors' ? 'Doctor Configuration' : activeComponent === 'shiftmanager' ? 'Shift Manager' : activeComponent === 'holidays' ? 'Holiday Configuration' : 'Doctor Availability'}
            </Typography>
          </Box>
        )}
        <List>
          {getMenuItems().map((item) => {
            const isActive = isActiveRoute(item.component);
            
            return (
              <ListItem 
                button 
                key={item.component} 
                onClick={() => handleMenuItemClick(item.component)}
                sx={{ 
                  pl: 3,
                  py: 1.5,
                  bgcolor: isActive ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                  '&:hover': {
                    bgcolor: isActive ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transform: 'translateX(3px)',
                    borderRadius: '4px',
                  },
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  borderRadius: '4px',
                  mx: 1,
                  position: 'relative'
                }}
              >
                <ListItemIcon sx={{ 
                  color: isActive ? 'primary.main' : 'inherit',
                  minWidth: 45,
                  transition: 'color 0.2s ease-in-out',
                  '& .MuiSvgIcon-root': {
                    transition: 'transform 0.2s ease-in-out',
                  },
                  '.MuiListItem-root:hover &': {
                    color: 'primary.main',
                    '& .MuiSvgIcon-root': {
                      transform: 'scale(1.1)',
                    },
                  }
                }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ 
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'primary.main' : 'inherit',
                    transition: 'color 0.2s ease-in-out, font-weight 0.2s ease-in-out',
                    '.MuiListItem-root:hover &': {
                      color: 'primary.main',
                      fontWeight: 500
                    }
                  }} 
                />
                {isActive && (
                  <Box 
                    sx={{ 
                      width: 4, 
                      height: 35, 
                      bgcolor: 'primary.main',
                      position: 'absolute',
                      left: 0,
                      borderRadius: '0 4px 4px 0'
                    }} 
                  />
                )}
              </ListItem>
            );
          })}
        </List>
      </Box>
      
      <Divider />
      
      <Box sx={{ p: 2, mt: 'auto' }}>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block' }}>
          H.E.R.S.
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block' }}>
          (Hospital Emergency Room Scheduler) 
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block' }}>
        Admin Portal v1.0
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block' }}>
          {`Smart Health Lab 2025, Jon HERnandez`}
        </Typography>
      </Box>
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
            holidays: metadata.holidays || holidays, // Fall back to current holidays if needed
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
    
    // If holidays data is missing, show message with app paths for debugging
    if (!hasHolidays && isElectron) {
      return (
        <Box>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Missing Holiday Data</AlertTitle>
            <p>No holidays data available. Please check application installation.</p>
            {!hasDoctors && <p>No doctors configured yet. You can add doctors using the Doctor Configuration menu.</p>}
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
        return <DoctorConfig 
          doctors={doctors} 
          setDoctors={setDoctors} 
          setNavigationBlock={setNavigationBlock}
          onNavigationAfterSave={handleNavigationAfterSave}
          onNavigationCancel={handleNavigationCancel}
          pendingNavigation={pendingNavigation}
        />;
      case 'holidays':
        return <HolidayConfig 
          holidays={holidays} 
          setHolidays={setHolidays}
          setNavigationBlock={setNavigationBlock}
          onNavigationAfterSave={handleNavigationAfterSave}
          onNavigationCancel={handleNavigationCancel}
          pendingNavigation={pendingNavigation}
        />;
      case 'availability':
        return <DoctorNeeds 
          doctors={doctors} 
          setAvailability={setAvailability} 
          availability={availability}
          setNavigationBlock={setNavigationBlock}
          onNavigationAfterSave={handleNavigationAfterSave}
          onNavigationCancel={handleNavigationCancel}
          pendingNavigation={pendingNavigation}
        />;
      case 'generate':
        return (
          <GenerateSchedule
            doctors={doctors}
            holidays={holidays}
            availability={availability}
            setSchedule={setSchedule}
            apiUrl={API_URL}
          />
        );
      case 'dashboard': {
        // Get the schedule data with its snapshot of doctors/holidays
        const { schedule: dashboardSchedule, doctors: dashboardDoctors, holidays: dashboardHolidays} = getScheduleData();
        return <Dashboard 
          doctors={dashboardDoctors} 
          schedule={dashboardSchedule} 
          holidays={dashboardHolidays}
          availability={availability}
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
      case 'shiftmanager':
      return <ShiftManager 
        doctors={doctors} 
        setDoctors={setDoctors} 
        availability={availability} 
        setAvailability={setAvailability}
        setNavigationBlock={setNavigationBlock}
        onNavigationAfterSave={handleNavigationAfterSave}
        onNavigationCancel={handleNavigationCancel}
        pendingNavigation={pendingNavigation}
      />;
      case 'usermanagement':
        return <UserManagement 
          currentUser={currentUser}
          userProfile={userProfile}
          logout={logout}
        />;
      default:
        return <DoctorConfig doctors={doctors} setDoctors={setDoctors} />;
    }
  };

  // Function for components to register navigation blocking
  const setNavigationBlock = (blocked) => {
    setNavigationBlocked(blocked);
  };

  // Handle navigation after resolving unsaved changes
  const handleNavigationAfterSave = () => {
    if (pendingNavigation) {
      setActiveComponent(pendingNavigation);
      setPendingNavigation(null);
    }
    setNavigationBlocked(false);
    setDrawerOpen(false);
  };

  // Handle navigation cancellation
  const handleNavigationCancel = () => {
    setPendingNavigation(null);
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
            
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <HospitalIcon sx={{ mr: 1, fontSize: 28 }} />
              <Typography variant="h6" component="div">
                HERS Admin
              </Typography>
            </Box>
            
            <Box sx={{ flexGrow: 1 }} />
            
            {/* Year selector */}
            <YearSelector />

            {/* User Profile Menu */}
            <Box sx={{ ml: 2 }}>
              <Tooltip title="User Profile">
                <IconButton
                  size="large"
                  aria-label="account of current user"
                  aria-controls="profile-menu"
                  aria-haspopup="true"
                  onClick={handleProfileMenuOpen}
                  color="inherit"
                >
                  <AccountCircleIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="profile-menu"
                anchorEl={anchorEl}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
                open={Boolean(anchorEl)}
                onClose={handleProfileMenuClose}
              >
                <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    {userProfile?.name || 'User'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {userProfile?.email || currentUser?.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Role: {userProfile?.isHersAdmin ? 'Admin' : 'Doctor'}
                  </Typography>
                </Box>
                <ListItemButton onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText primary="Sign Out" />
                </ListItemButton>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>
        
        {/* Drawer with improved styling */}
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={toggleDrawer(false)}
          PaperProps={{
            sx: {
              borderRadius: '0 12px 12px 0'
            }
          }}
        >
          {drawerContent}
        </Drawer>
        
        {/* Main content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3 },
            mt: 8, // To account for AppBar height
            backgroundColor: theme.palette.background.default,
            width: '100%'
          }}
        >
          <Container 
            maxWidth="lg" 
            sx={{ 
              display: 'flex',
              justifyContent: 'center',
              px: { xs: 2, sm: 3 },
              margin: '0 auto'
            }}
          >
            <Paper 
              elevation={2}
              sx={{ 
                p: { xs: 2, sm: 3 }, 
                borderRadius: 3, 
                minHeight: 'calc(100vh - 150px)',
                width: '100%',
                border: `1px solid ${theme.palette.divider}`,
                margin: '0 auto'
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
            variant="filled"
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default function AppWithYearContext() {
  return (
    <YearProvider>
      <AuthProvider>
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      </AuthProvider>
    </YearProvider>
  );
}