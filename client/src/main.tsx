import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled, not fetched from Google Fonts — same reasoning as the self-hosted Scalar assets
// in task [34]: no third-party request on load, works under a strict CSP and with no outbound
// internet, and no visitor IPs leaked to a font host. Each file carries every subset behind a
// `unicode-range`, so the browser downloads only the ones a page actually uses.
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'

import './styles/theme.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
