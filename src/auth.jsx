import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Loader2, Mail, Radio, UserRound } from 'lucide-react'
import { LOGIN, RADIO } from './config.js'
import { mensagemDeErro, supabase } from './supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(undefined) // undefined = carregando
  const [perfil, setPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const usuarioId = sessao?.user?.id
  const carregarPerfil = useCallback(async () => {
    if (!usuarioId) return setPerfil(null)
    const { data } = await supabase.from('perfis').select('*').eq('id', usuarioId).maybeSingle()
    setPerfil(data ?? { id: usuarioId, nome: '', admin: false })
  }, [usuarioId])

  useEffect(() => {
    carregarPerfil()
  }, [carregarPerfil])

  const value = useMemo(
    () => ({
      carregando: sessao === undefined || (sessao && !perfil),
      sessao,
      perfil,
      anonimo: sessao?.user?.is_anonymous ?? false,
      recarregarPerfil: carregarPerfil,
      sair: () => supabase.auth.signOut(),
    }),
    [sessao, perfil, carregarPerfil],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Loader2 className="animate-spin text-rose-600" size={28} />
      {texto}
    </div>
  )
}

const btnCls = 'flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold transition disabled:opacity-50'

/** Tela de entrada. `admin` deixa de fora o "entrar só com o nome" (admin precisa de conta de verdade). */
export function TelaLogin({ admin = false }) {
  const [etapa, setEtapa] = useState('inicio') // inicio | email | codigo
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  const executar = async (fn) => {
    setErro('')
    setOcupado(true)
    try {
      const { error } = await fn()
      if (error) throw error
      return true
    } catch (e) {
      setErro(mensagemDeErro(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const voltarPara = window.location.origin + window.location.pathname + window.location.hash

  const google = () => executar(() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: voltarPara } }))
  const anonimo = () => executar(() => supabase.auth.signInAnonymously())
  const enviarEmail = async (e) => {
    e.preventDefault()
    // Com senha (contas criadas pelo painel do Supabase) entra direto, sem depender de envio de e-mail.
    if (senha) return executar(() => supabase.auth.signInWithPassword({ email: email.trim(), password: senha }))
    const ok = await executar(() => supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: voltarPara } }))
    if (ok) setEtapa('codigo')
  }
  const verificarCodigo = (e) => {
    e.preventDefault()
    executar(() => supabase.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: 'email' }))
  }

  return (
    <div className="flex h-full flex-col justify-center bg-gradient-to-b from-rose-600 to-rose-700 px-7 py-10 text-white">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 animate-pop">
        <Radio size={32} />
      </div>
      <h1 className="mt-6 font-display text-3xl leading-tight">{admin ? 'Painel do Quiz' : 'Pergunta da Hora'}</h1>
      <p className="mt-2 text-sm text-rose-100">
        {admin
          ? 'Entre com o e-mail cadastrado como administrador.'
          : `Ouça a ${RADIO.nome} ${RADIO.frequencia}, responda as perguntas do locutor e concorra a prêmios toda semana!`}
      </p>

      <div className="mt-8 space-y-3">
        {etapa === 'inicio' && (
          <>
            {LOGIN.google && (
              <button onClick={google} disabled={ocupado} className={`${btnCls} bg-white text-slate-900`}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                Continuar com Google
              </button>
            )}
            {LOGIN.email && (
              <button onClick={() => setEtapa('email')} disabled={ocupado} className={`${btnCls} bg-slate-900 text-white`}>
                <Mail size={18} /> Entrar com e-mail
              </button>
            )}
            {LOGIN.anonimo && !admin && (
              <button onClick={anonimo} disabled={ocupado} className={`${btnCls} bg-white/15 text-white ring-1 ring-white/30`}>
                <UserRound size={18} /> Entrar só com o nome (teste)
              </button>
            )}
          </>
        )}

        {etapa === 'email' && (
          <form onSubmit={enviarEmail} className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-rose-100" htmlFor="email">
              Seu e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              autoComplete="email"
              className="w-full rounded-xl bg-white px-4 py-3.5 text-slate-900 outline-none"
            />
            {admin && (
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Senha (deixe em branco para receber link)"
                autoComplete="current-password"
                className="w-full rounded-xl bg-white px-4 py-3.5 text-slate-900 outline-none"
              />
            )}
            <button disabled={ocupado || !email.includes('@')} className={`${btnCls} bg-slate-900 text-white`}>
              {ocupado ? <Loader2 className="animate-spin" size={18} /> : senha ? 'Entrar' : 'Receber link de acesso'}
            </button>
            <button type="button" onClick={() => setEtapa('inicio')} className="w-full text-center text-xs text-rose-100 underline">
              Voltar
            </button>
          </form>
        )}

        {etapa === 'codigo' && (
          <form onSubmit={verificarCodigo} className="space-y-3">
            <div className="rounded-xl bg-white/15 p-4 text-sm">
              Enviamos um e-mail para <b>{email}</b>. Abra a mensagem e toque no link para entrar, ou digite abaixo o código, se ele vier no e-mail.
            </div>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Código"
              className="w-full rounded-xl bg-white px-4 py-3.5 text-center text-lg font-bold tracking-[0.4em] text-slate-900 outline-none"
            />
            <button disabled={ocupado || codigo.length < 6} className={`${btnCls} bg-slate-900 text-white`}>
              {ocupado ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar código'}
            </button>
            <button type="button" onClick={() => setEtapa('email')} className="w-full text-center text-xs text-rose-100 underline">
              Usar outro e-mail
            </button>
          </form>
        )}

        {erro && <p className="rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-rose-700">{erro}</p>}
      </div>
    </div>
  )
}

/** Depois do primeiro login: pede o nome que vai aparecer no ranking. */
export function TelaNome() {
  const { perfil, recarregarPerfil, sair } = useAuth()
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const valido = nome.trim().length >= 3

  const salvar = async (e) => {
    e.preventDefault()
    setOcupado(true)
    const { error } = await supabase.from('perfis').update({ nome: nome.trim() }).eq('id', perfil.id)
    setOcupado(false)
    if (error) return setErro(mensagemDeErro(error))
    recarregarPerfil()
  }

  return (
    <div className="flex h-full flex-col justify-center bg-gradient-to-b from-rose-600 to-rose-700 px-7 text-white">
      <h1 className="font-display text-2xl leading-tight">Como podemos te chamar?</h1>
      <p className="mt-2 text-sm text-rose-100">Esse nome aparece no ranking e pode ser anunciado no ar se você ganhar.</p>
      <form className="mt-6 space-y-3" onSubmit={salvar}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome"
          autoComplete="name"
          maxLength={40}
          className="w-full rounded-xl bg-white px-4 py-3.5 text-slate-900 outline-none"
        />
        <button disabled={!valido || ocupado} className={`${btnCls} bg-slate-900 text-white`}>
          Começar a jogar
        </button>
        {erro && <p className="rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-rose-700">{erro}</p>}
        <button type="button" onClick={sair} className="w-full text-center text-xs text-rose-100 underline">
          Sair
        </button>
      </form>
    </div>
  )
}
