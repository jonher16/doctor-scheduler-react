/**
 * scheduleOptimizer.js
 * 
 * This file provides an interface to the Python optimization algorithm
 * for the React application. It handles executing the Python script
 * and converting data between JavaScript and Python formats.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Optimize a doctor schedule using the MILP algorithm
 * 
 * @param {Object} data Object containing doctors, holidays, and availability
 * @returns {Promise<Object>} Optimized schedule
 */
async function optimizeSchedule(data) {
  try {
    // Create temporary files for input/output
    const tmpDir = os.tmpdir();
    const inputFile = path.join(tmpDir, `schedule_input_${Date.now()}.json`);
    const outputFile = path.join(tmpDir, `schedule_output_${Date.now()}.json`);
    
    // Write input data to temp file
    fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
    
    // Path to Python script (adjust as needed)
    const scriptPath = path.join(__dirname, 'optimize_schedule.py');
    
    // Run Python script
    console.log('Running optimization algorithm...');
    
    return new Promise((resolve, reject) => {
      exec(`python ${scriptPath} ${inputFile} ${outputFile}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Execution error: ${error.message}`);
          console.error(stderr);
          reject(error);
          return;
        }
        
        console.log(stdout);
        
        // Read output schedule
        try {
          const schedule = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
          
          // Clean up temporary files
          fs.unlinkSync(inputFile);
          fs.unlinkSync(outputFile);
          
          resolve(schedule);
        } catch (err) {
          console.error(`Error reading output file: ${err.message}`);
          reject(err);
        }
      });
    });
  } catch (err) {
    console.error(`Error in optimization process: ${err.message}`);
    throw err;
  }
}

module.exports = {
  optimizeSchedule
};