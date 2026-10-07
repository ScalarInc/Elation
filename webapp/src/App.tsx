import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { ClientLayout } from '@/layouts/ClientLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { ProtectedRoute } from '@/layouts/ProtectedRoute'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MyEventsPage } from '@/pages/MyEventsPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { QuestionnairePage } from '@/pages/QuestionnairePage'
import { MoodboardsPage } from '@/pages/MoodboardsPage'
import { BudgetPage } from '@/pages/BudgetPage'
import { BudgetListPage } from '@/pages/BudgetListPage'
import { InspirationsPage } from '@/pages/InspirationsPage'
import { InspirationDetailPage } from '@/pages/InspirationDetailPage'
import { ARPage } from '@/pages/ARPage'
import { EventARPage } from '@/pages/EventARPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<Navigate to="/auth?mode=signin" replace />} />
          <Route path="/signup" element={<Navigate to="/auth" replace />} />

          {/* Client area */}
          <Route element={<ProtectedRoute />}>
            {/* Full-screen flows (no sidebar) */}
            <Route path="/events/:id/questionnaire" element={<QuestionnairePage />} />

            <Route element={<ClientLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/events" element={<MyEventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/events/:id/budget" element={<BudgetPage />} />
              <Route path="/events/:id/ar" element={<EventARPage />} />
              <Route path="/moodboards" element={<MoodboardsPage />} />
              <Route path="/budget" element={<BudgetListPage />} />
              <Route path="/ar" element={<ARPage />} />
              <Route path="/inspirations" element={<InspirationsPage />} />
              <Route path="/inspirations/:slug" element={<InspirationDetailPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          {/* Admin area */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route
              index
              element={
                <PlaceholderPage
                  title="Admin Overview"
                  description="KPIs, client activity feed, budget/theme charts, upcoming consultations."
                  sprintNumber={13}
                />
              }
            />
            <Route
              path="clients"
              element={
                <PlaceholderPage
                  title="Client Management"
                  description="Create, extend, and revoke temporary client accounts."
                  sprintNumber={13}
                />
              }
            />
            <Route
              path="inquiries"
              element={<PlaceholderPage title="Inquiries" description="Public consultation-form submissions to convert." sprintNumber={14} />}
            />
            <Route
              path="analytics"
              element={<PlaceholderPage title="Analytics" description="Popular themes, budget ranges, consultation trends." sprintNumber={14} />}
            />
            <Route
              path="inventory"
              element={<PlaceholderPage title="Inventory Catalogue" description="CMS for the inventory used by recommendations." sprintNumber={14} />}
            />
            <Route
              path="inspirations"
              element={<PlaceholderPage title="Inspiration Concepts" description="CMS for the inspiration gallery." sprintNumber={14} />}
            />
            <Route
              path="settings"
              element={<PlaceholderPage title="Admin Settings" description="Team, roles, branding, email templates." sprintNumber={14} />}
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        <Toaster />
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
