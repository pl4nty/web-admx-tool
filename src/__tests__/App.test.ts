import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import App from '../App.vue'

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/:lang/', component: { template: '<div>Lang Home</div>' } },
      { path: '/:lang/search', component: { template: '<div>Search</div>' } },
      {
        path: '/:lang/policy/:namespace/:policyName',
        component: { template: '<div>Policy</div>' }
      }
    ]
  })
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('renders the header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] }
    })

    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.text()).toContain('ADMX Viewer')
  })

  it('renders sidebar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] }
    })

    expect(wrapper.find('aside').exists()).toBe(true)
  })

  it('has search input in header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] }
    })

    const searchInput = wrapper.find('input[type="search"]')
    expect(searchInput.exists()).toBe(true)
    expect(searchInput.attributes('placeholder')).toBe('Search policies...')
  })

  it('has scope selector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] }
    })

    const options = wrapper.findAll('select')[0]?.findAll('option')
    const texts = options?.map(o => o.text())
    expect(texts).toContain('All')
    expect(texts).toContain('Computer')
    expect(texts).toContain('User')
  })

  it('toggles theme on button click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    } as Response)

    const router = createTestRouter()
    await router.push('/en-us/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [router] }
    })

    const themeBtn = wrapper.find('button[title="Toggle dark mode"]')
    expect(themeBtn.exists()).toBe(true)
    // Click to toggle theme
    await themeBtn.trigger('click')
    expect(localStorage.getItem('theme')).toBeTruthy()
  })
})
