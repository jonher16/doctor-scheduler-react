/**
 * Enhanced Excel exporter that creates an Excel file with the exact format, 
 * merged cells, cell colors, and text colors matching the uploaded example.
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ExcelDownloadButton({ schedule, doctors, selectedMonth, selectedYear }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    
    setTimeout(() => {
      try {
        // Create a new workbook
        const workbook = XLSX.utils.book_new();
        
        // Get shift template from localStorage
        let shiftTemplate = {};
        try {
          const storedTemplate = localStorage.getItem('shiftTemplate');
          if (storedTemplate) {
            shiftTemplate = JSON.parse(storedTemplate);
          }
        } catch (error) {
          console.error('Error loading shift template:', error);
        }

        // If selectedMonth is not provided, default to current month
        const month = selectedMonth || (new Date().getMonth() + 1);
        const year = selectedYear || 2025;
        
        // First pass: determine the maximum number of doctors for any shift in the month
        let maxDoctorsPerShift = 2; // Default minimum
        for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
          const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const daySchedule = schedule[dateStr] || {};
          
          ["Day", "Evening", "Night"].forEach(shift => {
            if (daySchedule[shift] && Array.isArray(daySchedule[shift])) {
              const doctorCount = daySchedule[shift].length;
              if (doctorCount > maxDoctorsPerShift) {
                maxDoctorsPerShift = doctorCount;
              }
            }
          });
        }
        
        // Process data for the selected month only
        const rows = [];
        const merges = [];
        const daysInMonth = new Date(year, month, 0).getDate();
        const daysOfWeek = ["일", "월", "화", "수", "목", "금", "토"];
        
        // Generate column labels (A, B, C, D, etc.)
        const columnLabels = Array.from({ length: maxDoctorsPerShift }, (_, i) => 
          String.fromCharCode(65 + i) // Convert 0->A, 1->B, 2->C, etc.
        );
        
        // Block size (days per block in the view)
        const blockSize = 7;
        const numBlocks = Math.ceil(daysInMonth / blockSize);
        
        // Current row index for calculating merges
        let rowIdx = 0;
        
        // Determine which shifts are in use for this month
        const activeShifts = new Set();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          
          // Check shift template first
          if (shiftTemplate[dateStr]) {
            Object.keys(shiftTemplate[dateStr]).forEach(shift => {
              activeShifts.add(shift);
            });
          } else {
            // Default shifts if not in template
            activeShifts.add("Day");
            activeShifts.add("Evening");
            activeShifts.add("Night");
          }
        }
        
        // Define shift labels and keys
        const defaultShiftConfig = [
          { label: "D 08~16", key: "Day" },
          { label: "E 16~00", key: "Evening" },
          { label: "당직 00~08", key: "Night" },
          { label: "PED11~19(19~07)", key: "" }
        ];
        
        // Filter to include only active shifts and optional PED shift
        const shiftConfig = defaultShiftConfig.filter(config => 
          activeShifts.has(config.key) || config.key === ""  // Keep empty key for PED row
        );
        
        // Process each block
        for (let block = 0; block < numBlocks; block++) {
          const startDay = block * blockSize + 1;
          const endDay = Math.min(startDay + blockSize - 1, daysInMonth);
          
          // Row 1: 시간/요일 header
          const headerRow = ["시간", "요일"];
          
          // Add days of week with merged cells spanning all doctor columns
          for (let day = startDay; day <= endDay; day++) {
            const date = new Date(year, month-1, day);
            const dayOfWeek = daysOfWeek[date.getDay()];
            headerRow.push(dayOfWeek);
            
            // Add empty cells for each additional doctor column
            for (let i = 1; i < maxDoctorsPerShift; i++) {
              headerRow.push("");
            }
            
            // Add merge for this day header (spans all doctor columns)
            merges.push({
              s: { r: rowIdx, c: headerRow.length - maxDoctorsPerShift },
              e: { r: rowIdx, c: headerRow.length - 1 }
            });
          }
          rows.push(headerRow);
          rowIdx++;
          
          // Row 2: 날짜 row
          const dateRow = ["날짜", ""];
          
          // Add dates with merged cells spanning all doctor columns
          for (let day = startDay; day <= endDay; day++) {
            const formattedDate = `${month}/${day}`;
            dateRow.push(formattedDate);
            
            // Add empty cells for each additional doctor column
            for (let i = 1; i < maxDoctorsPerShift; i++) {
              dateRow.push("");
            }
            
            // Add merge for this date (spans all doctor columns)
            merges.push({
              s: { r: rowIdx, c: dateRow.length - maxDoctorsPerShift },
              e: { r: rowIdx, c: dateRow.length - 1 }
            });
          }
          rows.push(dateRow);
          rowIdx++;
          
          // Row 3: 시간 with column labels (A, B, C, D, etc.)
          const columnLabelRow = ["시간", ""];
          
          // Add column labels for each day
          for (let day = startDay; day <= endDay; day++) {
            // Add a column label for each doctor slot
            for (let i = 0; i < maxDoctorsPerShift; i++) {
              columnLabelRow.push(columnLabels[i]);
            }
          }
          rows.push(columnLabelRow);
          rowIdx++;
          
          // Rows for each shift type
          for (let i = 0; i < shiftConfig.length; i++) {
            const { label, key: shiftKey } = shiftConfig[i];
            const shiftRow = [label, ""];
            
            for (let day = startDay; day <= endDay; day++) {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              const daySchedule = schedule[dateStr] || {};
              
              // Get scheduled doctors for this shift
              let doctors = [];
              if (shiftKey && daySchedule[shiftKey]) {
                doctors = daySchedule[shiftKey];
              }
              
              // Add scheduled doctors (one per column)
              for (let j = 0; j < maxDoctorsPerShift; j++) {
                shiftRow.push(doctors[j] || "");
              }
            }
            
            rows.push(shiftRow);
            rowIdx++;
          }
          
          // Add a blank row between blocks if this isn't the last block
          if (block < numBlocks - 1) {
            rows.push(Array(headerRow.length).fill(""));
            rowIdx++;
          }
        }
        
        // Create the worksheet
        const ws = XLSX.utils.aoa_to_sheet(rows);
        
        // Add merged cells
        ws['!merges'] = merges;
        
        // Apply cell styling
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            const cellAddress = XLSX.utils.encode_cell({r, c});
            
            // Skip empty cells
            if (!ws[cellAddress]) continue;
            
            // Initialize styles if not present
            if (!ws[cellAddress].s) ws[cellAddress].s = {};
            
            // Add alignment to all cells
            ws[cellAddress].s.alignment = { horizontal: "center", vertical: "center" };
            
            // Calculate the block position
            const blockPosition = Math.floor(r / (4 + shiftConfig.length + 1)); // +1 for the empty row
            const rowInBlock = r - blockPosition * (4 + shiftConfig.length + 1);
            
            // Style header cells (time, day of week)
            if (rowInBlock === 0 && (c <= 1 || rows[r][c] !== "")) {
              ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } }; // Gray background
            }
            
            // Style day of week cells with colors
            if (rowInBlock === 0 && c > 1 && rows[r][c] !== "") {
              const dayOfWeek = rows[r][c];
              if (dayOfWeek === "일") {
                ws[cellAddress].s.font = { color: { rgb: "FF0000" } }; // Red for Sunday
              }
              else if (dayOfWeek === "토") {
                ws[cellAddress].s.font = { color: { rgb: "0000FF" } }; // Blue for Saturday
              }
            }
            
            // Style date cells with colors
            if (rowInBlock === 1 && c > 1 && rows[r][c] !== "") {
              const dateStr = rows[r][c];
              // Calculate day of week from the date
              const [month, day] = dateStr.split('/').map(Number);
              const date = new Date(year, month - 1, day);
              const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
              
              if (dayOfWeek === 0) {
                ws[cellAddress].s.font = { color: { rgb: "FF0000" } }; // Red for Sunday
              }
              else if (dayOfWeek === 6) {
                ws[cellAddress].s.font = { color: { rgb: "0000FF" } }; // Blue for Saturday
              }
            }
            
            // Style column label row (A, B, C, etc.)
            if (rowInBlock === 2 && c > 1) {
              ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } }; // Gray background
            }
            
            // Style shift labels with yellow background
            if (rowInBlock >= 3 && rowInBlock < 3 + shiftConfig.length && c === 0) {
              ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "FFFF00" } }; // Yellow background
            }
          }
        }
        
        // Set column widths
        const colWidths = [];
        colWidths.push({ wch: 14 }); // 시간 column
        colWidths.push({ wch: 5 });  // 요일 column
        
        // Set widths for doctor columns
        for (let i = 0; i < daysInMonth * maxDoctorsPerShift; i++) {
          colWidths.push({ wch: 8 });
        }
        
        ws['!cols'] = colWidths;
        
        // Add the worksheet to the workbook
        const monthName = month.toString().padStart(2, '0');
        XLSX.utils.book_append_sheet(workbook, ws, `${monthName}월`);
        
        // Generate Excel file and trigger download
        const fileName = `Schedule_${year}_${monthName}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
      } catch (error) {
        console.error('Error generating Excel:', error);
      } finally {
        setIsExporting(false);
      }
    }, 100); // Small delay to allow the UI to update
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxSizing: 'border-box',
        outline: '0px',
        margin: '0px',
        cursor: isExporting ? 'wait' : 'pointer',
        userSelect: 'none',
        verticalAlign: 'middle',
        appearance: 'none',
        textDecoration: 'none',
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        fontWeight: '500',
        fontSize: '0.875rem',
        lineHeight: '1.75',
        letterSpacing: '0.02857em',
        textTransform: 'none',
        minWidth: '64px',
        padding: '8px 18px',
        borderRadius: '8px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        color: 'rgb(255, 255, 255)',
        backgroundColor: isExporting ? 'rgba(25, 118, 210, 0.7)' : 'rgb(25, 118, 210)',
        boxShadow: 'rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 2px 2px 0px, rgba(0, 0, 0, 0.12) 0px 1px 5px 0px',
        border: '0px',
        textAlign: 'center',
        overflow: 'hidden',
        
        ':hover': {
          backgroundColor: 'rgb(21, 101, 192)',
          boxShadow: 'rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 3px 3px 0px, rgba(0, 0, 0, 0.12) 0px 2px 5px 0px',
          transform: 'translateY(-1px)'
        }
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgb(21, 101, 192)';
        e.currentTarget.style.boxShadow = 'rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 3px 3px 0px, rgba(0, 0, 0, 0.12) 0px 2px 5px 0px';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isExporting ? 'rgba(25, 118, 210, 0.7)' : 'rgb(25, 118, 210)';
        e.currentTarget.style.boxShadow = 'rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 2px 2px 0px, rgba(0, 0, 0, 0.12) 0px 1px 5px 0px';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      onMouseDown={(e) => {
        const button = e.currentTarget;
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.className = 'ripple';
        
        button.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 600);
      }}
    >
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes ripple {
            to {
              transform: scale(4);
              opacity: 0;
            }
          }
          
          .ripple {
            position: absolute;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.7);
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
          }
        `}
      </style>
      {isExporting ? (
        <>
          <svg
            style={{
              animation: 'spin 1.4s linear infinite',
              width: '18px',
              height: '18px',
              marginRight: '8px'
            }}
            viewBox="22 22 44 44"
          >
            <circle
              style={{
                stroke: 'currentcolor',
                strokeDasharray: '80px, 200px',
                strokeDashoffset: '0px',
              }}
              cx="44"
              cy="44"
              r="20.2"
              fill="none"
              strokeWidth="3.6"
            />
          </svg>
          Exporting...
        </>
      ) : (
        <>
          <svg 
            style={{ 
              marginRight: '10px', 
              width: '20px', 
              height: '20px',
              transition: 'transform 0.3s ease'
            }} 
            className="download-icon"
            focusable="false" 
            aria-hidden="true" 
            viewBox="0 0 24 24"
          >
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"></path>
          </svg>
          Download Excel
        </>
      )}
    </button>
  );
}