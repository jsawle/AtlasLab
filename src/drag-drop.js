// ============================================================ Drag and drop
import "./csv-import.js?v=5.0.0-beta.40";   // first: keeps the files running in the order they were written in (see app.js)
import { $, F, S } from "./config.js?v=5.0.0-beta.40";
import { bindOpened, confirmDiscard } from "./session.js?v=5.0.0-beta.40";
import { toast } from "./ui.js?v=5.0.0-beta.40";
import { handleCsvText } from "./csv-import.js?v=5.0.0-beta.40";
import { openDocText } from "./local-files.js?v=5.0.0-beta.40";

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
export function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }
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

