// preload.js - Script to expose secure APIs to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Get backend logs
  getBackendLogs: () => ipcRenderer.invoke('get-backend-logs'),
  
  // Restart the backend server
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  
  // Load file from userData directory
  loadUserDataFile: (fileName) => ipcRenderer.invoke('load-user-data-file', fileName),
  
  // Get application paths
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  
  // Save file using system dialog (for exports)
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  
  // Open file using system dialog (for imports)
  openFile: (options) => ipcRenderer.invoke('open-file', options),
  
  // Listen for backend logs
  onBackendLog: (callback) => {
    ipcRenderer.on('backend-log', (_, data) => callback(data));
    
    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeAllListeners('backend-log');
    };
  },
  
  // Listen for backend exit
  onBackendExit: (callback) => {
    ipcRenderer.on('backend-exit', (_, data) => callback(data));
    
    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeAllListeners('backend-exit');
    };
  }
});

// Expose the platform information
contextBridge.exposeInMainWorld('platform', {
  isElectron: true
});