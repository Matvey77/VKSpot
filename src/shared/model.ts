import { z } from 'zod'
import { defaultMatchingRules } from './defaults'
import type {
  Archive,
  Collection,
  Completeness,
  CompletenessReason,
  ExportFormat,
  LocalFile,
  MatchingRules,
  RawTrack,
  Settings,
  SpotifyTrack,
  TrackRow,
  Working,
} from './types'

export type * from './types'
export type * from './ipc'

export const exportFormatSchema = z.enum([
  'archive',
  'raw-json',
  'csv',
  'm3u8',
  'plan',
]) satisfies z.ZodType<ExportFormat>

export const rawTrackSchema = z.object({
  id: z.string().max(500).default(''),
  artist: z.string().max(2000).default(''),
  title: z.string().max(2000).default(''),
  duration: z.number().finite().nonnegative().nullable().default(null),
  availability: z.enum(['available', 'blocked', 'unknown']).default('unknown'),
  url: z.string().max(4000).default(''),
  rawText: z.string().max(10000).default(''),
}) satisfies z.ZodType<RawTrack>

export const spotifyTrackSchema = z.object({
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/),
  title: z.string().max(2000),
  artists: z.array(z.string().max(1000)).max(100),
  duration: z.number().finite().nonnegative(),
  url: z.string().max(4000),
  album: z.string().max(2000).default(''),
}) satisfies z.ZodType<SpotifyTrack>

export const localFileSchema = z.object({
  path: z.string().max(4096),
  sha256: z.string().max(128),
  artist: z.string().max(2000),
  title: z.string().max(2000),
  duration: z.number().finite().nonnegative().nullable(),
  codec: z.string().max(200),
  bitrate: z.number().finite().nonnegative().nullable(),
  size: z.number().int().nonnegative(),
}) satisfies z.ZodType<LocalFile>

export const workingSchema = z.object({
  artist: z.string().max(2000),
  title: z.string().max(2000),
  version: z.string().max(1000).default(''),
  excluded: z.boolean().default(false),
  note: z.string().max(5000).default(''),
  spotify: spotifyTrackSchema.nullable().default(null),
  local: localFileSchema.nullable().default(null),
  destination: z.enum(['unresolved', 'spotify', 'local']).default('unresolved'),
  candidates: z.array(spotifyTrackSchema).max(100).default([]),
  searchedQuery: z.string().max(2000).nullable().default(null),
  localPending: z.boolean().default(false),
  reviewDeferred: z.boolean().default(false),
}) satisfies z.ZodType<Working>

const archivedWorkingSchema = workingSchema.superRefine((value, ctx) => {
  if (value.destination === 'spotify' && !value.spotify) {
    ctx.addIssue({
      code: 'custom',
      path: ['spotify'],
      message: 'Назначение Spotify требует сохранённый трек Spotify.',
    })
  }
  if (value.destination === 'local' && !value.local) {
    ctx.addIssue({
      code: 'custom',
      path: ['local'],
      message: 'Локальное назначение требует привязанный файл.',
    })
  }
})

// Partial commands must not apply defaults to omitted fields (Zod 4).
export const workingPatchSchema = z
  .object({
    artist: z.string().max(2000).optional(),
    title: z.string().max(2000).optional(),
    version: z.string().max(1000).optional(),
    excluded: z.boolean().optional(),
    note: z.string().max(5000).optional(),
    spotify: spotifyTrackSchema.nullable().optional(),
    local: localFileSchema.nullable().optional(),
    destination: z.enum(['unresolved', 'spotify', 'local']).optional(),
    candidates: z.array(spotifyTrackSchema).max(100).optional(),
    searchedQuery: z.string().max(2000).nullable().optional(),
    localPending: z.boolean().optional(),
    reviewDeferred: z.boolean().optional(),
  })
  .strict()

export const rowSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().positive(),
  source: rawTrackSchema,
  working: workingSchema,
}) satisfies z.ZodType<TrackRow>

const archivedRowSchema = rowSchema.extend({
  working: archivedWorkingSchema,
})

export const completenessReasonSchema = z.enum([
  'verified',
  'end-of-list',
  'count-mismatch',
  'cancelled',
  'timeout',
  'gap',
  'page-changed',
  'limit',
  'file-import',
  'unknown',
]) satisfies z.ZodType<CompletenessReason>

export const completenessSchema = z.object({
  expected: z.number().int().nonnegative().nullable().default(null),
  status: z.enum(['verified-count', 'unverified']).default('unverified'),
  message: z.string().max(4000).default('Полнота исходной коллекции не подтверждена.'),
  reason: completenessReasonSchema.optional(),
}) satisfies z.ZodType<Completeness>

export const collectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  importedAt: z.string().max(100),
  origin: z.string().max(200),
  completeness: completenessSchema,
  sourceHash: z.string().max(128),
  rows: z.array(rowSchema).max(200_000),
}) satisfies z.ZodType<Collection>

export const archiveSchema = z.object({
  format: z.literal('vkspot'),
  version: z.literal(1),
  collection: collectionSchema.extend({
    rows: z.array(archivedRowSchema).max(200_000),
  }),
}) satisfies z.ZodType<Archive>

export const matchingRulesSchema = z.object({
  diacritics: z.boolean().default(true),
  homoglyphs: z.boolean().default(true),
  featDeduplication: z.boolean().default(true),
  identicalVersions: z.boolean().default(true),
  remixPunctuation: z.boolean().default(true),
  extendedDurationTolerance: z.boolean().default(true),
  transliteration: z.boolean().default(true),
}) satisfies z.ZodType<MatchingRules>

export const proxySchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return (
        ['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password &&
        (!url.pathname || url.pathname === '/') &&
        !url.search &&
        !url.hash
      )
    } catch {
      return false
    }
  }, 'Укажи HTTP или SOCKS5 адрес прокси без логина, пароля и пути.')
  .default('')

export const settingsSchema = z.object({
  clientId: z.string().max(100),
  spotifyProxy: proxySchema,
  useProxyForVK: z.boolean().default(false),
  vkProxy: proxySchema,
  matchingRules: matchingRulesSchema.default(defaultMatchingRules),
  playlistName: z.string().trim().min(1).max(200),
  searchDelayMs: z.number().int().min(1000).max(60000),
  autoResumeSearch: z.boolean().default(true),
  searchProvider: z.enum(['browser', 'api']).default('browser'),
  theme: z.enum(['light', 'dark']),
}) satisfies z.ZodType<Settings>
