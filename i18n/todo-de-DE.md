# todo — de-DE

Findings from translating and reviewing the German catalog that need a human
decision. Written by whoever translates; nothing generates or reads this file,
and rebuilding `work-de-DE.json` never touches it. Committed like the work file.

Five fields per entry: **Keys**, **What**, **Needs**, **Resolves into**, **State**.

Nothing is filed here as "checked" or "not a defect". An entry leaves this list
only through a ruling by the owner, recorded under **Resolved**.

The reference register is **SAP's German terminology**, following the
`Administration` ruling at the bottom. Two SAP registers exist and they differ —
SAP GUI (Anlegen / Ändern / Anzeigen / Sichern) and Fiori (Anlegen / Bearbeiten /
Anzeigen / Speichern) — so several entries below need the register picked before
the word can be picked.

---

## `Order` is translated "Bestellung", which is SAP's word for the opposite thing

- **Keys:** every `module.nwind.orders.*` and `module.nwind.order_details.*`
  label — `orders.entity.singular_label`, `.plural_label`,
  `orders.field._label.title`, `orders.field.ship_name.title`,
  `orders.field.order_date.title` ("Bestelldatum"),
  `orders.field.status.description`, `orders.entity.description`,
  `orders.field.{customer_id,employee_id,freight,ship_via}.description`,
  `order_details.entity.singular_label` / `.plural_label` ("Bestellposition(en)"),
  `order_details.field.order_id.title` and `.description` — plus the two code
  strings `Total Orders` and `Manage customer information and orders`, which say
  **"Aufträge"**.
- **What:** in SAP, *Bestellung* is a **purchase order** — what you send to a
  supplier (MM). A customer's order is a *Kundenauftrag*, short *Auftrag* (SD).
  Northwind's `orders` are customer orders: they have a customer, a ship-to
  address, freight and a shipper. So the entity is translated with the SAP word
  for the other direction of trade, and the dashboard says "Aufträge" for the same
  records — one English word, two German words, and the more frequent one is the
  SAP-wrong one. Exactly the `Administration` shape.
  The one place *Bestellung* IS right is
  `module.nwind.products.field.units_on_order.*` ("Bestellte Menge") beside
  `reorder_level` ("Meldebestand", SAP's own word) — that quantity really is on
  order **from a supplier**.
- **Needs:** a ruling. If SAP usage holds, `orders` becomes Auftrag / Aufträge /
  Auftragsdatum / Auftragspositionen, and `units_on_order` keeps Bestellung.
- **Resolves into:** `de-DE.json` (~20 keys).
- **State:** open

## `Created At` / `Updated At` are "Erstellt am" / "Aktualisiert am"

- **Keys:** 18 × `module.*.field.created_at.title`, 18 ×
  `module.*.field.updated_at.title` — every entity in both modules.
- **What:** SAP's standard administrative fields are **"Angelegt am"** and
  **"Geändert am"** (with Angelegt von / Geändert von). "Erstellt am" and
  "Aktualisiert am" are literal renderings of the English. This is the largest
  divergence in the catalog by key count, and it is invisible to every consistency
  check because both renderings are internally consistent. It is coupled to the
  verb entry below: if `Create` becomes "Anlegen", "Angelegt am" follows by itself.
- **Needs:** a ruling on Angelegt/Geändert vs Erstellt/Aktualisiert.
- **Resolves into:** `de-DE.json` (36 keys).
- **State:** open

## The verb set is mixed, and neither half is SAP's

- **Keys:** `Create`, `Create API Key`, `Create Customer`, `Create New Customer`
  ("erstellen") against `New {label}` ("{label} anlegen"), `{label} created`,
  `{label} {name} created` ("angelegt"), `Error creating record` ("Anlegen");
  `Edit`, `Edit Customer`, `Edit customer {id}`, `Edit in Modal`,
  `Edit in Sidebar`, `Edit Mode` ("Bearbeiten"); `Save`, `Save Changes`
  ("Speichern"); `Submit` ("Absenden").
- **What:** SAP's canonical triad is **Anlegen / Ändern / Anzeigen**, with
  *Sichern* for save in SAP GUI and *Bearbeiten* / *Speichern* in Fiori. This
  catalog uses "Erstellen" and "anlegen" for the SAME operation — the button says
  "Erstellen" and the toast that follows says "angelegt" — and takes the Fiori
  words for edit and save without anyone having chosen that register.
- **Needs:** pick the register, then one verb per operation, applied everywhere.
- **Resolves into:** `de-DE.json`.
- **State:** open

## `Edit Permission` → "Bearbeitungsberechtigung"

- **Keys:** `module.admin.entities.field.edit_permission.title` and
  `.edit_permission_label.title`.
- **What:** SAP's established compound is **Änderungsberechtigung** (from Ändern),
  beside Anzeigeberechtigung — which this catalog already uses and which IS SAP's
  word. So the pair is half-SAP: `View Permission` follows SAP, `Edit Permission`
  does not. Same family as the ruled `Administration` entry. `Manage Permission` →
  "Verwaltungsberechtigung" and `Admin Permission` → "Administrationsberechtigung"
  already follow the ruling.
- **Needs:** confirm Änderungsberechtigung, or state that the Fiori register
  (Bearbeiten) is intended and extends to the compounds.
- **Resolves into:** `de-DE.json`.
- **State:** open

## "Position" serves Position, Title and Contact Title — SAP would say Funktion

- **Keys:** `module.nwind.employees.field.title.title` (EN "Title" → "Position");
  `module.nwind.customers.field.contact_title.title` and
  `module.nwind.suppliers.field.contact_title.title` (EN "Contact Title" → both
  "Position des Ansprechpartners"); `module.admin.dashboards.field.position.title`
  (EN "Position") and `.position.description` ("Position in der
  Anzeigereihenfolge").
- **What:** three different things render as "Position". Worse in the SAP
  register: *Position* there means a **line item** (Auftragsposition,
  Belegposition) — which is also what `order_details` is called in this catalog
  ("Bestellposition"). SAP's word for a person's job title is **Funktion**
  ("Funktion des Ansprechpartners" is an SAP address field), and a display index is
  *Reihenfolge* / *Sortierreihenfolge*, never Position.
  The same field already contradicts itself: `employees.field.title.description`
  (EN "Job title") is rendered **"Funktionsbezeichnung"** while its own title says
  "Position". So the label and its help text use two different German words for
  one field, and the help text is the SAP-correct one.
- **Needs:** a ruling — likely Funktion for the two title fields and Reihenfolge
  for the dashboard field, which also removes the collision.
- **Resolves into:** `de-DE.json`.
- **State:** open

## The ship-to address block is compounded with "Liefer-"

- **Keys:** `module.nwind.orders.field.ship_address.title` ("Lieferadresse"),
  `.ship_city.title` ("Lieferort"), `.ship_country.title` ("Lieferland"),
  `.ship_region.title` ("Lieferregion"), `.ship_postal_code.title`
  ("Liefer-Postleitzahl"), `.ship_via.title` and `.ship_via_label.title`
  ("Versand über").
- **What:** SAP names this block after the **Lieferanschrift** / *Warenempfänger*
  and qualifies plain field names ("Postleitzahl", "Ort", "Land") instead of
  welding "Liefer-" onto each; "Liefer-Postleitzahl" is not a form SAP produces.
  "Versand über" ends on a preposition, which SAP labels do not — SAP has
  *Versandart* for the method and *Spediteur* for the carrier, and this field
  points at the Shipper entity, which is already "Spediteur".
- **Needs:** a ruling on the block, and a decision whether `ship_via` names the
  carrier or the method.
- **Resolves into:** `de-DE.json` (7 keys).
- **State:** open

## Boolean fields are labeled "Ist …"

- **Keys:** `module.admin.entities.field.is_child.title` ("Ist untergeordnet"),
  `module.admin.users.field.is_agent.title` ("Ist Agent"),
  `module.admin.users.field.is_disabled.title` ("Ist deaktiviert"); related:
  `module.nwind.products.field.discontinued.title` ("Auslaufartikel").
- **What:** "Ist …" is the English `is_` prefix carried into German. SAP labels a
  boolean with the state itself — "Untergeordnet", "Gesperrt", "Agent" — and
  `module.admin.entities.field.managed.title` ("Verwaltet") and `.searchable.title`
  ("Durchsuchbar") already do exactly that, so the catalog contradicts itself.
  `Discontinued` is the reverse problem: a **noun** ("Auslaufartikel") for a flag
  on a product, where SAP says "Ausgelaufen" / *Auslaufteil*.
  The descriptions treat the boolean keyword two ways as well:
  `module.admin.users.field.is_agent.description` keeps the English literal ("Wenn
  TRUE, ist dieser Benutzer ein Dienstkonto") while
  `module.admin.entities.field.managed.description` translates it ("Wenn falsch,
  ist die automatische DDL-Ausführung deaktiviert") — and the UI shows neither, it
  shows Ja/Nein.
- **Needs:** a rule for boolean labels and for how a boolean is named in a
  description, then the four keys and the two sentences.
- **Resolves into:** `de-DE.json`.
- **State:** open

## Enum values: English shows the raw token, German shows prose

- **Keys:** all 29 `module.*.enum.*` keys. Examples:
  `module.admin.entities.enum.entity_type.operational_record` (EN
  "operational_record" → DE "Operativer Datensatz"),
  `module.admin.webhook_receivers.enum.auth_type.none` ("none" → "Keine"),
  `module.nwind.orders.enum.status.pending` ("pending" → "Offen").
- **What:** the model stores raw values and the English UI shows them unchanged;
  the German turns them into display text. The two languages therefore differ in
  KIND, not only in language — an English user reads `operational_record`, a German
  one reads "Operativer Datensatz". Either the model carries display labels for
  every language, or German should not be doing that job alone and unasked.
- **Needs:** a decision on where enum display text belongs. Three individual calls
  hang off it:
  - `module.admin.roles.enum.origin.user` → "Benutzer" is very likely **wrong**:
    the field is a role's origin (system / model / model_master / user), so the
    value means *user-defined*, and "Benutzer" collides with the Users entity
    label. SAP register: "Benutzerdefiniert".
  - `module.admin.modules.enum.module_type.master` → "Master" and
    `module.admin.roles.enum.origin.model_master` → "Modell (Master)" keep an
    English word where SAP has **Stammdaten** (master data).
  - `module.nwind.orders.enum.status.shipped` → "Versendet"; SAP SD says
    *Ausgeliefert*. ("Offen" for pending is already SAP's word.)
  - **The descriptions still print the raw tokens, in German sentences.**
    `module.admin.entities.field.edit_mode.description` says "auto, sidebar, modal
    oder page" while the dropdown offers "Automatisch / Seitenleiste / Dialog /
    Seite"; same for `module.admin.modules.field.module_type.description`
    ("domain (normal) oder master") and
    `module.admin.webhook_receivers.field.auth_type.description` ("none, hmac oder
    benutzerdefinierter Header"). A German user cannot map the help text onto the
    values offered. Whatever is decided for the values has to reach these three
    sentences too.
- **Resolves into:** the platform model, then `de-DE.json`.
- **State:** open

## `Order Column` → "Sortierspalte"

- **Key:** `module.admin.entities.field.order_column.title`
- **What:** the column stores a **fixed row order** — its own description says so
  ("Speichert eine feste Zeilenreihenfolge in dieser Spalte") and the grid uses it
  for drag-and-drop reordering. "Sortierspalte" says the opposite: a column that
  sorting happens by. Two entries away,
  `module.admin.processes.field.ordering.title` ("Ordering") is rendered
  "Reihenfolge".
- **Needs:** confirm or override; likely "Reihenfolgespalte".
- **Resolves into:** `de-DE.json`.
- **State:** open

## `Pending` is "Ausstehend" in code and "Offen" in the model

- **Keys:** the code string `Pending` ("Ausstehend") and
  `module.nwind.orders.enum.status.pending` ("Offen").
- **What:** one English word, two German words, for what a user reads as the same
  state. The two keys differ only in **capitalization** of the source, which is why
  no consistency check catches it: the "same source, two renderings" report
  compares exact strings. SAP's order status vocabulary is *Offen* / *Erledigt*.
- **Needs:** one word for the state, applied to both keys.
- **Resolves into:** `de-DE.json`.
- **State:** open

## `Clear` is rendered four different ways, and collides with `Reset`

- **Keys:** `Clear` ("Leeren"), `Clear search` ("Suche löschen"),
  `Clear selection` ("Auswahl aufheben"), `Clear sort` ("Sortierung aufheben"),
  `Clear all filters` ("Alle Filter zurücksetzen"); beside `Reset`
  ("Zurücksetzen"), `Reset filters` ("Filter zurücksetzen"), `Reset sorting`
  ("Sortierung zurücksetzen").
- **What:** one English verb becomes leeren / löschen / aufheben / zurücksetzen,
  and the fourth of those is the word already carrying `Reset`. In the filter UI
  the result is "Alle Filter zurücksetzen" (Clear all filters) next to "Filter
  zurücksetzen" (Reset filters) — two controls whose German differs by one word,
  where the English differs by a verb. `Clear sort` and `Reset sorting` are the
  same pair for sorting ("Sortierung aufheben" / "Sortierung zurücksetzen").
- **Needs:** a decision on whether Clear and Reset are one action or two in the
  UI, then one German verb per action — and, if they are one action, the duplicate
  removed from the SOURCE.
- **Resolves into:** the component source in this repo, then `de-DE.json`.
- **State:** open

## The filter operator vocabulary is literal English, not SAP

- **Keys:** `Where` ("Wenn"), `Is` ("Ist"), `Is not` ("Ist nicht"), `Is empty`
  ("Ist leer"), `Is not empty`, `Is greater than` ("Ist größer als"),
  `Is greater than or equal to`, `Is less than`, `Is less than or equal to`,
  `Is between` ("Liegt zwischen"), `Is after` / `Is before` / `Is on or after` /
  `Is on or before`, `Is relative to today`, `Contains` ("Enthält"),
  `Does not contain`, `Has any of` ("Enthält eines von"), `Has none of`
  ("Enthält keines von").
- **What:** SAP names operators without the copula — *gleich*, *ungleich*,
  *größer als*, *zwischen*, *enthält*, *ist initial* — so a German SAP user reads
  "Ist größer als" as a sentence fragment rather than an operator. Three of the
  operators additionally start with "Enthält" (`Contains`, `Has any of`,
  `Has none of`), which makes an operator dropdown hard to scan. `Where` → "Wenn"
  is a condition word, not SAP's filter vocabulary.
- **Needs:** a ruling on the whole operator set; it is one vocabulary, not
  seventeen separate calls.
- **Resolves into:** `de-DE.json` (17 keys).
- **State:** open

## Three vocabularies for one pagination control

- **Keys:** `Rows per page` ("Zeilen pro Seite"), `Items per page` ("Einträge pro
  Seite"), `Select page size` ("Seitengröße auswählen"); beside
  `{start}-{end} of {total} items` ("von {total} Einträgen") and `Page {page} of
  {total}`.
- **What:** the same control is a row count, an item count and a page size,
  in English and therefore in German. Zeile / Eintrag / Seitengröße are three
  different mental models of one dropdown.
- **Needs:** one term in the SOURCE, then one in German.
- **Resolves into:** the component source in this repo, then `de-DE.json`.
- **State:** open

## "Owner" is rendered three ways

- **Keys:** `module.admin.entities.field.catalog_owner_module.title`
  ("Katalog-Eigentümermodul"), `module.admin.processes.field.module_id.description`
  (EN "Owning module" → "Besitzendes Modul"),
  `module.admin.user_bookmarks.field.user_id.description` (EN "Owner of this
  bookmark" → "Eigentümer dieses Favoriten").
- **What:** Eigentümer- / besitzend- / Eigentümer, for one relationship. SAP uses
  *Eigentümer* and, for a module or object, "zugehörig". "Besitzend" is not an SAP
  form.
- **Needs:** one word.
- **Resolves into:** `de-DE.json`.
- **State:** open

## "UI" is rendered both as "UI" and as "Oberfläche"

- **Keys:** `module.admin.entities.field.edit_mode.description`
  ("UI-Bearbeitungsmodus"), against
  `module.admin.entities.field.singular_label.description` and
  `.plural_label.description` ("für Oberfläche und Berichte").
- **What:** one abbreviation, two treatments, inside one entity's field
  descriptions. SAP writes *Oberfläche* (Benutzeroberfläche) in prose.
- **Needs:** one of the two.
- **Resolves into:** `de-DE.json`.
- **State:** open

## `Bookmark` and `Favorites` were merged into one German word

- **Keys:** `module.admin.user_bookmarks.entity.singular_label` (EN "User
  Bookmark" → "Favorit"), `.field.title.title` (same), `.field.url.description`
  ("Bookmark URL" → "URL des Favoriten"); beside the code strings `Favorites`,
  `Add to favorites`, `Remove from favorites`, `Manage Favorites`.
- **What:** the English model says Bookmark and the English UI says Favorites; the
  German says "Favorit" for both. That repairs an English inconsistency inside the
  translation, where nobody reading the model can see it. SAP itself uses
  *Favoriten* (SAP Easy Access) and *Lesezeichen* for a browser bookmark, so the
  German word is defensible — the unrecorded decision is that the distinction was
  dropped.
- **Needs:** either the English model renamed to Favorite, or a statement that the
  merge is intended.
- **Resolves into:** the platform model, then `de-DE.json`.
- **State:** open

## Duplicate English source strings for one piece of UI

- **Keys:** `API Keys` / `API keys`; `CRM Home` / `CRM home`;
  `Validation Error` / `Validation error`; **`Back to Home` / `Return to Home`**.
- **What:** a code string is keyed by its own English text, so writing the same
  label two ways creates **two keys** for one piece of UI — two entries to
  translate, two chances to diverge, twice the discovery noise. The first three are
  casing pairs; the fourth is two different wordings for the same action, both
  rendering "Zurück zur Startseite". The German is identical within each pair, so
  nothing is visibly wrong today.
- **Needs:** pick one spelling and one wording per pair in the SOURCE and use it at
  every call site. The orphaned key's translation then lands in `obsolete` on the
  next `i18n:extract`.
- **Resolves into:** the component source in this repo, then `de-DE.json`.
- **State:** open

## Audit, validation and operation vocabulary is literal, not SAP

- **Keys:** `module.admin.entities.field.audit_log.title` ("Audit-Protokoll"),
  `module.admin.audit_record_logs.entity.singular_label` / `.plural_label`
  ("Datensatz-Audit-Protokoll(e)"), `module.admin.audit_ddl_logs.entity.*`
  ("DDL-Audit-Protokoll(e)"), `module.admin.audit_record_logs.field.op.title`
  (EN "Operation" → "Operation"),
  `module.admin.entities.field.validation_rules.title` ("Validierungsregeln"), the
  code string `Validation Error` ("Validierungsfehler"),
  `module.admin.entities.field.select_rule.title` ("Select-Regel").
- **What:** SAP records row-level history as *Änderungsbelege* and calls the
  general artifact a *Protokoll*; a database operation is a *Vorgang*, not an
  "Operation"; a validation is a *Prüfung*, giving Prüfregeln and Prüffehler.
  "Select-Regel" is half-translated — an English keyword welded to a German noun.
- **Needs:** a ruling per term. "Audit" may be worth keeping as a product term, but
  that should be a decision rather than a default.
- **Resolves into:** `de-DE.json`.
- **State:** open

## Single-word calls where SAP has a different established word

- **Keys and renderings:**
  - `(required)` → "(erforderlich)"; SAP: *Pflichtfeld* / "(Pflichtangabe)".
  - `Revoke`, `Revoke API Key`, `Revoke API key {name}` → "widerrufen"; SAP:
    *entziehen* (Berechtigung entziehen) or "sperren".
  - `Submit` → "Absenden"; SAP: "Senden".
  - `module.nwind.employees.field.notes.title` → "Notizen"; SAP: *Bemerkungen*.
  - `module.nwind.orders.field.freight.title` → "Frachtkosten"; SAP: *Fracht*
    (the field holds the charge, so either is arguable).
  - `module.nwind.{customers,employees,suppliers}.field.address.title`
    (EN "Street Address") → "Straße"; SAP splits *Straße* / *Hausnummer* and calls
    the whole line *Anschrift*.
  - `module.admin.modules.enum.access_scope.basic` → "Einfach"; SAP: *Basis*.
  - `module.admin.modules.field.default_viewer_role_id.title` →
    "Standard-Betrachterrolle"; SAP has no *Betrachter* — it says *Anzeigen* /
    Anzeigeberechtigter.
  - `module.admin.webhook_receivers.field.secret.title` → "Geheimschlüssel"; the
    value is a signing secret, not a key.
  - `module.admin.users.field.last_seen.title` → "Zuletzt gesehen"; SAP: "Letzter
    Zugriff" / "Zuletzt angemeldet".
  - `module.admin.roles.field.slug.title` → "Slug", kept in English. No SAP term
    exists; it stays only if that is a decision.
  - `Account`, `Sign in with a different account` → "Konto"; in SAP a *Konto* is
    a G/L account — a user's is a *Benutzerkonto*.
  - `module.admin.users.field.is_agent.description`: "service principal" →
    "Dienstkonto"; SAP says *technischer Benutzer* / Kommunikationsbenutzer.
  - `Suspended` → "Gesperrt" beside `Is Disabled` → "Ist deaktiviert" — two
    states of a user account, two unrelated German words.
  - `Message` → "Text" in the translate-mode panel, where it labels a code string
    against a keyed one; "Text" drops the distinction the label exists to make.
  - `Form playground` → "Formular-Spielwiese" — a developer route translated as
    prose. Fine if intended; it was not decided.
- **What:** each is defensible in isolation and none is caught by any check;
  together they set the product's register away from SAP.
- **Needs:** one pass with a ruling per line.
- **Resolves into:** `de-DE.json`.
- **State:** open

## The English source contradicts itself on `homepage`

- **Keys:** `module.nwind.suppliers.field.homepage.title` (EN "Homepage" → DE
  "Website") and `.homepage.description` (EN "Supplier website URL" → DE "URL der
  Website des Lieferanten").
- **What:** the model's own title and description disagree — "Homepage" against
  "website URL" — and the German followed the description, so the two German
  strings are consistent with each other while the German title no longer matches
  the English title. A homepage is one page of a website. Everywhere else "Home"
  is "Startseite" (`module.admin.modules.field.home_page.title`).
- **Needs:** the model's English decided first (Homepage or Website), then the
  German aligned to it.
- **Resolves into:** the platform model, then `de-DE.json`.
- **State:** open

## `View` renders as both "Anzeigen" and "Ansicht"

- **Keys:** `View` (the row action) and `columnVisibility.View` (the menu label).
- **What:** two keys for one English word, disambiguated by id — the mechanism
  working as designed, and both renderings match SAP (*Anzeigen* for the action,
  *Ansicht* for the noun). Recorded because it is a decision that was made, and
  because `View Permission` → "Anzeigeberechtigung" ties into the permission entry
  above.
- **Needs:** confirmation.
- **Resolves into:** `de-DE.json`, or nothing.
- **State:** open

## `Contains` and `Includes` both render "Enthält"

- **Keys:** `Contains` (a grid filter operator, a code string);
  `module.admin.permission_hierarchy.field.including_permission_name.singular_label_parent`
  and `.plural_label_parent` (a model relation label).
- **What:** two English words, one German word. They never share a screen today, so
  nothing is visibly wrong — but the permission hierarchy pairs
  "Included"/"Including" ("Name der enthaltenen Berechtigung" / "Name der
  einschließenden Berechtigung"), and the parent labels drop that distinction.
  The entity description goes further: `module.admin.permission_hierarchy.entity`
  turns "Defines permission inclusion" into **"Berechtigungsvererbung"** —
  inheritance, which is a different mechanism from inclusion and is not what the
  rest of the entity says.
- **Needs:** a look at the hierarchy screens to confirm the direction still reads,
  and a decision on inclusion vs Vererbung.
- **Resolves into:** `de-DE.json`.
- **State:** open

## German collapses singular and plural on four entities

- **Keys:** `module.admin.users.entity.singular_label` / `.plural_label` (both
  "Benutzer"); `module.nwind.employees.entity.*` (both "Mitarbeiter");
  `module.admin.webhook_receivers.entity.*` (both "Webhook-Empfänger"); the code
  strings `Filter` / `Filters` (both "Filter").
- **What:** German morphology, not a translation error — but every sentence built
  with `{label}` inherits it, so "Keine {label} gefunden." and "{label} anlegen"
  read differently for these than for entities that do inflect.
- **Needs:** confirmation that the collapsed forms are acceptable in the
  interpolated sentences.
- **Resolves into:** `de-DE.json`, or nothing.
- **State:** open

## `True`/`Yes` → "Ja" and `False`/`No` → "Nein"

- **Keys:** `True`, `Yes`, `False`, `No`.
- **What:** two English pairs, one German pair. Correct in both senses, and SAP
  renders boolean values as Ja/Nein — but a boolean cell and a confirmation button
  now carry the same word, and nothing distinguishes them if one of the two ever
  needs to change.
- **Needs:** confirmation.
- **Resolves into:** `de-DE.json`, or nothing.
- **State:** open

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
  rather than a literal "Benötigt am" — SAP does have *Wunschlieferdatum* /
  "Kundenwunschtermin", so this one is in register. `Process Gates` was kept as a
  product term rather than translated to something like "Prozessfreigaben", since a
  gate is not strictly an approval; SAP's nearest words are *Quality Gate* (which
  SAP also keeps in English) and *Meilenstein*.
- **Needs:** confirm or override. Both are defensible; neither was asked for.
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
