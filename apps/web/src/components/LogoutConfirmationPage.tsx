import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { CheckCircle, LogIn } from 'lucide-react'
import { hideAppLoader } from '@/lib/appLoader'
import { useT } from '@/i18n'

export function LogoutConfirmationPage() {
  const t = useT()

  useEffect(() => {
    hideAppLoader()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h1 data-slot="card-title" className="font-heading font-medium text-2xl">{t('Successfully Logged Out')}</h1>
          <CardDescription>
            {t('You have been successfully logged out of your account. Your session has been terminated securely.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>{t('Thank you for using Semantius UI.')}</p>
            <p>{t('We hope to see you again soon!')}</p>
          </div>
          
          <div className="space-y-2">
            {/*
            Styled as a button, but it is a LINK: it goes to a URL. Wrapping it
            in <Button nativeButton={false}> stamps role="button" over the
            anchor, so assistive technology announces "button" for something
            that navigates — and the user loses every link affordance the
            browser gives for free. buttonVariants() is shadcn's documented way
            to get the look without the wrong role.
          */}
            <Link to="/" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
              <LogIn className="mr-2 h-4 w-4" />
              {t('Sign In Again')}
            </Link>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t('If you didn\'t intend to log out, click "Sign In Again" to return to the application.')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}