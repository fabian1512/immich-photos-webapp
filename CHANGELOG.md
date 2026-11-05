# Changelog

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
