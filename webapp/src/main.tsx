import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme'
import { queryClient } from './lib/api/query-client'
import { API_MODE } from './lib/api/client'
import { initMonitoring } from './lib/monitoring'

initTheme()
void initMonitoring()
// Demo questionnaire answers only when running without the server (never in production).
if (API_MODE === 'mock') void import('@/mocks/hydrate').then((m) => m.hydrateMocks())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
