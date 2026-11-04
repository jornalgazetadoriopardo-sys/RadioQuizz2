// Pergunta da Hora — função "enviar-push" (Supabase Edge Function)
//
// Pedidos aceitos (POST, JSON):
//   { "tipo": "chave" }                            → devolve a chave pública (gera as chaves na 1ª vez)
//   { "tipo": "rodada",   "rodada_id": "<uuid>" }  → banco: a rodada entrou no ar
//   { "tipo": "lembrete", "rodada_id": "<uuid>" }  → banco: faltam X minutos para a rodada
//   { "tipo": "agendada", "id": "<uuid>" }         → banco: chegou a hora de uma mensagem agendada
//   { "tipo": "manual",   "rodada_id": "<uuid>" }  → admin: avisar agora sobre uma rodada
//   { "tipo": "avulsa",   "titulo": "...", "corpo": "..." } → admin: mensagem na hora
//
// Publicar com "Verify JWT" DESLIGADO: o banco chama sem login. A função se protege sozinha:
// os pedidos do banco só enviam se a situação conferir (rodada no ar, lembrete no prazo,
// agendada marcada para envio) e cada um sai uma vez só; "manual" e "avulsa" exigem login de admin.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SIMULTANEOS = 25 // envios em paralelo
const POR_PAGINA = 1000

// Sem tipos gerados do banco: o cliente fica sem tipagem das tabelas.
// deno-lint-ignore no-explicit-any
type Db = any
type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string }
type Rodada = { id: string; titulo: string; pontos: number; status: string; no_ar_em: string | null; horario: string; data: string | null }
type Config = {
  lembrete_minutos: number
  modelo_no_ar_titulo: string
  modelo_no_ar_corpo: string
  modelo_lembrete_titulo: string
  modelo_lembrete_corpo: string
}

async function obterChaves(db: Db) {
  const { data } = await db.from('push_config').select('publica, privada').eq('id', 1).maybeSingle()
  if (data) return data as { publica: string; privada: string }
  const novas = webpush.generateVAPIDKeys()
  await db.from('push_config').upsert({ id: 1, publica: novas.publicKey, privada: novas.privateKey }, { onConflict: 'id', ignoreDuplicates: true })
  // relê: se duas chamadas chegaram juntas, vale a que gravou primeiro
  const { data: gravadas, error } = await db.from('push_config').select('publica, privada').eq('id', 1).single()
  if (error) throw error
  return gravadas as { publica: string; privada: string }
}

const fmtPontos = (n: number) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Brasília está em UTC−3 o ano todo (sem horário de verão desde 2019).
const comSegundos = (h: string) => (h.length === 5 ? `${h}:00` : h)
const inicioDaRodada = (r: Rodada) => (r.data ? new Date(`${r.data}T${comSegundos(r.horario)}-03:00`) : null)
// "10:30:00" → "10:30" (só mostra os segundos quando não são zero)
const fmtHorario = (h: string) => (h.length > 5 && h.endsWith(':00') ? h.slice(0, 5) : h)

/** Troca {horario}, {titulo}, {pontos} e {minutos} pelos dados da rodada. */
function preencher(modelo: string, r: Rodada, minutos?: number) {
  return modelo
    .replaceAll('{horario}', fmtHorario(r.horario))
    .replaceAll('{titulo}', r.titulo)
    .replaceAll('{pontos}', fmtPontos(r.pontos))
    .replaceAll('{minutos}', minutos ? String(minutos) : 'poucos')
    .trim()
    .slice(0, 240)
}

async function enviarParaTodos(db: Db, envioId: string, mensagem: object, ttl: number) {
  let enviados = 0, falhas = 0, removidas = 0
  const corpo = JSON.stringify(mensagem)
  for (let pagina = 0; ; pagina++) {
    const { data: lote, error } = await db
      .from('push_inscricoes')
      .select('id, endpoint, p256dh, auth')
      .order('criada_em')
      .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
    if (error) throw error
    if (!lote?.length) break

    const mortas: string[] = []
    for (let i = 0; i < lote.length; i += SIMULTANEOS) {
      await Promise.all(
        (lote as Inscricao[]).slice(i, i + SIMULTANEOS).map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo, { TTL: ttl, urgency: 'high' })
            enviados++
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            // 404/410 = a pessoa desinstalou ou bloqueou: remove a inscrição
            if (status === 404 || status === 410) mortas.push(s.id)
            else falhas++
          }
        }),
      )
    }
    if (mortas.length) {
      await db.from('push_inscricoes').delete().in('id', mortas)
      removidas += mortas.length
    }
    if (lote.length < POR_PAGINA) break
  }
  await db.from('push_envios').update({ enviados, falhas, removidas, concluido_em: new Date().toISOString() }).eq('id', envioId)
  return { enviados, falhas, removidas }
}

/** Registra o envio (o índice único do banco impede aviso repetido) e manda para todos. */
async function registrarEEnviar(db: Db, registro: Record<string, unknown>, tag: string, ttl: number) {
  const { data: envio, error } = await db.from('push_envios').insert(registro).select('id').single()
  if (error) return error.code === '23505' ? resposta({ ignorado: 'este aviso já foi enviado' }) : resposta({ erro: error.message }, 500)
  const resultado = await enviarParaTodos(db, envio.id, { titulo: registro.titulo, corpo: registro.corpo, url: '/', tag }, ttl)
  return resposta({ envio_id: envio.id, ...resultado })
}

async function adminLogado(db: Db, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: quem } = await db.auth.getUser(token)
  if (!quem?.user) return null
  const { data: perfil } = await db.from('perfis').select('admin').eq('id', quem.user.id).maybeSingle()
  return perfil?.admin ? (quem.user.id as string) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'use POST' }, 405)

  const urlProjeto = Deno.env.get('SUPABASE_URL')!
  const db = createClient(urlProjeto, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let pedido: Record<string, unknown>
  try {
    pedido = await req.json()
  } catch {
    return resposta({ erro: 'corpo inválido' }, 400)
  }

  try {
    const chaves = await obterChaves(db)
    if (pedido.tipo === 'chave') return resposta({ publica: chaves.publica })
    webpush.setVapidDetails(urlProjeto, chaves.publica, chaves.privada)

    const { data: cfg } = await db.from('configuracoes').select('*').eq('id', 1).maybeSingle()
    const config = cfg as Config
    const buscarRodada = async () => {
      const { data } = await db.from('rodadas').select('id, titulo, pontos, status, no_ar_em, horario, data').eq('id', String(pedido.rodada_id ?? '')).maybeSingle()
      return data as Rodada | null
    }

    // ---- pedidos do banco (sem login; conferem a situação e saem uma vez só) ----
    if (pedido.tipo === 'rodada') {
      const r = await buscarRodada()
      if (!r || r.status !== 'no_ar') return resposta({ ignorado: 'rodada fora do ar' })
      const titulo = preencher(config.modelo_no_ar_titulo, r).slice(0, 80)
      const corpo = preencher(config.modelo_no_ar_corpo, r)
      // perde a validade em 15 minutos (não chega depois que a rodada passou)
      return registrarEEnviar(db, { motivo: 'rodada', rodada_id: r.id, rodada_no_ar_em: r.no_ar_em, titulo, corpo }, 'rodada', 900)
    }

    if (pedido.tipo === 'lembrete') {
      const r = await buscarRodada()
      const inicio = r && inicioDaRodada(r)
      const falta = inicio ? inicio.getTime() - Date.now() : -1
      // só antes do início e dentro da antecedência configurada (+1 min de folga)
      if (!r || r.status !== 'agendada' || falta <= 0 || falta > (config.lembrete_minutos + 1) * 60_000) return resposta({ ignorado: 'fora do prazo do lembrete' })
      const minutos = Math.max(1, Math.round(falta / 60_000))
      const titulo = preencher(config.modelo_lembrete_titulo, r, minutos).slice(0, 80)
      const corpo = preencher(config.modelo_lembrete_corpo, r, minutos)
      return registrarEEnviar(db, { motivo: 'lembrete', rodada_id: r.id, rodada_no_ar_em: inicio!.toISOString(), titulo, corpo }, 'lembrete', Math.round(falta / 1000) + 600)
    }

    if (pedido.tipo === 'agendada') {
      const { data: ag } = await db
        .from('push_agendados')
        .update({ status: 'enviado' })
        .eq('id', String(pedido.id ?? ''))
        .eq('status', 'enviando')
        .select('id, titulo, corpo, criado_por')
        .maybeSingle()
      if (!ag) return resposta({ ignorado: 'mensagem não está marcada para envio' })
      const r = await registrarEEnviar(db, { motivo: 'agendada', titulo: ag.titulo, corpo: ag.corpo, enviado_por: ag.criado_por }, 'avulsa', 86400)
      const dados = await r.clone().json()
      if (dados.envio_id) await db.from('push_agendados').update({ envio_id: dados.envio_id }).eq('id', ag.id)
      return r
    }

    // ---- pedidos do Painel Admin (exigem login de admin) ----
    if (pedido.tipo === 'manual' || pedido.tipo === 'avulsa') {
      const adminId = await adminLogado(db, req)
      if (!adminId) return resposta({ erro: 'apenas administradores' }, 403)

      if (pedido.tipo === 'manual') {
        const r = await buscarRodada()
        if (!r) return resposta({ erro: 'rodada não encontrada' }, 404)
        const noAr = r.status === 'no_ar'
        const inicio = inicioDaRodada(r)
        const minutos = inicio ? Math.max(1, Math.round((inicio.getTime() - Date.now()) / 60_000)) : undefined
        const titulo = preencher(noAr ? config.modelo_no_ar_titulo : config.modelo_lembrete_titulo, r, minutos).slice(0, 80)
        const corpo = preencher(noAr ? config.modelo_no_ar_corpo : config.modelo_lembrete_corpo, r, minutos)
        return registrarEEnviar(db, { motivo: 'manual', rodada_id: r.id, titulo, corpo, enviado_por: adminId }, noAr ? 'rodada' : 'lembrete', 3600)
      }

      const titulo = String(pedido.titulo ?? '').trim().slice(0, 80)
      const corpo = String(pedido.corpo ?? '').trim().slice(0, 240)
      if (!titulo || !corpo) return resposta({ erro: 'preencha título e mensagem' }, 400)
      return registrarEEnviar(db, { motivo: 'avulsa', titulo, corpo, enviado_por: adminId }, 'avulsa', 86400)
    }

    return resposta({ erro: 'tipo desconhecido' }, 400)
  } catch (e) {
    console.error(e)
    return resposta({ erro: String((e as Error)?.message ?? e) }, 500)
  }
})
