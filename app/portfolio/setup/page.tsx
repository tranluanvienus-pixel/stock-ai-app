'use client'

import { useState, useEffect } from 'react'

const USER_ID = 'vien_default' // Tạm dùng 1 user_id cố định vì app chỉ mình bạn dùng

export default function SetupPage() {
  const [capital, setCapital] = useState('10000')
  const [goal, setGoal] = useState('growth')
  const [horizon, setHorizon] = useState('5y')
  const [investorType, setInvestorType] = useState('balanced')
  const [allowAiSell, setAllowAiSell] = useState(true)
  const [cashReserve, setCashReserve] = useState('15')
  const [status, setStatus] = useState('')

  // Khi vào trang, thử load hồ sơ đã lưu trước đó (nếu có)
  useEffect(() => {
    fetch(`/api/portfolio/profile?user_id=${USER_ID}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setCapital(String(data.profile.capital_usd))
          setGoal(data.profile.goal)
          setHorizon(data.profile.horizon)
          setInvestorType(data.profile.investor_type)
          setAllowAiSell(data.profile.allow_ai_sell)
          setCashReserve(String(data.profile.cash_reserve_pct))
        }
      })
  }, [])

  const handleSave = async () => {
    setStatus('Đang lưu...')
    const res = await fetch('/api/portfolio/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        capital_usd: Number(capital),
        goal,
        horizon,
        investor_type: investorType,
        allow_ai_sell: allowAiSell,
        cash_reserve_pct: Number(cashReserve),
      }),
    })
    const data = await res.json()
    if (data.error) {
      setStatus('Lỗi: ' + data.error)
    } else {
      setStatus('Đã lưu thành công!')
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Thiết lập hồ sơ đầu tư</h1>

      <label>Vốn khởi điểm (USD)</label>
      <input
        type="number"
        value={capital}
        onChange={(e) => setCapital(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 16 }}
      />

      <label>Mục tiêu</label>
      <select value={goal} onChange={(e) => setGoal(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 16 }}>
        <option value="growth">Tăng trưởng</option>
        <option value="income">Thu nhập</option>
        <option value="balanced">Cân bằng</option>
      </select>

      <label>Thời gian đầu tư</label>
      <select value={horizon} onChange={(e) => setHorizon(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 16 }}>
        <option value="1y">1 năm</option>
        <option value="2y">2 năm</option>
        <option value="3y">3 năm</option>
        <option value="4y">4 năm</option>
        <option value="5y">5 năm</option>
        <option value="6y">6 năm</option>
        <option value="7y">7 năm</option>
        <option value="8y">8 năm</option>
        <option value="9y">9 năm</option>
        <option value="10y">10 năm</option>
      </select>

      <label>Loại nhà đầu tư</label>
      <select value={investorType} onChange={(e) => setInvestorType(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 16 }}>
        <option value="conservative">Thận trọng</option>
        <option value="balanced">Cân bằng</option>
        <option value="growth">Tăng trưởng</option>
        <option value="aggressive">Mạo hiểm</option>
      </select>

      <label>
        <input
          type="checkbox"
          checked={allowAiSell}
          onChange={(e) => setAllowAiSell(e.target.checked)}
        />{' '}
        Cho phép AI đề xuất bán
      </label>
      <br /><br />

      <label>Giữ tiền mặt (%)</label>
      <input
        type="number"
        value={cashReserve}
        onChange={(e) => setCashReserve(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 16 }}
      />

      <button onClick={handleSave} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        Lưu hồ sơ
      </button>

      {status && <p>{status}</p>}
    </div>
  )
}