// Identidade da rádio — troque aqui para personalizar.
export const RADIO = {
  nome: 'Difusora FM',
  frequencia: '107.3',
  cidade: 'Casa Branca',
  slogan: 'Quiz & Premiação Interativa',
}

// Projeto Supabase. A chave "publishable" é pública por natureza (vai no navegador);
// quem protege os dados são as regras de segurança do banco (supabase/migrations).
// Nunca coloque aqui a chave "secret" / "service_role".
export const SUPABASE = {
  url: import.meta.env.VITE_SUPABASE_URL ?? 'https://sxhwkkplxaotpxtgbzqe.supabase.co',
  chave: import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_Ocm5QSHYmpePmtxRbdzcKw_TLa01x_7',
}

// Formas de login exibidas na tela de entrada.
// google: precisa ativar o provedor Google no painel do Supabase antes de ligar.
// anonimo ("entrar só com o nome"): precisa ativar "Anonymous sign-ins" no Supabase. Só para a fase de testes.
export const LOGIN = {
  google: false,
  email: true,
  anonimo: true,
}

// Durações dos anúncios (segundos). O "modo apresentação" do Painel Admin usa a versão curta.
export const DURACOES = {
  anuncioPergunta: 15,
  anuncioGabarito: 30,
  modoApresentacao: 5,
}

export const NIVEIS = ['Fácil', 'Médio', 'Difícil', 'Extremo']
