import { useCallback, useEffect, useState } from 'react'
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Tag } from '@carbon/react'
import { filaDeConceitos, decidirConceito } from '../../services/conceitosApi'
import './ConceitosPage.scss'

// Fila de confirmação de conceitos (28/10/2026): o classificador sugere o conceito de cada série nova (receita
// líquida, EBITDA ajustado...); as que ficaram em dúvida (pendente) ou em choque com outra série do mesmo conceito
// (conflito) esperam aqui a decisão do analista. A decisão vale por cima da sugestão e fica registrada com quem e quando.

const ESTADOS = { pendente: 'Pendente', conflito: 'Conflito' }

function valor(v) {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : v
}

function Amostra({ amostra }) {
  if (!amostra?.length) return null
  return (
    <dl className="conceitos__amostra">
      {amostra.map(a => (
        <div key={a.periodo}><dt>{a.periodo}</dt><dd>{valor(a.valor)}</dd></div>
      ))}
    </dl>
  )
}

function Serie({ serie, catalogo }) {
  const nome = catalogo.find(c => c.conceito === serie.conceito)?.nome
  return (
    <div className="conceitos__serie">
      <p className="conceitos__rotulo">{serie.rotulo}</p>
      <p className="conceitos__onde">
        {[serie.aba && `aba ${serie.aba}`, serie.bloco, serie.unidade].filter(Boolean).join(' · ')}
      </p>
      <Amostra amostra={serie.amostra} />
      {nome && (
        <p className="conceitos__sugestao">
          Sugestão: <strong>{nome}</strong>{serie.escopo ? `, ${serie.escopo}` : ''}
          {serie.confianca ? ` (confiança ${serie.confianca})` : ''}
        </p>
      )}
      {serie.justificativa && <p className="conceitos__justificativa">{serie.justificativa}</p>}
      {serie.revisao && <p className="conceitos__justificativa">Revisar: {serie.revisao}</p>}
    </div>
  )
}

function Item({ item, empresa, catalogo, escopos, podeDecidir, onDecidir }) {
  const [conceito, setConceito] = useState(item.conceito || '')
  const [escopo, setEscopo] = useState(item.escopo || 'consolidado')
  const [enviando, setEnviando] = useState(false)
  const decidir = async (estado) => {
    setEnviando(true)
    try {
      await onDecidir({ empresaId: empresa.empresa_id, serie: item.serie, estado, conceito, escopo, versao: empresa.versao })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <li className="conceitos__item">
      <Tag type={item.estado === 'conflito' ? 'red' : 'warm-gray'} size="sm">{ESTADOS[item.estado] || item.estado}</Tag>
      <div className={item.conflito_com?.length ? 'conceitos__lado-a-lado' : ''}>
        <Serie serie={item} catalogo={catalogo} />
        {(item.conflito_com || []).map(outra => (
          <div key={outra.serie} className="conceitos__outra">
            <p className="conceitos__rotulo-outra">Em conflito com:</p>
            <Serie serie={outra} catalogo={catalogo} />
          </div>
        ))}
      </div>
      {podeDecidir && (
        <div className="conceitos__acoes">
          <Select id={`c-${item.serie}`} labelText="Conceito" size="sm" value={conceito}
                  onChange={e => setConceito(e.target.value)}>
            <SelectItem value="" text="Escolha" />
            {catalogo.map(c => <SelectItem key={c.conceito} value={c.conceito} text={c.nome} />)}
          </Select>
          <Select id={`e-${item.serie}`} labelText="Escopo" size="sm" value={escopo}
                  onChange={e => setEscopo(e.target.value)}>
            {escopos.map(e => <SelectItem key={e} value={e} text={e} />)}
          </Select>
          <Button size="sm" disabled={!conceito || enviando} onClick={() => decidir('liberado')}>Confirmar</Button>
          <Button size="sm" kind="tertiary" disabled={enviando} onClick={() => decidir('sem_conceito')}>
            Não é nenhum
          </Button>
          {item.estado === 'conflito' && (
            <Button size="sm" kind="danger--tertiary" disabled={enviando} onClick={() => decidir('descartada')}>
              Descartar esta
            </Button>
          )}
          {enviando && <InlineLoading description="Gravando" />}
        </div>
      )}
    </li>
  )
}

export default function ConceitosPage() {
  const [fila, setFila] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    try {
      setFila(await filaDeConceitos())
      setErro('')
    } catch (e) {
      setErro(e.message)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const decidir = async (pedido) => {
    try {
      await decidirConceito(pedido)
      setAviso('')
    } catch (e) {
      setAviso(e.status === 409 ? 'A fila mudou desde que foi aberta (outra decisão foi gravada): recarregada.' : e.message)
    }
    await carregar()
  }

  if (erro) {
    return (
      <main className="conceitos">
        <InlineNotification kind="error" title="Fila indisponível" subtitle={erro} hideCloseButton />
      </main>
    )
  }
  if (!fila) return <main className="conceitos"><InlineLoading description="Carregando a fila" /></main>
  const total = fila.empresas.reduce((n, e) => n + e.itens.length, 0)
  return (
    <main className="conceitos">
      <h1>Conceitos das séries</h1>
      <p className="conceitos__explicacao">
        Cada série nova dos documentos é classificada sozinha num conceito do catálogo. Aqui ficam as que precisam da
        sua confirmação: dúvida do classificador (pendente) ou duas séries do mesmo conceito com valores diferentes
        (conflito; descarte a que não vale). A decisão passa a valer nas respostas e nos relatórios.
      </p>
      {!fila.pode_decidir && (
        <InlineNotification kind="info" title="Só leitura" subtitle="Seu perfil não confirma conceitos."
                            hideCloseButton lowContrast />
      )}
      {aviso && <InlineNotification kind="warning" title="Atenção" subtitle={aviso} onClose={() => setAviso('')} lowContrast />}
      {total === 0 && <p>Nenhuma série esperando confirmação.</p>}
      {fila.empresas.filter(e => e.itens.length).map(empresa => (
        <section key={empresa.empresa_id} className="conceitos__empresa">
          <h2>{empresa.empresa} <span className="conceitos__contagem">{empresa.itens.length}</span></h2>
          <ol className="conceitos__lista">
            {empresa.itens.map(item => (
              <Item key={`${item.serie}-${empresa.versao}`} item={item} empresa={empresa} catalogo={fila.catalogo}
                    escopos={fila.escopos} podeDecidir={fila.pode_decidir} onDecidir={decidir} />
            ))}
          </ol>
        </section>
      ))}
    </main>
  )
}
