import { type EntityMetadata, type ViewProps } from "@/types/metadata"
import { useT } from "@/i18n"

export function View({ moduleId, table_name, recordId, metadata }: ViewProps) {
  const t = useT()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        {t('View {table}: {record}', { table: table_name, record: recordId })}
      </h1>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <h2 className="font-semibold mb-2">{t('Entity Information:')}</h2>
        <p><strong>{t('Module:')}</strong> {moduleId}</p>
        <p><strong>{t('Table:')}</strong> {table_name}</p>
        <p><strong>{t('Record Key:')}</strong> {recordId}</p>
      </div>

      {/* Raw Metadata Display */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded mb-6">
        <h2 className="font-semibold mb-3 text-slate-900">{t('Raw Metadata (from get_schema RPC):')}</h2>
        <pre className="text-xs bg-slate-900 text-green-400 p-3 rounded overflow-auto">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </div>

      {metadata?.fields && (
        <div className="bg-white border p-4 rounded">
          <h2 className="font-semibold mb-3">{t('Fields:')}</h2>
          <div className="space-y-2">
            {metadata.fields.map((field: any, index: number) => (
              <div key={field.field_name || index} className="flex items-center gap-2">
                <span className="font-medium">{field.field_name}</span>
                <span className="text-sm text-gray-500">({field.data_type})</span>
                {!field.is_nullable && (
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                    {t('Required')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
