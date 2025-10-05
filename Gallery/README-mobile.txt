Mobile UI layer added (TikTok-style)
------------------------------------
Files added:
  - assets/css/mobile.css
  - assets/js/mobile.js
  - README-mobile.txt

What it does:
  - On screens <= 768px, a vertical, TikTok-style feed is shown.
  - Desktop UI remains intact and unchanged.
  - A bottom navigation (Home, Search, Favs, Library) is provided.
  - RW-gated actions (Download, New Prompt, Set Cover, Delete, NSFW) are disabled and dimmed when R/W is not enabled.
    If your app exposes PV.deleteImageFromPrompt, PV.setCoverImage, etc., they will be called on tap; otherwise a toast appears.

Integration notes:
  - The feed derives entries from PV.state.filtered or PV.state.all (whichever is available), without altering those arrays.
  - To force a re-render after search/filtering, dispatch: window.dispatchEvent(new Event("pv:data")) or call MobileUI.mountFeed().

Safe by design:
  - No existing files were removed or modified beyond inserting two tags into index.html to load mobile.css and mobile.js,
    plus a single line to dispatch a 'pv:data' event on load if such an event is not already used in your app.