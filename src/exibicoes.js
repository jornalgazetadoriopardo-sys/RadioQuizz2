import { supabase } from './supabase.js'

// Contagem de exibições dos patrocinadores (relatório do painel).
// Junta as contagens no celular e manda ao servidor a cada 30 s e quando o app vai para segundo plano.
const pendentes = new Map()

export function contarExibicao(patrocinadorId, espaco) {
  if (!patrocinadorId) return
  const chave = `${patrocinadorId}|${espaco}`
  pendentes.set(chave, (pendentes.get(chave) ?? 0) + 1)
}

async function enviar() {
  if (!pendentes.size) return
  const itens = [...pendentes].slice(0, 50).map(([chave, n]) => {
    const [p, e] = chave.split('|')
    return { p, e, n }
  })
  itens.forEach(({ p, e }) => pendentes.delete(`${p}|${e}`))
  // sem login ou banco sem a atualização 016: só não conta
  await supabase.rpc('registrar_exibicoes', { p_itens: itens }).then(
    () => {},
    () => {},
  )
}

if (typeof window !== 'undefined') {
  setInterval(enviar, 30_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && enviar())
}
