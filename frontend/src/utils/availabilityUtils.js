/**
 * Utility functions for handling availability data and formats
 * These functions ensure consistent handling of availability formats
 * including the default 'Available' state (which is not stored)
 * and the shift-specific unavailability format.
 */

/**
 * Validates if an availability status string is in a valid format
 * @param {string} status - The availability status string to validate
 * @returns {boolean} - Whether the status is valid
 */
export const isValidAvailabilityStatus = (status) => {
  if (!status || typeof status !== 'string') {
    return false;
  }

  // Valid formats
  const validFormats = ['Available', 'Not Available'];
  if (validFormats.includes(status)) {
    return true;
  }

  // Shift-specific unavailability format
  if (status.startsWith('Not Available: ')) {
    const shifts = status.substring('Not Available: '.length).split(', ');
    
    // Must have at least one shift specified
    if (shifts.length === 0) {
      return false;
    }
    
    // Validate each shift name
    const validShiftNames = ['Day', 'Evening', 'Night'];
    return shifts.every(shift => validShiftNames.includes(shift));
  }

  return false;
};

/**
 * Parses an availability status string and returns structured data
 * @param {string} status - The availability status string to parse
 * @returns {Object} - Structured availability data
 */
export const parseAvailabilityStatus = (status) => {
  if (!isValidAvailabilityStatus(status)) {
    throw new Error(`Invalid availability status: ${status}`);
  }

  // Handle standard formats
  switch (status) {
    case 'Available':
      return {
        isAvailable: true,
        shifts: ['Day', 'Evening', 'Night']
      };
    case 'Not Available':
      return {
        isAvailable: false,
        shifts: []
      };
  }

  // Handle shift-specific unavailability format
  if (status.startsWith('Not Available: ')) {
    const unavailableShifts = status.substring('Not Available: '.length).split(', ');
    const allShifts = ['Day', 'Evening', 'Night'];
    const availableShifts = allShifts.filter(shift => !unavailableShifts.includes(shift));
    
    return {
      isAvailable: availableShifts.length > 0,
      shifts: availableShifts
    };
  }

  // Should never reach here due to validation
  throw new Error(`Unhandled availability status: ${status}`);
};

/**
 * Formats availability data for API requests
 * @param {string} doctorId - The doctor's ID
 * @param {string} date - The date in YYYY-MM-DD format
 * @param {string} status - The availability status string (or null/undefined for default 'Available')
 * @returns {Object} - Formatted availability data for API
 */
export const formatAvailabilityForApi = (doctorId, date, status) => {
  // If status is not provided or is 'Available', use the default available state
  const effectiveStatus = status || 'Available';
  
  if (!isValidAvailabilityStatus(effectiveStatus)) {
    throw new Error(`Invalid availability status: ${effectiveStatus}`);
  }

  return {
    doctorId,
    date,
    availability: effectiveStatus
  };
};

/**
 * Gets the display name for an availability status
 * For example, converts "Not Available: Day, Evening" to "Available for Night shifts only"
 * @param {string} status - The availability status string
 * @returns {string} - Human-readable display name
 */
export const getAvailabilityDisplayName = (status) => {
  if (!isValidAvailabilityStatus(status)) {
    return 'Unknown';
  }

  // Standard formats have direct display names
  const standardFormats = ['Available', 'Not Available'];
  if (standardFormats.includes(status)) {
    return status;
  }

  // For shift-specific format, create a readable display
  if (status.startsWith('Not Available: ')) {
    const unavailableShifts = status.substring('Not Available: '.length).split(', ');
    const allShifts = ['Day', 'Evening', 'Night'];
    const availableShifts = allShifts.filter(shift => !unavailableShifts.includes(shift));
    
    if (availableShifts.length === 0) {
      return 'Not Available';
    } else if (availableShifts.length === 1) {
      return `Available for ${availableShifts[0]} shift only`;
    } else {
      return `Available for ${availableShifts.join(' & ')} shifts`;
    }
  }

  return status;
};

/**
 * Checks if a doctor is available for a specific shift on a given date
 * @param {string} status - The availability status string (or null for default available)
 * @param {string} shift - The shift to check ('Day', 'Evening', or 'Night')
 * @returns {boolean} - Whether the doctor is available for the shift
 */
export const isAvailableForShift = (status, shift) => {
  // If status is not provided, doctor is available by default
  if (!status) {
    return true;
  }
  
  if (!isValidAvailabilityStatus(status)) {
    return false;
  }

  const { isAvailable, shifts } = parseAvailabilityStatus(status);
  
  return isAvailable && shifts.includes(shift);
}; 