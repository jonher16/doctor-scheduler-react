// src/contexts/YearContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { getYearRange } from '../utils/dateUtils';

const YearContext = createContext();

export function YearProvider({ children }) {
  const { currentYear } = getYearRange();
  
  // Try to get the year from localStorage or use current year
  const [selectedYear, setSelectedYear] = useState(() => {
    const storedYear = localStorage.getItem('selectedYear');
    return storedYear ? parseInt(storedYear, 10) : currentYear;
  });

  // New state to track year changes
  const [yearChanged, setYearChanged] = useState(false);

  // Custom setter for the year that also sets the yearChanged flag
  const changeYear = (newYear) => {
    if (newYear !== selectedYear) {
      setSelectedYear(newYear);
      setYearChanged(true);
    }
  };

  // Reset the yearChanged flag - to be called after handling the year change
  const resetYearChanged = () => {
    setYearChanged(false);
  };

  // Update localStorage when year changes
  useEffect(() => {
    localStorage.setItem('selectedYear', selectedYear.toString());
  }, [selectedYear]);

  return (
    <YearContext.Provider value={{ 
      selectedYear, 
      setSelectedYear: changeYear,
      yearChanged,
      resetYearChanged
    }}>
      {children}
    </YearContext.Provider>
  );
}

export function useYear() {
  const context = useContext(YearContext);
  if (context === undefined) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
}