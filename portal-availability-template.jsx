import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  Paper,
  Chip,
  Alert,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Card,
  CardContent,
  Checkbox,
  IconButton,
  Tooltip,
  useTheme,
  Menu,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  CalendarMonth as CalendarIcon,
  Check as CheckIcon,
  Clear as ClearIcon,
  KeyboardArrowRight as RightIcon,
  KeyboardArrowLeft as LeftIcon,
  Warning as WarningIcon,
  ArrowDropDown as DropDownIcon,
  Sync as SyncIcon,
  Edit as EditIcon,
  AccessTime as AccessTimeIcon,
  RestartAlt as ResetIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  isValidAvailabilityStatus, 
  getAvailabilityDisplayName,
  parseAvailabilityStatus
} from '../utils/availabilityUtils';

function Availability() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  // Initialize with localStorage or location state or current date
  const [month, setMonth] = useState(() => {
    const savedMonth = localStorage.getItem('lastViewedMonth');
    if (savedMonth) return parseInt(savedMonth, 10);
    if (location.state?.selectedMonth) return location.state.selectedMonth;
    return new Date().getMonth() + 1; // Current month (1-12)
  });
  
  const [year, setYear] = useState(() => {
    const savedYear = localStorage.getItem('lastViewedYear');
    if (savedYear) return parseInt(savedYear, 10);
    if (location.state?.selectedYear) return location.state.selectedYear;
    return new Date().getFullYear(); // Current year
  });

  // Save month and year to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('lastViewedMonth', month.toString());
    localStorage.setItem('lastViewedYear', year.toString());
  }, [month, year]);
  
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [monthCompleted, setMonthCompleted] = useState(false);
  const [yearSelectOpen, setYearSelectOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // State for unsaved changes confirmation dialog
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState(null);
  
  // Access theme
  const theme = useTheme();

  // Helper to parse status string into a set of unavailable shifts
  const getUnavailableShiftsSet = (statusString) => {
    if (!statusString || statusString === "Available") {
      return new Set();
    }
    if (statusString === "Not Available") {
      return new Set(['Day', 'Evening', 'Night']);
    }
    if (statusString.startsWith("Not Available: ")) {
      const shifts = statusString.substring("Not Available: ".length).split(', ');
      return new Set(shifts);
    }
    return new Set(); // Should not happen with valid status strings
  };

  const handleShiftCheckboxChange = (date, shift, isChecked) => {
    const currentStatus = availability[date] || "Available"; // Get current or default to Available
    const unavailableShifts = getUnavailableShiftsSet(currentStatus);

    if (isChecked) {
      unavailableShifts.add(shift);
    } else {
      unavailableShifts.delete(shift);
    }

    let newStatus;
    if (unavailableShifts.size === 0) {
      newStatus = "Available";
    } else if (unavailableShifts.size === 3) {
      newStatus = "Not Available";
    } else {
      // Sort for consistent status string
      const sortedShifts = Array.from(unavailableShifts).sort();
      newStatus = `Not Available: ${sortedShifts.join(', ')}`;
    }

    setAvailability(prevAvailability => ({
      ...prevAvailability,
      [date]: newStatus
    }));
    setHasUnsavedChanges(true);
  };

  const handleWholeDayChange = (date, makeUnavailable) => {
    const newStatus = makeUnavailable ? "Not Available" : "Available";
    setAvailability(prevAvailability => ({
      ...prevAvailability,
      [date]: newStatus
    }));
    setHasUnsavedChanges(true);
  };

  // Helper function to request a month/year change, checking for unsaved changes
  const requestNavigation = (action) => {
    if (hasUnsavedChanges) {
      setPendingNavigationAction(() => action); // Store the action
      setUnsavedChangesDialogOpen(true);
    } else {
      action(); // No unsaved changes, proceed directly
    }
  };

  const handleConfirmLeavePage = () => {
    if (pendingNavigationAction) {
      pendingNavigationAction(); // Execute the stored navigation action
    }
    setHasUnsavedChanges(false); // Reset unsaved changes as we are leaving
    setUnsavedChangesDialogOpen(false);
    setPendingNavigationAction(null);
  };

  const handleCancelLeavePage = () => {
    setUnsavedChangesDialogOpen(false);
    setPendingNavigationAction(null);
  };

  // Helper function to go to previous month/year
  const handlePrevMonth = () => {
    requestNavigation(() => {
      if (month > 1) {
        setMonth(month - 1);
      } else {
        setMonth(12);
        setYear(year - 1);
      }
    });
  };

  // Helper function to go to next month/year
  const handleNextMonth = () => {
    requestNavigation(() => {
      if (month < 12) {
        setMonth(month + 1);
      } else {
        setMonth(1);
        setYear(year + 1);
      }
    });
  };

  // Fetch doctor's availability and month completion status
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;
      
      try {
        setLoading(true);
        setAvailability({}); // Reset availability for the new month/year
        setMonthCompleted(false); // Default to incomplete while loading

        const availabilityRef = doc(db, "availability", currentUser.uid);
        const availabilitySnap = await getDoc(availabilityRef);
        if (availabilitySnap.exists()) {
          setAvailability(availabilitySnap.data());
        }
        
        // Fetch month completion status from Firestore
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const completionRef = doc(db, "monthCompletion", currentUser.uid);
        const completionSnap = await getDoc(completionRef);
        
        if (completionSnap.exists() && completionSnap.data()[monthKey] !== undefined) {
          // Use the status directly from Firestore if it exists
          setMonthCompleted(completionSnap.data()[monthKey]);
          console.log(`Month completion for ${monthKey} loaded from Firestore: ${completionSnap.data()[monthKey]}`);
        } else {
          // No completion data in Firestore for this month, so it's incomplete
          setMonthCompleted(false);
          console.log(`No Firestore completion data for ${monthKey}. Setting to Incomplete.`);
        }
        
      } catch (error) {
        console.error("Error fetching data:", error);
        setNotification({
          open: true,
          message: `Error loading data: ${error.message}`,
          severity: 'error'
        });
      } finally {
        setLoading(false);
        // setHasUnsavedChanges(false); // Reset on new month load after initial data is set
      }
    };
    
    fetchData();
  }, [currentUser, month, year]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = ''; // Required for Chrome
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Generate calendar dates for the selected month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  // Function to get the first day of the month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month - 1, 1).getDay();
  };

  // Generate linear list of calendar dates
  const generateDates = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const dates = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dates.push(dateStr);
    }
    
    return dates;
  };

  // Function to organize dates into calendar weeks
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Create array for all calendar cells
    const days = [];
    
    // Add empty cells for days before the 1st of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push(dateStr);
    }
    
    // Organize into weeks
    const weeks = [];
    let week = [];
    
    days.forEach((day, index) => {
      week.push(day);
      if (index % 7 === 6 || index === days.length - 1) {
        // Fill remaining cells in last week
        while (week.length < 7) {
          week.push(null);
        }
        weeks.push(week);
        week = [];
      }
    });
    
    return weeks;
  };

  // Re-implement isMonthFullyComplete
  const isMonthFullyComplete = () => {
    const allDatesInMonth = generateDates(); // Assumes generateDates() returns array of YYYY-MM-DD strings
    if (!allDatesInMonth || allDatesInMonth.length === 0) return false; // Or true if an empty month is considered complete
    return allDatesInMonth.every(dateStr => availability[dateStr] !== undefined);
  };

  // Save all availability changes
  const handleSaveAvailability = async () => {
    // Remove previous detailed logging for production
    // console.log("--- Debugging handleSaveAvailability ---");
    // ... (other debug logs removed)

    try {
      setIsSaving(true);
      await setDoc(doc(db, "availability", currentUser.uid), { ...availability });
      setHasUnsavedChanges(false);

      // NEW LOGIC FOR MONTH COMPLETION:
      // The act of saving means the doctor has reviewed the month.
      // All untouched days are implicitly "Available".
      // So, we mark the month as complete in the DB and UI.
      const isNowConsideredComplete = true; 
      
      setMonthCompleted(isNowConsideredComplete); // Update local UI state immediately

      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const completionRef = doc(db, "monthCompletion", currentUser.uid);
      const completionSnap = await getDoc(completionRef);
      const completionData = completionSnap.exists() ? { ...completionSnap.data() } : {};
      
      // Only update Firestore if it's not already marked as complete, or to explicitly mark it complete
      if (completionData[monthKey] !== isNowConsideredComplete) {
        completionData[monthKey] = isNowConsideredComplete;
        await setDoc(completionRef, completionData);
      }

      setNotification({
        open: true,
        // Message reflects that saving makes it complete
        message: `Availability saved! ${getMonthName(month)} ${year} is now marked as complete.`,
        severity: 'success'
      });

    } catch (error) {
      console.error("Error saving availability:", error);
      setNotification({
        open: true,
        message: `Error saving availability: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Placeholder for updateMonthCompletionStatus if needed directly
  const updateMonthCompletionStatus = async (isComplete) => {
    // This function might be refactored or merged into handleSaveAvailability's logic
    // For now, it ensures the monthCompleted state is set and DB is updated.
    setMonthCompleted(isComplete);
    try {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const completionRef = doc(db, "monthCompletion", currentUser.uid);
      const completionSnap = await getDoc(completionRef);
      const completionData = completionSnap.exists() ? { ...completionSnap.data() } : {};
      if (completionData[monthKey] !== isComplete) {
        completionData[monthKey] = isComplete;
        await setDoc(completionRef, completionData);
        console.log(`Month completion for ${monthKey} updated to ${isComplete} in DB.`);
      }
    } catch (error) {
      console.error('Error updating month completion status:', error);
      // Optionally revert UI or show specific error
    }
  };
  
  // useEffect to check month completion when availability changes or on load (after initial data)
  // useEffect(() => {
  //   if (loading) return; // Don't run on initial load before data is fetched

  //   const checkCompletion = () => {
  //     const isComplete = isMonthFullyComplete();
  //     if (isComplete !== monthCompleted) {
  //         setMonthCompleted(isComplete);
  //         // If we want to auto-save completion status to DB as soon as it changes:
  //         // updateMonthCompletionStatus(isComplete); 
  //         // However, this might be better tied to the main save operation.
  //     }
  //   };

  //   // Check completion after a brief delay to allow other state updates
  //   const timer = setTimeout(checkCompletion, 100);
  //   return () => clearTimeout(timer);
  // }, [availability, month, year, loading, monthCompleted]); // monthCompleted added to dependencies

  // Progress Bar component
  const ProgressBar = ({ value }) => (
    <Box sx={{ 
      width: '100%', 
      height: 8, 
      borderRadius: 5,
      bgcolor: 'rgba(0, 0, 0, 0.1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <Box sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        width: `${value}%`,
        bgcolor: value === 100 ? 'success.main' : 'primary.main',
        borderRadius: 5,
      }} />
    </Box>
  );

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // Helpers
  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  const isWeekend = (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday
  };

  // Update status color helper to use gray for "Not Set"
  const getStatusColor = (status) => {
    if (!isValidAvailabilityStatus(status) && status !== 'Not Set') {
      return 'default';
    }

    if (status === 'Not Set') {
      return 'default'; // Change from warning to default (gray)
    }
    
    // Check if status is in the shift-specific unavailability format
    if (status && status.startsWith('Not Available: ')) {
      return 'warning'; // Use orange (warning) for partial availability
    }
    
    switch (status) {
      case 'Available': return 'success';
      case 'Not Available': return 'error';
      default: return 'default';
    }
  };

  const getStatusBackground = (status) => {
    if (!isValidAvailabilityStatus(status) && status !== 'Not Set') {
      return 'transparent';
    }

    if (status === 'Not Set') {
      return 'rgba(0, 0, 0, 0.08)'; // Change to light gray background
    }
    
    // Check if status is in the shift-specific unavailability format
    if (status && status.startsWith('Not Available: ')) {
      return 'rgba(255, 152, 0, 0.08)'; // Use orange background for partial availability
    }
    
    switch (status) {
      case 'Available': return 'rgba(46, 125, 50, 0)';
      case 'Not Available': return 'rgba(244, 67, 54, 0.08)';
      default: return 'transparent';
    }
  };

  // Generate array of years for selection (dynamically -2 to +10 years from current)
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 10;
    
    // Create array of all years in range
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }
    return years;
  };

  // Get the display status for a date (considering implicit "Not Set")
  const getDisplayStatus = (date) => {
    if (availability[date]) {
      return availability[date];
    }
    return "Available"; // Default to "Available"
  };

  // Update to handle display of specific shifts correctly
  const getAvailabilityDisplayName = (status) => {
    if (!status || status === 'Not Set') {
      return 'Not Set';
    }
    
    if (status === 'Available') {
      return 'Available';
    }
    
    if (status === 'Not Available') {
      return 'Not Available';
    }
    
    // For shift-specific unavailability, show only the unavailable shifts
    if (status.startsWith('Not Available: ')) {
      return status; // Already in the correct format
    }
    
    return status;
  };

  // Add state for context menu
  const [contextMenu, setContextMenu] = useState({
    mouseX: null,
    mouseY: null,
    date: null,
    useSelection: false
  });

  // Handle right-click context menu
  const handleDateContextMenu = (event, date) => {
    event.preventDefault();
    // Check if we should apply to all selected dates or just this one
    const shouldUseSelection = selectedDates.length > 0 && selectedDates.includes(date);
    
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      date: date,
      useSelection: shouldUseSelection
    });
  };

  // Handle closing the context menu
  const handleCloseContextMenu = () => {
    setContextMenu({
      mouseX: null,
      mouseY: null,
      date: null,
      useSelection: false
    });
  };

  // Handle removing availability and resetting to "Not Set"
  const handleRemoveAvailability = async () => {
    if (!contextMenu.date) return;
    
    try {
      // Create updated availability state
      const updatedAvailability = { ...availability };
      
      // Determine which dates to update
      const datesToUpdate = contextMenu.useSelection 
        ? selectedDates 
        : [contextMenu.date];
      
      // Delete the date entries to reset to "Not Set"
      datesToUpdate.forEach(date => {
        delete updatedAvailability[date];
      });
      
      // Update the local availability state
      setAvailability(updatedAvailability);
      
      // Format message for display
      const displayMessage = contextMenu.useSelection
        ? `${datesToUpdate.length} dates reset to "Not Set"`
        : `Availability for ${new Date(contextMenu.date).toLocaleDateString()} reset to "Not Set"`;
      
      // Save updated availability to the database
      await setDoc(doc(db, "availability", currentUser.uid), updatedAvailability);
      
      // After updating availability, check if the month is complete (100%)
      const wasComplete = monthCompleted;
      const isNowComplete = isMonthFullyComplete();
      
      // If completion status changed, update it
      if (wasComplete !== isNowComplete) {
        // Update UI immediately
        setMonthCompleted(isNowComplete);
        
        // Update the database
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const completionRef = doc(db, "monthCompletion", currentUser.uid);
        const completionSnap = await getDoc(completionRef);
        
        const completionData = completionSnap.exists() ? completionSnap.data() : {};
        completionData[monthKey] = isNowComplete;
        await setDoc(completionRef, completionData);
        
        // Show appropriate notification
        if (wasComplete && !isNowComplete) {
          // Was complete, now incomplete
          setNotification({
            open: true,
            message: `${displayMessage} and saved. ${getMonthName(month)} ${year} is now marked as incomplete.`,
            severity: 'info'
          });
        } else if (!wasComplete && isNowComplete) {
          // Was incomplete, now complete
          setNotification({
            open: true,
            message: `${displayMessage} and saved. ${getMonthName(month)} ${year} is now marked as complete.`,
            severity: 'success'
          });
        }
      } else {
        // Status didn't change
        setNotification({
          open: true,
          message: `${displayMessage} and saved.`,
          severity: 'success'
        });
      }
    } catch (error) {
      console.error("Error updating availability:", error);
      setNotification({
        open: true,
        message: `Error: ${error.message}`,
        severity: 'error'
      });
    } finally {
      // Always close the context menu
      handleCloseContextMenu();
    }
  };

  // Force refresh the month completion status
  const forceRefreshCompletionStatus = () => {
    // Calculate the current completion status
    const isComplete = isMonthFullyComplete();
    
    // Update UI state immediately
    setMonthCompleted(isComplete);
    
    console.log(`Forced refresh of month completion status: ${isComplete ? 'Complete' : 'Not complete'}`);
    
    return isComplete;
  };

  // Refresh the month completion status whenever availability changes
  // useEffect(() => {
  //   if (loading) return;
  //   const checkCompletion = () => {
  //     const isComplete = isMonthFullyComplete();
  //     if (isComplete !== monthCompleted) {
  //       setMonthCompleted(isComplete);
  //     }
  //   };
  //   const timer = setTimeout(checkCompletion, 100);
  //   return () => clearTimeout(timer);
  // }, [availability, loading, month, year, monthCompleted]); // Added month, year, monthCompleted

  // Restore handleClearMonth and confirmClearMonth
  const handleClearMonth = () => {
    setConfirmOpen(true);
  };

  const confirmClearMonth = () => {
    const updatedAvailability = { ...availability };
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    
    let changed = false;
    Object.keys(updatedAvailability).forEach(date => {
      if (date.startsWith(monthPrefix)) {
        delete updatedAvailability[date];
        changed = true;
      }
    });
    
    if (changed) {
      setAvailability(updatedAvailability);
      setHasUnsavedChanges(true);
    }
    
    // Explicitly mark month as incomplete in UI and Firestore
    setMonthCompleted(false);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const completionRef = doc(db, "monthCompletion", currentUser.uid);
    getDoc(completionRef).then(completionSnap => {
      const completionData = completionSnap.exists() ? { ...completionSnap.data() } : {};
      if (completionData[monthKey] !== false) {
        completionData[monthKey] = false;
        setDoc(completionRef, completionData).catch(err => console.error("Error updating month completion on clear:", err));
      }
    }).catch(err => console.error("Error fetching month completion for clear:", err));

    setConfirmOpen(false);
    
    setNotification({
      open: true,
      message: `All availability for ${getMonthName(month)} ${year} has been cleared. Remember to save your changes.`,
      severity: 'info'
    });
  };

  // Handle setting availability status from context menu
  const handleSetAvailabilityFromMenu = async (status) => {
    if (!contextMenu.date) return;
    
    try {
      // Create updated availability state
      const updatedAvailability = { ...availability };
      
      // Determine which dates to update
      const datesToUpdate = contextMenu.useSelection 
        ? selectedDates 
        : [contextMenu.date];
      
      // Set the status for all dates
      datesToUpdate.forEach(date => {
        updatedAvailability[date] = status;
      });
      
      // Update the local availability state
      setAvailability(updatedAvailability);
      
      // Format message for display
      const statusDisplay = getAvailabilityDisplayName(status);
      const displayMessage = contextMenu.useSelection
        ? `${datesToUpdate.length} dates set to "${statusDisplay}"`
        : `Availability for ${new Date(contextMenu.date).toLocaleDateString()} set to "${statusDisplay}"`;
      
      // Save updated availability to the database
      await setDoc(doc(db, "availability", currentUser.uid), updatedAvailability);
      
      // After updating availability, check if the month is complete (100%)
      const wasComplete = monthCompleted;
      const isNowComplete = isMonthFullyComplete();
      
      // If completion status changed, update it
      if (wasComplete !== isNowComplete) {
        // Update UI immediately
        setMonthCompleted(isNowComplete);
        
        // Update the database
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const completionRef = doc(db, "monthCompletion", currentUser.uid);
        const completionSnap = await getDoc(completionRef);
        
        const completionData = completionSnap.exists() ? completionSnap.data() : {};
        completionData[monthKey] = isNowComplete;
        await setDoc(completionRef, completionData);
        
        // Show appropriate notification
        if (wasComplete && !isNowComplete) {
          // Was complete, now incomplete
          setNotification({
            open: true,
            message: `${displayMessage} and saved. ${getMonthName(month)} ${year} is now marked as incomplete.`,
            severity: 'info'
          });
        } else if (!wasComplete && isNowComplete) {
          // Was incomplete, now complete
          setNotification({
            open: true,
            message: `${displayMessage} and saved. ${getMonthName(month)} ${year} is now marked as complete.`,
            severity: 'success'
          });
        }
      } else {
        // Status didn't change
        setNotification({
          open: true,
          message: `${displayMessage} and saved.`,
          severity: 'success'
        });
      }
      
      // Clear selection after applying the changes
      setSelectedDates([]);
      setLastSelectedDate(null);
      
    } catch (error) {
      console.error("Error updating availability:", error);
      setNotification({
        open: true,
        message: `Error: ${error.message}`,
        severity: 'error'
      });
    } finally {
      // Always close the context menu
      handleCloseContextMenu();
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Page Title without the Sync Navigation Button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h1">
          My Availability Calendar
        </Typography>
      </Box>
      
      <Card sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={7}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <IconButton
                  onClick={handlePrevMonth}
                  aria-label="previous month"
                  size="small"
                >
                  <LeftIcon />
                </IconButton>
                
                <Box sx={{ display: 'flex', flexGrow: 1 }}>
                  {/* Month Select */}
                  <FormControl size="small" sx={{ minWidth: 130, mr: 1 }}>
                    <InputLabel id="month-select-label">Month</InputLabel>
                    <Select
                      labelId="month-select-label"
                      value={month}
                      label="Month"
                      onChange={(e) => requestNavigation(() => setMonth(e.target.value))}
                      disabled={loading}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <MenuItem key={m} value={m}>
                          {getMonthName(m)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  {/* Year Select */}
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel id="year-select-label">Year</InputLabel>
                    <Select
                      labelId="year-select-label"
                      value={year}
                      label="Year"
                      onChange={(e) => requestNavigation(() => setYear(e.target.value))}
                      open={yearSelectOpen}
                      onClose={() => setYearSelectOpen(false)}
                      onOpen={() => setYearSelectOpen(true)}
                      disabled={loading}
                      MenuProps={{
                        PaperProps: {
                          style: {
                            maxHeight: 300
                          }
                        }
                      }}
                    >
                      {generateYearOptions().map((y) => (
                        <MenuItem key={y} value={y}>
                          {y}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                
                <IconButton
                  onClick={handleNextMonth}
                  aria-label="next month"
                  size="small"
                >
                  <RightIcon />
                </IconButton>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={5} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              {/* Updated Save button to indicate syncing */}
              <Button
                variant="contained"
                color="primary"
                startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                endIcon={<SyncIcon />}
                onClick={handleSaveAvailability}
                disabled={isSaving || loading}
                size="small"
                sx={{
                  fontWeight: 500,
                  transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                  ...(hasUnsavedChanges && !isSaving && {
                    transform: 'scale(1.03)',
                    boxShadow: theme.shadows[6], // Use a theme shadow for consistency
                  }),
                }}
              >
                {isSaving ? 'Saving...' : 'Save Changes & Sync'}
              </Button>
              
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleClearMonth}
                disabled={loading}
                size="small"
              >
                Clear Month
              </Button>
            </Grid>
            
            <Grid item xs={12}>
              {/* Automatic month completion status display (no checkbox) */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 2, px:1, py:1, bgcolor: 'rgba(0,0,0,0.03)', borderRadius:1 }}>
                <Typography variant="subtitle2" sx={{ mr: 1 }}>
                  Month Status:
                </Typography>
                <Chip 
                  label={monthCompleted ? "Complete" : "Incomplete"}
                  color={monthCompleted ? "success" : "warning"}
                  size="small"
                />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Main Calendar and Controls Card */}
      <Card sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          {/* Status Selection Controls - Section to be simplified/removed */}
          <Box sx={{ mb: 2, pb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2">
                Daily Shift Availability:
              </Typography>
            </Box>
            
            {/* Simplify this Alert message */}
            <Alert severity="info" sx={{ py: 0.5, mt: 1 }}>
              <Typography variant="caption">
                Your calendar defaults to 'Available'. Use the checkboxes on each day to mark specific shifts you are <strong>unavailable</strong> for. Click "Save Changes & Sync" to save.
              </Typography>
            </Alert>
          </Box>
          
          {/* Calendar Controls - Remove Range selection button */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'flex-start',
            mb: 2,
            flexWrap: 'wrap', 
            gap: 1
          }}>
            <Typography variant="subtitle2" sx={{ mr: 1 }}>
              Calendar:
            </Typography>
          </Box>
          
          {/* Calendar */}
          <Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={50} />
              </Box>
            ) : (
              <Box>
                {/* Calendar Header with Days of Week */}
                <Grid container sx={{ mb: 1 }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <Grid item xs={12/7} key={day}>
                      <Typography 
                        variant="subtitle2"
                        align="center"
                        sx={{ 
                          fontWeight: 500,
                          py: 0.5,
                          color: (index === 0 || index === 6) ? 'error.main' : 'text.primary',
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        }}
                      >
                        {day}
                      </Typography>
                    </Grid>
                  ))}
                </Grid>
                
                {/* Calendar Grid */}
                {generateCalendarDays().map((week, weekIndex) => (
                  <Grid container key={`week-${weekIndex}`} sx={{ mb: 0.5 }}>
                    {week.map((date, dayIndex) => {
                      if (!date) {
                        // Empty cell
                        return (
                          <Grid item xs={12/7} key={`empty-${weekIndex}-${dayIndex}`} sx={{ px: 0.25 }}>
                            <Box
                              sx={{
                                height: 120,
                                bgcolor: 'rgba(0, 0, 0, 0.03)',
                                borderRadius: 1,
                                border: '1px dashed rgba(0, 0, 0, 0.08)'
                              }}
                            />
                          </Grid>
                        );
                      }
                      
                      const day = date.split('-')[2];
                      const currentFullStatus = getDisplayStatus(date);
                      const unavailableShifts = getUnavailableShiftsSet(currentFullStatus);
                      const isWeekendDay = isWeekend(date);
                      
                      return (
                        <Grid item xs={12/7} key={date} sx={{ p: 0.25 }}>
                          <Box
                            sx={{
                              minHeight: 110,
                              p: 0.5,
                              position: 'relative',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'rgba(0, 0, 0, 0.1)',
                              bgcolor: getStatusBackground(currentFullStatus),
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                            }}
                            onContextMenu={(e) => handleDateContextMenu(e, date)}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <Typography 
                                variant="body2"
                                sx={{ 
                                  fontWeight: 'bold',
                                  color: isWeekendDay ? 'error.main' : 'text.primary',
                                  pl: 0.5
                                }}
                              >
                                {day}
                              </Typography>
                              
                              {isWeekendDay && (
                                <Chip
                                  label="W"
                                  size="small"
                                  sx={{ 
                                    height: 14,
                                    fontSize: '0.55rem',
                                    px: 0.5,
                                    mr: 0.5,
                                    color: 'error.main',
                                    bgcolor: 'transparent',
                                    border: '1px solid',
                                    borderColor: 'error.light'
                                  }}
                                />
                              )}
                            </Box>
                            
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', p: '0 2px' }}>
                              <FormControlLabel
                                key={`${date}-wholeDay`}
                                control={
                                  <Checkbox
                                    checked={unavailableShifts.size === 3}
                                    onChange={(e) => handleWholeDayChange(date, e.target.checked)}
                                    size="small"
                                    sx={{ py: 0, px: 0.5 }}
                                  />
                                }
                                label={
                                  <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                                    All Day
                                  </Typography>
                                }
                                sx={{ height: '22px', mb: '0px' }}
                              />
                              <Divider sx={{width: '80%', alignSelf:'center', my: '2px'}}/>
                              {['Day', 'Evening', 'Night'].map((shift) => (
                                <FormControlLabel
                                  key={`${date}-${shift}`}
                                  control={
                                    <Checkbox
                                      checked={unavailableShifts.has(shift)}
                                      onChange={(e) => handleShiftCheckboxChange(date, shift, e.target.checked)}
                                      size="small"
                                      sx={{ py: 0, px: 0.5 }}
                                    />
                                  }
                                  label={
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                      {shift}
                                    </Typography>
                                  }
                                  sx={{ height: '22px', mb: '-2px' }}
                                />
                              ))}
                            </Box>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                ))}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      
      {/* Legend Card */}
      <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Status Legend
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          
          <Grid container spacing={1}>
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: '##99999', 
                border: '1px solid #4caf50',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Available" color="success" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">All days are available by default.</Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: '#ffebee', 
                border: '1px solid #f44336',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Not Available" color="error" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">Not available for any shifts</Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box sx={{ 
                p: 1, 
                bgcolor: '#fff3e0', 
                border: '1px solid #ff9800',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                height: 60
              }}>
                <Chip label="Partially Available" color="warning" size="small" sx={{ alignSelf: 'flex-start', mb: 1, fontSize: '0.75rem' }} />
                <Typography variant="caption">Not available for specific shifts</Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle>Confirm Clear Month</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all availability settings for {getMonthName(month)} {year}?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={confirmClearMonth} color="error">
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Notifications */}
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
      
      {/* Context Menu */}
      <Menu
        open={contextMenu.mouseY !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu.mouseY !== null && contextMenu.mouseX !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem 
          onClick={() => handleSetAvailabilityFromMenu('Available')} 
          disabled={!contextMenu.date}
        >
          <ListItemIcon>
            <CheckIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={contextMenu.useSelection ? "Set Selected Dates to Available" : "Set to Available"} />
        </MenuItem>
        <MenuItem 
          onClick={() => handleSetAvailabilityFromMenu('Not Available')} 
          disabled={!contextMenu.date}
        >
          <ListItemIcon>
            <ClearIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={contextMenu.useSelection ? "Set Selected Dates to Not Available" : "Set to Not Available"} />
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleRemoveAvailability} disabled={!contextMenu.date}>
          <ListItemIcon>
            <ResetIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={contextMenu.useSelection ? "Reset Selected Dates" : "Reset Availability"} />
          <Typography variant="caption" sx={{ ml:1, color: 'text.secondary'}}>(sets to Available)</Typography>
        </MenuItem>
      </Menu>

      {/* Unsaved Changes Dialog */}
      <Dialog
        open={unsavedChangesDialogOpen}
        onClose={handleCancelLeavePage} // Allow closing by clicking away, same as cancel
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. If you leave this page, your changes will be discarded.
            Are you sure you want to proceed?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelLeavePage} color="primary">
            Stay
          </Button>
          <Button onClick={handleConfirmLeavePage} color="error">
            Leave & Discard Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Availability;