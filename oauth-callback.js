// ArcGIS sign-in pop-up callback. The logic is Esri's (jsapi-resources, oauth/oauth-callback.html, Apache-2.0), moved
// out of the page into this file in 5.0.0-beta.38 so the page can carry a Content Security Policy that allows no inline
// script. It hands the sign-in result to the window that opened it, then closes. A window on another site cannot be
// handed anything: the browser refuses the calls below unless the opener is this same site.
function loadHandler() {
  if (opener) {
    if (location.hash) {
      var esriId;
      try {
        esriId = opener.require("esri/kernel").id;
      } catch (e) {}
      if (esriId) {
        esriId.setOAuthResponseHash(location.hash);
      } else {
        opener.dispatchEvent(new CustomEvent("arcgis:auth:hash", { detail: location.hash }));
      }
    } else if (location.search) {
      opener.dispatchEvent(new CustomEvent("arcgis:auth:location:search", { detail: location.search }));
    }
  }
  close();
}
window.addEventListener("load", loadHandler);
