import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'
import 'primevue/resources/themes/tailwind-light/theme.css'
import { router } from './router'
import App from './App.vue'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    name: 'tailwind'
  }
})
app.use(ToastService)

app.mount('#app')
