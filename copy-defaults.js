// copy-defaults.js - Script to copy default files to userData directory
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Copies default files to the userData directory on first run
 */
function copyDefaultFilesToUserData() {
  console.log('Checking for default files to copy...');
  
  const userDataDir = app.getPath('userData');
  console.log(`User data directory: ${userDataDir}`);
  
  // Files to copy from resources to userData
  const filesToCopy = [
    { name: 'doctors.json', copied: false },
    { name: 'holidays.json', copied: false }
  ];
  
  // Path to resources directory
  const resourcesPath = process.resourcesPath;
  console.log(`Resources path: ${resourcesPath}`);
  
  // Possible locations for default files
  const possibleSourceDirs = [
    path.join(resourcesPath, 'default'),
    resourcesPath,
    path.join(resourcesPath, 'app.asar.unpacked', 'default'),
    path.join(app.getAppPath(), 'default'),
    path.join(app.getAppPath(), 'frontend', 'public'),
    path.join(app.getAppPath(), 'dist'),
  ];
  
  // Log all possible source directories
  possibleSourceDirs.forEach(dir => {
    try {
      if (fs.existsSync(dir)) {
        console.log(`Source directory exists: ${dir}`);
        const files = fs.readdirSync(dir);
        console.log(`Files in ${dir}: ${files.join(', ')}`);
      } else {
        console.log(`Source directory doesn't exist: ${dir}`);
      }
    } catch (err) {
      console.log(`Error accessing directory ${dir}: ${err.message}`);
    }
  });
  
  // Try to copy each file from possible locations
  filesToCopy.forEach(file => {
    const destPath = path.join(userDataDir, file.name);
    
    // Skip if file already exists in userData directory
    if (fs.existsSync(destPath)) {
      console.log(`${file.name} already exists in userData directory`);
      return;
    }
    
    // Try to find and copy the file from possible locations
    for (const sourceDir of possibleSourceDirs) {
      const sourcePath = path.join(sourceDir, file.name);
      
      try {
        if (fs.existsSync(sourcePath)) {
          console.log(`Found ${file.name} at ${sourcePath}`);
          
          // Copy the file
          fs.copyFileSync(sourcePath, destPath);
          console.log(`Copied ${file.name} to ${destPath}`);
          file.copied = true;
          break;
        }
      } catch (err) {
        console.log(`Error copying ${file.name} from ${sourcePath}: ${err.message}`);
      }
    }
    
    if (!file.copied) {
      console.log(`Could not find ${file.name} in any location`);
    }
  });
  
  // Return summary of copied files
  return {
    userDataDir,
    resourcesPath,
    filesCopied: filesToCopy.filter(f => f.copied).map(f => f.name),
    filesMissing: filesToCopy.filter(f => !f.copied).map(f => f.name)
  };
}

module.exports = { copyDefaultFilesToUserData };