import React, { useState } from 'react'

function GenerateSchedule({ doctors, holidays, availability, setSchedule }) {
  const [status, setStatus] = useState("")

  // Dummy scheduling algorithm (round-robin assignment) that obeys coverage per day.
  const generate = () => {
    if (doctors.length === 0) {
      alert("No doctors configured!")
      return
    }
    setStatus("Generating schedule...")

    // Create a schedule with a null prototype to avoid any hidden keys like __proto__
    const schedule = Object.create(null)

    const daysInYear = 365
    const startDate = new Date("2025-01-01")
    const shifts = ["Day", "Evening", "Night"]
    const shiftCoverage = { "Day": 2, "Evening": 1, "Night": 2 }

    let doctorIndex = 0
    for (let d = 0; d < daysInYear; d++) {
      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + d)
      const dateStr = currentDate.toISOString().split('T')[0]

      // Always create the structure for each date
      schedule[dateStr] = { "Day": [], "Evening": [], "Night": [] }

      // For each shift, assign required number of doctors (round-robin)
      shifts.forEach(shift => {
        for (let i = 0; i < shiftCoverage[shift]; i++) {
          // If there's a "Long" holiday, skip the next doctor if they're senior, etc. (Dummy logic)
          if (holidays[dateStr] === "Long") {
            // example skip logic
            // in real code, you'd check if doctors[doctorIndex].seniority === "Senior"
            doctorIndex = (doctorIndex + 1) % doctors.length
          }
          schedule[dateStr][shift].push(doctors[doctorIndex].name)
          doctorIndex = (doctorIndex + 1) % doctors.length
        }
      })
    }

    setSchedule(schedule)
    setStatus("Schedule generated successfully!")
    console.log("Generated schedule:", schedule)
  }

  return (
    <div>
      <h2>Generate Schedule</h2>
      <button onClick={generate}>Generate Schedule</button>
      <p>{status}</p>
    </div>
  )
}

export default GenerateSchedule
