import CodeMirror from '@uiw/react-codemirror'
import {
  contentA11yAttributes,
  useEditorTheme,
  type CodeMirrorFieldProps,
} from './codeMirrorField'


export default function CodeMirrorJsonata(props: CodeMirrorFieldProps) {
  const { value, onChange, onBlur, disabled, readOnly } = props
  const theme = useEditorTheme()
  return (
    <div 
      className={readOnly ? 'opacity-60' : ''}
      tabIndex={readOnly ? -1 : undefined}
    >
      <CodeMirror
        value={value}
        height="200px"
        // No language extension = plain text with line numbers.
        extensions={[contentA11yAttributes(props)]}
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
