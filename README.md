# Meatball

A pixel-art meatball that lives above the prompt in the Claude Code desktop app and shows what Claude is doing at a glance.

![The meatball's poses: rolling, chomping, running a command, something failed, waiting on you, done, asleep, context filling, time to /compact](docs/poses.svg)

| He… | When |
|---|---|
| rolls along the bar | Claude is thinking or reading |
| chomps | Claude edits a file |
| stands with a focused face | a command is running |
| winces and shakes | a tool fails |
| hops and blinks | Claude is waiting on you (permission, question, plan approval) |
| does a happy hop | the turn is done |
| dozes off | nothing has happened for 5 minutes |
| gets rounder | the context window passes 50%, then 80% (time to `/compact`) |

## Install

Needs Claude Code 2.1.288 or newer. He draws in the desktop app only.

```bash
claude plugin marketplace add jesseorndorff/meatball
claude plugin install meatball@meatball
```

Then start a new session.

To hack on him, clone the repo and add your local copy instead, so your changes load without pushing:

```bash
git clone https://github.com/jesseorndorff/meatball.git
claude plugin marketplace add ./meatball
claude plugin install meatball@meatball
```

## Commands

- `/meatball` hides him or brings him back
- `/meatball width <px>` pins the bar's width; `/meatball width auto` fits it to the window again

## Updating after a change

1. Bump `version` in `plugin/.claude-plugin/plugin.json`
2. `claude plugin marketplace update meatball`
3. `claude plugin update meatball@meatball`, then start a new session

## Layout

- `.claude-plugin/marketplace.json`: the one-plugin marketplace
- `plugin/hooks/register.tsx`: the mod
- `plugin/hooks/meatball.ts`: the sprite, generated from `plugin/assets/meatball.svg`
- `plugin/types/index.d.ts`: the state contract

Run the tests with `claude plugin test plugin` and check the manifests with `claude plugin validate .`

## License

[MIT](LICENSE) © 2026 Jesse Orndorff
