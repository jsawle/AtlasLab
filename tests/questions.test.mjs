// Lesson questions read from a map's description (lib/questions.js). Run: node tests/questions.test.mjs
import assert from "node:assert/strict";
import { questionsFrom, isQuestionsHeading, QUESTIONS_VERSION } from "../lib/questions.js";
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log("  ok   " + m); };
const H = (text) => ({ kind: "heading", text }), I = (text) => ({ kind: "item", text }), T = (text) => ({ kind: "text", text });
ok(QUESTIONS_VERSION === "1.0", "version 1.0");
ok(isQuestionsHeading("Questions") && isQuestionsHeading(" questions: ") && isQuestionsHeading("Question") && isQuestionsHeading("Preguntas") && !isQuestionsHeading("Questions to think about") && !isQuestionsHeading("Links"), "the heading is the word Questions on its own (any case, a colon allowed; Preguntas too)");
let q = questionsFrom([T("This map shows earthquakes."), H("Questions"), I("Where do most earthquakes happen?"), I("  How deep are they?  "), H("Links"), I("Activity")], "What causes earthquakes?");
ok(q.lead === "What causes earthquakes?" && q.questions.length === 2 && q.questions[1] === "How deep are they?", "list items under the heading are the questions, up to the next heading; the summary, being a question, leads");
q = questionsFrom([T("Questions:"), T("1. Where is the fault?"), T("2) Which plate moves?"), T("- Why here?")], "A map of faults.");
ok(q.lead === "" && q.questions.join("|") === "Where is the fault?|Which plate moves?|Why here?", "with no list, the lines after the heading are the questions, and hand-typed numbers and bullets come off; a summary that is not a question does not lead");
ok(questionsFrom([T("About the map"), I("one"), I("two")], "A map.") === null, "no heading and no question in the summary: nothing");
q = questionsFrom([T("About")], "How does a river change?");
ok(q.lead === "How does a river change?" && q.questions.length === 0, "a summary that is a question shows on its own");
q = questionsFrom([H("Questions"), ...Array.from({ length: 30 }, (_, i) => I("Q" + i)), I("")], "");
ok(q.questions.length === 20, "at most 20 questions");
ok(questionsFrom(null, null) === null && questionsFrom([I("Questions"), I("x")], "") === null, "bad input and a list item that merely says Questions give nothing");
console.log(n + " checks passed");
