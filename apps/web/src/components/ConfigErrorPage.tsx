import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import { hideAppLoader } from '@/lib/appLoader'

interface ConfigErrorPageProps {
  missingVars: string[]
}

export function ConfigErrorPage({ missingVars }: ConfigErrorPageProps) {
  // Hide the index.html loading overlay — otherwise this error renders behind the
  // opaque overlay and the app looks like it's stuck on "Loading…" forever.
  useEffect(() => {
    hideAppLoader()
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-2xl w-full border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <h1 data-slot="card-title" className="font-heading font-medium text-2xl">Configuration Error</h1>
          </div>
          <CardDescription>
            OAuth configuration is missing or invalid
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
            <p className="text-sm font-medium mb-2">Missing environment variables:</p>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              {missingVars.map((varName) => (
                <li key={varName}>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{varName}</code>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">To fix this issue:</p>
            <ol className="list-decimal list-inside text-sm space-y-2 text-muted-foreground">
              <li>
                Create a <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> file
                in your project root (or run <code className="text-xs bg-muted px-1 py-0.5 rounded">npm run genconfig</code>)
              </li>
              <li>
                Copy the contents from <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.example</code>
              </li>
              <li>Replace the placeholder values with your actual OAuth provider settings</li>
              <li>Restart the development server</li>
            </ol>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-medium mb-2">Example configuration:</p>
            <pre className="text-xs overflow-x-auto">
              <code>{`VITE_OAUTH_CLIENT_ID=your-actual-client-id
VITE_OAUTH_AUTH_ENDPOINT=https://auth.example.com/oauth/authorize
VITE_OAUTH_TOKEN_ENDPOINT=https://auth.example.com/oauth/token
VITE_OAUTH_SCOPE=openid profile email
VITE_OAUTH_USERINFO_ENDPOINT=https://auth.example.com/oauth/userinfo
VITE_OAUTH_LOGOUT_ENDPOINT=https://auth.example.com/oauth/logout
VITE_OAUTH_LOGOUT_REDIRECT=http://localhost:5173

# API Configuration (REQUIRED)
VITE_API_BASE_URL=https://your-postgrest-api.com

# Optional: Supabase-specific settings
VITE_API_TYPE=supabase
VITE_SUPABASE_APIKEY=your-supabase-anon-key`}</code>
            </pre>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>
              <strong>Note:</strong> Do not commit your <code>.env</code> file to version control.
              It should contain sensitive credentials and is already listed in <code>.gitignore</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
