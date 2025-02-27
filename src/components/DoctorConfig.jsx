import React, { useState, useEffect } from 'react'

function DoctorConfig({ doctors, setDoctors }) {
  const [localDoctors, setLocalDoctors] = useState(doctors)

  // Whenever the `doctors` prop changes (like after fetch), update local state
  useEffect(() => {
    setLocalDoctors(doctors)
  }, [doctors])

  const saveConfig = () => {
    setDoctors(localDoctors)
    alert('Doctor configuration saved!')
  }

  const addDoctor = () => {
    const name = prompt("Enter doctor name:")
    if (name) {
      setLocalDoctors([...localDoctors, { name, seniority: 'Junior', pref: 'None' }])
    }
  }

  const removeDoctor = (idx) => {
    const newList = localDoctors.filter((_, i) => i !== idx)
    setLocalDoctors(newList)
  }

  return (
    <div>
      <h2>Doctor Configuration</h2>
      <ul>
        {localDoctors.map((doc, idx) => (
          <li key={idx}>
            {doc.name} - {doc.seniority} - Preference: {doc.pref}{" "}
            <button onClick={() => removeDoctor(idx)}>Remove</button>
          </li>
        ))}
      </ul>
      <button onClick={addDoctor}>Add Doctor</button>
      <br />
      <button onClick={saveConfig}>Save Configuration</button>
    </div>
  )
}

export default DoctorConfig
