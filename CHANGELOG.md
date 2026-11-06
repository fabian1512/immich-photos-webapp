# Changelog

## Unreleased

- Grouped sidebar and floating mobile tab bar, pinch / zoom steps through years, months and all photos
- People editing: name, birthday, favorite, hidden, merge, delete; faces in the viewer info panel (assign, use as cover, remove)
- People keep Immich's order; compose file for running on a different machine than Immich
- Photo grids show the newest photos at the bottom and open at the end (like the iOS Photos app); search results keep their order
- Photos load earlier and on every scroll, shared people show their photos for partner libraries
- Viewer: the photo follows the finger when swiping, the neighbour slides in (also for arrow keys and buttons)
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
