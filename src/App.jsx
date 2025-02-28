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
  createTheme
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
  const [doctors, setDoctors] = useState([]);
  const [holidays, setHolidays] = useState({});
  const [availability, setAvailability] = useState({});
  const [schedule, setSchedule] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeComponent, setActiveComponent] = useState('doctors');

  // Load data on mount
  useEffect(() => {
    fetch('/doctors.json')
      .then(res => res.json())
      .then(data => {
        setDoctors(data);
        console.log("Loaded doctors:", data);
      })
      .catch(err => console.error('Error loading doctors.json', err));

    fetch('/holidays.json')
      .then(res => res.json())
      .then(data => {
        setHolidays(data);
        console.log("Loaded holidays:", data);
      })
      .catch(err => console.error('Error loading holidays.json', err));
  }, []);

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

  // Render the active component
  const renderComponent = () => {
    switch (activeComponent) {
      case 'doctors':
        return <DoctorConfig doctors={doctors} setDoctors={setDoctors} />;
      case 'holidays':
        return <HolidayConfig holidays={holidays} setHolidays={setHolidays} />;
      case 'availability':
        return <DoctorNeeds doctors={doctors} setAvailability={setAvailability} />;
      case 'generate':
        return (
          <GenerateSchedule
            doctors={doctors}
            holidays={holidays}
            availability={availability}
            setSchedule={setSchedule}
          />
        );
      case 'dashboard':
        return <Dashboard doctors={doctors} schedule={schedule} holidays={holidays} />;
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
          }}
        >
          <Container maxWidth="lg">
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
      </Box>
    </ThemeProvider>
  );
}

export default App;