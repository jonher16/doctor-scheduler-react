import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  PieChart,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LabelList
} from 'recharts';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Tabs,
  Tab,
  Badge,
  Alert,
  useTheme
} from '@mui/material';
import {
  WbSunny as DayIcon,
  Brightness3 as NightIcon,
  Brightness6 as EveningIcon,
  Stars as PreferenceIcon,
  Person as PersonIcon,
  BarChart as BarChartIcon
} from '@mui/icons-material';
import { useYear } from '../contexts/YearContext';

const DoctorShiftTypesChart = ({ doctors, schedule, selectedMonth }) => {
  const { selectedYear } = useYear();
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);
  const [shiftData, setShiftData] = useState([]);
  const [totalShifts, setTotalShifts] = useState({ day: 0, evening: 0, night: 0 });
  const [doctorPreferenceData, setDoctorPreferenceData] = useState([]);
  const [overallDistribution, setOverallDistribution] = useState([]);

  // Process data when schedule, doctors, or selected month changes
  useEffect(() => {
    if (!schedule || !doctors || doctors.length === 0) return;

    // Check if there's any data for the selected month
    const hasDataForMonth = Object.keys(schedule).some(dateStr => {
      if (dateStr === '_metadata') return false; // Skip metadata
      const date = new Date(dateStr);
      return date.getMonth() + 1 === selectedMonth;
    });
    
    if (!hasDataForMonth) {
      setShiftData([]);
      setTotalShifts({ day: 0, evening: 0, night: 0 });
      setDoctorPreferenceData([]);
      setOverallDistribution([]);
      return;
    }
    
    const processedData = processScheduleData();
    setShiftData(processedData.shiftData);
    setTotalShifts(processedData.totalShifts);
    setDoctorPreferenceData(processedData.preferenceData);
    
    // Calculate overall distribution for pie chart
    const distribution = [
      { name: 'Day', value: processedData.totalShifts.day, color: '#FF9800' },
      { name: 'Evening', value: processedData.totalShifts.evening, color: '#2196F3' },
      { name: 'Night', value: processedData.totalShifts.night, color: '#673AB7' }
    ];
    setOverallDistribution(distribution);
  }, [schedule, doctors, selectedMonth]);

  // Process the schedule data for the chart
  const processScheduleData = () => {
    const doctorShifts = {};
    const totalShiftCounts = { day: 0, evening: 0, night: 0 };
    const preferenceData = [];
    
    // Initialize data for each doctor
    doctors.forEach(doc => {
      doctorShifts[doc.name] = {
        name: doc.name,
        day: 0,
        evening: 0,
        night: 0,
        total: 0,
        seniority: doc.seniority || 'Junior',
        preference: doc.pref || 'None'
      };
    });
    
    // Count shifts for the selected month
    Object.entries(schedule).forEach(([dateStr, daySchedule]) => {
      // Parse the date to check if it's in the selected month
      const date = new Date(dateStr);
      const dateMonth = date.getMonth() + 1; // JavaScript months are 0-indexed
      
      if (dateMonth === selectedMonth) {
        // Process each shift type
        ['Day', 'Evening', 'Night'].forEach(shiftType => {
          if (daySchedule[shiftType]) {
            daySchedule[shiftType].forEach(doctorName => {
              // Skip if doctor is not in our list
              if (doctorShifts[doctorName]) {
                const shiftKey = shiftType.toLowerCase();
                doctorShifts[doctorName][shiftKey]++;
                doctorShifts[doctorName].total++;
                totalShiftCounts[shiftKey]++;
              }
            });
          }
        });
      }
    });
    
    // Calculate preference adherence with weighted metrics
    Object.values(doctorShifts).forEach(doctor => {
      if (doctor.total > 0) {
        let preferredCount = 0;
        let nonPreferredCount = 0;
        let weightedAdherencePercentage = null;
        
        // Count shifts by preference
        if (doctor.preference === 'Day Only') {
          preferredCount = doctor.day;
          nonPreferredCount = doctor.evening + doctor.night;
          
          // Calculate weighted adherence - account for ratio of shift types
          // Day shifts are typically 2 per day (40% of total shifts)
          if (totalShiftCounts.day > 0) {
            weightedAdherencePercentage = Math.round((doctor.day / totalShiftCounts.day) / 
              ((doctor.day / Math.max(1, totalShiftCounts.day)) + 
               (doctor.evening / Math.max(1, totalShiftCounts.evening)) + 
               (doctor.night / Math.max(1, totalShiftCounts.night))) * 100);
          }
        } else if (doctor.preference === 'Evening Only') {
          preferredCount = doctor.evening;
          nonPreferredCount = doctor.day + doctor.night;
          
          // Evening shifts are typically 1 per day (20% of total shifts)
          // We apply a higher weight to account for fewer available evening shifts
          if (totalShiftCounts.evening > 0) {
            weightedAdherencePercentage = Math.round((doctor.evening / totalShiftCounts.evening) / 
              ((doctor.day / Math.max(1, totalShiftCounts.day)) + 
               (doctor.evening / Math.max(1, totalShiftCounts.evening)) + 
               (doctor.night / Math.max(1, totalShiftCounts.night))) * 100);
          }
        } else if (doctor.preference === 'Night Only') {
          preferredCount = doctor.night;
          nonPreferredCount = doctor.day + doctor.evening;
          
          // Night shifts are typically 2 per day (40% of total shifts)
          if (totalShiftCounts.night > 0) {
            weightedAdherencePercentage = Math.round((doctor.night / totalShiftCounts.night) / 
              ((doctor.day / Math.max(1, totalShiftCounts.day)) + 
               (doctor.evening / Math.max(1, totalShiftCounts.evening)) + 
               (doctor.night / Math.max(1, totalShiftCounts.night))) * 100);
          }
        } else {
          // No specific preference
          preferredCount = 0;
          nonPreferredCount = 0;
        }
        
        // Standard (unweighted) adherence percentage
        const standardAdherencePercentage = doctor.total > 0 && doctor.preference !== 'None' 
          ? Math.round((preferredCount / doctor.total) * 100) 
          : null;
          
        preferenceData.push({
          name: doctor.name,
          seniority: doctor.seniority,
          preference: doctor.preference,
          preferred: preferredCount,
          nonPreferred: nonPreferredCount,
          total: doctor.total,
          adherencePercentage: standardAdherencePercentage,
          weightedAdherencePercentage: weightedAdherencePercentage
        });
      }
    });
    
    // Convert to array and sort by total shifts
    const shiftDataArray = Object.values(doctorShifts)
      .filter(doctor => doctor.total > 0) // Only include doctors who worked in this month
      .sort((a, b) => b.total - a.total);
    
    return {
      shiftData: shiftDataArray,
      totalShifts: totalShiftCounts,
      preferenceData: preferenceData.sort((a, b) => 
        b.adherencePercentage !== null && a.adherencePercentage !== null 
          ? b.adherencePercentage - a.adherencePercentage 
          : (b.adherencePercentage !== null ? -1 : 1)
      )
    };
  };

  // Get month name
  const getMonthName = (monthNum) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1];
  };

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Paper elevation={3} sx={{ p: 2, backgroundColor: 'white', minWidth: 180 }}>
          <Typography variant="subtitle2" gutterBottom>{label}</Typography>
          <Divider sx={{ my: 1 }} />
          
          {payload.map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Box 
                sx={{ 
                  width: 12, 
                  height: 12, 
                  mr: 1, 
                  borderRadius: 0.5,
                  backgroundColor: entry.color 
                }} 
              />
              <Typography variant="body2">
                {entry.name}: {entry.value} shift{entry.value !== 1 ? 's' : ''}
              </Typography>
            </Box>
          ))}
          
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" fontWeight="bold">
            Total: {payload.reduce((sum, entry) => sum + entry.value, 0)} shifts
          </Typography>
        </Paper>
      );
    }
    return null;
  };

  // Handler for tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Color scheme for shift types
  const shiftColors = {
    day: '#FF9800',     // Orange for day shifts
    evening: '#2196F3', // Blue for evening shifts
    night: '#673AB7'    // Purple for night shifts
  };

  // Custom legend for charts
  const renderColorfulLegendText = (value, entry) => {
    const { color } = entry;
    return <Typography style={{ color }}>{value}</Typography>;
  };

  // Helper to get percentage text for pie chart
  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (shiftData.length === 0) {
    return (
      <Box sx={{ minHeight: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Alert severity="info" sx={{ width: '100%', maxWidth: 600 }}>
          <Typography variant="body1">
            No schedule data available for {getMonthName(selectedMonth)} {selectedYear}.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: 400 }}>
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab 
          label="Shift Distribution" 
          icon={<Badge badgeContent={shiftData.length} color="primary"><BarChartIcon sx={{ fontSize: 20 }} /></Badge>} 
          iconPosition="start"
        />
        <Tab 
          label="Preference Analysis" 
          icon={<PreferenceIcon />} 
          iconPosition="start"
        />
      </Tabs>

      {/* Shift Distribution Tab */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {getMonthName(selectedMonth)} {selectedYear} Summary
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DayIcon sx={{ color: shiftColors.day }} />
                    <Typography variant="body1">Day Shifts: </Typography>
                    <Chip label={totalShifts.day} color="warning" size="small" />
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EveningIcon sx={{ color: shiftColors.evening }} />
                    <Typography variant="body1">Evening Shifts: </Typography>
                    <Chip label={totalShifts.evening} color="info" size="small" />
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NightIcon sx={{ color: shiftColors.night }} />
                    <Typography variant="body1">Night Shifts: </Typography>
                    <Chip label={totalShifts.night} color="secondary" size="small" />
                  </Box>

                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" gutterBottom>Monthly Shift Balance</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                      {/* Shift distribution by seniority */}
                      <Box>
                        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                          Senior vs. Junior Distribution
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Senior Doctors</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ 
                                flex: 1, 
                                display: 'flex', 
                                height: 8, 
                                borderRadius: 4,
                                overflow: 'hidden'
                              }}>
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority === 'Senior').reduce((sum, doc) => sum + doc.day, 0) / 
                                    Math.max(1, totalShifts.day) * 100}%`, 
                                  bgcolor: shiftColors.day 
                                }} />
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority === 'Senior').reduce((sum, doc) => sum + doc.evening, 0) / 
                                    Math.max(1, totalShifts.evening) * 100}%`, 
                                  bgcolor: shiftColors.evening 
                                }} />
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority === 'Senior').reduce((sum, doc) => sum + doc.night, 0) / 
                                    Math.max(1, totalShifts.night) * 100}%`, 
                                  bgcolor: shiftColors.night 
                                }} />
                              </Box>
                              <Typography variant="caption">
                                {Math.round(shiftData.filter(d => d.seniority === 'Senior').reduce((sum, doc) => sum + doc.total, 0) / 
                                  Math.max(1, Object.values(totalShifts).reduce((a, b) => a + b, 0)) * 100)}%
                              </Typography>
                            </Box>
                          </Box>
                          
                          <Box>
                            <Typography variant="caption" color="text.secondary">Junior Doctors</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ 
                                flex: 1, 
                                display: 'flex', 
                                height: 8, 
                                borderRadius: 4,
                                overflow: 'hidden'
                              }}>
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority !== 'Senior').reduce((sum, doc) => sum + doc.day, 0) / 
                                    Math.max(1, totalShifts.day) * 100}%`, 
                                  bgcolor: shiftColors.day 
                                }} />
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority !== 'Senior').reduce((sum, doc) => sum + doc.evening, 0) / 
                                    Math.max(1, totalShifts.evening) * 100}%`, 
                                  bgcolor: shiftColors.evening 
                                }} />
                                <Box sx={{ 
                                  width: `${shiftData.filter(d => d.seniority !== 'Senior').reduce((sum, doc) => sum + doc.night, 0) / 
                                    Math.max(1, totalShifts.night) * 100}%`, 
                                  bgcolor: shiftColors.night 
                                }} />
                              </Box>
                              <Typography variant="caption">
                                {Math.round(shiftData.filter(d => d.seniority !== 'Senior').reduce((sum, doc) => sum + doc.total, 0) / 
                                  Math.max(1, Object.values(totalShifts).reduce((a, b) => a + b, 0)) * 100)}%
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                      
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Main Chart */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Doctor Shift Distribution - {getMonthName(selectedMonth)} {selectedYear}
                </Typography>
                <Divider  />

                <Box sx={{ height: 500, mb: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={shiftData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        angle={-45} 
                        textAnchor="end" 
                        height={70} 
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        label={{ 
                          value: 'Number of Shifts', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { textAnchor: 'middle' }
                        }} 
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        formatter={renderColorfulLegendText}
                        iconSize={10}
                      />
                      <Bar 
                        dataKey="day" 
                        name="Day Shifts" 
                        stackId="a" 
                        fill={shiftColors.day}
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList dataKey="day" position="inside" fill="#fff" />
                      </Bar>
                      <Bar 
                        dataKey="evening" 
                        name="Evening Shifts" 
                        stackId="a" 
                        fill={shiftColors.evening}
                        radius={[0, 0, 0, 0]}
                      >
                        <LabelList dataKey="evening" position="inside" fill="#fff" />
                      </Bar>
                      <Bar 
                        dataKey="night" 
                        name="Night Shifts" 
                        stackId="a" 
                        fill={shiftColors.night}
                        radius={[0, 0, 4, 4]}
                      >
                        <LabelList dataKey="night" position="inside" fill="#fff" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Detailed Table */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Detailed Shift Analysis by Doctor
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                        <TableCell>Doctor</TableCell>
                        <TableCell align="center">Seniority</TableCell>
                        <TableCell align="center">Shift Preference</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <DayIcon sx={{ color: shiftColors.day, mr: 0.5 }} />
                            Day
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <EveningIcon sx={{ color: shiftColors.evening, mr: 0.5 }} />
                            Evening
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <NightIcon sx={{ color: shiftColors.night, mr: 0.5 }} />
                            Night
                          </Box>
                        </TableCell>
                        <TableCell align="center">Total</TableCell>
                        <TableCell align="center">Shift Pattern</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shiftData.map((doctor, index) => {
                        // Calculate percentage distribution for shift pattern visualization
                        const total = doctor.day + doctor.evening + doctor.night;
                        const dayPercent = total > 0 ? (doctor.day / total) * 100 : 0;
                        const eveningPercent = total > 0 ? (doctor.evening / total) * 100 : 0;
                        const nightPercent = total > 0 ? (doctor.night / total) * 100 : 0;
                        
                        // Determine if pattern matches preference
                        let matchesPreference = false;
                        if (doctor.preference === 'Day Only' && dayPercent > 60) matchesPreference = true;
                        else if (doctor.preference === 'Evening Only' && eveningPercent > 60) matchesPreference = true;
                        else if (doctor.preference === 'Night Only' && nightPercent > 60) matchesPreference = true;
                        
                        return (
                          <TableRow 
                            key={index} 
                            sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <PersonIcon sx={{ mr: 1, opacity: 0.6 }} />
                                {doctor.name}
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={doctor.seniority} 
                                color={doctor.seniority === 'Senior' ? 'primary' : 'default'} 
                                size="small"
                                variant={doctor.seniority === 'Senior' ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              {doctor.preference !== 'None' ? (
                                <Chip 
                                  label={doctor.preference} 
                                  color="info" 
                                  size="small"
                                />
                              ) : (
                                <Typography variant="body2" color="text.secondary">None</Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={doctor.day}
                                size="small"
                                variant={doctor.preference === 'Day Only' ? 'filled' : 'outlined'}
                                color={doctor.preference === 'Day Only' ? 'warning' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={doctor.evening}
                                size="small"
                                variant={doctor.preference === 'Evening Only' ? 'filled' : 'outlined'}
                                color={doctor.preference === 'Evening Only' ? 'info' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={doctor.night}
                                size="small"
                                variant={doctor.preference === 'Night Only' ? 'filled' : 'outlined'}
                                color={doctor.preference === 'Night Only' ? 'secondary' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body1" fontWeight="bold">
                                {doctor.total}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ position: 'relative', width: '100%' }}>
                                <Box sx={{ 
                                  display: 'flex', 
                                  height: 16, 
                                  width: '100%', 
                                  borderRadius: 1, 
                                  overflow: 'hidden',
                                  boxShadow: 1
                                }}>
                                  {dayPercent > 0 && (
                                    <Box sx={{ 
                                      width: `${dayPercent}%`, 
                                      backgroundColor: shiftColors.day,
                                      display: 'flex',
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {dayPercent >= 20 && `${Math.round(dayPercent)}%`}
                                    </Box>
                                  )}
                                  {eveningPercent > 0 && (
                                    <Box sx={{ 
                                      width: `${eveningPercent}%`, 
                                      backgroundColor: shiftColors.evening,
                                      display: 'flex',
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {eveningPercent >= 20 && `${Math.round(eveningPercent)}%`}
                                    </Box>
                                  )}
                                  {nightPercent > 0 && (
                                    <Box sx={{ 
                                      width: `${nightPercent}%`, 
                                      backgroundColor: shiftColors.night,
                                      display: 'flex',
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {nightPercent >= 20 && `${Math.round(nightPercent)}%`}
                                    </Box>
                                  )}
                                </Box>
                                
                                {doctor.preference !== 'None' && (
                                  <Box sx={{ 
                                    position: 'absolute', 
                                    top: -8, 
                                    right: -8,
                                  }}>
                                    {matchesPreference ? (
                                      <Chip
                                        label="✓"
                                        size="small"
                                        color="success"
                                        sx={{ height: 16, width: 16, fontSize: '0.7rem' }}
                                      />
                                    ) : (
                                      <Chip
                                        label="×"
                                        size="small"
                                        color="error"
                                        sx={{ height: 16, width: 16, fontSize: '0.7rem' }}
                                      />
                                    )}
                                  </Box>
                                )}
                              </Box>
                              
                              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                                D: {Math.round(dayPercent)}% • E: {Math.round(eveningPercent)}% • N: {Math.round(nightPercent)}%
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Preference Analysis Tab */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Shift Preference Adherence Analysis
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {doctorPreferenceData.filter(d => d.preference !== 'None').length > 0 ? (
                  <>
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                            <TableCell>Doctor</TableCell>
                            <TableCell align="center">Preference</TableCell>
                            <TableCell align="center">Preferred Shifts</TableCell>
                            <TableCell align="center">Other Shifts</TableCell>
                            <TableCell align="center">Total Shifts</TableCell>
                            <TableCell align="center">Standard Adherence</TableCell>
                            <TableCell align="center">Weighted Adherence*</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {doctorPreferenceData
                            .filter(data => data.preference !== 'None')
                            .map((data, index) => (
                              <TableRow 
                                key={index}
                                sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}
                              >
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <PersonIcon sx={{ mr: 1, opacity: 0.6 }} />
                                    {data.name}
                                  </Box>
                                </TableCell>
                                <TableCell align="center">
                                  <Chip 
                                    label={data.preference} 
                                    color="info" 
                                    size="small"
                                  />
                                </TableCell>
                                <TableCell align="center">{data.preferred}</TableCell>
                                <TableCell align="center">{data.nonPreferred}</TableCell>
                                <TableCell align="center">{data.total}</TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Box sx={{ width: '70%', mr: 1 }}>
                                      <LinearProgress 
                                        variant="determinate" 
                                        value={data.adherencePercentage || 0}
                                        color={
                                          data.adherencePercentage >= 80 ? 'success' :
                                          data.adherencePercentage >= 50 ? 'warning' : 'error'
                                        }
                                        sx={{ height: 10, borderRadius: 5 }}
                                      />
                                    </Box>
                                    <Typography 
                                      variant="body2"
                                      color={
                                        data.adherencePercentage >= 80 ? 'success.main' :
                                        data.adherencePercentage >= 50 ? 'warning.main' : 'error.main'
                                      }
                                    >
                                      {data.adherencePercentage}%
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Box sx={{ width: '70%', mr: 1 }}>
                                      <LinearProgress 
                                        variant="determinate" 
                                        value={data.weightedAdherencePercentage || 0}
                                        color={
                                          data.weightedAdherencePercentage >= 80 ? 'success' :
                                          data.weightedAdherencePercentage >= 50 ? 'warning' : 'error'
                                        }
                                        sx={{ height: 10, borderRadius: 5 }}
                                      />
                                    </Box>
                                    <Typography 
                                      variant="body2"
                                      color={
                                        data.weightedAdherencePercentage >= 80 ? 'success.main' :
                                        data.weightedAdherencePercentage >= 50 ? 'warning.main' : 'error.main'
                                      }
                                    >
                                      {data.weightedAdherencePercentage}%
                                    </Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    
                    {/* Chart showing preference adherence */}
                    <Box sx={{ height: 400 }}>
                      <Typography variant="subtitle1" gutterBottom>
                        Shift Preference Adherence Chart
                      </Typography>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={doctorPreferenceData.filter(d => d.preference !== 'None')}
                          margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45} 
                            textAnchor="end" 
                            height={70} 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            label={{ 
                              value: 'Number of Shifts', 
                              angle: -90, 
                              position: 'insideLeft',
                              style: { textAnchor: 'middle' }
                            }} 
                          />
                          <Tooltip />
                          <Legend />
                          <Bar 
                            dataKey="preferred" 
                            name="Preferred Shifts" 
                            stackId="a" 
                            fill={theme.palette.success.main}
                            radius={[4, 4, 0, 0]}
                          >
                            <LabelList dataKey="preferred" position="inside" fill="#fff" />
                          </Bar>
                          <Bar 
                            dataKey="nonPreferred" 
                            name="Other Shifts" 
                            stackId="a" 
                            fill={theme.palette.error.light}
                            radius={[0, 0, 4, 4]}
                          >
                            <LabelList dataKey="nonPreferred" position="inside" fill="#fff" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </>
                ) : (
                  <Alert severity="info" sx={{ width: '100%' }}>
                    <Typography variant="body1">
                      No doctors with shift preferences found in the current schedule.
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
                
          {/* Summary Card for Preference Trends */}
          {doctorPreferenceData.filter(d => d.preference !== 'None').length > 0 && (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Preference Adherence Summary
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Paper elevation={2} sx={{ p: 2, bgcolor: theme.palette.background.default }}>
                        <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                          <DayIcon sx={{ mr: 1, color: shiftColors.day }} />
                          Day Shift Preferences
                        </Typography>
                        
                        {doctorPreferenceData.filter(d => d.preference === 'Day Only').length > 0 ? (
                          <Box>
                            {doctorPreferenceData
                              .filter(d => d.preference === 'Day Only')
                              .map((doc, index) => (
                                <Box key={index} sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">{doc.name}:</Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Box sx={{ width: 120, mr: 1 }}>
                                      <LinearProgress 
                                        variant="determinate" 
                                        value={doc.adherencePercentage || 0}
                                        color={
                                          doc.adherencePercentage >= 80 ? 'success' :
                                          doc.adherencePercentage >= 50 ? 'warning' : 'error'
                                        }
                                        sx={{ height: 8, borderRadius: 4 }}
                                      />
                                    </Box>
                                    <Typography variant="body2">{doc.adherencePercentage}%</Typography>
                                  </Box>
                                </Box>
                              ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No doctors with Day Only preference
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <Paper elevation={2} sx={{ p: 2, bgcolor: theme.palette.background.default }}>
                        <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                          <NightIcon sx={{ mr: 1, color: shiftColors.night }} />
                          Night Shift Preferences
                        </Typography>
                        
                        {doctorPreferenceData.filter(d => d.preference === 'Night Only').length > 0 ? (
                          <Box>
                            {doctorPreferenceData
                              .filter(d => d.preference === 'Night Only')
                              .map((doc, index) => (
                                <Box key={index} sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">{doc.name}:</Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Box sx={{ width: 120, mr: 1 }}>
                                      <LinearProgress 
                                        variant="determinate" 
                                        value={doc.adherencePercentage || 0}
                                        color={
                                          doc.adherencePercentage >= 80 ? 'success' :
                                          doc.adherencePercentage >= 50 ? 'warning' : 'error'
                                        }
                                        sx={{ height: 8, borderRadius: 4 }}
                                      />
                                    </Box>
                                    <Typography variant="body2">{doc.adherencePercentage}%</Typography>
                                  </Box>
                                </Box>
                              ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No doctors with Night Only preference
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Paper elevation={2} sx={{ p: 2, bgcolor: theme.palette.background.default }}>
                        <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                          <EveningIcon sx={{ mr: 1, color: shiftColors.evening }} />
                          Evening Shift Preferences
                        </Typography>
                        
                        {doctorPreferenceData.filter(d => d.preference === 'Evening Only').length > 0 ? (
                          <Box>
                            {doctorPreferenceData
                              .filter(d => d.preference === 'Evening Only')
                              .map((doc, index) => (
                                <Box key={index} sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">{doc.name}:</Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Box sx={{ width: 120, mr: 1 }}>
                                      <LinearProgress 
                                        variant="determinate" 
                                        value={doc.adherencePercentage || 0}
                                        color={
                                          doc.adherencePercentage >= 80 ? 'success' :
                                          doc.adherencePercentage >= 50 ? 'warning' : 'error'
                                        }
                                        sx={{ height: 8, borderRadius: 4 }}
                                      />
                                    </Box>
                                    <Typography variant="body2">{doc.adherencePercentage}%</Typography>
                                  </Box>
                                </Box>
                              ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No doctors with Evening Only preference
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <b>Note:</b> Higher preference adherence percentage indicates that doctors are assigned 
                          to their preferred shift types more often. This is important for doctor satisfaction and 
                          may influence their performance and well-being.
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          <b>* Weighted Adherence:</b> Accounts for the fact that there are fewer evening shifts (1 per day) 
                          compared to day and night shifts (2 per day each). This provides a more fair comparison, especially 
                          for doctors with "Evening Only" preferences who have fewer opportunities to work their preferred shifts.
                        </Typography>
                      </Alert>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
};

export default DoctorShiftTypesChart;