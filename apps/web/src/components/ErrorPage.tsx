import { Link } from '@tanstack/react-router'
import { AlertCircle, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'

interface ErrorPageProps {
  error?: Error
  reset?: () => void
}

export function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <h1 data-slot="card-title" className="font-heading font-medium text-center text-2xl">Oops! Something went wrong</h1>
          <CardDescription className="text-center">
            We encountered an unexpected error. Please try again.
          </CardDescription>
        </CardHeader>
        {error && (
          <CardContent>
            <div className="rounded-md bg-muted p-4">
              <p className="text-sm font-medium mb-2">Error Details:</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        )}
        <CardFooter className="flex gap-2 justify-center">
          {reset && (
            <Button onClick={reset} variant="outline">
              Try Again
            </Button>
          )}
          <Button nativeButton={false} render={<Link to="/" />}>
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
