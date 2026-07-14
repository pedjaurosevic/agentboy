# AgentBoy Campaign

Last updated: 2026-07-14

This document is the durable handoff for launching and running the AgentBoy campaign. Keep public copy in English, disclose the maker relationship, and adapt every post to the community instead of broadcasting identical text.

## Current public links

- Website: https://pedjaurosevic.github.io/agentboy/
- GitHub: https://github.com/pedjaurosevic/agentboy
- npm: https://www.npmjs.com/package/agentboy
- Latest release: https://github.com/pedjaurosevic/agentboy/releases/tag/v2.4.0

## Campaign status

- [x] Public GitHub repository
- [x] GitHub Pages landing page
- [x] English README and installation instructions
- [x] Neutral retry-backoff demo scene (the old Čačak/slugify example is retired)
- [x] Compact 720×520 layout GIF covering Compact, Full, Robo-Terminal, Robo-Grip, and Fable Deck
- [x] Updated layout and theme screenshots
- [ ] 30–45 second demo video
- [ ] Dedicated campaign email
- [ ] Platform accounts and authenticated posting sessions
- [ ] Analytics/UTM baseline
- [ ] Launch calendar approved
- [ ] First campaign wave published

## Positioning

Primary one-liner:

> AgentBoy is a retro handheld terminal built for AI pair programming — with real PTYs, anti-spoofable approval dialogs, diff inspection, and automatic Git checkpoints.

Core message hierarchy:

1. A real Linux terminal, not a mock terminal UI.
2. Built around the practical AI coding workflow: review, approve, checkpoint, undo.
3. OSC 98 approval dialogs render on the chassis, outside PTY-paintable space.
4. Five chassis layouts, fourteen themes, three tones, and detailed CRT effects make it memorable.
5. Open source, MIT licensed, and installable from npm.

Audience-specific angles:

- AI developers: approval flow, diff inspection, Git checkpoints, anti-spoofing boundary.
- Linux users: real PTYs, split panes, X11 integration, clipboard support, native shell workflow.
- Terminal enthusiasts: xterm.js/node-pty architecture, OSC 98/99 protocols, chassis controls.
- Open-source makers: architecture, tests, documentation, MIT license, contribution opportunities.
- Design/retro communities: five layouts, fourteen themes, CRT modes, CSS-rendered chassis.

## Safety and account policy

- Never share passwords, recovery codes, session cookies, or 2FA secrets in chat or files.
- The owner creates/verifies accounts, enables 2FA, and retains recovery codes.
- Use authenticated connectors, a dedicated browser profile, or revocable API tokens with minimum scopes.
- Do not use temporary email, fake identity, karma farming, purchased followers, vote requests, or coordinated brigading.
- Do not promise features, timelines, platform support, security guarantees, or partnerships without owner approval.
- Escalate legal, security, press, payment, partnership, and hostile-conversation topics to the owner.
- No paid promotion without an explicit platform, total budget, daily cap, and end date.

## Accounts needed

Prefer a dedicated AgentBoy identity where platform rules permit it. Use the maker's personal identity where required.

| Channel | Account/setup | Notes |
| --- | --- | --- |
| GitHub | Existing `pedjaurosevic` access | Connected on `master`; repo and Pages are live. |
| Reddit | Legitimate verified account | Start by participating normally. Check each subreddit's current rules before posting. No karma farming. |
| Hacker News | Personal maker account | Submit as `Show HN`; participate in comments. |
| Product Hunt | Personal maker account | Complete onboarding; company accounts cannot launch. Do not ask directly for upvotes. |
| DEV Community | Verified author profile | Publish a useful technical article, not a copied press release. |
| Mastodon | Dedicated AgentBoy account if the instance permits it | Use a revocable posting token. |
| Bluesky | Dedicated AgentBoy account | Use an app password, never the main password. |
| LinkedIn | Maker profile or AgentBoy page admin | Maker-story and technical/product posts. |
| X | Dedicated AgentBoy account if desired | API/browser posting depends on available access. |
| Lobsters | Established personal account/invitation | Self-promotion must remain a minority of genuine participation. |

Account creation blockers:

- dedicated campaign email address;
- owner-controlled verification and 2FA;
- CAPTCHA/manual onboarding where required;
- a posting connector or authenticated browser session available to the agent.

## Channel plan

### Wave 0 — preparation

- Record a 30–45 second demo video.
- Prepare a 6–10 second social cut from the demo.
- Confirm the landing page CTA and installation path.
- Create UTM links for every channel.
- Capture baseline GitHub stars/forks, npm downloads, and website visits.
- Prepare short FAQ and technical reply bank.

### Wave 1 — technical launch

1. GitHub release/README update.
2. Show HN submission.
3. One technically useful DEV article about OSC 98 and the anti-spoofing design.
4. Mastodon and Bluesky announcement with the layout GIF.

### Wave 2 — community posts

- Reddit communities selected only after reading current rules and checking account eligibility.
- Candidate angles: Linux terminal workflow, open-source architecture, AI-agent approvals, and retro UI.
- Never paste the same title/body into several subreddits.
- Ask moderators first when self-promotion rules are unclear.
- `r/commandline` currently prohibits AI-generated titles and post text; the owner must write that submission personally from factual notes.

### Wave 3 — product launch

- Product Hunt draft, gallery, short video, maker comment, and scheduled launch.
- Indie/maker communities with a transparent build story.
- Relevant open-source/terminal directories and curated lists.

### Follow-up

- Answer factual questions quickly.
- Collect recurring installation problems into documentation/issues.
- Publish one useful technical follow-up instead of repeating the announcement.
- Review results after 24 hours, 72 hours, and 7 days.

## Draft English copy

### Show HN title

> Show HN: AgentBoy – a Game Boy-inspired terminal for working with AI coding agents

### Short announcement

> I built AgentBoy, an open-source Linux terminal designed around AI pair-programming workflows. It runs real PTYs and adds chassis-level approval dialogs, diff inspection, automatic Git checkpoints, split panes, and a status LED — wrapped in five retro handheld layouts. I would especially value feedback on the OSC 98 approval protocol and the installation experience.

### Product Hunt tagline

> A retro Linux terminal built for AI pair programming

### Technical article title

> I built a terminal-native approval protocol for AI coding agents

### Social post

> AgentBoy is a real Linux terminal in a retro handheld shell — built for coding with AI agents. Review diffs, approve actions outside PTY-paintable space, create automatic Git checkpoints, and switch between five chassis layouts. Open source and MIT licensed.
>
> https://pedjaurosevic.github.io/agentboy/

## Reply policy

The campaign agent may answer without escalation when the answer is documented and factual:

- installation commands;
- supported Linux/X11 environment;
- existing features;
- license and source location;
- documented OSC 98/99 behavior;
- known troubleshooting already present in the README.

Escalate before answering:

- security vulnerability claims;
- macOS/Windows roadmap questions;
- feature promises or dates;
- commercial licensing, sponsorship, partnerships, or press;
- requests for personal information;
- angry or adversarial exchanges.

## Tracking

UTM template:

```text
https://pedjaurosevic.github.io/agentboy/?utm_source=SOURCE&utm_medium=community&utm_campaign=launch_v2_4&utm_content=POST_VARIANT
```

Track per channel:

- post URL and publication time;
- impressions/views when available;
- clicks and website sessions;
- GitHub stars, forks, issues, and contributors;
- npm downloads;
- installation failures and repeated questions;
- comment sentiment and useful product feedback.

Success should be judged primarily by qualified testers, successful installs, useful issues, and contributors — not raw impressions.

## Next session checklist

1. Confirm the dedicated campaign email address.
2. Decide which existing personal accounts can represent the maker.
3. Create/verify permitted AgentBoy accounts and enable 2FA.
4. Connect authenticated sessions without sharing passwords.
5. Produce the demo video and social cut.
6. Verify every target community's current rules.
7. Approve the first-wave copy and the reply/escalation policy.
8. Publish one channel at a time and record every URL below.

## Publication log

| Date | Channel | Post URL | Variant | Result/notes |
| --- | --- | --- | --- | --- |
| | | | | |
