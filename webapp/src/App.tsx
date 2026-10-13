import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { ClientLayout } from '@/layouts/ClientLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { ProtectedRoute } from '@/layouts/ProtectedRoute'
import { AuthPage } from '@/pages/AuthPage'
import { AccessEndedPage } from '@/pages/AccessEndedPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
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
import { BookConsultationPage } from '@/pages/BookConsultationPage'
import { AdminOnly } from '@/layouts/AdminLayout'
import { OverviewPage } from '@/pages/admin/OverviewPage'
import { ClientsPage } from '@/pages/admin/ClientsPage'
import { ClientDetailPage } from '@/pages/admin/ClientDetailPage'
import { QuotesPage } from '@/pages/admin/QuotesPage'
import { InquiriesPage } from '@/pages/admin/InquiriesPage'
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage'
import { InventoryAdminPage } from '@/pages/admin/InventoryAdminPage'
import { InspirationsAdminPage } from '@/pages/admin/InspirationsAdminPage'
import { ArSetsAdminPage } from '@/pages/admin/ArSetsAdminPage'
import { TeamPage } from '@/pages/admin/TeamPage'
import { SettingsAdminPage } from '@/pages/admin/SettingsAdminPage'

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<Navigate to="/auth?mode=signin" replace />} />
          <Route path="/signup" element={<Navigate to="/auth?mode=activate" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/access-ended" element={<AccessEndedPage />} />
          <Route path="/book-consultation" element={<BookConsultationPage />} />

          {/* Client area — client accounts only (staff land in /admin) */}
          <Route element={<ProtectedRoute roles={['client']} />}>
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

          {/* Admin area — staff only */}
          <Route element={<ProtectedRoute roles={['consultant', 'admin']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="messages" element={<MessagesPage className="h-[calc(100vh-57px)] md:h-screen" />} />
              <Route path="quotes" element={<QuotesPage />} />
              <Route path="inquiries" element={<InquiriesPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="inventory" element={<InventoryAdminPage />} />
              <Route path="inspirations" element={<InspirationsAdminPage />} />
              <Route path="ar" element={<ArSetsAdminPage />} />
              <Route path="team" element={<AdminOnly><TeamPage /></AdminOnly>} />
              <Route path="settings" element={<AdminOnly><SettingsAdminPage /></AdminOnly>} />
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
