// Through the provider-wrapped render: the page's numbered list and its
// closing note are <Trans> messages (the file names sit inside the sentence in
// <code> tags), and <Trans> reads the catalog off React context.
import { render, screen } from '@/test/render'
import { ConfigErrorPage } from './ConfigErrorPage'

describe('ConfigErrorPage', () => {

  it('displays all missing environment variables', () => {
    const missingVars = [
      'VITE_OAUTH_CLIENT_ID',
      'VITE_OAUTH_AUTH_ENDPOINT',
      'VITE_OAUTH_TOKEN_ENDPOINT',
    ]
    render(<ConfigErrorPage missingVars={missingVars} />)
    
    missingVars.forEach((varName) => {
      expect(screen.getByText(varName)).toBeInTheDocument()
    })
  })

  it('provides instructions to fix the issue', () => {
    render(<ConfigErrorPage missingVars={['VITE_OAUTH_CLIENT_ID']} />)
    expect(screen.getByText(/to fix this issue/i)).toBeInTheDocument()
    expect(screen.getByText(/npm run genconfig/i)).toBeInTheDocument()
  })

  it('shows example configuration', () => {
    render(<ConfigErrorPage missingVars={['VITE_OAUTH_CLIENT_ID']} />)
    expect(screen.getByText(/example configuration/i)).toBeInTheDocument()
    expect(screen.getByText(/VITE_OAUTH_CLIENT_ID=your-actual-client-id/)).toBeInTheDocument()
  })

  it('warns about not committing .env file', () => {
    render(<ConfigErrorPage missingVars={['VITE_OAUTH_CLIENT_ID']} />)
    expect(screen.getByText(/do not commit your/i)).toBeInTheDocument()
    expect(screen.getByText(/sensitive credentials/i)).toBeInTheDocument()
  })
})
