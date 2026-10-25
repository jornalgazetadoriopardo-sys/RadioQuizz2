import { useCallback, useEffect, useState } from 'react'
import { mensagemDeErro, supabase } from './supabase.js'

// Notificações pelo navegador (Web Push).
// Estados: carregando | nao-suportado | ios-instalar | bloqueado | ativo | inativo

const ehIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const instaladoNaTela = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // sem service worker o app funciona normalmente, só não recebe avisos
  })
}

// chave pública VAPID em formato base64url → bytes
function chaveEmBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const bruto = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0))
}

async function chavePublica() {
  const { data } = await supabase.rpc('chave_publica_push')
  if (data) return data
  // primeira vez: a função gera as chaves
  const { data: r, error } = await supabase.functions.invoke('enviar-push', { body: { tipo: 'chave' } })
  if (error || !r?.publica) throw new Error('O serviço de avisos ainda não está ligado. Fale com a rádio.')
  return r.publica
}

async function inscricaoAtual() {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

export function usePush() {
  const [estado, setEstado] = useState('carregando')
  const [erro, setErro] = useState('')

  const verificar = useCallback(async () => {
    if (ehIOS() && !instaladoNaTela()) return setEstado('ios-instalar')
    if (!suportado()) return setEstado('nao-suportado')
    if (Notification.permission === 'denied') return setEstado('bloqueado')
    const sub = await inscricaoAtual().catch(() => null)
    setEstado(sub && Notification.permission === 'granted' ? 'ativo' : 'inativo')
  }, [])

  useEffect(() => {
    verificar()
  }, [verificar])

  const ativar = async () => {
    setErro('')
    setEstado('carregando')
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') return setEstado(permissao === 'denied' ? 'bloqueado' : 'inativo')
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(await chavePublica()) }))
      const j = sub.toJSON()
      const { error } = await supabase.rpc('inscrever_push', {
        p_endpoint: j.endpoint,
        p_p256dh: j.keys.p256dh,
        p_auth: j.keys.auth,
        p_navegador: navigator.userAgent.slice(0, 300),
      })
      if (error) throw error
      setEstado('ativo')
    } catch (e) {
      // Erros do navegador (aba anônima, sem internet, serviço do Google fora) vêm em inglês: explica em português.
      const doNavegador = e instanceof DOMException || /push|subscription|registration|incognito/i.test(e?.message ?? '')
      setErro(
        doNavegador
          ? 'Não foi possível ligar os avisos neste navegador. Se estiver numa aba anônima, abra o link numa aba normal e tente de novo.'
          : mensagemDeErro(e),
      )
      verificar()
    }
  }

  const desativar = async () => {
    setErro('')
    const sub = await inscricaoAtual().catch(() => null)
    if (sub) {
      await supabase.rpc('cancelar_push', { p_endpoint: sub.endpoint })
      await sub.unsubscribe().catch(() => {})
    }
    setEstado('inativo')
  }

  return { estado, erro, ativar, desativar }
}
