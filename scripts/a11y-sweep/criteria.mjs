/**
 * WCAG 2.2 Level A + AA, and the report vocabulary.
 *
 * The reason this list is written out in full rather than derived from whatever
 * axe happens to emit: a criterion no rule covers is simply ABSENT from an axe
 * payload, and absence rendered as a pass is the one thing that would turn this
 * output into a dishonest conformance claim. Enumerating the criteria first means
 * "not evaluated" is the default and evidence has to argue its way up from there.
 */

export const STATUS = {
  SUPPORTS: 'Supports',
  PARTIAL: 'Partially Supports',
  FAILS: 'Does Not Support',
  NOT_APPLICABLE: 'Not Applicable',
  NOT_EVALUATED: 'Not Evaluated',
}

/** Statuses that must never be reported without positive evidence. */
export const PASSING_STATUSES = new Set([STATUS.SUPPORTS, STATUS.NOT_APPLICABLE])

export const CRITERIA = [
  // --- Level A ---
  ['1.1.1', 'A', 'Non-text Content'],
  ['1.2.1', 'A', 'Audio-only and Video-only (Prerecorded)'],
  ['1.2.2', 'A', 'Captions (Prerecorded)'],
  ['1.2.3', 'A', 'Audio Description or Media Alternative (Prerecorded)'],
  ['1.3.1', 'A', 'Info and Relationships'],
  ['1.3.2', 'A', 'Meaningful Sequence'],
  ['1.3.3', 'A', 'Sensory Characteristics'],
  ['1.4.1', 'A', 'Use of Color'],
  ['1.4.2', 'A', 'Audio Control'],
  ['2.1.1', 'A', 'Keyboard'],
  ['2.1.2', 'A', 'No Keyboard Trap'],
  ['2.1.4', 'A', 'Character Key Shortcuts'],
  ['2.2.1', 'A', 'Timing Adjustable'],
  ['2.2.2', 'A', 'Pause, Stop, Hide'],
  ['2.3.1', 'A', 'Three Flashes or Below Threshold'],
  ['2.4.1', 'A', 'Bypass Blocks'],
  ['2.4.2', 'A', 'Page Titled'],
  ['2.4.3', 'A', 'Focus Order'],
  ['2.4.4', 'A', 'Link Purpose (In Context)'],
  ['2.5.1', 'A', 'Pointer Gestures'],
  ['2.5.2', 'A', 'Pointer Cancellation'],
  ['2.5.3', 'A', 'Label in Name'],
  ['2.5.4', 'A', 'Motion Actuation'],
  ['3.1.1', 'A', 'Language of Page'],
  ['3.2.1', 'A', 'On Focus'],
  ['3.2.2', 'A', 'On Input'],
  ['3.2.6', 'A', 'Consistent Help'],
  ['3.3.1', 'A', 'Error Identification'],
  ['3.3.2', 'A', 'Labels or Instructions'],
  ['3.3.7', 'A', 'Redundant Entry'],
  ['4.1.2', 'A', 'Name, Role, Value'],
  // --- Level AA ---
  ['1.2.4', 'AA', 'Captions (Live)'],
  ['1.2.5', 'AA', 'Audio Description (Prerecorded)'],
  ['1.3.4', 'AA', 'Orientation'],
  ['1.3.5', 'AA', 'Identify Input Purpose'],
  ['1.4.3', 'AA', 'Contrast (Minimum)'],
  ['1.4.4', 'AA', 'Resize Text'],
  ['1.4.5', 'AA', 'Images of Text'],
  ['1.4.10', 'AA', 'Reflow'],
  ['1.4.11', 'AA', 'Non-text Contrast'],
  ['1.4.12', 'AA', 'Text Spacing'],
  ['1.4.13', 'AA', 'Content on Hover or Focus'],
  ['2.4.5', 'AA', 'Multiple Ways'],
  ['2.4.6', 'AA', 'Headings and Labels'],
  ['2.4.7', 'AA', 'Focus Visible'],
  ['2.4.11', 'AA', 'Focus Not Obscured (Minimum)'],
  ['2.5.7', 'AA', 'Dragging Movements'],
  ['2.5.8', 'AA', 'Target Size (Minimum)'],
  ['3.1.2', 'AA', 'Language of Parts'],
  ['3.2.3', 'AA', 'Consistent Navigation'],
  ['3.2.4', 'AA', 'Consistent Identification'],
  ['3.3.3', 'AA', 'Error Suggestion'],
  ['3.3.4', 'AA', 'Error Prevention (Legal, Financial, Data)'],
  ['3.3.8', 'AA', 'Accessible Authentication (Minimum)'],
  ['4.1.3', 'AA', 'Status Messages'],
].map(([id, level, name]) => ({ id, level, name }))

/**
 * The four criteria that have no machine pass condition, because each asks
 * whether something is GOOD rather than whether it is PRESENT. The sweep dumps
 * the raw material for each into the run artifact so a reviewer skims a diff
 * instead of running a scheduled audit; none of them may report Supports on the
 * strength of that evidence alone.
 */
export const REVIEW_ONLY = {
  '1.1.1': 'Every alt string is emitted; whether each one is accurate is a human judgement.',
  '2.4.3': 'The tab order per route is emitted; whether it is meaningful is a human judgement.',
  '2.4.6': 'Every heading is emitted; whether it is descriptive is a human judgement.',
  '4.1.3': 'Every live region and its text is emitted; whether the announcement is useful is a human judgement.',
}

/** `wcag143` → `1.4.3`. axe tags every rule with the criteria it maps to. */
export function tagToCriterion(tag) {
  const m = /^wcag(\d)(\d)(\d+)$/.exec(tag)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}
