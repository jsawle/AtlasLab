// node tests/pairs.test.mjs
import { PAIRS_VERSION, PAIR_PROP, partnerFromTags, savedPair, pairOf, mergePairs, entryIs2d, entryIs3d } from "../lib/pairs.js";
import { indexItems, countTopics, filterEntries } from "../lib/catalog.js";
let n = 0, bad = 0;
const eq = (got, want, msg) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.error("FAIL " + msg + ": got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)); } };
const M = "a".repeat(32), S = "b".repeat(32), M2 = "c".repeat(32), S2 = "d".repeat(32), X = "e".repeat(32);
eq(PAIRS_VERSION, "1.0", "version");
// the tags
eq(partnerFromTags(["hurricanes", "atlas-3d-" + S], "atlas-3d-"), S, "a web map's tag names its scene");
eq(partnerFromTags([" Atlas-3D-" + S.toUpperCase() + " "], "atlas-3d-"), S, "capitals and spaces don't matter");
eq(partnerFromTags(["atlas-2d-only"], "atlas-2d-"), null, "atlas-2d-only is the 2D-only tag, not a partner");
eq(partnerFromTags(["atlas-3d-123", "atlas-3d-"], "atlas-3d-"), null, "not an item ID");
eq(partnerFromTags(["atlas-3d-nope", "atlas-3d-" + S], "atlas-3d-"), S, "a bad tag doesn't hide a good one");
eq(partnerFromTags(null, "atlas-3d-"), null, "no tags");
// an item's pair
eq(pairOf({ id: M, type: "Web Map", tags: ["atlas-3d-" + S] }), { webmap: M, scene: S }, "from a web map");
eq(pairOf({ id: S, type: "Web Scene", tags: ["atlas-2d-" + M] }), { webmap: M, scene: S }, "from a scene");
eq(pairOf({ id: M, type: "Web Map", tags: ["atlas-2d-" + S] }), null, "a web map's partner is a 3D one");
eq(pairOf({ id: S, type: "Web Scene", tags: ["atlas-3d-" + M] }), null, "a scene's partner is a 2D one");
eq(pairOf({ id: M, type: "Web Map", tags: ["atlas-3d-" + M] }), null, "not its own partner");
eq(pairOf({ id: M, type: "Web Map", tags: [] }), null, "no tag, no pair");
eq(pairOf({ id: M, type: "Feature Service", tags: ["atlas-3d-" + S] }), null, "only maps and scenes");
eq(pairOf({ id: M, type: "Web Map", tags: [] }, { [PAIR_PROP]: { webmap: M, scene: S } }), { webmap: M, scene: S }, "kept in a map saved from the app");
eq(pairOf({ id: X, type: "Web Map", tags: [] }, { [PAIR_PROP]: { webmap: M, scene: S } }), null, "a saved pair must include the item itself");
eq(pairOf({ id: M, type: "Web Map", tags: ["atlas-3d-" + S2] }, { [PAIR_PROP]: { webmap: M, scene: S } }), { webmap: M, scene: S2 }, "the tag comes before what is saved");
// in a saved file
eq(savedPair({ [PAIR_PROP]: { webmap: M, scene: S } }), { webmap: M, scene: S }, "read from a file");
eq(savedPair({ [PAIR_PROP]: { webmap: M, scene: M } }), null, "the same item twice is no pair");
eq(savedPair({ [PAIR_PROP]: { webmap: "javascript:alert(1)", scene: S } }), null, "anything but item IDs is ignored");
eq(savedPair({ [PAIR_PROP]: "x" }), null, "not an object"); eq(savedPair(null), null, "nothing");
// the collection: one card for a pair
const it = (id, type, title, tags, cats) => ({ id, type, title, tags: tags || [], groupCategories: cats || [], snippet: "" });
const items = [
  it(M, "Web Map", "Hurricane paths", ["atlas-3d-" + S], ["/Categories/Weather"]),
  it(S, "Web Scene", "Hurricane paths in 3D", ["atlas-2d-" + M, "storm surge"], ["/Categories/Oceans"]),
  it(M2, "Web Map", "Rivers", ["atlas-3d-" + S2]),          // its scene is not in the collection
  it(X, "Web Map", "Plain map"),
  it("f".repeat(32), "Web Scene", "Lone scene", ["atlas-2d-" + "9".repeat(32)]),   // its web map is not in the collection
  it("1".repeat(32), "Web Scene", "Plain scene")
];
const { entries, pairs } = mergePairs(indexItems(items));
eq(entries.map((e) => e.item.title), ["Hurricane paths", "Rivers", "Plain map", "Lone scene", "Plain scene"], "the paired scene has no card of its own");
eq(entries[0].pair.scene.id, S, "the pair's card knows its scene");
eq(entries[1].pair, { scene: null }, "a web map whose scene is elsewhere is still marked");
eq(entries[3].pair, { webmap: null }, "a scene whose web map is elsewhere is marked too");
eq(entries[2].pair, undefined, "an ordinary map is untouched"); eq(entries[4].pair, undefined, "an ordinary scene is untouched");
eq([pairs.get(M), pairs.get(S)], [{ webmap: M, scene: S }, { webmap: M, scene: S }], "either ID finds the pair");
eq(pairs.get(M2), { webmap: M2, scene: S2 }, "the pair is known when the scene is elsewhere");
eq(pairs.has(X), false, "no pair for an ordinary map");
eq([entries.filter(entryIs2d).length, entries.filter(entryIs3d).length, entries.length], [3, 3, 5], "2D: 3 (the pair counts), 3D: 3 (the pair counts again), all: 5");
eq(filterEntries(entries, [], "", "surge").map((e) => e.item.id), [M], "the scene's words find the pair's card");
eq(entries[0].keys, ["/categories/weather", "/categories/oceans"], "the pair is in both items' categories");
eq(countTopics([], entries).total, 5, "counted once");
// only one of the two tagged
const oneWay = mergePairs(indexItems([it(M, "Web Map", "A"), it(S, "Web Scene", "A 3D", ["atlas-2d-" + M])]));
eq([oneWay.entries.length, oneWay.entries[0].pair.scene.id], [1, S], "a tag on the scene alone still makes one card");
// two web maps naming one scene: the first has it
const clash = mergePairs(indexItems([it(M, "Web Map", "A", ["atlas-3d-" + S]), it(M2, "Web Map", "B", ["atlas-3d-" + S]), it(S, "Web Scene", "S")]));
eq(clash.entries.map((e) => [e.item.title, !!e.pair]), [["A", true], ["B", false]], "a scene has one partner");
// a tag that names something that isn't a scene
const wrong = mergePairs(indexItems([it(M, "Web Map", "A", ["atlas-3d-" + X]), it(X, "Web Map", "Not a scene")]));
eq(wrong.entries.map((e) => [e.item.title, e.pair ? e.pair.scene : undefined]), [["A", null], ["Not a scene", undefined]], "a partner of the wrong kind is not merged");
eq(mergePairs(null).entries, [], "nothing in, nothing out");
console.log(bad ? `${bad} of ${n} pairs tests failed` : `All ${n} pairs tests passed.`); process.exit(bad ? 1 : 0);
