import vuetify from './plugins/vuetify.js'

import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.use(vuetify)
app.mount('#app')

