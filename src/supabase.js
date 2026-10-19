import { createClient } from '@supabase/supabase-js'
import { SUPABASE } from './config.js'

export const supabase = createClient(SUPABASE.url, SUPABASE.chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Traduz os erros das funções do banco para mensagens para o usuário.
const MENSAGENS = {
  login_necessario: 'Faça login para participar.',
  rodada_fora_do_ar: 'Esta rodada não está mais no ar.',
  ja_respondida: 'Você já respondeu esta rodada.',
  pergunta_nao_aberta: 'A pergunta não foi aberta. Tente novamente.',
  acesso_negado: 'Apenas administradores podem fazer isso.',
}

export function mensagemDeErro(erro) {
  if (!erro) return ''
  const texto = erro.message ?? String(erro)
  const chave = Object.keys(MENSAGENS).find((k) => texto.includes(k))
  if (chave) return MENSAGENS[chave]
  if (/fetch|network/i.test(texto)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return texto
}
