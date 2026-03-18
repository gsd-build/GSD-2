#!/usr/bin/env node

import { exec as execCb } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cwd = resolve(__dirname, '..')
const shouldSkip =
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === 'true'

function run(cmd) {
  return new Promise((resolve) => {
    execCb(cmd, { cwd }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout, stderr })
    })
  })
}

if (!shouldSkip) {
  await run('npx playwright install chromium')
}
