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
      // A analise-api e a etapa 1.2 e roda em outro servico. Mesmo padrao do
      // /monitor: prefixo proprio, para nao colidir com o /api do BFF.
      '/analise': {
        target: process.env.VITE_ANALISE_TARGET
          || 'https://analise-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: caminho => caminho.replace(/^\/analise/, ''),
      },
      '/monitor': {
        target: process.env.VITE_MONITOR_TARGET
          || 'https://monitor-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: caminho => caminho.replace(/^\/monitor/, ''),
      },
      // A coleta-api (azquest_code_engine/coleta/api.py) dispara o crawler de fontes públicas da aba Coleta.
      // Para rodar a API local: VITE_COLETA_TARGET=http://localhost:8083.
      '/coleta': {
        target: process.env.VITE_COLETA_TARGET
          || 'https://coleta-api.2fom3olxz1yh.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: caminho => caminho.replace(/^\/coleta/, ''),
      },
      // A resumos-api (server/index.js) entrega os resumos dos relatórios de
      // crédito gerados pelo agente. Mesmo padrão: prefixo próprio, e a sessão
      // é a do BFF (o cookie vai junto e a API confere em /api/auth/me).
      // Para rodar a API local: VITE_RESUMOS_TARGET=http://localhost:8082.
      '/resumos': {
        target: process.env.VITE_RESUMOS_TARGET
          || 'https://resumos-api.2g1a5bl5ugid.br-sao.codeengine.appdomain.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: caminho => caminho.replace(/^\/resumos/, ''),
      },
    },
  },
})
