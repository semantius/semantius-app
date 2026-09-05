import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { CheckCircle, LogIn } from 'lucide-react'
import { hideAppLoader } from '@/lib/appLoader'

export function LogoutConfirmationPage() {
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
          <h1 data-slot="card-title" className="font-heading font-medium text-2xl">Successfully Logged Out</h1>
          <CardDescription>
            You have been successfully logged out of your account. Your session has been terminated securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>Thank you for using Semantius UI.</p>
            <p>We hope to see you again soon!</p>
          </div>
          
          <div className="space-y-2">
            <Button nativeButton={false} render={<Link to="/" />} className="w-full" size="lg">
              <LogIn className="mr-2 h-4 w-4" />
              Sign In Again
            </Button>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              If you didn't intend to log out, click "Sign In Again" to return to the application.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}