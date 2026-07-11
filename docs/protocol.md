# agentboy agent protocol (OSC 98 / OSC 99)

agentboy exposes two terminal escape sequences so that CLI tools and AI agents
can drive the chassis directly — an approval dialog and the ACTION status LED.
Both are standard OSC (Operating System Command) sequences: they are inert in
any other terminal, so a tool that emits them stays portable.

An OSC sequence is `ESC ] <code> ; <payload> BEL`, where `ESC` is `\033`
(`\x1b`) and `BEL` is `\007` (`\x07`). `ST` (`ESC \`) may be used instead of
`BEL` as the terminator.

## OSC 98 — request approval

```
ESC ] 98 ; prompt=<question> BEL
```

Opens the retro approval dialog. The dialog renders **on the chassis, outside
the screen**, and names the working directory of the shell that made the
request plus the git repository a YES will commit — so a spoofed sequence
(which can only paint inside the screen) can be told apart from a real one.

- **YES** → agentboy git-checkpoints the requesting pane's working directory
  (`git add . && git commit -m "LLM Checkpoint" --allow-empty`) and writes
  `y⏎` back to that shell.
- **NO** → writes `n⏎`.
- **DIFF** → opens the Diff Inspector; the dialog stays open.

The user can restrict this via `"osc98"` in `~/.agentboy.json`:
`"on"` (default), `"led-only"` (flag the LED, no dialog, never auto-answers),
or `"off"` (ignore the sequence entirely).

### Examples

```bash
# bash / any POSIX shell
printf '\033]98;prompt=Run database migration?\007'
read -r answer   # receives y or n on the same tty
```

```python
import sys
sys.stdout.write("\033]98;prompt=Overwrite config.yaml?\007")
sys.stdout.flush()
answer = sys.stdin.readline().strip()   # "y" or "n"
```

## OSC 99 — drive the ACTION LED

```
ESC ] 99 ; led=<state> BEL
```

Sets the status traffic-light. Valid states:

| state        | colour        | meaning                               |
| ------------ | ------------- | ------------------------------------- |
| `idle`       | dim yellow    | nothing happening                     |
| `user`       | bright yellow | the user is typing                    |
| `agent`      | green         | the agent is producing output         |
| `needs-user` | red           | waiting on the user (approval / menu) |
| `off`        | dark          | LED off                               |

agentboy also infers `agent`/`idle`/`needs-user` automatically from pane
output, so `led=` is only needed when a tool wants to be explicit.

### Example

```bash
printf '\033]99;led=agent\007'    # green while working
run_long_task
printf '\033]99;led=needs-user\007'  # red: hand back to the user
```

## Notes for tool authors

- Emit the sequences on the tty the shell is attached to (normal stdout is
  fine inside a pane).
- These are advisory: if agentboy is not the terminal, the sequences are
  swallowed by the emulator and nothing breaks.
- The approval round-trip is line-based — read one line from stdin for the
  `y`/`n` answer after emitting OSC 98.
