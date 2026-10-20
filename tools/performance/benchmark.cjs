// Reproducible performance probe. Only isolated synthetic records are used.
const { _electron, expect } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0

;(async () => {
  const root = path.resolve(__dirname, '../..')
  const profileRoot = path.join(root, '.local/tmp')
  await fs.mkdir(profileRoot, { recursive: true })
  const profile = await fs.mkdtemp(path.join(profileRoot, 'performance-'))
  const env = { ...process.env, VKSPOT_DATA_DIR: profile, VKSPOT_BACKGROUND_TEST: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.VKSPOT_TEST_EXECUTABLE
  const app = await _electron.launch({ executablePath, args: executablePath ? [] : [root], env })
  try {
    const page = await app.firstWindow()
    await page.evaluate(() => {
      window.__performanceProbe = { tasks: [], frames: [], running: false }
      new PerformanceObserver((list) => {
        window.__performanceProbe.tasks.push(...list.getEntries().map((entry) => entry.duration))
      }).observe({ type: 'longtask', buffered: true })
    })
    const count = Number(process.env.BENCHMARK_ROWS || 9000)
    if (!Number.isSafeInteger(count) || count < 1)
      throw new Error('BENCHMARK_ROWS must be a positive integer')
    const importStart = performance.now()
    const fixture = await page.evaluate(async (count) => {
      const imported = await window.vkspot.importCollection({
        name: 'Performance fixture',
        origin: 'Synthetic benchmark',
        completeness: { expected: count, status: 'verified-count', message: 'Synthetic records' },
        tracks: Array.from({ length: count }, (_, i) => ({
          id: `fixture-${i}`,
          artist: `Artist ${i % 100}`,
          title: `Song ${i + 1}`,
          duration: 180,
          rawText: 'Synthetic source evidence. '.repeat(12),
        })),
      })
      if (!imported.ok) throw new Error(imported.error)
      const state = await window.vkspot.state()
      if (!state.ok) throw new Error(state.error)
      // A real collection retains candidates for each searched row.
      const candidate = {
        uri: 'spotify:track:' + 'a'.repeat(22),
        title: 'Synthetic song',
        artists: ['Synthetic artist'],
        duration: 180,
        album: 'Synthetic album',
        url: '',
      }
      const collection = state.value.collections[0]
      const ids = collection.rows.map((row) => row.id)
      const patched = await window.vkspot.patchRows(imported.value, ids, {
        candidates: [candidate, { ...candidate, uri: 'spotify:track:' + 'b'.repeat(22) }],
        searchedQuery: null,
      })
      if (!patched.ok) throw new Error(patched.error)
      return { id: imported.value, ids }
    }, count)
    const importMs = performance.now() - importStart
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click()
    await page
      .locator('.collection-card')
      .first()
      .getByRole('button', { name: 'Открыть', exact: true })
      .click()
    await expect(page.getByRole('table')).toBeVisible()
    const transport = await page.evaluate(async () => {
      const timings = []
      let bytes = 0
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        const result = await window.vkspot.state()
        timings.push(performance.now() - start)
        if (i === 0) bytes = new TextEncoder().encode(JSON.stringify(result)).length
      }
      let sync = null
      if (window.vkspot.syncState) {
        const initial = await window.vkspot.syncState(null)
        if (!initial.ok) throw new Error(initial.error)
        const samples = []
        let deltaBytes = 0
        for (let i = 0; i < 5; i++) {
          const start = performance.now()
          const result = await window.vkspot.syncState(initial.value.cursor)
          samples.push(performance.now() - start)
          deltaBytes = new TextEncoder().encode(JSON.stringify(result)).length
        }
        sync = { samples, deltaBytes }
      }
      return { timings, bytes, sync }
    })
    await page.evaluate(() => {
      const probe = window.__performanceProbe
      probe.tasks = []
      probe.frames = []
      probe.running = true
      let previous = performance.now()
      const tick = (now) => {
        if (!probe.running) return
        probe.frames.push(now - previous)
        previous = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const patchTimes = await page.evaluate(async (fixture) => {
      const timings = []
      for (let i = 0; i < Math.min(12, fixture.ids.length); i++) {
        const start = performance.now()
        const result = await window.vkspot.patchRows(fixture.id, [fixture.ids[i]], {
          note: `Update ${i}`,
        })
        if (!result.ok) throw new Error(result.error)
        timings.push(performance.now() - start)
        await new Promise((resolve) => setTimeout(resolve, 180))
      }
      return timings
    }, fixture)
    const queryStart = performance.now()
    const queryRow = Math.min(count, 8999)
    await page
      .getByLabel('Найти запись', { exact: true })
      .pressSequentially(`Song ${queryRow}`, { delay: 30 })
    await expect(
      page.getByRole('row', { name: `Запись ${queryRow}: Song ${queryRow}`, exact: true }),
    ).toBeVisible()
    const queryMs = performance.now() - queryStart
    await page.getByLabel('Найти запись', { exact: true }).fill('')
    await page.getByRole('row').nth(1).click()
    await expect(page.locator('.inspector')).toBeVisible()
    const probe = await page.evaluate(() => {
      window.__performanceProbe.running = false
      return {
        ...window.__performanceProbe,
        renderedRows: document.querySelectorAll('.table-row').length,
      }
    })
    const report = {
      version: await app.evaluate(({ app }) => app.getVersion()),
      count,
      importMs,
      fullStateBytes: transport.bytes,
      stateMedianMs: percentile(transport.timings, 0.5),
      ...(transport.sync
        ? {
            syncBytes: transport.sync.deltaBytes,
            syncMedianMs: percentile(transport.sync.samples, 0.5),
          }
        : {}),
      patchMedianMs: percentile(patchTimes, 0.5),
      patchP95Ms: percentile(patchTimes, 0.95),
      queryMs,
      longTasks: probe.tasks.length,
      longTaskTotalMs: probe.tasks.reduce((a, b) => a + b, 0),
      longestTaskMs: Math.max(0, ...probe.tasks),
      frameP95Ms: percentile(probe.frames, 0.95),
      frameMaxMs: Math.max(0, ...probe.frames),
      renderedRows: probe.renderedRows,
    }
    const output = path.resolve(
      process.env.BENCHMARK_OUTPUT || path.join(root, '.local/performance/latest.json'),
    )
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await app.close()
    if (path.dirname(profile) !== profileRoot || !path.basename(profile).startsWith('performance-'))
      throw new Error('Unsafe cleanup')
    await fs.rm(profile, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
