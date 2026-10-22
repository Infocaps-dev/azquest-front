import { useEffect, useRef, useState } from 'react'
import {
  Button, FileUploaderDropContainer, FileUploaderItem, InlineNotification, ProgressBar, Select, SelectItem, Tag,
  TextInput,
} from '@carbon/react'
import { Upload } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  TAMANHO_MAXIMO, TIPOS, enviarArquivo, formatoDoPeriodo, listarEnvios, nomePadronizado, situacao,
  validarArquivo,
} from '../../services/uploadApi'
import { dataHora } from '../AnaliseCredito/vocabulario'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import './ConfiguracoesPage.scss'

// Aba Configurações: envio de documentos do emissor para o bucket, de onde a extração os lê para o acervo.
//
// O analista escolhe emissor, tipo e período, solta os arquivos e envia. Cada arquivo é conferido aqui antes de sair
// (extensão do tipo, tamanho), e vai com o nome padronizado do acervo (ITR-3T26-ECORODOVIAS.pdf): é por ele que a
// extração reconhece o documento. O envio em si é do serviço de upload (services/uploadApi.js, onde está o contrato);
// sem ele no ar, a tela avisa e não envia nada.

const EMISSORES = ['Ecorodovias']
const STATUS = {
  recebido: { rotulo: 'Recebido', cor: 'blue' }, extraindo: { rotulo: 'Extraindo', cor: 'purple' },
  no_acervo: { rotulo: 'No acervo', cor: 'green' }, erro: { rotulo: 'Erro', cor: 'red' },
}

let sequencia = 0

function tamanho(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function ConfiguracoesPage() {
  const { user } = useAuth()
  const podeEnviar = user?.role !== 'leitor'
  const [servico, setServico] = useState(null) // {conectado, simulado, motivo}
  const [emissor, setEmissor] = useState(EMISSORES[0])
  const [tipo, setTipo] = useState('itr')
  const [periodo, setPeriodo] = useState('')
  const [fila, setFila] = useState([]) // {id, arquivo, estado: pronto|enviando|enviado|erro, progresso, detalhe}
  const [enviando, setEnviando] = useState(false)
  const [envios, setEnvios] = useState([])
  const [erroLista, setErroLista] = useState('')
  const controlador = useRef(null)

  const formato = formatoDoPeriodo(tipo)
  const periodoValido = formato.re.test(periodo.trim().toUpperCase())

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

  // Conferido a cada render, com o tipo escolhido agora: um .xlsx que servia para RI não serve para ITR.
  const problema = f => (f.estado === 'enviado' ? '' : validarArquivo(f.arquivo, tipo))

  function adicionar(_, { addedFiles }) {
    setFila(atual => {
      const nomes = new Set(atual.map(f => f.arquivo.name))
      const novos = addedFiles.filter(a => !nomes.has(a.name)).map(arquivo => ({
        id: `f${++sequencia}`, arquivo, estado: 'pronto', progresso: 0,
      }))
      return [...atual, ...novos]
    })
  }

  const alterar = (id, mudanca) => setFila(atual => atual.map(f => (f.id === id ? { ...f, ...mudanca } : f)))

  async function enviar() {
    const prontos = fila.filter(f => !problema(f) && (f.estado === 'pronto' || f.estado === 'erro'))
    if (!prontos.length || !periodoValido) return
    const meu = new AbortController()
    controlador.current = meu
    setEnviando(true)
    for (const f of prontos) {
      if (meu.signal.aborted) break
      alterar(f.id, { estado: 'enviando', progresso: 0, detalhe: '' })
      try {
        const r = await enviarArquivo({ arquivo: f.arquivo, emissor, tipo, periodo: periodo.trim().toUpperCase() },
          p => alterar(f.id, { progresso: p }), meu.signal)
        alterar(f.id, { estado: 'enviado', progresso: 100, detalhe: r.chave ? `no bucket: ${r.chave}` : '' })
      } catch (e) {
        alterar(f.id, { estado: 'erro', detalhe: e.name === 'AbortError' ? 'Envio cancelado' : e.message })
      }
    }
    setEnviando(false)
    recarregarEnvios()
  }

  const prontos = fila.filter(f => !problema(f) && f.estado !== 'enviado' && f.estado !== 'enviando')
  const tipoAtual = TIPOS.find(t => t.id === tipo)

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
          Os documentos enviados vão para o bucket, na pasta do tipo, com o nome padronizado do acervo. A extração os
          lê e eles passam a aparecer em "Fontes disponíveis" (aba Desempenho) e nas consultas do chat.
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
          <Select id="cfg-tipo" labelText="Tipo de documento" value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS.map(t => <SelectItem key={t.id} value={t.id} text={t.nome} />)}
          </Select>
          <TextInput id="cfg-periodo" labelText="Período / data-base" value={periodo} placeholder={formato.exemplo}
            onChange={e => setPeriodo(e.target.value)}
            invalid={Boolean(periodo) && !periodoValido} invalidText={`Use o formato ${formato.exemplo}`}
            helperText={`Formato: ${formato.exemplo}`} />
        </div>

        <FileUploaderDropContainer className="cfg-soltar" multiple disabled={!podeEnviar || enviando}
          accept={tipoAtual?.extensoes.map(e => `.${e}`)} onAddFiles={adicionar}
          labelText={`Arraste os arquivos aqui ou clique para escolher (${tipoAtual?.extensoes.map(e => `.${e}`).join(', ')}, até ${TAMANHO_MAXIMO / 1024 / 1024} MB cada)`} />

        {fila.length > 0 && (
          <ul className="cfg-fila">
            {fila.map(f => (
              <li key={f.id} className="cfg-fila__item">
                <FileUploaderItem name={f.arquivo.name} size="md"
                  status={f.estado === 'enviando' ? 'uploading' : f.estado === 'enviado' ? 'complete' : 'edit'}
                  invalid={Boolean(problema(f)) || f.estado === 'erro'}
                  errorSubject={problema(f) || f.detalhe} iconDescription="Tirar da lista"
                  onDelete={() => setFila(atual => atual.filter(x => x.id !== f.id))} />
                <p className="cfg-fila__detalhe">
                  {tamanho(f.arquivo.size)}
                  {!problema(f) && periodoValido && ` · entra como ${nomePadronizado({ arquivo: f.arquivo, tipo, periodo, emissor })}`}
                  {f.estado === 'enviado' && f.detalhe && ` · ${f.detalhe}`}
                </p>
                {f.estado === 'enviando' && (
                  <ProgressBar label={`Enviando ${f.arquivo.name}`} hideLabel value={f.progresso} max={100} size="small" />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="cfg-acoes">
          {enviando && <Button kind="secondary" size="md" onClick={() => controlador.current?.abort()}>Cancelar</Button>}
          <Button size="md" renderIcon={Upload} onClick={enviar}
            disabled={!podeEnviar || !servico?.conectado || enviando || !prontos.length || !periodoValido}>
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
