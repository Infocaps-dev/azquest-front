import { useCallback, useEffect, useState } from 'react'
import { Button, InlineLoading, InlineNotification, Select, SelectItem } from '@carbon/react'
import { filaDeConceitos, decidirConceito } from '../../services/conceitosApi'
import '../AnaliseCredito/AnalisePage.scss'
import '../Desempenho/DesempenhoPage.scss'
import './ConceitosPage.scss'

// Fila de confirmação de conceitos (28/10/2026). As planilhas de cada empresa chamam o mesmo indicador por nomes
// diferentes ("Receita líquida", "Net revenue"); o classificador diz qual linha é cada indicador do catálogo, e o que
// ele não tem certeza vira pergunta aqui, em duas formas:
//   - "Qual destas linhas é o <indicador>?": várias linhas foram reconhecidas como o mesmo indicador e os valores não
//     batem (conflito). A escolhida passa a valer; as outras deixam de ser usadas para ele.
//   - "Esta linha é <indicador>?": o classificador ficou em dúvida (pendente).
// A resposta vale por cima do classificador, nas respostas do chat e nos relatórios, e fica registrada com quem e quando.

function valor(v) {
  return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : v
}

function Valores({ amostra, unidade }) {
  if (!amostra?.length) return <span className="conceitos__sem-valor">sem valores recentes</span>
  return (
    <span className="conceitos__valores">
      {amostra.map(a => <span key={a.periodo}><em>{a.periodo}</em> {valor(a.valor)}</span>)}
      {unidade && <span className="conceitos__unidade">{unidade}</span>}
    </span>
  )
}

function Onde({ serie }) {
  return (
    <span className="conceitos__onde">
      {[serie.aba && `aba "${serie.aba}"`, serie.bloco].filter(Boolean).join(' · ')}
    </span>
  )
}

// Os conflitos ligados entre si viram um grupo só (antes, cada linha repetia o grupo inteiro).
function gruposDeConflito(itens) {
  const series = {}
  itens.filter(i => i.estado === 'conflito').forEach(i => {
    series[i.serie] = series[i.serie] || i
    ;(i.conflito_com || []).forEach(o => { series[o.serie] = series[o.serie] || o })
  })
  const pai = {}
  const raiz = s => (pai[s] && pai[s] !== s ? (pai[s] = raiz(pai[s])) : s)
  itens.filter(i => i.estado === 'conflito').forEach(i => {
    (i.conflito_com || []).forEach(o => { pai[raiz(o.serie)] = raiz(i.serie) })
  })
  const grupos = {}
  Object.keys(series).forEach(s => { (grupos[raiz(s)] = grupos[raiz(s)] || []).push(series[s]) })
  return Object.values(grupos)
}

function Conflito({ membros, catalogo, podeDecidir, decidir }) {
  const conceito = membros.find(m => m.conceito)?.conceito
  const nome = catalogo.find(c => c.conceito === conceito)?.nome || conceito
  const escopo = membros.find(m => m.escopo)?.escopo || 'consolidado'
  const [enviando, setEnviando] = useState(false)
  const escolher = async (vencedora) => {
    setEnviando(true)
    try {
      await decidir(membros.map(m => m.serie === vencedora
        ? { serie: m.serie, estado: 'liberado', conceito, escopo }
        : { serie: m.serie, estado: 'descartada' }))
    } finally { setEnviando(false) }
  }
  const nenhuma = async () => {
    setEnviando(true)
    try { await decidir(membros.map(m => ({ serie: m.serie, estado: 'sem_conceito' }))) } finally { setEnviando(false) }
  }
  return (
    <li className="conceitos__cartao">
      <p className="conceitos__pergunta">Qual destas linhas é o indicador <strong>{nome}</strong>?</p>
      <p className="conceitos__ajuda">
        As {membros.length} linhas foram reconhecidas como {nome}, mas os valores não batem. Escolha a que é o {nome}
        {' '}da empresa: ela passa a ser usada; as outras deixam de ser usadas como {nome}.
      </p>
      <ul className="conceitos__opcoes">
        {membros.map(m => (
          <li key={m.serie} className="conceitos__opcao">
            <div>
              <p className="conceitos__rotulo">{m.rotulo}</p>
              <Onde serie={m} />
              <Valores amostra={m.amostra} unidade={m.unidade} />
            </div>
            {podeDecidir && (
              <Button size="sm" kind="secondary" disabled={enviando} onClick={() => escolher(m.serie)}>É esta</Button>
            )}
          </li>
        ))}
      </ul>
      {podeDecidir && (
        <div className="conceitos__acoes">
          <Button size="sm" kind="ghost" disabled={enviando} onClick={nenhuma}>Nenhuma delas é {nome}</Button>
          {enviando && <InlineLoading description="Gravando" />}
        </div>
      )}
    </li>
  )
}

function Pendente({ item, catalogo, escopos, podeDecidir, decidir }) {
  const nome = catalogo.find(c => c.conceito === item.conceito)?.nome
  const [outro, setOutro] = useState(false)
  const [conceito, setConceito] = useState(item.conceito || '')
  const [escopo, setEscopo] = useState(item.escopo || 'consolidado')
  const [enviando, setEnviando] = useState(false)
  const gravar = async (d) => {
    setEnviando(true)
    try { await decidir([{ serie: item.serie, ...d }]) } finally { setEnviando(false) }
  }
  return (
    <li className="conceitos__cartao">
      <p className="conceitos__pergunta">
        A linha <strong>"{item.rotulo}"</strong> é {nome ? <>o indicador <strong>{nome}</strong></> : 'algum indicador do catálogo'}?
      </p>
      <Onde serie={item} />
      <Valores amostra={item.amostra} unidade={item.unidade} />
      {item.justificativa && <p className="conceitos__ajuda">Por que o sistema acha isso: {item.justificativa}</p>}
      {item.revisao && <p className="conceitos__ajuda">Revisar: {item.revisao}</p>}
      {podeDecidir && !outro && (
        <div className="conceitos__acoes">
          {nome && (
            <Button size="sm" disabled={enviando}
                    onClick={() => gravar({ estado: 'liberado', conceito: item.conceito, escopo })}>Sim</Button>
          )}
          <Button size="sm" kind="tertiary" disabled={enviando} onClick={() => setOutro(true)}>É outro indicador</Button>
          <Button size="sm" kind="ghost" disabled={enviando} onClick={() => gravar({ estado: 'sem_conceito' })}>
            Não é nenhum do catálogo
          </Button>
          {enviando && <InlineLoading description="Gravando" />}
        </div>
      )}
      {podeDecidir && outro && (
        <div className="conceitos__acoes">
          <Select id={`c-${item.serie}`} labelText="Indicador" size="sm" value={conceito}
                  onChange={e => setConceito(e.target.value)}>
            <SelectItem value="" text="Escolha" />
            {catalogo.map(c => <SelectItem key={c.conceito} value={c.conceito} text={c.nome} />)}
          </Select>
          <Select id={`e-${item.serie}`} labelText="Abrangência" size="sm" value={escopo}
                  onChange={e => setEscopo(e.target.value)}>
            {escopos.map(e => <SelectItem key={e} value={e} text={e} />)}
          </Select>
          <Button size="sm" disabled={!conceito || enviando}
                  onClick={() => gravar({ estado: 'liberado', conceito, escopo })}>Confirmar</Button>
          <Button size="sm" kind="ghost" disabled={enviando} onClick={() => setOutro(false)}>Cancelar</Button>
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

  // Uma escolha pode gravar várias decisões (a linha escolhida e as descartadas), uma depois da outra.
  const decidirNa = empresa => async (decisoes) => {
    let versao = empresa.versao
    try {
      for (const d of decisoes) {
        const r = await decidirConceito({ empresaId: empresa.empresa_id, versao, ...d })
        versao = r.versao
      }
      setAviso('')
    } catch (e) {
      setAviso(e.status === 409 ? 'Outra pessoa respondeu enquanto a tela estava aberta: a lista foi recarregada.' : e.message)
    }
    await carregar()
  }

  if (erro) {
    return (
      <main className="ana-pagina">
        <InlineNotification kind="error" title="Lista indisponível" subtitle={erro} hideCloseButton />
      </main>
    )
  }
  if (!fila) return <main className="ana-pagina"><InlineLoading description="Carregando" /></main>
  const total = fila.empresas.reduce((n, e) => n + e.itens.length, 0)
  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Conceitos</h1>
          <span className="ana-cabecalho__referencia">qual linha das planilhas é cada indicador, por empresa</span>
        </div>
      </header>
      <section className="des-secao conceitos__explicacao" aria-label="Para que serve">
        <p>
          Cada empresa chama o mesmo indicador por nomes diferentes nas planilhas e demonstrações ("Receita líquida",
          "Net revenue", "Receita operacional líquida"). O sistema aprende sozinho qual linha é cada indicador, para
          responder no chat e montar o relatório com o número certo.
        </p>
        <p>Quando ele não tem certeza, pergunta aqui. Sua resposta passa a valer no chat e nos relatórios.</p>
      </section>
      {!fila.pode_decidir && (
        <InlineNotification kind="info" title="Só leitura" subtitle="Seu perfil não responde a estas perguntas."
                            hideCloseButton lowContrast />
      )}
      {aviso && <InlineNotification kind="warning" title="Atenção" subtitle={aviso} onClose={() => setAviso('')} lowContrast />}
      {total === 0 && <section className="des-secao"><p className="ana-vazio">Nenhuma pergunta pendente.</p></section>}
      {fila.empresas.filter(e => e.itens.length).map(empresa => {
        const grupos = gruposDeConflito(empresa.itens)
        const pendentes = empresa.itens.filter(i => i.estado !== 'conflito')
        const decidir = decidirNa(empresa)
        return (
          <section key={empresa.empresa_id} className="des-secao" aria-label={empresa.empresa}>
            <h2 className="ana-secao__titulo">{empresa.empresa}</h2>
            <ol className="conceitos__lista">
              {grupos.map(membros => (
                <Conflito key={`${membros.map(m => m.serie).join('-')}-${empresa.versao}`} membros={membros}
                          catalogo={fila.catalogo} podeDecidir={fila.pode_decidir} decidir={decidir} />
              ))}
              {pendentes.map(item => (
                <Pendente key={`${item.serie}-${empresa.versao}`} item={item} catalogo={fila.catalogo}
                          escopos={fila.escopos} podeDecidir={fila.pode_decidir} decidir={decidir} />
              ))}
            </ol>
          </section>
        )
      })}
    </main>
  )
}
