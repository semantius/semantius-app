import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ApiErrorDisplay } from '@/components/ApiErrorDisplay'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                An unexpected error occurred. Please try again or contact support if the problem persists.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {this.state.error && (
                <ApiErrorDisplay error={this.state.error} title="" />
              )}
            </CardContent>
            <CardFooter>
              {/*
                A real link, not a button that assigns window.location. The
                boundary can catch an error thrown from inside the router, so
                this stays a plain <a> — a document load that rebuilds
                everything, which is the point of returning home from here — and
                deliberately not a TanStack <Link>, which would need the router
                that may be what just failed.
              */}
              <a href="/" className={buttonVariants()}>
                Return to Home
              </a>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
