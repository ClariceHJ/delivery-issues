import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import logoImg from './assets/로고.png'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Dot, PieChart, Pie, Cell, Legend
} from 'recharts'

const categoryOptions = ['매트리스', '텍스타일', '기타']
const issueTypeOptions = ['장납기', '수주정지']

// CSV 컬럼 → DB 필드 매핑
const CSV_COL_MAP = {
  '유형': 'issue_type',
  '이슈구분': 'issue_subtype',
  '단품코드': 'item_code',
  '단품명': 'item_name',
  '품목군': 'category',
  '공급처': 'supplier',
  '업체명': 'company_name',
  '미출건수': 'unshipped_count',
  '장납일수': 'lead_days',
  '적용일': 'start_date',
  '해제예상일': 'expected_end_date',
  '상세사유': 'cause',
}

function parseCsvLine(line) {
  const result = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur.trim())
  return result
}

function parseCsv(text) {
  // BOM 제거 + 줄바꿈 정규화
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line)
    const row = {}
    headers.forEach((h, i) => {
      const field = CSV_COL_MAP[h] || h
      let val = vals[i] ?? ''
      if (field === 'lead_days') val = val === '' ? null : val.trim()
      else if (field === 'unshipped_count') val = val === '' ? null : (parseInt(val) || 0)
      else if (field === 'doc_received') val = val === 'true' || val === '1' || val === 'Y'
      else if (field === 'is_active') val = val === '' ? true : (val === 'true' || val === '1' || val === 'Y')
      row[field] = val
    })
    if (row.is_active === undefined) row.is_active = true
    return row
  }).filter(r => r.item_code)
}

function CsvImportModal({ onClose, onImport }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [clearFirst, setClearFirst] = useState(false)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        let parsed = parseCsv(ev.target.result)
        if (!parsed.length) {
          // UTF-8 파싱 실패 시 EUC-KR로 재시도
          const reader2 = new FileReader()
          reader2.onload = (ev2) => {
            try {
              const parsed2 = parseCsv(ev2.target.result)
              if (!parsed2.length) { setError('유효한 데이터가 없습니다. 헤더를 확인해주세요.'); return }
              setError(''); setRows(parsed2)
            } catch { setError('파일 파싱 오류가 발생했습니다.') }
          }
          reader2.readAsText(file, 'EUC-KR')
          return
        }
        setError('')
        setRows(parsed)
      } catch {
        setError('파일 파싱 오류가 발생했습니다.')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    setImporting(true)
    await onImport(rows, clearFirst)
    setImporting(false)
    setDone(true)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#1a1d2e', fontSize: 18, fontWeight: 700, margin: 0 }}>📂 CSV 일괄 업로드</h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>

        {/* 컬럼 안내 */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#374151' }}>CSV 헤더 형식 (순서 자유)</p>
            <button onClick={() => {
              const header = '유형,이슈구분,단품코드,단품명,품목군,공급처,업체명,미출건수,장납일수,적용일,해제예상일,상세사유'
              const bom = '\uFEFF'
              const blob = new Blob([bom + header + '\n'], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = '납기이슈_업로드양식.csv'; a.click()
              URL.revokeObjectURL(url)
            }} style={{
              background: '#fff', border: '1.5px solid #0E217C', borderRadius: 7,
              padding: '3px 10px', fontSize: 11, fontWeight: 600, color: '#0E217C',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>⬇ 양식 다운로드</button>
          </div>
          <code style={{ fontSize: 11, color: '#0E217C' }}>
            유형, 이슈구분, 단품코드, 단품명, 품목군, 공급처, 업체명, 미출건수, 장납일수, 적용일, 해제예상일, 상세사유
          </code>
          <p style={{ margin: '8px 0 0', fontSize: 11 }}>• 유형: <b>장납기</b> 또는 <b>수주정지</b> &nbsp;|  품목군: <b>매트리스 / 텍스타일 / 기타</b></p>
          <p style={{ margin: '2px 0 0', fontSize: 11 }}>• 날짜 형식: <b>YYYY-MM-DD</b> &nbsp;|&nbsp; 장납일수: <b>숫자만</b> (예: 5) &nbsp;|&nbsp; 인코딩: <b>UTF-8</b></p>
        </div>

        {!done ? (
          <>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '28px 20px', borderRadius: 12,
              border: '2px dashed #d1d5db', cursor: 'pointer', marginBottom: 16,
              background: '#fafafa', transition: 'border 0.15s',
            }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile({ target: { files: [f] } }) }}
            >
              <span style={{ fontSize: 32 }}>📄</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>CSV 파일을 드래그하거나 클릭해서 선택</span>
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
            </label>

            {error && <p style={{ color: '#C0392B', fontSize: 13, marginBottom: 12 }}>⚠ {error}</p>}

            {rows && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 10 }}>
                  ✅ {rows.length}건 미리보기
                </p>
                <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['유형', '단품코드', '다품명', '품목군', '미출', 'D+', '적용일'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                              background: r.issue_type === '수주정지' ? '#fbeae8' : '#eaecf7',
                              color: r.issue_type === '수주정지' ? '#C0392B' : '#0E217C',
                            }}>{r.issue_type || '-'}</span>
                          </td>
                          <td style={{ padding: '7px 10px', color: '#0E217C' }}>{r.item_code}</td>
                          <td style={{ padding: '7px 10px', color: '#374151' }}>{r.item_name || '-'}</td>
                          <td style={{ padding: '7px 10px', color: '#6b7280' }}>{r.category || '-'}</td>
                          <td style={{ padding: '7px 10px', color: '#6b7280' }}>{r.unshipped_count ?? '-'}</td>
                          <td style={{ padding: '7px 10px', fontWeight: 700, color: (() => { const n = parseInt(String(r.lead_days ?? '')); return isNaN(n) ? '#374151' : n >= 5 ? '#C0392B' : '#374151'; })() }}>{r.lead_days != null && r.lead_days !== '' ? `D+${r.lead_days}` : '-'}</td>
                          <td style={{ padding: '7px 10px', color: '#6b7280' }}>{r.start_date || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: clearFirst ? '#C0392B' : '#6b7280', cursor: 'pointer', marginRight: 'auto' }}>
                <input type="checkbox" checked={clearFirst} onChange={e => setClearFirst(e.target.checked)} />
                기존 데이터 전체 삭제 후 가져오기
              </label>
              <button onClick={onClose} style={btnSecondary}>취소</button>
              <button
                onClick={handleImport}
                disabled={!rows || importing}
                style={{ ...btnPrimary, opacity: (!rows || importing) ? 0.5 : 1 }}
              >
                {importing ? '업로드 중...' : `${rows ? rows.length + '건 ' : ''}등록`}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🎉</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1d2e', marginBottom: 6 }}>{rows.length}건 등록 완료!</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>데이터가 Supabase에 저장되었습니다.</p>
            <button onClick={onClose} style={btnPrimary}>닫기</button>
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryModal({ issue, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ color: '#1a1d2e', fontSize: 18, fontWeight: 700, margin: 0 }}>상세사유 히스토리</h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          {issue.item_name || issue.item_code}{issue.item_name && issue.item_code ? ` (${issue.item_code})` : ''}
        </p>
        <div style={{
          background: '#f8fafc', borderRadius: 10, padding: '14px 16px',
          fontSize: 13, color: issue.cause ? '#374151' : '#6b7280',
          lineHeight: 1.8, minHeight: 80, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}>
          {issue.cause || '등록된 사유가 없습니다.'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={btnSecondary}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function KpiDetailModal({ row, onClose }) {
  if (!row) return null
  const inhibRate = row.customers_total
    ? (((row.customers_over_d4 || 0) + (row.customers_unshipped || 0)) / row.customers_total * 100).toFixed(1) + '%'
    : '-'
  const fields = [
    { label: 'D+4 초과 품목수', value: row.items_over_d4 ?? '-', color: '#C0392B' },
    { label: 'D+1→D+4 품목수', value: row.items_within_d4 ?? '-', color: '#6b7280' },
    { label: '수주정지 품목수', value: row.items_suspended ?? '-', color: '#C0392B' },
    { label: 'D+4 초과 고객수', value: row.customers_over_d4 ?? '-', color: '#C0392B' },
    { label: 'D+1→D+4 고객수', value: row.customers_within_d4 ?? '-', color: '#6b7280' },
    { label: '미출건수', value: row.customers_unshipped ?? '-', color: '#6b7280' },
    { label: '총고객수', value: row.customers_total ?? '-', color: '#1a1d2e' },
    { label: '저해율', value: inhibRate, color: '#0E217C' },
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1d2e' }}>{row.year_month} 월별 집계</h3>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {fields.map(f => (
            <div key={f.label} style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{f.label}</p>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: f.color }}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DrilldownModal({ title, list, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ color: '#1e2130', fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{list.length}건</span>
            <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0 }}>
                {['유형', '이슈구분', '단품코드', '단품명', '품목군', '공급처', '적용일(발생일)'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>해당 이슈 없음</td></tr>
              ) : list.map((issue, idx) => (
                <tr key={issue.id} style={{ borderBottom: idx < list.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: issue.issue_type === '장납기' ? '#eaecf7' : '#fbeae8',
                      color: issue.issue_type === '장납기' ? '#0E217C' : '#C0392B' }}>
                      {issue.issue_type}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#6b7280' }}>{issue.issue_subtype || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#0E217C', fontWeight: 500 }}>{issue.item_code}</td>
                  <td style={{ padding: '8px 10px', color: '#1e2130', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.item_name || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#6b7280' }}>{issue.category || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#6b7280' }}>{issue.supplier || '-'}</td>
                  <td style={{ padding: '8px 10px', color: '#6b7280' }}>{issue.start_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function CauseModal({ issue, onClose, onSave }) {
  const [cause, setCause] = useState(issue.cause || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(issue.id, cause)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ color: '#1a1d2e', fontSize: 18, fontWeight: 700, margin: 0 }}>상세사유 입력</h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          {issue.item_name || issue.item_code}{issue.item_name && issue.item_code ? ` (${issue.item_code})` : ''}
        </p>
        <textarea
          value={cause}
          onChange={e => setCause(e.target.value)}
          placeholder="상세사유를 입력하세요..."
          style={{ ...inputStyle, width: '100%', height: 160, resize: 'vertical', boxSizing: 'border-box' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}


function Modal({ onClose, onSave, initial }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(initial || {
    issue_type: '장납기',
    issue_subtype: '',
    item_code: '',
    item_name: '',
    category: '매트리스',
    supplier: '',
    company_name: '',
    unshipped_count: 0,
    lead_days: '',
    start_date: today,
    expected_end_date: '',
    cause: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, width: 540,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ color: '#1a1d2e', fontSize: 18, fontWeight: 700 }}>
            {initial ? '이슈 수정' : '새 이슈 등록'}
          </h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <label style={labelStyle}>
            유형
            <select value={form.issue_type} onChange={e => set('issue_type', e.target.value)} style={inputStyle}>
              {issueTypeOptions.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            이슈구분
            <input value={form.issue_subtype} onChange={e => set('issue_subtype', e.target.value)} style={inputStyle} placeholder="예) 원자재 수급" />
          </label>

          <label style={labelStyle}>
            단품코드 *
            <input value={form.item_code} onChange={e => set('item_code', e.target.value)} style={inputStyle} placeholder="SLTR0090CP..." />
          </label>

          <label style={labelStyle}>
            단품명
            <input value={form.item_name} onChange={e => set('item_name', e.target.value)} style={inputStyle} placeholder="올라운드 컴포트 S" />
          </label>

          <label style={labelStyle}>
            품목군
            <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
              {categoryOptions.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>

          <label style={labelStyle}>
            공급처
            <input value={form.supplier} onChange={e => set('supplier', e.target.value)} style={inputStyle} placeholder="라인 텍스타일" />
          </label>

          <label style={labelStyle}>
            업체명
            <input value={form.company_name} onChange={e => set('company_name', e.target.value)} style={inputStyle} placeholder="(주)라인텍스" />
          </label>

          <label style={labelStyle}>
            미출건수
            <input type="number" value={form.unshipped_count} onChange={e => set('unshipped_count', parseInt(e.target.value) || 0)} style={inputStyle} min={0} />
          </label>

          <label style={labelStyle}>
            장납일수 (D+N)
            <input type="text" value={form.lead_days ?? ''} onChange={e => set('lead_days', e.target.value === '' ? null : e.target.value)} style={inputStyle} placeholder="예: 5 또는 5~15" />
          </label>

          <label style={labelStyle}>
            적용일 *
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inputStyle} />
          </label>

          <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
            해제 예상일
            <input type="date" value={form.expected_end_date} onChange={e => set('expected_end_date', e.target.value)} style={{ ...inputStyle, width: '50%' }} />
          </label>
        </div>

        <label style={{ ...labelStyle, marginTop: 16 }}>
          상세사유
          <textarea value={form.cause} onChange={e => set('cause', e.target.value)} style={{ ...inputStyle, height: 80, resize: 'vertical' }} />
        </label>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={() => onSave(form)} style={btnPrimary}>저장</button>
        </div>
      </div>
    </div>
  )
}

function ResolveModal({ issue, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(issue.expected_end_date || today)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,29,46,0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ color: '#1a1d2e', fontSize: 18, fontWeight: 700 }}>이슈 해제</h2>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>
        <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>{issue.item_name || issue.item_code}</p>
        <label style={labelStyle}>
          실제 해제일
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={() => onSave(issue.id, date)} style={{ ...btnPrimary, background: '#2eaa5a' }}>해제 확정</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'new' | {edit: issue}
  const [resolveModal, setResolveModal] = useState(null)
  const [tab, setTab] = useState('analytics') // 'analytics' | 'active' | 'resolved'
  const [filterType, setFilterType] = useState('전체')
  const [filterCategory, setFilterCategory] = useState('전체')
  const [search, setSearch] = useState('')
  const [csvImport, setCsvImport] = useState(false)
  const [causeModal, setCauseModal] = useState(null)
  const [historyModal, setHistoryModal] = useState(null)
  const [drilldown, setDrilldown] = useState(null)
  const [filterCritical, setFilterCritical] = useState(false)
  const [monthlyStats, setMonthlyStats] = useState([])
  const [statsForm, setStatsForm] = useState({
    year_month: new Date().toISOString().slice(0, 7),
    customers_over_d4: '', customers_within_d4: '', customers_unshipped: '', customers_total: ''
  })
  const [statsSaving, setStatsSaving] = useState(false)
  const [kpiStatsModal, setKpiStatsModal] = useState(null)
  const [slideTooltip, setSlideTooltip] = useState(null) // { row, x, y }
  const [chartView, setChartView] = useState('subtype') // 'subtype' | 'supplier' | 'category' | 'top5'
  const [chartItems, setChartItems] = useState(null) // { items, label }

  useEffect(() => { fetchIssues(); fetchMonthlyStats() }, [])

  const autoItemStatsMap = useMemo(() => {
    const map = {}
    issues.forEach(issue => {
      if (!issue.start_date) return
      const ym = issue.start_date.slice(0, 7)
      if (!map[ym]) map[ym] = { items_over_d4: 0, items_within_d4: 0, items_suspended: 0 }
      if (issue.issue_type === '장납기') {
        const d = parseInt(String(issue.lead_days ?? ''))
        if (d > 4) map[ym].items_over_d4++
        else if (d === 4) map[ym].items_within_d4++
      } else if (issue.issue_type === '수주정지') {
        map[ym].items_suspended++
      }
    })
    return map
  }, [issues])

  async function fetchIssues() {
    setLoading(true)
    const { data } = await supabase.from('issues').select('*').order('created_at', { ascending: false })
    setIssues(data || [])
    setLoading(false)
  }

  async function saveIssue(form) {
    if (modal?.edit) {
      await supabase.from('issues').update(form).eq('id', modal.edit.id)
    } else {
      await supabase.from('issues').insert({ ...form, is_active: true })
    }
    setModal(null)
    fetchIssues()
  }

  async function resolveIssue(id, date) {
    await supabase.from('issues').update({ is_active: false, actual_end_date: date }).eq('id', id)
    setResolveModal(null)
    fetchIssues()
  }

  async function deleteIssue(id) {
    if (!confirm('삭제하시겠어요?')) return
    await supabase.from('issues').delete().eq('id', id)
    fetchIssues()
  }

  async function importCsv(rows, clearFirst = false) {
    if (clearFirst) {
      await supabase.from('issues').delete().not('id', 'is', null)
    }
    const CHUNK = 50
    for (let i = 0; i < rows.length; i += CHUNK) {
      await supabase.from('issues').insert(rows.slice(i, i + CHUNK))
    }
    fetchIssues()
  }

  async function saveCause(id, cause) {
    await supabase.from('issues').update({ cause }).eq('id', id)
    fetchIssues()
  }

  async function fetchMonthlyStats() {
    const { data, error } = await supabase.from('monthly_stats').select('*').order('year_month', { ascending: false })
    if (error) {
      console.error('fetchMonthlyStats error:', error)
      alert('월별 집계 조회 실패: ' + error.message)
    }
    setMonthlyStats(data || [])
  }

  async function saveMonthlyStats() {
    setStatsSaving(true)
    const payload = {
      customers_over_d4: Number(statsForm.customers_over_d4) || 0,
      customers_within_d4: Number(statsForm.customers_within_d4) || 0,
      customers_unshipped: Number(statsForm.customers_unshipped) || 0,
      customers_total: Number(statsForm.customers_total) || 0,
    }
    const { data: existing } = await supabase
      .from('monthly_stats').select('id').eq('year_month', statsForm.year_month).maybeSingle()
    const { error } = existing
      ? await supabase.from('monthly_stats').update(payload).eq('year_month', statsForm.year_month)
      : await supabase.from('monthly_stats').insert({ year_month: statsForm.year_month, ...payload })
    if (error) {
      console.error('saveMonthlyStats error:', error)
      alert('저장 실패: ' + error.message)
      setStatsSaving(false)
      return
    }
    await fetchMonthlyStats()
    setStatsSaving(false)
  }

  const active = issues.filter(i => i.is_active)
  const resolved = issues.filter(i => !i.is_active)

  function applyFilters(list) {
    return list.filter(i => {
      if (filterCritical && !(i.issue_type === '장납기' && parseInt(i.lead_days) >= 5)) return false
      if (filterType !== '전체' && i.issue_type !== filterType) return false
      if (filterCategory !== '전체' && i.category !== filterCategory) return false
      if (search && !i.item_code?.includes(search) && !i.item_name?.includes(search)) return false
      return true
    })
  }

  // Analytics data
  const analyticsIssues = filterCritical
    ? issues.filter(i => i.issue_type === '장납기' && parseInt(i.lead_days) >= 5)
    : issues

  const monthlyData = (() => {
    const map = {}
    analyticsIssues.forEach(i => {
      const m = i.start_date?.slice(0, 7)
      if (!m) return
      if (!map[m]) map[m] = { month: m, 장납기: 0, 수주정지: 0 }
      map[m][i.issue_type] = (map[m][i.issue_type] || 0) + 1
    })
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-3)
  })()

  const typeData = [
    { name: '장납기', value: analyticsIssues.filter(i => i.issue_type === '장납기').length },
    { name: '수주정지', value: analyticsIssues.filter(i => i.issue_type === '수주정지').length },
  ].filter(d => d.value > 0)

  const repeatData = (() => {
    const map = {}
    analyticsIssues.forEach(i => {
      const key = i.item_code
      if (!key) return
      map[key] = map[key] || { code: key, name: i.item_name || key, count: 0 }
      map[key].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8)
  })()

  const avgDuration = (() => {
    const resolved = issues.filter(i => !i.is_active && i.actual_end_date && i.start_date)
    if (!resolved.length) return null
    const total = resolved.reduce((sum, i) => {
      const diff = (new Date(i.actual_end_date) - new Date(i.start_date)) / 86400000
      return sum + diff
    }, 0)
    return Math.round(total / resolved.length)
  })()

  const supplierData = (() => {
    const map = {}
    analyticsIssues.forEach(i => { if (i.supplier) map[i.supplier] = (map[i.supplier] || 0) + 1 })
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  })()

  const categoryFreqData = (() => {
    const map = {}
    analyticsIssues.forEach(i => { if (i.category) map[i.category] = (map[i.category] || 0) + 1 })
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  })()

  const subtypeData = (() => {
    const map = {}
    analyticsIssues.forEach(i => { if (i.issue_subtype) map[i.issue_subtype] = (map[i.issue_subtype] || 0) + 1 })
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  })()

  const chartMaxCount = Math.max(
    ...subtypeData.map(d => d.count),
    ...repeatData.slice(0, 5).map(d => d.count),
    ...supplierData.map(d => d.count),
    ...categoryFreqData.map(d => d.count),
    1
  )

  const displayList = applyFilters(
    tab === 'active'
      ? [...active].sort((a, b) => (b.expected_end_date || '').localeCompare(a.expected_end_date || ''))
      : [...resolved].sort((a, b) => (b.expected_end_date || '').localeCompare(a.expected_end_date || ''))
  )

  // Category breakdown for sidebar
  const catList = Array.from(new Set(active.map(i => i.category).filter(Boolean))).sort()
  const catBreakdown = catList.map(cat => ({
    cat,
    count: active.filter(i => i.category === cat).length,
  }))

  const maxCat = Math.max(...catBreakdown.map(c => c.count), 1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'Inter', 'Pretendard', 'Noto Sans KR', sans-serif" }}>

      {/* ── TOP NAV ── */}
      <nav style={{
        background: '#fff', borderRadius: 0,
        padding: '0 32px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 0 #e5e7eb',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoImg} alt="로고" style={{ height: 20, width: 'auto', flexShrink: 0, display: 'block' }} />
          <span style={{ fontWeight: 700, fontSize: 20, color: '#1a1d2e', letterSpacing: '-0.3px' }}>납기 이슈 현황</span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[['analytics', '분석'], ['active', '활성 이슈'], ['resolved', '해제 이슈']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setFilterType('전체'); setFilterCategory('전체') }} style={{
              padding: '8px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === key ? 600 : 400,
              background: tab === key ? '#e8eaf0' : 'transparent',
              color: tab === key ? '#0E217C' : '#6b7280',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Right: search + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 14 }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="품목코드 / 품목명 검색"
              style={{
                background: '#f3f4f6', border: '1px solid transparent', borderRadius: 10,
                padding: '7px 14px 7px 32px', fontSize: 13, color: '#1a1d2e',
                outline: 'none', width: 200, transition: 'border 0.15s',
              }}
            />
          </div>

        </div>
      </nav>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 28, padding: '28px 36px' }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Issue Tracker Card — analytics only */}
          {tab === 'analytics' && <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 316, justifyContent: 'center', padding: '8px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eceef8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📋</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1d2e', margin: 0 }}>이슈 트래커</h2>
              <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>납기 이슈 발생 품목수 / 중복 카운팅</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
                <button
                  onClick={() => setFilterCritical(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: filterCritical ? '#C0392B' : '#f9fafb',
                    color: filterCritical ? '#fff' : '#6b7280',
                    border: filterCritical ? '1px solid #C0392B' : '1px solid #e5e7eb',
                  }}
                >
                  ⚠️ 기준납기 초과건만 보기
                </button>
                {['장납기', '수주정지'].map(t => (
                  <span key={t} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                    background: t === '장납기' ? '#eaecf7' : '#fbeae8',
                    color: t === '장납기' ? '#0E217C' : '#C0392B',
                    border: t === '장납기' ? '1px solid #c8cde8' : '1px solid #e8c0bc',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: t === '장납기' ? '#0E217C' : '#C0392B', display: 'inline-block' }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              {/* 누적 */}
              <div style={{ flex: '0 0 20%', minWidth: 0, paddingLeft: 20, paddingRight: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1d2e', margin: '0 0 4px', letterSpacing: '0.3px' }}>누적</p>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={2}>
                      {typeData.map((_, i) => <Cell key={i} fill={i === 0 ? '#0E217C' : '#C0392B'} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value + '건', name]} contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                  {typeData.map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#0E217C' : '#C0392B', flexShrink: 0 }} />
                      <span>{d.name}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#1a1d2e' }}>{d.value}건</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 최근 3개월 */}
              <div style={{ flex: '0 0 35%', minWidth: 0, borderLeft: '1px solid #f0f0f0', paddingLeft: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1d2e', margin: '0 0 4px', letterSpacing: '0.3px' }}>최근 3개월 (발생 시점 기준)</p>
                <ResponsiveContainer width="100%" height={165}>
                  <BarChart data={monthlyData} barGap={6}>
                    <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(74,144,226,0.06)' }}
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="장납기" fill="#0E217C" radius={[4,4,0,0]} maxBarSize={28} />
                    <Bar dataKey="수주정지" fill="#C0392B" radius={[4,4,0,0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* 고객 만족 지표 */}
              <div style={{ flex: '0 0 45%', minWidth: 0, borderLeft: '1px solid #f0f0f0', paddingLeft: 28, paddingRight: 36, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1d2e', margin: '0 0 4px', letterSpacing: '0.3px' }}>
                  고객 만족 지표
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>
                    (장납기 운영으로 기준납기를 지키지 못한 고객 수 + 납기 연기 건수) ÷ 총 주문건수
                  </span>
                </p>
                {monthlyStats.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#c8ccd4', textAlign: 'center', padding: '28px 0' }}>데이터 없음</p>
                ) : (() => {
                  const lineData = [...monthlyStats]
                    .sort((a, b) => a.year_month.localeCompare(b.year_month))
                    .map(row => {
                      const autoStats = autoItemStatsMap[row.year_month] || { items_over_d4: 0, items_within_d4: 0, items_suspended: 0 }
                      const mergedRow = { ...row, ...autoStats }
                      return {
                        month: row.year_month,
                        저해율: row.customers_total
                          ? parseFloat((((row.customers_over_d4 || 0) + (row.customers_unshipped || 0)) / row.customers_total * 100).toFixed(1))
                          : null,
                        _row: mergedRow,
                      }
                    })
                  return (
                    <ResponsiveContainer width="100%" height={165}>
                      <LineChart data={lineData} margin={{ top: 28, right: 20, bottom: 4, left: 24 }}>
                        <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          wrapperStyle={{ zIndex: 50 }}
                          position={{ y: 0 }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload?._row
                            if (!row) return null
                            const inhibRate = row.customers_total
                              ? (((row.customers_over_d4 || 0) + (row.customers_unshipped || 0)) / row.customers_total * 100).toFixed(1) + '%'
                              : '-'
                            const fields = [
                              { label: 'D+4 초과 품목수', value: row.items_over_d4 ?? '-', color: '#C0392B' },
                              { label: 'D+1→D+4 품목수', value: row.items_within_d4 ?? '-', color: '#6b7280' },
                              { label: '수주정지 품목수', value: row.items_suspended ?? '-', color: '#C0392B' },
                              { label: 'D+4 초과 고객수', value: row.customers_over_d4 ?? '-', color: '#C0392B' },
                              { label: 'D+1→D+4 고객수', value: row.customers_within_d4 ?? '-', color: '#6b7280' },
                              { label: '미출건수', value: row.customers_unshipped ?? '-', color: '#6b7280' },
                              { label: '총고객수', value: row.customers_total ?? '-', color: '#1a1d2e' },
                              { label: '저해율', value: inhibRate, color: '#0E217C' },
                            ]
                            return (
                              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.13)', width: 210 }}>
                                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#1a1d2e' }}>{row.year_month}</p>
                                {fields.map(f => (
                                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                                    <span style={{ fontSize: 11, color: '#6b7280' }}>{f.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.value}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone" dataKey="저해율" stroke="#0E217C" strokeWidth={2}
                          dot={{ fill: '#0E217C', r: 4 }} activeDot={{ r: 6 }} connectNulls
                          label={({ x, y, value }) => value != null ? (
                            <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="#0E217C" fontWeight={700}>{value}%</text>
                          ) : null}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )
                })()}
              </div>
            </div>
          </div>}

          {/* Filters row */}
          {tab !== 'analytics' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setFilterCritical(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: filterCritical ? '#C0392B' : '#f9fafb',
                color: filterCritical ? '#fff' : '#6b7280',
                border: filterCritical ? '1px solid #C0392B' : '1px solid #e5e7eb',
              }}
            >
              ⚠️ 기준납기 초과건만 보기
            </button>
            <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px' }} />
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginRight: 2 }}>이슈유형</span>
            {['전체', '장납기', '수주정지'].map(t => (
              <button key={t} onClick={() => setFilterType(t)} style={{
                padding: '5px 14px', borderRadius: 20, border: filterType === t ? '1.5px solid #0E217C' : '1.5px solid #e5e7eb',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                background: filterType === t ? '#eceef8' : '#fff',
                color: filterType === t ? '#0E217C' : '#6b7280',
              }}>{t}</button>
            ))}
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginLeft: 8, marginRight: 2 }}>품목군</span>
            {['전체', ...Array.from(new Set(issues.map(i => i.category).filter(Boolean))).sort()].map(t => (
              <button key={t} onClick={() => setFilterCategory(t)} style={{
                padding: '5px 14px', borderRadius: 20, border: filterCategory === t ? '1.5px solid #6b7280' : '1.5px solid #e5e7eb',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                background: filterCategory === t ? '#f3f4f6' : '#fff',
                color: filterCategory === t ? '#6b7280' : '#6b7280',
              }}>{t}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              🕒 해제예상일 최신순
            </span>
          </div>
          )}

          {/* Issue List / Analytics */}
          {tab === 'analytics' ? (<>
            {/* Unified interactive chart area */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Left: filter buttons + vertical bar chart */}
              <div style={{ background: '#f5f6fa', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 32 }}>
                  {[
                    { key: 'subtype', label: '이슈구분별 빈도' },
                    { key: 'supplier', label: '공급처별 빈도' },
                    { key: 'category', label: '품목군별 빈도' },
                    { key: 'top5', label: '발생빈도 TOP 품목' },
                  ].map(t => (
                    <button key={t.key}
                      onClick={() => { setChartView(t.key); setChartItems(null) }}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: chartView === t.key ? 700 : 500,
                        cursor: 'pointer', border: chartView === t.key ? '1.5px solid #0E217C' : '1.5px solid #e5e7eb',
                        background: chartView === t.key ? '#0E217C' : '#fff',
                        color: chartView === t.key ? '#fff' : '#6b7280',
                        transition: 'all 0.15s',
                      }}>{t.label}</button>
                  ))}
                </div>
                {(() => {
                  const cfgMap = {
                    subtype:  { data: subtypeData,              xKey: 'name', getItems: d => analyticsIssues.filter(i => i.issue_subtype === d.name) },
                    supplier: { data: supplierData,             xKey: 'name', getItems: d => analyticsIssues.filter(i => i.supplier === d.name) },
                    category: { data: categoryFreqData,         xKey: 'name', getItems: d => analyticsIssues.filter(i => i.category === d.name) },
                    top5:     { data: repeatData.slice(0, 5),   xKey: 'code', getItems: d => analyticsIssues.filter(i => i.item_code === d.code) },
                  }
                  const cfg = cfgMap[chartView]
                  return (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={cfg.data} margin={{ top: 8, right: 12, bottom: 60, left: 0 }}>
                        <XAxis
                          dataKey={cfg.xKey}
                          tick={{ fill: '#6b7280', fontSize: 10 }}
                          axisLine={false} tickLine={false}
                          angle={-35} textAnchor="end" interval={0}
                        />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'rgba(107,141,214,0.08)' }} />
                        <Bar dataKey="count" fill="#0E217C" radius={[4,4,0,0]} maxBarSize={40} cursor="pointer"
                          onClick={d => setChartItems({ items: cfg.getItems(d), label: d[cfg.xKey] })}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                })()}
              </div>

              {/* Right: item list panel */}
              <div style={{ ...card, background: '#fff', padding: 16, display: 'flex', flexDirection: 'column', minHeight: 340, maxHeight: 420, overflow: 'hidden' }}>
                {chartItems ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1a1d2e' }}>{chartItems.label}</h3>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{chartItems.items.length}건</span>
                    </div>
                    <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 640 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0 }}>
                            {['단품코드', '단품명', '유형', '장납일수', '적용일', '해제일'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {chartItems.items.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>해당 이슈 없음</td></tr>
                          ) : chartItems.items.map((issue, idx) => (
                            <tr key={issue.id} style={{ borderBottom: idx < chartItems.items.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                              <td style={{ padding: '7px 10px', color: '#0E217C', fontWeight: 500, whiteSpace: 'nowrap' }}>{issue.item_code}</td>
                              <td style={{ padding: '7px 10px', color: '#1e2130', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.item_name || '-'}</td>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{
                                  padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                                  background: issue.issue_type === '장납기' ? '#eaecf7' : '#fbeae8',
                                  color: issue.issue_type === '장납기' ? '#0E217C' : '#C0392B',
                                }}>{issue.issue_type}</span>
                              </td>
                              <td style={{ padding: '7px 10px', color: issue.lead_days != null && issue.lead_days !== '' ? (parseInt(String(issue.lead_days)) >= 5 ? '#C0392B' : '#374151') : '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center' }}>
                                {issue.lead_days != null && issue.lead_days !== '' ? `D+${issue.lead_days}` : '-'}
                              </td>
                              <td style={{ padding: '7px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.start_date || '-'}</td>
                              <td style={{ padding: '7px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.actual_end_date || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 8 }}>
                    <span style={{ fontSize: 28 }}>📊</span>
                    <p style={{ margin: 0, fontSize: 13 }}>막대를 클릭하면 품목 목록이 표시됩니다</p>
                  </div>
                )}
              </div>
            </div>


          </>) : loading ? (
            <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
              불러오는 중...
            </div>
          ) : displayList.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
              이슈가 없습니다
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f0f0f0' }}>
                    {['유형', '이슈구분', '단품코드', '단품명', '품목군', '공급처', '업체명', '미출건수', '장납일수', '적용일', '해제예상일', '상세사유', ''].map(h => (
                      <th key={h} style={{ padding: '11px 12px', textAlign: 'left', color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayList.map((issue, idx) => (
                    <tr key={issue.id} style={{ borderBottom: idx < displayList.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: issue.issue_type === '수주정지' ? '#fbeae8' : '#eaecf7',
                          color: issue.issue_type === '수주정지' ? '#C0392B' : '#0E217C',
                        }}>{issue.issue_type}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280' }}>{issue.issue_subtype || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#0E217C', fontWeight: 500, whiteSpace: 'nowrap' }}>{issue.item_code}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#1a1d2e', fontWeight: 500, minWidth: 120 }}>{issue.item_name || '-'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{issue.category || '-'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.supplier || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.company_name || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'center' }}>{issue.unshipped_count ?? '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textAlign: 'center',
                        color: (() => { const n = parseInt(String(issue.lead_days ?? '')); return isNaN(n) ? '#374151' : n >= 5 ? '#C0392B' : '#374151'; })() }}>
                        {issue.lead_days != null && issue.lead_days !== '' ? `D+${issue.lead_days}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.start_date}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{issue.expected_end_date || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', maxWidth: 160 }}>
                        <button onClick={() => setHistoryModal(issue)} style={{
                          background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6,
                          padding: '3px 10px', fontSize: 11, color: '#6b7280', cursor: 'pointer', fontWeight: 500,
                        }}>히스토리</button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setModal({ edit: issue })} style={btnSmall}>수정</button>
                          <button onClick={() => setCauseModal(issue)} style={{ ...btnSmall, background: '#eceef8', color: '#0E217C', border: '1px solid #c6cae8' }}>사유</button>
                          {tab === 'active' && (
                            <button onClick={() => setResolveModal(issue)} style={{ ...btnSmall, background: '#eef6f2', color: '#4a9e72', border: '1px solid #bedeca' }}>해제</button>
                          )}
                          <button onClick={() => deleteIssue(issue.id)} style={{ ...btnSmall, background: '#fbeae8', color: '#C0392B', border: '1px solid #e8c0bc' }}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, order: -1, alignSelf: 'flex-start' }}>

          {/* Summary Cards */}
          <div style={{ ...card, minHeight: 316, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1d2e', margin: 0 }}>이슈 현황</h3>
              <span style={{ fontSize: 11, color: '#6b7280' }}>현재 기준</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, gridAutoRows: '1fr' }}>
              {[
                { label: 'D+4일 (단납기 해제)', value: active.filter(i => parseInt(String(i.lead_days ?? '')) === 4).length, bg: '#fef9e7', color: '#b7770d' },
                { label: '장납기 (D+4일 초과)', value: active.filter(i => parseInt(String(i.lead_days ?? '')) > 4).length, bg: '#eaecf7', color: '#0E217C' },
                { label: '수주정지', value: active.filter(i => i.issue_type === '수주정지').length, bg: '#fbeae8', color: '#C0392B' },
                { label: '평균 해결', value: avgDuration ? `${avgDuration}일` : '-', bg: '#eef6f2', color: '#4a9e72' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ color: c.color, fontSize: 32, fontWeight: 800, margin: 0 }}>{c.value}</p>
                  <p style={{ color: '#6b7280', fontSize: 12, margin: '5px 0 0', fontWeight: 500 }}>{c.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 이슈 품목 등록 ── */}
          <div style={{ ...card, background: '#e8eaf0', padding: '18px 20px' }}>
            <h3 style={{ ...cardTitle, marginBottom: 12, fontSize: 13 }}>이슈 품목 등록</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal('new')} style={{
                flex: 1, background: '#0E217C', color: '#fff', border: 'none', borderRadius: 10,
                padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                boxShadow: '0 2px 8px rgba(74,144,226,0.25)',
              }}>🖱️ 단품 업로드</button>
              <button onClick={() => setCsvImport(true)} style={{
                flex: 1, background: '#fff', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: 10,
                padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>📂 CSV 업로드</button>
            </div>
          </div>

          {/* ── 월별 고객수(수주건수) 입력 ── */}
          <div style={{ ...card, background: '#e8eaf0', padding: '18px 20px' }}>
            <h3 style={{ ...cardTitle, marginBottom: 10, fontSize: 13 }}>월별 고객수(수주건수) 입력</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
              {/* 왼쪽: 연월 + 저장 버튼 */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, flex: '0 0 auto', width: 112 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#374151', fontWeight: 500 }}>
                  연월
                  <input type="month" value={statsForm.year_month}
                    onChange={e => setStatsForm(f => ({ ...f, year_month: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', padding: '8px 8px', fontSize: 12 }} />
                </label>
                <button onClick={saveMonthlyStats} disabled={statsSaving}
                  style={{ ...btnPrimary, opacity: statsSaving ? 0.6 : 1, padding: '8px 14px', fontSize: 12, width: 'fit-content' }}>
                  {statsSaving ? '저장 중...' : '저장'}
                </button>
              </div>
              {/* 오른쪽: 2x2 입력 그리드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 2 }}>
                {[{ k: 'customers_over_d4', l: 'D+4 초과' }, { k: 'customers_within_d4', l: 'D+1→D+4' }, { k: 'customers_unshipped', l: '미출' }, { k: 'customers_total', l: '총 고객수' }].map(({ k, l }) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#374151', fontWeight: 500 }}>{l}
                    <input type="number" min="0" value={statsForm[k]}
                      onChange={e => setStatsForm(f => ({ ...f, [k]: e.target.value }))}
                      style={{ ...inputStyle, width: '100%', padding: '8px 10px', fontSize: 13 }} />
                  </label>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {(modal === 'new' || modal?.edit) && (
        <Modal initial={modal?.edit || null} onClose={() => setModal(null)} onSave={saveIssue} />
      )}
      {resolveModal && (
        <ResolveModal issue={resolveModal} onClose={() => setResolveModal(null)} onSave={resolveIssue} />
      )}
      {csvImport && (
        <CsvImportModal onClose={() => setCsvImport(false)} onImport={importCsv} />
      )}
      {causeModal && (
        <CauseModal issue={causeModal} onClose={() => setCauseModal(null)} onSave={saveCause} />
      )}
      {historyModal && (
        <HistoryModal issue={historyModal} onClose={() => setHistoryModal(null)} />
      )}
      {drilldown && (
        <DrilldownModal title={drilldown.title} list={drilldown.list} onClose={() => setDrilldown(null)} />
      )}
      {kpiStatsModal && (
        <KpiDetailModal row={kpiStatsModal} onClose={() => setKpiStatsModal(null)} />
      )}
      {slideTooltip && (() => {
        const { row, inhibRate, tooltipFields, x, y } = slideTooltip
        const tooltipH = 260
        const top = Math.min(y, window.innerHeight - tooltipH - 12)
        const left = x + 210 > window.innerWidth ? x - 218 - 128 : x
        return (
          <div style={{
            position: 'fixed', top, left, zIndex: 200, pointerEvents: 'none',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.13)', width: 210,
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#1a1d2e' }}>{row.year_month} 전체 수치</p>
            {tooltipFields.map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{f.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.value}</span>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

// ── Styles ──
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  color: '#374151', fontSize: 13, fontWeight: 500,
}
const inputStyle = {
  background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10,
  padding: '9px 12px', color: '#1a1d2e', fontSize: 14, outline: 'none',
  transition: 'border 0.15s',
}
const btnPrimary = {
  background: '#0E217C', color: '#fff', border: 'none', borderRadius: 10,
  padding: '10px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
  boxShadow: '0 2px 8px rgba(74,144,226,0.3)',
}
const btnSecondary = {
  background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10,
  padding: '10px 22px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
}
const btnSmall = {
  background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 7,
  padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 500,
}
const card = {
  background: '#fff', borderRadius: 16,
  padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
}
const cardTitle = {
  color: '#1a1d2e', fontSize: 14, fontWeight: 700, margin: '0 0 14px',
}
