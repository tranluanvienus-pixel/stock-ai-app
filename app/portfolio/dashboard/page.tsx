'use client'
import { useState, useEffect } from 'react'

const USER_ID = 'vien_default'

export default function Dashboard() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashboard_collapsed')
      if (saved) setCollapsed(JSON.parse(saved))
    } catch {}
  }, [])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('dashboard_collapsed', JSON.stringify(next)) } catch {}
      return next
    })
  }
  const [holdings, setHoldings] = useState<any[]>([])
  const [newSymbol, setNewSymbol] = useState('')
  const [newShares, setNewShares] = useState('')
  const [newCost, setNewCost] = useState('')
  const [evalSymbol, setEvalSymbol] = useState('')
  const [evalResult, setEvalResult] = useState<any>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
const [historyLoading, setHistoryLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [adjustShares, setAdjustShares] = useState<Record<string, number>>({})
  const [applyingId, setApplyingId] = useState<string | null>(null)
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
  const [alerts, setAlerts] = useState<any[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [editingCapital, setEditingCapital] = useState('')
  const [savingCapital, setSavingCapital] = useState(false)
  const [addFundsAmount, setAddFundsAmount] = useState('')
  const [addingFunds, setAddingFunds] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
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
  const loadProfile = () => {
    setProfileLoading(true)
    fetch(`/api/portfolio/profile?user_id=${USER_ID}`)
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile)
        setEditingCapital(d.profile?.capital_usd != null ? String(d.profile.capital_usd) : '')
      })
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false))
  }
  const loadAlerts = () => {
    setAlertsLoading(true)
    fetch(`/api/portfolio/alerts?user_id=${USER_ID}&limit=50`)
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false))
  }

  useEffect(() => { loadHoldings(); loadProfile(); loadAlerts(); loadRegime(); loadHealth(); loadRebalance(); loadDeployCash(); loadWatchlist() }, [])
  useEffect(() => {
    if (!profile) return
    const costBasis = holdings.reduce((sum, h) => sum + (h.avg_cost ?? 0) * (h.shares ?? 0), 0)
    const uninvested = (profile.capital_usd ?? 0) - costBasis
    if (uninvested > 0) {
      setCashAmount(String(Math.round(uninvested)))
    }
  }, [profile, holdings])

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

const applyShareChange = async (holdingId: string, newShares: number) => {
    setApplyingId(holdingId)
    await fetch('/api/portfolio/holdings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holding_id: holdingId, shares: newShares }),
    })
    setApplyingId(null)
    loadHoldings()
    loadRebalance()
  }
  const saveCapital = async () => {
    if (!profile || editingCapital === '') return
    setSavingCapital(true)
    setProfileStatus('')
    try {
      const res = await fetch('/api/portfolio/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          capital_usd: Number(editingCapital),
        }),
      })
      const data = await res.json()
      setProfile(data.profile)
      setProfileStatus('Đã cập nhật vốn ban đầu!')
      loadRebalance()
    } catch {
      setProfileStatus('Lỗi khi lưu vốn ban đầu')
    }
    setSavingCapital(false)
  }

  const addFunds = async () => {
    if (!addFundsAmount || Number(addFundsAmount) <= 0) return
    setAddingFunds(true)
    setProfileStatus('')
    try {
      const res = await fetch('/api/portfolio/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: USER_ID, amount: Number(addFundsAmount) }),
      })
      const data = await res.json()
      if (data.error) {
        setProfileStatus(`Lỗi: ${data.error}`)
      } else {
        setProfile(data.profile)
        setEditingCapital(String(data.profile.capital_usd))
        setAddFundsAmount('')
        setProfileStatus(`Đã nạp thêm $${data.added.toLocaleString()}!`)
        loadRebalance()
      }
    } catch {
      setProfileStatus('Lỗi khi nạp thêm tiền')
    }
    setAddingFunds(false)
  }
  const loadHistory = async () => {
    if (!evalSymbol) return
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/portfolio/history?symbol=${evalSymbol}&user_id=${USER_ID}`)
      const data = await res.json()
      setHistoryData(data.history || [])
    } catch {
      setHistoryData([])
    }
    setHistoryLoading(false)
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
    buy_more: { text: 'MUA THÊM', color: 'bg-green-600' },
    trim: { text: 'CHỐT LỜI MỘT PHẦN', color: 'bg-amber-500' },
    sell_all: { text: 'BÁN HẲN', color: 'bg-red-600' },
    watch: { text: 'THEO DÕI', color: 'bg-gray-600' },
    hold: { text: 'GIỮ NGUYÊN', color: 'bg-blue-600' },
  }

  const actionColor: Record<string, string> = {
    EXIT_FULLY: 'text-red-400 bg-red-950 border-red-900',
    SELL: 'text-amber-400 bg-amber-950 border-amber-900',
    BUY: 'text-green-400 bg-green-950 border-green-900',
    HOLD: 'text-blue-400 bg-blue-950 border-blue-900',
  }

  const watchLabelColor: Record<string, string> = {
    MOMENTUM_PICK: 'bg-green-600',
    VALUE_OPPORTUNITY: 'bg-blue-600',
    OVEREXTENDED_CAUTION: 'bg-red-600',
    NEUTRAL: 'bg-gray-600',
  }

  const Section = ({ icon, title, onRefresh, loading, error, children, sectionKey }: any) => {
  const isCollapsed = collapsed[sectionKey]
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
      <div className="flex justify-between items-center" style={{ marginBottom: isCollapsed ? 0 : '0.75rem' }}>
        <button onClick={() => toggleCollapse(sectionKey)} className="flex items-center gap-2 text-left flex-1">
          <span className={`text-xs transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▼</span>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>{icon}</span> {title}
          </h3>
        </button>
        {onRefresh && (
          <button onClick={onRefresh} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-sm">
            🔄
          </button>
        )}
      </div>
      {!isCollapsed && (
        <>
          {loading && <p className="text-sm text-gray-400">Đang tải...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {children}
        </>
      )}
    </div>
  )
}

  const StatPill = ({ label, value, color }: any) => (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm">
      <span className="text-gray-400">{label}: </span>
      <span className={`font-bold ${color || 'text-white'}`}>{value}</span>
    </div>
  )

  const DebugDetails = ({ data }: any) => (
    <details className="mt-3 text-sm text-gray-500">
      <summary className="cursor-pointer">Xem dữ liệu thô (debug)</summary>
      <pre className="whitespace-pre-wrap text-xs bg-gray-950 rounded-lg p-3 mt-2 overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>
    </details>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-3 font-sans">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-blue-400 mb-4">📊 Dashboard danh mục</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Vốn đầu tư & Lãi/Lỗ */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <h3 className="text-base font-semibold mb-3">💵 Vốn đầu tư</h3>
          {profileLoading && <p className="text-sm text-gray-400">Đang tải hồ sơ...</p>}
          {profile && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-gray-400">Vốn ban đầu: $</span>
                <input
                  type="number"
                  value={editingCapital}
                  onChange={(e) => setEditingCapital(e.target.value)}
                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
                />
                <button onClick={saveCapital} disabled={savingCapital} className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg px-3 py-1.5 text-sm font-medium">
                  {savingCapital ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-gray-400">Nạp thêm tiền: $</span>
                <input
                  type="number"
                  placeholder="VD: 5000"
                  value={addFundsAmount}
                  onChange={(e) => setAddFundsAmount(e.target.value)}
                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-500"
                />
                <button onClick={addFunds} disabled={addingFunds} className="bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg px-3 py-1.5 text-sm font-medium">
                  {addingFunds ? 'Đang nạp...' : '+ Nạp tiền'}
                </button>
              </div>
              {profileStatus && <p className="text-sm text-green-400 mb-3">{profileStatus}</p>}
              {rebalance && !rebalance.error && profile.capital_usd != null && (() => {
                const costBasis = holdings.reduce((sum, h) => sum + (h.avg_cost ?? 0) * (h.shares ?? 0), 0)
                const cashUninvested = profile.capital_usd - costBasis
                const holdingsPnl = (rebalance.totalPortfolioValueUsd ?? 0) - costBasis
                const holdingsPnlPct = costBasis > 0 ? (holdingsPnl / costBasis) * 100 : 0
                const isProfit = holdingsPnl >= 0
                return (
                  <div className="space-y-2">
                    <div className="rounded-lg p-3 border bg-gray-800 border-gray-700">
                      <div className="flex justify-between items-center flex-wrap gap-1">
                        <span className="text-sm text-gray-300">💰 Tiền mặt chưa đầu tư</span>
                        <span className={`font-bold text-base ${cashUninvested < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                          {cashUninvested.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD
                        </span>
                      </div>
                    </div>
                    <div className={`rounded-lg p-3 border ${isProfit ? 'bg-green-950 border-green-900' : 'bg-red-950 border-red-900'}`}>
                      <div className="flex justify-between items-center flex-wrap gap-1">
                        <span className="text-sm text-gray-300">📈 Lãi/Lỗ trên danh mục đang giữ</span>
                        <span className={`font-bold text-base ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{holdingsPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD ({isProfit ? '+' : ''}{holdingsPnlPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {/* Thông báo mới */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              🔔 Thông báo mới
              {alerts.filter((a) => !a.seen).length > 0 && (
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {alerts.filter((a) => !a.seen).length}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={loadAlerts} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-sm">🔄</button>
              <button onClick={() => toggleCollapse('alerts')} className="text-gray-400 hover:text-white text-sm">
                {collapsed['alerts'] ? '▶' : '▼'}
              </button>
            </div>
          </div>
          {!collapsed['alerts'] && (
            <>
              {alertsLoading && <p className="text-sm text-gray-400">Đang tải...</p>}
              {!alertsLoading && alerts.length === 0 && (
                <p className="text-sm text-gray-500 italic">Chưa có thông báo nào. Thông báo sẽ tự động cập nhật mỗi phiên giao dịch.</p>
              )}
              {alerts.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(showAllAlerts ? alerts : alerts.slice(0, 5)).map((a) => {
                    const actionColor: Record<string, string> = {
                      buy_more: 'text-green-400 bg-green-950 border-green-900',
                      trim: 'text-amber-400 bg-amber-950 border-amber-900',
                      sell_all: 'text-red-400 bg-red-950 border-red-900',
                      watch: 'text-gray-400 bg-gray-800 border-gray-700',
                      hold: 'text-blue-400 bg-blue-950 border-blue-900',
                    }
                    const actionLabel: Record<string, string> = {
                      buy_more: 'MUA THÊM',
                      trim: 'CHỐT LỜI',
                      sell_all: 'BÁN HẲN',
                      watch: 'THEO DÕI',
                      hold: 'GIỮ NGUYÊN',
                    }
                    return (
                      <div
                        key={a.alert_id}
                        onClick={async () => {
                          if (a.seen) return;
                          await fetch('/api/portfolio/alerts', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ alert_ids: [a.alert_id] }),
                          });
                          loadAlerts();
                        }}
                        className={`rounded-lg p-3 border cursor-pointer ${actionColor[a.recommendation] || 'bg-gray-800 border-gray-700 text-gray-300'} ${!a.seen ? 'ring-1 ring-blue-500' : ''}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-white">{a.symbol}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{actionLabel[a.recommendation] || a.recommendation}</span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await fetch(`/api/portfolio/alerts?alert_id=${a.alert_id}`, { method: 'DELETE' });
                                loadAlerts();
                              }}
                              className="text-gray-400 hover:text-red-400 text-sm"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-300 mb-1">
                          Giá: ${a.price_at_eval} · Điểm: {a.score_total} · Tin cậy: {a.confidence_score}%
                        </div>
                        {a.reasoning_text && <div className="text-sm text-gray-400 mb-1">{a.reasoning_text}</div>}
                        <div className="text-xs text-gray-500">{new Date(a.created_at).toLocaleString('vi-VN')}</div>
                      </div>
                    )
                  })}
                  {alerts.length > 5 && (
                    <button onClick={() => setShowAllAlerts(!showAllAlerts)} className="text-blue-400 hover:text-blue-300 text-sm">
                      {showAllAlerts ? 'Thu gọn' : `Xem thêm ${alerts.length - 5} thông báo`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Market Regime */}
        <Section icon="📊" title="Chế độ thị trường (Market Regime)" onRefresh={loadRegime} loading={regimeLoading} error={regime?.error} sectionKey="regime">
          {regime && !regime.error && (
            <div>
              <p className="text-xl font-bold text-white mb-2">{regime.regime || regime.marketRegime || 'N/A'}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <StatPill label="Score" value={`${regime.score}/100`} />
                <StatPill label="Độ tin cậy" value={`${regime.confidence}%`} />
                {regime.signals?.vix != null && <StatPill label="VIX" value={regime.signals.vix.toFixed(1)} />}
                {regime.signals?.fearGreedValue != null && (
                  <StatPill label="Fear & Greed" value={`${regime.signals.fearGreedValue} (${regime.signals.fearGreedLabel})`} />
                )}
              </div>
              {regime.reasonCodes?.length > 0 && (
                <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                  {regime.reasonCodes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <DebugDetails data={regime} />
            </div>
          )}
        </Section>

        {/* Health Score */}
        <Section icon="💊" title="Sức khỏe danh mục (Health Score)" onRefresh={loadHealth} loading={healthLoading} error={health?.error} sectionKey="health">
          {health && !health.error && (
            <div>
              <p className="text-xl font-bold mb-2">
                Điểm sức khỏe: {health.healthScore}/100 —{' '}
                <span className={health.grade === 'POOR' ? 'text-red-400' : health.grade === 'GOOD' ? 'text-green-400' : 'text-amber-400'}>
                  {health.grade}
                </span>
              </p>
              {health.breakdown && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <StatPill label="Chất lượng" value={health.breakdown.qualityScore} />
                  <StatPill label="Đa dạng hóa" value={health.breakdown.diversificationScore} />
                  <StatPill label="Độ tin cậy" value={health.breakdown.confidenceScore} />
                  <StatPill label="Khớp thị trường" value={health.breakdown.regimeAlignmentScore} />
                </div>
              )}
              {health.concentrationWarnings?.length > 0 && (
                <div className="bg-amber-950 border border-amber-800 rounded-lg p-3 mb-3 space-y-1">
                  {health.concentrationWarnings.map((w: string, i: number) => (
                    <div key={i} className="text-sm text-amber-300">⚠️ {w}</div>
                  ))}
                </div>
              )}
              {health.reasonCodes?.length > 0 && (
                <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
                  {health.reasonCodes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <DebugDetails data={health} />
            </div>
          )}
        </Section>

        {/* Rebalance */}
        <Section icon="⚖️" title="Đề xuất cân bằng lại (Rebalance)" onRefresh={loadRebalance} loading={rebalanceLoading} error={rebalance?.error} sectionKey="rebalance">
          {rebalance && !rebalance.error && (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <StatPill label="Tổng giá trị" value={`$${rebalance.totalPortfolioValueUsd?.toLocaleString()}`} />
                <StatPill label="Mua" value={rebalance.summary?.buyCount} color="text-green-400" />
                <StatPill label="Bán" value={rebalance.summary?.sellCount} color="text-amber-400" />
                <StatPill label="Thoát hẳn" value={rebalance.summary?.exitCount} color="text-red-400" />
                <StatPill label="Giữ nguyên" value={rebalance.summary?.holdCount} color="text-blue-400" />
              </div>
              {rebalance.recommendations?.length > 0 && (
                <div className="space-y-2">
                {rebalance.recommendations.map((r: any, i: number) => {
  const holding = holdings.find((h) => h.symbol === r.symbol)
  const currentAdjust = adjustShares[r.symbol] ?? r.targetShares
  return (
    <div key={i} className={`rounded-lg p-3 border ${actionColor[r.action] || 'bg-gray-800 border-gray-700 text-gray-300'}`}>
      <div className="flex justify-between items-center mb-1">
        <span className="font-bold text-white text-base">{r.symbol}</span>
        <span className="text-sm font-bold">{r.action}</span>
      </div>
      <div className="text-sm text-gray-300 mb-1">
        Hiện tại: {r.currentShares} cp ({r.currentWeightPct}%) → Mục tiêu: {r.targetShares} cp ({r.targetWeightPct}%) · Điểm: {r.scoreTotal}
      </div>
      <div className="text-sm text-gray-400 mb-2">{r.reason}</div>
      {holding && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
          <button
            onClick={() => setAdjustShares((prev) => ({ ...prev, [r.symbol]: Math.max(0, currentAdjust - 1) }))}
            className="bg-gray-700 hover:bg-gray-600 w-7 h-7 rounded text-sm font-bold"
          >−</button>
          <input
            type="number"
            value={currentAdjust}
            onChange={(e) => setAdjustShares((prev) => ({ ...prev, [r.symbol]: Number(e.target.value) }))}
            className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-center text-white"
          />
          <button
            onClick={() => setAdjustShares((prev) => ({ ...prev, [r.symbol]: currentAdjust + 1 }))}
            className="bg-gray-700 hover:bg-gray-600 w-7 h-7 rounded text-sm font-bold"
          >+</button>
          <span className="text-xs text-gray-500">cổ</span>
          <button
            onClick={() => applyShareChange(holding.holding_id, currentAdjust)}
            disabled={applyingId === holding.holding_id}
            className="ml-auto bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            {applyingId === holding.holding_id ? 'Đang áp dụng...' : '✓ Áp dụng'}
          </button>
        </div>
      )}
    </div>
  )
})}  
                </div>
              )}
              {rebalance.reasonCodes?.length > 0 && (
                <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside mt-3">
                  {rebalance.reasonCodes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <DebugDetails data={rebalance} />
            </div>
          )}
        </Section>

        {/* Deploy Cash */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-2" style={{ marginBottom: collapsed['deploycash'] ? 0 : '0.75rem' }}>
            <button onClick={() => toggleCollapse('deploycash')} className="flex items-center gap-2 text-left flex-1">
              <span className={`text-xs transition-transform ${collapsed['deploycash'] ? '-rotate-90' : ''}`}>▼</span>
              <h3 className="text-base font-semibold flex items-center gap-2">💰 Triển khai tiền mặt mới (Deploy Cash)</h3>
            </button>
            {!collapsed['deploycash'] && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-400">Số tiền: $</span>
                <input
                  type="number"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
                />
                <button onClick={loadDeployCash} className="bg-blue-700 hover:bg-blue-600 rounded-lg px-3 py-1.5 text-sm font-medium">Tính</button>
              </div>
            )}
          </div>
          {!collapsed['deploycash'] && (
            <>
              {deployLoading && <p className="text-sm text-gray-400">Đang tải...</p>}
              {deployCash?.error && <p className="text-sm text-red-400">{deployCash.error}</p>}
              {deployCash && !deployCash.error && (
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <StatPill label="Tiền mới" value={`$${deployCash.newCashUsd?.toLocaleString()}`} />
                    <StatPill label="Đã triển khai" value={`$${deployCash.totalDeployedUsd?.toLocaleString()}`} color="text-green-400" />
                    <StatPill label="Còn lại" value={`$${deployCash.leftoverCashUsd?.toLocaleString()}`} color="text-amber-400" />
                    <StatPill label="Tổng danh mục sau" value={`$${deployCash.totalPortfolioValueAfterUsd?.toLocaleString()}`} />
                  </div>
                  {deployCash.recommendations?.length > 0 ? (
                    <div className="space-y-2">
                     {deployCash.recommendations.map((r: any, i: number) => (
      <div key={i} className="bg-gray-800 rounded-lg p-3">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold text-white">{r.symbol}</span>
          <span className="text-green-400 font-bold">Mua thêm {r.sharesToAdd} cổ</span>
        </div>
        <div className="text-sm text-gray-400 mb-1">Chi phí: ${r.costUsd?.toLocaleString()}</div>
        <div className="text-sm text-gray-400">{r.reason}</div>
      </div>
    ))} 
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Không có đề xuất mua mã nào lúc này.</p>
                  )}
                  {deployCash.reasonCodes?.length > 0 && (
                    <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside mt-3">
                      {deployCash.reasonCodes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  <DebugDetails data={deployCash} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Watchlist */}
        <Section icon="👁️" title="Danh sách theo dõi (Watchlist Engine)" onRefresh={loadWatchlist} loading={watchlistLoading} error={watchlist?.error} sectionKey="watchlist">
          {watchlist && !watchlist.error && (
            <div>
              {watchlist.summary && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <StatPill label="Momentum" value={watchlist.summary.momentumPickCount} color="text-green-400" />
                  <StatPill label="Cơ hội giá trị" value={watchlist.summary.valueOpportunityCount} color="text-blue-400" />
                  <StatPill label="Quá đà" value={watchlist.summary.overextendedCautionCount} color="text-red-400" />
                  <StatPill label="Trung lập" value={watchlist.summary.neutralCount} color="text-gray-400" />
                </div>
              )}
              {watchlist.stocks?.length > 0 && (
                <div className="space-y-2">
                  {watchlist.stocks.map((s: any, i: number) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-3">
                      <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                        <span className="font-bold text-white">{s.symbol} — ${s.currentPrice}</span>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {s.labels?.map((l: string, j: number) => (
                            <span key={j} className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${watchLabelColor[l] || 'bg-gray-600'}`}>{l}</span>
                          ))}
                          <span className="text-sm text-gray-400">Điểm: {s.scoreTotal}</span>
                        </div>
                      </div>
                      {s.note && <div className="text-sm text-gray-400">{s.note}</div>}
                      {s.reasonCodes?.length > 0 && (
                        <ul className="space-y-0.5 text-sm text-gray-400 list-disc list-inside mt-1">
                          {s.reasonCodes.map((r: string, j: number) => <li key={j}>{r}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <DebugDetails data={watchlist} />
            </div>
          )}
        </Section>

        <a href="/portfolio/setup" className="text-blue-400 hover:text-blue-300 text-sm block mb-4">← Chỉnh sửa hồ sơ đầu tư</a>

        {/* Holdings */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Danh mục đang giữ</h2>
            <button onClick={() => toggleCollapse('holdings')} className="text-gray-400 hover:text-white text-sm">
              {collapsed['holdings'] ? '▶' : '▼'}
            </button>
          </div>
          {!collapsed['holdings'] && (
            <>
              {holdings.length === 0 ? (
                <p className="text-sm text-gray-500">Chưa có mã nào</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {holdings.map((h) => (
                    <div key={h.holding_id} className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white">{h.symbol}</span>
                        <span className="text-sm text-gray-400 ml-2">{h.shares} cp · ${h.avg_cost}</span>
{h.price_at_eval != null && (
  <div className="text-sm mt-1">
    <span className="text-gray-500">Giá gần nhất: ${h.price_at_eval}</span>
    <span className={`ml-2 font-bold ${h.pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
      {h.pnl_usd >= 0 ? '+' : ''}{h.pnl_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD ({h.pnl_usd >= 0 ? '+' : ''}{h.pnl_pct.toFixed(2)}%)
    </span>
  </div>
)}
                      </div>
                      <button onClick={() => removeHolding(h.holding_id)} className="text-red-400 hover:text-red-300 text-sm bg-red-950 px-3 py-1 rounded-lg">Xóa</button>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="text-sm font-semibold text-gray-300 mb-2">Thêm mã mới vào danh mục</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                <input placeholder="Mã (VD: MSFT)" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} className="flex-1 min-w-[100px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                <input placeholder="Số cổ phiếu" type="number" value={newShares} onChange={(e) => setNewShares(e.target.value)} className="flex-1 min-w-[100px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                <input placeholder="Giá vốn" type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} className="flex-1 min-w-[100px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                <button onClick={addHolding} className="bg-blue-700 hover:bg-blue-600 rounded-lg px-4 py-2 text-sm font-medium">Thêm</button>
              </div>
              {status && <p className="text-sm text-green-400">{status}</p>}
            </>
          )}
        </div>

        {/* Evaluate a symbol */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <h2 className="text-lg font-bold mb-3">Đánh giá một mã cổ phiếu</h2>
          <div className="flex gap-2 mb-3">
            <input
              placeholder="Nhập mã (VD: MSFT, IREN)"
              value={evalSymbol}
              onChange={(e) => setEvalSymbol(e.target.value.toUpperCase())}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <button onClick={runEvaluation} disabled={loading} className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">
              {loading ? 'Đang phân tích...' : 'Đánh giá'}
            </button>
            <button onClick={loadHistory} disabled={historyLoading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium">
            {historyLoading ? 'Đang tải...' : '📜 Xem lịch sử'}
          </button>
          </div>
          {historyData.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 mb-3 space-y-2 max-h-96 overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">📜 Lịch sử đánh giá — {evalSymbol}</h3>
            {historyData.map((h: any) => (
              <details key={h.eval_id} className="bg-gray-900 rounded-lg p-3">
                <summary className="cursor-pointer flex flex-wrap justify-between items-center gap-2">
                  <span className="text-sm text-gray-400">{new Date(h.eval_date).toLocaleDateString('vi-VN')}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-white text-xs font-bold ${recLabel[h.recommendation]?.color || 'bg-gray-600'}`}>
                    {recLabel[h.recommendation]?.text || h.recommendation}
                  </span>
                  <span className="text-sm text-gray-300">Giá: ${h.price_at_eval} · Điểm: {h.score_total}/100</span>
                </summary>
                {h.reasoning_text && <p className="text-sm text-gray-400 mt-2">{h.reasoning_text}</p>}
                {h.data_snapshot && (
                  <pre className="whitespace-pre-wrap text-xs bg-gray-950 rounded-lg p-3 mt-2 overflow-x-auto text-gray-500">{JSON.stringify(h.data_snapshot, null, 2)}</pre>
                )}
              </details>
            ))}
          </div>
        )}

          {evalResult && !evalResult.error && (
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">{evalResult.symbol}</h3>
                <span className={`px-3 py-1 rounded-lg text-white text-sm font-bold ${recLabel[evalResult.recommendation]?.color || 'bg-gray-600'}`}>
                  {recLabel[evalResult.recommendation]?.text || evalResult.recommendation}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-2">
                Giá hiện tại: ${evalResult.raw_price} · Score: {evalResult.score_total}/100 · Confidence: {evalResult.confidence_score}/100 · Vai trò: {evalResult.portfolio_role}
              </p>
              {evalResult.reason_texts && evalResult.reason_texts.length > 0 && (
  <div className="mt-2 text-sm text-yellow-300">
    {evalResult.reason_texts.map((r: string, i: number) => (
      <p key={i}>• {r}</p>
    ))}
  </div>
)}
              {evalResult.explanation && (
                <div className="space-y-2 mt-3 text-sm text-gray-300">
                  <p><span className="font-bold text-white">Tại sao:</span> {evalResult.explanation.why}</p>
                  <p><span className="font-bold text-white">Thay đổi gì:</span> {evalResult.explanation.what_changed}</p>
                  <p><span className="font-bold text-white">Còn phù hợp mục tiêu không:</span> {evalResult.explanation.still_fits_goal}</p>
                </div>
              )}
            </div>
          )}
          {evalResult?.error && <p className="text-sm text-red-400">{evalResult.error}</p>}
        </div>
        </div>
      </div>
    </div>
  )
}