import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  FileUpload as UploadIcon,
  GetApp as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  PersonAdd as PersonAddIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';

/**
 * Component for importing and exporting configuration data (doctor, holiday, availability)
 */
function ConfigImportExport({ 
  doctors, 
  setDoctors, 
  holidays, 
  setHolidays, 
  availability, 
  setAvailability,
  hasUnsavedChanges,
  setShowUnsavedWarning,
  handleDraftDoctorUpdate 
}) {
  const [open, setOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [exportFormat, setExportFormat] = useState('json');
  const [configType, setConfigType] = useState('doctors');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const isElectron = window.electron !== undefined;

  // Handle opening and closing the dialog
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Handle export format change
  const handleFormatChange = (event) => {
    setExportFormat(event.target.value);
  };

  // Handle config type change
  const handleConfigTypeChange = (event) => {
    setConfigType(event.target.value);
  };

  // Convert JSON to CSV
  const jsonToCsv = (jsonData) => {
    // Handle different data structures
    let csvData = '';
    let headers = [];
    
    if (configType === 'doctors') {
      // Doctor data is an array of objects
      headers = ['name', 'seniority', 'pref', 'contract', 'maxShiftsPerWeek'];
      
      // Create CSV header row
      csvData = headers.join(',') + '\n';
      
      // Add data rows
      jsonData.forEach(doctor => {
        const hasContract = doctor.hasContractShifts || doctor.contract || false;
        const row = [
          `"${doctor.name}"`,
          `"${doctor.seniority}"`,
          `"${doctor.pref}"`,
          hasContract ? 'true' : 'false',
          doctor.maxShiftsPerWeek || 0
        ];
        csvData += row.join(',') + '\n';
      });
    } 
    else if (configType === 'holidays') {
      // Holiday data is an object with date keys
      headers = ['date', 'type'];
      
      // Create CSV header row
      csvData = headers.join(',') + '\n';
      
      // Add data rows
      Object.entries(jsonData).forEach(([date, type]) => {
        const row = [`"${date}"`, `"${type}"`];
        csvData += row.join(',') + '\n';
      });
    } 
    else if (configType === 'availability') {
      // Availability data is a nested object structure
      headers = ['doctor', 'date', 'status'];
      
      // Create CSV header row
      csvData = headers.join(',') + '\n';
      
      // Add data rows
      Object.entries(jsonData).forEach(([doctor, dates]) => {
        Object.entries(dates).forEach(([date, status]) => {
          const row = [`"${doctor}"`, `"${date}"`, `"${status}"`];
          csvData += row.join(',') + '\n';
        });
      });
    }
    
    return csvData;
  };
  
  // Parse CSV back to JSON
  const csvToJson = (csvData) => {
    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',').map(header => header.trim());
    
    if (configType === 'doctors') {
      const doctorsArray = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values.length < headers.length) continue;
        
        // Create doctor object
        const doctor = {
          name: values[0].replace(/^"|"$/g, ''),
          seniority: values[1].replace(/^"|"$/g, ''),
          pref: values[2].replace(/^"|"$/g, ''),
        };
        
        // Add contract if available
        if (values[3]) {
          const hasContract = values[3].toLowerCase() === 'true';
          doctor.hasContractShifts = hasContract;
          doctor.contract = hasContract;
        }
        
        // Add max shifts per week if available
        if (values[4]) {
          doctor.maxShiftsPerWeek = parseInt(values[4]) || 0;
        }
        
        doctorsArray.push(doctor);
      }
      
      return doctorsArray;
    }
    else if (configType === 'holidays') {
      const holidaysObj = {};
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values.length < 2) continue;
        
        const date = values[0].replace(/^"|"$/g, '');
        const type = values[1].replace(/^"|"$/g, '');
        holidaysObj[date] = type;
      }
      
      return holidaysObj;
    }
    else if (configType === 'availability') {
      const availabilityObj = {};
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values.length < 3) continue;
        
        const doctor = values[0].replace(/^"|"$/g, '');
        const date = values[1].replace(/^"|"$/g, '');
        const status = values[2].replace(/^"|"$/g, '');
        
        if (!availabilityObj[doctor]) {
          availabilityObj[doctor] = {};
        }
        
        availabilityObj[doctor][date] = status;
      }
      
      return availabilityObj;
    }
    
    return null;
  };
  
  // Helper function to parse CSV line correctly handling quotes
  const parseCsvLine = (line) => {
    const values = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    // Add the last value
    values.push(currentValue);
    
    return values;
  };
  
  // Export configuration to Excel
  const exportToExcel = () => {
    let data;
    let filename;
    let sheetName;
    
    // Prepare data based on config type
    if (configType === 'doctors') {
      data = doctors;
      filename = 'doctors_config.xlsx';
      sheetName = 'Doctors';
      
      // Format the data for Excel
      const formattedData = doctors.map(doctor => ({
        Name: doctor.name,
        Seniority: doctor.seniority,
        Preference: doctor.pref,
        'Has Contract': doctor.hasContractShifts || doctor.contract || false,
        'Max Shifts Per Week': doctor.maxShiftsPerWeek || 0
      }));
      
      if (isElectron) {
        // For Electron, we need to write XLSX to temp file and then use dialog
        try {
          const workbook = XLSX.utils.book_new();
          const worksheet = XLSX.utils.json_to_sheet(formattedData);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
          
          // Convert workbook to binary string
          const wbBinary = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
          
          // Convert binary string to Buffer/Uint8Array
          const buf = new Uint8Array(wbBinary.length);
          for (let i = 0; i < wbBinary.length; i++) {
            buf[i] = wbBinary.charCodeAt(i) & 0xFF;
          }
          
          // Use Electron's dialog to save the file
          window.electron.saveFile({
            defaultPath: filename,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
            content: Buffer.from(buf).toString('base64'),
            isBase64: true
          }).then(result => {
            if (result.success) {
              setSnackbar({
                open: true,
                message: `Successfully exported ${configType} to ${result.filePath}`,
                severity: 'success'
              });
            }
          }).catch(error => {
            setSnackbar({
              open: true,
              message: `Error exporting Excel: ${error.message}`,
              severity: 'error'
            });
          });
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error creating Excel file: ${error.message}`,
            severity: 'error'
          });
        }
      } else {
        // For web browser
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, filename);
        
        setSnackbar({
          open: true,
          message: `Successfully exported ${configType} to Excel`,
          severity: 'success'
        });
      }
    }
    else if (configType === 'holidays') {
      data = holidays;
      filename = 'holidays_config.xlsx';
      sheetName = 'Holidays';
      
      // Convert holidays object to array for Excel
      const formattedData = Object.entries(holidays).map(([date, type]) => ({
        Date: date,
        Type: type
      }));
      
      if (isElectron) {
        // For Electron, we need to write XLSX to temp file and then use dialog
        try {
          const workbook = XLSX.utils.book_new();
          const worksheet = XLSX.utils.json_to_sheet(formattedData);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
          
          // Convert workbook to binary string
          const wbBinary = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
          
          // Convert binary string to Buffer/Uint8Array
          const buf = new Uint8Array(wbBinary.length);
          for (let i = 0; i < wbBinary.length; i++) {
            buf[i] = wbBinary.charCodeAt(i) & 0xFF;
          }
          
          // Use Electron's dialog to save the file
          window.electron.saveFile({
            defaultPath: filename,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
            content: Buffer.from(buf).toString('base64'),
            isBase64: true
          }).then(result => {
            if (result.success) {
              setSnackbar({
                open: true,
                message: `Successfully exported ${configType} to ${result.filePath}`,
                severity: 'success'
              });
            }
          }).catch(error => {
            setSnackbar({
              open: true,
              message: `Error exporting Excel: ${error.message}`,
              severity: 'error'
            });
          });
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error creating Excel file: ${error.message}`,
            severity: 'error'
          });
        }
      } else {
        // For web browser
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, filename);
        
        setSnackbar({
          open: true,
          message: `Successfully exported ${configType} to Excel`,
          severity: 'success'
        });
      }
    }
    else if (configType === 'availability') {
      data = availability;
      filename = 'availability_config.xlsx';
      sheetName = 'Availability';
      
      // Convert nested availability object to array for Excel
      const formattedData = [];
      Object.entries(availability).forEach(([doctor, dates]) => {
        Object.entries(dates).forEach(([date, status]) => {
          formattedData.push({
            Doctor: doctor,
            Date: date,
            Status: status
          });
        });
      });
      
      if (isElectron) {
        // For Electron, we need to write XLSX to temp file and then use dialog
        try {
          const workbook = XLSX.utils.book_new();
          const worksheet = XLSX.utils.json_to_sheet(formattedData);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
          
          // Convert workbook to binary string
          const wbBinary = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
          
          // Convert binary string to Buffer/Uint8Array
          const buf = new Uint8Array(wbBinary.length);
          for (let i = 0; i < wbBinary.length; i++) {
            buf[i] = wbBinary.charCodeAt(i) & 0xFF;
          }
          
          // Use Electron's dialog to save the file
          window.electron.saveFile({
            defaultPath: filename,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
            content: Buffer.from(buf).toString('base64'),
            isBase64: true
          }).then(result => {
            if (result.success) {
              setSnackbar({
                open: true,
                message: `Successfully exported ${configType} to ${result.filePath}`,
                severity: 'success'
              });
            }
          }).catch(error => {
            setSnackbar({
              open: true,
              message: `Error exporting Excel: ${error.message}`,
              severity: 'error'
            });
          });
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error creating Excel file: ${error.message}`,
            severity: 'error'
          });
        }
      } else {
        // For web browser
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, filename);
        
        setSnackbar({
          open: true,
          message: `Successfully exported ${configType} to Excel`,
          severity: 'success'
        });
      }
    }
  };
  
  // Export configuration
  const exportConfig = () => {
    let data;
    let filename;
    
    // Get the correct data and filename based on config type
    if (configType === 'doctors') {
      data = doctors;
      filename = `doctors_config.${exportFormat}`;
    } else if (configType === 'holidays') {
      data = holidays;
      filename = `holidays_config.${exportFormat}`;
    } else if (configType === 'availability') {
      data = availability;
      filename = `availability_config.${exportFormat}`;
    }
    
    // Handle export based on format
    if (exportFormat === 'json') {
      // For JSON format
      const jsonString = JSON.stringify(data, null, 2);
      
      if (isElectron) {
        // Use Electron's save dialog
        window.electron.saveFile({
          defaultPath: filename,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
          content: jsonString
        }).then(result => {
          if (result.success) {
            setSnackbar({
              open: true,
              message: `Successfully exported ${configType} configuration to ${result.filePath}`,
              severity: 'success'
            });
          }
        }).catch(error => {
          setSnackbar({
            open: true,
            message: `Error exporting ${configType}: ${error.message}`,
            severity: 'error'
          });
        });
      } else {
        // Use web download method
        downloadFile(jsonString, filename, 'application/json');
        setSnackbar({
          open: true,
          message: `Successfully exported ${configType} configuration`,
          severity: 'success'
        });
      }
    } else if (exportFormat === 'csv') {
      // For CSV format
      const csvString = jsonToCsv(data);
      
      if (isElectron) {
        // Use Electron's save dialog
        window.electron.saveFile({
          defaultPath: filename,
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
          content: csvString
        }).then(result => {
          if (result.success) {
            setSnackbar({
              open: true,
              message: `Successfully exported ${configType} configuration to ${result.filePath}`,
              severity: 'success'
            });
          }
        }).catch(error => {
          setSnackbar({
            open: true,
            message: `Error exporting ${configType}: ${error.message}`,
            severity: 'error'
          });
        });
      } else {
        // Use web download method
        downloadFile(csvString, filename, 'text/csv');
        setSnackbar({
          open: true,
          message: `Successfully exported ${configType} configuration`,
          severity: 'success'
        });
      }
    } else if (exportFormat === 'xlsx') {
      // For Excel format
      exportToExcel();
      return; // Early return because Excel export handles its own download
    }
  };
  
  // Helper function to download file
  const downloadFile = (content, filename, contentType) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Handle file upload
  const handleFileUpload = (event) => {
    // If running in Electron, use the native file dialog
    if (isElectron) {
      // Use file type filter based on the current config type
      const fileFilters = [
        { name: 'All Supported Files', extensions: ['json', 'csv', 'xlsx'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx'] }
      ];
      
      window.electron.openFile({ filters: fileFilters })
        .then(result => {
          if (result.canceled) return;
          
          if (result.success) {
            const filePath = result.filePath;
            const content = result.content;
            const fileType = filePath.split('.').pop().toLowerCase();
            
            processImportedFile(fileType, content, filePath);
          }
        })
        .catch(error => {
          setSnackbar({
            open: true,
            message: `Error opening file: ${error.message}`,
            severity: 'error'
          });
        });
      
      return;
    }
    
    // Standard browser file input handling
    const file = event.target.files[0];
    if (!file) return;
    
    const fileType = file.name.split('.').pop().toLowerCase();
    
    if (fileType === 'json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedData = JSON.parse(e.target.result);
          updateConfigData(parsedData);
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error parsing JSON file: ${error.message}`,
            severity: 'error'
          });
        }
      };
      reader.readAsText(file);
    } else if (fileType === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedData = csvToJson(e.target.result);
          updateConfigData(parsedData);
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error parsing CSV file: ${error.message}`,
            severity: 'error'
          });
        }
      };
      reader.readAsText(file);
    } else if (fileType === 'xlsx') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          // Process Excel data based on config type
          processExcelData(jsonData);
        } catch (error) {
          setSnackbar({
            open: true,
            message: `Error parsing Excel file: ${error.message}`,
            severity: 'error'
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setSnackbar({
        open: true,
        message: `Unsupported file type: ${fileType}`,
        severity: 'error'
      });
    }
    
    // Reset file input
    event.target.value = '';
  };
  
  // Process imported file content from Electron or Browser
  const processImportedFile = (fileType, content, fileName = '') => {
    try {
      if (fileType === 'json') {
        const parsedData = JSON.parse(content);
        updateConfigData(parsedData);
      }
      else if (fileType === 'csv') {
        const parsedData = csvToJson(content);
        updateConfigData(parsedData);
      }
      else if (fileType === 'xlsx') {
        // For Excel files opened in Electron, we need to handle differently
        // since we only have the file path, not the ArrayBuffer
        if (isElectron) {
          // For Electron, we need a custom approach to handle XLSX in the main process
          // This is complex, so we'll show a message to the user
          setSnackbar({
            open: true,
            message: 'Excel import in Electron not implemented yet. Please use JSON or CSV format.',
            severity: 'warning'
          });
          return;
        }
      }
      else {
        setSnackbar({
          open: true,
          message: `Unsupported file type: ${fileType}`,
          severity: 'error'
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error processing ${fileType} file: ${error.message}`,
        severity: 'error'
      });
    }
  };
  
  // Process Excel data from XLSX
  const processExcelData = (jsonData) => {
    if (configType === 'doctors') {
      const formattedDoctors = jsonData.map(row => ({
        name: row.Name || row.name || '',
        seniority: row.Seniority || row.seniority || 'Junior',
        pref: row.Preference || row.pref || 'None',
        hasContractShifts: row['Has Contract'] || row.hasContractShifts || false,
        contract: row['Has Contract'] || row.contract || false,
        maxShiftsPerWeek: row['Max Shifts Per Week'] || row.maxShiftsPerWeek || 0
      }));
      updateConfigData(formattedDoctors);
    } 
    else if (configType === 'holidays') {
      const formattedHolidays = {};
      jsonData.forEach(row => {
        const date = row.Date || row.date;
        const type = row.Type || row.type;
        if (date && type) {
          formattedHolidays[date] = type;
        }
      });
      updateConfigData(formattedHolidays);
    } 
    else if (configType === 'availability') {
      const formattedAvailability = {};
      jsonData.forEach(row => {
        const doctor = row.Doctor || row.doctor;
        const date = row.Date || row.date;
        const status = row.Status || row.status;
        
        if (doctor && date && status) {
          if (!formattedAvailability[doctor]) {
            formattedAvailability[doctor] = {};
          }
          formattedAvailability[doctor][date] = status;
        }
      });
      updateConfigData(formattedAvailability);
    }
  };
  
  // Update the appropriate configuration data
  const updateConfigData = (data) => {
    if (!data) return;
    
    if (configType === 'doctors' && Array.isArray(data)) {
      // Check if there are unsaved changes and warn user
      if (hasUnsavedChanges && setShowUnsavedWarning) {
        setShowUnsavedWarning(true);
        return;
      }
      
      // Merge with existing doctors instead of replacing
      const existingDoctorNames = new Set(doctors.map(doc => doc.name.toLowerCase()));
      const newDoctors = data.filter(doc => 
        !existingDoctorNames.has(doc.name.toLowerCase())
      );
      
      if (newDoctors.length > 0) {
        const mergedDoctors = [...doctors, ...newDoctors];
        
        // Use the draft update function if available, otherwise update directly
        if (handleDraftDoctorUpdate) {
          handleDraftDoctorUpdate(mergedDoctors);
        } else {
          setDoctors(mergedDoctors);
        }
        
        setSnackbar({
          open: true,
          message: `Successfully imported ${newDoctors.length} new doctors (${data.length - newDoctors.length} duplicates skipped)`,
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: 'All imported doctors already exist in your configuration',
          severity: 'info'
        });
      }
    } else if (configType === 'holidays' && typeof data === 'object') {
      setHolidays(data);
      setSnackbar({
        open: true,
        message: `Successfully imported ${Object.keys(data).length} holidays`,
        severity: 'success'
      });
    } else if (configType === 'availability' && typeof data === 'object') {
      setAvailability(data);
      setSnackbar({
        open: true,
        message: `Successfully imported availability for ${Object.keys(data).length} doctors`,
        severity: 'success'
      });
    } else {
      setSnackbar({
        open: true,
        message: 'Invalid data format for the selected configuration type',
        severity: 'error'
      });
    }
  };
  
  // Handle closing the snackbar
  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  // Load default doctors from userData or public files
  const loadDefaultDoctors = async () => {
    let loadedDoctors = false;
    let defaultDoctorsData = [];
    
    // If in Electron mode, try to load from userData directory
    if (isElectron && window.electron) {
      try {
        const defaultDoctors = await window.electron.loadUserDataFile('doctors.json');
        if (defaultDoctors && defaultDoctors.length > 0) {
          console.log("Loaded default doctors from userData directory");
          defaultDoctorsData = defaultDoctors;
          loadedDoctors = true;
        }
      } catch (err) {
        console.error("Error loading default doctors from userData directory", err);
      }
    }
    
    // If not loaded from userData, try to load from public files
    if (!loadedDoctors) {
      try {
        const response = await fetch('/doctors.json');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            console.log("Loaded default doctors from public file");
            defaultDoctorsData = data;
            loadedDoctors = true;
          }
        }
      } catch (err) {
        console.error("Error loading public doctors.json", err);
      }
    }
    
    if (loadedDoctors && defaultDoctorsData.length > 0) {
      // Merge with existing doctors instead of replacing
      const existingDoctorNames = new Set(doctors.map(doc => doc.name.toLowerCase()));
      const newDoctors = defaultDoctorsData.filter(doc => 
        !existingDoctorNames.has(doc.name.toLowerCase())
      );
      
      if (newDoctors.length > 0) {
        const mergedDoctors = [...doctors, ...newDoctors];
        
        // Use the draft update function if available, otherwise update directly
        if (handleDraftDoctorUpdate) {
          handleDraftDoctorUpdate(mergedDoctors);
        } else {
          setDoctors(mergedDoctors);
        }
        
        setSnackbar({
          open: true,
          message: `Successfully loaded ${newDoctors.length} new default doctors (${defaultDoctorsData.length - newDoctors.length} duplicates skipped)`,
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: 'All default doctors already exist in your configuration',
          severity: 'info'
        });
      }
    } else {
      setSnackbar({
        open: true,
        message: 'No default doctors found. Please check application installation or add doctors manually.',
        severity: 'warning'
      });
    }
  };
  
  return (
    <>
      {/* Button to open the import/export dialog */}
      <Box sx={{ mt: 2, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={handleOpen}
          color={hasUnsavedChanges ? "warning" : "secondary"}
          sx={hasUnsavedChanges ? { 
            borderStyle: 'dashed',
            '&:hover': {
              borderStyle: 'solid'
            }
          } : {}}
        >
          Import/Export Configuration {hasUnsavedChanges && '*'}
        </Button>
        {hasUnsavedChanges && (
          <Typography variant="caption" display="block" color="warning.main" sx={{ mt: 0.5 }}>
            * Save changes before importing to avoid conflicts
          </Typography>
        )}
      </Box>
      
      {/* Import/Export Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configuration Import/Export
        </DialogTitle>
        <DialogContent>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab label="Export" />
            <Tab label="Import" />
          </Tabs>
          
          {/* Export Tab */}
          {tabValue === 0 && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Export Configuration Data
              </Typography>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel id="config-type-label">Configuration Type</InputLabel>
                    <Select
                      labelId="config-type-label"
                      value={configType}
                      label="Configuration Type"
                      onChange={handleConfigTypeChange}
                    >
                      <MenuItem value="doctors">Doctors</MenuItem>
                      <MenuItem value="holidays">Holidays</MenuItem>
                      <MenuItem value="availability">Availability</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel id="export-format-label">Export Format</InputLabel>
                    <Select
                      labelId="export-format-label"
                      value={exportFormat}
                      label="Export Format"
                      onChange={handleFormatChange}
                    >
                      <MenuItem value="json">JSON</MenuItem>
                      <MenuItem value="csv">CSV</MenuItem>
                      <MenuItem value="xlsx">Excel (XLSX)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Format Details</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" paragraph>
                    <strong>JSON:</strong> Standard data format that preserves all configuration details. Best for backing up and transferring between applications.
                  </Typography>
                  
                  <Typography variant="body2" paragraph>
                    <strong>CSV:</strong> Simple spreadsheet-compatible format. Good for reviewing data in spreadsheet applications or importing to other systems.
                  </Typography>
                  
                  <Typography variant="body2">
                    <strong>Excel (XLSX):</strong> Full-featured spreadsheet format with formatting. Best for detailed review and analysis of configuration data.
                  </Typography>
                </AccordionDetails>
              </Accordion>
              
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<DownloadIcon />}
                  onClick={exportConfig}
                >
                  Export Configuration
                </Button>
              </Box>
            </Box>
          )}
          
          {/* Import Tab */}
          {tabValue === 1 && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Import Configuration Data
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="import-config-type-label">Configuration Type</InputLabel>
                  <Select
                    labelId="import-config-type-label"
                    value={configType}
                    label="Configuration Type"
                    onChange={handleConfigTypeChange}
                  >
                    <MenuItem value="doctors">Doctors</MenuItem>
                    <MenuItem value="holidays">Holidays</MenuItem>
                    <MenuItem value="availability">Availability</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Import Information</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" gutterBottom>
                    <strong>Supported Formats:</strong> JSON, CSV, and Excel (XLSX)
                  </Typography>
                  
                  <Typography variant="body2" gutterBottom>
                    <strong>Warning:</strong> Importing will replace all existing {configType} configuration data.
                  </Typography>
                  
                  <Typography variant="body2">
                    Consider exporting your current configuration as a backup before importing new data.
                  </Typography>
                </AccordionDetails>
              </Accordion>
              
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                {configType === 'doctors' && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<PersonAddIcon />}
                    onClick={loadDefaultDoctors}
                  >
                    Load Default Doctors
                  </Button>
                )}
                <Button
                  variant="contained"
                  component="label"
                  color="primary"
                  startIcon={<UploadIcon />}
                >
                  Upload File
                  <input
                    type="file"
                    hidden
                    accept=".json,.csv,.xlsx"
                    onChange={handleFileUpload}
                  />
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
      
      {/* Notification Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default ConfigImportExport; 