// Utility functions for handling dates and years

/**
 * Get the year range for the application:
 * - Current year
 * - Start year (current year - 2)
 * - End year (current year + 10)
 * - Array of all years in the range
 */
export const getYearRange = () => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 10;
    const years = Array.from(
      { length: endYear - startYear + 1 },
      (_, index) => startYear + index
    );
    return { currentYear, startYear, endYear, years };
  };
  
  /**
   * Get the month name from a month number (1-12)
   * @param {number} monthNum - Month number (1-12)
   * @returns {string} - Month name (e.g., "January")
   */
  export const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1]; // monthNum is 1-based (1=January, 12=December)
  };
  
  /**
   * Format a date as YYYY-MM-DD
   * @param {Date} date - Date object
   * @returns {string} - Formatted date string
   */
  export const formatDateYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  /**
   * Get days in a month
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @returns {number} - Number of days in the month
   */
  export const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };