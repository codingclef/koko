import vercelConfig from '../../vercel.json'

describe('Vercel deployment config', () => {
  it('runs functions in Tokyo next to the Supabase project', () => {
    expect(vercelConfig.regions).toEqual(['hnd1'])
  })

  it('keeps the daily digest cron schedule', () => {
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/cron/daily-digest',
      schedule: '0 23 * * *',
    })
  })
})
