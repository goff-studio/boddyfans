import { Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { PanelBoundary } from './auth/PanelBoundary'
import { RequireRole } from './auth/RequireRole'
import { LoginScreen } from './screens/LoginScreen'
import { AdminBookingsScreen } from './screens/AdminBookingsScreen'
import { AdminBookingScreen } from './screens/AdminBookingScreen'
import { ClientChatScreen } from './screens/ClientChatScreen'

/**
 * Everything that needs Firebase, in one module.
 *
 * App.tsx imports this lazily behind a build-time constant, so two things fall
 * out: the marketing entry chunk never contains Firebase, and the embedded
 * single-file build drops it entirely (the branch folds to dead code, and that
 * build has no network to reach Firebase with anyway).
 *
 * The marketing routes are passed in rather than declared here so that every
 * route still lives in one flat `Routes` — React Router's ranking is what makes
 * `/login` win over `/:slug`, and that only works within a single block.
 */
export default function PanelRoutes({ marketing }: { marketing: ReactNode }) {
  return (
    <PanelBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route
            path="/admin"
            element={
              <RequireRole allow={['admin']}>
                <AdminBookingsScreen />
              </RequireRole>
            }
          />
          <Route
            path="/admin/bookings/:id"
            element={
              <RequireRole allow={['admin']}>
                <AdminBookingScreen />
              </RequireRole>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireRole allow={['client', 'admin']}>
                <ClientChatScreen />
              </RequireRole>
            }
          />
          {marketing}
          </Routes>
      </AuthProvider>
    </PanelBoundary>
  )
}
