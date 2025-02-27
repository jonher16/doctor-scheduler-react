import React, { useState, useEffect } from 'react'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs'
import 'react-tabs/style/react-tabs.css'
import DoctorConfig from './components/DoctorConfig'
import HolidayConfig from './components/HolidayConfig'
import DoctorNeeds from './components/DoctorNeeds'
import GenerateSchedule from './components/GenerateSchedule'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [doctors, setDoctors] = useState([])
  const [holidays, setHolidays] = useState({})
  const [availability, setAvailability] = useState({}) // optional: availability constraints
  const [schedule, setSchedule] = useState({}) // schedule generated for the year

  // On mount, load defaults from public folder
  useEffect(() => {
    fetch('/doctors.json')
      .then(res => res.json())
      .then(data => {
        setDoctors(data)
        console.log("Loaded doctors:", data)
      })
      .catch(err => console.error('Error loading doctors.json', err))

    fetch('/holidays.json')
      .then(res => res.json())
      .then(data => {
        setHolidays(data)
        console.log("Loaded holidays:", data)
      })
      .catch(err => console.error('Error loading holidays.json', err))
  }, [])

  return (
    <div className="App">
      <header>
        <h1>Doctor Scheduler Dashboard</h1>
      </header>
      <Tabs>
        <TabList>
          <Tab>Doctor Config</Tab>
          <Tab>Holiday Config</Tab>
          <Tab>Doctor Needs</Tab>
          <Tab>Generate Schedule</Tab>
          <Tab>Dashboard</Tab>
        </TabList>

        <TabPanel>
          <DoctorConfig doctors={doctors} setDoctors={setDoctors} />
        </TabPanel>
        <TabPanel>
          <HolidayConfig holidays={holidays} setHolidays={setHolidays} />
        </TabPanel>
        <TabPanel>
          <DoctorNeeds setAvailability={setAvailability} />
        </TabPanel>
        <TabPanel>
          <GenerateSchedule
            doctors={doctors}
            holidays={holidays}
            availability={availability}
            setSchedule={setSchedule}
          />
        </TabPanel>
        <TabPanel>
          <Dashboard doctors={doctors} schedule={schedule} />
        </TabPanel>
      </Tabs>
    </div>
  )
}

export default App
