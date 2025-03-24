import React from 'react';
import { FormControl, Select, MenuItem } from '@mui/material';
import { useYear } from '../contexts/YearContext';
import { getYearRange } from '../utils/dateUtils';

function YearSelector() {
  const { selectedYear, setSelectedYear } = useYear();
  const { years } = getYearRange();
  
  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };
  
  return (
    <FormControl variant="outlined" size="small" sx={{ minWidth: 120, mr: 2 }}>
      <Select
        value={selectedYear}
        onChange={handleYearChange}
        displayEmpty
        inputProps={{ 'aria-label': 'Select year' }}
        sx={{ 
          color: 'white', 
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.5)' },
          '& .MuiSvgIcon-root': { color: 'white' }
        }}
      >
        {years.map((year) => (
          <MenuItem key={year} value={year}>
            {year}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default YearSelector;