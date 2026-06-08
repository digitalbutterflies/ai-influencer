// One-off: re-encode seed MP4s in place (H.264, CRF, scaled, +faststart).
// Keeps filenames so no references change. Originals are tracked in git.
// Uses the ffmpeg-static binary (a temporary devDependency).
//
// Usage: node scripts/optimize-video.js

import { readdir, stat, rename, unlink } from 'node:fs/promises'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const run = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const MAX_HEIGHT = 1280   // cap vertical resolution
const CRF = 27           // 23=high quality, 28=smaller; 27 is a good web balance

let before = 0, after = 0, count = 0

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (extname(full).toLowerCase() === '.mp4') await reencode(full)
  }
}

async function reencode(file) {
  const { size: beforeSize } = await stat(file)
  const tmp = join(dirname(file), `.tmp-${basename(file)}`)
  await run(ffmpegPath, [
    '-y', '-i', file,
    '-vf', `scale=-2:'min(${MAX_HEIGHT},ih)'`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    tmp,
  ])
  const { size: afterSize } = await stat(tmp)
  if (afterSize >= beforeSize) { await unlink(tmp); return }
  await rename(tmp, file)
  before += beforeSize; after += afterSize; count++
  const rel = file.replace(PUBLIC_DIR, 'public')
  console.log(`${mb(beforeSize)} -> ${mb(afterSize)}  ${rel}`)
}

const mb = b => `${(b / 1048576).toFixed(2)}MB`.padStart(8)

console.log('Re-encoding seed MP4s in place...\n')
await walk(PUBLIC_DIR)
console.log(`\nVideos: ${count}, ${mb(before)} -> ${mb(after)} (saved ${mb(before - after)})`)
