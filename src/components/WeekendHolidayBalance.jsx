import React from 'react'
import { Bar } from 'react-chartjs-2'

function WeekendHolidayBalance({ doctors, schedule }) {
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return <div style={{ minHeight: '400px' }}>No schedule generated yet!</div>
  }
  
  const weekendShifts = {}
  const holidayShifts = {}
  doctors.forEach(doc => {
    weekendShifts[doc.name] = 0
    holidayShifts[doc.name] = 0
  })

  Object.keys(schedule).forEach(dateStr => {
    const daySchedule = schedule[dateStr]
    if (!daySchedule || typeof daySchedule !== 'object') return
    const date = new Date(dateStr)
    const isWeekend = (date.getDay() === 6 || date.getDay() === 0)
    const isHoliday = dateStr.endsWith("-01") // Example logic
    ;["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
      shiftArr.forEach(name => {
        if (isHoliday) {
          holidayShifts[name] += 1
        } else if (isWeekend) {
          weekendShifts[name] += 1
        }
      })
    })
  })

  const labels = Object.keys(weekendShifts)
  const data = {
    labels,
    datasets: [
      {
        label: 'Weekend Shifts',
        data: labels.map(doc => weekendShifts[doc]),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
      {
        label: 'Holiday Shifts',
        data: labels.map(doc => holidayShifts[doc]),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
      }
    ]
  }
  const options = {
    responsive: true,
    plugins: {
      title: { display: true, text: 'Weekend and Holiday Shifts per Doctor' },
    },
  }

  return (
    <div style={{ minHeight: '400px' }}>
      <h3>Weekend/Holiday Balance</h3>
      <Bar data={data} options={options} />
    </div>
  )
}

export default WeekendHolidayBalance
