import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

export function createTestProfile(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function cleanupTestProfile(
  directory: string,
  prefix: string,
  message = 'Unsafe test cleanup target',
): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error(message)
  await rm(target, { recursive: true, force: true })
}

export async function launchTestApp(directory: string): Promise<ElectronApplication> {
  const executablePath = process.env.VKSPOT_TEST_EXECUTABLE
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    VKSPOT_DATA_DIR: directory,
    VKSPOT_BACKGROUND_TEST: '1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  return electron.launch({
    ...(executablePath ? { executablePath } : {}),
    chromiumSandbox: true,
    args: executablePath ? [] : ['.'],
    env,
  })
}
