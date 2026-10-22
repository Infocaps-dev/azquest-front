import { useEffect, useState } from 'react'
import { GroupedBarChart, LineChart, SimpleBarChart } from '@carbon/charts-react'
import '@carbon/charts-react/styles.css'
import { Button, InlineLoading } from '@carbon/react'
import { obterGrafico } from '../../services/resumosApi'
import InserirNoRelatorio from './InserirNoRelatorio.jsx'
import './GraficoInterativo.scss'

// Gráfico do modelo do EBITDA desenhado na conversa, interativo.
//
// O agente responde com a imagem do gráfico (SVG público no bucket), que é o que o chat do Orchestrate mostra e o que
// entra no relatório. Na mesma pasta fica a especificação com os dados (ver relatorio-creditos/tools/acervo/
// graficos_ebitda.py); a tela a lê pela resumos-api e desenha o gráfico com o Carbon Charts: valor de cada ponto no
// tooltip, legenda que liga e desliga séries, "ver como tabela" e exportar PNG/CSV na barra do gráfico. Se os dados
// não vierem, mostra a própria imagem.
//
// A cor segue a série pelo papel dela (observado, polinomial, média móvel...), nunca pela posição: a mesma série tem a
// mesma cor em todos os gráficos. Os modelos de contexto ficam em cinza e começam desligados quando são muitos.

const CORES = {
  observado: '#1b2a38', polinomial: '#2a78d6', media_movel: '#eb6834', combinacao: '#6250d6',
  destaque: '#1baf7a', destaque2: '#eda100', outro: '#b4b3ad', faixa: '#9085e9',
}
const MUITAS_SERIES = 6
const MUITOS_TRIMESTRES = 20

const numero = (v, casas = 1) => Number(v).toLocaleString('pt-BR', {
  minimumFractionDigits: casas, maximumFractionDigits: casas,
})

function escalaDeCores(painel) {
  const escala = {}
  for (const s of painel.series) {
    if (s.papeis) s.pontos.forEach(([x], i) => { escala[x] = CORES[s.papeis[i]] || CORES.outro })
    else escala[s.nome] = CORES[s.papel] || CORES.outro
  }
  if (painel.faixa) {
    escala[`${painel.faixa.nome}: P10`] = CORES.faixa
    escala[`${painel.faixa.nome}: P90`] = CORES.faixa
  }
  return escala
}

function opcoes(painel, unidade, extra) {
  return {
    title: painel.titulo || '',
    height: '340px',
    theme: 'white',
    animations: false,
    color: { scale: escalaDeCores(painel) },
    legend: { clickable: true, alignment: 'left', truncation: { type: 'none' } },
    tooltip: { groupLabel: 'Série', valueFormatter: v => (typeof v === 'number' ? `${numero(v)} ${unidade}` : String(v)) },
    toolbar: { enabled: true },
    ...extra,
  }
}

// Eixo de trimestres longo (a série desde 2013): rótulo só no 1T de cada ano e no último trimestre.
function marcasDoEixo(chaves) {
  if (chaves.length <= MUITOS_TRIMESTRES) return undefined
  return chaves.filter((k, i) => k.startsWith('1T') || i === chaves.length - 1)
}

function PainelLinha({ painel, unidade }) {
  // O gráfico da previsão abre nos últimos trimestres, onde está a previsão; a série inteira fica a um clique.
  const [inteira, setInteira] = useState(!painel.janela_svg)
  let dados = painel.series.flatMap(s => s.pontos.map(([x, y]) => ({ group: s.nome, key: String(x), value: y })))
  if (painel.faixa) {
    // A faixa P10-P90 da previsão vira duas linhas finas, do último dado observado até o trimestre previsto.
    for (const [x, inferior, superior] of painel.faixa.pontos) {
      dados.push({ group: `${painel.faixa.nome}: P10`, key: String(x), value: inferior })
      dados.push({ group: `${painel.faixa.nome}: P90`, key: String(x), value: superior })
    }
  }
  const todas = [...new Set(dados.map(d => d.key))]
  if (!inteira) {
    const janela = new Set(todas.slice(-painel.janela_svg))
    dados = dados.filter(d => janela.has(d.key))
  }
  const chaves = [...new Set(dados.map(d => d.key))]
  const principais = painel.series.filter(s => s.papel !== 'outro').map(s => s.nome)
  const selecionados = painel.series.length > MUITAS_SERIES ? principais : undefined
  return (
    <>
      <LineChart data={dados} options={opcoes(painel, unidade, {
        axes: {
          bottom: { title: painel.eixo_x, mapsTo: 'key', scaleType: 'labels',
            ticks: { values: marcasDoEixo(chaves), rotation: 'never' } },
          left: { title: painel.eixo_y, mapsTo: 'value', scaleType: 'linear', ticks: { formatter: t => numero(t, 0) } },
        },
        points: { radius: 3 },
        ...(selecionados ? { data: { selectedGroups: selecionados } } : {}),
      })} />
      {painel.janela_svg && (
        <Button kind="ghost" size="sm" onClick={() => setInteira(v => !v)}>
          {inteira ? `Ver só os últimos ${painel.janela_svg} trimestres` : `Ver a série inteira (desde ${todas[0]})`}
        </Button>
      )}
    </>
  )
}

function PainelBarras({ painel, unidade }) {
  const dados = painel.series.flatMap(s => s.pontos.map(([x, y]) => ({ group: s.nome, key: String(x), value: y })))
  return (
    <GroupedBarChart data={dados} options={opcoes(painel, unidade, {
      axes: {
        bottom: { title: painel.eixo_x, mapsTo: 'key', scaleType: 'labels' },
        left: { title: painel.eixo_y, mapsTo: 'value', scaleType: 'linear', ticks: { formatter: t => numero(t, 0) } },
      },
    })} />
  )
}

function PainelBarrasHorizontais({ painel, unidade }) {
  const [serie] = painel.series
  // O Carbon desenha a primeira categoria embaixo: invertida, a lista fica com o melhor modelo no topo.
  const dados = serie.pontos.map(([nome, valor]) => ({ group: nome, value: valor })).reverse()
  return (
    <SimpleBarChart data={dados} options={opcoes(painel, unidade, {
      height: `${Math.max(340, 26 * dados.length + 60)}px`,
      legend: { enabled: false },
      axes: {
        left: { mapsTo: 'group', scaleType: 'labels', truncation: { type: 'none' } },
        bottom: { title: painel.eixo_x, mapsTo: 'value', scaleType: 'linear', ticks: { formatter: t => numero(t, 0) } },
      },
    })} />
  )
}

const PAINEIS = { linha: PainelLinha, barras: PainelBarras, barras_horizontais: PainelBarrasHorizontais }

function GraficoInterativo({ grafico, url, titulo, onEnviar }) {
  const [spec, setSpec] = useState(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let ativo = true
    obterGrafico(grafico)
      .then(s => { if (ativo) setSpec(s) })
      .catch(() => { if (ativo) setFalhou(true) })
    return () => { ativo = false }
  }, [grafico])

  if (falhou) {
    return (
      <figure className="chat-grafico">
        <img className="chat-grafico__imagem" src={url} alt={titulo} />
      </figure>
    )
  }
  if (!spec) return <InlineLoading className="chat-grafico__carregando" description="Carregando o gráfico" />

  return (
    <figure className="chat-grafico" aria-label={spec.titulo}>
      <figcaption>
        <p className="chat-grafico__titulo">{spec.titulo}</p>
        {spec.subtitulo && <p className="chat-grafico__subtitulo">{spec.subtitulo}</p>}
      </figcaption>
      {spec.paineis.map((painel, i) => {
        const Painel = PAINEIS[painel.tipo]
        return Painel ? <div key={i} className="chat-grafico__painel"><Painel painel={painel} unidade={spec.unidade} /></div> : null
      })}
      <p className="chat-grafico__fonte">
        Fonte: {spec.fonte}.{' '}
        <a href={url} target="_blank" rel="noopener noreferrer">Imagem do gráfico</a>
      </p>
      {onEnviar && <InserirNoRelatorio grafico={grafico} onEnviar={onEnviar} />}
    </figure>
  )
}

export default GraficoInterativo
