import { InlineNotification } from '@carbon/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import AnexarDocumentos from '../AnaliseCredito/AnexarDocumentos.jsx'
import '../AnaliseCredito/AnalisePage.scss'
import './ConfiguracoesPage.scss'

// Aba Configurações: envio de documentos do emissor para o bucket de entrada, de onde a extração os lê para o acervo.
//
// O envio é o mesmo da aba Análise de Crédito (AnexarDocumentos, contra as rotas /api/documentos da analise-api):
// a API lê a capa e diz o tipo, a pessoa confirma a pasta e o período, e o documento entra com o nome que as tools
// do acervo reconhecem.

function ConfiguracoesPage() {
  const { user } = useAuth()
  const podeEnviar = user?.role !== 'leitor'

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Configurações</h1>
          <span className="ana-cabecalho__referencia">envio de documentos do emissor para o acervo</span>
        </div>
      </header>

      <p className="cfg-texto">
        Depois da extração, que leva alguns minutos, o documento aparece em "Fontes disponíveis" (aba Desempenho) e
        passa a valer nas consultas do chat e nos relatórios gerados a partir daí.
      </p>

      {podeEnviar ? <AnexarDocumentos /> : (
        <InlineNotification kind="info" lowContrast hideCloseButton title="Seu perfil só lê os relatórios."
          subtitle="O envio de documentos é para analistas." />
      )}
    </main>
  )
}

export default ConfiguracoesPage
