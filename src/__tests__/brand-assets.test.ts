/** @jest-environment node */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()

describe('Koko brand assets', () => {
  it('provides separate any and maskable PWA icons at each required size', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'public/manifest.json'), 'utf8')
    ) as {
      icons: Array<{ src: string; sizes: string; purpose: string }>
    }

    expect(manifest.icons.map(({ sizes, purpose }) => ({ sizes, purpose }))).toEqual([
      { sizes: '192x192', purpose: 'any' },
      { sizes: '512x512', purpose: 'any' },
      { sizes: '192x192', purpose: 'maskable' },
      { sizes: '512x512', purpose: 'maskable' },
    ])

    await Promise.all(
      manifest.icons.map(async ({ src, sizes }) => {
        const assetPath = src.split('?')[0]
        const expectedSize = Number(sizes.split('x')[0])
        const metadata = await sharp(path.join(root, 'public', assetPath)).metadata()

        expect(metadata.width).toBe(expectedSize)
        expect(metadata.height).toBe(expectedSize)
        expect(metadata.hasAlpha).toBe(false)
      })
    )
  })

  it('keeps the in-app logo transparent and free of oversized source dimensions', async () => {
    const metadata = await sharp(path.join(root, 'public/logo.webp')).metadata()

    expect(metadata.width).toBe(742)
    expect(metadata.height).toBe(742)
    expect(metadata.hasAlpha).toBe(true)
  })

  it('packages 16, 32, and 48 pixel browser icons into the favicon', async () => {
    const favicon = await readFile(path.join(root, 'src/app/favicon.ico'))

    expect(favicon.readUInt16LE(2)).toBe(1)
    expect(favicon.readUInt16LE(4)).toBe(3)
    expect([favicon[6], favicon[22], favicon[38]]).toEqual([16, 32, 48])
  })
})
