import { useQuestionnaire } from '@/stores/questionnaireStore'
import { questionnaireSeeds } from './questionnaireSeed'

/** Seed the questionnaire store with pre-answered data for the mock events.
 *  Called once at app boot. Idempotent — won't wipe user edits. */
export function hydrateMocks() {
  const { seedEventIfEmpty } = useQuestionnaire.getState()
  for (const [eventId, seed] of Object.entries(questionnaireSeeds)) {
    seedEventIfEmpty(eventId, seed.answers, seed.elationDecides)
  }
}
