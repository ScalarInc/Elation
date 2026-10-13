export * from './types'
export * from './schema'
export * from './progress'
export * from './validate'

/** Bump whenever question ids or options change. Stored on every saved response. */
export const QUESTIONNAIRE_SCHEMA_VERSION = 2 // v2: all 134 questions; q13-q17 renumbered to match the docx
