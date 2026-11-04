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
  cpf_invalido: 'Esse CPF não é válido. Confira os números.',
  cpf_em_uso: 'Esse CPF já está cadastrado em outra conta. Se for seu, entre com a conta que você usou antes ou fale com a rádio.',
  whatsapp_invalido: 'Confira o WhatsApp: coloque o DDD e o número, por exemplo (19) 99999-9999.',
  nome_invalido: 'Escreva seu nome completo.',
  'provider is not enabled': 'O login com Google ainda não foi ligado no Supabase (veja LEIA-ME-SUPABASE.md).',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Error sending magic link email': 'Não foi possível enviar o e-mail de acesso. Tente entrar com senha ou fale com a produção.',
  'rate limit': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  'schema cache': 'O banco de dados ainda não tem esta atualização. Rode o script mais recente de supabase/migrations no SQL Editor (veja LEIA-ME-SUPABASE.md).',
  'Anonymous sign-ins are disabled': 'O acesso de teste está desligado no momento.',
}

export function mensagemDeErro(erro) {
  if (!erro) return ''
  const texto = erro.message ?? String(erro)
  const chave = Object.keys(MENSAGENS).find((k) => texto.includes(k))
  if (chave) return MENSAGENS[chave]
  if (/fetch|network/i.test(texto)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return texto
}
