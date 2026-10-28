import { useEffect, useState } from 'react'
import { InlineNotification, Select, SelectItem } from '@carbon/react'
import { listarResumos, obterResumo, obterRevisao } from '../../services/resumosApi'
import { dataHora, duracao } from '../AnaliseCredito/vocabulario'
import CoberturaPiloto from './CoberturaPiloto.jsx'
import FontesDisponiveis from './FontesDisponiveis.jsx'
import '../AnaliseCredito/AnalisePage.scss'
import './DesempenhoPage.scss'
import Carregando from '../Comum/Carregando.jsx'

// Aba Desempenho: como o sistema se saiu, separado do conteúdo do relatório.
//
// - Tempo de execução: quanto a geração (ou cada alteração) do relatório levou,
//   medido pela própria tool do agente e gravado no estado do relatório.
//   Relatórios gerados antes dessa medição aparecem sem tempo, e não com zero.
// - Cobertura do Piloto: quanto do relatório está sustentado por fonte.
// - Histórico: as duas medidas em todos os relatórios gerados.
// - Fontes disponíveis: todos os tipos de fonte que o sistema lê, com os documentos e consultas salvas do acervo.

const OPERACAO = { geracao: 'Geração', alteracao: 'Alteração' }

function Cartao({ titulo, valor, detalhe }) {
  return (
    <article className="des-kpi">
      <p className="des-kpi__titulo">{titulo}</p>
      <div className="des-kpi__valor">{valor}</div>
      {detalhe && <p className="des-kpi__detalhe">{detalhe}</p>}
    </article>
  )
}

function DesempenhoPage({ sinalIndice }) {
  const [relatorios, setRelatorios] = useState([])
  const [relatorioId, setRelatorioId] = useState('')
  const [resumo, setResumo] = useState(null)
  const [revisao, setRevisao] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    listarResumos()
      .then(indice => {
        setRelatorios(indice.relatorios || [])
        if (indice.relatorios?.length) setRelatorioId(indice.relatorios[0].relatorio_id)
        else setCarregando(false)
      })
      .catch(e => { setErro(e.message); setCarregando(false) })
  }, [])

  // Relatório novo disponível: a tabela de todos os relatórios se atualiza.
  useEffect(() => {
    if (!sinalIndice) return
    listarResumos().then(indice => setRelatorios(indice.relatorios || [])).catch(() => {})
  }, [sinalIndice])

  useEffect(() => {
    if (!relatorioId) return
    let ativo = true
    setCarregando(true)
    Promise.all([obterResumo(relatorioId), obterRevisao(relatorioId)])
      .then(([r, rev]) => { if (ativo) { setResumo(r); setRevisao(rev) } })
      .catch(e => { if (ativo) setErro(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [relatorioId])

  if (erro) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <InlineNotification kind="error" lowContrast hideCloseButton title="Desempenho indisponível" subtitle={erro} />
      </main>
    )
  }
  if (carregando && !resumo) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <Carregando descricao="Carregando o desempenho" />
      </main>
    )
  }

  const execucoes = resumo?.execucoes || []
  const ultima = resumo?.execucao
  const medidos = relatorios.filter(r => r.duracao_s != null)
  const media = medidos.length ? medidos.reduce((s, r) => s + r.duracao_s, 0) / medidos.length : null

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">Desempenho</h1>
          <span className="ana-cabecalho__referencia">tempo de execução e cobertura dos relatórios gerados</span>
        </div>
        <div className="ana-cabecalho__acoes">
          {relatorios.length > 0 && (
            <Select id="des-relatorio" labelText="Relatório" hideLabel size="sm" value={relatorioId}
              onChange={e => setRelatorioId(e.target.value)} className="ana-cabecalho__seletor">
              {relatorios.map(r => (
                <SelectItem key={r.relatorio_id} value={r.relatorio_id}
                  text={`${r.empresa} · ${r.periodo} · versão ${r.versao} · ${dataHora(r.atualizado_em)}`} />
              ))}
            </Select>
          )}
        </div>
      </header>

      <section aria-label="Tempo de execução" className="des-secao">
        <h2 className="ana-secao__titulo">Tempo de execução</h2>
        <div className="des-kpis">
          <Cartao titulo={ultima ? `${OPERACAO[ultima.operacao] || ultima.operacao} da versão ${ultima.versao}` : 'Última execução'}
            valor={duracao(ultima?.duracao_s)}
            detalhe={ultima ? `${dataHora(ultima.inicio)} a ${dataHora(ultima.fim)}` : 'Relatório gerado antes da medição'} />
          <Cartao titulo="Execuções deste relatório" valor={execucoes.length || '—'}
            detalhe={execucoes.length
              ? `total ${duracao(execucoes.reduce((s, e) => s + e.duracao_s, 0))}` : null} />
          <Cartao titulo="Média por relatório" valor={duracao(media)}
            detalhe={`${medidos.length} de ${relatorios.length} relatórios com medição`} />
        </div>
        {execucoes.length > 0 && (
          <table className="des-tabela">
            <thead><tr><th>Versão</th><th>Operação</th><th>Início</th><th>Duração</th></tr></thead>
            <tbody>
              {execucoes.map(e => (
                <tr key={`${e.versao}-${e.inicio}`}>
                  <td>{e.versao}</td><td>{OPERACAO[e.operacao] || e.operacao}</td>
                  <td>{dataHora(e.inicio)}</td><td>{duracao(e.duracao_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <CoberturaPiloto cobertura={resumo?.cobertura} revisao={revisao} categorias={resumo?.categorias_revisao} />

      <FontesDisponiveis resumo={resumo} sinal={sinalIndice} />

      <section aria-label="Histórico" className="des-secao">
        <h2 className="ana-secao__titulo">Todos os relatórios</h2>
        <table className="des-tabela">
          <thead>
            <tr><th>Relatório</th><th>Período</th><th>Versão</th><th>Atualizado</th><th>Itens</th>
              <th>Com evidência</th><th>Sem fonte</th><th>Duração</th></tr>
          </thead>
          <tbody>
            {relatorios.map(r => (
              <tr key={r.relatorio_id} className={r.relatorio_id === relatorioId ? 'des-tabela__atual' : ''}
                onClick={() => setRelatorioId(r.relatorio_id)}>
                <td>{r.empresa}</td><td>{r.periodo}</td><td>{r.versao}</td><td>{dataHora(r.atualizado_em)}</td>
                <td>{r.itens ?? '—'}</td>
                <td>{r.percentual_com_evidencia != null ? `${r.percentual_com_evidencia.toLocaleString('pt-BR')}%` : '—'}</td>
                <td>{r.nao_localizados}</td><td>{duracao(r.duracao_s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default DesempenhoPage
