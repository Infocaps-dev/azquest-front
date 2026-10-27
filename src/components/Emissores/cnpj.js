// CNPJ do cadastro de emissor: dígitos, máscara e dígitos verificadores.

export const digitos = texto => (texto || '').replace(/\D/g, '')

// Dígitos verificadores do CNPJ (algoritmo da Receita). A coleta-api confere de novo: aqui é só para avisar cedo.
export function cnpjValido(cnpj) {
  const d = digitos(cnpj)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = base => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const resto = base.split('').reduce((soma, c, i) => soma + Number(c) * pesos[i], 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const primeiro = dv(d.slice(0, 12))
  const segundo = dv(d.slice(0, 12) + primeiro)
  return d.endsWith(`${primeiro}${segundo}`)
}

export const formatarCnpj = cnpj => {
  const d = digitos(cnpj).slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
