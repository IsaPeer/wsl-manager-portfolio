import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'  

// This function was created from personal communication with Copilot, and then adapted for this project.
export default createVuetify({

  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#1976D2',  
          'on-primary': '#FFFFFF',
          surface: '#2c2c2c59',  
          background: '#aa70707e'
        }
      }
    }
  },
  icons: {
    defaultSet: 'mdi',
  },
  components,
  directives,
})
