import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputFile } from '../InputFile'
import { MAX_FILE_BYTES } from '@/lib/fileEncoding'
import { renderControl } from './harness'

const HEX_PREFIX = String.fromCharCode(92) + 'x'

/** The control reads its format off the property schema, as SchemaForm passes it. */
function renderFile(format: 'binary' | 'byte', options: Parameters<typeof renderControl>[1] = {}) {
  return renderControl(
    <InputFile name="blob" label="Attachment" schema={{ type: 'string', format }} />,
    options,
  )
}

describe('InputFile', () => {
  it('is named by its label, through the button the label points at', async () => {
    renderFile('binary')
    // The upload button carries the field id, so <FormLabel htmlFor> resolves
    // to it and clicking the label opens the picker.
    const button = document.getElementById('blob')
    expect(button?.tagName).toBe('BUTTON')
    await waitFor(() => expect(button).toHaveAccessibleName(/Attachment/))
  })

  it('says there is no file yet', () => {
    renderFile('binary')
    expect(screen.getByText('No file')).toBeInTheDocument()
  })

  it('announces the size once a file is chosen, and encodes bytea as hex', async () => {
    const user = userEvent.setup()
    const { container } = renderFile('binary')

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['Hi'], 'note.txt', { type: 'text/plain' }))

    // 2 bytes, reported through Intl rather than a translated string.
    await waitFor(() => expect(screen.getByText('2 byte')).toBeInTheDocument())
    const download = screen.getByRole('link') as HTMLAnchorElement
    expect(download).toHaveAttribute('download', 'Attachment')
  })

  it('encodes base64 for the byte format', async () => {
    const user = userEvent.setup()
    const { container } = renderFile('byte')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['Hi'], 'note.txt'))
    await waitFor(() => expect(screen.getByText('2 byte')).toBeInTheDocument())
  })

  it('reads an existing bytea value back', () => {
    renderFile('binary', { defaultValues: { blob: `${HEX_PREFIX}48690a00ff` } })
    expect(screen.getByText('5 byte')).toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('reads an existing base64 value back', () => {
    renderFile('byte', { defaultValues: { blob: 'SGkKAP8=' } })
    expect(screen.getByText('5 byte')).toBeInTheDocument()
  })

  it('refuses a file over the cap and says the limit', async () => {
    const user = userEvent.setup()
    const { container } = renderFile('binary')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const tooBig = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.bin')
    await user.upload(input, tooBig)

    await waitFor(() => expect(screen.getByText(/is larger than/)).toBeInTheDocument())
    // Nothing was taken into the field.
    expect(screen.getByText('No file')).toBeInTheDocument()
  })

  it('clears the file and returns focus to the upload button', async () => {
    const user = userEvent.setup()
    renderFile('binary', { defaultValues: { blob: `${HEX_PREFIX}4869` } })

    await user.click(screen.getByRole('button', { name: 'Remove the file' }))

    await waitFor(() => expect(screen.getByText('No file')).toBeInTheDocument())
    // The Remove button unmounts with the value it clears, so focus would
    // otherwise fall to <body>.
    expect(document.activeElement).toBe(document.getElementById('blob'))
  })

  it('offers no Clear for a required field', () => {
    renderFile('binary', { defaultValues: { blob: `${HEX_PREFIX}4869` } })
    expect(screen.getByRole('button', { name: 'Remove the file' })).toBeInTheDocument()

    renderControl(
      <InputFile
        name="blob2"
        label="Attachment"
        inputMode="required"
        schema={{ type: 'string', format: 'binary' }}
      />,
      { defaultValues: { blob2: `${HEX_PREFIX}4869` } },
    )
    // Emptying a required field could not be saved, so the affordance is absent.
    expect(screen.getAllByRole('button', { name: 'Remove the file' })).toHaveLength(1)
  })

  it('renders nothing when hidden', () => {
    renderControl(
      <InputFile
        name="blob"
        label="Attachment"
        inputMode="hidden"
        schema={{ type: 'string', format: 'binary' }}
      />,
    )
    expect(screen.queryByText('No file')).not.toBeInTheDocument()
  })
})
