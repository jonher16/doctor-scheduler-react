import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';

const DoctorShiftTypesChart = ({ doctors, schedule, selectedMonth }) => {
  // Use the provided selectedMonth or default to current month
  const month = selectedMonth || new Date().getMonth() + 1;
  const [shiftData, setShiftData] = useState([]);
  const [totalShifts, setTotalShifts] = useState({ day: 0, evening: 0, night: 0 });

  // Process data when schedule, doctors, or selected month changes
  useEffect(() => {
    if (!schedule || !doctors || doctors.length === 0) return;
    
    const processedData = processScheduleData();
    setShiftData(processedData.shiftData);
    setTotalShifts(processedData.totalShifts);
  }, [schedule, doctors, month]);

  // Process the schedule data for the chart
  const processScheduleData = () => {
    const doctorShifts = {};
    const totalShiftCounts = { day: 0, evening: 0, night: 0 };
    
    // Initialize data for each doctor
    doctors.forEach(doc => {
      doctorShifts[doc.name] = {
        name: doc.name,
        day: 0,
        evening: 0,
        night: 0,
        total: 0,
        seniority: doc.seniority || 'Junior'
      };
    });
    
    // Count shifts for the selected month
    Object.entries(schedule).forEach(([dateStr, daySchedule]) => {
      // Parse the date to check if it's in the selected month
      const date = new Date(dateStr);
      const dateMonth = date.getMonth() + 1; // JavaScript months are 0-indexed
      
      if (dateMonth === month) {
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
    
    // Convert to array and sort by total shifts
    const shiftDataArray = Object.values(doctorShifts)
      .filter(doctor => doctor.total > 0) // Only include doctors who worked in this month
      .sort((a, b) => b.total - a.total);
    
    return {
      shiftData: shiftDataArray,
      totalShifts: totalShiftCounts
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
        <div className="bg-white p-4 shadow-lg rounded-md">
          <p className="font-bold">{label}</p>
          <div className="border-t border-b border-gray-200 my-2"></div>
          
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center mb-1">
              <div 
                className="w-3 h-3 mr-2 rounded-sm"
                style={{ backgroundColor: entry.color }} 
              />
              <p className="text-sm">
                {entry.name}: {entry.value} shift{entry.value !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
          
          <div className="border-t border-gray-200 my-2"></div>
          <p className="text-sm font-bold">
            Total: {payload.reduce((sum, entry) => sum + entry.value, 0)} shifts
          </p>
        </div>
      );
    }
    return null;
  };

  // No data available
  if (shiftData.length === 0) {
    return (
      <div className="min-h-96 flex justify-center items-center">
        <div className="bg-blue-50 text-blue-700 p-4 rounded-md w-full max-w-lg">
          <p className="text-center">
            No shift data available for {getMonthName(month)}
          </p>
        </div>
      </div>
    );
  }

  // Colors for the bars
  const shiftColors = {
    day: '#FFB74D',    // Orange for day shifts
    evening: '#42A5F5', // Blue for evening shifts
    night: '#5C6BC0'    // Indigo for night shifts
  };

  return (
    <div className="min-h-96">
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                Shift Type Distribution - {getMonthName(month)} 2025
              </h2>
            </div>
            
            <div className="mb-6 flex flex-wrap gap-4 justify-center">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-orange-400 mr-2 rounded-sm"></div>
                <span className="text-sm">Day Shifts: {totalShifts.day}</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-400 mr-2 rounded-sm"></div>
                <span className="text-sm">Evening Shifts: {totalShifts.evening}</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-indigo-400 mr-2 rounded-sm"></div>
                <span className="text-sm">Night Shifts: {totalShifts.night}</span>
              </div>
            </div>
            
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={shiftData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                  barSize={30}
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
                  <ChartTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    dataKey="day" 
                    name="Day Shifts" 
                    stackId="a" 
                    fill={shiftColors.day} 
                  />
                  <Bar 
                    dataKey="evening" 
                    name="Evening Shifts" 
                    stackId="a" 
                    fill={shiftColors.evening} 
                  />
                  <Bar 
                    dataKey="night" 
                    name="Night Shifts" 
                    stackId="a" 
                    fill={shiftColors.night} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4">
              Shift Type Analysis by Doctor
            </h2>
            <div className="border-b border-gray-200 mb-4"></div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="py-2 px-4 text-left border-b">Doctor</th>
                    <th className="py-2 px-4 text-center border-b">Seniority</th>
                    <th className="py-2 px-4 text-center border-b">Day Shifts</th>
                    <th className="py-2 px-4 text-center border-b">Evening Shifts</th>
                    <th className="py-2 px-4 text-center border-b">Night Shifts</th>
                    <th className="py-2 px-4 text-center border-b">Total Shifts</th>
                    <th className="py-2 px-4 text-center border-b">Shift Pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftData.map((doctor, index) => {
                    // Calculate percentage distribution for shift pattern visualization
                    const total = doctor.day + doctor.evening + doctor.night;
                    const dayPercent = total > 0 ? (doctor.day / total) * 100 : 0;
                    const eveningPercent = total > 0 ? (doctor.evening / total) * 100 : 0;
                    const nightPercent = total > 0 ? (doctor.night / total) * 100 : 0;
                    
                    return (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="py-2 px-4 border-b">{doctor.name}</td>
                        <td className="py-2 px-4 text-center border-b">
                          {doctor.seniority}
                        </td>
                        <td className="py-2 px-4 text-center border-b">{doctor.day}</td>
                        <td className="py-2 px-4 text-center border-b">{doctor.evening}</td>
                        <td className="py-2 px-4 text-center border-b">{doctor.night}</td>
                        <td className="py-2 px-4 text-center border-b font-bold">{doctor.total}</td>
                        <td className="py-2 px-4 border-b">
                          <div className="flex h-5 w-full rounded overflow-hidden" title={`Day: ${dayPercent.toFixed(1)}%, Evening: ${eveningPercent.toFixed(1)}%, Night: ${nightPercent.toFixed(1)}%`}>
                            {dayPercent > 0 && (
                              <div style={{ width: `${dayPercent}%`, backgroundColor: shiftColors.day }} />
                            )}
                            {eveningPercent > 0 && (
                              <div style={{ width: `${eveningPercent}%`, backgroundColor: shiftColors.evening }} />
                            )}
                            {nightPercent > 0 && (
                              <div style={{ width: `${nightPercent}%`, backgroundColor: shiftColors.night }} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorShiftTypesChart;