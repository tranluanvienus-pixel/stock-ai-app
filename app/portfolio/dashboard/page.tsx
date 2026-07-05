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
  const [regime, setRegime] = useState<any>(null)
  const [regimeLoading, setRegimeLoading] = useState(false)

  const loadRegime = () => {
    setRegimeLoading(true)
    fetch('/api/market-regime')
      .then((r) => r.json())
      .then((d) => setRegime(d))
      .catch(() => setRegime({ error: 'Lỗi khi tải Market Regime' }))
      .finally(() => setRegimeLoading(false))
  }

  const [health, setHealth] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadHealth = () => {
    setHealthLoading(true)
    fetch(`/api/portfolio/health?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ error: 'Lỗi khi tải Health Score' }))
      .finally(() => setHealthLoading(false))
  }
  const [rebalance, setRebalance] = useState<any>(null)
  const [rebalanceLoading, setRebalanceLoading] = useState(false)

  const loadRebalance = () => {
    setRebalanceLoading(true)
    fetch(`/api/portfolio/rebalance?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setRebalance(d))
      .catch(() => setRebalance({ error: 'Lỗi khi tải Rebalance' }))
      .finally(() => setRebalanceLoading(false))
  }
  const [deployCash, setDeployCash] = useState<any>(null)
  const [deployLoading, setDeployLoading] = useState(false)

  const [cashAmount, setCashAmount] = useState('10000')

  const loadDeployCash = () => {
    setDeployLoading(true)
    fetch(`/api/portfolio/deploy-cash?user_id=${USER_ID}&amount=${cashAmount}`)
      .then((r) => r.json())
      .then((d) => setDeployCash(d))
      .catch(() => setDeployCash({ error: 'Lỗi khi tải Deploy Cash' }))
      .finally(() => setDeployLoading(false))
  }
  const [watchlist, setWatchlist] = useState<any>(null)
  const [watchlistLoading, setWatchlistLoading] = useState(false)

  const loadWatchlist = () => {
    setWatchlistLoading(true)
    fetch(`/api/portfolio/watchlist?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setWatchlist(d))
      .catch(() => setWatchlist({ error: 'Lỗi khi tải Watchlist' }))
      .finally(() => setWatchlistLoading(false))
  }

  const loadHoldings = () => {
    fetch(`/api/portfolio/holdings?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setHoldings(d.holdings || []))
  }

  useEffect(() => { loadHoldings(); loadRegime(); loadHealth(); loadRebalance(); loadDeployCash(); loadWatchlist() }, [])
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
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 20, background: '#f7f9fc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>📊 Chế độ thị trường (Market Regime)</h3>
          <button onClick={loadRegime} style={{ padding: '4px 10px' }}>🔄</button>
        </div>
        {regimeLoading && <p>Đang tải...</p>}
        {regime && !regime.error && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 18, fontWeight: 'bold' }}>
              {regime.regime || regime.marketRegime || 'N/A'}
            </p>
           <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 8 }}>
              <span>Score: <b>{regime.score}</b>/100</span>
              <span>Độ tin cậy: <b>{regime.confidence}</b>%</span>
              {regime.signals?.vix != null && <span>VIX: <b>{regime.signals.vix.toFixed(1)}</b></span>}
              {regime.signals?.fearGreedValue != null && (
                <span>Fear & Greed: <b>{regime.signals.fearGreedValue}</b> ({regime.signals.fearGreedLabel})</span>
              )}
            </div>
            {regime.reasonCodes && regime.reasonCodes.length > 0 && (
              <ul style={{ margin: '8px 0', paddingLeft: 20, fontSize: 13, color: '#333' }}>
                {regime.reasonCodes.map((reason: string, i: number) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <summary>Xem dữ liệu thô (debug)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(regime, null, 2)}</pre>
            </details>
          </div>
        )}
        {regime?.error && <p style={{ color: 'red' }}>{regime.error}</p>}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 20, background: '#f7f9fc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>💊 Sức khỏe danh mục (Health Score)</h3>
          <button onClick={loadHealth} style={{ padding: '4px 10px' }}>🔄</button>
        </div>
        {healthLoading && <p>Đang tải...</p>}
        {health && !health.error && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 18, fontWeight: 'bold' }}>
              Điểm sức khỏe: {health.healthScore}/100 — <span style={{ color: health.grade === 'POOR' ? '#FF6B6B' : health.grade === 'GOOD' ? '#3DDC97' : '#F2B84B' }}>{health.grade}</span>
            </p>
            {health.breakdown && (
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 8, flexWrap: 'wrap' }}>
                <span>Chất lượng: <b>{health.breakdown.qualityScore}</b></span>
                <span>Đa dạng hóa: <b>{health.breakdown.diversificationScore}</b></span>
                <span>Độ tin cậy: <b>{health.breakdown.confidenceScore}</b></span>
                <span>Khớp thị trường: <b>{health.breakdown.regimeAlignmentScore}</b></span>
              </div>
            )}
            {health.concentrationWarnings && health.concentrationWarnings.length > 0 && (
              <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                {health.concentrationWarnings.map((w: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, color: '#856404' }}>⚠️ {w}</div>
                ))}
              </div>
            )}
            {health.reasonCodes && health.reasonCodes.length > 0 && (
              <ul style={{ margin: '8px 0', paddingLeft: 20, fontSize: 13, color: '#333' }}>
                {health.reasonCodes.map((reason: string, i: number) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <summary>Xem dữ liệu thô (debug)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(health, null, 2)}</pre>
            </details>
          </div>
        )}
        {health?.error && <p style={{ color: 'red' }}>{health.error}</p>}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 20, background: '#f7f9fc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>⚖️ Đề xuất cân bằng lại (Rebalance)</h3>
          <button onClick={loadRebalance} style={{ padding: '4px 10px' }}>🔄</button>
        </div>
        {rebalanceLoading && <p>Đang tải...</p>}
        {rebalance && !rebalance.error && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 10 }}>
              <span>Tổng giá trị: <b>${rebalance.totalPortfolioValueUsd?.toLocaleString()}</b></span>
              <span>Mua: <b style={{ color: '#3DDC97' }}>{rebalance.summary?.buyCount}</b></span>
              <span>Bán: <b style={{ color: '#F2B84B' }}>{rebalance.summary?.sellCount}</b></span>
              <span>Thoát hẳn: <b style={{ color: '#FF6B6B' }}>{rebalance.summary?.exitCount}</b></span>
              <span>Giữ nguyên: <b style={{ color: '#6C8CFF' }}>{rebalance.summary?.holdCount}</b></span>
            </div>
            {rebalance.recommendations && rebalance.recommendations.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th>Mã</th><th>Hành động</th><th>Hiện tại</th><th>Mục tiêu</th><th>Điểm</th><th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalance.recommendations.map((r: any, i: number) => {
                    const actionColor: Record<string, string> = {
                      EXIT_FULLY: '#FF6B6B', SELL: '#F2B84B', BUY: '#3DDC97', HOLD: '#6C8CFF',
                    }
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                        <td><b>{r.symbol}</b></td>
                        <td style={{ color: actionColor[r.action] || '#333', fontWeight: 'bold' }}>{r.action}</td>
                        <td>{r.currentShares} cp ({r.currentWeightPct}%)</td>
                        <td>{r.targetShares} cp ({r.targetWeightPct}%)</td>
                        <td>{r.scoreTotal}</td>
                        <td style={{ fontSize: 12, color: '#666' }}>{r.reason}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {rebalance.reasonCodes && rebalance.reasonCodes.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: '#333' }}>
                {rebalance.reasonCodes.map((reason: string, i: number) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <summary>Xem dữ liệu thô (debug)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(rebalance, null, 2)}</pre>
            </details>
          </div>
        )}
        {rebalance?.error && <p style={{ color: 'red' }}>{rebalance.error}</p>}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 20, background: '#f7f9fc' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>💰 Triển khai tiền mặt mới (Deploy Cash)</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Số tiền: $</span>
            <input
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              style={{ width: 90, padding: 4 }}
            />
            <button onClick={loadDeployCash} style={{ padding: '4px 10px' }}>Tính</button>
          </div>
        </div> 
        {deployLoading && <p>Đang tải...</p>}
        {deployCash && !deployCash.error && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 10, flexWrap: 'wrap' }}>
              <span>Tiền mới: <b>${deployCash.newCashUsd?.toLocaleString()}</b></span>
              <span>Đã triển khai: <b style={{ color: '#3DDC97' }}>${deployCash.totalDeployedUsd?.toLocaleString()}</b></span>
              <span>Còn lại: <b style={{ color: '#F2B84B' }}>${deployCash.leftoverCashUsd?.toLocaleString()}</b></span>
              <span>Tổng danh mục sau: <b>${deployCash.totalPortfolioValueAfterUsd?.toLocaleString()}</b></span>
            </div>
            {deployCash.recommendations && deployCash.recommendations.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                    <th>Mã</th><th>Số tiền mua thêm</th><th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {deployCash.recommendations.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td><b>{r.symbol}</b></td>
                      <td>${r.amountUsd?.toLocaleString?.() ?? r.amountUsd}</td>
                      <td style={{ fontSize: 12, color: '#666' }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>Không có đề xuất mua mã nào lúc này.</p>
            )}
            {deployCash.reasonCodes && deployCash.reasonCodes.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: '#333' }}>
                {deployCash.reasonCodes.map((reason: string, i: number) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <summary>Xem dữ liệu thô (debug)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(deployCash, null, 2)}</pre>
            </details>
          </div>
        )}
        {deployCash?.error && <p style={{ color: 'red' }}>{deployCash.error}</p>}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 20, background: '#f7f9fc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>👁️ Danh sách theo dõi (Watchlist Engine)</h3>
          <button onClick={loadWatchlist} style={{ padding: '4px 10px' }}>🔄</button>
        </div>
        {watchlistLoading && <p>Đang tải...</p>}
        {watchlist && !watchlist.error && (
          <div style={{ marginTop: 10 }}>
            {watchlist.summary && (
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 10, flexWrap: 'wrap' }}>
                <span>Momentum: <b style={{ color: '#3DDC97' }}>{watchlist.summary.momentumPickCount}</b></span>
                <span>Cơ hội giá trị: <b style={{ color: '#6C8CFF' }}>{watchlist.summary.valueOpportunityCount}</b></span>
                <span>Quá đà (cẩn thận): <b style={{ color: '#FF6B6B' }}>{watchlist.summary.overextendedCautionCount}</b></span>
                <span>Trung lập: <b style={{ color: '#8891A6' }}>{watchlist.summary.neutralCount}</b></span>
              </div>
            )}
            {watchlist.stocks && watchlist.stocks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {watchlist.stocks.map((s: any, i: number) => {
                  const labelColor: Record<string, string> = {
                    MOMENTUM_PICK: '#3DDC97', VALUE_OPPORTUNITY: '#6C8CFF',
                    OVEREXTENDED_CAUTION: '#FF6B6B', NEUTRAL: '#8891A6',
                  }
                  return (
                    <div key={i} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><b>{s.symbol}</b> — ${s.currentPrice}</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {s.labels?.map((l: string, j: number) => (
                            <span key={j} style={{ fontSize: 11, fontWeight: 'bold', color: 'white', background: labelColor[l] || '#888', padding: '2px 8px', borderRadius: 10 }}>{l}</span>
                          ))}
                          <span style={{ fontSize: 13, color: '#555' }}>Điểm: {s.scoreTotal}</span>
                        </div>
                      </div>
                      {s.note && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{s.note}</div>}
                      {s.reasonCodes && s.reasonCodes.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#777' }}>
                          {s.reasonCodes.map((r: string, j: number) => <li key={j}>{r}</li>)}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              <summary>Xem dữ liệu thô (debug)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(watchlist, null, 2)}</pre>
            </details>
          </div>
        )}
        {watchlist?.error && <p style={{ color: 'red' }}>{watchlist.error}</p>}
      </div>

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