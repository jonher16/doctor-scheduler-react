/**
 * Enhanced Excel exporter that creates an Excel file with the exact format, 
 * merged cells, cell colors, and text colors matching the uploaded example.
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ExcelDownloadButton({ schedule, doctors }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    
    setTimeout(() => {
      try {
        // Create a new workbook
        const workbook = XLSX.utils.book_new();
        
        // Process data for each month
        for (let month = 1; month <= 12; month++) {
          // Create array to hold all rows for this month's sheet
          const rows = [];
          const merges = [];
          const daysInMonth = new Date(2025, month, 0).getDate();
          const daysOfWeek = ["일", "월", "화", "수", "목", "금", "토"];
          
          // Block size (days per block in the view)
          const blockSize = 7;
          const numBlocks = Math.ceil(daysInMonth / blockSize);
          
          // Current row index for calculating merges
          let rowIdx = 0;
          
          // Process each block
          for (let block = 0; block < numBlocks; block++) {
            const startDay = block * blockSize + 1;
            const endDay = Math.min(startDay + blockSize - 1, daysInMonth);
            
            // Row 1: 시간/요일 header
            const headerRow = ["시간", "요일"];
            
            // Add days of week
            for (let day = startDay; day <= endDay; day++) {
              const date = new Date(2025, month-1, day);
              const dayOfWeek = daysOfWeek[date.getDay()];
              headerRow.push(dayOfWeek);
              headerRow.push(""); // Empty cell for B column
              
              // Add merge for this day header (spans A/B columns)
              merges.push({
                s: { r: rowIdx, c: headerRow.length - 2 },
                e: { r: rowIdx, c: headerRow.length - 1 }
              });
            }
            rows.push(headerRow);
            rowIdx++;
            
            // Row 2: 날짜 row
            const dateRow = ["날짜", ""];
            
            // Add dates
            for (let day = startDay; day <= endDay; day++) {
              const formattedDate = `${month}/${day}`;
              dateRow.push(formattedDate);
              dateRow.push(""); // Empty cell for B column
              
              // Add merge for this date (spans A/B columns)
              merges.push({
                s: { r: rowIdx, c: dateRow.length - 2 },
                e: { r: rowIdx, c: dateRow.length - 1 }
              });
            }
            rows.push(dateRow);
            rowIdx++;
            
            // Row 3: 시간 with A/B columns
            const abRow = ["시간", ""];
            
            // Add A/B for each day
            for (let day = startDay; day <= endDay; day++) {
              abRow.push("A");
              abRow.push("B");
            }
            rows.push(abRow);
            rowIdx++;
            
            // Rows 4-7: Shift assignments
            const shiftLabels = ["D 08~16", "E 16~00", "당직 00~08", "PED11~19(19~07)"];
            const shiftKeys = ["Day", "Evening", "Night", ""];
            
            for (let i = 0; i < shiftLabels.length; i++) {
              const shiftRow = [shiftLabels[i], ""];
              const shiftKey = shiftKeys[i];
              
              for (let day = startDay; day <= endDay; day++) {
                const dateStr = `2025-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const daySchedule = schedule[dateStr] || { Day: [], Evening: [], Night: [] };
                
                // Get scheduled doctors for this shift
                let doctors = [];
                if (shiftKey && daySchedule[shiftKey]) {
                  doctors = daySchedule[shiftKey];
                }
                
                // Add scheduled doctors
                shiftRow.push(doctors[0] || "");
                shiftRow.push(doctors[1] || "");
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
              
              // Style header cells (time, day of week)
              if (r % 12 === 0 && (c <= 1 || rows[r][c] !== "")) {
                ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } }; // Gray background
              }
              
              // Style day of week cells with colors
              if (r % 12 === 0 && c > 1 && rows[r][c] !== "") {
                const dayOfWeek = rows[r][c];
                if (dayOfWeek === "일") {
                  ws[cellAddress].s.font = { color: { rgb: "FF0000" } }; // Red for Sunday
                }
                else if (dayOfWeek === "토") {
                  ws[cellAddress].s.font = { color: { rgb: "0000FF" } }; // Blue for Saturday
                }
              }
              
              // Style date cells with colors
              if (r % 12 === 1 && c > 1 && rows[r][c] !== "") {
                const dateStr = rows[r][c];
                // Calculate day of week from the date
                const [month, day] = dateStr.split('/').map(Number);
                const date = new Date(2025, month - 1, day);
                const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
                
                if (dayOfWeek === 0) {
                  ws[cellAddress].s.font = { color: { rgb: "FF0000" } }; // Red for Sunday
                }
                else if (dayOfWeek === 6) {
                  ws[cellAddress].s.font = { color: { rgb: "0000FF" } }; // Blue for Saturday
                }
              }
              
              // Style A/B columns in table header
              if (r % 12 === 2 && c > 1) {
                ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } }; // Gray background
              }
              
              // Style shift labels with yellow background
              if ((r % 12 >= 3 && r % 12 <= 6) && c === 0) {
                ws[cellAddress].s.fill = { patternType: "solid", fgColor: { rgb: "FFFF00" } }; // Yellow background
              }
            }
          }
          
          // Set column widths
          const colWidths = [];
          colWidths.push({ wch: 14 }); // 시간 column
          colWidths.push({ wch: 5 });  // 요일 column
          
          // Set widths for day columns
          for (let i = 0; i < daysInMonth * 2; i++) {
            colWidths.push({ wch: 8 });
          }
          
          ws['!cols'] = colWidths;
          
          // Add the worksheet to the workbook
          XLSX.utils.book_append_sheet(workbook, ws, `${month}월`);
        }
        
        // Generate Excel file and trigger download
        XLSX.writeFile(workbook, 'Schedule_2025.xlsx');
        
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
        textTransform: 'uppercase',
        minWidth: '64px',
        padding: '6px 16px',
        borderRadius: '4px',
        transition: 'background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, border-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
        color: 'rgb(255, 255, 255)',
        backgroundColor: isExporting ? 'rgba(25, 118, 210, 0.7)' : 'rgb(25, 118, 210)',
        boxShadow: 'rgba(0, 0, 0, 0.2) 0px 3px 1px -2px, rgba(0, 0, 0, 0.14) 0px 2px 2px 0px, rgba(0, 0, 0, 0.12) 0px 1px 5px 0px',
        border: '0px',
        textAlign: 'center'
      }}
    >
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
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
          Exporting...
        </>
      ) : (
        <>
          <svg 
            style={{ marginRight: '8px', width: '20px', height: '20px' }} 
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