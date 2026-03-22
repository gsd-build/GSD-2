export type InitialGsdHeaderFilterResult =
  | { status: 'matched'; text: string }
  | { status: 'needs-more'; text: '' }
  | { status: 'passthrough'; text: string }

const MIN_LOGO_LINES = 6
const MAX_HEADER_PROBE_LINES = 16
const MAX_HEADER_PROBE_CHARS = 4096
const TITLE_PATTERN = /Get Shit Done v\d+\.\d+\.\d+/i

interface IndexedVisibleText {
  plainText: string
  rawOffsetsByPlainIndex: number[]
}

function indexVisibleText(raw: string): IndexedVisibleText {
  let plainText = ''
  const rawOffsetsByPlainIndex = [0]

  for (let i = 0; i < raw.length;) {
    const char = raw[i]

    if (char === '\u001b') {
      const next = raw[i + 1]

      if (next === '[') {
        i += 2
        while (i < raw.length && !/[A-~]/.test(raw[i])) i += 1
        if (i < raw.length) i += 1
        continue
      }

      if (next === ']') {
        i += 2
        while (i < raw.length) {
          if (raw[i] === '\u0007') {
            i += 1
            break
          }
          if (raw[i] === '\u001b' && raw[i + 1] === '\\') {
            i += 2
            break
          }
          i += 1
        }
        continue
      }

      if (next === 'P' || next === '^' || next === '_' || next === 'X') {
        i += 2
        while (i < raw.length) {
          if (raw[i] === '\u001b' && raw[i + 1] === '\\') {
            i += 2
            break
          }
          i += 1
        }
        continue
      }

      i += next ? 2 : 1
      continue
    }

    if (char === '\r') {
      i += 1
      continue
    }

    plainText += char
    i += 1
    rawOffsetsByPlainIndex[plainText.length] = i
  }

  return { plainText, rawOffsetsByPlainIndex }
}

function getPlainIndexAfterLine(plainText: string, lineCount: number): number | null {
  if (lineCount === 0) return 0

  let seenNewlines = 0
  for (let i = 0; i < plainText.length; i += 1) {
    if (plainText[i] !== '\n') continue
    seenNewlines += 1
    if (seenNewlines === lineCount) {
      return i + 1
    }
  }

  return null
}

function isBlank(line: string | undefined): boolean {
  return !line || line.trim().length === 0
}

function isLogoLine(line: string | undefined): boolean {
  return !!line && /[█╔╗╚╝║═]/.test(line)
}

/**
 * Strip the decorative GSD startup banner from the beginning of a PTY stream.
 *
 * Power User Mode now renders both panes without a separate wrapper header. The
 * main-session pane never replays the native banner reliably, while the right
 * PTY pane often does. This filter removes only the initial branded banner from
 * the PTY attach stream so both panes start on real terminal content.
 */
export function filterInitialGsdHeader(raw: string): InitialGsdHeaderFilterResult {
  const { plainText, rawOffsetsByPlainIndex } = indexVisibleText(raw)
  if (!plainText) {
    return { status: 'needs-more', text: '' }
  }

  const lines = plainText.split('\n')
  const firstContentLine = lines.find((line) => !isBlank(line))

  if (firstContentLine && !isLogoLine(firstContentLine)) {
    return { status: 'passthrough', text: raw }
  }

  const titleLineIndex = lines.findIndex((line) => TITLE_PATTERN.test(line))

  if (titleLineIndex === -1) {
    if (lines.length >= MAX_HEADER_PROBE_LINES || plainText.length >= MAX_HEADER_PROBE_CHARS) {
      return { status: 'passthrough', text: raw }
    }
    return { status: 'needs-more', text: '' }
  }

  if (titleLineIndex < MIN_LOGO_LINES) {
    return { status: 'passthrough', text: raw }
  }

  const logoLines = lines.slice(titleLineIndex - MIN_LOGO_LINES, titleLineIndex)
  if (logoLines.length !== MIN_LOGO_LINES || !logoLines.every(isLogoLine)) {
    return { status: 'passthrough', text: raw }
  }

  const titleLineEnd = getPlainIndexAfterLine(plainText, titleLineIndex + 1)
  if (titleLineEnd === null) {
    return { status: 'needs-more', text: '' }
  }

  let headerPlainEnd = titleLineEnd
  let nextLineIndex = titleLineIndex + 1

  while (isBlank(lines[nextLineIndex])) {
    const nextLineEnd = getPlainIndexAfterLine(plainText, nextLineIndex + 1)
    if (nextLineEnd === null) {
      break
    }
    headerPlainEnd = nextLineEnd
    nextLineIndex += 1
  }

  const rawStart = rawOffsetsByPlainIndex[headerPlainEnd] ?? raw.length
  return { status: 'matched', text: raw.slice(rawStart) }
}
