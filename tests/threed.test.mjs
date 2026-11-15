// From the 2D map to the 3D view (lib/threed.js).
import { scaleTo3d, scaleTo2d, tiltForScale, hazeOn, layerDiffers3d, THREED_VERSION } from "../lib/threed.js";
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + m); };
ok(/^\d+\.\d+$/.test(THREED_VERSION), "has a version: " + THREED_VERSION);
ok(scaleTo3d(18056, 0) === 18056, "at the equator the two scales are the same");
ok(Math.abs(scaleTo3d(18056, 51.5134) - 11240) < 5, "at London's latitude a 2D scale of 1:18,056 is 1:11,240 on the ground: " + Math.round(scaleTo3d(18056, 51.5134)));
ok(Math.abs(scaleTo2d(scaleTo3d(73957191, -33.9), -33.9) - 73957191) < 1e-3, "there and back gives the scale it started with");
ok(isFinite(scaleTo3d(1000, 90)) && scaleTo3d(1000, 90) > 80 && scaleTo3d(1000, "x") === 1000, "the poles and a missing latitude are safe");
ok(tiltForScale(8865600, 45) === 30 && tiltForScale(5000000, 45) === 30 && tiltForScale(10000000, 45) === 30, "looking at a region the camera tilts 30°, enough to show the view is 3D");
ok(tiltForScale(68903570, 45) === 0 && tiltForScale(25000000, 45) === 0, "looking at the world it does not tilt: the globe shows it is 3D");
const out = tiltForScale(15000000, 45); ok(out > 10 && out < 25, "between a region and the world it falls away: 1:15,000,000 gives " + out + "°");
ok(tiltForScale(8865600, 10) === 10, "never more than the config's angle");
ok(tiltForScale(18056, 45) === 45 && tiltForScale(250000, 45) === 45, "at town scale and closer it tilts by the config's angle");
const mid = tiltForScale(1000000, 45); ok(mid > 35 && mid < 42 && tiltForScale(2311162, 45) < mid && tiltForScale(500000, 45) > mid, "in between it rises as the map zooms in: 1:1,000,000 gives " + mid + "°");
ok(tiltForScale(18056, 0) === 0 && tiltForScale(0, 45) === 45, "a config tilt of 0 stays flat; an unknown scale gets the config's angle");
ok(hazeOn(50000) && !hazeOn(1000000) && !hazeOn(68903570), "haze up close, none from a million to one outwards");
const cim = (t) => ({ type: "cim", data: { symbol: { type: t } } });
ok(layerDiffers3d({ type: "feature", renderer: { type: "simple", symbol: { type: "simple-fill" } } }).length === 0, "a plain layer is drawn the same");
ok(layerDiffers3d({ type: "feature", renderer: { symbol: cim("CIMPolygonSymbol") } }).join() === "symbols" && layerDiffers3d({ type: "feature", renderer: { uniqueValueInfos: [{ symbol: { type: "simple-line" } }, { symbol: cim("CIMLineSymbol") }] } }).join() === "symbols", "Pro's polygon and line symbols are not");
ok(layerDiffers3d({ type: "feature", renderer: { symbol: cim("CIMPointSymbol") } }).length === 0, "Pro's point symbols are");
ok(layerDiffers3d({ type: "feature", effect: "bloom(1)" }).join() === "effect" && layerDiffers3d({ type: "feature", featureEffect: {} }).join() === "effect", "effects are not");
ok(layerDiffers3d({ type: "feature", blendMode: "multiply" }).join() === "blend" && layerDiffers3d({ type: "imagery-tile", blendMode: "multiply" }).length === 0 && layerDiffers3d({ type: "feature", blendMode: "normal" }).length === 0, "blending is lost on feature layers, kept on tiled ones");
ok(layerDiffers3d({ type: "feature", featureReduction: { type: "cluster" } }).join() === "cluster" && layerDiffers3d({ type: "feature", featureReduction: { type: "selection" } }).length === 0, "clusters are not");
ok(layerDiffers3d({ type: "feature", renderer: { symbol: cim("CIMLineSymbol") }, effect: "x", blendMode: "multiply", featureReduction: { type: "cluster" } }).join() === "symbols,effect,blend,cluster" && layerDiffers3d(null).length === 0, "a layer can have several reasons; none for no layer");
{ const { FILL3D, drapeSize } = await import("../lib/threed.js");
  ok(FILL3D.outline >= 2 && FILL3D.tint > 0 && FILL3D.tint < 0.3, "styled fills in 3D: a thicker outline and a light tint");
  const a = drapeSize(200, 100), b = drapeSize(100, 400), c = drapeSize(1000, 1);
  ok(a.w === 2048 && a.h === 1024 && b.w === 512 && b.h === 2048 && c.h === 64 && a.tile === 341, "the picture's size: longer side 2048, shorter in proportion (64 at least), about six repeats"); }
console.log(`${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0);
