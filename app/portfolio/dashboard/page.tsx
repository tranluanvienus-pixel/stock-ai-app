'use client'
import { useState, useEffect } from 'react'

const USER_ID = 'vien_default'

export default function Dashboard() {
  const [holdings, setHoldings] = useState<any[]>([])
  const [newSymbol, setNewSymbol] = useState('')
  const [newShares, setNewShares] = useState('')
  const [newCost, setNewCost] = useState('')
  const [evalSymbol, setEvalSymbol] = useState('')
  const [evalResult, setEvalResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const loadHoldings = () => {
    fetch(`/api/portfolio/holdings?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setHoldings(d.holdings || []))
  }

  useEffect(() => { loadHoldings() }, [])

  const addHolding = async () => {
    if (!newSymbol || !newShares || !newCost) return
    setStatus('Đang thêm...')
    await fetch('/api/portfolio/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        symbol: newSymbol,
        shares: Number(newShares),
        avg_cost: Number(newCost),
      }),
    })
    setNewSymbol(''); setNewShares(''); setNewCost('')
    setStatus('Đã thêm!')
    loadHoldings()
  }

  const removeHolding = async (id: string) => {
    await fetch(`/api/portfolio/holdings?holding_id=${id}`, { method: 'DELETE' })
    loadHoldings()
  }

  const runEvaluation = async () => {
    if (!evalSymbol) return
    setLoading(true)
    setEvalResult(null)
    try {
      const res = await fetch(`/api/portfolio/recommend?symbol=${evalSymbol}&user_id=${USER_ID}`)
      const data = await res.json()
      setEvalResult(data)
    } catch {
      setEvalResult({ error: 'Lỗi khi đánh giá' })
    }
    setLoading(false)
  }

  const recLabel: Record<string, { text: string; color: string }> = {
    buy_more: { text: 'MUA THÊM', color: '#3DDC97' },
    trim: { text: 'CHỐT LỜI MỘT PHẦN', color: '#F2B84B' },
    sell_all: { text: 'BÁN HẲN', color: '#FF6B6B' },
    watch: { text: 'THEO DÕI', color: '#8891A6' },
    hold: { text: 'GIỮ NGUYÊN', color: '#6C8CFF' },
  }

  return (
    <div style={{ maxWidth: 800, margin: '30px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Dashboard danh mục</h1>

      <div style={{ marginBottom: 10 }}>
        <a href="/portfolio/setup" style={{ color: '#6C8CFF' }}>← Chỉnh sửa hồ sơ đầu tư</a>
      </div>

      <h2 style={{ marginTop: 30 }}>Danh mục đang giữ</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Mã</th><th>Số cổ phiếu</th><th>Giá vốn</th><th></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.holding_id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{h.symbol}</td>
              <td>{h.shares}</td>
              <td>${h.avg_cost}</td>
              <td><button onClick={() => removeHolding(h.holding_id)}>Xóa</button></td>
            </tr>
          ))}
          {holdings.length === 0 && <tr><td colSpan={4}>Chưa có mã nào</td></tr>}
        </tbody>
      </table>

      <h3>Thêm mã mới vào danh mục</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Mã (VD: MSFT)" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} style={{ padding: 8 }} />
        <input placeholder="Số cổ phiếu" type="number" value={newShares} onChange={(e) => setNewShares(e.target.value)} style={{ padding: 8 }} />
        <input placeholder="Giá vốn" type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} style={{ padding: 8 }} />
        <button onClick={addHolding} style={{ padding: '8px 16px' }}>Thêm</button>
      </div>
      {status && <p>{status}</p>}

      <h2 style={{ marginTop: 40 }}>Đánh giá một mã cổ phiếu</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input placeholder="Nhập mã (VD: MSFT, IREN)" value={evalSymbol} onChange={(e) => setEvalSymbol(e.target.value.toUpperCase())} style={{ padding: 8, flex: 1 }} />
        <button onClick={runEvaluation} style={{ padding: '8px 16px' }} disabled={loading}>
          {loading ? 'Đang phân tích...' : 'Đánh giá'}
        </button>
      </div>

      {evalResult && !evalResult.error && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{evalResult.symbol}</h3>
            <span style={{
              padding: '4px 12px', borderRadius: 6, color: 'white', fontWeight: 'bold',
              background: recLabel[evalResult.recommendation]?.color || '#888'
            }}>
              {recLabel[evalResult.recommendation]?.text || evalResult.recommendation}
            </span>
          </div>
          <p>Giá hiện tại: ${evalResult.raw_price} · Score: {evalResult.score_total}/100 · Confidence: {evalResult.confidence_score}/100 · Vai trò: {evalResult.portfolio_role}</p>

          {evalResult.explanation && (
            <div style={{ marginTop: 16 }}>
              <p><b>Tại sao:</b> {evalResult.explanation.why}</p>
              <p><b>Thay đổi gì:</b> {evalResult.explanation.what_changed}</p>
              <p><b>Còn phù hợp mục tiêu không:</b> {evalResult.explanation.still_fits_goal}</p>
            </div>
          )}
        </div>
      )}
      {evalResult?.error && <p style={{ color: 'red' }}>{evalResult.error}</p>}
    </div>
  )
}