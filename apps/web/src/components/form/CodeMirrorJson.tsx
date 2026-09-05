import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import {
  contentA11yAttributes,
  useEditorTheme,
  type CodeMirrorFieldProps,
} from './codeMirrorField'

export default function CodeMirrorJson(props: CodeMirrorFieldProps) {
  const { value, onChange, onBlur, disabled, readOnly } = props
  const theme = useEditorTheme()
  const safeValue = typeof value === 'string' ? value : String(value ?? '')
  return (
    <div
      className={readOnly ? 'opacity-60' : ''}
      tabIndex={readOnly ? -1 : undefined}
    >
      <CodeMirror
        value={safeValue}
        height="200px"
        extensions={[json(), contentA11yAttributes(props)]}
        onChange={onChange}
        onBlur={onBlur}
        editable={!disabled && !readOnly}
        theme={theme}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
        }}
      />
    </div>
  )
}
