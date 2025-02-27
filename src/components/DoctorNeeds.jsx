import React, { useState } from 'react'

function DoctorNeeds({ setAvailability }) {
  const [constraints, setConstraints] = useState([])

  const addConstraint = () => {
    setConstraints([...constraints, { doctor: '', date: '', avail: 'Available' }])
  }

  const updateConstraint = (index, field, value) => {
    const newConstraints = constraints.slice()
    newConstraints[index][field] = value
    setConstraints(newConstraints)
  }

  const saveConstraints = () => {
    // Build availability object: { doctor: { date: avail, ... }, ... }
    const avail = {}
    constraints.forEach(({ doctor, date, avail: a }) => {
      if (!avail[doctor]) avail[doctor] = {}
      avail[doctor][date] = a
    })
    setAvailability(avail)
    alert("Availability constraints saved!")
  }

  return (
    <div>
      <h2>Doctor Needs / Availability</h2>
      <table border="1">
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Date (YYYY-MM-DD)</th>
            <th>Availability</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((con, idx) => (
            <tr key={idx}>
              <td>
                <input
                  type="text"
                  value={con.doctor}
                  onChange={(e) => updateConstraint(idx, 'doctor', e.target.value)}
                  placeholder="Doctor name"
                />
              </td>
              <td>
                <input
                  type="text"
                  value={con.date}
                  onChange={(e) => updateConstraint(idx, 'date', e.target.value)}
                  placeholder="2025-01-15"
                />
              </td>
              <td>
                <select
                  value={con.avail}
                  onChange={(e) => updateConstraint(idx, 'avail', e.target.value)}
                >
                  <option value="Available">Available</option>
                  <option value="Not Available">Not Available</option>
                  <option value="Day Only">Day Only</option>
                  <option value="Evening Only">Evening Only</option>
                  <option value="Night Only">Night Only</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addConstraint}>Add Constraint</button>
      <br />
      <button onClick={saveConstraints}>Save Availability</button>
    </div>
  )
}

export default DoctorNeeds
