/**
 * The format registry: one entry per catalog format, and nothing else.
 *
 * `Record<FormatName, FormatEntry>` is the whole point. The catalog
 * (`sem-schema/formats.json`) is the list of formats, so adding one there fails
 * `tsc` here until it has an entry — a format can no longer arrive and silently
 * render as a text box, which is what `controls[format] || InputText` did.
 *
 * The entry also absorbs the per-format lists that used to be spelled out as
 * `format === 'x' || format === 'y'` chains in four different files, two pairs
 * of which had already drifted apart:
 *   - `width`       was SchemaForm.getDefaultWidthForForm and the grid's own copy
 *   - `emptyValue`  was the submit-time "empty becomes null" list
 *   - `gridColumn`  was the grid's and the skeleton's "too big for a cell" skip
 * Read them from here; do not re-derive them at a call site.
 */

import type React from 'react'
import type { FormatName } from '@/lib/formats'
import { InputText } from './InputText'
import { InputEmail } from './InputEmail'
import { InputNumber } from './InputNumber'
import { InputTextarea } from './InputTextarea'
import { InputBoolean } from './InputBoolean'
import { InputDate } from './InputDate'
import { InputJson } from './InputJson'
import { InputHtml } from './InputHtml'
import { InputCode } from './InputCode'
import { InputJsonata } from './InputJsonata'
import { InputDateTime } from './InputDateTime'
import { InputTime } from './InputTime'
import { InputDuration } from './InputDuration'
import { InputHostname } from './InputHostname'
import { InputIpv4 } from './InputIpv4'
import { InputIpv6 } from './InputIpv6'
import { InputUri } from './InputUri'
import { InputUriReference } from './InputUriReference'
import { InputUrl } from './InputUrl'
import { InputPassword } from './InputPassword'
import { InputFile } from './InputFile'
import { InputUuid } from './InputUuid'
import { InputUriTemplate } from './InputUriTemplate'
import { InputJsonPointer } from './InputJsonPointer'
import { InputJsonPointerUriFragment } from './InputJsonPointerUriFragment'
import { InputRelativeJsonPointer } from './InputRelativeJsonPointer'
import { InputRegex } from './InputRegex'
import { InputEnum } from './InputEnum'
import { InputReference } from './InputReference'
import type { FormControlProps } from './types'

export interface FormatEntry {
  control: React.ComponentType<FormControlProps>
  /** Field width bucket: small, medium, or the full row. */
  width: 's' | 'm' | 'w'
  /**
   * What an empty editor submits. Absent means `''` — a text column takes it.
   * `'null'` is for columns that reject an empty string (date/time/uuid/bytea);
   * `'default'` is the JSON family, which saves the property's schema default.
   */
  emptyValue?: 'null' | 'default'
  /** Whether the grid and its skeleton give this format a column. */
  gridColumn: boolean
}

/** A field of ordinary width, shown in the grid. */
const text = (control: FormatEntry['control']): FormatEntry => ({
  control,
  width: 'm',
  gridColumn: true,
})

/** A figure or a toggle: far less room than a sentence needs. */
const compact = (control: FormatEntry['control']): FormatEntry => ({
  control,
  width: 's',
  gridColumn: true,
})

/** A JSON-family editor: full row, its own entry in neither grid nor skeleton. */
const jsonEditor: FormatEntry = {
  control: InputJson,
  width: 'w',
  emptyValue: 'default',
  gridColumn: false,
}

export const controls: Record<FormatName, FormatEntry> = {
  // Structured data. Every one of these is edited as JSON text and parsed on
  // submit; an empty editor saves the property's `default`.
  json: jsonEditor,
  jsonlogic: jsonEditor,
  object: jsonEditor,
  array: jsonEditor,

  // Long-form text: wide, and too big for a grid cell.
  multiline: { control: InputTextarea, width: 'w', gridColumn: true },
  html: { control: InputHtml, width: 'w', gridColumn: false },
  code: { control: InputCode, width: 'w', gridColumn: true },
  jsonata: { control: InputJsonata, width: 'w', gridColumn: true },

  // Plain text and identity.
  text: text(InputText),
  string: text(InputText),
  password: text(InputPassword),
  uuid: { control: InputUuid, width: 'm', emptyValue: 'null', gridColumn: true },

  // Relations.
  reference: text(InputReference),
  parent: text(InputReference),
  enum: text(InputEnum),

  // Date and time. All three are typed columns that reject an empty string.
  date: { control: InputDate, width: 'm', emptyValue: 'null', gridColumn: true },
  time: { control: InputTime, width: 'm', emptyValue: 'null', gridColumn: true },
  'date-time': { control: InputDateTime, width: 'm', emptyValue: 'null', gridColumn: true },
  duration: { control: InputDuration, width: 'm', emptyValue: 'null', gridColumn: true },

  // Addresses. `email` also serves `idn-email`, `uri` also `iri`, and
  // `uri-reference` also `iri-reference`: one control each, no ASCII restriction.
  email: text(InputEmail),
  'idn-email': text(InputEmail),
  hostname: text(InputHostname),
  'idn-hostname': text(InputHostname),
  uri: text(InputUri),
  iri: text(InputUri),
  'uri-reference': text(InputUriReference),
  'iri-reference': text(InputUriReference),
  'uri-template': text(InputUriTemplate),
  url: text(InputUrl),
  ipv4: text(InputIpv4),
  ipv6: text(InputIpv6),

  // Pointers and patterns.
  regex: text(InputRegex),
  'json-pointer': text(InputJsonPointer),
  'json-pointer-uri-fragment': text(InputJsonPointerUriFragment),
  'relative-json-pointer': text(InputRelativeJsonPointer),

  // Binary. Empty is null — a BYTEA column rejects an empty string.
  binary: { control: InputFile, width: 'm', emptyValue: 'null', gridColumn: false },
  byte: { control: InputFile, width: 'm', emptyValue: 'null', gridColumn: false },

  // Numbers. Small, because a figure needs far less room than a sentence.
  int32: compact(InputNumber),
  int64: compact(InputNumber),
  integer: compact(InputNumber),
  float: compact(InputNumber),
  double: compact(InputNumber),
  number: compact(InputNumber),

  boolean: compact(InputBoolean),
}
