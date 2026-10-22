import { useEffect, useRef, useState } from 'react'
import {
  Button, FileUploaderDropContainer, FileUploaderItem, InlineNotification, ProgressBar, Select, SelectItem, Tag,
  TextInput,
} from '@carbon/react'
import { Upload } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  TAMANHO_MAXIMO, TIPOS, enviarArquivo, formatoDoPeriodo, lerNomeDoArquivo, listarEnvios, nomePadronizado,
  periodoDoNome, periodoValido, situacao, validarArquivo,
} from '../../services/uploadApi'
import { dataHora } from '../AnaliseCredito/vocabulario'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import './ConfiguracoesPage.scss'

// Aba Configurações: envio de documentos do emissor para o bucket, de onde a extração os lê para o acervo.
//
// O analista escolhe o emissor e solta os arquivos. Tipo e período de cada um são lidos do nome, no padrão dos
// documentos que já estão no acervo (ITR-2T26-ECORODOVIAS.pdf, Balanco-DRE-FC-2026-06.xlsx...), e podem ser
// corrigidos na própria linha; quando o nome não diz, a linha pede. Cada arquivo é conferido aqui antes de sair
// (extensão do tipo, tamanho, formato do período) e vai com o nome padronizado do acervo: é por ele que a extração
// reconhece o documento. O envio em si é do serviço de upload (services/uploadApi.js, onde está o contrato); sem ele
// no ar, a tela avisa e não envia nada.

const EMISSORES = ['Ecorodovias']
const EXTENSOES = [...new Set(TIPOS.flatMap(t => t.extensoes))].map(e => `.${e}`)
const STATUS = {
  recebido: { rotulo: 'Recebido', cor: 'blue' }, extraindo: { rotulo: 'Extraindo', cor: 'purple' },
  no_acervo: { rotulo: 'No acervo', cor: 'green' }, erro: { rotulo: 'Erro', cor: 'red' },
}

let sequencia = 0

function tamanho(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// O que impede o envio do arquivo, ou ''. Conferido a cada render, com o tipo e o período da linha.
function problemaDe(f) {
  if (f.estado === 'enviado') return ''
  if (!f.tipo) return 'Escolha o tipo: o nome do arquivo não diz qual é'
  const problema = validarArquivo(f.arquivo, f.tipo)
  if (problema) return problema
  if (!f.periodo.trim()) return `Informe o período (ex.: ${formatoDoPeriodo(f.tipo).exemplo}): o nome do arquivo não diz`
  if (!periodoValido(f.tipo, f.periodo)) return `Período no formato ${formatoDoPeriodo(f.tipo).exemplo}`
  return ''
}

function ConfiguracoesPage() {
  const { user } = useAuth()
  const podeEnviar = user?.role !== 'leitor'
  const [servico, setServico] = useState(null) // {conectado, simulado, motivo}
  const [emissor, setEmissor] = useState(EMISSORES[0])
  // {id, arquivo, tipo, periodo, lido: {tipo, periodo} (o que veio do nome), estado: pronto|enviando|enviado|erro,
  //  progresso, detalhe}
  const [fila, setFila] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [envios, setEnvios] = useState([])
  const [erroLista, setErroLista] = useState('')
  const controlador = useRef(null)

  function recarregarEnvios() {
    listarEnvios().then(r => { setEnvios(r.arquivos || []); setErroLista('') }).catch(e => setErroLista(e.message))
  }

  useEffect(() => {
    let ativo = true
    situacao().then(s => {
      if (!ativo) return
      setServico(s)
      if (s.conectado) recarregarEnvios()
    })
    return () => { ativo = false; controlador.current?.abort() }
  }, [])

  function adicionar(_, { addedFiles }) {
    setFila(atual => {
      const nomes = new Set(atual.map(f => f.arquivo.name))
      const novos = addedFiles.filter(a => !nomes.has(a.name)).map(arquivo => {
        const lido = lerNomeDoArquivo(arquivo.name)
        return { id: `f${++sequencia}`, arquivo, tipo: lido.tipo, periodo: lido.periodo, lido, estado: 'pronto',
                 progresso: 0 }
      })
      return [...atual, ...novos]
    })
  }

  const alterar = (id, mudanca) => setFila(atual => atual.map(f => (f.id === id ? { ...f, ...mudanca } : f)))

  // Trocar o tipo na linha relê o período do nome no formato do tipo novo (o "2025" de um AF vira o ano da DFP).
  function trocarTipo(f, tipo) {
    alterar(f.id, { tipo, periodo: periodoDoNome(f.arquivo.name, tipo) || f.periodo })
  }

  async function enviar() {
    const prontos = fila.filter(f => !problemaDe(f) && (f.estado === 'pronto' || f.estado === 'erro'))
    if (!prontos.length) return
    const meu = new AbortController()
    controlador.current = meu
    setEnviando(true)
    for (const f of prontos) {
      if (meu.signal.aborted) break
      alterar(f.id, { estado: 'enviando', progresso: 0, detalhe: '' })
      try {
        const r = await enviarArquivo({ arquivo: f.arquivo, emissor, tipo: f.tipo, periodo: f.periodo.trim().toUpperCase() },
          p => alterar(f.id, { progresso: p }), meu.signal)
        alterar(f.id, { estado: 'enviado', progresso: 100, detalhe: r.chave ? `no bucket: ${r.chave}` : '' })
      } catch (e) {
        alterar(f.id, { estado: 'erro', detalhe: e.name === 'AbortError' ? 'Envio cancelado' : e.message })
      }
    }
    setEnviando(false)
    recarregarEnvios()
  }

  const prontos = fila.filter(f => !problemaDe(f) && f.estado !== 'enviado' && f.estado !== 'enviando')

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Configurações</h1>
          <span className="ana-cabecalho__referencia">envio de documentos do emissor para o acervo</span>
        </div>
      </header>

      <section className="des-secao" aria-label="Envio de documentos">
        <h2 className="ana-secao__titulo">Envio de documentos</h2>
        <p className="cfg-texto">
          Solte os documentos do emissor: o tipo e o período de cada um são lidos do nome do arquivo (ex.:
          ITR-3T26-ECORODOVIAS.pdf, DFP-2025-ECORODOVIAS.pdf, Balanco-DRE-FC-2026-09.xlsx) e podem ser corrigidos na
          linha. Eles vão para o bucket, na pasta do tipo, com o nome padronizado do acervo; a extração os lê e eles
          passam a aparecer em "Fontes disponíveis" (aba Desempenho) e nas consultas do chat.
        </p>

        {servico === null && <p className="cfg-texto">Conferindo o serviço de envio…</p>}
        {servico && !servico.conectado && (
          <InlineNotification kind="warning" lowContrast hideCloseButton title="Serviço de envio não conectado."
            subtitle="Os arquivos são conferidos aqui, mas o envio ao bucket fica desligado até o serviço de upload entrar no ar." />
        )}
        {servico?.simulado && (
          <InlineNotification kind="info" lowContrast hideCloseButton title="Modo de demonstração."
            subtitle="O envio é simulado: nenhum arquivo vai para o bucket." />
        )}
        {!podeEnviar && (
          <InlineNotification kind="info" lowContrast hideCloseButton title="Seu perfil só lê os relatórios."
            subtitle="O envio de documentos é para analistas." />
        )}

        <div className="cfg-campos">
          <Select id="cfg-emissor" labelText="Emissor" value={emissor} onChange={e => setEmissor(e.target.value)}>
            {EMISSORES.map(e => <SelectItem key={e} value={e} text={e} />)}
          </Select>
        </div>

        <FileUploaderDropContainer className="cfg-soltar" multiple disabled={!podeEnviar || enviando}
          accept={EXTENSOES} onAddFiles={adicionar}
          labelText={`Arraste os arquivos aqui ou clique para escolher (${EXTENSOES.join(', ')}, até ${TAMANHO_MAXIMO / 1024 / 1024} MB cada)`} />

        {fila.length > 0 && (
          <ul className="cfg-fila">
            {fila.map(f => {
              const problema = problemaDe(f)
              const travado = f.estado === 'enviando' || f.estado === 'enviado'
              return (
                <li key={f.id} className="cfg-fila__item">
                  <FileUploaderItem name={f.arquivo.name} size="md"
                    status={f.estado === 'enviando' ? 'uploading' : f.estado === 'enviado' ? 'complete' : 'edit'}
                    invalid={Boolean(problema) || f.estado === 'erro'}
                    errorSubject={problema || f.detalhe} iconDescription="Tirar da lista"
                    onDelete={() => setFila(atual => atual.filter(x => x.id !== f.id))} />
                  <div className="cfg-fila__campos">
                    <Select id={`${f.id}-tipo`} labelText="Tipo" size="sm" value={f.tipo} disabled={travado}
                      onChange={e => trocarTipo(f, e.target.value)}>
                      {!f.tipo && <SelectItem value="" text="Escolha o tipo" />}
                      {TIPOS.map(t => <SelectItem key={t.id} value={t.id} text={t.nome} />)}
                    </Select>
                    <TextInput id={`${f.id}-periodo`} labelText="Período" size="sm" value={f.periodo} disabled={travado || !f.tipo}
                      placeholder={f.tipo ? formatoDoPeriodo(f.tipo).exemplo : ''}
                      onChange={e => alterar(f.id, { periodo: e.target.value })} />
                    <div className="cfg-fila__origem">
                      {f.lido.tipo && f.tipo === f.lido.tipo && f.periodo && f.periodo === f.lido.periodo
                        ? <Tag size="sm" type="green">lido do nome</Tag>
                        : f.tipo && f.periodo ? <Tag size="sm" type="blue">ajustado na tela</Tag>
                          : <Tag size="sm" type="warm-gray">informe na linha</Tag>}
                    </div>
                  </div>
                  <p className="cfg-fila__detalhe">
                    {tamanho(f.arquivo.size)}
                    {!problema && ` · entra como ${TIPOS.find(t => t.id === f.tipo)?.pasta}/${nomePadronizado({
                      arquivo: f.arquivo, tipo: f.tipo, periodo: f.periodo, emissor })}`}
                    {f.estado === 'enviado' && f.detalhe && ` · ${f.detalhe}`}
                  </p>
                  {f.estado === 'enviando' && (
                    <ProgressBar label={`Enviando ${f.arquivo.name}`} hideLabel value={f.progresso} max={100} size="small" />
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="cfg-acoes">
          {enviando && <Button kind="secondary" size="md" onClick={() => controlador.current?.abort()}>Cancelar</Button>}
          <Button size="md" renderIcon={Upload} onClick={enviar}
            disabled={!podeEnviar || !servico?.conectado || enviando || !prontos.length}>
            {enviando ? 'Enviando…'
              : prontos.length ? `Enviar ${prontos.length} ${prontos.length === 1 ? 'arquivo' : 'arquivos'}` : 'Enviar arquivos'}
          </Button>
        </div>
      </section>

      <section className="des-secao" aria-label="Envios recentes">
        <h2 className="ana-secao__titulo">Envios recentes</h2>
        {erroLista && <InlineNotification kind="error" lowContrast hideCloseButton title={erroLista} />}
        {!servico?.conectado ? (
          <p className="cfg-texto">A lista aparece quando o serviço de envio estiver conectado.</p>
        ) : envios.length === 0 ? (
          <p className="cfg-texto">Nenhum envio ainda.</p>
        ) : (
          <table className="des-tabela">
            <thead><tr><th>Arquivo</th><th>Tipo</th><th>Período</th><th>Enviado por</th><th>Quando</th><th>Situação</th></tr></thead>
            <tbody>
              {envios.map(e => (
                <tr key={e.id}>
                  <td>{e.nome}</td>
                  <td>{TIPOS.find(t => t.id === e.tipo)?.nome || e.tipo}</td>
                  <td>{e.periodo || '—'}</td>
                  <td>{e.usuario || '—'}</td>
                  <td>{dataHora(e.enviado_em)}</td>
                  <td>
                    <Tag size="sm" type={STATUS[e.status]?.cor || 'gray'}>{STATUS[e.status]?.rotulo || e.status}</Tag>
                    {e.detalhe && <span className="cfg-texto"> {e.detalhe}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default ConfiguracoesPage
