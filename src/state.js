// What the parts of the app share and change (5.0.0-beta.39). Each part of the app is (or is becoming) its own file; a
// value that more than one of them sets lives here, so every part sees the same one. Read and set them as state.name.
// A value only one part sets stays in that part.
export const STATE_VERSION = "1.0";

export const state = {
  // --- the map on screen
  view: null,              // the view in use: the 2D map view or the 3D scene view
  sceneView: null,         // the 3D view, once 3D has been opened
  mode: "2d",              // "2d" or "3d"
  viewSettled: null,       // a promise: the last change of map or view has finished
  sceneOnly: false,        // the open map is a web scene: there is no 2D version to switch to
  twoDOnly: false,         // the open map's author switched 3D off (the atlas-2d-only tag)

  // --- the map being worked on
  dirty: false,            // changed since it was last saved
  currentSource: null,     // the web map opened from the collection or ArcGIS Online: { itemId, title, item, data }
  currentAgolItem: null,   // the signed-in user's own ArcGIS Online item for this map: { id, owner, title }
  currentFileHandle: null, // the file on this device that Save writes back to
  openedLocked: false,     // the open file is a locked copy: Save never writes over it
  bookmarks: [],
  privateLeftOut: 0,       // layers left out of the last save because they need a sign-in

  // --- who is signed in
  portalUser: null,

  // --- sketching and measuring
  activeSketch: null,      // the sketch layer being drawn on
  pinnedSketch: null,      // the sketch layers at the top of the map: they stay above a layer that is added
  sketchPanelOpen: false,
  measureActive: false,
  profDraft: null,         // the elevation profile line being drawn

  // --- adding a spreadsheet
  addState: null,          // the spreadsheet being set up in the Add data panel
  pendingParse: null,      // a spreadsheet read but waiting (for a question to be answered) before it is set up
};
