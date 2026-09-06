# Localization behavior

**Search.** Published public article documents include `locale_code`; Viewer Typesense queries always filter on the selected locale. Rebuilds use the same locale-aware source and never index tags.

**Exports.** Article jobs snapshot the requested article draft/version, so a translated article never exports its default-language sibling. Category jobs accept `localeCode`, select only that locale, localize category names, and output RTL HTML/PDF for RTL languages.

**Links.** Viewer translation switches use the translation group. Generic rich-text links remain as authored because they have no stable target article identity; a missing known translation must route to the language's unavailable state instead of guessing a slug.

**Templates and reusable blocks.** These are not currently connected to a live injection runtime. They are never implicitly translated. A future insertion must snapshot/copy content into the localized article draft or explicitly select a localized block, so default-language edits cannot mutate a translation.

**Notifications, audits, versions.** Workflow notifications label the article with its locale. Translator assignment and stale-translation audit metadata include locale. Versions and restores are scoped to the selected article ID, so a restore cannot alter sibling translations.

**HelpJuice migration.** The importer preserves explicit `languages.csv`/`language_id` and `translation_id` information, assigns deterministic groups only when the relationship is unambiguous, localizes translated categories, and reuses external mappings on rerun. Missing or ambiguous relationships are imported safely without guessing and are included in preview/diagnostic output. See [LOCALIZATION_LIFECYCLE.md](LOCALIZATION_LIFECYCLE.md) for configuration and operating guidance.
