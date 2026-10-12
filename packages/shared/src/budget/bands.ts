/**
 * Questionnaire Q121 budget bands → a representative PKR figure, used when a
 * client picks a band but hasn't typed an exact budget (docs/step-04-events.md).
 */
export const BUDGET_BAND_MIDPOINTS: Record<string, number> = {
  'Under PKR 250,000': 200_000,
  'PKR 250,000–500,000': 375_000,
  'PKR 500,000–1M': 750_000,
  'PKR 1M–2M': 1_500_000,
  'PKR 2M–5M': 3_500_000,
  'PKR 5M+': 7_500_000,
}
