// Optimize seed media in public/ in place.
// Resizes raster images to a max edge and recompresses, KEEPING the same
// filename and format so no code/seed references need to change.
// Originals are tracked in git, so this is recoverable via `git checkout`.
//
// Usage: node scripts/optimize-media.js
// Requires: sharp (already in node_modules)

import { readdir, stat, rename, unlink } from 'node:fs/promises'
import { join, extname, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

const MAX_EDGE = 1600          // longest edge in px for web display
const JPEG_QUALITY = 80
const PNG_QUALITY = 80         // palette quantization quality
const SKIP_BELOW_BYTES = 100 * 1024 // leave small files (icons, etc.) alone

const RASTER = new Set(['.png', '.jpg', '.jpeg'])

let totalBefore = 0
let totalAfter = 0
let processed = 0
let skipped = 0

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
    } else {
      await maybeOptimize(full)
    }
  }
}

async function maybeOptimize(file) {
  const ext = extname(file).toLowerCase()
  if (!RASTER.has(ext)) return

  const { size: beforeSize } = await stat(file)
  if (beforeSize < SKIP_BELOW_BYTES) { skipped++; return }

  let img = sharp(file, { failOn: 'none' })
  const meta = await img.metadata()

  // Resize only if larger than target (never upscale).
  const longest = Math.max(meta.width || 0, meta.height || 0)
  if (longest > MAX_EDGE) {
    img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
  }

  if (ext === '.png') {
    img = img.png({ palette: true, quality: PNG_QUALITY, effort: 9, compressionLevel: 9 })
  } else {
    img = img.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
  }

  const tmp = join(dirname(file), `.tmp-${basename(file)}`)
  await img.toFile(tmp)
  const { size: afterSize } = await stat(tmp)

  // Safety: never write a file that is larger than the original.
  if (afterSize >= beforeSize) {
    await unlink(tmp)
    skipped++
    return
  }

  await rename(tmp, file)
  totalBefore += beforeSize
  totalAfter += afterSize
  processed++

  const rel = file.replace(PUBLIC_DIR, 'public')
  const pct = ((1 - afterSize / beforeSize) * 100).toFixed(0)
  console.log(`${mb(beforeSize)} -> ${mb(afterSize)}  (-${pct}%)  ${rel}`)
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(2)}MB`.padStart(8)
}

console.log('Optimizing public/ raster images in place...\n')
await walk(PUBLIC_DIR)
console.log('\n---')
console.log(`Processed: ${processed} files, skipped: ${skipped}`)
console.log(`Total: ${mb(totalBefore)} -> ${mb(totalAfter)}  (saved ${mb(totalBefore - totalAfter)})`)
