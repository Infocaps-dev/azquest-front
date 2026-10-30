import { useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  Link,
  ModalBody,
  ModalHeader,
  PasswordInput,
  TextInput,
} from '@carbon/react'
import { Login } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isMock } from '../../auth/authService'
import azLogo from '../../assets/azquest-logo.png'
import ctiLogo from '../../assets/cti-logo.png'
import RotuloFixo from '../Comum/RotuloFixo.jsx'

function LoginModal({ open, onClose, error }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState(error)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setInfo('')
    setErr('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      // Em caso de sucesso o Gate troca a tela; limpar a senha evita deixá-la
      // no estado do componente caso o modal seja reaberto.
      setPassword('')
    } catch (e2) {
      setErr(e2.message || 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  function handleForgot(e) {
    e.preventDefault()
    setInfo('A redefinição de senha é feita pelo administrador da plataforma. Fale com o suporte da CTI.')
  }

  return (
    <ComposedModal open={open} onClose={onClose} size="sm" className="login-modal" preventCloseOnClickOutside>
      <ModalHeader label="Acesso seguro" title="Entrar na Plataforma AZ Quest" closeModal={onClose} iconDescription="Fechar" />
      <ModalBody>
        <form className="login-modal__form" onSubmit={handleSubmit}>
          <p className="login-modal__intro">
            Informe o e-mail corporativo e a senha cadastrados na plataforma.
          </p>

          {err && (
            <InlineNotification kind="error" lowContrast hideCloseButton title={err} className="login-modal__notice" />
          )}
          {info && (
            <InlineNotification kind="info" lowContrast hideCloseButton title={info} className="login-modal__notice" />
          )}

          <TextInput
            id="login-email"
            name="email"
            type="email"
            labelText="E-mail corporativo"
            placeholder="nome@empresa.com.br"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <PasswordInput
            id="login-password"
            name="password"
            labelText="Senha"
            autoComplete="current-password"
            showPasswordLabel="Mostrar senha"
            hidePasswordLabel="Ocultar senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            required
          />

          <div className="login-modal__actions">
            <Button kind="primary" type="submit" renderIcon={Login} disabled={loading || !email || !password}>
              <RotuloFixo atual={loading ? 'Entrando...' : 'Entrar'} opcoes={['Entrar', 'Entrando...']} />
            </Button>
            <Link href="#" onClick={handleForgot}>
              Esqueci minha senha
            </Link>
          </div>

          <p className="login-modal__note">
            A senha trafega por canal cifrado e é conferida no servidor; o navegador não a armazena.
            {isMock && ' Modo de demonstração: autenticação simulada.'}
          </p>
        </form>

        <div className="login-modal__logos">
          <img src={azLogo} alt="AZ Quest" className="login-modal__logo-az" />
          <span className="login-modal__logo-divider" aria-hidden="true" />
          <img src={ctiLogo} alt="CTI Global" className="login-modal__logo-cti" />
        </div>
      </ModalBody>
    </ComposedModal>
  )
}

export default LoginModal
