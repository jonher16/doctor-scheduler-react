import React, { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

function MonthlyHours({ doctors, schedule }) {
  const [month, setMonth] = useState(1) // 1 to 12

  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return <div style={{ minHeight: '400px' }}>No schedule generated yet!</div>
  }

  const monthlyHours = {}
  doctors.forEach(doc => {
    monthlyHours[doc.name] = 0
  })
  const startDate = new Date("2025-01-01")
  Object.keys(schedule).forEach(dateStr => {
    const date = new Date(dateStr)
    if (date.getMonth() + 1 === month) {
      const daySchedule = schedule[dateStr]
      if (!daySchedule || typeof daySchedule !== 'object') return
      ;["Day", "Evening", "Night"].forEach(shift => {
        const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
        shiftArr.forEach(name => {
          monthlyHours[name] += 8
        })
      })
    }
  })

  const labels = Object.keys(monthlyHours)
  const dataForMonth = labels.map(doc => monthlyHours[doc])
  const data = {
    labels,
    datasets: [
      {
        label: `Hours in Month ${month}`,
        data: dataForMonth,
        backgroundColor: 'rgba(54, 162, 235, 0.6)'
      }
    ]
  }
  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: `Monthly Hours per Doctor - Month ${month}` }
    }
  }

  return (
    <div style={{ minHeight: '400px' }}>
      <h3>Monthly Hours per Doctor</h3>
      <div>
        <label>Select Month: </label>
        <input
          type="number"
          min="1"
          max="12"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        />
      </div>
      <Bar data={data} options={options} />
    </div>
  )
}

export default MonthlyHours
