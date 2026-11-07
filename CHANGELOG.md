# Changelog

## Unreleased

- All Photos: three zoom steps (5 / 3 / 1 photos per row on a phone, scaled on larger screens) and two grid shapes, square (default) or original aspect ratio; both in a new display menu in the top bar (replaces the −/+ buttons)
- Grouped sidebar and floating mobile tab bar, pinch / zoom steps through years, months and all photos
- People editing: name, birthday, favorite, hidden, merge, delete; faces in the viewer info panel (assign, use as cover, remove)
- People keep Immich's order; compose file for running on a different machine than Immich
- Photo grids show the newest photos at the bottom and open at the end (like the iOS Photos app); search results keep their order
- Photos load earlier and on every scroll, shared people show their photos for partner libraries
- Viewer: the photo follows the finger when swiping, the neighbour slides in (also for arrow keys and buttons)
- Viewer: swiping also works on videos (not in the control strip at the bottom); slower settle animation
- Touch devices: swipe up on a photo opens the info as a bottom sheet (the info button is hidden), swipe down closes the sheet or the viewer; fixes the info panel being invisible on phones
- Closing the viewer (swipe down, ✕, Esc) shrinks the photo back to its tile in the timeline
- Viewer: the previous/next arrows are gone everywhere; two-finger horizontal trackpad swipe pages through photos (following the fingers), arrow keys still work
- Touch devices: the close button of the viewer is hidden (swipe down instead)
- Live Photos: hold the photo in the viewer to play it (a LIVE pill also plays it once); smaller Live badge in the grid
- Zoom steps in the grid animate (tiles glide to their new position and size instead of jumping); neighbour photos are preloaded and slide in with a gap
- Client diagnostics: errors, stalls and gesture data are written to the container log (`POST /log`)

## 0.1.1

- Project renamed to **immich-photos-webapp** (the name no longer contains a third-party trademark).
  The Docker image moved to `ghcr.io/fabian1512/immich-photos-webapp`; the old `immich-apple-photos-webapp` image is no longer updated.
- Demo mode with generated dummy photos (`npm run demo`) and README screenshots
- English code comments
- Fix: the viewer toolbar is no longer hidden behind the open info panel

## 0.1.0 – first public release

- Library with Years / Months / All Photos in the style of Apple Photos
- Fast loading through Immich's timeline API, virtualized photo grid, ThumbHash placeholders
- Favorites, Videos, Live Photos, Albums, Collections, People, Places, Map, Search
- Viewer with zoom, info panel, favorite, download, trash and fullscreen
- Selection mode (favorite, add to album, download as ZIP, move to trash)
- English and German interface; translations are plain JSON files
- Docker image `ghcr.io/fabian1512/immich-photos-webapp` (amd64, arm64)
