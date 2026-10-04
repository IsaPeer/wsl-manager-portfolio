import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  main: {},
  preload: {},
  // {
  //   build: {
  //     lib: {
  //       formats: ['cjs']
  //     }
  //   }
  // },
  // preload: {
  //   build: {
  //       input: {
  //         index: resolve(__dirname, 'src/preload/index.js')
  //       }
  //     }
  //   }
  // },\
    // {
    // build: {
    //     externalizeDeps: false   // to fix "require is not defined" error in preload.js, taken from https://electron-vite.org/guide/dependency-handling#fully-bundling
    //   }
    // },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      vue(),
      vuetify({
        autoImport: true
      })
    ]
  }
})
