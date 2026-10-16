import { Tag } from '@carbon/react'
import { EVIDENCIA, corDaCategoria } from '../AnaliseCredito/vocabulario'

// Cobertura do Piloto: quanto do relatório está sustentado por fonte.
//
// Mede o sistema, não o emissor, por isso fica nesta aba e não no relatório.
// Os números vêm do resumo do relatório (calculados pelo monitor a partir dos
// itens da montagem), nunca fixados na tela. Itens e referências aparecem lado
// a lado: um item sustentado por vários documentos tem várias referências.

const ORDEM = ['fonte', 'atualizada', 'parcial', 'nao_localizado']

function CoberturaPiloto({ cobertura, revisao, categorias = [] }) {
  if (!cobertura) return null
  const porTipo = cobertura.por_tipo_fonte || {}
  const rotulos = Object.fromEntries(categorias.map(c => [c.id, c.rotulo]))

  return (
    <section className="ana-cobertura" aria-label="Cobertura do Piloto">
      <h2 className="ana-secao__titulo">Cobertura do Piloto</h2>

      <div className="ana-cobertura__barras">
        {ORDEM.map(tipo => {
          const quantidade = porTipo[tipo] || 0
          const fatia = cobertura.total ? (100 * quantidade) / cobertura.total : 0
          return (
            <div key={tipo} className={`ana-cobertura__barra ana-cobertura__barra--${tipo}`}>
              <span className="ana-cobertura__numero">{quantidade}</span>
              <span className="ana-cobertura__rotulo">{EVIDENCIA[tipo].rotulo}</span>
              <span className="ana-cobertura__fatia" style={{ width: `${fatia}%` }} />
            </div>
          )
        })}
      </div>

      <div className="ana-cobertura__linha">
        <strong>{cobertura.com_evidencia}</strong> de <strong>{cobertura.total}</strong> itens com evidência
        ({cobertura.percentual_com_evidencia.toLocaleString('pt-BR')}%), sustentados por
        {' '}<strong>{cobertura.referencias}</strong> referências. Recorte do Piloto: {cobertura.secoes_no_recorte} de
        {' '}{cobertura.secoes_total} seções do relatório.
      </div>

      <div className="ana-cobertura__linha">
        O que pede revisão:
        {Object.entries(cobertura.por_categoria || {}).map(([cat, n]) => (
          <Tag key={cat} type={corDaCategoria(cat)} size="sm">{rotulos[cat] || cat}: {n}</Tag>
        ))}
      </div>

      {revisao?.contagem && (
        <div className="ana-cobertura__linha">
          Revisão da versão: {revisao.contagem.aprovado} aprovados, {revisao.contagem.ajustado} ajustados,
          {' '}{revisao.contagem.rejeitado} rejeitados, <strong>{revisao.contagem.pendente} pendentes</strong>
        </div>
      )}

      {cobertura.por_secao?.length > 0 && (
        <table className="des-tabela">
          <thead>
            <tr><th>Seção</th><th>Itens</th><th>Sem fonte</th><th>Com evidência</th></tr>
          </thead>
          <tbody>
            {cobertura.por_secao.map(s => (
              <tr key={s.secao}>
                <td>{s.titulo}</td>
                <td>{s.total}</td>
                <td>{s.sem_fonte}</td>
                <td>{Math.round((100 * (s.total - s.sem_fonte)) / (s.total || 1))}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default CoberturaPiloto
