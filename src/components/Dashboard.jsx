import React from 'react'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs'
import 'react-tabs/style/react-tabs.css'
import MonthlyHours from './MonthlyHours'
import WeekendHolidayBalance from './WeekendHolidayBalance'
import YearlySchedule from './YearlySchedule'
import ScheduleStatistics from './ScheduleStatistics'

function Dashboard({ doctors, schedule }) {
  return (
    <div>
      <h2>Schedule Dashboard</h2>
      <Tabs>
        <TabList>
          <Tab>Monthly Hours</Tab>
          <Tab>Weekend/Holiday Balance</Tab>
          <Tab>Yearly Schedule</Tab>
          <Tab>Statistics</Tab>
        </TabList>

        <TabPanel>
          <MonthlyHours doctors={doctors} schedule={schedule} />
        </TabPanel>
        <TabPanel>
          <WeekendHolidayBalance doctors={doctors} schedule={schedule} />
        </TabPanel>
        <TabPanel>
          <YearlySchedule doctors={doctors} schedule={schedule} />
        </TabPanel>
        <TabPanel>
          <ScheduleStatistics doctors={doctors} schedule={schedule} />
        </TabPanel>
      </Tabs>
    </div>
  )
}

export default Dashboard
