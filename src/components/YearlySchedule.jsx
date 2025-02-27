import React from 'react'

function YearlySchedule({ doctors, schedule }) {
  if (!schedule || Object.keys(schedule).length === 0 || !doctors || doctors.length === 0) {
    return <div style={{ minHeight: '400px' }}>No schedule generated yet!</div>
  }

  // For simplicity, show total shifts per doctor for the year.
  const totals = {}
  doctors.forEach(doc => { totals[doc.name] = 0 })
  Object.keys(schedule).forEach(date => {
    const daySchedule = schedule[date]
    if (!daySchedule || typeof daySchedule !== 'object') return
    ;["Day", "Evening", "Night"].forEach(shift => {
      const shiftArr = Array.isArray(daySchedule[shift]) ? daySchedule[shift] : []
      shiftArr.forEach(name => {
        totals[name] += 1
      })
    })
  })

  return (
    <div style={{ minHeight: '400px' }}>
      <h3>Yearly Schedule Overview</h3>
      <table border="1" cellPadding="5">
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Total Shifts (Year)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(totals).map(([doc, total]) => (
            <tr key={doc}>
              <td>{doc}</td>
              <td>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default YearlySchedule
