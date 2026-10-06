import { expect, mock, test } from 'claude-code/testing'

const PROPS = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 }

test('desktop draws the rolling meatball, the terminal leaves the band alone', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })

  const desktop = await $.ui.mount({
    plugin: 'meatball',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: PROPS,
  })
  const onDesktop = JSON.stringify(await desktop.drawn())
  expect(onDesktop).toContain('"type":"Svg"')
  expect(onDesktop).toContain('data-roll')
  expect(onDesktop).toContain('animation-play-state:running')
  expect(onDesktop).not.toContain('isInteractive')

  const terminal = await $.ui.mount({
    plugin: 'meatball',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  expect(JSON.stringify(await terminal.drawn())).not.toContain('"type":"Svg"')
})
