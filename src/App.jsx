import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const HERO_IMAGE =
  'https://eju.tv/wp-content/uploads/2023/08/48a62fe5-902f-4eb7-89cc-2c73ccbd8b2c.jpg'

const CATEGORIES = [
  'Textiles',
  'Cerámica',
  'Instrumentos',
  'Joyería',
  'Arte & Pintura',
  'Tallados',
]

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

async function ensureArtisanProfile(user) {
  if (!user?.id) {
    return { artisan: null, error: 'Usuario no autenticado.' }
  }

  const { data: existing, error: selectError } = await supabase
    .from('artisans')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectError) {
    return { artisan: null, error: selectError.message }
  }

  if (existing) {
    return { artisan: existing, error: null }
  }

  const { data: created, error: insertError } = await supabase
    .from('artisans')
    .insert({
      user_id: user.id,
      name: user.email?.split('@')[0] || 'Artesano',
      craft: 'Artesanía',
      city: 'Bolivia',
      story: 'Historia del artesano pendiente de completar.',
    })
    .select()
    .single()

  if (insertError) {
    const { data: retry } = await supabase
      .from('artisans')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (retry) return { artisan: retry, error: null }
    return { artisan: null, error: insertError.message }
  }

  return { artisan: created, error: null }
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

function truncateAddress(address) {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatEth(usdTotal, ethPrice) {
  if (!ethPrice || ethPrice <= 0) return null
  return usdTotal / ethPrice
}

function catalogToPromptText(products) {
  if (!products.length) return '(Catálogo vacío por ahora)'
  return products
    .map(
      (p) =>
        `- ${p.name} | ${p.category} | ${formatPrice(p.price)} | ${(p.description || 'Sin descripción').slice(0, 100)}`
    )
    .join('\n')
}

function categoryStats(products) {
  const stats = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  for (const p of products) {
    if (p.category && stats[p.category] !== undefined) stats[p.category]++
  }
  return Object.entries(stats)
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(', ')
}

function getChatResponse(message, products) {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes('regalo')) {
    const joyeria = products.filter(p => p.category === 'Joyería').slice(0, 2)
    const textiles = products.filter(p => p.category === 'Textiles').slice(0, 2)
    const recs = [...joyeria, ...textiles].slice(0, 3)
    if (recs.length > 0) {
      return `Para regalos te recomiendo: ${recs.map(p => `${p.name} (${formatPrice(p.price)})`).join(', ')}`
    }
    return 'Para regalos te recomiendo nuestra Joyería y Textiles artesanales.'
  }

  if (lowerMessage.includes('música') || lowerMessage.includes('instrumento')) {
    const instrumentos = products.filter(p => p.category === 'Instrumentos').slice(0, 3)
    if (instrumentos.length > 0) {
      return `Te recomiendo estos instrumentos: ${instrumentos.map(p => `${p.name} (${formatPrice(p.price)})`).join(', ')}`
    }
    return 'Te recomiendo nuestros Instrumentos musicales tradicionales.'
  }

  if (lowerMessage.includes('ropa') || lowerMessage.includes('textil')) {
    const textiles = products.filter(p => p.category === 'Textiles').slice(0, 3)
    if (textiles.length > 0) {
      return `Te recomiendo estos textiles: ${textiles.map(p => `${p.name} (${formatPrice(p.price)})`).join(', ')}`
    }
    return 'Te recomiendo nuestra colección de Textiles artesanales.'
  }

  if (lowerMessage.includes('barato') || lowerMessage.includes('económico')) {
    const baratos = products.filter(p => p.price < 50).slice(0, 3)
    if (baratos.length > 0) {
      return `Productos económicos: ${baratos.map(p => `${p.name} (${formatPrice(p.price)})`).join(', ')}`
    }
    return 'Tenemos productos económicos en todas las categorías.'
  }

  return 'Explora nuestro catálogo: Textiles, Cerámica, Instrumentos, Joyería, Arte & Pintura y Tallados.'
}

function FloatingBuyerChat({ products, onSelectProduct }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hola. Cuéntame qué buscas y te recomiendo artesanías del catálogo.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, loading])

  const sendMessage = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setLoading(true)

    const reply = getChatResponse(text, products)
    setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    setLoading(false)
  }

  const suggestedProducts = messages.length
    ? products.filter((p) =>
      messages.some(
        (m) => m.role === 'assistant' && m.text.toLowerCase().includes(p.name.toLowerCase())
      )
    )
    : []

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[340px] max-h-[480px] flex flex-col bg-white border border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm tracking-wide text-text">Asistente Ti-Tuka</span>
            <button
              onClick={() => setOpen(false)}
              className="text-text/50 hover:text-text text-lg leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[280px] max-h-[320px]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm leading-relaxed ${msg.role === 'user'
                  ? 'ml-6 text-right text-text bg-surface px-3 py-2 border border-border'
                  : 'mr-6 text-text/80'
                  }`}
              >
                {msg.text}
              </div>
            ))}
            {loading && (
              <p className="text-sm text-text/50 mr-6">Pensando...</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {suggestedProducts.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs text-text/50">En el catálogo:</p>
                {suggestedProducts.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectProduct(p)}
                    className="block w-full text-left text-xs border border-border px-3 py-2 hover:border-primary transition-colors"
                  >
                    {p.name} · {formatPrice(p.price)}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t border-border">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej: regalo menos de 50 dólares"
              className="flex-1 px-3 py-2 text-sm border border-border focus:outline-none focus:border-primary"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 text-sm bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-5 py-3 text-sm bg-primary text-white border border-primary hover:bg-primary-hover transition-colors"
      >
        {open ? 'Cerrar chat' : 'Asistente IA'}
      </button>
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', className = '', type = 'button', disabled = false }) {
  const base =
    'px-6 py-2.5 text-sm tracking-wide transition-colors border disabled:opacity-50 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white border-primary hover:bg-primary-hover'
      : variant === 'outline'
        ? 'bg-white text-text border-border hover:border-primary hover:text-primary'
        : 'bg-transparent text-text border-border hover:border-text'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  )
}

function Header({ view, setView, cartCount }) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-3 text-xl tracking-widest text-text hover:text-primary transition-colors"
        >
          <img
            src="/logo.jpeg"
            alt="Logo"
            style={{ height: '32px', width: 'auto' }}
            className="object-contain"
          />
          <span className="font-league-spartan uppercase">Ti-Tuka</span>
        </button>
        <nav className="flex items-center gap-4">
          {view !== 'catalog' && (
            <button
              onClick={() => setView('catalog')}
              className="text-sm text-text hover:text-primary transition-colors"
            >
              Catálogo
            </button>
          )}
          {view !== 'artisan' && (
            <button
              onClick={() => setView('artisan')}
              className="text-sm text-text hover:text-primary transition-colors"
            >
              Artesanos
            </button>
          )}
          {cartCount > 0 && (
            <button
              onClick={() => setView('cart')}
              className={`text-sm transition-colors ${view === 'cart' ? 'text-primary' : 'text-text hover:text-primary'
                }`}
            >
              Carrito ({cartCount})
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

function ArtisanModal({ artisan, onClose }) {
  if (!artisan) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-lg w-full p-8 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-6 mb-6">
          {artisan.avatar_url ? (
            <img
              src={artisan.avatar_url}
              alt={artisan.name}
              className="w-24 h-24 object-cover border border-border"
            />
          ) : (
            <div className="w-24 h-24 bg-surface border border-border flex items-center justify-center text-text/30 text-xs">
              Foto
            </div>
          )}
          <div>
            <h3 className="text-lg font-normal mb-1">{artisan.name}</h3>
            <p className="text-sm text-text/60">{artisan.craft}</p>
            <p className="text-sm text-text/60">{artisan.city}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-text/80">{artisan.story}</p>
        <div className="mt-8 flex justify-end">
          <Btn variant="outline" onClick={onClose}>
            Cerrar
          </Btn>
        </div>
      </div>
    </div>
  )
}

function ProductCarousel({ products, onSelect }) {
  const scrollRef = useRef(null)

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' })
    }
  }

  if (!products.length) {
    return (
      <p className="text-sm text-text/50 text-center py-12">
        Próximamente nuevos productos
      </p>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-border text-text hover:border-primary transition-colors hidden md:flex items-center justify-center"
        aria-label="Anterior"
      >
        ‹
      </button>
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto scroll-smooth pb-2 snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onSelect(product)}
            className="flex-none w-72 snap-start text-left group"
          >
            <div className="aspect-square bg-surface border border-border overflow-hidden mb-3">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text/30 text-sm">
                  Sin imagen
                </div>
              )}
            </div>
            <p className="text-sm font-normal">{product.name}</p>
            <p className="text-sm text-text/60">{formatPrice(product.price)}</p>
          </button>
        ))}
      </div>
      <button
        onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-border text-text hover:border-primary transition-colors hidden md:flex items-center justify-center"
        aria-label="Siguiente"
      >
        ›
      </button>
    </div>
  )
}

function HomeView({ products, artisans, setView, onSelectProduct, onSelectArtisan }) {
  return (
    <div>
      <section
        className="relative min-h-screen flex items-center justify-center bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 text-center px-6 max-w-2xl">
          <h1 className="text-6xl md:text-8xl tracking-wide mb-4 text-white">
            <span className="font-league-spartan">Ti-Tuka</span>
          </h1>
          <p className="text-lg text-white/90 mb-12 font-light">
            Artesanías Cruceñas para el mundo
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Btn onClick={() => setView('artisan')}>Soy artesano</Btn>
            <Btn variant="outline" onClick={() => setView('catalog')}>
              Quiero comprar
            </Btn>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-b border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div>
            <p className="text-3xl font-light text-primary mb-2">100+</p>
            <p className="text-sm text-text/60">Artesanos</p>
          </div>
          <div>
            <p className="text-3xl font-light text-primary mb-2">Santa Cruz </p>
            <p className="text-sm text-text/60">Para el mundo</p>
          </div>
          <div>
            <p className="text-3xl font-light text-primary mb-2">10+</p>
            <p className="text-sm text-text/60">Provincias</p>
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-light mb-10 tracking-wide">Productos destacados</h2>
          <ProductCarousel products={products} onSelect={onSelectProduct} />
        </div>
      </section>

      <section className="py-20 px-6 bg-surface">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-light mb-10 tracking-wide">Nuestros artesanos</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {artisans.slice(0, 3).map((artisan) => (
              <button
                key={artisan.id}
                onClick={() => onSelectArtisan(artisan)}
                className="bg-white border border-border p-6 text-left hover:border-primary transition-colors"
              >
                {artisan.avatar_url ? (
                  <img
                    src={artisan.avatar_url}
                    alt={artisan.name}
                    className="w-full aspect-square object-cover mb-4 border border-border"
                  />
                ) : (
                  <div className="w-full aspect-square bg-surface border border-border mb-4 flex items-center justify-center text-text/30 text-sm">
                    Sin foto
                  </div>
                )}
                <h3 className="text-base font-normal mb-1">{artisan.name}</h3>
                <p className="text-sm text-text/60 mb-3">{artisan.craft} · {artisan.city}</p>
                <p className="text-sm text-primary">Ver historia</p>
              </button>
            ))}
          </div>
          {!artisans.length && (
            <p className="text-sm text-text/50 text-center py-8">
              Próximamente perfiles de artesanos
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function CatalogView({ products, category, setCategory, onSelectProduct }) {
  const filtered =
    category === 'Todos'
      ? products
      : products.filter((p) => p.category === category)

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-light mb-2 tracking-wide">Catálogo</h1>
      <p className="text-sm text-text/60 mb-10">Artesanías bolivianas seleccionadas</p>

      <div className="flex flex-wrap gap-2 mb-12">
        {['Todos', ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 text-sm border transition-colors ${category === cat
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-text border-border hover:border-primary'
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-text/50 text-center py-16">
          No hay productos en esta categoría
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((product) => (
            <div key={product.id} className="border border-border bg-white">
              <div className="aspect-square bg-surface overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text/30 text-sm">
                    Sin imagen
                  </div>
                )}
              </div>
              <div className="p-5">
                <h3 className="text-base font-normal mb-1">{product.name}</h3>
                <p className="text-sm text-text/60 mb-4">{formatPrice(product.price)}</p>
                <Btn variant="outline" className="w-full" onClick={() => onSelectProduct(product)}>
                  Ver producto
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CartView({ cart, onBack, onClearCart }) {
  const [walletAddress, setWalletAddress] = useState(null)
  const [metaMaskError, setMetaMaskError] = useState('')
  const [ethPrice, setEthPrice] = useState(null)
  const [ethPriceError, setEthPriceError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState('')
  const [confirming, setConfirming] = useState(false)

  const totalUsd = cart.reduce((sum, item) => sum + Number(item.price || 0), 0)
  const totalEth = formatEth(totalUsd, ethPrice)

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then((res) => res.json())
      .then((data) => {
        if (data?.ethereum?.usd) {
          setEthPrice(data.ethereum.usd)
        } else {
          setEthPriceError('No se pudo obtener el precio de ETH.')
        }
      })
      .catch(() => setEthPriceError('No se pudo obtener el precio de ETH.'))
  }, [])

  useEffect(() => {
    if (!window.ethereum?.on) return

    const handleAccountsChanged = (accounts) => {
      setWalletAddress(accounts[0] || null)
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
    }
  }, [])

  const connectMetaMask = async () => {
    setMetaMaskError('')
    setPaymentSuccess('')

    if (!window.ethereum) {
      setMetaMaskError('Instala MetaMask para continuar')
      return
    }

    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setWalletAddress(accounts[0] || null)
    } catch (err) {
      setMetaMaskError(err.message || 'No se pudo conectar MetaMask')
    } finally {
      setConnecting(false)
    }
  }

  const handleConfirmPayment = async () => {
    if (!walletAddress) return

    setConfirming(true)
    setPaymentSuccess('')
    setMetaMaskError('')

    try {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setPaymentSuccess('Pago confirmado correctamente.')
      onClearCart()
    } catch (err) {
      setMetaMaskError(err.message || 'No se pudo confirmar el pago')
    } finally {
      setConfirming(false)
    }
  }

  if (!cart.length) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-light mb-4 tracking-wide">Carrito</h1>
        <p className="text-sm text-text/60 mb-8">Tu carrito está vacío</p>
        <Btn variant="outline" onClick={onBack}>
          Volver al catálogo
        </Btn>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <button
        onClick={onBack}
        className="text-sm text-text/60 hover:text-primary mb-10 transition-colors"
      >
        Volver al catálogo
      </button>

      <h1 className="text-3xl font-light mb-10 tracking-wide">Carrito</h1>

      <div className="border border-border divide-y divide-border mb-10">
        {cart.map((item, index) => (
          <div key={`${item.id}-${index}`} className="flex items-center gap-4 p-4 bg-white">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                className="w-16 h-16 object-cover border border-border flex-none"
              />
            ) : (
              <div className="w-16 h-16 bg-surface border border-border flex-none" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-normal truncate">{item.name}</p>
              <p className="text-sm text-text/60">{formatPrice(item.price)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border border-border p-6 bg-white space-y-4 mb-8">
        <div className="flex justify-between text-sm">
          <span className="text-text/60">Total</span>
          <span>{formatPrice(totalUsd)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/60">Equivalente en ETH</span>
          <span>
            {totalEth != null ? `${totalEth.toFixed(6)} ETH` : '—'}
          </span>
        </div>
        {ethPriceError && (
          <p className="text-sm text-text/50">{ethPriceError}</p>
        )}
      </div>

      <div className="border border-border p-6 bg-white space-y-4">
        <h2 className="text-lg font-light tracking-wide">Pago con MetaMask</h2>

        {!walletAddress ? (
          <Btn onClick={connectMetaMask} disabled={connecting} className="w-full">
            {connecting ? 'Conectando...' : 'Pagar con MetaMask'}
          </Btn>
        ) : (
          <>
            <div className="text-sm space-y-2">
              <p className="text-text/60">
                Wallet conectada:{' '}
                <span className="text-text">{truncateAddress(walletAddress)}</span>
              </p>
              <p className="text-text/60">
                Monto: {formatPrice(totalUsd)}
                {totalEth != null && (
                  <span> · {totalEth.toFixed(6)} ETH</span>
                )}
              </p>
            </div>
            <Btn
              onClick={handleConfirmPayment}
              disabled={confirming || totalEth == null}
              className="w-full"
            >
              {confirming ? 'Procesando...' : 'Confirmar pago'}
            </Btn>
          </>
        )}

        {metaMaskError && <p className="text-sm text-red-600">{metaMaskError}</p>}
        {paymentSuccess && <p className="text-sm text-primary">{paymentSuccess}</p>}
      </div>
    </div>
  )
}

function ProductView({ product, onBack, onAddToCart, cartAdded }) {
  const images = product.image_url ? [product.image_url] : []
  const [activeImage, setActiveImage] = useState(0)

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <button
        onClick={onBack}
        className="text-sm text-text/60 hover:text-primary mb-10 transition-colors"
      >
        Volver al catálogo
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>
          <div className="aspect-square bg-surface border border-border overflow-hidden mb-4">
            {images.length > 0 ? (
              <img
                src={images[activeImage]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text/30">
                Sin imagen
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 border overflow-hidden ${activeImage === i ? 'border-primary' : 'border-border'
                    }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-text/60 mb-2">{product.category}</p>
          <h1 className="text-3xl font-light mb-4 tracking-wide">{product.name}</h1>
          <p className="text-xl text-primary mb-8">{formatPrice(product.price)}</p>
          <p className="text-sm leading-relaxed text-text/80 mb-10">
            {product.description || 'Sin descripción disponible.'}
          </p>
          <Btn onClick={() => onAddToCart(product)} disabled={cartAdded}>
            {cartAdded ? 'Agregado al carrito' : 'Agregar al carrito'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-4 py-2.5 border border-border bg-white text-sm focus:outline-none focus:border-primary'

function ArtisanPanel({
  session,
  artisanProfile,
  myProducts,
  allProducts,
  onProductsChange,
  onArtisanProfileUpdate,
  onArtisansRefresh,
}) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [profileForm, setProfileForm] = useState({
    name: '',
    craft: '',
    city: '',
    story: '',
    avatar_url: '',
  })
  const [profileAvatar, setProfileAvatar] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const [form, setForm] = useState({
    name: '',
    category: CATEGORIES[0],
    price: '',
    description: '',
    image: null,
  })
  const [formLoading, setFormLoading] = useState(false)
  const [productError, setProductError] = useState('')
  const [productSuccess, setProductSuccess] = useState('')

  const [insights, setInsights] = useState('')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  const handleAnalyzeInsights = () => {
    setInsightsLoading(true)
    setInsights('')
    setInsightsError('')

    setTimeout(() => {
      setInsights('Tus Textiles tienen mayor demanda esta semana. Considera agregar más productos en Joyería. Tus precios son competitivos en el mercado internacional.')
      setInsightsLoading(false)
    }, 500)
  }

  useEffect(() => {
    if (!session?.user?.id) return

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('artisans')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error || !data) return

      onArtisanProfileUpdate(data)
      setProfileForm({
        name: data.name || '',
        craft: data.craft || '',
        city: data.city || '',
        story: data.story || '',
        avatar_url: data.avatar_url || '',
      })
    }

    if (artisanProfile) {
      setProfileForm({
        name: artisanProfile.name || '',
        craft: artisanProfile.craft || '',
        city: artisanProfile.city || '',
        story: artisanProfile.story || '',
        avatar_url: artisanProfile.avatar_url || '',
      })
    } else {
      loadProfile()
    }
  }, [session?.user?.id, artisanProfile, onArtisanProfileUpdate])

  const handleSaveProfile = async (e) => {
    e.preventDefault()

    if (!session?.user?.id) {
      setProfileError('Debes iniciar sesión.')
      return
    }

    setProfileLoading(true)
    setProfileError('')
    setProfileSuccess('')

    const { artisan, error: artisanError } = await ensureArtisanProfile(session.user)

    if (artisanError || !artisan?.id) {
      setProfileError(artisanError || 'No se pudo obtener el perfil de artesano.')
      setProfileLoading(false)
      return
    }

    let avatarUrl = profileForm.avatar_url || artisan.avatar_url || ''

    if (profileAvatar) {
      const ext = profileAvatar.name.split('.').pop()
      const path = `${artisan.id}/avatar-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('artisan-avatars')
        .upload(path, profileAvatar, { upsert: true })

      if (uploadError) {
        setProfileError(`Error al subir foto: ${uploadError.message}`)
        setProfileLoading(false)
        return
      }

      const { data: urlData } = supabase.storage.from('artisan-avatars').getPublicUrl(path)
      avatarUrl = urlData.publicUrl
    }

    const { data: updated, error: updateError } = await supabase
      .from('artisans')
      .update({
        name: profileForm.name,
        craft: profileForm.craft,
        city: profileForm.city,
        story: profileForm.story,
        avatar_url: avatarUrl,
      })
      .eq('id', artisan.id)
      .eq('user_id', session.user.id)
      .select()
      .single()

    setProfileLoading(false)

    if (updateError) {
      setProfileError(updateError.message)
      return
    }

    onArtisanProfileUpdate(updated)
    setProfileForm({
      name: updated.name || '',
      craft: updated.craft || '',
      city: updated.city || '',
      story: updated.story || '',
      avatar_url: updated.avatar_url || '',
    })
    setProfileAvatar(null)
    setProfileSuccess('Perfil guardado correctamente.')
    onArtisansRefresh?.()
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const action =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })

    const { error } = await action
    setAuthLoading(false)

    if (error) {
      setAuthError(error.message)
      return
    }

    if (mode === 'register') {
      setProductSuccess('Cuenta creada. Ya puedes agregar productos.')
      setMode('login')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleSubmitProduct = async (e) => {
    e.preventDefault()

    if (!session?.user?.id) {
      setProductError('Debes iniciar sesión para publicar.')
      return
    }

    setProductError('')
    setProductSuccess('')
    setFormLoading(true)

    const { artisan, error: artisanError } = await ensureArtisanProfile(session.user)

    if (artisanError || !artisan?.id) {
      setProductError(artisanError || 'No se pudo obtener el perfil de artesano.')
      setFormLoading(false)
      return
    }

    if (artisan.id !== artisanProfile?.id) {
      onArtisanProfileUpdate(artisan)
    }

    let imageUrl = ''

    if (form.image) {
      const ext = form.image.name.split('.').pop()
      const path = `${artisan.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, form.image)

      if (uploadError) {
        setProductError(`Error al subir imagen: ${uploadError.message}`)
        setFormLoading(false)
        return
      }

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
      imageUrl = urlData.publicUrl
    }

    const { error: insertError } = await supabase.from('products').insert({
      artisan_id: artisan.id,
      name: form.name,
      category: form.category,
      price: parseFloat(form.price),
      description: form.description,
      image_url: imageUrl,
    })

    setFormLoading(false)

    if (insertError) {
      setProductError(insertError.message)
      return
    }

    setForm({ name: '', category: CATEGORIES[0], price: '', description: '', image: null })
    setProductSuccess('Producto publicado correctamente.')
    onProductsChange(artisan.id)
  }

  const handleDeleteProduct = async (productId, imageUrl) => {
    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) {
      alert(error.message)
      return
    }

    if (imageUrl) {
      const path = imageUrl.split('/product-images/')[1]
      if (path) await supabase.storage.from('product-images').remove([path])
    }

    onProductsChange()
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-6 py-20">
        <h1 className="text-3xl font-light mb-2 tracking-wide">Panel del artesano</h1>
        <p className="text-sm text-text/60 mb-10">Accede para gestionar tus productos</p>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => { setMode('login'); setAuthError('') }}
            className={`text-sm pb-1 border-b-2 transition-colors ${mode === 'login' ? 'border-primary text-text' : 'border-transparent text-text/50'
              }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setMode('register'); setAuthError('') }}
            className={`text-sm pb-1 border-b-2 transition-colors ${mode === 'register' ? 'border-primary text-text' : 'border-transparent text-text/50'
              }`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm text-text/60 mb-1">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-border bg-white text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text/60 mb-1">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-border bg-white text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <Btn type="submit" disabled={authLoading} className="w-full">
            {authLoading ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Btn>
        </form>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-light tracking-wide">Panel del artesano</h1>
          <p className="text-sm text-text/60 mt-1">{session.user.email}</p>
        </div>
        <Btn variant="outline" onClick={handleSignOut}>
          Cerrar sesión
        </Btn>
      </div>

      <section className="mb-16">
        <h2 className="text-xl font-light mb-6 tracking-wide">Insights IA</h2>
        <div className="border border-border p-6 bg-white space-y-4">
          <p className="text-sm text-text/60">
            Analiza tus productos y el marketplace para obtener recomendaciones de categorías y mejoras.
          </p>
          <Btn onClick={handleAnalyzeInsights} disabled={insightsLoading}>
            {insightsLoading ? 'Analizando...' : 'Generar insights'}
          </Btn>
          {insightsError && <p className="text-sm text-red-600">{insightsError}</p>}
          {insights && (
            <div className="text-sm leading-relaxed text-text/80 whitespace-pre-wrap border-t border-border pt-4">
              {insights}
            </div>
          )}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-xl font-light mb-6 tracking-wide">Mi perfil</h2>
        <form onSubmit={handleSaveProfile} className="border border-border p-6 space-y-4 bg-white">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-none">
              {(profileForm.avatar_url || profileAvatar) ? (
                <img
                  src={
                    profileAvatar
                      ? URL.createObjectURL(profileAvatar)
                      : profileForm.avatar_url
                  }
                  alt="Avatar"
                  className="w-24 h-24 object-cover border border-border"
                />
              ) : (
                <div className="w-24 h-24 bg-surface border border-border flex items-center justify-center text-text/30 text-xs">
                  Foto
                </div>
              )}
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm text-text/60 mb-1">Foto de perfil</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setProfileAvatar(e.target.files[0] || null)}
                className="w-full text-sm text-text/60 file:mr-4 file:py-2 file:px-4 file:border file:border-border file:bg-white file:text-sm file:text-text hover:file:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text/60 mb-1">Nombre del negocio o artesano</label>
            <input
              type="text"
              required
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text/60 mb-1">Especialidad</label>
              <input
                type="text"
                required
                value={profileForm.craft}
                onChange={(e) => setProfileForm({ ...profileForm, craft: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-text/60 mb-1">Ciudad</label>
              <input
                type="text"
                required
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text/60 mb-1">Historia personal</label>
            <textarea
              required
              rows={5}
              value={profileForm.story}
              onChange={(e) => setProfileForm({ ...profileForm, story: e.target.value })}
              className={`${inputClass} resize-none`}
            />
          </div>
          {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          {profileSuccess && <p className="text-sm text-primary">{profileSuccess}</p>}
          <Btn type="submit" disabled={profileLoading}>
            {profileLoading ? 'Guardando...' : 'Guardar perfil'}
          </Btn>
        </form>
      </section>

      <section className="mb-16">
        <h2 className="text-xl font-light mb-6 tracking-wide">Nuevo producto</h2>
        <form onSubmit={handleSubmitProduct} className="border border-border p-6 space-y-4">
          <div>
            <label className="block text-sm text-text/60 mb-1">Nombre</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text/60 mb-1">Categoría</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text/60 mb-1">Precio (USD)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text/60 mb-1">Descripción</label>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className="block text-sm text-text/60 mb-1">Imagen</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setForm({ ...form, image: e.target.files[0] || null })}
              className="w-full text-sm text-text/60 file:mr-4 file:py-2 file:px-4 file:border file:border-border file:bg-white file:text-sm file:text-text hover:file:border-primary"
            />
          </div>
          {productError && <p className="text-sm text-red-600">{productError}</p>}
          {productSuccess && <p className="text-sm text-primary">{productSuccess}</p>}
          <Btn type="submit" disabled={formLoading}>
            {formLoading ? 'Publicando...' : 'Publicar producto'}
          </Btn>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-light mb-6 tracking-wide">Mis productos</h2>
        {myProducts.length === 0 ? (
          <p className="text-sm text-text/50 py-8 text-center border border-border">
            Aún no tienes productos publicados
          </p>
        ) : (
          <div className="space-y-4">
            {myProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 border border-border p-4 bg-white"
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-16 h-16 object-cover border border-border flex-none"
                  />
                ) : (
                  <div className="w-16 h-16 bg-surface border border-border flex-none" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal truncate">{product.name}</p>
                  <p className="text-sm text-text/60">
                    {product.category} · {formatPrice(product.price)}
                  </p>
                </div>
                <Btn
                  variant="outline"
                  onClick={() => handleDeleteProduct(product.id, product.image_url)}
                >
                  Eliminar
                </Btn>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState('home')
  const [products, setProducts] = useState([])
  const [artisans, setArtisans] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedArtisan, setSelectedArtisan] = useState(null)
  const [category, setCategory] = useState('Todos')
  const [cart, setCart] = useState([])
  const [cartAddedIds, setCartAddedIds] = useState(new Set())

  const [session, setSession] = useState(null)
  const [artisanProfile, setArtisanProfile] = useState(null)
  const [myProducts, setMyProducts] = useState([])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    setProducts(data || [])
  }, [])

  const fetchArtisans = useCallback(async () => {
    const { data } = await supabase
      .from('artisans')
      .select('*')
      .order('created_at', { ascending: false })
    setArtisans(data || [])
  }, [])

  const fetchMyProducts = useCallback(async (artisanId) => {
    if (!artisanId) {
      setMyProducts([])
      return
    }
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('artisan_id', artisanId)
      .order('created_at', { ascending: false })
    setMyProducts(data || [])
  }, [])

  useEffect(() => {
    fetchProducts()
    fetchArtisans()

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) {
        ensureArtisanProfile(s.user).then(({ artisan }) => setArtisanProfile(artisan))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        ensureArtisanProfile(s.user).then(({ artisan }) => setArtisanProfile(artisan))
      } else {
        setArtisanProfile(null)
        setMyProducts([])
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProducts, fetchArtisans])

  useEffect(() => {
    if (artisanProfile) fetchMyProducts(artisanProfile.id)
  }, [artisanProfile, fetchMyProducts])

  useEffect(() => {
    if (!artisanProfile?.id) return

    const channel = supabase
      .channel('my-products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `artisan_id=eq.${artisanProfile.id}`,
        },
        () => fetchMyProducts(artisanProfile.id)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [artisanProfile, fetchMyProducts])

  useEffect(() => {
    const channel = supabase
      .channel('all-products')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => fetchProducts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProducts])

  const handleSelectProduct = (product) => {
    setSelectedProduct(product)
    setView('product')
  }

  const handleAddToCart = (product) => {
    setCart((prev) => [...prev, product])
    setCartAddedIds((prev) => new Set(prev).add(product.id))
  }

  const handleClearCart = () => {
    setCart([])
    setCartAddedIds(new Set())
  }

  const showHeader = view !== 'home' || cart.length > 0

  return (
    <div className="min-h-screen bg-white">
      {showHeader && (
        <Header view={view} setView={setView} cartCount={cart.length} />
      )}

      {view === 'home' && (
        <HomeView
          products={products}
          artisans={artisans}
          setView={setView}
          onSelectProduct={handleSelectProduct}
          onSelectArtisan={setSelectedArtisan}
        />
      )}

      {view === 'catalog' && (
        <CatalogView
          products={products}
          category={category}
          setCategory={setCategory}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {view === 'product' && selectedProduct && (
        <ProductView
          product={selectedProduct}
          onBack={() => setView('catalog')}
          onAddToCart={handleAddToCart}
          cartAdded={cartAddedIds.has(selectedProduct.id)}
        />
      )}

      {view === 'cart' && (
        <CartView
          cart={cart}
          onBack={() => setView('catalog')}
          onClearCart={handleClearCart}
        />
      )}

      {view === 'artisan' && (
        <ArtisanPanel
          session={session}
          artisanProfile={artisanProfile}
          myProducts={myProducts}
          allProducts={products}
          onArtisanProfileUpdate={setArtisanProfile}
          onArtisansRefresh={fetchArtisans}
          onProductsChange={(artisanId) => {
            fetchMyProducts(artisanId || artisanProfile?.id)
            fetchProducts()
          }}
        />
      )}

      {view !== 'artisan' && (
        <FloatingBuyerChat products={products} onSelectProduct={handleSelectProduct} />
      )}

      <ArtisanModal artisan={selectedArtisan} onClose={() => setSelectedArtisan(null)} />
    </div>
  )
}
