import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { lazy, Suspense, useState } from 'react'
import { ScreenTransition } from './motion/ScreenTransition'
import { HubScreen } from './screens/HubScreen'
import { TrackScreen } from './screens/TrackScreen'
import { Menu } from './components/Menu'
import { useSeo } from './useSeo'
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/inter-tight/wght-italic.css'
import '@fontsource-variable/inter'
import './index.css'

/**
 * The single-file preview build has no network under the artifact CSP, so the
 * Firebase-backed routes cannot work there.
 *
 * Vite substitutes this at build time, so the ternary below folds to a constant
 * and Rollup drops the whole panel chunk from the embedded build. Declaring the
 * lazy imports at module scope instead would keep them in the graph however the
 * flag is set — which is exactly how Firebase ended up inside the artifact.
 */
const EMBEDDED = import.meta.env.VITE_EMBEDDED === '1'

const PanelRoutes = EMBEDDED ? null : lazy(() => import('./PanelRoutes'))

function Loading() {
  return (
    <div className="panelState">
      <p className="panelState__text">Loading…</p>
    </div>
  )
}

function Shell() {
  useSeo()

  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // A route change means the menu did its job. Derived during render rather
  // than in an effect, so it also covers browser back/forward — and never
  // paints one frame of an open menu over the screen it just left.
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }

  const chrome = { menuOpen, onOpenMenu: () => setMenuOpen((v) => !v) }

  // Kept as a fragment of <Route>s so the panel can splice them into its own
  // flat <Routes>: React Router ranks static paths above `/:slug`, but only
  // within one block.
  const marketing = (
    <>
      <Route element={<ScreenTransition />}>
        <Route path="/" element={<HubScreen {...chrome} />} />
        <Route path="/:slug" element={<TrackScreen {...chrome} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )

  return (
    <>
      {PanelRoutes ? (
        <Suspense fallback={<Loading />}>
          <PanelRoutes marketing={marketing} />
        </Suspense>
      ) : (
        <Routes>{marketing}</Routes>
      )}
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}

const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <Shell />
    </Router>
  )
}
