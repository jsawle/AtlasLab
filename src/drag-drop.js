// ============================================================ Drag and drop
// A file dropped on the page: a saved map opens, a CSV goes to Add data, a spreadsheet in another format gets a message
// saying to save it as CSV, and anything else a message saying what can be dropped.
import "./csv-import.js?v=5.0.0-beta.75";   // first: keeps the files running in the order they were written in (see app.js)
import { $, F, S } from "./config.js?v=5.0.0-beta.75";
import { bindOpened, confirmDiscard } from "./session.js?v=5.0.0-beta.75";
import { toast } from "./ui.js?v=5.0.0-beta.75";
import { handleCsvText } from "./csv-import.js?v=5.0.0-beta.75";
import { openDocText } from "./local-files.js?v=5.0.0-beta.75";

const dtHasFiles = (e) => !!(e.dataTransfer && e.dataTransfer.types && [...e.dataTransfer.types].includes("Files"));
let dropDepth = 0;
window.addEventListener("dragover", (e) => { if (dtHasFiles(e)) e.preventDefault(); });
window.addEventListener("dragenter", (e) => { if (!dtHasFiles(e)) return; dropDepth++; $("dropOverlay").hidden = false; });
window.addEventListener("dragleave", (e) => { if (!dtHasFiles(e)) return; dropDepth = Math.max(0, dropDepth - 1); if (!dropDepth) $("dropOverlay").hidden = true; });
window.addEventListener("drop", (e) => {
  if (!dtHasFiles(e)) return;
  e.preventDefault(); dropDepth = 0; $("dropOverlay").hidden = true;
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  // the dropped file's own handle (Chrome, Edge), asked for now while the drop event lasts, so Save can refuse to overwrite it
  const item = e.dataTransfer.items && e.dataTransfer.items[0];
  const handle = item && item.kind === "file" && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : null;
  if (f) handleDroppedFile(f, handle);
});
/**
 * A file's contents as text.
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }
/**
 * Opens a file dropped on the page or chosen to open: a saved map (.amap, .mmap, .json) replaces the map; a .csv or
 * .txt goes to Add data; a spreadsheet in another format gets a message saying to save it as CSV.
 * @param {File} f
 * @param {Promise<FileSystemFileHandle|null>} handlePromise the file's handle, where the browser gives one, so Save can
 *   write back to it
 * @returns {Promise<void>}
 */
export async function handleDroppedFile(f, handlePromise) {
  const name = f.name || "";
  if (/\.(amap|mmap|json)$/i.test(name)) {
    if (F.localSave === false) return;
    if (!confirmDiscard()) return;
    try { const txt = await readText(f); if (await openDocText(txt, name)) bindOpened(handlePromise ? await handlePromise : null, txt); } catch (e) { toast(S.cantRead); }
    return;
  }
  if ((/\.(csv|txt)$/i.test(name) || f.type === "text/csv") && F.csv !== false) {
    try { await handleCsvText(name, await readText(f)); } catch (e) { toast(S.cantRead); }
    return;
  }
  if (/\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(name)) { toast(S.excelFile, 9000); return; }
  toast(S.dropWhat, 5000);
}

