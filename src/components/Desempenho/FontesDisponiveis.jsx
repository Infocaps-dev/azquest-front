import { useEffect, useState } from 'react'
import { InlineNotification, Loading, Select, SelectItem, Tag } from '@carbon/react'
import { obterFontes } from '../../services/resumosApi'

// Fontes disponíveis: tudo o que o sistema sabe ler, não só o que o relatório selecionado usou.
//
// Um bloco por tipo de fonte, sempre na mesma ordem, com o que é e o que o sistema tira dele. Embaixo, cada documento
// do acervo atual (ou cada consulta salva), com período, empresa, itens indexados e quantas referências o relatório
// selecionado faz a ele. Tipo sem documento aparece como "não disponível": a capacidade existe, falta o arquivo.
// Os dados vêm do acervo de cada empresa (acervo/atual/<empresa>.json, gravado pelas tools) e das consultas salvas,
// nunca fixados na tela. O seletor abre na empresa do relatório selecionado na página.

const TIPOS = [
  { id: 'itr', nome: 'ITR trimestral', descricao: 'Demonstrações do trimestre e notas explicativas.',
    extrai: 'Balanço, DRE, fluxo de caixa, dívida e cronograma, covenants da nota de empréstimos, contingências.' },
  { id: 'dfp', nome: 'DFP anual', descricao: 'Demonstrações anuais auditadas e relatório da administração.',
    extrai: 'Números do ano fechado, notas explicativas e eventos do exercício.' },
  { id: 'release', nome: 'Release e apresentação de resultados', descricao: 'Comentário da administração sobre o trimestre.',
    extrai: 'EBITDA ajustado, alavancagem divulgada, tráfego, investimentos e eventos relevantes.' },
  { id: 'ri', nome: 'Planilha de RI', descricao: 'Séries históricas publicadas pela companhia.',
    extrai: 'Séries trimestrais e anuais de resultado, balanço, caixa, tráfego e tarifa; base dos gráficos e do modelo do EBITDA.' },
  { id: 'escritura', nome: 'Escritura de emissão', descricao: 'Contrato das debêntures.',
    extrai: 'Covenants financeiros, garantias, vencimento, remuneração e foro.' },
  { id: 'af', nome: 'Relatório do agente fiduciário', descricao: 'Acompanhamento anual da emissão.',
    extrai: 'Covenants apurados no ano e eventos da emissão.' },
  { id: 'rating', nome: 'Relatório de rating', descricao: 'Ação de rating das agências.',
    extrai: 'Nota, perspectiva, fundamentos e gatilhos de rebaixamento.' },
  { id: 'noticias', consulta: true, nome: 'Notícias da internet (consultas salvas)',
    descricao: 'Cada busca de notícias feita no chat fica guardada, ligada à empresa e ao trimestre.',
    extrai: 'Veículo, data, título e link de cada notícia; citáveis no relatório como fonte externa.' },
  { id: 'modelo_ebitda', consulta: true, nome: 'Modelo estatístico do EBITDA (consultas salvas)',
    descricao: 'Previsão calculada sobre a série EBITDA Ajustado da planilha de RI.',
    extrai: 'Previsão do próximo 4T com faixa de erro, comparação de 13 modelos e os gráficos; inseríveis no Anexo I.' },
]

function quando(valor) {
  if (!valor) return '—'
  const ts = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(valor) // extração: 20261015_220225 (UTC)
  const data = ts ? new Date(Date.UTC(ts[1], ts[2] - 1, ts[3], ts[4], ts[5])) : new Date(valor)
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Referências do relatório selecionado a cada documento (pelas evidências dos itens do resumo).
function referenciasPorDocumento(resumo) {
  const conta = {}
  for (const item of resumo?.itens || []) {
    for (const e of item.evidencias || []) {
      if (e?.documento) conta[e.documento] = (conta[e.documento] || 0) + 1
    }
  }
  for (const d of resumo?.documentos || []) conta[d.codigo] = conta[d.codigo] || 1
  return conta
}

function FontesDisponiveis({ resumo, sinal }) {
  const [fontes, setFontes] = useState(null)
  const [erro, setErro] = useState('')
  // A empresa escolhida no seletor, guardada com a do relatório selecionado na página: trocou o relatório, a escolha
  // deixa de valer e o seletor volta à empresa dele.
  const [escolha, setEscolha] = useState({ relatorio: resumo?.empresa, empresa: null })
  const escolhida = escolha.relatorio === resumo?.empresa ? escolha.empresa : null
  const empresa = escolhida || resumo?.empresa || ''
  const setEscolhida = e => setEscolha({ relatorio: resumo?.empresa, empresa: e })

  useEffect(() => {
    let ativo = true
    obterFontes(empresa)
      .then(f => { if (ativo) { setFontes(f); setErro('') } })
      .catch(e => { if (ativo) setErro(e.message) })
    return () => { ativo = false }
  }, [sinal, empresa])

  if (erro) return <InlineNotification kind="error" lowContrast hideCloseButton title="Fontes indisponíveis" subtitle={erro} />
  if (!fontes) return <Loading small withOverlay={false} description="Carregando as fontes" />

  // As referências são do relatório selecionado: só valem para os documentos da empresa dele.
  const doRelatorio = resumo && resumo.empresa === fontes.empresa
  const citados = doRelatorio ? referenciasPorDocumento(resumo) : {}
  const doTipo = t => (t.consulta
    ? fontes.consultas.filter(c => c.subtipo === t.id)
    : fontes.documentos.filter(d => d.pasta === t.id))
  const disponiveis = TIPOS.filter(t => doTipo(t).length).length

  return (
    <section aria-label="Fontes disponíveis" className="des-secao">
      <h2 className="ana-secao__titulo">Fontes disponíveis</h2>
      {fontes.empresas?.length > 1 && (
        <Select id="fontes-empresa" labelText="Empresa" size="sm" className="des-fontes__empresa"
          value={fontes.empresa} onChange={e => setEscolhida(e.target.value)}>
          {fontes.empresas.map(e => <SelectItem key={e} value={e} text={e} />)}
        </Select>
      )}
      <p className="des-fontes__resumo">
        {disponiveis} de {TIPOS.length} tipos de fonte com documento no acervo da {fontes.empresa}
        {doRelatorio ? `; referências do relatório ${resumo.empresa} · ${resumo.periodo} · versão ${resumo.versao}` : ''}.
        {fontes.atualizado_em && ` Acervo conferido em ${quando(fontes.atualizado_em)}.`}
      </p>
      {TIPOS.map(t => {
        const docs = doTipo(t)
        return (
          <article key={t.id} className="des-fonte">
            <header className="des-fonte__cabeca">
              <div>
                <h3 className="des-fonte__nome">{t.nome}</h3>
                <p className="des-fonte__descricao">{t.descricao} <strong>O que o sistema tira:</strong> {t.extrai}</p>
              </div>
              {docs.length
                ? <Tag type="green" size="sm" className="des-fonte__contagem">
                  {docs.length} {t.consulta ? (docs.length === 1 ? 'consulta' : 'consultas') : (docs.length === 1 ? 'documento' : 'documentos')}
                </Tag>
                : <Tag type="gray" size="sm">não disponível</Tag>}
            </header>
            {docs.length > 0 && (
              <table className="des-tabela des-fonte__tabela">
                <thead>
                  <tr><th>{t.consulta ? 'Consulta' : 'Documento'}</th><th>Período</th><th>Empresa</th><th>Itens</th>
                    <th>Referências no relatório</th><th>{t.consulta ? 'Gerada em' : 'Extraído em'}</th></tr>
                </thead>
                <tbody>
                  {docs.map(d => (
                    <tr key={d.codigo}>
                      <td>
                        {d.arquivo}
                        {d.entidade === 'divergente' && (
                          <span className="des-fonte__alerta"> · documento de outra entidade{d.entidade_encontrada ? ` (${d.entidade_encontrada})` : ''}</span>
                        )}
                        {d.janela && <span className="des-fonte__alerta"> · publicadas de {d.janela.de} a {d.janela.ate}</span>}
                      </td>
                      <td>{d.data_base || '—'}</td>
                      <td>{d.empresa || '—'}</td>
                      <td>{d.n_itens ?? '—'}</td>
                      <td>{citados[d.codigo] ? citados[d.codigo] : '—'}</td>
                      <td>{quando(d.extraido_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        )
      })}
    </section>
  )
}

export default FontesDisponiveis
