import { useEffect, useMemo, useState } from 'react'
import {
  Accordion, AccordionItem, Button, ContentSwitcher, InlineLoading, InlineNotification, Modal, Search, Switch, Tab,
  TabList, TabPanel, TabPanels, Tabs, Tag,
} from '@carbon/react'
import { Download, DocumentPdf, Renew, Search as IconeBusca, Table, WarningAlt } from '@carbon/icons-react'
import { buscarConteudo, listarDocumentos, urlDocumento } from '../../services/coletaApi'
import { lerCatalogo } from '../../services/documentosApi'
import NovoEmissor from '../Emissores/NovoEmissor.jsx'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import './DocumentosPage.scss'
import Carregando from '../Comum/Carregando.jsx'

// Aba Documentos: o acervo de documentos de cada empresa, como um GED.
//
// Lê os arquivos de cada empresa pela coleta-api e o catálogo deles pela analise-api (30/10/2026): o tipo e o
// período de cada documento são os lidos do conteúdo extraído, nunca do nome do arquivo nem da pasta em que foi
// enviado (que aparece só como identificação). Os grupos são os tipos do catálogo; arquivo ainda não extraído fica em
// "Aguardando extração", e o que o conteúdo não identifica, em "Não identificado" ou "Sem texto extraído", com o
// alerta. Clicar num PDF abre a visualização num popup, com a evidência (página e trecho) do tipo e do período;
// planilha não tem visualização no navegador e vai para download.
//
// Duas buscas no mesmo campo: pelo nome do arquivo (filtra a lista na hora) e pelo conteúdo, que procura o termo no
// texto que o extrator gravou nos buckets de saída e devolve as páginas e os trechos. Clicar num trecho abre o PDF
// já na página dele.

function tamanho(bytes) {
  if (bytes === null || bytes === undefined) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function data(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : ''
}

const ROTULO_TIPO = {
  itr: 'ITR trimestral', dfp: 'DFP anual', release: 'Release e apresentações', escritura: 'Escrituras e aditamentos',
  af: 'Relatórios do agente fiduciário', rating: 'Rating', ri: 'Planilhas de RI', '': 'Sem pasta (lido como ITR)',
}

const tipoDaChave = chave => (chave.includes('/') ? chave.split('/')[0] : '')

// Ordem dos grupos: os tipos do catálogo (rótulos da analise-api), depois o que não foi identificado.
const ORDEM_GRUPOS = [
  'ITR', 'DFP', 'Release de resultados', 'Apresentação de resultados', 'Transcrição de teleconferência',
  'Apresentação institucional', 'Planilha de RI', 'Escritura de emissão', 'Aditamento à escritura',
  'Relatório anual do agente fiduciário', 'Relatório de rating', 'Não identificado', 'Sem texto extraído',
  'Aguardando extração',
]
const posicaoDoGrupo = rotulo => {
  const i = ORDEM_GRUPOS.indexOf(rotulo)
  return i < 0 ? ORDEM_GRUPOS.length : i
}

// Os arquivos da empresa agrupados pelo tipo do catálogo. O arquivo é achado no catálogo pelo nome (o catálogo
// guarda o arquivo de origem da extração); sem linha no catálogo, ainda não foi extraído.
function agruparPeloCatalogo(empresa, catalogo) {
  // Catálogo ainda não montado (as tools o montam alguns minutos depois da extração, pelo aquecedor): os grupos
  // ficam pela pasta de envio, com aviso.
  if (!catalogo?.montado) return empresa.tipos.map(t => ({ ...t, rotulo: ROTULO_TIPO[t.tipo] ?? t.rotulo }))
  const porArquivo = new Map((catalogo?.documentos || []).map(l => [l.arquivo, l]))
  const grupos = new Map()
  for (const t of empresa.tipos) {
    for (const d of t.documentos) {
      const linha = porArquivo.get(d.nome)
      const rotulo = linha ? linha.tipo : 'Aguardando extração'
      if (!grupos.has(rotulo)) grupos.set(rotulo, [])
      grupos.get(rotulo).push({ ...d, catalogo: linha || null })
    }
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => posicaoDoGrupo(a) - posicaoDoGrupo(b))
    .map(([rotulo, documentos]) => ({ tipo: rotulo, rotulo, documentos }))
}

// O trecho com o termo destacado. A API devolve a posição do termo no trecho.
function TrechoMarcado({ trecho }) {
  const { texto, inicio, fim } = trecho
  return (
    <>
      {texto.slice(0, inicio)}<mark>{texto.slice(inicio, fim)}</mark>{texto.slice(fim)}
    </>
  )
}

function DocumentosPage() {
  const [acervo, setAcervo] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState('nome') // nome | conteudo
  const [busca, setBusca] = useState('')
  const [resultado, setResultado] = useState(null) // resposta da busca por conteúdo
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(null) // {empresa, razao, doc, pagina}
  const [catalogos, setCatalogos] = useState({}) // empresa -> {montado, documentos}

  function buscar() {
    return listarDocumentos()
      .then(async r => {
        setAcervo(r.empresas)
        setErro('')
        // Catálogo de cada empresa; falha num não derruba a tela: os arquivos aparecem como "Aguardando extração".
        const lidos = await Promise.allSettled(r.empresas.map(e => lerCatalogo(e.empresa)))
        setCatalogos(Object.fromEntries(r.empresas.map((e, i) => [e.empresa,
          lidos[i].status === 'fulfilled' ? lidos[i].value : { montado: false, documentos: [] }])))
      })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false))
  }

  function carregar() {
    setCarregando(true)
    buscar()
  }

  // O estado já nasce "carregando": o efeito só busca.
  useEffect(() => { buscar() }, [])

  async function buscarNoConteudo() {
    const termo = busca.trim()
    if (termo.length < 2) return
    setBuscando(true)
    try {
      setResultado(await buscarConteudo(termo))
      setErro('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setBuscando(false)
    }
  }

  // Filtro pelo nome do arquivo, em todas as empresas e tipos ao mesmo tempo.
  const filtrado = useMemo(() => {
    if (!acervo) return null
    const agrupado = acervo.map(e => ({ ...e, tipos: agruparPeloCatalogo(e, catalogos[e.empresa]) }))
    const termo = modo === 'nome' ? busca.trim().toLowerCase() : ''
    if (!termo) return agrupado
    return agrupado.map(e => ({
      ...e,
      tipos: e.tipos
        .map(t => ({ ...t, documentos: t.documentos.filter(d => d.nome.toLowerCase().includes(termo)) }))
        .filter(t => t.documentos.length),
    }))
  }, [acervo, catalogos, busca, modo])

  const razaoDe = empresa => acervo?.find(e => e.empresa === empresa)?.razao_social || empresa

  function abrirResultado(r, pagina) {
    if (!r.arquivo_disponivel) return
    const ext = r.nome.includes('.') ? `.${r.nome.split('.').pop().toLowerCase()}` : ''
    setAberto({
      empresa: r.empresa, razao: razaoDe(r.empresa), pagina: typeof pagina === 'number' ? pagina : null,
      doc: { chave: r.chave_entrada, nome: r.nome, extensao: ext, tamanho: null, data: r.data_json },
    })
  }

  const ehPdf = aberto?.doc.extensao === '.pdf'
  const srcVisualizador = aberto
    ? `${urlDocumento(aberto.empresa, aberto.doc.chave)}${aberto.pagina ? `#page=${aberto.pagina}` : ''}` : ''
  const semExtracao = resultado
    ? Object.entries(resultado.indice?.sem_extracao || {}).filter(([, lista]) => lista.length) : []

  // Resultados por empresa, na ordem que a API devolve (mais termos achados, mais ocorrências).
  const porEmpresa = useMemo(() => {
    const grupos = new Map()
    for (const r of resultado?.resultados || []) {
      if (!grupos.has(r.empresa)) grupos.set(r.empresa, [])
      grupos.get(r.empresa).push(r)
    }
    return [...grupos.entries()]
  }, [resultado])

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Documentos</h1>
          <span className="ana-cabecalho__referencia">acervo de cada empresa no COS, por tipo de documento</span>
        </div>
        {/* O acervo lista as empresas com documentos: a nova aparece depois da primeira coleta ou envio. */}
        <NovoEmissor aviso />
      </header>

      <section className="des-secao" aria-label="Acervo">
        <div className="doc-modo">
          <ContentSwitcher size="sm" selectedIndex={modo === 'nome' ? 0 : 1}
            onChange={({ name }) => { setModo(name); setResultado(null) }}>
            <Switch name="nome" text="Nome do arquivo" />
            <Switch name="conteudo" text="Conteúdo dos documentos" />
          </ContentSwitcher>
        </div>
        <div className="doc-barra">
          <Search size="md" labelText="Buscar documento" closeButtonLabelText="Limpar busca"
            placeholder={modo === 'nome' ? 'Buscar pelo nome do arquivo'
              : 'Termo no texto dos documentos (ex.: 4,75x, covenant, "dívida líquida")'}
            value={busca}
            onChange={e => { setBusca(e.target.value); if (!e.target.value) setResultado(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && modo === 'conteudo') buscarNoConteudo() }} />
          {modo === 'conteudo' ? (
            <Button renderIcon={IconeBusca} onClick={buscarNoConteudo} disabled={buscando || busca.trim().length < 2}>
              Buscar
            </Button>
          ) : (
            <Button kind="ghost" renderIcon={Renew} onClick={carregar} disabled={carregando}>Atualizar</Button>
          )}
        </div>
        {modo === 'conteudo' && !resultado && !buscando && (
          <p className="doc-origem">
            Procura no texto que o extrator leu de cada documento, nas duas empresas. Várias palavras: o documento
            precisa ter todas. Frase entre aspas vale inteira. Maiúsculas e acentos não importam.
          </p>
        )}

        {erro && (
          <InlineNotification kind="error" lowContrast title="Não foi possível ler o acervo." subtitle={erro}
            onCloseButtonClick={() => setErro('')} />
        )}

        {modo === 'conteudo' && buscando && (
          <InlineLoading description="Buscando no conteúdo… a primeira busca depois de o serviço subir monta o índice e leva alguns segundos." />
        )}

        {modo === 'conteudo' && resultado && !buscando && (
          <div className="doc-resultados">
            <p className="doc-origem">
              {resultado.resultados.length
                ? `${resultado.resultados.length} documento(s) com “${resultado.consulta}”`
                : `Nenhum documento com “${resultado.consulta}”`}
              {' '}· {resultado.indice?.documentos} documentos no índice
            </p>
            {semExtracao.length > 0 && (
              <InlineNotification kind="info" lowContrast hideCloseButton title="Fora da busca por conteúdo:"
                subtitle={semExtracao.map(([empresa, lista]) => `${razaoDe(empresa)}: ${lista.length} documento(s) ainda sem extração`).join(' · ')} />
            )}
            {porEmpresa.map(([empresa, lista]) => (
              <div key={empresa} className="doc-grupo">
                <h3 className="doc-grupo__titulo">{razaoDe(empresa)} <Tag size="sm" type="cool-gray">{lista.length}</Tag></h3>
                <ul className="doc-lista">
                  {lista.map(r => (
                    <li key={r.chave_json} className="doc-achado">
                      <div className="doc-achado__cabeca">
                        <button type="button" className="doc-achado__nome" disabled={!r.arquivo_disponivel}
                          onClick={() => abrirResultado(r, r.paginas.find(p => typeof p === 'number'))}>
                          {r.nome.toLowerCase().endsWith('.pdf') ? <DocumentPdf size={20} /> : <Table size={20} />}
                          <span>{r.nome}</span>
                        </button>
                        <Tag size="sm" type="blue">{ROTULO_TIPO[r.tipo] ?? r.tipo}</Tag>
                        <span className="doc-item__meta">{r.ocorrencias} ocorrência(s)</span>
                      </div>
                      {r.paginas.length > 0 && (
                        <div className="doc-paginas">
                          <span className="doc-item__meta">{typeof r.paginas[0] === 'number' ? 'Páginas:' : 'Abas:'}</span>
                          {r.paginas.slice(0, 15).map(p => (
                            typeof p === 'number' && r.arquivo_disponivel ? (
                              <Tag key={p} size="sm" type="outline" as="button" className="doc-pagina"
                                onClick={() => abrirResultado(r, p)}>p. {p}</Tag>
                            ) : <Tag key={p} size="sm" type="outline">{typeof p === 'number' ? `p. ${p}` : p}</Tag>
                          ))}
                          {r.paginas.length > 15 && <span className="doc-item__meta">+{r.paginas.length - 15}</span>}
                        </div>
                      )}
                      <ul className="doc-trechos">
                        {r.trechos.map((t, i) => (
                          <li key={i}>
                            <button type="button" className="doc-trecho" disabled={!r.arquivo_disponivel}
                              onClick={() => abrirResultado(r, t.pagina)}>
                              <span className="doc-trecho__onde">{t.pagina ? `p. ${t.pagina}` : t.local || '—'}</span>
                              <span className="doc-trecho__texto"><TrechoMarcado trecho={t} /></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!r.arquivo_disponivel && (
                        <p className="doc-item__meta">
                          O arquivo de entrada ({r.chave_entrada}) não está mais no bucket: só o texto extraído ficou.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {carregando && !acervo && modo === 'nome' && <Carregando descricao="Lendo os documentos" />}

        {filtrado && modo === 'nome' && (
          <Tabs>
            <TabList aria-label="Empresas" contained>
              {filtrado.map(e => (
                <Tab key={e.empresa}>
                  {e.razao_social.split(' ')[0]} ({e.tipos.reduce((n, t) => n + t.documentos.length, 0)})
                </Tab>
              ))}
            </TabList>
            <TabPanels>
              {filtrado.map(e => (
                <TabPanel key={e.empresa} className="doc-painel">
                  <p className="doc-origem">
                    {e.razao_social} · bucket <code>{e.bucket}</code>
                  </p>
                  {e.erro && <InlineNotification kind="warning" lowContrast hideCloseButton title={e.erro} />}
                  {!e.erro && catalogos[e.empresa] && !catalogos[e.empresa].montado && (
                    <InlineNotification kind="info" lowContrast hideCloseButton
                      title="Catálogo por conteúdo ainda não montado para esta empresa."
                      subtitle="Os grupos abaixo são as pastas de envio; o catálogo fica pronto alguns minutos depois da extração." />
                  )}
                  {!e.erro && !e.tipos.length && (
                    <p className="doc-vazio">{busca ? 'Nenhum documento com esse nome.' : 'Nenhum documento no bucket.'}</p>
                  )}
                  <Accordion>
                    {e.tipos.map(t => (
                      <AccordionItem key={t.tipo} open={Boolean(busca) || e.tipos.length <= 3}
                        title={(
                          <span className="doc-tipo">
                            {t.rotulo}
                            <Tag size="sm" type="cool-gray">{t.documentos.length}</Tag>
                          </span>
                        )}>
                        <ul className="doc-lista">
                          {t.documentos.map(d => (
                            <li key={d.chave}>
                              <button type="button" className="doc-item"
                                onClick={() => setAberto({ empresa: e.empresa, razao: e.razao_social, doc: d, pagina: null })}>
                                {d.extensao === '.pdf' ? <DocumentPdf size={20} /> : <Table size={20} />}
                                <span className="doc-item__nome">{d.nome}</span>
                                {d.catalogo?.periodo && <Tag size="sm" type="blue">{d.catalogo.periodo}</Tag>}
                                {d.catalogo?.alertas?.length > 0 && (
                                  <span className="doc-item__alerta" title={d.catalogo.alertas.join('\n')}>
                                    <WarningAlt size={16} /> revisar
                                  </span>
                                )}
                                <span className="doc-item__meta">
                                  {tamanho(d.tamanho)} · {data(d.data)} · enviado em <code>{tipoDaChave(d.chave) || 'sem pasta'}/</code>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        )}
      </section>

      <Modal open={Boolean(aberto)} passiveModal size="lg" className="doc-modal"
        modalLabel={aberto ? `${aberto.razao} · ${aberto.doc.catalogo?.tipo
          || ROTULO_TIPO[tipoDaChave(aberto.doc.chave)] || ''}` : ''}
        modalHeading={aberto?.doc.nome || ''} onRequestClose={() => setAberto(null)}>
        {aberto && (
          <>
            <div className="doc-modal__barra">
              <span className="doc-item__meta">
                {aberto.doc.chave}
                {aberto.doc.tamanho ? ` · ${tamanho(aberto.doc.tamanho)}` : ''}
                {aberto.pagina ? ` · aberto na página ${aberto.pagina}` : ''}
              </span>
              <Button kind="tertiary" size="sm" renderIcon={Download}
                href={urlDocumento(aberto.empresa, aberto.doc.chave, { baixar: true })}>Baixar</Button>
            </div>
            {aberto.doc.catalogo && (
              <div className="doc-catalogo">
                <p>
                  <strong>{aberto.doc.catalogo.tipo}</strong>
                  {aberto.doc.catalogo.periodo ? ` · ${aberto.doc.catalogo.periodo}` : ''}
                  {aberto.doc.catalogo.emissao ? ` · ${aberto.doc.catalogo.emissao}ª emissão` : ''}
                  {' '}· lido do conteúdo, não do nome do arquivo
                </p>
                {[['Tipo', aberto.doc.catalogo.evidencia_tipo], ['Período', aberto.doc.catalogo.evidencia_periodo]]
                  .filter(([, ev]) => ev?.trecho)
                  .map(([rotulo, ev]) => (
                    <p key={rotulo} className="doc-catalogo__evidencia">
                      {rotulo}{ev.pagina ? ` (p. ${ev.pagina})` : ''}: “{ev.trecho}”
                    </p>
                  ))}
                {aberto.doc.catalogo.alertas?.map(a => (
                  <InlineNotification key={a} kind="warning" lowContrast hideCloseButton title={a} />
                ))}
              </div>
            )}
            {ehPdf ? (
              // `key` com a página: trocar de página no mesmo PDF recarrega o visualizador no lugar certo.
              <iframe key={srcVisualizador} className="doc-visualizador" title={aberto.doc.nome} src={srcVisualizador} />
            ) : (
              <InlineNotification kind="info" lowContrast hideCloseButton
                title="Sem visualização para este formato."
                subtitle="Planilhas não são exibidas no navegador: use Baixar para abrir no Excel." />
            )}
          </>
        )}
      </Modal>
    </main>
  )
}

export default DocumentosPage
