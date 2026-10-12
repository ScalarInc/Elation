import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme'
import { hydrateMocks } from './mocks/hydrate'
import { queryClient } from './lib/api/query-client'

initTheme()
// Demo questionnaire answers only when running without the server.
if (import.meta.env.VITE_API_MODE === 'mock') hydrateMocks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
