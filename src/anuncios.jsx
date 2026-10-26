import { useEffect, useRef, useState } from 'react'
import { AtSign, Globe, ImageIcon, MapPin, MessageCircle, Phone, Volume2, Zap } from 'lucide-react'
import { CORES, Icone } from './ui.jsx'

// Peças de anúncio dos patrocinadores. Tudo é desenhado pelo próprio app (sem API externa):
//   simples    → logo/ícone + frase
//   video      → vídeo do YouTube (inclusive "Não listado")
//   automatico → um dos layouts abaixo, montado com os dados cadastrados

export const LAYOUTS = [
  { id: 'oferta', nome: 'Oferta em destaque', descricao: 'Foto grande do produto com o preço em evidência.' },
  { id: 'loja', nome: 'Cartão da loja', descricao: 'Logo grande e todos os contatos, ideal para serviços.' },
  { id: 'relampago', nome: 'Promoção relâmpago', descricao: 'Cores fortes e preço gigante, para ofertas curtas.' },
  { id: 'vitrine', nome: 'Vitrine', descricao: 'Até 3 fotos lado a lado, para vários produtos.' },
]

/* ---------- YouTube ---------- */

/** Aceita youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID e /live/ID. */
export function youtubeId(url) {
  if (!url) return null
  const m = String(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}
export const ehShorts = (url) => /youtube\.com\/shorts\//.test(url ?? '')

/**
 * Vídeo do patrocinador.
 * comSom: o vídeo é carregado parado (enquanto o ouvinte vê o relógio ou a pergunta) e só começa, já com som,
 *   quando `tocar` vira true — depois do toque em "Vou participar" / "Confira sua resposta", que é o que o
 *   navegador exige para liberar o som. Se o celular bloquear mesmo assim (alguns iPhones), toca sem som e
 *   aparece o botão "Ouvir com som".
 * Sem comSom (prévia do painel): começa sozinho sem som, com o botão.
 * aoTerminar: chamado quando o vídeo acaba (sem ele, o vídeo fica repetindo).
 */
function VideoYouTube({ url, vertical, comSom = false, tocar = true, aoTerminar }) {
  const id = youtubeId(url)
  const quadro = useRef(null)
  const [pronto, setPronto] = useState(false)
  const [mostrarBotao, setMostrarBotao] = useState(!comSom)
  const player = useRef({ estado: -1, mudo: !comSom, mandouTocar: false })
  const fim = useRef(aoTerminar)
  fim.current = aoTerminar

  const enviar = (func, args = []) => quadro.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')

  // Conversa com o player do YouTube: pede os avisos até ele responder e acompanha o estado
  useEffect(() => {
    const aoReceber = (e) => {
      if (!quadro.current || e.source !== quadro.current.contentWindow) return
      let d
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (!d?.event) return
      player.current.pronto = true
      setPronto(true)
      const info = d.info
      const estado = d.event === 'onStateChange' ? info : info?.playerState
      if (typeof estado === 'number') player.current.estado = estado
      if (typeof info?.muted === 'boolean') player.current.mudo = info.muted
      if (estado === 0) fim.current?.()
      if (player.current.mandouTocar && player.current.estado === 1) setMostrarBotao(player.current.mudo)
    }
    window.addEventListener('message', aoReceber)
    const chamar = setInterval(() => {
      if (player.current.pronto) return clearInterval(chamar)
      quadro.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'anuncio', channel: 'widget' }), '*')
    }, 400)
    return () => {
      window.removeEventListener('message', aoReceber)
      clearInterval(chamar)
    }
  }, [])

  // Hora de tocar: com o player pronto, começa com som. Se em 2,5 s não estiver tocando, o celular
  // bloqueou o som → toca sem som e mostra o botão.
  useEffect(() => {
    if (!comSom || !tocar || !pronto) return
    player.current.mandouTocar = true
    enviar('unMute')
    enviar('setVolume', [100])
    enviar('playVideo')
    const t = setTimeout(() => {
      if (player.current.estado !== 1) {
        enviar('mute')
        enviar('playVideo')
        setMostrarBotao(true)
      } else if (player.current.mudo) setMostrarBotao(true)
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comSom, tocar, pronto])

  // Saiu da tela: para o vídeo
  useEffect(() => {
    if (comSom && !tocar && player.current.mandouTocar) enviar('pauseVideo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocar])

  if (!id) return <Aviso texto="Link do YouTube inválido" />

  const ligarSom = () => {
    player.current.mandouTocar = true
    enviar('unMute')
    enviar('setVolume', [100])
    enviar('playVideo')
    setMostrarBotao(false)
  }
  const params = new URLSearchParams({
    autoplay: comSom ? '0' : '1', mute: comSom ? '0' : '1', playsinline: '1', controls: '0', rel: '0', modestbranding: '1',
    enablejsapi: '1', origin: window.location.origin, ...(aoTerminar ? {} : { loop: '1', playlist: id }),
  })

  return (
    <div className="relative">
      <div className={`overflow-hidden rounded-2xl bg-black ${vertical ? 'mx-auto aspect-[9/16] max-h-[420px]' : 'aspect-video'}`}>
        <iframe
          ref={quadro}
          src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
          title="Vídeo do patrocinador"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
      {mostrarBotao && tocar && (
        <button
          onClick={ligarSom}
          className="mx-auto mt-3 flex min-h-[56px] items-center gap-2 rounded-full bg-marca-800 px-7 text-xl font-bold text-white shadow-lg active:scale-[.98]"
        >
          <Volume2 size={24} /> Ouvir com som
        </button>
      )}
    </div>
  )
}

/* ---------- ajudas de cor ---------- */

function luminancia(hex) {
  const n = parseInt((hex || '#000000').slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Texto legível sobre uma cor de fundo (branco ou quase preto). */
const sobre = (hex) => (luminancia(hex) > 0.45 ? '#0f172a' : '#ffffff')

function Aviso({ texto }) {
  return <div className="grid aspect-video place-items-center rounded-2xl bg-slate-100 text-base text-slate-500">{texto}</div>
}

function Foto({ src, className = '', cor }) {
  if (src) return <img src={src} alt="" className={`h-full w-full object-cover ${className}`} />
  return (
    <div className={`grid h-full w-full place-items-center ${className}`} style={{ background: `${cor}22`, color: cor }}>
      <ImageIcon size={40} strokeWidth={1.5} />
    </div>
  )
}

function Logo({ p, tamanho = 'h-12 w-12', className = '' }) {
  if (p.logo_url) return <img src={p.logo_url} alt={p.nome} className={`${tamanho} rounded-xl bg-white object-contain p-1 ${className}`} />
  return (
    <div className={`${tamanho} grid place-items-center rounded-xl bg-white text-xl font-black ${className}`} style={{ color: p.cor_primaria }}>
      {(p.nome || '?').slice(0, 1).toUpperCase()}
    </div>
  )
}

function Precos({ p, grande = false, cor }) {
  if (!p.preco && !p.preco_antigo) return null
  return (
    <div className={grande ? 'flex flex-col items-start gap-1' : 'flex flex-wrap items-end gap-2'}>
      {p.preco_antigo && <span className={`${grande ? 'text-lg' : 'text-base'} whitespace-nowrap line-through opacity-70`}>{grande ? `De ${p.preco_antigo}` : p.preco_antigo}</span>}
      {p.preco && (
        <span className={`${grande ? 'text-5xl' : 'text-3xl'} whitespace-nowrap font-black leading-none tracking-tight`} style={cor ? { color: cor } : undefined}>
          {p.preco}
        </span>
      )}
    </div>
  )
}

function Contatos({ p, claro = false, grande = false }) {
  const itens = [
    p.whatsapp && { icone: MessageCircle, texto: p.whatsapp },
    p.telefone && { icone: Phone, texto: p.telefone },
    p.endereco && { icone: MapPin, texto: p.endereco },
    p.instagram && { icone: AtSign, texto: p.instagram.replace(/^@?/, '@') },
    p.site && { icone: Globe, texto: p.site.replace(/^https?:\/\//, '') },
  ].filter(Boolean)
  if (!itens.length) return null
  return (
    <ul className={`space-y-1.5 ${grande ? 'text-lg' : 'text-[15px]'} ${claro ? 'text-white' : 'text-slate-800'}`}>
      {itens.map(({ icone: I, texto }) => (
        <li key={texto} className="flex items-start gap-2 leading-snug">
          <I size={grande ? 20 : 17} className="mt-0.5 shrink-0 opacity-80" />
          <span className="break-words">{texto}</span>
        </li>
      ))}
    </ul>
  )
}

/* ---------- layouts automáticos ---------- */

function LayoutOferta({ p }) {
  const c1 = p.cor_primaria, c2 = p.cor_secundaria
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: c1, color: sobre(c1) }}>
        <Logo p={p} tamanho="h-11 w-11" />
        <p className="text-lg font-extrabold leading-tight">{p.nome}</p>
      </div>
      <div className="relative aspect-[4/3]">
        <Foto src={p.imagens?.[0]} cor={c1} />
        {p.preco && (
          <div className="absolute bottom-3 right-3 rounded-2xl px-4 py-2 shadow-lg" style={{ background: c2, color: sobre(c2) }}>
            <span className="text-3xl font-black leading-none">{p.preco}</span>
          </div>
        )}
      </div>
      <div className="space-y-2 p-5">
        {p.promo_titulo && <p className="text-2xl font-extrabold leading-snug text-slate-900">{p.promo_titulo}</p>}
        {p.promo_descricao && <p className="text-base leading-relaxed text-slate-700">{p.promo_descricao}</p>}
        {p.preco_antigo && (
          <p className="text-base text-slate-500">
            De <span className="line-through">{p.preco_antigo}</span> por <b className="text-slate-900">{p.preco}</b>
          </p>
        )}
        {p.validade && <p className="text-sm font-semibold" style={{ color: c1 }}>{p.validade}</p>}
        <div className="border-t border-slate-100 pt-3">
          <Contatos p={p} />
        </div>
      </div>
    </div>
  )
}

function LayoutLoja({ p }) {
  const c1 = p.cor_primaria, c2 = p.cor_secundaria
  const tinta = sobre(c1)
  return (
    <div className="overflow-hidden rounded-3xl p-6 text-center shadow-sm" style={{ background: `linear-gradient(160deg, ${c1}, ${c1}dd 60%, ${c2})`, color: tinta }}>
      <Logo p={p} tamanho="h-24 w-24" className="mx-auto shadow-lg" />
      <p className="mt-4 text-2xl font-black leading-tight">{p.nome}</p>
      {p.promo_titulo && <p className="mt-2 text-lg font-semibold leading-snug opacity-95">{p.promo_titulo}</p>}
      {p.promo_descricao && <p className="mt-1 text-base leading-relaxed opacity-90">{p.promo_descricao}</p>}
      {p.imagens?.[0] && (
        <div className="mt-4 aspect-[16/9] overflow-hidden rounded-2xl">
          <Foto src={p.imagens[0]} cor={c2} />
        </div>
      )}
      <div className="mt-5 rounded-2xl bg-white/95 p-4 text-left">
        <Contatos p={p} grande />
        {!p.whatsapp && !p.telefone && !p.endereco && !p.instagram && !p.site && <p className="text-center text-base text-slate-500">Cadastre telefone, endereço…</p>}
      </div>
    </div>
  )
}

function LayoutRelampago({ p }) {
  const c1 = p.cor_primaria, c2 = p.cor_secundaria
  return (
    <div className="relative overflow-hidden rounded-3xl p-6 shadow-sm" style={{ background: c2, color: sobre(c2) }}>
      <div className="absolute -right-16 -top-10 h-48 w-72 rotate-12" style={{ background: c1, opacity: 0.9 }} />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black uppercase tracking-widest" style={{ background: c1, color: sobre(c1) }}>
          <Zap size={16} fill="currentColor" /> Oferta relâmpago
        </p>
        {p.promo_titulo && <p className="mt-4 text-3xl font-black uppercase leading-none">{p.promo_titulo}</p>}
        <div className="mt-4">
          <Precos p={p} grande />
        </div>
        {p.promo_descricao && <p className="mt-3 text-base font-medium leading-relaxed">{p.promo_descricao}</p>}
        {p.imagens?.[0] && (
          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl ring-4 ring-white/70">
            <Foto src={p.imagens[0]} cor={c1} />
          </div>
        )}
        {p.validade && <p className="mt-4 rounded-xl bg-black/80 px-4 py-2 text-center text-base font-bold text-white">{p.validade}</p>}
        <div className="mt-5 flex items-center gap-3">
          <Logo p={p} tamanho="h-12 w-12" className="shadow" />
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight">{p.nome}</p>
            <p className="truncate text-sm font-semibold opacity-80">{p.whatsapp || p.telefone || p.endereco}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function LayoutVitrine({ p }) {
  const c1 = p.cor_primaria
  const [a, b, c] = [0, 1, 2].map((i) => p.imagens?.[i])
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: c1, color: sobre(c1) }}>
        <Logo p={p} tamanho="h-11 w-11" />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold leading-tight">{p.nome}</p>
          {p.validade && <p className="truncate text-sm opacity-90">{p.validade}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-1.5">
        <div className="col-span-2 aspect-[16/9] overflow-hidden rounded-2xl">
          <Foto src={a} cor={c1} />
        </div>
        <div className="aspect-square overflow-hidden rounded-2xl">
          <Foto src={b} cor={c1} />
        </div>
        <div className="aspect-square overflow-hidden rounded-2xl">
          <Foto src={c} cor={c1} />
        </div>
      </div>
      <div className="space-y-2 px-5 pb-5 pt-3">
        {p.promo_titulo && <p className="text-2xl font-extrabold leading-snug text-slate-900">{p.promo_titulo}</p>}
        {p.promo_descricao && <p className="text-base leading-relaxed text-slate-700">{p.promo_descricao}</p>}
        <div className="text-slate-900">
          <Precos p={p} cor={c1} />
        </div>
        <div className="border-t border-slate-100 pt-3">
          <Contatos p={p} />
        </div>
      </div>
    </div>
  )
}

const LAYOUT_COMPONENTE = { oferta: LayoutOferta, loja: LayoutLoja, relampago: LayoutRelampago, vitrine: LayoutVitrine }

/* ---------- anúncio simples (logo + frase) ---------- */

function AnuncioSimples({ p }) {
  const cor = CORES[p.cor] ?? CORES.amber
  return (
    <div className="rounded-3xl bg-white p-6 text-center ring-2 ring-slate-200">
      {p.logo_url ? (
        <img src={p.logo_url} alt={p.nome} className="mx-auto h-24 max-w-[75%] object-contain" />
      ) : (
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${cor.fundo} ${cor.texto}`}>
          <Icone nome={p.icone} size={34} />
        </div>
      )}
      <p className={`mt-4 text-xl font-extrabold uppercase ${cor.titulo}`}>{p.nome}</p>
      {p.slogan && <p className="mt-3 text-2xl font-extrabold leading-snug text-slate-900">{p.slogan}</p>}
      {p.descricao && <p className="mt-3 text-lg leading-relaxed text-slate-700">{p.descricao}</p>}
    </div>
  )
}

/** A peça do anúncio, conforme o tipo cadastrado. */
export function PecaAnuncio({ p, comSom = false, tocar = true, aoTerminarVideo }) {
  if (!p) return <Aviso texto="Espaço publicitário disponível" />
  if (p.tipo === 'video') return <VideoYouTube key={p.video_url} url={p.video_url} vertical={p.video_vertical} comSom={comSom} tocar={tocar} aoTerminar={aoTerminarVideo} />
  if (p.tipo === 'automatico') {
    const L = LAYOUT_COMPONENTE[p.layout] ?? LayoutOferta
    return <L p={p} />
  }
  return <AnuncioSimples p={p} />
}
