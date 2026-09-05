import { Link } from '@tanstack/react-router'
import { Home, Search } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { hideAppLoader } from '@/lib/appLoader'

export function NotFoundPage() {
  useEffect(() => {
    hideAppLoader()
  }, [])

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-full bg-muted p-3">
              <Search className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <h1 data-slot="card-title" className="font-heading font-medium text-center text-3xl">404 - Page Not Found</h1>
          <CardDescription className="text-center">
            The page you're looking for doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-center text-muted-foreground">
            You may have mistyped the address or the page may have been removed.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button nativeButton={false} render={<Link to="/" />}>
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
