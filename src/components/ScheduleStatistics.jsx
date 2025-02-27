import React from 'react'

function ScheduleStatistics({ doctors, schedule }) {
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return <div style={{ minHeight: '400px' }}>No schedule generated yet!</div>
  }
  
  const monthlyHours = {}
  doctors.forEach(doc => {
    monthlyHours[doc.name] = Array(12).fill(0)
  })
  const startDate = new Date("2025-01-01")
  Object.keys(schedule).forEach(dateStr => {
    const daySchedule = schedule[dateStr]
    if (!daySchedule || typeof daySchedule !== 'object') return
    const date = new Date(dateStr)
    const month = date.getMonth() // 0-indexed
    ;["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
      shiftArr.forEach(name => {
        monthlyHours[name][month] += 8
      })
    })
  })

  const totalHours = {}
  Object.keys(monthlyHours).forEach(name => {
    totalHours[name] = monthlyHours[name].reduce((a, b) => a + b, 0)
  })

  const lines = []
  lines.push("=== Schedule Statistics ===\n")
  doctors.forEach(doc => {
    const name = doc.name
    lines.push(`Doctor: ${name}`)
    lines.push(`  Monthly Hours: ${monthlyHours[name].join(", ")}`)
    lines.push(`  Total Yearly Hours: ${totalHours[name]}`)
    lines.push("")
  })

  return (
    <div style={{ minHeight: '400px' }}>
      <h3>Schedule Statistics</h3>
      <pre>{lines.join("\n")}</pre>
    </div>
  )
}

export default ScheduleStatistics
