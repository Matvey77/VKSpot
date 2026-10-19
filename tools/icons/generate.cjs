// Reproducible code-native desktop icon. Run after `npm run build`.
// This script uses an isolated Electron profile and never touches real collections.
const { _electron } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profileRoot = path.join(root, '.local/tmp')
  await fs.mkdir(profileRoot, { recursive: true })
  const profile = await fs.mkdtemp(path.join(profileRoot, 'icon-profile-'))
  const env = { ...process.env, VKSPOT_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ args: [root], env })
  try {
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
    await app.close()
    if (
      path.dirname(profile) !== profileRoot ||
      !path.basename(profile).startsWith('icon-profile-')
    )
      throw new Error('Unsafe icon profile cleanup target')
    await fs.rm(profile, { recursive: true, force: true })
  }
})().catch((error) => {
  process.stderr.write(error.stack)
  process.exitCode = 1
})
