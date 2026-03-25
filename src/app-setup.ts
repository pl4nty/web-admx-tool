import type { App } from 'vue'
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import PolicyView from './views/PolicyView.vue'
import SearchView from './views/SearchView.vue'

const history =
  typeof window !== 'undefined' ? createWebHistory() : createMemoryHistory()

const router = createRouter({
  history,
  routes: [
    { path: '/', component: HomeView },
    { path: '/:lang/', component: HomeView, props: true },
    {
      path: '/:lang/search',
      component: SearchView,
      props: true
    },
    {
      path: '/:lang/policy/:namespace/:policyName',
      component: PolicyView,
      props: true
    }
  ]
})

export default (app: App) => {
  app.use(router)
}
