import { createClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client. Used ONLY for authentication (and, later, the Realtime
 * message subscription). All data goes through the backend API in `@/api`.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
