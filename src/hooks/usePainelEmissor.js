import { useEffect, useState } from 'react'
import * as amostra from '../data/ecorodovias'
import { listarResumos, obterBaselineVigente, obterResumo } from '../services/resumosApi'

// Dados do painel "Covenants e gatilhos" da tela de início, vigentes.
//
// O painel nasceu com a carga manual do piloto (data/ecorodovias.js), presa ao
// relatório de mar/2026. Agora cada número vem de onde é atualizado:
//
// - covenants: o apurado mais recente nos documentos extraídos (alavancagem do
//   relatório mais novo; apurados dos agentes fiduciários), contra o limite do
//   baseline vigente;
// - gatilhos de rating: os do baseline vigente (a última versão publicada na
//   Análise de Crédito), contra a alavancagem mais recente;
// - ativos: o rating dos comunicados de rating do relatório mais novo.
//
// A carga manual continua sendo a base: o que nenhuma fonte nova traz (títulos,
// regras, notas, condições das emissões) fica como estava, e se as APIs não
// responderem o painel mostra a carga manual inteira. Nada some do painel.

const EMISSOR = 'Ecorodovias'
const MESES = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 }
const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "2T26" → "jun/26"
function mesAno(periodo) {
  const m = /^(\d)T(\d{2})$/.exec(periodo || '')
  return m ? `${ABREV[Number(m[1]) * 3 - 1]}/${m[2]}` : periodo
}

// "13 Aug 2026", "20 de agosto de 2026" → "13/08/2026"
function dataCurta(texto) {
  const m = /(\d{1,2})\s+(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s+(?:de\s+)?(\d{4})/i.exec(texto || '')
  const mes = m && MESES[m[2].toLowerCase()]
  return mes ? `${m[1].padStart(2, '0')}/${String(mes).padStart(2, '0')}/${m[3]}` : texto
}

// "ITR-2T26-ECORODOVIAS.pdf, p. 26 (...)" → "ITR-2T26-ECORODOVIAS.pdf, p. 26"
function documentoDaFonte(fonte) {
  return (fonte || '').split(',').slice(0, 2).join(',').trim()
}

const x = v => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`

function rotuloBaseline(baseline) {
  if (!baseline?.relatorio_id) return amostra.EMISSOR.baseline
  const quando = baseline.publicado_em ? new Date(baseline.publicado_em).toLocaleDateString('pt-BR') : ''
  const periodo = /^(\dT\d{2})/.exec(baseline.versao || '')?.[1]
  return `Relatório de Crédito AZ Quest, ${mesAno(periodo) || baseline.versao}, versão ${baseline.relatorio_versao}`
    + (quando ? ` publicada em ${quando}` : '')
}

export function montarPainel(baseline, resumo) {
  const alav = resumo?.indicadores?.alavancagem?.consolidada
  const periodo = resumo?.periodo
  const limiteEcs = (baseline?.limites || []).find(l => l.id === 'covenant_ecs_dl_ebitda')?.limite
  const apuradosAf = resumo?.covenants?.apurados_agente_fiduciario || []

  const covenants = amostra.COVENANTS.map(c => {
    if (c.id === 'cov-consolidado') {
      const limite = limiteEcs ?? c.limite
      return {
        ...c,
        limite,
        regra: `covenant até ${x(limite)}`,
        ...(alav?.valor != null ? { apurado: alav.valor, referencia: `${mesAno(periodo)}, UDM`,
          fonte: documentoDaFonte(alav.fonte) } : {}),
      }
    }
    const ticker = c.id.replace('cov-', '').toUpperCase() // cov-erdva6 → ERDVA6
    const af = apuradosAf.find(a => a.emissao?.toUpperCase() === ticker && /d[íi]vida l[íi]quida/i.test(a.indice || ''))
    if (!af || af.apurado == null) return c
    return {
      ...c,
      apurado: af.apurado,
      limite: af.limite ?? c.limite,
      regra: `limite ${x(af.limite ?? c.limite)}`,
      referencia: af.ano ? `dez/${String(af.ano).slice(-2)}` : c.referencia,
      fonte: documentoDaFonte(af.fonte),
      nota: af.status ? `${af.status}.` : c.nota,
    }
  })

  const gatilhosBaseline = (baseline?.gatilhos_rating || []).filter(g => g.limite != null)
  const gatilhos = gatilhosBaseline.length
    ? gatilhosBaseline.map((g, i) => {
      const sobe = g.comparacao === 'acima'
      const doMesmoTipo = amostra.GATILHOS.find(a => a.tipo === (sobe ? 'max' : 'min'))
      return {
        id: `gatilho-${i}`,
        titulo: `${g.agencia || 'Agência'}, ${sobe ? 'rebaixamento' : 'elevação'}`,
        regra: `${sobe ? 'acima de' : /pr[óo]xim/i.test(g.condicao || '') ? 'próxima de' : 'abaixo de'} ${x(g.limite)}`
          + `${/consistente/i.test(g.condicao || '') ? ' de forma consistente' : ''}`,
        apurado: alav?.valor ?? doMesmoTipo?.apurado,
        limite: g.limite,
        tipo: sobe ? 'max' : 'min',
        referencia: alav?.valor != null ? mesAno(periodo) : doMesmoTipo?.referencia,
        fonte: baseline.relatorio_id
          ? `${rotuloBaseline(baseline)}, sensibilidade ${g.agencia || ''}`.trim()
          : doMesmoTipo?.fonte,
        nota: g.condicao || doMesmoTipo?.nota,
      }
    })
    : amostra.GATILHOS.map(g => (alav?.valor != null ? { ...g, apurado: alav.valor, referencia: mesAno(periodo) } : g))

  const ratings = resumo?.ratings || []
  const ativos = amostra.ATIVOS.map(a => {
    const agencia = /\((S&P|Fitch|Moody'?s)\)/.exec(a.rating || '')?.[1]
    const r = agencia && ratings.find(x => x.agencia === agencia && x.nota)
    return r ? { ...a, rating: `${r.nota} (${agencia})` } : a
  })
  const datas = ratings.filter(r => r.data).map(r => `${r.agencia} (${dataCurta(r.data)})`)
  const anoAf = apuradosAf.find(a => a.ano)?.ano
  const fontesAtivos = datas.length
    ? `${datas.join(', ')} e relatórios do agente fiduciário${anoAf ? ` ${anoAf}` : ''}`
    : amostra.FONTES_ATIVOS

  return {
    emissor: { ...amostra.EMISSOR, baseline: rotuloBaseline(baseline) },
    covenants,
    gatilhos,
    ativos,
    fontesAtivos,
  }
}

export function usePainelEmissor() {
  const [painel, setPainel] = useState(() => montarPainel(null, null))

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const [baseline, resumo] = await Promise.all([
        obterBaselineVigente(EMISSOR).catch(() => null),
        listarResumos()
          .then(i => (i.relatorios || []).find(r => /ecorodovias/i.test(r.empresa)))
          .then(r => (r ? obterResumo(r.relatorio_id) : null))
          .catch(() => null),
      ])
      if (ativo) setPainel(montarPainel(baseline, resumo))
    }
    carregar()
    return () => { ativo = false }
  }, [])

  return painel
}
