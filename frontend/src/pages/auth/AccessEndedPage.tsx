import { useNavigate } from 'react-router-dom'
import { AuthHeading } from '@/components/auth/AuthFields'
import { useAuthStore } from '@/stores/authStore'

const COPY: Record<string, string> = {
  ACCESS_EXPIRED: 'Your access period has ended. Your consultant can extend it for you.',
  ACCESS_REVOKED: 'Your access has been turned off. Please contact your Elation consultant.',
  NO_PROFILE: "This sign-in isn't linked to an Elation account yet. Please contact Elation.",
}

/** Shown when the session is valid but the backend refuses access. */
export function AccessEndedPage() {
  const navigate = useNavigate()
  const { blockedCode, signOut } = useAuthStore()

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <>
      <AuthHeading
        title="Access unavailable"
        subtitle={COPY[blockedCode ?? ''] ?? 'Please contact your Elation consultant.'}
      />
      <button
        type="button"
        onClick={handleSignOut}
        className="text-blush-deep text-sm font-semibold hover:underline"
      >
        Sign out
      </button>
    </>
  )
}
