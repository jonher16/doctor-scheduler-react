import React from 'react';
import { 
  FormControl, 
  Select, 
  MenuItem, 
  InputLabel,
  Box
} from '@mui/material';
import { useYear } from '../contexts/YearContext';
import { getYearRange } from '../utils/dateUtils';

function YearSelector() {
  const { selectedYear, setSelectedYear } = useYear();
  const { years } = getYearRange();

  const handleYearChange = (event) => {
    setSelectedYear(event.target.value);
  };

  return (
    <Box sx={{ minWidth: 120 }}>
      <FormControl variant="outlined" size="small">
        <InputLabel id="year-select-label">Year</InputLabel>
        <Select
          labelId="year-select-label"
          id="year-select"
          value={selectedYear}
          onChange={handleYearChange}
          label="Year"
          sx={{ color: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.5)' } }}
        >
          {years.map((year) => (
            <MenuItem key={year} value={year}>{year}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}

export default YearSelector;