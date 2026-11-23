// Reproducible code-native desktop icon. Run after `npm run build`.
// This script uses an isolated Electron profile and never touches real collections.
const fs = require('node:fs/promises')
const path = require('node:path')
const { launchElectronApp } = require('../lib/electron-harness.cjs')
const { createTempProfile, removeTempProfile } = require('../lib/profile.cjs')

const PROFILE_PREFIX = 'icon-profile-'

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profile = await createTempProfile(root, PROFILE_PREFIX)
  let app
  try {
    app = await launchElectronApp({ root, profile, background: false })
    const page = await app.firstWindow(),
      svg = await fs.readFile(path.join(root, 'resources/icon.svg'), 'utf8')
    const image = await page.evaluate(async (svg) => {
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + btoa(svg)
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      canvas.getContext('2d').drawImage(img, 0, 0, 512, 512)
      return canvas.toDataURL('image/png').split(',')[1]
    }, svg)
    await fs.writeFile(path.join(root, 'resources/icon.png'), Buffer.from(image, 'base64'))
  } finally {
    try {
      if (app) await app.close()
    } finally {
      await removeTempProfile(root, profile, PROFILE_PREFIX)
    }
  }
})().catch((error) => {
  process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n')
  process.exitCode = 1
})
