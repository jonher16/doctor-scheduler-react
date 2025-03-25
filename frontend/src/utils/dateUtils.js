// src/utils/dateUtils.js

/**
 * Get the current year and a list of available years for selection
 * @returns {Object} Object containing the current year and array of available years
 */
export const getYearRange = () => {
    const currentYear = new Date().getFullYear();
    
    // Generate year options (current year and next 10 years)
    const years = [];
    for (let i = 0; i < 10; i++) {
      years.push(currentYear + i);
    }
    
    return { currentYear, years };
  };
  
  /**
   * Check if a given year is a leap year
   * @param {number} year The year to check
   * @returns {boolean} True if the year is a leap year, false otherwise
   */
  export const isLeapYear = (year) => {
    return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
  };
  
  /**
   * Get the number of days in a month, accounting for leap years
   * @param {number} year The year
   * @param {number} month The month (1-12)
   * @returns {number} The number of days in the month
   */
  export const getDaysInMonth = (year, month) => {
    // Month is 1-based in our function, but 0-based in Date
    return new Date(year, month, 0).getDate();
  };
  
  /**
   * Generate dates for a specific month in a specific year in YYYY-MM-DD format
   * @param {number} year The year
   * @param {number} month The month (1-12)
   * @returns {Array} Array of date strings in YYYY-MM-DD format
   */
  export const generateDatesForMonth = (year, month) => {
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}. Month must be between 1 and 12.`);
    }
    
    const daysInMonth = getDaysInMonth(year, month);
    const dates = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const formattedMonth = String(month).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      dates.push(`${year}-${formattedMonth}-${formattedDay}`);
    }
    
    return dates;
  };
  
  /**
   * Format a Date object to YYYY-MM-DD string
   * @param {Date} date The date to format
   * @returns {string} The formatted date string
   */
  export const formatDateToYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  export const isWeekend = (dateStr) => {
    const date = new Date(dateStr);
    return date.getDay() === 0 || date.getDay() === 6; // 0 = Sunday, 6 = Saturday
  };

  export const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };