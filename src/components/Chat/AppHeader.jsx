import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
} from '@carbon/react'
import { Analytics, ChartLineData, CloudDownload, Document, Home, Logout, Settings } from '@carbon/icons-react'
import logo from '../../assets/azquest-logo.png'
import { useAuth } from '../../auth/AuthContext.jsx'

function AppHeader({ aba = 'inicio', onTrocarAba }) {
  const { user, logout } = useAuth()
  return (
    <Header aria-label="AZ Quest" className="chat-header">
      <HeaderName href="#" prefix="">
        <img src={logo} alt="AZ Quest" style={{ height: '2.5rem', display: 'block' }} />
      </HeaderName>
      <HeaderNavigation aria-label="Navegação">
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'inicio'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('inicio') }}
        >
          <span className="chat-header__nav-item">
            <Home size={16} /> Início
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'analise'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('analise') }}
        >
          <span className="chat-header__nav-item">
            <Document size={16} /> Análise de Crédito
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'monitoramento'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('monitoramento') }}
        >
          <span className="chat-header__nav-item">
            <ChartLineData size={16} /> Monitoramento
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'desempenho'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('desempenho') }}
        >
          <span className="chat-header__nav-item">
            <Analytics size={16} /> Desempenho
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'configuracoes'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('configuracoes') }}
        >
          <span className="chat-header__nav-item">
            <Settings size={16} /> Configurações
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href="#"
          isCurrentPage={aba === 'coleta'}
          onClick={e => { e.preventDefault(); onTrocarAba?.('coleta') }}
        >
          <span className="chat-header__nav-item">
            <CloudDownload size={16} /> Coleta
          </span>
        </HeaderMenuItem>
      </HeaderNavigation>
      <HeaderGlobalBar>
        <div className="chat-header__status">
          <span className="chat-header__user">{user?.name}</span>
        </div>
        <HeaderGlobalAction aria-label="Sair" tooltipAlignment="end" onClick={logout}>
          <Logout size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  )
}

export default AppHeader
