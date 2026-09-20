import { useState, useCallback, useEffect, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { SchemaForm, type FormMode } from '@/components/form'
import { defaultValueForFormat } from './SchemaForm'
import type { SchemaObject } from 'ajv'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { validateSchema } from 'sem-schema'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n'

/**
 * Generate default values from schema.
 *
 * This file used to keep its own copy of the derivation, and the copy had
 * drifted: it knew `reference` but not `parent`, and it seeded `{}` for a
 * `type: 'object'` but nothing at all for the union type `get_schema` emits for
 * a json column. It reads the same function SchemaForm does now.
 */
function generateDefaultValue(schema: SchemaObject): Record<string, any> {
  const defaults: Record<string, any> = {}

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (typeof propSchema !== 'object' || propSchema === null) continue

      if ('default' in propSchema) {
        defaults[key] = (propSchema as any).default
      } else {
        const value = defaultValueForFormat((propSchema as any).format)
        // undefined is not seeded: an empty number field is absent, and
        // assigning undefined would put the key in the submitted JSON.
        if (value !== undefined) defaults[key] = value
      }
    }
  }

  return defaults
}

const defaultSchema = `{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "format": "text",
      "title": "Name",
      "description": "The display name shown on records, invoices, and exported reports throughout the workspace.",
      "inputMode": "required"
    },
    "email": {
      "type": "string",
      "format": "email",
      "title": "Email",
      "description": "Work address"
    },
    "age": {
      "type": "number",
      "format": "int32",
      "title": "Age"
    }
  },
  "required": ["name"]
}`

const defaultData = `{
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30
}`

interface FormPlaygroundProps {
  initialSchema?: string
}

export function FormPlayground({ initialSchema }: FormPlaygroundProps) {
  const t = useT()
  const [schemaText, setSchemaText] = useState(initialSchema || defaultSchema)
  const [dataText, setDataText] = useState(defaultData)
  const [formMode, setFormMode] = useState<FormMode>('edit')
  
  // Parse and validate schema - derived state using useMemo
  const { schema, schemaError } = useMemo(() => {
    try {
      const parsed = JSON.parse(schemaText)
      
      // Validate the schema using SemSchema validation
      const validation = validateSchema(parsed)
      if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => 
          `${e.schemaPath}: ${e.message}`
        ).join('; ') || t('Unknown schema validation error')
        return { schema: null, schemaError: errorMessages }
      }
      
      return { schema: parsed, schemaError: '' }
    } catch (error) {
      return { 
        schema: null, 
        schemaError: error instanceof Error ? error.message : String(error)
      }
    }
  }, [schemaText, t])

  // Parse data - derived state using useMemo
  const { data, dataError } = useMemo(() => {
    try {
      const parsed = JSON.parse(dataText)
      return { data: parsed, dataError: '' }
    } catch (error) {
      return { 
        data: null, 
        dataError: error instanceof Error ? error.message : String(error)
      }
    }
  }, [dataText])

  // Update dataText when schema changes to show default values
  useEffect(() => {
    if (schema) {
      const defaultValues = generateDefaultValue(schema)
      setDataText(JSON.stringify(defaultValues, null, 2))
    }
  }, [schema])

  const handleSchemaChange = useCallback((value: string) => {
    setSchemaText(value)
  }, [])

  const handleDataChange = useCallback((value: string) => {
    setDataText(value)
  }, [])

  const handleFormSubmit = useCallback((value: Record<string, any>) => {
    // Update data text with the submitted form values
    setDataText(JSON.stringify(value, null, 2))
    console.log('Form submitted:', value)
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden">
      <PanelGroup direction="horizontal">
        {/* Left Panel: Schema Editor */}
        <Panel defaultSize={33} minSize={20}>
          <div className="h-full flex flex-col border-r border-gray-300 overflow-hidden">
            <div className="p-4 border-b border-gray-300 bg-gray-50">
              <h2 className="text-sm font-semibold m-0">{t('Schema')}</h2>
              {schemaError && (
                <div className="text-red-600 text-xs mt-1">
                  {schemaError}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <CodeMirror
                value={schemaText}
                height="100%"
                extensions={[json()]}
                onChange={handleSchemaChange}
                theme="light"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
              />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 cursor-col-resize hover:bg-gray-300 transition-colors" />

        {/* Middle Panel: Data Editor */}
        <Panel defaultSize={33} minSize={20}>
          <div className="h-full flex flex-col border-r border-gray-300 overflow-hidden">
            <div className="p-4 border-b border-gray-300 bg-gray-50">
              <h2 className="text-sm font-semibold m-0">{t('Data')}</h2>
              {dataError && (
                <div className="text-red-600 text-xs mt-1">
                  {dataError}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <CodeMirror
                value={dataText}
                height="100%"
                extensions={[json()]}
                onChange={handleDataChange}
                theme="light"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
              />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 cursor-col-resize hover:bg-gray-300 transition-colors" />

        {/* Right Panel: Form Preview */}
        <Panel defaultSize={34} minSize={20}>
          <div className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-300 bg-gray-50">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold m-0">{t('Form Preview')}</h2>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="playground-form-mode" className="text-xs">
                    {t('Mode:')}
                  </Label>
                  <Select value={formMode} onValueChange={(value) => setFormMode(value as FormMode)}>
                    <SelectTrigger id="playground-form-mode" className="w-[120px] h-8">
                      {/* Base UI renders the raw VALUE unless a children fn maps
                          it, so the trigger needs the same labels as the items. */}
                      <SelectValue>{(v) => (v === 'create' ? t('Create') : v === 'view' ? t('View') : t('Edit'))}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="edit">{t('Edit')}</SelectItem>
                      <SelectItem value="create">{t('Create')}</SelectItem>
                      <SelectItem value="view">{t('View')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {schema && data ? (
                <SchemaForm
                  key={`${schemaText}-${dataText}`} // Force re-render when schema OR data changes
                  schema={schema}
                  initialValue={data}
                  onSubmit={handleFormSubmit}
                  formMode={formMode}
                />
              ) : (
                <div className="text-muted-foreground text-sm">
                  {!schema && t('Invalid schema')}
                  {!data && schema && t('Invalid data')}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
