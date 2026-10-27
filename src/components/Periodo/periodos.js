// Trimestres ("2T26") para o seletor de período: lista, ordem, validação e rótulo.

// Os últimos trimestres fechados ("3T26", "2T26"...), do mais recente para o mais antigo, mais `incluir` se faltar.
export function trimestres(incluir = [], quantos = 12) {
  const hoje = new Date()
  let ano = hoje.getFullYear()
  let tri = Math.floor(hoje.getMonth() / 3) // o trimestre em curso ainda não fechou
  const lista = []
  while (lista.length < quantos) {
    if (tri === 0) { ano -= 1; tri = 4 }
    lista.push(`${tri}T${String(ano).slice(-2)}`)
    tri -= 1
  }
  const extras = incluir.filter(p => p && !lista.includes(p))
  return [...extras, ...lista].sort((a, b) => ordem(b) - ordem(a))
}

// "2T26" -> 2026 * 4 + 2: para comparar trimestres.
export const ordem = p => {
  const m = /^([1-4])T(\d{2})$/.exec(p || '')
  return m ? (2000 + Number(m[2])) * 4 + Number(m[1]) : 0
}

export const periodoValido = v => Boolean(v?.de) && (!v.ate || ordem(v.ate) >= ordem(v.de))

export const rotuloPeriodo = (de, ate) => (de ? (ate && ate !== de ? `${de} a ${ate}` : de) : '')
