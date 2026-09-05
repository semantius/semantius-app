import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { getApiConfig, createApiHeaders, buildPostgRESTSelect } from './apiClient'
import { clearRuntimeEnv, configureApp } from '@/test/runtimeConfig'

describe('apiClient', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await configureApp({ baseUrl: '' })
  })

  afterEach(() => {
    clearRuntimeEnv()
  })

  describe('getApiConfig', () => {
    it('returns API configuration from environment variables', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'postgrest', supabaseApiKey: '' })

      const config = getApiConfig()

      expect(config).toEqual({
        baseUrl: 'https://api.example.com',
        type: 'postgrest',
        supabaseApiKey: undefined,
      })
    })

    it('normalizes API type to lowercase', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'SUPABASE', supabaseApiKey: 'test-key' })

      const config = getApiConfig()

      expect(config.type).toBe('supabase')
    })

    it('handles empty API type', async () => {
      await configureApp({ baseUrl: 'https://api.example.com' })

      const config = getApiConfig()

      expect(config.type).toBeUndefined()
    })
  })

  describe('createApiHeaders', () => {
    it('creates basic headers with Authorization and Content-Type', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: '' })

      const headers = createApiHeaders('test-token')

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      })
    })

    it('adds Supabase apikey header when API_TYPE is supabase', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'supabase', supabaseApiKey: 'supabase-key' })

      const headers = createApiHeaders('test-token')

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
        'apikey': 'supabase-key',
      })
    })

    it('does not add apikey header when API_TYPE is not supabase', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'postgrest', supabaseApiKey: 'supabase-key' })

      const headers = createApiHeaders('test-token')

      expect(headers).not.toHaveProperty('apikey')
    })

    it('does not add apikey header when Supabase key is missing', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'supabase', supabaseApiKey: '' })

      const headers = createApiHeaders('test-token')

      expect(headers).not.toHaveProperty('apikey')
    })

    it('accepts configuration override options', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: '' })

      const headers = createApiHeaders('test-token', {
        type: 'supabase',
        supabaseApiKey: 'custom-key',
      })

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
        'apikey': 'custom-key',
      })
    })

    it('merges override options with environment config', async () => {
      await configureApp({ baseUrl: 'https://api.example.com', type: 'supabase', supabaseApiKey: 'env-key' })

      const headers = createApiHeaders('test-token', {
        supabaseApiKey: 'override-key',
      })

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
        'apikey': 'override-key',
      })
    })
  })

  describe('buildPostgRESTSelect', () => {
    it('returns * when metadata has no properties', () => {
      const metadata = { properties: undefined }
      const result = buildPostgRESTSelect(metadata)
      expect(result).toBe('*')
    })

    it('includes all fields in select clause', () => {
      const metadata = {
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      }
      const result = buildPostgRESTSelect(metadata)
      expect(result).toBe('id,name,email')
    })

    it('requests the plain generated _label column for reference fields (AUTO_LABEL mode)', () => {
      const metadata = {
        properties: {
          id: { type: 'integer' },
          product_name: { type: 'string' },
          category_id: {
            type: 'integer',
            reference_table: 'product_categories',
            reference_table_label_column: 'category_name',
          },
        },
      }
      // get_schema now ships <fk>_label as a real selectable column, so the new
      // path just requests it directly — no nested embed to unwrap at render time.
      const result = buildPostgRESTSelect(metadata, true)
      expect(result).toBe('id,product_name,category_id,category_id_label')
    })

    it('adds aliased _label embed for reference columns (legacy mode)', () => {
      const metadata = {
        properties: {
          id: { type: 'integer' },
          product_name: { type: 'string' },
          category_id: {
            type: 'integer',
            reference_table: 'product_categories',
            reference_table_label_column: 'category_name',
          },
        },
      }
      const result = buildPostgRESTSelect(metadata, false)
      expect(result).toBe('id,product_name,category_id,category_id_label:category_id(category_name)')
    })

    it('handles multiple columns referencing the same table (PGRST201 fix, legacy mode)', () => {
      // This tests the case where user_roles has two foreign keys to users table:
      // - user_id -> users(id)
      // - assigned_by -> users(id)
      const metadata = {
        properties: {
          id: { type: 'integer' },
          user_id: {
            type: 'integer',
            reference_table: 'users',
            reference_table_label_column: 'name',
          },
          assigned_by: {
            type: 'integer',
            reference_table: 'users',
            reference_table_label_column: 'name',
          },
          role_name: { type: 'string' },
        },
      }
      const result = buildPostgRESTSelect(metadata, false)
      // Each reference embeds by FK column, which disambiguates without PGRST201
      // and also works for self-joins (e.g. departments.parent_department_id → departments).
      expect(result).toBe('id,user_id,user_id_label:user_id(name),assigned_by,assigned_by_label:assigned_by(name),role_name')
    })

    it('skips synthetic label companion fields (fk_label/_label) emitted by get_schema', () => {
      // get_schema now emits the label columns as first-class properties. They must
      // not be selected on their own — the reference field below owns the label, so
      // selecting the bare companion too would duplicate (AUTO_LABEL) or collide on
      // the same output key as the embed (legacy).
      const metadata = {
        properties: {
          id: { type: 'integer' },
          product_name: { type: 'string' },
          _label: { type: 'string', ctype: '_label' },
          supplier_id: {
            type: 'integer',
            reference_table: 'suppliers',
            reference_table_label_column: 'company_name',
          },
          supplier_id_label: { type: 'string', ctype: 'fk_label', reference_table: 'suppliers' },
        },
      }
      expect(buildPostgRESTSelect(metadata, true)).toBe('id,product_name,supplier_id,supplier_id_label')
      expect(buildPostgRESTSelect(metadata, false)).toBe('id,product_name,supplier_id,supplier_id_label:supplier_id(company_name)')
    })

    it('only adds _label field when both reference_table and reference_table_label_column are present', () => {
      const metadata = {
        properties: {
          id: { type: 'integer' },
          category_id: {
            type: 'integer',
            reference_table: 'product_categories',
            // Missing reference_table_label_column
          },
        },
      }
      const result = buildPostgRESTSelect(metadata)
      expect(result).toBe('id,category_id')
    })
  })
})
