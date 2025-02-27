import React, { useState, useEffect } from 'react'

function HolidayConfig({ holidays, setHolidays }) {
  const [localHolidays, setLocalHolidays] = useState(holidays)
  const [selectedDate, setSelectedDate] = useState('')
  const [holidayType, setHolidayType] = useState('Short')

  useEffect(() => {
    setLocalHolidays(holidays)
  }, [holidays])

  const markHoliday = () => {
    if (!selectedDate) return
    const newHolidays = { ...localHolidays, [selectedDate]: holidayType }
    setLocalHolidays(newHolidays)
  }

  const removeHoliday = (date) => {
    const newHolidays = { ...localHolidays }
    delete newHolidays[date]
    setLocalHolidays(newHolidays)
  }

  const saveHolidays = () => {
    setHolidays(localHolidays)
    alert('Holiday configuration saved!')
  }

  return (
    <div>
      <h2>Holiday Configuration</h2>
      <div>
        <label>
          Date (YYYY-MM-DD):{" "}
          <input type="text" onChange={(e) => setSelectedDate(e.target.value)} placeholder="2025-12-25" />
        </label>
        <label>
          Type:{" "}
          <select onChange={(e) => setHolidayType(e.target.value)} value={holidayType}>
            <option value="Short">Short</option>
            <option value="Long">Long</option>
          </select>
        </label>
        <button onClick={markHoliday}>Mark Holiday</button>
      </div>
      <h3>Current Holidays</h3>
      <ul>
        {Object.entries(localHolidays).map(([date, type]) => (
          <li key={date}>
            {date}: {type} <button onClick={() => removeHoliday(date)}>Remove</button>
          </li>
        ))}
      </ul>
      <button onClick={saveHolidays}>Save Holidays</button>
    </div>
  )
}

export default HolidayConfig
