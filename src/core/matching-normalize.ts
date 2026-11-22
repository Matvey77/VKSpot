import { defaultMatchingRules, type MatchingRules } from '../shared/defaults'

export const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  х: 'x',
  у: 'y',
  і: 'i',
  ј: 'j',
}

export const TRANSLIT_RU_TO_EN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export const LATIN_VERSION_RE =
  /(?:^|[^\p{L}\p{N}])(remix|rmx|mix|edit|mash[\s-]*up|cover|live|sped[\s-]*up|sped|speed[\s-]*up|speedup|slowed|slow[\s-]*down|remaster(?:ed)?|instrumental|acoustic|rework|bootleg|vip)(?=$|[^\p{L}\p{N}])/giu

export const CYRILLIC_VERSION_RE =
  /(?:^|[^\p{L}\p{N}])(ремикс\p{L}*|кавер|лайв|ремастер\p{L}*|м[эе]ш[\s-]*ап\p{L}*|ускоренн\p{L}*|замедленн\p{L}*|инструментал\p{L}*|акусти(?:ч|к)\p{L}*)(?=$|[^\p{L}\p{N}])/giu

export const REMIX_LATIN_RE = /(?:^|[^\p{L}\p{N}])(?:remix|rmx)(?=$|[^\p{L}\p{N}])/iu
export const REMIX_CYRILLIC_RE =
  /(?:^|[^\p{L}\p{N}])(?:remix|rmx|ремикс\p{L}*)(?=$|[^\p{L}\p{N}])/iu
export const BRACKET_TAG_RE = /\[([^\]]+)\]/g
export const STANDARD_TAG_RE =
  /(?:^|[^\p{L}\p{N}])(?:version|prod\.?|produced|beat|версия)(?=$|[^\p{L}\p{N}])/iu
export const FEAT_PREFIX_RE = /^(?:feat\.?|ft\.?|with)\s+/i
export const CYRILLIC_RE = /[а-яё]/i
export const TRIM_VERSION_PUNCT_RE = /^[()[\]\-–—\s]+|[()[\]\-–—\s]+$/g
export const WHITESPACE_RE = /\s+/g

const BACKTICK_RE = /`/g
const QUOTES_RE = /[’‘`]/g
const DASHES_RE = /[‐‑–—]/g
const HOMOGLYPH_RE = /[авекмнорстхуіј]/g
const NFD_YI_YO_RE = /([\u0418\u0438])\u0306|([\u0415\u0435])\u0308|[\u0300-\u036f]/g
const NFD_YI_RE = /([\u0418\u0438])\u0306|[\u0300-\u036f]/g
const CYRILLIC_BLOCK_RE = /\p{Script=Cyrillic}/u
const CYRILLIC_CHAR_RE = /[а-яё]/g

const DIGRAPH_DJ_RE = /дж/g
const DIGRAPH_KS_RE = /кс/g
const LETTER_SHCH_RE = /щ/g
const LETTER_SH_RE = /ш/g
const LETTER_CH_RE = /ч/g
const LETTER_ZH_RE = /ж/g
const LETTER_KH_RE = /х/g
const LETTER_TS_RE = /ц/g
const LETTER_YU_RE = /ю/g
const LETTER_YA_RE = /я/g
const LETTER_YO_RE = /ё/g

const TRANSLIT_KH_RE = /kh/g
const TRANSLIT_YA_RE = /ya/g
const TRANSLIT_YU_RE = /yu/g
const TRANSLIT_ENDING_RE = /(?:iy|yy|ij)(?=\s|$)/g

const RELAX_PUNCT_RE = /[()[\]-]/g
const SPLIT_FEATURE_ARTISTS_RE = /\s*(?:,|&|;|\+|\s+[xX]\s+)\s*/
const SPLIT_ARTISTS_LIST_RE = /\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i
const FEAT_BRACKET_RE = /\s*[([](?:feat\.?|ft\.?|with)\s+([^\])]+)[\])]/gi
const PROD_BRACKET_RE = /\s*[([](?:prod\.?|produced|beat)\s*(?:by\s+)?([^\])]+)[\])]/gi
const FEAT_INLINE_RE =
  /\s+(?:feat\.?|ft\.?)\s+(.+?)(?=\s*[([\]]|\s+[-–—]\s+|\s+(?:prod\.?|produced|beat)\b|$)/gi
const PROD_INLINE_RE =
  /\s+(?:prod\.?|produced|beat)\s+(?:by\s+)?(.+?)(?=\s*[([\]]|\s+[-–—]\s+|\s+(?:feat\.?|ft\.?)\b|$)/gi

const WORD_START_RE = /^[\p{L}\p{N}]/u
const WORD_END_RE = /[\p{L}\p{N}]$/u
const WORD_CHAR_RE = /^[\p{L}\p{N}]$/u

const TOKEN_REMIX_RE = /^(?:remix|rmx|ремикс)/u
const TOKEN_COVER_RE = /^(?:cover|кавер)/u
const TOKEN_LIVE_RE = /^(?:live|лайв)/u
const TOKEN_REMASTER_RE = /^(?:remaster|ремастер)/u
const TOKEN_MASHUP_RE = /^(?:mash|м[эе]ш)/u
const TOKEN_SPED_UP_RE = /^(?:sped|speed|ускоренн)/u
const TOKEN_SLOWED_RE = /^(?:slow|замедленн)/u
const TOKEN_INSTRUMENTAL_RE = /^(?:instrumental|инструментал)/u
const TOKEN_ACOUSTIC_RE = /^(?:acoustic|акусти)/u

export function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) return true
  }
  return false
}

/** Encodes active MatchingRules flags as a 7-bit integer (0..127) with zero allocations. */
export function matchingRulesMask(rules: MatchingRules): number {
  return (
    (rules.diacritics ? 1 : 0) |
    (rules.homoglyphs ? 2 : 0) |
    (rules.featDeduplication ? 4 : 0) |
    (rules.identicalVersions ? 8 : 0) |
    (rules.remixPunctuation ? 16 : 0) |
    (rules.extendedDurationTolerance ? 32 : 0) |
    ((rules.transliteration ?? true) ? 64 : 0)
  )
}

export function transliterateRuToEn(str: string): string {
  return str
    .replace(DIGRAPH_DJ_RE, 'j')
    .replace(DIGRAPH_KS_RE, 'x')
    .replace(LETTER_SHCH_RE, 'shch')
    .replace(LETTER_SH_RE, 'sh')
    .replace(LETTER_CH_RE, 'ch')
    .replace(LETTER_ZH_RE, 'zh')
    .replace(LETTER_KH_RE, 'kh')
    .replace(LETTER_TS_RE, 'ts')
    .replace(LETTER_YU_RE, 'yu')
    .replace(LETTER_YA_RE, 'ya')
    .replace(LETTER_YO_RE, 'yo')
    .replace(CYRILLIC_CHAR_RE, (ch) =>
      TRANSLIT_RU_TO_EN[ch] !== undefined ? TRANSLIT_RU_TO_EN[ch] : ch,
    )
}

export const normalizeTranslit = (s: string): string =>
  s
    .replace(TRANSLIT_KH_RE, 'h')
    .replace(TRANSLIT_YA_RE, 'ia')
    .replace(TRANSLIT_YU_RE, 'iu')
    .replace(TRANSLIT_ENDING_RE, 'y')

function foldConfusables(s: string): string {
  return s.replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] || c)
}

function normalizeInternal(
  value: string,
  diacritics: boolean,
  homoglyphs: boolean,
  preserveYo: boolean,
): string {
  const nonAscii = hasNonAscii(value)
  if (!nonAscii) {
    let res = value.toLowerCase().replace(WHITESPACE_RE, ' ').trim()
    if (res.includes('`')) res = res.replace(BACKTICK_RE, "'")
    return res
  }
  let res = value
  if (diacritics) {
    const nfd = res.normalize('NFD')
    // Preserve Russian й/Й (distinct letter) and optionally ё/Ё for transliteration while stripping diacritics.
    res = (
      preserveYo
        ? nfd.replace(NFD_YI_YO_RE, (_match, yi: string | undefined, yo: string | undefined) =>
            yi
              ? yi === '\u0418'
                ? '\u0419'
                : '\u0439'
              : yo
                ? yo === '\u0415'
                  ? '\u0401'
                  : '\u0451'
                : '',
          )
        : nfd.replace(NFD_YI_RE, (_match, yi: string | undefined) =>
            yi ? (yi === '\u0418' ? '\u0419' : '\u0439') : '',
          )
    ).normalize('NFKC')
  }
  res = res
    .toLowerCase()
    .replace(QUOTES_RE, "'")
    .replace(DASHES_RE, '-')
    .replace(WHITESPACE_RE, ' ')
    .trim()
  if (homoglyphs) {
    res = foldConfusables(res)
  }
  return res
}

export const normalized = (value: string, rules: MatchingRules = defaultMatchingRules): string =>
  normalizeInternal(value, rules.diacritics, rules.homoglyphs, false)

export const normalizeWithoutHomoglyphs = (
  value: string,
  rules: MatchingRules = defaultMatchingRules,
): string => normalizeInternal(value, rules.diacritics, false, false)

export const normalizeForTranslit = (
  value: string,
  rules: MatchingRules = defaultMatchingRules,
): string => normalizeInternal(value, rules.diacritics, false, true)

export const relaxPunctuation = (s: string): string =>
  s.replace(RELAX_PUNCT_RE, ' ').replace(WHITESPACE_RE, ' ').trim()

export function extractFeatures(title: string): {
  baseTitle: string
  featured: string[]
  producers: string[]
} {
  const featured: string[] = []
  const producers: string[] = []
  let base = title

  const splitArtists = (s: string) => s.split(SPLIT_FEATURE_ARTISTS_RE)

  base = base.replace(FEAT_BRACKET_RE, (_, guests: string) => {
    featured.push(...splitArtists(guests))
    return ''
  })
  base = base.replace(PROD_BRACKET_RE, (_, prods: string) => {
    producers.push(...splitArtists(prods))
    return ''
  })
  base = base.replace(FEAT_INLINE_RE, (_, guests: string) => {
    featured.push(...splitArtists(guests))
    return ''
  })
  base = base.replace(PROD_INLINE_RE, (_, prods: string) => {
    producers.push(...splitArtists(prods))
    return ''
  })
  return {
    baseTitle: base.trim(),
    featured: featured.map((s) => s.trim()).filter(Boolean),
    producers: producers.map((s) => s.trim()).filter(Boolean),
  }
}

export function splitArtistsList(
  value: string[],
  rules: MatchingRules = defaultMatchingRules,
): string[] {
  return [
    ...new Set(
      value
        .flatMap((item) => item.split(SPLIT_ARTISTS_LIST_RE))
        .map((a) => normalized(a, rules))
        .filter(Boolean),
    ),
  ].sort()
}

function codePointBefore(value: string, index: number): string {
  const low = value.charCodeAt(index - 1)
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = value.charCodeAt(index - 2)
    if (high >= 0xd800 && high <= 0xdbff) return value.slice(index - 2, index)
  }
  return value[index - 1]
}

function codePointAtPos(value: string, index: number): string {
  const cp = value.codePointAt(index)
  return cp === undefined ? '' : String.fromCodePoint(cp)
}

export function hasTokenPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false
  const needLeftBoundary = WORD_START_RE.test(phrase)
  const needRightBoundary = WORD_END_RE.test(phrase)
  let pos = haystack.indexOf(phrase)
  while (pos !== -1) {
    const leftOk =
      !needLeftBoundary || pos === 0 || !WORD_CHAR_RE.test(codePointBefore(haystack, pos))
    if (leftOk) {
      const end = pos + phrase.length
      const rightOk =
        !needRightBoundary ||
        end === haystack.length ||
        !WORD_CHAR_RE.test(codePointAtPos(haystack, end))
      if (rightOk) return true
    }
    pos = haystack.indexOf(phrase, pos + 1)
  }
  return false
}

export function canonicalVersionToken(raw: string): string {
  if (TOKEN_REMIX_RE.test(raw)) return 'remix'
  if (TOKEN_COVER_RE.test(raw)) return 'cover'
  if (TOKEN_LIVE_RE.test(raw)) return 'live'
  if (TOKEN_REMASTER_RE.test(raw)) return 'remaster'
  if (TOKEN_MASHUP_RE.test(raw)) return 'mashup'
  if (TOKEN_SPED_UP_RE.test(raw)) return 'sped_up'
  if (TOKEN_SLOWED_RE.test(raw)) return 'slowed'
  if (TOKEN_INSTRUMENTAL_RE.test(raw)) return 'instrumental'
  if (TOKEN_ACOUSTIC_RE.test(raw)) return 'acoustic'
  return raw
}

export function extractVersionTokens(
  text: string,
  rules: MatchingRules = defaultMatchingRules,
  precomputedLatinNorm?: string,
): Set<string> {
  const tokens = new Set<string>()
  const latinNorm = precomputedLatinNorm ?? normalized(text, rules)
  for (const match of latinNorm.matchAll(LATIN_VERSION_RE)) {
    tokens.add(canonicalVersionToken(match[1]))
  }
  if (hasNonAscii(text) && CYRILLIC_BLOCK_RE.test(text)) {
    const cyrillicNorm = rules.homoglyphs ? normalizeWithoutHomoglyphs(text, rules) : latinNorm
    for (const match of cyrillicNorm.matchAll(CYRILLIC_VERSION_RE)) {
      tokens.add(canonicalVersionToken(match[1]))
    }
  }
  return tokens
}
