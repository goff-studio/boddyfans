import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { useState } from 'react'
import { ScreenTransition } from './motion/ScreenTransition'
import { HubScreen } from './screens/HubScreen'
import { TrackScreen } from './screens/TrackScreen'
import { Menu } from './components/Menu'
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/inter-tight/wght-italic.css'
import '@fontsource-variable/inter'
import './index.css'

function Shell() {
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

  const chrome = {
    menuOpen,
    onOpenMenu: () => setMenuOpen((v) => !v),
  }

  return (
    <>
      <Routes>
        <Route element={<ScreenTransition />}>
          <Route path="/" element={<HubScreen {...chrome} />} />
          <Route path="/:slug" element={<TrackScreen {...chrome} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}

/**
 * The single-file build (npm run build:artifact) is opened from a sandboxed
 * host with no server rewrites, so history routing has nothing to rewrite
 * deep links against. Hash routing keeps every screen linkable there while
 * the normal build keeps clean paths.
 */
const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <Shell />
    </Router>
  )
}
