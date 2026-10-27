import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Checkbox, InlineLoading, InlineNotification, Modal, Select, SelectItem, Tab, TabList, TabPanel, TabPanels,
  Tabs, Tag, Toggle,
} from '@carbon/react'
import { CloudDownload, Download, Launch } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  FONTES, dispararColeta, listarColetas, listarEmissores, obterColeta, resumoExtracao, urlArquivoExtracao,
} from '../../services/coletaApi'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import AnexarDocumentos from '../AnaliseCredito/AnexarDocumentos.jsx'
import NovoEmissor, { OPCAO_NOVO_EMISSOR } from '../Emissores/NovoEmissor.jsx'
import RemoverEmissor from '../Emissores/RemoverEmissor.jsx'
import AtuacaoEmissor from '../Emissores/AtuacaoEmissor.jsx'
import { EVENTO_EMISSORES } from '../Emissores/atuacao'
import SeletorPeriodo from '../Periodo/SeletorPeriodo.jsx'
import { periodoValido, rotuloPeriodo } from '../Periodo/periodos'
import './ColetaPage.scss'

// Aba Coleta: dispara o crawler de fontes públicas do emissor e acompanha cada estágio.
//
// Fluxo que a tela mostra, na ordem em que acontece: a fonte que está rodando, o site que está sendo acessado, cada
// documento baixado (ou por que não foi), o envio ao bucket de entrada do emissor e, depois, a extração: o envio
// dispara o extrator pela assinatura do COS, e o JSON aparece no bucket de saída. A tela pergunta o andamento a cada
// 2 s durante a coleta e a cada 15 s enquanto houver extração aguardando.

const INTERVALO_COLETA_MS = 2000
const INTERVALO_EXTRACAO_MS = 15000

const STATUS_DOC = {
  baixado: { rotulo: 'Baixado', cor: 'green' },
  pendente_manual: { rotulo: 'Pendente manual', cor: 'warm-gray' },
  nao_encontrado: { rotulo: 'Não encontrado', cor: 'red' },
  ignorado: { rotulo: 'Ignorado', cor: 'cool-gray' },
}
const ACAO = {
  novo: 'novo', versao_nova: 'versão nova', mesmo_conteudo: 'já no acervo', repetido: 'já no acervo',
  registrado: '',
}
const STATUS_EXTRACAO = {
  concluida: { rotulo: 'Extraído', cor: 'green' },
  aguardando: { rotulo: 'Extraindo…', cor: 'purple' },
  sem_resultado: { rotulo: 'Sem resultado', cor: 'red' },
  sem_registro: { rotulo: 'Sem JSON', cor: 'warm-gray' },
  nao_aplicavel: null,
}
const STATUS_COLETA = {
  em_execucao: { rotulo: 'Em execução', cor: 'blue' },
  concluida: { rotulo: 'Concluída', cor: 'green' },
  falhou: { rotulo: 'Falhou', cor: 'red' },
  interrompida: { rotulo: 'Interrompida', cor: 'warm-gray' },
}

function hora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR') : ''
}

function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

function tamanho(bytes) {
  if (!bytes && bytes !== 0) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Uma linha de atividade legível a partir do evento da API.
function descreverEvento(e) {
  switch (e.tipo) {
    case 'inicio': return { icone: '▶', texto: `Coleta iniciada: ${(e.fontes || []).map(f => FONTES[f] || f).join(', ')}` }
    case 'fonte_inicio': return { icone: '◆', texto: `Fonte: ${FONTES[e.fonte] || e.fonte}`, destaque: true }
    case 'fonte_fim': return { icone: '✓', texto: `${FONTES[e.fonte] || e.fonte} concluída (${e.itens} itens)` }
    case 'acesso': return { icone: '→', texto: `${e.modo === 'pagina' ? 'Abrindo página' : 'Baixando'} ${e.url}`, url: e.url, fraco: true }
    case 'download': return { icone: '↓', texto: `Recebido ${tamanho(e.bytes)} (${e.conteudo}) de ${e.url}`, fraco: true }
    case 'upload': return { icone: '☁', texto: `Enviado ao COS: ${e.bucket}/${e.chave} — aciona o extrator` }
    case 'documento': {
      const s = STATUS_DOC[e.status]?.rotulo || e.status
      const nome = e.nome_destino || e.url_origem || '(sem arquivo)'
      return { icone: '■', texto: `${s}: ${nome}${e.motivo && e.status !== 'baixado' ? ` — ${e.motivo}` : ''}`,
               status: e.status }
    }
    case 'erro': return { icone: '✕', texto: `Erro: ${e.mensagem}`, status: 'nao_encontrado' }
    case 'fim': return { icone: '■', texto: `Coleta encerrada${e.problemas?.length ? ` com ${e.problemas.length} problema(s) no manifesto` : ''}` }
    default: return { icone: '·', texto: e.tipo }
  }
}

function ColetaPage() {
  const { user } = useAuth()
  const podeDisparar = user?.role !== 'leitor'
  const [emissores, setEmissores] = useState(null)
  const [erroServico, setErroServico] = useState('')
  const [emissor, setEmissor] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [fontes, setFontes] = useState([])
  const [upload, setUpload] = useState(true)
  const [periodo, setPeriodo] = useState({ de: '', ate: null }) // um trimestre (ate null) ou um intervalo
  const [disparando, setDisparando] = useState(false)
  const [erroDisparo, setErroDisparo] = useState('')
  const [historico, setHistorico] = useState([])
  const [execucaoId, setExecucaoId] = useState(null)
  const [execucao, setExecucao] = useState(null)
  const [extracaoAberta, setExtracaoAberta] = useState(null) // {chave, nome, dados, erro}

  const config = useMemo(() => emissores?.find(e => e.emissor === emissor), [emissores, emissor])

  const recarregarHistorico = useCallback(alvo => {
    listarColetas(alvo).then(lista => {
      setHistorico(lista)
      // Coleta em andamento (disparada noutra aba ou por outra pessoa) abre sozinha.
      const andamento = lista.find(c => c.status === 'em_execucao')
      setExecucaoId(atual => atual || andamento?.id || lista[0]?.id || null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    listarEmissores().then(lista => {
      setEmissores(lista)
      const padrao = lista.find(e => e.upload_permitido) || lista[0]
      if (padrao) {
        setEmissor(padrao.emissor)
        setFontes(padrao.fontes)
        setUpload(padrao.upload_permitido)
        setPeriodo({ de: padrao.periodo || '', ate: null })
      }
    }).catch(e => setErroServico(e.message))
    recarregarHistorico()
  }, [recarregarHistorico])

  // Cadastro ou atuação gravados em outra aba: relê a lista, mantendo a seleção.
  useEffect(() => {
    const reler = () => listarEmissores().then(setEmissores).catch(() => {})
    window.addEventListener(EVENTO_EMISSORES, reler)
    return () => window.removeEventListener(EVENTO_EMISSORES, reler)
  }, [])

  // Emissor recém-cadastrado (ou o existente com o mesmo CNPJ): a lista é relida e ele fica selecionado.
  function emissorCadastrado(registro) {
    listarEmissores().then(lista => {
      setEmissores(lista)
      trocarEmissor(registro.emissor, lista)
    }).catch(e => setErroServico(e.message))
  }

  // Emissor removido: a lista é relida e a seleção volta para o primeiro que aceita envio.
  function emissorRemovido() {
    listarEmissores().then(lista => {
      setEmissores(lista)
      const padrao = lista.find(e => e.upload_permitido) || lista[0]
      if (padrao) trocarEmissor(padrao.emissor, lista)
    }).catch(e => setErroServico(e.message))
  }

  function trocarEmissor(nome, lista = emissores) {
    setEmissor(nome)
    const cfg = lista.find(e => e.emissor === nome)
    setFontes(cfg?.fontes || [])
    setUpload(Boolean(cfg?.upload_permitido))
    setPeriodo({ de: cfg?.periodo || '', ate: null })
  }

  // Polling da execução selecionada.
  useEffect(() => {
    if (!execucaoId) return undefined
    let ativo = true
    let timer
    async function buscar() {
      try {
        const dados = await obterColeta(execucaoId)
        if (!ativo) return
        setExecucao(dados)
        const rodando = dados.status === 'em_execucao'
        const extraindo = (dados.extracoes || []).some(x => x.status === 'aguardando')
        if (rodando || extraindo) {
          timer = setTimeout(buscar, rodando ? INTERVALO_COLETA_MS : INTERVALO_EXTRACAO_MS)
        } else {
          recarregarHistorico()
        }
      } catch (e) {
        if (ativo) setErroServico(e.message)
      }
    }
    buscar()
    return () => { ativo = false; clearTimeout(timer) }
  }, [execucaoId, recarregarHistorico])

  async function iniciar() {
    setErroDisparo('')
    setDisparando(true)
    try {
      const nova = await dispararColeta({ emissor, fontes, upload, periodo: periodo.de, periodoAte: periodo.ate })
      setExecucao(null)
      setExecucaoId(nova.id)
      recarregarHistorico()
    } catch (e) {
      setErroDisparo(e.message)
    } finally {
      setDisparando(false)
    }
  }

  async function abrirExtracao(extracao, doc) {
    setExtracaoAberta({ chave: extracao.chave_json, nome: doc.nome_destino, dados: null, erro: '' })
    try {
      const dados = await resumoExtracao(execucao.emissor, extracao.chave_json)
      setExtracaoAberta(atual => ({ ...atual, dados }))
    } catch (e) {
      setExtracaoAberta(atual => ({ ...atual, erro: e.message }))
    }
  }

  const emAndamento = historico.some(c => c.status === 'em_execucao') || execucao?.status === 'em_execucao'
  const extracoes = execucao?.extracoes || []
  const contagem = execucao?.contagem || {}
  const totalExtraidos = extracoes.filter(x => x.status === 'concluida').length
  const totalExtraiveis = extracoes.filter(x => x.status && x.status !== 'nao_aplicavel').length
  const eventos = [...(execucao?.eventos || [])].reverse()

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Coleta de fontes</h1>
          <span className="ana-cabecalho__referencia">
            fontes públicas (automática) ou envio de arquivos (manual), com o período de cada um
          </span>
        </div>
      </header>

      <Tabs>
        <TabList aria-label="Tipo de coleta" contained>
          <Tab>Coleta automática</Tab>
          <Tab>Coleta manual</Tab>
        </TabList>
        <TabPanels>
          <TabPanel className="col-aba">

      {erroServico && (
        <InlineNotification kind="error" lowContrast title="Serviço de coleta indisponível." subtitle={erroServico}
          onCloseButtonClick={() => setErroServico('')} />
      )}

      <section className="des-secao" aria-label="Nova coleta">
        <h2 className="ana-secao__titulo">Nova coleta</h2>
        <p className="cfg-texto col-texto">
          O crawler visita as fontes públicas na ordem abaixo, baixa o kit de documentos do emissor e confere de quem é
          cada um. Com o envio ligado, cada documento vai para o bucket de entrada do emissor, na pasta do tipo
          (itr/, dfp/, release/, escritura/, af/, rating/, ri/), o que aciona o extrator. Sites que pedem login ou
          barram robôs não são contornados: ficam como pendência manual.
        </p>

        {emissores === null && !erroServico && <InlineLoading description="Carregando emissores…" />}
        {emissores && (
          <div className="col-form">
            <Select id="col-emissor" labelText="Emissor" value={emissor} disabled={emAndamento}
              onChange={e => (e.target.value === OPCAO_NOVO_EMISSOR ? setNovoAberto(true) : trocarEmissor(e.target.value))}>
              {emissores.map(e => <SelectItem key={e.emissor} value={e.emissor} text={e.razao_social} />)}
              <SelectItem value={OPCAO_NOVO_EMISSOR} text="+ Novo emissor…" />
            </Select>
            <NovoEmissor aberto={novoAberto} onFechar={() => setNovoAberto(false)} onCriado={emissorCadastrado} />
            {!emAndamento && podeDisparar && <RemoverEmissor emissor={config} onRemovido={emissorRemovido} />}
            <AtuacaoEmissor emissor={config} podeEditar={!emAndamento && podeDisparar}
              onAtualizado={() => emissorCadastrado({ emissor })} />

            <SeletorPeriodo id="col-periodo" valor={periodo} onChange={setPeriodo} padrao={config?.periodo}
              disabled={emAndamento}
              helperText={'Por trimestre: ITR (o 4T vem na DFP), DFP do exercício fechado, release e apresentação de '
                + 'resultados. Planilha de RI, apresentação institucional e ratings vêm sempre os mais recentes.'} />

            <fieldset className="col-fontes">
              <legend className="cds--label">Fontes</legend>
              {(config?.fontes || []).map(f => (
                <Checkbox key={f} id={`col-fonte-${f}`} labelText={FONTES[f] || f} checked={fontes.includes(f)}
                  disabled={emAndamento}
                  onChange={(_, { checked }) => setFontes(atual => (checked ? [...atual, f] : atual.filter(x => x !== f)))} />
              ))}
            </fieldset>

            <div className="col-envio">
              <Toggle id="col-upload" labelText="Envio ao COS"
                labelA="Só baixar" labelB={`Enviar para ${config?.bucket_entrada || 'o bucket'} e acionar o extrator`}
                toggled={upload} disabled={!config?.upload_permitido || emAndamento} onToggle={setUpload} />
              {config && !config.upload_permitido && (
                <p className="col-detalhe">Envio desligado para este emissor: {config.motivo_sem_upload}</p>
              )}
            </div>

            <div>
              <Button renderIcon={CloudDownload} onClick={iniciar}
                disabled={!podeDisparar || disparando || emAndamento || !emissor || !fontes.length
                  || !periodoValido(periodo)}>
                {emAndamento ? 'Coleta em andamento' : 'Iniciar coleta'}
              </Button>
              {!podeDisparar && <p className="col-detalhe">Seu perfil só acompanha as coletas.</p>}
            </div>
          </div>
        )}
        {erroDisparo && (
          <InlineNotification kind="error" lowContrast title="A coleta não foi iniciada." subtitle={erroDisparo}
            onCloseButtonClick={() => setErroDisparo('')} />
        )}
      </section>

      {execucao && (
        <>
          <section className="des-secao" aria-label="Andamento">
            <div className="col-titulo-linha">
              <h2 className="ana-secao__titulo">Andamento</h2>
              <Tag type={STATUS_COLETA[execucao.status]?.cor || 'gray'}>
                {STATUS_COLETA[execucao.status]?.rotulo || execucao.status}
              </Tag>
            </div>
            <p className="cfg-texto col-texto">
              {execucao.emissor.toUpperCase()}{execucao.periodo ? ` · ${rotuloPeriodo(execucao.periodo, execucao.periodo_ate)}` : ''} · iniciada {dataHora(execucao.iniciada_em)} por {execucao.usuario}
              {execucao.finalizada_em ? ` · encerrada ${dataHora(execucao.finalizada_em)}` : ''}
              {execucao.upload ? ` · envio para ${execucao.bucket_entrada}` : ' · sem envio ao COS'}
            </p>

            <ol className="col-estagios">
              {(execucao.fontes || []).map(f => {
                const feita = execucao.fontes_concluidas?.includes(f)
                const atual = execucao.fonte_atual === f
                return (
                  <li key={f} className={`col-estagio ${feita ? 'col-estagio--feito' : ''} ${atual ? 'col-estagio--atual' : ''}`}>
                    <span className="col-estagio__marca">{feita ? '✓' : atual ? '●' : '○'}</span>
                    <span>{FONTES[f] || f}</span>
                  </li>
                )
              })}
              {execucao.upload && (
                <li className={`col-estagio ${totalExtraiveis && totalExtraidos === totalExtraiveis ? 'col-estagio--feito' : ''}`}>
                  <span className="col-estagio__marca">{totalExtraiveis && totalExtraidos === totalExtraiveis ? '✓' : '○'}</span>
                  <span>Extração ({totalExtraidos}/{totalExtraiveis})</span>
                </li>
              )}
            </ol>

            {execucao.status === 'em_execucao' && (
              <div className="col-agora">
                <InlineLoading description={execucao.fonte_atual ? `Fonte: ${FONTES[execucao.fonte_atual] || execucao.fonte_atual}` : 'Preparando…'} />
                {execucao.url_atual && <p className="col-agora__url">Acessando: {execucao.url_atual}</p>}
              </div>
            )}

            <div className="col-contagem">
              {Object.entries(STATUS_DOC).map(([chave, s]) => (
                <Tag key={chave} type={s.cor}>{s.rotulo}: {contagem[chave] || 0}</Tag>
              ))}
              {execucao.upload && <Tag type="purple">Extraídos: {totalExtraidos}/{totalExtraiveis}</Tag>}
            </div>

            {execucao.erro && (
              <InlineNotification kind="error" lowContrast hideCloseButton title="A coleta falhou." subtitle={execucao.erro} />
            )}
            {execucao.problemas?.length > 0 && (
              <InlineNotification kind="warning" lowContrast hideCloseButton title="Problemas no manifesto."
                subtitle={execucao.problemas.join('; ')} />
            )}
          </section>

          <section className="des-secao" aria-label="Documentos">
            <h2 className="ana-secao__titulo">Documentos</h2>
            <div className="col-tabela-rolagem">
              <table className="col-tabela">
                <thead>
                  <tr>
                    <th>Documento</th><th>Fonte</th><th>Coleta</th><th>Alertas</th><th>No COS</th><th>Extração</th>
                  </tr>
                </thead>
                <tbody>
                  {(execucao.documentos || []).map((d, i) => {
                    const x = extracoes.find(e => e.indice === i)
                    const sx = x && STATUS_EXTRACAO[x.status]
                    return (
                      <tr key={i}>
                        <td>
                          <div className="col-doc">{d.nome_destino || d.codigo_ativo || d.tipo_documento}</div>
                          {d.motivo && <div className="col-detalhe">{d.motivo}</div>}
                          {d.url_origem && (
                            <a className="col-link" href={d.url_origem} target="_blank" rel="noreferrer">
                              origem <Launch size={12} />
                            </a>
                          )}
                        </td>
                        <td>{FONTES[d.fonte] || d.fonte}</td>
                        <td>
                          <Tag size="sm" type={STATUS_DOC[d.status]?.cor || 'gray'}>{STATUS_DOC[d.status]?.rotulo || d.status}</Tag>
                          {ACAO[d.acao] && <div className="col-detalhe">{ACAO[d.acao]}</div>}
                        </td>
                        <td>{(d.alertas || []).map(a => <Tag key={a} size="sm" type="warm-gray">{a}</Tag>)}</td>
                        <td className="col-chave">{d.chave_cos || ''}</td>
                        <td>
                          {sx && <Tag size="sm" type={sx.cor}>{sx.rotulo}</Tag>}
                          {x?.status === 'concluida' && (
                            <div className="col-acoes">
                              <Button kind="ghost" size="sm" onClick={() => abrirExtracao(x, d)}>Ver resumo</Button>
                              <Button kind="ghost" size="sm" renderIcon={Download} hasIconOnly iconDescription="Baixar JSON"
                                href={urlArquivoExtracao(execucao.emissor, x.chave_json)} />
                            </div>
                          )}
                          {x?.motivo && <div className="col-detalhe">{x.motivo}</div>}
                        </td>
                      </tr>
                    )
                  })}
                  {!execucao.documentos?.length && (
                    <tr><td colSpan={6} className="col-detalhe">Nenhum documento ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="des-secao" aria-label="Atividade">
            <h2 className="ana-secao__titulo">Atividade</h2>
            <ul className="col-atividade">
              {eventos.map(e => {
                const d = descreverEvento(e)
                return (
                  <li key={e.seq} className={`col-evento ${d.fraco ? 'col-evento--fraco' : ''} ${d.destaque ? 'col-evento--destaque' : ''} col-evento--${d.status || e.tipo}`}>
                    <span className="col-evento__hora">{hora(e.hora)}</span>
                    <span className="col-evento__icone">{d.icone}</span>
                    <span className="col-evento__texto">{d.texto}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <section className="des-secao" aria-label="Coletas anteriores">
        <h2 className="ana-secao__titulo">Coletas</h2>
        {!historico.length && <p className="cfg-texto">Nenhuma coleta registrada.</p>}
        <ul className="col-historico">
          {historico.map(c => (
            <li key={c.id}>
              <button type="button" className={`col-historico__item ${c.id === execucaoId ? 'col-historico__item--ativo' : ''}`}
                onClick={() => { setExecucao(null); setExecucaoId(c.id) }}>
                <span>{c.emissor.toUpperCase()}{c.periodo ? ` · ${rotuloPeriodo(c.periodo, c.periodo_ate)}` : ''} · {dataHora(c.iniciada_em)} · {c.usuario}</span>
                <span className="col-historico__tags">
                  <Tag size="sm" type={STATUS_COLETA[c.status]?.cor || 'gray'}>{STATUS_COLETA[c.status]?.rotulo || c.status}</Tag>
                  {c.contagem?.baixado ? <Tag size="sm" type="green">{c.contagem.baixado} baixados</Tag> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

          </TabPanel>
          <TabPanel className="col-aba">
            {/* Coleta manual: o analista envia os documentos (vários de uma vez) e diz de que período são. */}
            {podeDisparar ? <AnexarDocumentos /> : (
              <InlineNotification kind="info" lowContrast hideCloseButton title="Seu perfil só acompanha as coletas."
                subtitle="O envio de documentos é para analistas." />
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal open={Boolean(extracaoAberta)} passiveModal modalHeading={extracaoAberta?.nome || 'Extração'}
        modalLabel="Resultado do extrator" onRequestClose={() => setExtracaoAberta(null)}>
        {extracaoAberta && !extracaoAberta.dados && !extracaoAberta.erro && <InlineLoading description="Lendo o JSON…" />}
        {extracaoAberta?.erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Falha" subtitle={extracaoAberta.erro} />}
        {extracaoAberta?.dados && (
          <div className="col-extracao">
            <p><strong>JSON:</strong> {execucao?.bucket_saida}/{extracaoAberta.dados.chave}</p>
            <p><strong>Perfil:</strong> {extracaoAberta.dados.perfil} · <strong>Tipo:</strong> {extracaoAberta.dados.tipo_documento || '—'}</p>
            <p>
              <strong>Entidade lida:</strong> {extracaoAberta.dados.entidade_lida || '—'}{' '}
              {extracaoAberta.dados.entidade_conferida === false && <Tag size="sm" type="warm-gray">não conferida</Tag>}
            </p>
            {Object.keys(extracaoAberta.dados.contagens || {}).length > 0 && (
              <p><strong>Conteúdo:</strong>{' '}
                {Object.entries(extracaoAberta.dados.contagens).map(([k, v]) => `${v} ${k}`).join(', ')}</p>
            )}
            {(extracaoAberta.dados.alertas || []).length > 0 ? (
              <InlineNotification kind="warning" lowContrast hideCloseButton title="Alertas do extrator"
                subtitle={extracaoAberta.dados.alertas.map(a => a.mensagem || a.tipo).join(' · ')} />
            ) : <p><strong>Alertas:</strong> nenhum</p>}
            {Object.keys(extracaoAberta.dados.metadata || {}).length > 0 && (
              <dl className="col-metadata">
                {Object.entries(extracaoAberta.dados.metadata).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{String(v ?? '—')}</dd></div>
                ))}
              </dl>
            )}
            <Button kind="tertiary" size="sm" renderIcon={Download}
              href={urlArquivoExtracao(execucao?.emissor, extracaoAberta.dados.chave)}>Baixar JSON completo</Button>
          </div>
        )}
      </Modal>
    </main>
  )
}

export default ColetaPage
