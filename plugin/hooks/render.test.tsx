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
  expect(onDesktop).toContain('"label":"✕"')

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

test('he waits on you only while a permission prompt is up', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })
  on('classic.PermissionRequest', () => ({}))
  on('prompt.submit', () => ({ text: 'go ahead' }))
  const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 }
  const desktop = await $.ui.mount({ plugin: 'meatball', surface: 'desktop', component: 'AbovePrompt', props })

  // The sprite's own CSS mentions every mood; his pose is on the inner <svg>'s attributes.
  const isAlert = async () => /<svg data-fill="\w+" data-mood="alert"/.test(JSON.stringify(await desktop.drawn()).replace(/\\"/g, '"'))

  expect(await isAlert()).toBe(false)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(await isAlert()).toBe(true)
  await $.prompt.submit({ text: 'go ahead' })
  expect(await isAlert()).toBe(false)
})

const poseOf = async (desktop: { drawn: () => Promise<unknown> }) =>
  /<svg data-fill="\w+" (data-[a-z]+="[^"]*")/.exec(JSON.stringify(await desktop.drawn()).replace(/\\"/g, '"'))?.[1]

test('a test run: goggles while it runs, then a cheer or a groan', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', (t, e) => {
    const { Box } = t.ui.resolve(e)
    return <Box />
  })
  let seen: string | undefined
  let desktop: { drawn: () => Promise<unknown> } | undefined
  on('tool.call', async () => {
    seen = desktop && (await poseOf(desktop))
    return { result: { stdout: '', stderr: '' }, text: 'ok' }
  })
  const props = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 }
  desktop = await $.ui.mount({ plugin: 'meatball', surface: 'desktop', component: 'AbovePrompt', props })

  await $.tool.call({ tool: 'Bash', input: { command: 'npm test' }, tool_use_id: 't1' })
  expect(seen).toBe('data-mood="testing"')
  expect(await poseOf(desktop)).toBe('data-mood="pass"')
})
