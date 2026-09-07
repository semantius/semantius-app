import { SCOPE, type TranslateFn, type TranslationScope } from '@/i18n'

/** A scope, named for a translator. Takes `t` so the caller's component re-renders it. */
export function scopeLabel(t: TranslateFn, scope: TranslationScope): string {
  switch (scope) {
    case SCOPE.table:
      return t({ message: 'Table', context: 'translation scope' })
    case SCOPE.column:
      return t({ message: 'Column', context: 'translation scope' })
    case SCOPE.enum:
      return t({ message: 'Enum value', context: 'translation scope' })
    case SCOPE.module:
      return t({ message: 'Module', context: 'translation scope' })
    case SCOPE.server:
      return t({ message: 'Server message', context: 'translation scope' })
    case SCOPE.rule:
      return t({ message: 'Rule message', context: 'translation scope' })
    default:
      return t({ message: 'Message', context: 'translation scope' })
  }
}
