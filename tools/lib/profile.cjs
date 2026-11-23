const fs = require('node:fs/promises')
const path = require('node:path')

function resolveProfileRoot(root) {
  return path.resolve(root, '.local/tmp')
}

async function createTempProfile(root, prefix) {
  const profileRoot = resolveProfileRoot(root)
  await fs.mkdir(profileRoot, { recursive: true })
  return fs.mkdtemp(path.join(profileRoot, prefix))
}

async function removeTempProfile(root, profile, prefix) {
  if (!profile) return
  const profileRoot = resolveProfileRoot(root)
  const target = path.resolve(profile)
  if (path.dirname(target) !== profileRoot || !path.basename(target).startsWith(prefix)) {
    process.stderr.write(`Unsafe profile cleanup target: ${target}\n`)
    process.exitCode = 1
    return
  }
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Failed to clean up temp profile ${target}: ${message}\n`)
    process.exitCode = 1
  }
}

module.exports = { createTempProfile, removeTempProfile }
