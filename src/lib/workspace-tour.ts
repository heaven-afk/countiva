const keyFor = (userId: string) => `countiva-workspace-tour:v1:${userId}`;
const choices = new Map<string, "pending" | "seen">();

function readChoice(userId: string) {
  try {
    return localStorage.getItem(keyFor(userId)) ?? choices.get(userId);
  } catch {
    return choices.get(userId);
  }
}

function saveChoice(userId: string, choice: "pending" | "seen") {
  choices.set(userId, choice);
  try {
    localStorage.setItem(keyFor(userId), choice);
  } catch {
    // The prompt can still work for the current session without browser storage.
  }
}

export function queueWorkspaceTour(userId: string) {
  if (!readChoice(userId)) saveChoice(userId, "pending");
}

export function hasPendingWorkspaceTour(userId: string) {
  return readChoice(userId) === "pending";
}

export function markWorkspaceTourSeen(userId: string) {
  saveChoice(userId, "seen");
}
