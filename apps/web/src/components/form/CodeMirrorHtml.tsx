import CodeMirror from '@uiw/react-codemirror'
import {
  contentA11yAttributes,
  useEditorTheme,
  type CodeMirrorFieldProps,
} from './codeMirrorField'
import { html } from '@codemirror/lang-html'


export default function CodeMirrorHtml(props: CodeMirrorFieldProps) {
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
        extensions={[html(), contentA11yAttributes(props)]}
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
