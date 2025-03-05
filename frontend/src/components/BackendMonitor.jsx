// src/components/BackendMonitor.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Alert,
  IconButton,
  Snackbar
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Close as CloseIcon,
  ErrorOutline as ErrorIcon
} from '@mui/icons-material';

// Backend monitor component for Electron app
function BackendMonitor() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info'
  });

  // Check if running in Electron
  const isElectron = window.platform?.isElectron;

  // Effect to set up listeners for backend logs
  useEffect(() => {
    if (isElectron) {
      // Load initial logs
      window.electron.getBackendLogs().then(backendLogs => {
        setLogs(backendLogs);
      });

      // Set up log listener
      const removeLogListener = window.electron.onBackendLog((log) => {
        setLogs(prevLogs => [...prevLogs, {
          ...log,
          timestamp: new Date().toISOString()
        }]);
      });

      // Set up exit listener
      const removeExitListener = window.electron.onBackendExit((data) => {
        if (data.code !== 0) {
          setError(`Backend exited with code ${data.code}`);
          setNotification({
            open: true,
            message: `Backend server crashed (code ${data.code}). You may need to restart it.`,
            severity: 'error'
          });
        }
      });

      // Clean up
      return () => {
        removeLogListener();
        removeExitListener();
      };
    }
  }, [isElectron]);

  // Handle restartingthe backend
  const handleRestartBackend = async () => {
    if (isElectron) {
      try {
        setRestarting(true);
        await window.electron.restartBackend();
        setNotification({
          open: true,
          message: 'Backend server restarted successfully',
          severity: 'success'
        });
        setError(null);
      } catch (err) {
        setNotification({
          open: true,
          message: `Failed to restart backend: ${err.message}`,
          severity: 'error'
        });
      } finally {
        setRestarting(false);
      }
    }
  };

  // Close notification
  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // If not running in Electron, don't render anything
  if (!isElectron) return null;

  return (
    <>
      {error && (
        <Alert 
          severity="error"
          action={
            <Button 
              color="inherit" 
              size="small"
              onClick={handleRestartBackend}
              disabled={restarting}
            >
              {restarting ? 'Restarting...' : 'Restart Backend'}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={() => setOpen(true)}
          startIcon={<ErrorIcon />}
          sx={{ borderRadius: '20px', textTransform: 'none' }}
        >
          Backend Status
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Backend Server Logs</Typography>
            <IconButton onClick={() => setOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Paper 
            elevation={3} 
            sx={{ 
              height: 400, 
              overflow: 'auto', 
              p: 2,
              backgroundColor: '#f5f5f5'
            }}
          >
            <List dense>
              {logs.map((log, index) => (
                <ListItem 
                  key={index}
                  sx={{ 
                    borderBottom: '1px solid #e0e0e0',
                    color: log.type === 'stderr' ? 'error.main' : 'text.primary',
                    py: 0.5
                  }}
                >
                  <ListItemText
                    primary={log.message}
                    secondary={new Date(log.timestamp).toLocaleTimeString()}
                    primaryTypographyProps={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap'
                    }}
                  />
                </ListItem>
              ))}
              {logs.length === 0 && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 2 }}>
                  No logs available
                </Typography>
              )}
            </List>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleRestartBackend}
            color="primary"
            startIcon={<RefreshIcon />}
            disabled={restarting}
          >
            {restarting ? 'Restarting...' : 'Restart Backend'}
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default BackendMonitor;