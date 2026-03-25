import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:lang?', component: HomeView }]
  })
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    // Mock fetch to never resolve
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    const router = createTestRouter()
    const wrapper = mount(HomeView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })
    expect(wrapper.text()).toContain('Loading statistics...')
  })

  it('renders stats after fetch', async () => {
    const mockStats = {
      fileCount: 100,
      policyCount: 5000,
      categoryCount: 200,
      languageCount: 90
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats)
    } as Response)

    const router = createTestRouter()
    const wrapper = mount(HomeView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    // Wait for fetch + next tick
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('100')
    })
    expect(wrapper.text()).toContain('5000')
    expect(wrapper.text()).toContain('200')
    expect(wrapper.text()).toContain('90')
    expect(wrapper.text()).toContain('ADMX Files')
    expect(wrapper.text()).toContain('Policies')
    expect(wrapper.text()).toContain('Categories')
    expect(wrapper.text()).toContain('Languages')
  })

  it('renders description text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fileCount: 1, policyCount: 1, categoryCount: 1, languageCount: 1 })
    } as Response)

    const router = createTestRouter()
    const wrapper = mount(HomeView, {
      props: { lang: 'en-us' },
      global: { plugins: [router] }
    })

    expect(wrapper.text()).toContain('ADMX Viewer')
    expect(wrapper.text()).toContain('Browse, search, and inspect Group Policy')
  })
})
