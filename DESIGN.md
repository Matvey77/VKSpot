---
name: VKSpot
description: A local desktop music collection workspace with visible provenance.
colors:
  canvas: '#f4f6f5'
  surface: '#fff'
  shell: '#162d3b'
  ink: '#172e3a'
  muted: '#536570'
  line: '#d8e1e3'
  accent: '#087f73'
  accent-hover: '#06665e'
  selected: '#e6f3ef'
  control: '#fff'
  hover: '#f0f5f3'
  warning-bg: '#fff2d8'
  warning-ink: '#8b570c'
  error-bg: '#fff0f1'
  error-ink: '#a72d3a'
  local-bg: '#e8eff9'
  local-ink: '#315984'
  nav-text: '#bdcfd8'
  nav-hover: '#264655'
  nav-active: '#315467'
  dark-canvas: '#14232a'
  dark-surface: '#1c2e37'
  dark-ink: '#edf5f5'
  dark-muted: '#b0c2ca'
  dark-line: '#3a505a'
  dark-accent: '#54cbb2'
  dark-accent-hover: '#84dec9'
  dark-selected: '#244b45'
  dark-control: '#233842'
  dark-hover: '#293e46'
  dark-warning-bg: '#47381e'
  dark-warning-ink: '#ffdc99'
  dark-error-bg: '#472d35'
  dark-error-ink: '#ffb8c0'
  dark-local-bg: '#293e59'
  dark-local-ink: '#bad3fa'
  dark-primary-text: '#102b28'
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '14px'
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '12px'
  helper:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '11px'
    lineHeight: 1.6
  code:
    fontFamily: 'Consolas, monospace'
    fontSize: '12px'
rounded:
  tag: '4px'
  control: '6px'
  navigation: '7px'
  panel: '10px'
  dialog: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  field:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '36px'
  navigation-active:
    backgroundColor: '{colors.nav-active}'
    textColor: '{colors.surface}'
    rounded: '{rounded.navigation}'
    padding: '0 12px'
    height: '42px'
  destination-spotify:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.tag}'
    padding: '4px 7px'
  collection-panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
  provenance-inspector:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    width: '340px'
  welcome-guide-step:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    padding: '24px 0 0'
  welcome-route-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '42px'
---

# Design System: VKSpot

## Overview

**Creative North Star: "The Library Finding Aid"**

VKSpot's built Operate world is a restrained desktop collection workspace: deep ink-blue navigation, paper-like reading surfaces, tabular positions and careful annotations. Its personality comes from record keeping and visible evidence. The original direction was an implementation assumption delegated by the brief; this document refreshes it from the initial local build.

This is an Electron application rendered with web technologies, with Windows as the first tested host. Its reusable signature is **Original → Working copy → Destination**: preserve source descriptions, expose editable fields separately, and name the current destination explicitly. Russian copy is compact and direct. Review of the local interface does not validate live VK extraction, Spotify accounts or system automation end to end.

The first/default `Добро пожаловать` view adds an interactive Read-mode guide inside the same desktop shell. A clickable workflow and six-step selector lead to twelve scenes of actual application UI, captured with an isolated synthetic collection. Official service logos and the owner's combined VK + Spotify project mark extend the existing identity. The guide inherits the collection world's typography, palette and controls.

**Key Characteristics:**

- Persistent left navigation with service and job status, alongside a dense, virtualized collection table.
- Distinct source evidence, saved working values and unsaved edits.
- Quiet borders, tonal state feedback and restrained teal actions.
- Explicit omissions, uncertainty and retained destination alternatives.
- A readable first-entry guide with measured markers over actual UI captures, synthetic demo records and real navigation actions.

## Colors

Cool paper neutrals and a teal action accent make records readable. Frontmatter values come from `src/renderer/src/style.css` and are normative for this snapshot.

### Primary

- **Archival Teal** (`accent`, `accent-hover`): actions, keyboard focus, active Spotify destination and working-version annotations.
- **Pale Teal Selection** (`selected`): focused records and the active Spotify match. A retained Spotify alternative uses neutral hover tones.

### Neutral

- **Cool Canvas / Reading Paper** (`canvas`, `surface`, `control`): workspace, table and editable controls.
- **Deep Ink / Annotation Slate** (`ink`, `muted`): names, headings, labels and supporting metadata.
- **Quiet Rule / Hover Wash** (`line`, `hover`): separators, borders, transient and retained states.
- **Navigation Ink** (`shell`, `nav-text`, `nav-hover`, `nav-active`): persistent shell and visible current section.

### Semantic annotations

Amber (`warning-*`) means incomplete extraction or source unavailability; rose (`error-*`) means an action failed. Blue (`local-*`) marks the local destination. Source unavailability and exclusion do not mean deletion.

The saved dark setting remaps semantic CSS variables to `dark-*` values; the navigation shell stays ink-blue. Primary button text uses `dark-primary-text`, and local tags have a dark pair. Guide chrome inherits these variables and the screenshot source switches to the matching light/dark capture. The supplied welcome screenshots establish both guide themes; the earlier collection screenshots establish the light collection view.

Official VK blue and Spotify green/white remain inside their supplied SVG assets; they do not replace the interface's teal action accent. Spotify uses green on ordinary light surfaces and white in the dark theme, sidebar and primary buttons. The combined project mark preserves both service glyphs on an ink-blue rounded tile. Asset provenance is recorded in `docs/brand-assets.md`.

**The Active Destination Rule.** A saved alternative must be labelled as retained and must not look like a second active Spotify selection.

## Typography

**Interface Font:** local Segoe UI with system-ui and sans-serif fallbacks. **Code Font:** Consolas with a monospace fallback. No network font dependency.

Page headings use the headline role, reduced to (23px) in compact desktop. Section titles use the title role; inspector titles are (15px). The base uses body; table text and field labels use label. Track titles are medium (550), artists and supporting notes are (11px), and status labels are (10px). Paragraph line height is (1.6).

Positions, durations, totals and counts use tabular numerals. Single-line table names truncate; inspector source values, paths and candidates wrap to expose full evidence. The hierarchy supports scanning rather than display typography.

The detailed guide uses a welcome identity heading (29px), lead (17px / 1.5), section and active-step headings (21px), introductory annotation (14px), and active-step copy (14px / 1.65). At (1150px) and below, the welcome heading becomes (25px). The lead is constrained to (65ch), step-heading copy to (80ch), and detail to (95ch). Route controls are (13px), scene controls and locations (12px), instructions (13px / 1.65), and screenshot captions (11px / 1.5). These are guide-specific variants of the existing system font.

## Layout

The shell fills the available desktop content viewport (`100dvh`). The native window has a minimum outer height of (640px); the shell adapts to the smaller content area instead of imposing a second CSS minimum. Navigation is (226px) wide; the workspace expands from the top edge. There is no persistent topbar above the six main views. Main reading gutters are (32px), with a (16px) table/inspector gap. Search controls, filters and selection actions stay above the table; the collection footer stays below it. Table and inspector scroll independently. The compact table workspace can also scroll vertically when its controls exceed the available height.

The lower sidebar contains a compact system panel in place of the former privacy footer. Two adjacent status cells show Spotify and VK; each provides a short hint and opens the corresponding connection flow. Below them, the latest-created job shows its kind, state, cursor/total, percentage and progress bar, and opens the jobs view. VK states are unknown, checking, connected, sign-in required or error. They are inferred only from visible DOM signals on the existing VK page; a saved collection or URL is not evidence. The check does not read credentials or cookies and does not issue new network requests. The last checked status and time survive closing the VK window; clearing VK state resets them.

The header is (40px) high and records are (52px), matching virtualization. The table grid is checkbox (38px), position (48px), flexible title (`minmax(130px, 1fr)`), search result (158px), destination (140px), duration (62px), and comparison action (32px).

At widths of (1250px) and below, navigation contracts to (206px) and the (340px) inspector becomes a right overlay inside the collection work area. It covers part of the table, has its own scroll and close control, and leaves the shell visible. At (1000px) and below, navigation is (188px), reading gutters are (24px), heading actions stack, the archive action becomes an icon, and table columns contract to (34px / 38px / flexible title / 145px / 105px / 48px / 26px). Search and filter controls wrap, while the compact search action and automatic-continuation checkbox share a row when space permits.

These are compact desktop adaptations. No phone navigation or mobile layout is implemented. Fresh review evidence: `.local/evidence/e2e/large-desktop-test.png` (1424×881), `.local/evidence/e2e/compact-desktop-test.png` (984×721), and `.local/evidence/e2e/destination-alternatives-test.png` (1424×881). The large collection screenshot uses explicitly identified demo records.

The welcome guide scrolls within the workspace beside the persistent left navigation; it has no persistent topbar. Intro, workflow and route sections have a maximum width of (1320px); current-status copy keeps the earlier (1120px) limit. The identity pairs a (76px) project mark with text across a (22px) gap. Thin rules separate the continuous reading flow.

The clickable workflow uses five node columns separated by (22px) arrows; Spotify and local files share a vertically stacked branch. Nodes have a (126px) minimum height, with branch nodes (74px). At (1250px) and below, arrows hide and the workflow becomes three columns: the two destination branches occupy two columns side by side, and the final node occupies the remaining column. Compact nodes have a (104px) minimum height.

Six route controls wrap with a (7px) gap above one active step. Its heading places copy and a navigation action side by side with a (22px) gap. Scene buttons select alternate views of the same step. The actual screenshot fills a bordered canvas capped at (1184px), preserving its recorded aspect ratio. Measured highlight rectangles scale as percentages of that canvas. Instructions form two columns with a (12px) gap; at (1250px) and below they become one column and the heading action moves below the copy. Previous/next controls and the current step count close the active step. No old three-column illustration row is rendered.

Welcome evidence: `.local/evidence/e2e/welcome-desktop.png`, `.local/evidence/e2e/welcome-callout.png`, `.local/evidence/e2e/welcome-guide-compact.png`, and `.local/evidence/e2e/welcome-dark.png`. The guide's twenty-four assets are twelve scenes in light/dark pairs, captured at (1184×1001) from production Electron components by `tools/guide/capture.cjs`. Its temporary six-record profile, file metadata, candidates, Spotify responses and job are synthetic; no real account, audio file or owner collection was used. Capture windows are hidden and unfocusable. These establish local visual behavior, not live integration success.

## Elevation & Depth

Surfaces are flat at rest; borders and tone establish hierarchy. The compact inspector uses shadow `-10px 4px 25px #102a361f`; dialogs use `0 12px 48px #081b2b35` and a dimmed `#13262c80` backdrop. Rows and ordinary panels have no shadow.

State motion is a background transition (150ms). The busy spinner rotates linearly over (1.2s). Reduced-motion preference disables animations, transitions and smooth scrolling. There are no decorative entrance or navigation animations.

The welcome route anchor and workflow selections scroll the active guide into view smoothly unless reduced motion is requested. Route and scene selection changes content without decorative animation. Screenshot markers use a selected tonal ring (`0 0 0 3px var(--selected)`); the viewport-mounted explanation bubble uses `0 8px 32px #102a3633`. The screenshot zoom uses the existing modal/backdrop treatment.

## Shapes

Controls use the control radius, tags the smaller tag radius, and table/inspector panels the panel radius. Empty reading panels and dialogs use the dialog radius. Thin one-pixel borders and continuous row rules hold the collection together. Navigation has its own slightly softer radius. Simple line icons support actions; decorative music imagery is absent from the build.

Welcome workflow nodes, screenshot frames and explanation bubbles use the panel radius. Screenshot images have (9px) inner corners; measured highlights have (5px) corners. Numbered markers are circles (27px) with a (2px) surface border; instruction controls are circles (29px). The active step begins with a rule and uses an open reading layout.

## Components

### Buttons and fields

Primary actions use solid teal and weight (600); secondary actions use a bordered control surface. Default controls are (36px) high with frontmatter padding. Inspector actions are (32px), local reuse actions (30px), and retained Spotify reuse actions (28px). Disabled opacity is (.48). Focus uses an accent outline (2px) with offset (3px); row focus uses inset offset (-3px). Quiet icon actions retain accessible names.

Fields have labels above controls, a (6px) gap and (12px) space beneath. Working fields are editable; source fields are a definition list. Search and filter precede the table. Empty-library and filtered-empty treatments are separate.

### Navigation and collection table

The sidebar begins with `Добро пожаловать`, followed by Collection, Connections, Jobs, Archive and Export, and Settings in Russian. Welcome is the initial view; the VKSpot brand returns to it. The current section has a filled tone and `aria-current`; the current collection is independently marked. Focused row and checkbox selection are separate: opening a record highlights it, while checkboxes establish bulk-action membership. Enter or Space opens a keyboard-focused row.

Row vocabulary is `Нужен выбор`, `Spotify`, `Локальные`, `Исключённые`; `Недоступные в VK` is an independent source filter. Exclusion takes precedence in the destination column and strikes through the working title. Source unavailability remains an amber annotation beside the artist and in the original section. Excluded entries stay in the collection and archive. Job vocabulary is `Выполняется`, `Пауза`, `Завершено`, `Ошибка`, `Нужна сверка`.

### Provenance inspector

Three ruled sections carry the signature: `Оригинал из VK`, `Рабочая копия`, `Назначение`. The first shows immutable artist, title, ID, duration and availability. The second edits artist, title, version/author tag and note, with a separate exclusion control. Per-record drafts survive record and section navigation in the current session. Only saved changes enter the working copy and archive; unsaved drafts do not survive app closure. Save clears the cached draft. Search and Spotify selection wait until textual edits are saved.

The destination section states `Текущее назначение`: `Spotify`, `локальный файл` or `нужен выбор`. Active Spotify uses `Выбран Spotify`; a preserved alternative uses `Сохранённый вариант Spotify`, a neutral block and an explicit reuse action. Local evidence uses `Выбран локальный файл` or `Привязанный локальный вариант`, with path, codec, bitrate and tags. Candidates require explicit selection; a matching title does not confirm the recording version.

### Welcome guide

The annotation introduces local preparation, immutable source records and separate working edits. Its primary action is `Начать с VK` → Connections when no collection exists, or `Продолжить с коллекцией` → Collection when one exists. `У меня уже есть список` opens the actual import flow and disables while busy. `Посмотреть все шаги` links to the ordered route in the same scroll area.

The clickable workflow connects VK → full archive → working copy → Spotify catalogue or local files → a playlist checked against the plan. Each node selects its matching route step and scrolls to it. The result is a workflow goal, not proof that a live transfer has completed.

The six route steps are: source list, archives, working edits, Spotify search and review, existing local files, and transfer/reconciliation. Their selector uses `aria-current="step"`; scene buttons use `aria-pressed`. Step or scene changes reset the selected marker and close its explanation. The twelve scenes are source, archive, original evidence, working edits, Spotify connection, background search, bulk confirmation, version review, local binding, local preparation, transfer plan, and job reconciliation. `GuideAssets.ts` resolves each scene to the current theme and measured bounds in `assets/guide/captures.json`.

Navigation actions open the corresponding real sections and collection mode. Editing, local binding, background search and bulk selection open Table; version comparison opens Review; reconciliation opens Jobs. Search starts with the explicit `Фоновый поиск` action. Separate measured captures explain the result filter, full-selection actions, the reversible `Подтвердить выбранные` action and `Выбрать и дальше` beside the original. Local-file instructions name both the pending-file queue and the table inspector. The guide does not imply that opening a row runs a search or that metadata establishes audio identity.

### Collection review

Table is the default collection mode. Search-result status is separate from saved destination: an exact metadata candidate still needs confirmation. Destination and result filters combine with text; the header checkbox and explicit selection controls apply to the entire filtered dataset, including virtualized rows. Selection retains occurrence IDs and does not expand silently as new results arrive. The count identifies selected entries outside the current filter. Source order and intentional repeats remain unchanged; live status changes preserve scroll position.

Table retains the provenance inspector. The row arrow opens that occurrence in Review, using its current result group. Review uses the existing surfaces, typography, controls and borders; confirmation advances within the group and preserves reachable keyboard focus. Pending local files remain unresolved until a real file is linked. Archive/transfer/undo remain available above both modes.

Both collection-mode and result-group controls use `TabList.tsx`: one tab stop per group, automatic activation with Left/Right, Home/End, and a labelled, focusable panel linked through `aria-controls`. Resume acknowledges dispatch immediately; the long-running job cannot hold the interface's global busy state. Plain metadata matches remain an explicit bulk decision, while special-version spelling variants are reviewed individually.

Unavailable search and resume actions use `ExplainedButton.tsx`: the native button remains disabled, while a keyboard-focusable wrapper exposes its reason. Hover or focus opens a portal tooltip, bounded by the viewport, using the existing surface, ink and line tokens. Hovering the explanation keeps it readable; Escape, blur, pointer exit or user scrolling dismisses it. No unavailable action is silently enabled for the sake of a tooltip.

Spotify quota exhaustion and rate limiting are explicit waiting states in Table, Review and Jobs. The same saved deadline drives the local countdown, the displayed computer date/time and continuation availability. Found candidates and decisions remain usable. Automatic continuation is enabled by default and can be disabled in search controls or Settings. A main-process timer resumes only background searches after the deadline, with a verified connection and free queue; it survives application restart through persisted job intent. Manual pause remains authoritative, including when an in-flight request finishes later. Transfers and non-retryable failures are not auto-started. The interface promises a possible retry, not a successful quota reset.

Screenshots are actual UI captures containing synthetic demo records. Captions and alternative text identify both facts. Teal rectangles identify measured controls, with numbered interactive markers linked to instructions. Marker click opens a (310px) fixed explanation bubble through a body portal, clamped to the viewport. User wheel/touch movement, Escape, resize, step/scene change or its close control dismisses it; queued focus scrolling preserves the bubble. Instruction-number buttons select the matching highlight without opening a bubble. Enlarging a capture opens a labelled, dismissible Radix dialog, limited to `min(1400px, calc(100vw - 40px))`; the enlarged image remains a screenshot.

Current-status copy preserves the implementation limits: independently verify live VK extraction and account connections; a blocked title does not prove file access; matching titles do not confirm recording versions; automatic renaming/candidate selection is absent. Local file copies are prepared without transcoding, but audio downloading from VK and bulk interface addition are not implemented. Users add local files through Spotify and then reconcile mixed order with correct file tags. Archives contain descriptions and edits; audio backups remain separate. VKSpot is local and free to use, while the current Spotify API connection requires Premium for the API-app owner.

### Brand assets

`BrandIcons.tsx` is the shared wrapper for official VK and Spotify SVGs and the composed VKSpot project mark. Preserve their paths, proportions and supplied colors; use the service wrappers wherever a service is identified. Image elements are decorative beside visible text (`alt=""`, hidden from assistive technology). Standard service size is (24px); workflow service marks are (34px VK / 32px Spotify), sidebar project identity (44px), and welcome identity (76px). The project mark combines both services as explicitly requested by the owner; it does not imply endorsement. `docs/brand-assets.md` records the official sources and trademark boundary.

### Feedback and confirmation

Loading, asynchronous activity, success/error notices, empty library and filtered-empty have separate treatments. Notices contain actual action results. Import confirmation shows count, completeness warning and a sample. Transfer confirmation separates Spotify, local and unresolved totals. Local records require preparation and later mixed-order reconciliation; the UI does not claim audio upload through the Spotify API. This describes the current interface, not verified live integrations.

VK collection keeps an optional expected-count field beside its source controls.
An inline live status reports the collected count and waiting state, with a stop
action. Import confirmation shows the first and last three occurrences with
their actual positions. Unverified VK results require an explicit checkbox and
the action is labelled `Сохранить непроверенный список`; fully unread descriptions
produce an error instead of a successful preview. These controls reuse the
existing field, button, warning, dialog and native checkbox treatments in both themes.

## Do's and Don'ts

- **Do** keep original evidence legible beside working edits and explicit destination choice.
- **Do** retain duplicates, excluded entries and original positions; show omissions.
- **Do** preserve desktop density, independent scrolling and the compact inspector close control.
- **Do** identify demo records and distinguish source completeness warnings from action errors.
- **Do** label guide images as real UI with synthetic demo records, preserve theme pairs and measured control bounds, and connect guide actions to actual sections or import controls.
- **Do** use the supplied official service SVGs and combined project mark with their original proportions and contextual Spotify color variant.
- **Do** keep the saved-draft prerequisite and explicit `Найти в Spotify` trigger beside the measured search marker.
- **Do** preserve manual steps and current integration limits when describing the route.
- **Don't** style retained alternatives as active Spotify choices.
- **Don't** imply unsaved drafts are archived or durable across app closure.
- **Don't** infer verified extraction, matching, local-file automation or completed mixed transfer from a successful local screen.
- **Don't** treat screenshot contents, synthetic candidates or the workflow's final playlist as live account evidence.
- **Don't** substitute schematic screen drawings or placeholder service glyphs for the implemented capture and brand assets.
- **Don't** replace this desktop system with phone navigation or decorative graphics without a new brief.

### Guided operation, 0.1.11

The initial surface is now Operate: three sequential stages, one state-derived
primary action and an optional illustrated guide. The existing visual world is
preserved. StartPage derives the next step from imported rows, background jobs,
review obligations and transfer state. It does not infer audio identity.

Search through the Spotify page is the default. Import confirmation offers an
opt-out checkbox for automatic search. Search parameters and API credentials use
progressive disclosure. Completed search hides its empty start action and full
progress bar. The table retains all filters and selection tools, with a concise
contextual next action for matches or version review. API setup opens directly
when transfer requires it. Errors that need intervention expose a dismissible
context prompt; timed waits do not demand user action. Hints are available on
hover and keyboard focus, including enabled actions.

A sandboxed native Spotify view appears inside a full-window application panel
only when needed or requested. The panel header always provides a return action
and offers resume for a paused browser search. Behind-panel app content is inert.
It inherits the existing typography, spacing, controls and both themes. Browser
credentials are entered only on Spotify's own page, never collected by the app.
