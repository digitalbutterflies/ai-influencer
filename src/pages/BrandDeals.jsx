import { useState, useRef } from 'react'
import { useBrandDeals, generateId } from '../store'
import { compressImage } from '../utils/imageUtils'
import Lightbox from '../components/Lightbox'

function downloadImage(src, filename) {
  const a = document.createElement('a')
  a.href = src
  a.download = filename
  a.click()
}

function NewDealModal({ onClose, onSave }) {
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [image, setImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(setImage)
    r.readAsDataURL(f)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(setImage)
    r.readAsDataURL(f)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 20,
        padding: 32, width: 380, boxShadow: 'var(--shadow-lg)',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 20 }}>New Brand Deal</h2>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Brand Name</div>
          <input
            autoFocus
            value={brand}
            onChange={e => setBrand(e.target.value)}
            placeholder="e.g. Nike"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-primary)' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Category</div>
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Fitness, Beauty, Tech..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 14, color: 'var(--text-primary)' }}
          />
        </label>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Brand Image</div>
          <div
            onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              width: '100%', aspectRatio: '16/9',
              borderRadius: 10,
              border: image ? 'none' : `1.5px dashed ${dragging ? '#8B5CF6' : 'var(--border)'}`,
              background: image ? 'transparent' : dragging ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6,
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {image
              ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <>
                  <span style={{ fontSize: 22, opacity: dragging ? 0.6 : 0.25 }}>+</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{dragging ? 'Drop to upload' : 'Upload or drag & drop'}</span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent' }}>Cancel</button>
          <button
            disabled={!brand.trim()}
            onClick={() => onSave({ brand, category, image })}
            style={{
              flex: 1, padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: brand.trim() ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--border)',
              color: brand.trim() ? '#fff' : 'var(--text-tertiary)',
              boxShadow: brand.trim() ? '0 2px 12px rgba(139,92,246,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
          >Add Deal</button>
        </div>
      </div>
    </div>
  )
}

function DealCard({ deal, onDelete, onOpen, onRename }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(deal.brand)

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed) onRename(deal.id, trimmed)
    else setName(deal.brand)
    setEditing(false)
  }

  return (
    <div
      onClick={() => !editing && deal.image && onOpen()}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-subtle)',
        transition: 'box-shadow 0.18s, transform 0.18s',
        cursor: deal.image && !editing ? 'zoom-in' : 'default',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ aspectRatio: '16/9', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        {deal.image
          ? <img src={deal.image} alt={deal.brand} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-tertiary)', opacity: 0.3 }}>{deal.brand[0]}</span>
            </div>
        }
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(deal.brand); setEditing(false) } }}
              style={{ fontSize: 15, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none', width: '100%' }}
            />
          ) : (
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.brand}</div>
          )}
          {deal.category && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{deal.category}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            title="Rename"
            onClick={() => setEditing(true)}
            style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
          >Rename</button>
          {deal.image && (
            <button
              title="Download"
              onClick={() => downloadImage(deal.image, `${deal.brand}.jpg`)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >↓</button>
          )}
          <button
            onClick={() => onDelete(deal.id)}
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>
      </div>
    </div>
  )
}

export default function BrandDeals() {
  const [deals, setDeals] = useBrandDeals()
  const [showNew, setShowNew] = useState(false)
  const [lightboxDeal, setLightboxDeal] = useState(null)

  function addDeal({ brand, category, image }) {
    setDeals(prev => [...prev, { id: generateId(), brand, category, image, createdAt: Date.now() }])
    setShowNew(false)
  }

  function deleteDeal(id) {
    const deal = deals.find(d => d.id === id)
    if (!deal) return
    if (!window.confirm(`Delete "${deal.brand}"?`)) return
    setDeals(prev => prev.filter(d => d.id !== id))
  }

  function renameDeal(id, brand) {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, brand } : d))
  }

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      {showNew && <NewDealModal onClose={() => setShowNew(false)} onSave={addDeal} />}

      {lightboxDeal && (
        <Lightbox
          images={[lightboxDeal.image]}
          startIndex={0}
          onClose={() => setLightboxDeal(null)}
        />
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px' }}>Brand Deals</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              {deals.length} deal{deals.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{
              padding: '9px 20px', borderRadius: 980,
              background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
              fontSize: 14, fontWeight: 600,
              boxShadow: '0 2px 12px rgba(139,92,246,0.3)',
            }}
          >+ New Deal</button>
        </div>

        {deals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
            <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>No brand deals yet</p>
            <p style={{ fontSize: 13 }}>Add brands you want to promote with your influencers</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {deals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                onDelete={deleteDeal}
                onRename={renameDeal}
                onOpen={() => setLightboxDeal(deal)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
