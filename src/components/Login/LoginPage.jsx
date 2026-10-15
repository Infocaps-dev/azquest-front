import { useState } from 'react'
import { Button } from '@carbon/react'
import { Information, Login } from '@carbon/icons-react'
import logo from '../../assets/azquest-logo.png'
import LoginModal from './LoginModal.jsx'
import './LoginPage.scss'

const CARDS = [
  { n: '01', text: 'Base histórica com evidência', pos: 'a' },
  { n: '02', text: 'Covenants e gatilhos', pos: 'b' },
  { n: '03', text: 'Decisão registrada', pos: 'c' },
]

function LoginPage() {
  // O login acontece dentro do modal, sem sair da página: não há mais retorno
  // de provedor externo para ler da query string.
  const [open, setOpen] = useState(false)

  return (
    <div className="login">
      <header className="login__header">
        <div className="login__brand">
          <img src={logo} alt="AZ Quest" className="login__logo" />
          <span className="login__divider" aria-hidden="true" />
          <span className="login__product">Plataforma de Crédito</span>
        </div>
        <Information size={20} className="login__info" aria-label="Sobre a plataforma" />
      </header>

      <main className="login__main">
        <section className="login__hero">
          <p className="login__eyebrow">Análise de crédito</p>
          <h1 className="login__title">Cada número da tese, rastreável até a página de origem.</h1>
          <p className="login__lead">
            Entre com sua conta corporativa e acesse a plataforma para analisar emissores, monitorar
            covenants e registrar decisões com evidência.
          </p>
          <Button kind="primary" renderIcon={Login} className="login__cta" onClick={() => setOpen(true)}>
            Acesso à Plataforma
          </Button>
          <p className="login__micro">Autenticação corporativa, acesso protegido</p>
        </section>

        <section className="login__visual" aria-hidden="true">
          {CARDS.map(c => (
            <div key={c.n} className={`login__card login__card--${c.pos}`}>
              <span className="login__card-n">{c.n}</span>
              <span className="login__card-text">{c.text}</span>
            </div>
          ))}
          <span className="login__accent" />
        </section>
      </main>

      <LoginModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

export default LoginPage
