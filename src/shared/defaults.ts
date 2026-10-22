import type { MatchingRules } from './model'

/** Runtime defaults are schema-free so the renderer does not bundle server validators. */
export const defaultMatchingRules: MatchingRules = {
  diacritics: true,
  homoglyphs: true,
  featDeduplication: true,
  identicalVersions: true,
  remixPunctuation: true,
  extendedDurationTolerance: true,
  transliteration: true,
}
