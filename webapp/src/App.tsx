import { Sidebar } from './components/Sidebar'
import { DashboardHeader } from './components/DashboardHeader'
import { YourEventCard } from './components/YourEventCard'
import { ProgressOverview } from './components/ProgressOverview'
import { NextStepCard } from './components/NextStepCard'
import { RecentMoodboards } from './components/RecentMoodboards'
import { QuickActions } from './components/QuickActions'

function App() {
  return (
    <div className="bg-cream flex min-h-screen">
      <Sidebar />

      <main className="flex-1 overflow-x-hidden pb-12">
        <DashboardHeader />

        <div className="mt-6 space-y-6 px-10">
          <YourEventCard />

          <div className="grid grid-cols-2 gap-6">
            <ProgressOverview />
            <NextStepCard />
          </div>

          <RecentMoodboards />

          <QuickActions />
        </div>
      </main>
    </div>
  )
}

export default App
