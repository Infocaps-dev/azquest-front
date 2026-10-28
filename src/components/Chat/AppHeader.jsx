import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
} from '@carbon/react'
import { Analytics, Catalog, ChartLineData, CloudDownload, Document, FolderOpen, Home, Logout } from '@carbon/icons-react'
import logo from '../../assets/azquest-logo.png'
import { useAuth } from '../../auth/AuthContext.jsx'
import { CAMINHO_DA_ABA, cliqueComum } from '../../rotas'

// Cada aba é um link para o endereço dela (rotas.js): o clique comum troca de tela sem recarregar; Ctrl+clique ou o
// botão do meio abrem a aba noutra janela do navegador, como num site.
// `caminhos`: aonde a aba leva quando já tem algo aberto nela (a conversa do chat, o relatório da Análise).
function AppHeader({ aba = 'inicio', onTrocarAba, caminhos = {} }) {
  const { user, logout } = useAuth()
  const caminho = destino => caminhos[destino] || CAMINHO_DA_ABA[destino]
  function ir(evento, destino) {
    if (!cliqueComum(evento)) return
    evento.preventDefault()
    onTrocarAba?.(destino)
  }
  return (
    <Header aria-label="AZ Quest" className="chat-header">
      <HeaderName href={caminho('inicio')} prefix="" onClick={e => ir(e, 'inicio')}>
        <img src={logo} alt="AZ Quest" style={{ height: '2.5rem', display: 'block' }} />
      </HeaderName>
      <HeaderNavigation aria-label="Navegação">
        <HeaderMenuItem
          href={caminho('inicio')}
          isCurrentPage={aba === 'inicio'}
          aria-current={aba === 'inicio' ? 'page' : undefined}
          onClick={e => ir(e, 'inicio')}
        >
          <span className="chat-header__nav-item">
            <Home size={16} /> Início
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('analise')}
          isCurrentPage={aba === 'analise'}
          aria-current={aba === 'analise' ? 'page' : undefined}
          onClick={e => ir(e, 'analise')}
        >
          <span className="chat-header__nav-item">
            <Document size={16} /> Análise de Crédito
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('monitoramento')}
          isCurrentPage={aba === 'monitoramento'}
          aria-current={aba === 'monitoramento' ? 'page' : undefined}
          onClick={e => ir(e, 'monitoramento')}
        >
          <span className="chat-header__nav-item">
            <ChartLineData size={16} /> Monitoramento
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('desempenho')}
          isCurrentPage={aba === 'desempenho'}
          aria-current={aba === 'desempenho' ? 'page' : undefined}
          onClick={e => ir(e, 'desempenho')}
        >
          <span className="chat-header__nav-item">
            <Analytics size={16} /> Desempenho
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('coleta')}
          isCurrentPage={aba === 'coleta'}
          aria-current={aba === 'coleta' ? 'page' : undefined}
          onClick={e => ir(e, 'coleta')}
        >
          <span className="chat-header__nav-item">
            <CloudDownload size={16} /> Coleta
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('documentos')}
          isCurrentPage={aba === 'documentos'}
          aria-current={aba === 'documentos' ? 'page' : undefined}
          onClick={e => ir(e, 'documentos')}
        >
          <span className="chat-header__nav-item">
            <FolderOpen size={16} /> Documentos
          </span>
        </HeaderMenuItem>
        <HeaderMenuItem
          href={caminho('conceitos')}
          isCurrentPage={aba === 'conceitos'}
          aria-current={aba === 'conceitos' ? 'page' : undefined}
          onClick={e => ir(e, 'conceitos')}
        >
          <span className="chat-header__nav-item">
            <Catalog size={16} /> Conceitos
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
