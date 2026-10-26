import { useEffect, useMemo, useState } from 'react'
import {
  Accordion, AccordionItem, Button, InlineLoading, InlineNotification, Modal, Search, Tab, TabList, TabPanel,
  TabPanels, Tabs, Tag,
} from '@carbon/react'
import { Download, DocumentPdf, Renew, Table } from '@carbon/icons-react'
import { listarDocumentos, urlDocumento } from '../../services/coletaApi'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import './DocumentosPage.scss'

// Aba Documentos: o acervo de documentos de cada empresa, como um GED.
//
// Lê os buckets de entrada do COS (ecovias-itr-in-docs da Ecorodovias, motiva-in-docs da Motiva) pela coleta-api e
// agrupa por empresa e por tipo. O tipo é a pasta do bucket, a mesma que decide o perfil do extrator: itr/, dfp/,
// release/, escritura/, af/, rating/, ri/. Clicar num PDF abre a visualização num popup; planilha não tem
// visualização no navegador e vai para download.

function tamanho(bytes) {
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

function DocumentosPage() {
  const [acervo, setAcervo] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null) // {empresa, razao, doc}

  function buscar() {
    return listarDocumentos()
      .then(r => { setAcervo(r.empresas); setErro('') })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false))
  }

  function carregar() {
    setCarregando(true)
    buscar()
  }

  // O estado já nasce "carregando": o efeito só busca.
  useEffect(() => { buscar() }, [])

  // Filtro pelo nome do arquivo, em todas as empresas e tipos ao mesmo tempo.
  const filtrado = useMemo(() => {
    if (!acervo) return null
    const termo = busca.trim().toLowerCase()
    if (!termo) return acervo
    return acervo.map(e => ({
      ...e,
      tipos: e.tipos
        .map(t => ({ ...t, documentos: t.documentos.filter(d => d.nome.toLowerCase().includes(termo)) }))
        .filter(t => t.documentos.length),
    }))
  }, [acervo, busca])

  const ehPdf = aberto?.doc.extensao === '.pdf'

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Documentos</h1>
          <span className="ana-cabecalho__referencia">acervo de cada empresa no COS, por tipo de documento</span>
        </div>
      </header>

      <section className="des-secao" aria-label="Acervo">
        <div className="doc-barra">
          <Search size="md" labelText="Buscar documento" placeholder="Buscar pelo nome do arquivo"
            value={busca} onChange={e => setBusca(e.target.value)} closeButtonLabelText="Limpar busca" />
          <Button kind="ghost" renderIcon={Renew} onClick={carregar} disabled={carregando}>Atualizar</Button>
        </div>

        {erro && (
          <InlineNotification kind="error" lowContrast title="Não foi possível ler o acervo." subtitle={erro}
            onCloseButtonClick={() => setErro('')} />
        )}
        {carregando && !acervo && <InlineLoading description="Lendo os buckets…" />}

        {filtrado && (
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
                  {!e.erro && !e.tipos.length && (
                    <p className="doc-vazio">{busca ? 'Nenhum documento com esse nome.' : 'Nenhum documento no bucket.'}</p>
                  )}
                  <Accordion>
                    {e.tipos.map(t => (
                      <AccordionItem key={t.tipo} open={Boolean(busca) || e.tipos.length <= 3}
                        title={(
                          <span className="doc-tipo">
                            {ROTULO_TIPO[t.tipo] ?? t.rotulo}
                            <Tag size="sm" type="cool-gray">{t.documentos.length}</Tag>
                            {t.tipo && <code className="doc-pasta">{t.tipo}/</code>}
                          </span>
                        )}>
                        <ul className="doc-lista">
                          {t.documentos.map(d => (
                            <li key={d.chave}>
                              <button type="button" className="doc-item" onClick={() => setAberto({ empresa: e.empresa, razao: e.razao_social, doc: d })}>
                                {d.extensao === '.pdf' ? <DocumentPdf size={20} /> : <Table size={20} />}
                                <span className="doc-item__nome">{d.nome}</span>
                                <span className="doc-item__meta">{tamanho(d.tamanho)} · {data(d.data)}</span>
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
        modalLabel={aberto ? `${aberto.razao} · ${ROTULO_TIPO[aberto.doc.chave.includes('/') ? aberto.doc.chave.split('/')[0] : ''] || ''}` : ''}
        modalHeading={aberto?.doc.nome || ''} onRequestClose={() => setAberto(null)}>
        {aberto && (
          <>
            <div className="doc-modal__barra">
              <span className="doc-item__meta">{aberto.doc.chave} · {tamanho(aberto.doc.tamanho)} · {data(aberto.doc.data)}</span>
              <Button kind="tertiary" size="sm" renderIcon={Download}
                href={urlDocumento(aberto.empresa, aberto.doc.chave, { baixar: true })}>Baixar</Button>
            </div>
            {ehPdf ? (
              <iframe className="doc-visualizador" title={aberto.doc.nome}
                src={urlDocumento(aberto.empresa, aberto.doc.chave)} />
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
