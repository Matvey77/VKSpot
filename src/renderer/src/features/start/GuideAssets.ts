import records from '../../assets/guide/captures.json'
import sourceLight from '../../assets/guide/source-light.webp'
import sourceDark from '../../assets/guide/source-dark.webp'
import archiveLight from '../../assets/guide/archive-light.webp'
import archiveDark from '../../assets/guide/archive-dark.webp'
import originalLight from '../../assets/guide/edit-original-light.webp'
import originalDark from '../../assets/guide/edit-original-dark.webp'
import editLight from '../../assets/guide/edit-light.webp'
import editDark from '../../assets/guide/edit-dark.webp'
import connectLight from '../../assets/guide/spotify-connect-light.webp'
import connectDark from '../../assets/guide/spotify-connect-dark.webp'
import searchLight from '../../assets/guide/spotify-search-light.webp'
import searchDark from '../../assets/guide/spotify-search-dark.webp'
import bulkLight from '../../assets/guide/spotify-bulk-light.webp'
import bulkDark from '../../assets/guide/spotify-bulk-dark.webp'
import matchLight from '../../assets/guide/spotify-match-light.webp'
import matchDark from '../../assets/guide/spotify-match-dark.webp'
import linkLight from '../../assets/guide/local-link-light.webp'
import linkDark from '../../assets/guide/local-link-dark.webp'
import prepareLight from '../../assets/guide/local-prepare-light.webp'
import prepareDark from '../../assets/guide/local-prepare-dark.webp'
import planLight from '../../assets/guide/transfer-plan-light.webp'
import planDark from '../../assets/guide/transfer-plan-dark.webp'
import transferLight from '../../assets/guide/transfer-light.webp'
import transferDark from '../../assets/guide/transfer-dark.webp'

export type GuideMark = {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export type GuideCapture = {
  key: string
  theme: 'light' | 'dark'
  width: number
  height: number
  marks: GuideMark[]
  src: string
}

const images: Record<string, { light: string; dark: string }> = {
  source: { light: sourceLight, dark: sourceDark },
  archive: { light: archiveLight, dark: archiveDark },
  'edit-original': { light: originalLight, dark: originalDark },
  edit: { light: editLight, dark: editDark },
  'spotify-connect': { light: connectLight, dark: connectDark },
  'spotify-search': { light: searchLight, dark: searchDark },
  'spotify-bulk': { light: bulkLight, dark: bulkDark },
  'spotify-match': { light: matchLight, dark: matchDark },
  'local-link': { light: linkLight, dark: linkDark },
  'local-prepare': { light: prepareLight, dark: prepareDark },
  'transfer-plan': { light: planLight, dark: planDark },
  transfer: { light: transferLight, dark: transferDark },
}

export function guideCapture(key: string, theme: 'light' | 'dark'): GuideCapture {
  const record = records.find((r) => r.key === key && r.theme === theme)
  if (!record || !images[key]) throw new Error('Не найден снимок инструкции: ' + key)
  return {
    key: record.key,
    theme,
    width: record.width,
    height: record.height,
    marks: record.marks,
    src: images[key][theme],
  }
}
