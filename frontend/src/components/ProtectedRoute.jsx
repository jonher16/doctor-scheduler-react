import React from 'react';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import { SecurityRounded as SecurityIcon, LogoutRounded as LogoutIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from './LoginForm';

const ProtectedRoute = ({ children }) => {
  const { currentUser, userProfile, loading, hasHersAdminAccess, logout } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  // Show login form if not authenticated
  if (!currentUser) {
    return <LoginForm />;
  }

  // Check if user has HERS admin access
  if (!hasHersAdminAccess()) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 3,
          background: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)'
        }}
      >
        <SecurityIcon sx={{ fontSize: 80, color: 'warning.main', mb: 2 }} />
        
        <Alert severity="warning" sx={{ mb: 3, maxWidth: 500 }}>
          <Typography variant="h6" gutterBottom>
            Access Denied
          </Typography>
          <Typography variant="body1" paragraph>
            You don't have permission to access the H.E.R.S. Admin Portal.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Signed in as: <strong>{userProfile?.email || currentUser.email}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Role: <strong>{userProfile?.isHersAdmin ? 'Admin' : 'Doctor'}</strong>
          </Typography>
        </Alert>

        <Typography variant="body1" color="text.secondary" paragraph sx={{ textAlign: 'center', maxWidth: 400 }}>
          This portal is restricted to authorized administrators only. 
          Please contact your system administrator to request access.
        </Typography>

        <Button
          variant="contained"
          startIcon={<LogoutIcon />}
          onClick={logout}
          sx={{ mt: 2 }}
        >
          Sign Out
        </Button>

        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Typography variant="caption" color="text.secondary">
            H.E.R.S. Admin Portal • Smart Health Lab 2025
          </Typography>
        </Box>
      </Box>
    );
  }

  // User is authenticated and has proper access
  return <>{children}</>;
};

export default ProtectedRoute; 