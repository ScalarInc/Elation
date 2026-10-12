import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { ClientLayout } from '@/layouts/ClientLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ProtectedRoute, RootRedirect } from '@/routes/ProtectedRoute'
import { SignInPage } from '@/pages/auth/SignInPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { SetPasswordPage } from '@/pages/auth/SetPasswordPage'
import { AccessEndedPage } from '@/pages/auth/AccessEndedPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { MyEventsPage } from '@/pages/events/MyEventsPage'
import { EventDetailPage } from '@/pages/events/EventDetailPage'
import { QuestionnairePage } from '@/pages/events/QuestionnairePage'
import { MoodboardsPage } from '@/pages/moodboards/MoodboardsPage'
import { BudgetPage } from '@/pages/budget/BudgetPage'
import { BudgetListPage } from '@/pages/budget/BudgetListPage'
import { InspirationsPage } from '@/pages/inspirations/InspirationsPage'
import { InspirationDetailPage } from '@/pages/inspirations/InspirationDetailPage'
import { ARPage } from '@/pages/ar/ARPage'
import { EventARPage } from '@/pages/ar/EventARPage'
import { MessagesPage } from '@/pages/messages/MessagesPage'
import { SettingsPage } from '@/pages/account/SettingsPage'
import { ProfilePage } from '@/pages/account/ProfilePage'
import { NotFoundPage } from '@/pages/common/NotFoundPage'
import { PlaceholderPage } from '@/pages/common/PlaceholderPage'

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          {/* Public auth screens. No self-signup: accounts are created by admins. */}
          <Route path="/auth" element={<AuthLayout />}>
            <Route index element={<SignInPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="set-password" element={<SetPasswordPage mode="set" />} />
            <Route path="reset-password" element={<SetPasswordPage mode="reset" />} />
            <Route path="access-ended" element={<AccessEndedPage />} />
          </Route>
          <Route path="/login" element={<Navigate to="/auth" replace />} />

          {/* Client area */}
          <Route element={<ProtectedRoute role="client" />}>
            {/* Full-screen flows (no sidebar) */}
            <Route path="/events/:id/questionnaire" element={<QuestionnairePage />} />

            <Route element={<ClientLayout />}>
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
          <Route element={<ProtectedRoute role="admin" />}>
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
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        <Toaster />
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
