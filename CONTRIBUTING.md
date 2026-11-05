# Contributing

Thanks for helping! Translations are the easiest way to contribute — you do not need to write any code.

## Adding or improving a translation

All texts live in JSON files in [`public/locales/`](public/locales). English (`en.json`) is the source;
German (`de.json`) is complete. Missing keys in other languages automatically fall back to English, so a
partial translation is fine.

**New language**

1. Copy `public/locales/en.json` to `public/locales/<code>.json`, where `<code>` is the
   [ISO 639-1 language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) (`fr`, `es`, `pt-BR`, `pl`, …).
2. Set the display name of your language (in that language) and, for right-to-left languages, the direction:
   ```json
   "_meta.name": "Français",
   "_meta.dir": "ltr",
   ```
3. Translate the **values**. Do not change the keys.
4. Run `npm test` (needs Node 18+) to check your file, then open a pull request.

That is all: the language shows up in the language picker automatically, and the app chooses it
automatically when it matches the browser language.

**Rules and tips**

- Keep placeholders such as `{count}`, `{n}`, `{album}`, `{q}` exactly as they are — move them to where your
  grammar needs them. The tests fail if you use a placeholder that the English text does not have.
- **Plurals:** entries like `count.items.one` / `count.items.other` are plural forms. Provide the forms your language
  needs (`zero`, `one`, `two`, `few`, `many`, `other`, see
  [CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
  `other` is always required.
- `\n` is a line break. Emoji and symbols at the start of a button label (`♥`, `⬇`, `🗑`) can be kept.
- Dates, month names and numbers are formatted by the browser for your language; nothing to translate there.
- Don't have a GitHub account setup for pull requests? Open a
  [translation issue](../../issues/new?template=translation.yml) and paste your file.

**Improving an existing translation**: just edit the file and open a pull request.

## Code changes

- `npm test` must pass. It checks the layout maths, the ThumbHash decoder, and the translation files
  (every key used in the code exists in `en.json`, no stale keys, valid placeholders).
- User-visible text goes through `tr("key")` in `public/app.js` or `data-i18n*="key"` attributes in
  `public/index.html` — add the key to `en.json` (and `de.json`) in the same change.
- No build tooling or runtime dependencies, please. The project is deliberately plain HTML/CSS/JS.
- Keep the Immich API usage in line with the OpenAPI spec of your server (`/api/spec.json`).

## Reporting bugs

Use the bug report form. Please include your Immich version and browser, and never paste photos,
tokens or personal data.
