import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession, type Role } from './session'

/**
 * Route guard. Cosmetic only — firestore.rules is the real gate, and this just
 * avoids rendering a panel that would fail every read.
 *
 * Waits for `ready` before deciding. Redirecting on the first render would
 * bounce a signed-in user to the login screen every refresh, because Firebase
 * restores the session asynchronously.
 */
export function RequireRole({
  allow,
  children,
}: {
  allow: Role[]
  children: ReactNode
}) {
  const { role, ready, user } = useSession()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="panelState">
        <p className="panelState__text">Checking your session…</p>
      </div>
    )
  }

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!allow.includes(role)) {
    // Signed in but not provisioned, or the wrong role. Distinguish these:
    // "no access" is actionable, "please log in" would be a lie.
    return (
      <div className="panelState">
        <h1 className="panelState__title">No access</h1>
        <p className="panelState__text">
          {role === 'none'
            ? 'This account has not been given access yet. Anna needs to set it up.'
            : 'This account cannot open that page.'}
        </p>
        <SignOutLink />
      </div>
    )
  }

  return <>{children}</>
}

function SignOutLink() {
  const { signOutNow } = useSession()
  return (
    <button type="button" className="ghostbtn" onClick={() => void signOutNow()}>
      <span>SIGN OUT</span>
    </button>
  )
}
