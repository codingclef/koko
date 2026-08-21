import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')

describe('app viewport height CSS', () => {
  it('일반 브라우저는 dynamic viewport 높이를 사용한다', () => {
    expect(css).toContain('--app-viewport-height: 100dvh;')
  })

  it('standalone PWA는 large viewport 높이와 fallback을 사용한다', () => {
    const standaloneRules = css.match(
      /@media \(display-mode: standalone\) \{[\s\S]*?--app-viewport-height: 100vh;[\s\S]*?@supports \(height: 100lvh\) \{[\s\S]*?--app-viewport-height: 100lvh;/
    )

    expect(standaloneRules).not.toBeNull()
  })
})
