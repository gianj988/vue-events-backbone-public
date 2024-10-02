import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts';
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
      vue(),
      dts({
        outDir: "dist",
        entryRoot: "src",
      })
  ],
  build: {
    lib: {
      // the entry file that is loaded whenever someone imports
      // your plugin in their app
      entry: resolve(__dirname, "src/index.ts"),
            // the exposed global variable
      // is required when formats includes 'umd' or 'iife'
      name: 'VueEventsBackbone',

      // the proper extensions will be added, ie:
         // name.js (es module)
         // name.umd.cjs) (common js module)
      // default fileName is the name option of package.json
      fileName: 'vue-events-backbone'
    },
    rollupOptions: {

      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue'
        },
        exports: "named"
      }
    }
  }
})
