// In-memory record of what the agent did this session: approval requests and
// their outcome, git checkpoints, and rollbacks. This is the "session log"
// half of the workflow spine — pure and testable; the UI renders it and the
// git checkpoint history (which lives in the repo) alongside it.

export type ActivityKind = "approval" | "checkpoint" | "restore";

export interface ActivityEvent {
  kind: ActivityKind;
  at: number; // epoch ms
  text: string; // the question / short description
  /** approvals only: true = YES, false = NO */
  approved?: boolean;
  /** repo or cwd the event happened in, if known */
  where?: string | null;
}

export const MAX_ACTIVITY = 200;

export const pushActivity = (
  log: ActivityEvent[],
  ev: Omit<ActivityEvent, "at"> & { at?: number }
): ActivityEvent[] => {
  log.push({ at: Date.now(), ...ev });
  if (log.length > MAX_ACTIVITY) log.splice(0, log.length - MAX_ACTIVITY);
  return log;
};

const two = (n: number) => String(n).padStart(2, "0");
export const formatClock = (at: number): string => {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

// A one-line human summary, e.g. "14:03:12  ✓ APPROVED  Run migration?  (~/app)".
export const formatActivity = (ev: ActivityEvent): string => {
  const time = formatClock(ev.at);
  const where = ev.where ? `  (${ev.where})` : "";
  if (ev.kind === "approval") {
    const tag = ev.approved ? "✓ APPROVED" : "✗ DENIED";
    return `${time}  ${tag}  ${ev.text}${where}`;
  }
  if (ev.kind === "checkpoint") return `${time}  ⬤ CHECKPOINT  ${ev.text}${where}`;
  return `${time}  ↺ RESTORE  ${ev.text}${where}`;
};
