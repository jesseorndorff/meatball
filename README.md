# Meatball

A pixel-art meatball that lives above the prompt in Claude Code, in the desktop app and the terminal, and shows what Claude is doing at a glance.

![The meatball's poses: rolling, chomping an edit, running a command, running tests, tests passed, tests failed, opening a PR, PR opened, something failed, waiting on you, done, asleep, context filling, time to /compact, subagents at work](docs/poses.svg)

<sub>Also as a [GIF](docs/poses.gif) for places that won't play an SVG. Regenerate both with `python3 docs/make-pose-sheets.py` after changing the sprite.</sub>

| He… | When |
|---|---|
| rolls along the bar | Claude is thinking or reading |
| chomps | Claude edits a file |
| stands with a focused face | a command is running |
| puts on goggles and fidgets | tests are running (`npm test`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`, …) |
| cheers, or groans | the tests passed, or failed |
| carries an envelope | a pull request is being opened (`gh pr create`) |
| plants a flag in the confetti | the pull request was opened |
| rolls with mini meatballs behind him | subagents or background tasks are working (one mini each, up to four) |
| winces and shakes | a tool fails |
| hops and blinks | Claude is waiting on you: a permission prompt on screen, a question, or a plan to approve |
| does a happy hop | the turn is done |
| dozes off | nothing has happened for 5 minutes |
| gets rounder | the context window passes 50%, then 80% (time to `/compact`) |

## Install

Needs Claude Code 2.1.288 or newer. In the desktop app he's drawn from the 32×32 SVG. In a terminal he's one line of colored text, a little face rolling across the band: `(•ᴗ•)` rolling, `(O_O)!` waiting on you, `(¬_¬) ⠋` running a command, `(°_°) ⠋` running tests, `\(^o^)/ ✓` passed, `(>_<) ✗` failed, `(•ᴗ•) ✉` opening a PR, `(^ᴗ^) ⚑` PR opened, `(x_x)#` something failed, `\(^ᴗ^)/` done, `(-_-) zZ` asleep, an `o` trailing behind for each running subagent, and rounder cheeks, `( •ᴗ• )` then `((•ᴗ•))`, as the context fills.

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

## Does he cost tokens?

No. `claude plugin details meatball@meatball` reports **~0 tokens** added to every session, and nothing he does later spends any:

- He never calls the model. He only listens to events Claude Code already raises (a tool starting, a turn ending, a permission prompt, context measurements) and redraws himself.
- He adds nothing to Claude's prompt: no instructions, skills or tools, and he passes prompts and tool results through untouched.
- "Getting rounder" reads the context figures Claude Code already tracks, which is free.

His only cost is a little local work: a few small state updates per event and, in a terminal, about eight redraws a second while he's moving.

## Commands

- `/meatball` hides him or brings him back (the ✕ beside him hides him too)
- `/meatball width <px>` pins the bar's width; `/meatball width auto` fits it to the window again

## Updating after a change

1. Bump `version` in `plugin/.claude-plugin/plugin.json`
2. `claude plugin marketplace update meatball`
3. `claude plugin update meatball@meatball`, then start a new session

## Layout

- `.claude-plugin/marketplace.json`: the one-plugin marketplace
- `plugin/hooks/register.tsx`: the mod
- `plugin/hooks/terminal.ts`: his one-line text face for terminals
- `plugin/assets/meatball.svg`, `plugin/assets/meatball-agents.svg`: the sprite and the subagents strip; `plugin/hooks/meatball.ts` is generated from them (compacted to fit the desktop's 128KB SVG limit) by `python3 scripts/build-sprites.py`
- `docs/make-pose-sheets.py`: draws `docs/poses.svg` and `docs/poses.gif` from the sprites
- `plugin/assets/meatball-16.svg`: a 16×16 version, kept for terminals that draw block characters cleanly
- `plugin/types/index.d.ts`: the state contract

Run the tests with `claude plugin test plugin` and check the manifests with `claude plugin validate .`

## License

[MIT](LICENSE) © 2026 Jesse Orndorff
