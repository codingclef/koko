import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

// Cute family hub icon: orange rounded square with a house and heart
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background: warm orange rounded square -->
  <rect width="512" height="512" rx="110" fill="#fb923c"/>

  <!-- Subtle inner glow -->
  <rect width="512" height="512" rx="110" fill="url(#glow)" opacity="0.3"/>

  <defs>
    <radialGradient id="glow" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- House body -->
  <rect x="152" y="272" width="208" height="156" rx="14" fill="#fff" opacity="0.95"/>

  <!-- Roof (triangle) -->
  <polygon points="120,280 256,140 392,280" fill="#fff" opacity="0.95"/>

  <!-- Roof ridge cap -->
  <polygon points="120,280 256,140 392,280 380,280 256,158 132,280" fill="#fb923c" opacity="0.2"/>

  <!-- Door -->
  <rect x="218" y="340" width="76" height="88" rx="38" fill="#fb923c"/>

  <!-- Left window -->
  <rect x="164" y="296" width="56" height="48" rx="10" fill="#fb923c" opacity="0.7"/>
  <!-- Left window cross -->
  <line x1="192" y1="296" x2="192" y2="344" stroke="#fff" stroke-width="4" opacity="0.6"/>
  <line x1="164" y1="320" x2="220" y2="320" stroke="#fff" stroke-width="4" opacity="0.6"/>

  <!-- Right window -->
  <rect x="292" y="296" width="56" height="48" rx="10" fill="#fb923c" opacity="0.7"/>
  <!-- Right window cross -->
  <line x1="320" y1="296" x2="320" y2="344" stroke="#fff" stroke-width="4" opacity="0.6"/>
  <line x1="292" y1="320" x2="348" y2="320" stroke="#fff" stroke-width="4" opacity="0.6"/>

  <!-- Heart above door -->
  <path d="M256,312 C256,312 236,294 236,282 C236,273 244,266 256,278 C268,266 276,273 276,282 C276,294 256,312 256,312 Z" fill="#fb923c"/>
</svg>`

const buf = Buffer.from(svg)

await sharp(buf).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(buf).resize(512, 512).png().toFile('public/icons/icon-512.png')

console.log('Icons generated: public/icons/icon-192.png, icon-512.png')
