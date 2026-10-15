import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { formatar, formatarVariacao, nivelDe, rotuloFonte } from './niveis'

// Quadro comparativo, item 5 da seção 11, no formato que a seção 6 do handoff
// define: métrica, baseline, trimestre anterior, projeção, realizado, variação,
// regra, nível e fonte.
//
// As linhas vêm ordenadas por severidade, não na ordem em que o comparador as
// produziu: quem abre a tela precisa ver primeiro o que exige decisão.

const CABECALHOS = [
  { key: 'descricao', header: 'Métrica' },
  { key: 'realizado', header: 'Realizado' },
  { key: 'referencia', header: 'Comparado a' },
  { key: 'variacao', header: 'Variação' },
  { key: 'nivel', header: 'Nível' },
  { key: 'fonte', header: 'Fonte' },
]

function referenciaDe(linha) {
  if (linha.baseline !== null && linha.baseline !== undefined) {
    return { valor: linha.baseline, rotulo: 'baseline' }
  }
  if (linha.ano_anterior !== null && linha.ano_anterior !== undefined) {
    return { valor: linha.ano_anterior, rotulo: 'ano anterior' }
  }
  if (linha.trimestre_anterior !== null && linha.trimestre_anterior !== undefined) {
    return { valor: linha.trimestre_anterior, rotulo: 'trim. anterior' }
  }
  if (linha.projecao !== null && linha.projecao !== undefined) {
    return { valor: linha.projecao, rotulo: 'projeção' }
  }
  return null
}

function QuadroComparativo({ linhas, onAbrirFonte }) {
  if (!linhas?.length) {
    return <p className="mon-vazio">A comparação ainda não foi executada.</p>
  }

  const ordenadas = [...linhas].sort(
    (a, b) => nivelDe(b.nivel).ordem - nivelDe(a.nivel).ordem,
  )

  const dados = ordenadas.map((linha, i) => ({ id: `${linha.metrica}-${i}`, ...linha }))

  return (
    <section className="mon-quadro" aria-label="Quadro comparativo">
      <h3 className="mon-secao__titulo">Comparação com o baseline</h3>
      <DataTable rows={dados} headers={CABECALHOS} isSortable>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <TableContainer>
            <Table {...getTableProps()} size="sm">
              <TableHead>
                <TableRow>
                  {headers.map(cabecalho => {
                    const { key, ...props } = getHeaderProps({ header: cabecalho })
                    return <TableHeader key={key} {...props}>{cabecalho.header}</TableHeader>
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(linhaTabela => {
                  const dado = dados.find(d => d.id === linhaTabela.id)
                  const nivel = nivelDe(dado.nivel)
                  const referencia = referenciaDe(dado)
                  const { key, ...props } = getRowProps({ row: linhaTabela })
                  return (
                    <TableRow key={key} {...props}>
                      <TableCell>
                        <span className="mon-quadro__metrica">{dado.descricao}</span>
                        {dado.justificativa && (
                          <span className="mon-quadro__justificativa">{dado.justificativa}</span>
                        )}
                        {dado.detalhes?.ressalva && (
                          <span className="mon-quadro__ressalva">{dado.detalhes.ressalva}</span>
                        )}
                      </TableCell>
                      <TableCell>{formatar(dado.realizado, dado.unidade)}</TableCell>
                      <TableCell>
                        {referencia
                          ? `${formatar(referencia.valor, dado.unidade)} (${referencia.rotulo})`
                          : '—'}
                      </TableCell>
                      <TableCell>{formatarVariacao(dado.variacao, dado.unidade)}</TableCell>
                      <TableCell>
                        <Tag type={nivel.tag} size="sm">{nivel.rotulo}</Tag>
                      </TableCell>
                      <TableCell>
                        {(dado.fontes || []).map((fonte, i) => (
                          <button
                            key={i}
                            type="button"
                            className="mon-fonte"
                            onClick={() => onAbrirFonte?.(fonte)}
                          >
                            {rotuloFonte(fonte)}
                          </button>
                        ))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </section>
  )
}

export default QuadroComparativo
