import records from './assets/guide/captures.json'
import sourceLight from './assets/guide/source-light.png'
import sourceDark from './assets/guide/source-dark.png'
import archiveLight from './assets/guide/archive-light.png'
import archiveDark from './assets/guide/archive-dark.png'
import originalLight from './assets/guide/edit-original-light.png'
import originalDark from './assets/guide/edit-original-dark.png'
import editLight from './assets/guide/edit-light.png'
import editDark from './assets/guide/edit-dark.png'
import connectLight from './assets/guide/spotify-connect-light.png'
import connectDark from './assets/guide/spotify-connect-dark.png'
import searchLight from './assets/guide/spotify-search-light.png'
import searchDark from './assets/guide/spotify-search-dark.png'
import bulkLight from './assets/guide/spotify-bulk-light.png'
import bulkDark from './assets/guide/spotify-bulk-dark.png'
import matchLight from './assets/guide/spotify-match-light.png'
import matchDark from './assets/guide/spotify-match-dark.png'
import linkLight from './assets/guide/local-link-light.png'
import linkDark from './assets/guide/local-link-dark.png'
import prepareLight from './assets/guide/local-prepare-light.png'
import prepareDark from './assets/guide/local-prepare-dark.png'
import planLight from './assets/guide/transfer-plan-light.png'
import planDark from './assets/guide/transfer-plan-dark.png'
import transferLight from './assets/guide/transfer-light.png'
import transferDark from './assets/guide/transfer-dark.png'

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
export function guideCapture(key: string, theme: 'light' | 'dark') {
  const record = records.find((r) => r.key === key && r.theme === theme)
  if (!record || !images[key]) throw new Error('Не найден снимок инструкции: ' + key)
  return { ...record, src: images[key][theme] }
}
