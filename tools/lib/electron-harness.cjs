const { _electron } = require('@playwright/test')

async function launchElectronApp({ root, profile, executablePath, background = true }) {
  const env = { ...process.env, VKSPOT_DATA_DIR: profile }
  if (background) {
    env.VKSPOT_BACKGROUND_TEST = '1'
  } else {
    delete env.VKSPOT_BACKGROUND_TEST
  }
  delete env.ELECTRON_RUN_AS_NODE

  return _electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [] : [root],
    env,
  })
}

module.exports = { launchElectronApp }
