import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // Silencia avisos de depreciação vindos do Carbon (node_modules)
        quietDeps: true,
        silenceDeprecations: ['if-function'],
      },
    },
  },
  // Desenvolvimento: /api vai para o BFF de autenticação. O padrão é o app
  // publicado no Code Engine; aponte VITE_API_TARGET para http://localhost:8080
  // ao rodar o BFF na própria máquina.
  //
  // changeOrigin precisa ser true com alvo remoto: o Code Engine roteia pelo
  // Host, e mandar "localhost:5173" cairia fora da aplicação. O proxy mantém o
  // navegador na mesma origem, então o cookie de sessão é first-party e não
  // existe CORS no caminho.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET
          || 'https://azquest-auth-bff.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
      },
      // A monitor-api e a etapa 1.5 e roda noutro servico, com outro host. O
      // prefixo proprio evita colidir com /api do BFF de autenticacao.
      '/monitor': {
        target: process.env.VITE_MONITOR_TARGET
          || 'https://monitor-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: caminho => caminho.replace(/^\/monitor/, ''),
      },
    },
  },
})
