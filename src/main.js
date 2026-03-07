import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap'
import './style.css'
import App from './App.vue'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: App }]
})

createApp(App).use(router).mount('#app')
