# todo — de-DE

Findings from translating and reviewing the German catalog that need a human
decision. Written by whoever translates; nothing generates or reads this file,
and rebuilding `work-de-DE.json` never touches it. Committed like the work file.

Five fields per entry: **Keys**, **What**, **Needs**, **Resolves into**, **State**.

It moves to `i18n/todo-de-DE.md` with the rest of the translator's files — see
`i18n-layout-plan.md`.

---

## Mrs. and Ms. both render "Frau"

- **Keys:** `module.nwind.employees.enum.title_of_courtesy.Mrs\.`,
  `module.nwind.employees.enum.title_of_courtesy.Ms\.`
- **What:** German business usage has no distinction, so the dropdown shows two
  identical entries. The translation is correct; the model's value set is what
  cannot survive translation. Other languages will hit this differently — French
  distinguishes Madame/Mademoiselle (though Mlle is deprecated in official use),
  Chinese has no equivalent split — so this may be several requirements on one
  field rather than one fix.
- **Needs:** a model decision — a different value set for German, or the pair
  collapsed.
- **Resolves into:** the platform model. This repo cannot fix it.
- **State:** open. **No automatic signal will ever close this** — nothing retires
  a `module.*` key, and `dropped.orphaned` only inspects the previous work file.

## Typo in the source: "facorites"

- **Key:** `module.admin.user_bookmarks.entity.description`
- **What:** the English reads "Manage and order your facorites for quick access
  to frequently used apps and records." The German renders the intent
  ("Favoriten").
- **Needs:** a fix to the model text.
- **Resolves into:** the platform model. Self-signalling — once fixed, the source
  changes, `en-US.json` records the new source against the same key, and the
  German shows as stale.
- **State:** open

## The same UI string is capitalized two ways in code

- **Keys:** `API Keys` / `API keys`; `CRM Home` / `CRM home`;
  `Validation Error` / `Validation error`
- **What:** a code string is keyed by its own English text, so writing the same
  label two ways creates **two keys** for one piece of UI — two entries to
  translate, two chances to diverge, and twice the discovery noise. The German is
  identical in each pair, so nothing is visibly wrong today.
- **Needs:** pick one spelling per pair in the SOURCE and use it at every call
  site. The orphaned key's translation then lands in `obsolete` on the next
  `i18n:extract`.
- **Resolves into:** the component source in this repo, then `de-DE.json`.
- **State:** open

## The postal-code description says no more than its title

- **Keys:** `module.nwind.{customers,employees,suppliers}.field.postal_code.description`
  (and the matching `.title`)
- **What:** the title is "Postal Code" and the description is "Postal or ZIP
  code" — the description exists to say the field accepts both forms. Both were
  translated as "Postleitzahl", so the German description carries none of that
  and is a redundant repeat of the label.
- **Needs:** a German description that keeps the distinction, e.g. "Postleitzahl
  oder ZIP-Code".
- **Resolves into:** `de-DE.json`.
- **State:** open

## Two judgment calls from the 596-string pass

- **Keys:** `module.nwind.orders.field.required_date.title` → "Wunschtermin";
  `module.admin.process_gates.entity.plural_label` → "Prozess-Gates"
- **What:** `Required Date` was rendered "Wunschtermin" (requested/desired date)
  rather than a literal "Benötigt am". `Process Gates` was kept as a product term
  rather than translated to something like "Prozessfreigaben", since a gate is not
  strictly an approval.
- **Needs:** confirm or override. Both are defensible; neither was asked for.
- **Resolves into:** `de-DE.json`.
- **State:** open

## "Position" serves both Position and Title

- **Keys:** `module.admin.dashboards.field.position.title` (EN "Position");
  `module.nwind.employees.field.title.title` (EN "Title")
- **What:** a dashboard's *position* (a sort/layout index) and an employee's
  *job title* both render "Position". The second is idiomatic German for a job
  title, but the two words now collide across modules.
- **Needs:** a look. If the employee field means job title, "Position" is fine
  and this is a coincidence, not a defect — but the dashboard one may want
  "Reihenfolge" or "Sortierung" if it is an ordering index rather than a place.
- **Resolves into:** `de-DE.json`.
- **State:** open

---

## Resolved

### Administration → Verwaltung

- **Key:** `module.admin.description`
- **What:** standalone `Administration` was rendered "Verwaltung" while
  `Admin Permission` became "Administrationsberechtigung" — one English word,
  two German words, inside one module's vocabulary, and the reverse of ordinary
  usage.
- **Ruling (owner):** SAP usage. Standalone `Administration` stays
  **Administration**; compounds naming what is managed take **-verwaltung**
  (Benutzerverwaltung, Rechteverwaltung). The `Admin*` compounds already followed
  this and are unchanged.
- **Resolved into:** `de-DE.json` — `module.admin.description` changed from
  "Verwaltung" to "Administration". Nowhere else; there is no term list.
- **State:** RULED, applied.

---

## Checked and NOT a defect

Kept so the next pass does not re-raise them. The consistency report (one English
source rendered two ways; one German rendering serving two sources) flags these
mechanically, and they are all correct.

- **`View` → "Anzeigen" and "Ansicht".** Two keys, not one: `View` (the row
  action, a verb) and `columnVisibility.View` (the menu label, a noun). This is
  the id-disambiguation mechanism working exactly as designed.
- **`Contains` and `Includes` → "Enthält".** Different contexts that never share
  a screen: `Contains` is a filter operator (a code string),
  `module.admin.permission_hierarchy.field.including_permission_name.*_parent`
  is a model relation label.
- **German collapses singular and plural** for `Benutzer`, `Mitarbeiter`,
  `Webhook-Empfänger`, and renders both `Filter`/`Filters` as "Filter". Correct.
- **`True`/`Yes` → "Ja" and `False`/`No` → "Nein".** Correct in both senses.
