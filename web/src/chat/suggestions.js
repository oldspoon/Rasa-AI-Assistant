export const MAX_BUTTONS = 3;

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function usedQuestions(turns) {
  return new Set(
    turns.filter((t) => t.from === "user" && !t.payload).map((t) => normalize(t.text))
  );
}

export function usedPayloads(turns) {
  return new Set(turns.filter((t) => t.from === "user" && t.payload).map((t) => t.payload));
}

export function suggestedQuestions(pool, turns, max = MAX_BUTTONS) {
  const used = usedQuestions(turns);
  return pool.filter((question) => !used.has(normalize(question))).slice(0, max);
}

export function visibleButtons(buttons, turns, max = MAX_BUTTONS) {
  const used = usedPayloads(turns);
  return (buttons ?? []).filter((button) => !used.has(button.payload)).slice(0, max);
}
