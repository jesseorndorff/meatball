import { expect, mock, test } from 'claude-code/testing'

const PROPS = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 }

test('desktop draws the SVG meatball, the terminal a line of text', async ($, on) => {
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
  expect(onDesktop).toContain('"role":"dismiss"')

  const terminal = await $.ui.mount({
    plugin: 'meatball',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  const onTerminal = JSON.stringify(await terminal.drawn())
  expect(onTerminal).not.toContain('"type":"Svg"')
  expect(onTerminal).toContain('ᴗ')
  expect(onTerminal).toContain('×')
})

test('the close button sends him away until /meatball', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })
  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 }

  const desktop = await $.ui.mount({ plugin: 'meatball', surface: 'desktop', component: 'AbovePrompt', props })
  await desktop.press({ key: 'close' })
  expect(JSON.stringify(await desktop.drawn())).not.toContain('"type":"Svg"')
})
