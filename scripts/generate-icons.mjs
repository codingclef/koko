import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)
const output = (path) => fileURLToPath(new URL(path, ROOT))

const COLORS = {
  accent: '#f97316',
  background: '#fafaf9',
  page: '#fffaf7',
  stone: '#292524',
  tile: '#d6d3d1',
}

// A calendar stays primary while the checked date tile carries the reminder meaning.
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M86 176c0-44.2 35.8-80 80-80h180c44.2 0 80 35.8 80 80v192c0 44.2-35.8 80-80 80H166c-44.2 0-80-35.8-80-80V176Z" fill="${COLORS.accent}"/>
  <path d="M116 206c0-17.7 14.3-32 32-32h216c17.7 0 32 14.3 32 32v158c0 28.7-23.3 52-52 52H168c-28.7 0-52-23.3-52-52V206Z" fill="${COLORS.page}"/>
  <rect x="151" y="64" width="46" height="104" rx="23" fill="${COLORS.stone}"/>
  <rect x="315" y="64" width="46" height="104" rx="23" fill="${COLORS.stone}"/>
  <rect x="151" y="218" width="90" height="68" rx="22" fill="${COLORS.tile}"/>
  <rect x="271" y="218" width="90" height="68" rx="22" fill="${COLORS.tile}"/>
  <rect x="151" y="316" width="90" height="68" rx="22" fill="${COLORS.tile}"/>
  <rect x="271" y="304" width="96" height="88" rx="26" fill="${COLORS.accent}"/>
  <path d="m294 349 14 14 35-38" fill="none" stroke="${COLORS.page}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const markBuffer = Buffer.from(markSvg)
const compactMarkBuffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="6" width="60" height="56" rx="14" fill="${COLORS.accent}"/>
  <rect x="8" y="21" width="48" height="35" rx="8" fill="${COLORS.page}"/>
  <rect x="15" y="1" width="9" height="21" rx="4.5" fill="${COLORS.stone}"/>
  <rect x="40" y="1" width="9" height="21" rx="4.5" fill="${COLORS.stone}"/>
  <rect x="14" y="28" width="13" height="9" rx="3" fill="${COLORS.tile}"/>
  <rect x="36" y="28" width="13" height="9" rx="3" fill="${COLORS.tile}"/>
  <rect x="14" y="42" width="13" height="9" rx="3" fill="${COLORS.tile}"/>
  <rect x="35" y="40" width="15" height="12" rx="4" fill="${COLORS.accent}"/>
</svg>`)

async function renderAppIcon(size, inset = 0) {
  const markSize = size - inset * 2
  const mark = await sharp(markBuffer).resize(markSize, markSize).png().toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: COLORS.background,
    },
  })
    .composite([{ input: mark, left: inset, top: inset }])
    .flatten({ background: COLORS.background })
    .removeAlpha()
    .png()
    .toBuffer()
}

async function renderTransparentLogo() {
  const mark = await sharp(markBuffer)
    .trim()
    .resize(640, 640, { fit: 'inside' })
    .png()
    .toBuffer()
  const metadata = await sharp(mark).metadata()

  return sharp({
    create: {
      width: 742,
      height: 742,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: mark,
      left: Math.round((742 - metadata.width) / 2),
      top: Math.round((742 - metadata.height) / 2),
    }])
    .webp({ quality: 92 })
    .toBuffer()
}

function createIco(pngs) {
  const headerSize = 6
  const entrySize = 16
  const directory = Buffer.alloc(headerSize + entrySize * pngs.length)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(pngs.length, 4)

  let offset = directory.length
  pngs.forEach(({ size, buffer }, index) => {
    const entry = headerSize + index * entrySize
    directory.writeUInt8(size === 256 ? 0 : size, entry)
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(buffer.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += buffer.length
  })

  return Buffer.concat([directory, ...pngs.map(({ buffer }) => buffer)])
}

await Promise.all([
  mkdir(output('public/icons/'), { recursive: true }),
  mkdir(output('src/app/'), { recursive: true }),
])

const icon512 = await renderAppIcon(512)
const icon192 = await sharp(icon512).resize(192, 192).png().toBuffer()
const maskable512 = await renderAppIcon(512, 46)
const maskable192 = await sharp(maskable512).resize(192, 192).png().toBuffer()
const appleIcon = await sharp(icon512).resize(180, 180).png().toBuffer()
const transparentLogo = await renderTransparentLogo()

const faviconPngs = await Promise.all(
  [16, 32, 48].map(async (size) => ({
    size,
    buffer: await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: COLORS.background,
      },
    })
      .composite([{ input: await sharp(compactMarkBuffer).resize(size, size).png().toBuffer() }])
      .png()
      .toBuffer(),
  }))
)

await Promise.all([
  writeFile(output('public/logo.svg'), markSvg),
  writeFile(output('public/logo.webp'), transparentLogo),
  writeFile(output('public/icons/icon-192.png'), icon192),
  writeFile(output('public/icons/icon-512.png'), icon512),
  writeFile(output('public/icons/icon-maskable-192.png'), maskable192),
  writeFile(output('public/icons/icon-maskable-512.png'), maskable512),
  writeFile(output('src/app/apple-icon.png'), appleIcon),
  writeFile(output('src/app/icon.png'), icon512),
  writeFile(output('src/app/favicon.ico'), createIco(faviconPngs)),
])

console.log('Generated Koko brand assets from the Today Tile mark.')
