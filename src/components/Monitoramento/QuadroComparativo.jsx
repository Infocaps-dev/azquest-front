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
import { formatar, formatarVariacao, listaDeFontes, nivelDe, rotuloFonte } from './niveis'

// Quadro comparativo, item 5 da seção 11, no formato que a seção 6 do handoff
// define: métrica, baseline, trimestre anterior, projeção, realizado, variação,
// regra, nível e fonte.
//
// As linhas vêm ordenadas por severidade, não na ordem em que o comparador as
// produziu: quem abre a tela precisa ver primeiro o que exige decisão.

// As colunas sao as da secao 4, item 6b, do handoff: baseline, trimestre
// anterior, projecao, realizado, variacao, regra e nivel.
//
// Antes havia uma coluna so, "Comparado a", que mostrava a primeira referencia
// disponivel por ordem de prioridade -- e como o baseline quase sempre existe,
// ele ganhava sempre. A comparacao contra o trimestre anterior e contra o
// mesmo trimestre do ano anterior ficava invisivel, embora estivesse no dado.
const CABECALHOS = [
  { key: 'descricao', header: 'Métrica' },
  { key: 'realizado', header: 'Realizado' },
  { key: 'baseline', header: 'Baseline' },
  { key: 'trimestre_anterior', header: 'Trim. anterior' },
  { key: 'ano_anterior', header: 'Ano anterior' },
  { key: 'projecao', header: 'Projeção' },
  { key: 'variacao', header: 'Variação' },
  { key: 'nivel', header: 'Nível' },
  { key: 'fonte', header: 'Fonte' },
]

// Cada referencia na sua coluna. Celula vazia quer dizer que aquela comparacao
// nao se aplica aquela linha -- um covenant nao tem "ano anterior", por
// exemplo -- e isso e informacao, nao buraco.
function celula(valor, unidade) {
  return valor === null || valor === undefined ? '—' : formatar(valor, unidade)
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
                      <TableCell>{celula(dado.baseline, dado.unidade)}</TableCell>
                      <TableCell>{celula(dado.trimestre_anterior, dado.unidade)}</TableCell>
                      <TableCell>{celula(dado.ano_anterior, dado.unidade)}</TableCell>
                      <TableCell>{celula(dado.projecao, dado.unidade)}</TableCell>
                      <TableCell>{formatarVariacao(dado.variacao, dado.unidade)}</TableCell>
                      <TableCell>
                        <Tag type={nivel.tag} size="sm">{nivel.rotulo}</Tag>
                      </TableCell>
                      <TableCell>
                        {listaDeFontes(dado.fontes).map((fonte, i) => (
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
