import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')

  return {
  plugins: [
    react(),
    {
      name: 'serve-root-menu',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            let html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')
            // Inject Supabase config so the menu syncs with admin data
            if (env.VITE_SUPABASE_URL) {
              html = html.replace(
                "window.__SUPABASE_URL = '';",
                `window.__SUPABASE_URL = '${env.VITE_SUPABASE_URL}';`,
              )
            }
            if (env.VITE_SUPABASE_ANON_KEY) {
              html = html.replace(
                "window.__SUPABASE_ANON_KEY = '';",
                `window.__SUPABASE_ANON_KEY = '${env.VITE_SUPABASE_ANON_KEY}';`,
              )
            }
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
            return
          }
          // serve parent assets (css, images, etc.)
          if (req.url?.startsWith('/assets/')) {
            const urlPath = decodeURIComponent(req.url.split('?')[0].slice(1))
            const filePath = path.resolve(__dirname, '..', urlPath)
            const assetsRoot = path.resolve(__dirname, '..', 'assets')
            if (filePath.startsWith(assetsRoot + path.sep) && fs.existsSync(filePath)) {
              res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
              fs.createReadStream(filePath).pipe(res)
              return
            }
          }
          next()
        })
      },
    },
  ],
  base: '/admin/',
  server: {
    fs: {
      allow: ['..'],
    },
  },
  }
})
