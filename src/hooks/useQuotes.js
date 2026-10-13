import { useEffect, useState } from 'react'

const TICKERS = ['ECOR3.SA', 'PETR4.SA', 'VALE3.SA']
const COLORS = { 'ECOR3.SA': '#2ecc71', 'PETR4.SA': '#f39c12', 'VALE3.SA': '#27ae60' }

// Dados fundamentalistas estáticos (P/L, P/VP, ROE não disponíveis na API gratuita)
const FUNDAMENTALS = {
  'ECOR3.SA': { pl: '12,4x', pvp: '1,8x', roe: '+14,2%', divYield: '+3,1%', mktCap: '4,2B' },
  'PETR4.SA': { pl: '5,1x',  pvp: '1,2x', roe: '+32,7%', divYield: '+8,9%', mktCap: '412B' },
  'VALE3.SA': { pl: '6,8x',  pvp: '2,1x', roe: '+28,4%', divYield: '+9,5%', mktCap: '285B' },
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtChange(pct) {
  if (pct == null || isNaN(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function fmtMktCap(v) {
  if (!v) return '—'
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (v >= 1e9)  return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `${(v / 1e6).toFixed(1)}M`
  return String(v)
}

async function fetchTicker(symbol) {
  const url = `/yahoo/v8/finance/chart/${symbol}?interval=1d&range=1d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${symbol}`)
  const data = await res.json()
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`Sem dados para ${symbol}`)
  return meta
}

export function useQuotes() {
  const [quotes, setQuotes] = useState([])
  const [additional, setAdditional] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchAll() {
    try {
      setError(null)
      const results = await Promise.all(TICKERS.map(fetchTicker))

      const q = results.map((m, i) => {
        const sym = TICKERS[i]
        const changePct = m.regularMarketChangePercent ?? 0
        return {
          ticker: sym.replace('.SA', ''),
          color: COLORS[sym] || '#0186EF',
          last: fmt(m.regularMarketPrice),
          time: fmtTime(m.regularMarketTime),
          change: fmtChange(changePct),
          close: fmt(m.chartPreviousClose ?? m.previousClose),
          positive: changePct >= 0,
        }
      })

      const a = results.map((_, i) => {
        const sym = TICKERS[i]
        const f = FUNDAMENTALS[sym]
        return {
          ticker: sym.replace('.SA', ''),
          pl: f.pl,
          pvp: f.pvp,
          roe: f.roe,
          divYield: f.divYield,
          mktCap: f.mktCap,
        }
      })

      setQuotes(q)
      setAdditional(a)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60_000)
    return () => clearInterval(interval)
  }, [])

  return { quotes, additional, loading, error, refetch: fetchAll }
}
