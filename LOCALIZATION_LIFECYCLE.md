# Localization lifecycle and production QA

## Configuration

Configure an enabled default language before publishing. Add each viewer language with its locale code, display/native names, and RTL flag. Article records use the configured locale code; a translation group has at most one article per locale.

Create a translation from an existing article, choose its target locale and category destination, assign a translator if needed, edit it independently, and verify it after review. Automatic translation, copied synchronization, and manual translation all create a separate draft. Publishing or restoring one locale never modifies a sibling locale or its published version.

When a source publishes a newer version, linked translations become out of date. Synchronize into a new translation draft, review protected terms and links, then verify and publish. Locks, optimistic row versions, and autosave apply to the selected localized article draft only.

## HelpJuice migration

The preview, validation, diagnostic report, and execution paths parse `languages.csv` when present, plus `language_id` and `translation_id` from questions and categories. A valid locale code from `languages.csv` is preserved. An unmapped numeric language ID is never guessed: it is retained as the private-use locale `und-x-hj-<id>`, imported unlinked where necessary, and reported as `LANGUAGE_ID_UNMAPPED`.

Only an explicit HelpJuice translation relationship with exactly one article per locale receives a deterministic `TranslationGroupID`. Missing references produce `TRANSLATION_RELATIONSHIP_UNRESOLVED`; duplicate locales produce `TRANSLATION_RELATIONSHIP_AMBIGUOUS`. Neither condition merges, overwrites, or deletes KB content.

Translated HelpJuice categories with an unambiguous relationship reuse one destination category and store a locale-specific category label. Their articles retain the corresponding destination category. Ambiguous category translations stay separate and are reported. Article and category source IDs continue to use `MigrationExternalMappings`, so reruns reuse the existing article/version, category, translation group, media, and stored content rather than duplicating them.

If an imported locale is not already configured, migration adds it disabled with a neutral label. This satisfies the locale foreign key without exposing it in Viewer navigation; an administrator must set the real display/native names and enable it after inspecting the preview diagnostics. Arabic-prefixed locales are marked RTL on this disabled placeholder, but should still be reviewed in language configuration.

Content is staged through the existing draft/version storage pipeline. Migration does not delete current KB data. Run preview and the downloadable diagnostic report first; treat errors as blocking and resolve localization warnings before enabling newly imported languages.

## QA coverage

| Concern | Automated coverage |
| --- | --- |
| Languages, manual/automatic translation, protected terms, link/unlink, assignments and verification | `Kb.Tests/Articles/ArticleLifecycleSliceTests.cs`, translation repository tests |
| Stale source, synchronization, published-version safety, version comparison/restore | `Kb.Tests/Articles/ArticleLifecycleSliceTests.cs` |
| Viewer locale selection, availability, permissions, RTL routing | `Kb.Tests/Viewer/ViewerAccessTests.cs`, `frontend/kb-frontend/src/views/kb/viewer/viewerLocaleRouting.test.ts` |
| Localized search and export | `Kb.Tests/Search/InternalSearchTests.cs`, export slice tests |
| Locks and autosave | `Kb.Tests/Articles/ArticleDraftSliceTests.cs`, `frontend/kb-frontend/src/features/editor/drafts/useArticleDraftEditor.test.ts` |
| HelpJuice language mapping, safe unlinked fallback, category localization, idempotent reruns | `Kb.Tests/Migrations/HelpJuiceParsingTests.cs`, `Kb.Tests/Migrations/HelpJuiceImportWriterTests.cs` |

The suite is integration-focused (SQLite-backed backend slices plus frontend component/integration tests). A browser-only full E2E run still requires deployment-specific identity, storage, Typesense, and PDF renderer configuration.
