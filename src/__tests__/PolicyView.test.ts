import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PolicyView from '../views/PolicyView.vue'

const mockPolicy = {
  name: 'TestPolicy',
  displayName: 'Test Policy Display Name',
  explainText: 'This is a test policy explanation.',
  class: 'Machine',
  key: 'SOFTWARE\\Policies\\Test',
  valueName: 'TestValue',
  supportedOn: 'At least Windows 10',
  parentCategory: 'TestCategory',
  categoryPath: ['Root', 'TestCategory'],
  elements: [
    { type: 'decimal', id: 'MaxValue', minValue: 0, maxValue: 100 }
  ],
  presentationElements: [
    { type: 'decimalTextBox', refId: 'MaxValue', label: 'Maximum value', defaultValue: 50 }
  ],
  enabledValue: { type: 'decimal', value: 1 },
  disabledValue: { type: 'decimal', value: 0 },
  csp: null,
  catalog: null,
  downloadUrl: null,
  namespace: 'Test.Policies',
  fileSlug: 'test',
  availableLangs: ['en-us', 'de-de'],
  lang: 'en-us'
}

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/:lang/policy/:namespace/:policyName',
        component: PolicyView,
        props: true
      }
    ]
  })
}

describe('PolicyView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    const router = createTestRouter()
    router.push('/en-us/policy/Test.Policies/TestPolicy')

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })
    expect(wrapper.text()).toContain('Loading policy...')
  })

  it('renders policy details after fetch', async () => {
    const policiesData = {
      'Test.Policies/TestPolicy': mockPolicy
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(policiesData)
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/policy/Test.Policies/TestPolicy')
    await router.isReady()

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Test Policy Display Name')
    })
    expect(wrapper.text()).toContain('Test.Policies')
    expect(wrapper.text()).toContain('Machine')
    expect(wrapper.text()).toContain('SOFTWARE\\Policies\\Test')
    expect(wrapper.text()).toContain('TestValue')
    expect(wrapper.text()).toContain('At least Windows 10')
    expect(wrapper.text()).toContain('This is a test policy explanation.')
  })

  it('shows error when policy not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/policy/Missing.Namespace/MissingPolicy')
    await router.isReady()

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('not found')
    })
  })

  it('renders enabled/disabled values', async () => {
    const policiesData = {
      'Test.Policies/TestPolicy': mockPolicy
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(policiesData)
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/policy/Test.Policies/TestPolicy')
    await router.isReady()

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Enabled:')
    })
    expect(wrapper.text()).toContain('Disabled:')
    expect(wrapper.text()).toContain('Policy State Values')
  })

  it('renders configuration elements', async () => {
    const policiesData = {
      'Test.Policies/TestPolicy': mockPolicy
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(policiesData)
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/policy/Test.Policies/TestPolicy')
    await router.isReady()

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Configuration Elements')
    })
    expect(wrapper.text()).toContain('Maximum value')
    expect(wrapper.text()).toContain('decimal')
  })

  it('renders available languages links', async () => {
    const policiesData = {
      'Test.Policies/TestPolicy': mockPolicy
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(policiesData)
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/policy/Test.Policies/TestPolicy')
    await router.isReady()

    const wrapper = mount(PolicyView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('en-us')
    })
    expect(wrapper.text()).toContain('de-de')
    expect(wrapper.text()).toContain('Available Languages')
  })
})
