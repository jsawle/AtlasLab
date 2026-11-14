// A lesson's questions, read from a map's own description (5.0.0-beta.44). No browser needed: unit tested.
// A map's author can put the questions for students in the item's description, under a heading "Questions". The app
// shows them beside the map. The item's summary, when it is itself a question, is shown above them as the main question.
export const QUESTIONS_VERSION = "1.0";
const HEADING = /^(questions?|preguntas?)\s*:?$/i;
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
export const isQuestionsHeading = (text) => HEADING.test(clean(text));
// blocks: the description in reading order, as [{ kind: "heading" | "item" | "text", text }]. A line that reads
// "Questions" counts as the heading whatever it was marked up as. The questions are the list items that follow it (or,
// with no list, the lines of text that follow), up to the next heading. Numbers and bullets typed by hand are taken off.
export function questionsFrom(blocks, snippet) {
  const list = Array.isArray(blocks) ? blocks : [];
  const start = list.findIndex((b) => b && isQuestionsHeading(b.text) && b.kind !== "item");
  let found = [];
  if (start >= 0) {
    const after = []; for (let i = start + 1; i < list.length; i++) { if (!list[i] || list[i].kind === "heading") break; after.push(list[i]); }
    const items = after.filter((b) => b.kind === "item");
    found = (items.length ? items : after).map((b) => clean(b.text).replace(/^(\d{1,2}[.)]|[-•*–])\s+/, "")).filter(Boolean).map((s) => s.slice(0, 400)).slice(0, 20);
  }
  const lead = /\?\s*$/.test(clean(snippet)) ? clean(snippet).slice(0, 300) : "";
  return lead || found.length ? { lead, questions: found } : null;
}
