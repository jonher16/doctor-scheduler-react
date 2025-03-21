// src/components/CloudSyncButton.jsx
import React, { useState } from 'react';
import { 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip
} from '@mui/material';
import { CloudDownload as CloudDownloadIcon } from '@mui/icons-material';
import { CloudSyncService } from '../services/CloudSyncService';

// This component can be used in DoctorConfig and DoctorNeeds
const CloudSyncButton = ({ 
  onSyncComplete, 
  syncType, // "doctors" or "availability"
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleClickOpen = () => {
    setError(null);
    setSyncResult(null);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (syncType === 'doctors') {
        // Fetch doctor preferences
        const doctors = await CloudSyncService.fetchDoctorPreferences();
        setSyncResult({
          count: doctors.length,
          timestamp: new Date().toLocaleString()
        });
        
        // Call the callback with the synced data
        if (onSyncComplete) {
          onSyncComplete(doctors);
        }
      } else { // availability
        // Fetch availability
        const availability = await CloudSyncService.fetchDoctorAvailability();
        setSyncResult({
          count: Object.keys(availability).length,
          timestamp: new Date().toLocaleString()
        });
        
        // Call the callback with the synced data
        if (onSyncComplete) {
          onSyncComplete(availability);
        }
      }
    } catch (error) {
      console.error('Error syncing from cloud:', error);
      setError(error.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title={`Download the latest ${syncType} data from the cloud`}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<CloudDownloadIcon />}
          onClick={handleClickOpen}
          sx={{ ml: 1 }}
        >
          Download from Cloud
        </Button>
      </Tooltip>
      
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>
          {syncType === 'doctors' 
            ? 'Download Doctor Preferences from Cloud' 
            : 'Download Doctor Availability from Cloud'
          }
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will fetch the latest {syncType === 'doctors' ? 'doctor preferences' : 'availability information'} 
            from the cloud portal where doctors have entered their data. Any existing data in the app will be merged with the cloud data.
          </DialogContentText>
          
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
              <CircularProgress />
            </div>
          )}
          
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          
          {syncResult && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Successfully synced {syncResult.count} {syncType === 'doctors' ? 'doctors' : 'availability records'} at {syncResult.timestamp}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Close
          </Button>
          <Button 
            onClick={handleSync} 
            color="primary" 
            disabled={loading}
            startIcon={<CloudDownloadIcon />}
          >
            Sync Now
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CloudSyncButton;