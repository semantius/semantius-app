import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/ThemeProvider'
import { useT } from '@/i18n'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const t = useT()

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  const getIcon = () => {
    if (theme === 'dark') {
      return <Moon className="h-5 w-5" />
    }
    return <Sun className="h-5 w-5" />
  }

  // The theme name is an ICU `select` written out inside each sentence rather
  // than a separately translated word concatenated in: German needs the name in
  // a different case depending on the frame it sits in, and a translator can
  // only get that right when the whole sentence is one message. Spelled out in
  // both messages rather than shared through a constant because the extractor
  // reads the literal at the call site — a template with an expression is a
  // key it cannot see, and it refuses one by design.
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={t('Theme: {theme, select, dark {Dark} light {Light} other {System}}', { theme })}
    >
      {getIcon()}
      <span className="sr-only">
        {t('Toggle theme ({theme, select, dark {Dark} light {Light} other {System}})', { theme })}
      </span>
    </Button>
  )
}
