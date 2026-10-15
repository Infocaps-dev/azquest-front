// Serviço de autenticação da Fase 0, contra o BFF em Code Engine (azquest-auth-bff).
// O login é local: e-mail e senha são conferidos na base MySQL da plataforma.
// O navegador nunca guarda token — o BFF devolve um cookie de sessão assinado
// (HttpOnly, Secure, SameSite=Lax), que viaja sozinho nas chamadas seguintes.
//
//   POST /api/auth/login   {email, password} -> cria a sessão
//   GET  /api/auth/me      devolve o usuário da sessão atual
//   POST /api/auth/logout  encerra a sessão
//   GET  /api/health       sonda usada antes de mostrar o formulário
//
// Desenvolvimento: com VITE_AUTH_MOCK=true, entra direto com um usuário de
// demonstração, para navegar pela interface sem subir o BFF.

const MOCK = import.meta.env.VITE_AUTH_MOCK === 'true'
const HEALTH_TIMEOUT_MS = 4000

export class AuthError extends Error {}
const MOCK_KEY = 'azquest_mock_session'
const MOCK_USER = { email: 'demo@azquest.com.br', name: 'Usuário de demonstração', role: 'analista' }

const UNAVAILABLE =
  'O serviço de autenticação está indisponível no momento. Tente novamente em alguns minutos ou fale com o suporte da CTI.'

// Mensagens por código de erro do BFF. O BFF responde 401 invalid_credentials
// sem dizer se o e-mail existe — a mensagem aqui acompanha esse cuidado.
const ERRORS = {
  invalid_request: 'Informe e-mail e senha.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  inactive: 'Seu acesso está desativado. Fale com o administrador.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
}

// Confere se o BFF responde antes de enviar a senha. Sem isso, um BFF fora do ar
// devolveria ao usuário um erro de rede genérico no meio do login.
// O BFF responde GET /api/health com JSON {"status": "ok"}.
async function authServiceUp() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) return false
    const body = await res.json()
    return body?.status === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function authErrorMessage(code) {
  return ERRORS[code] || 'Não foi possível concluir o login. Tente novamente.'
}

export async function login(email, password) {
  if (MOCK) {
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(MOCK_USER))
    return MOCK_USER
  }
  if (!(await authServiceUp())) throw new AuthError(UNAVAILABLE)

  let res
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new AuthError(UNAVAILABLE)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new AuthError(body.message || authErrorMessage(body.error))
  }
  return res.json()
}

export async function currentUser() {
  if (MOCK) {
    try {
      const raw = sessionStorage.getItem(MOCK_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

export async function logout() {
  if (MOCK) {
    sessionStorage.removeItem(MOCK_KEY)
    return
  }
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // Sessão expirada ou BFF fora do ar: o cookie é descartado do lado do
    // servidor de qualquer modo, e o AuthContext já limpa o usuário local.
  }
}

export const isMock = MOCK
