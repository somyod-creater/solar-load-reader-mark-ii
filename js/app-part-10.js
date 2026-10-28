         console.warn('Could not save imported state', err);
            }
        }

        function restoreImportedState() {
            try {
                // Prefer embedded state (exported reports); fall back to localStorage (normal use).
                const raw = (typeof window !== 'undefined' && window.__SOLAR_STATE__) || localStorage.getItem('solarLoadReaderImportedState');
                if (!raw) return false;
                const payload = JSON.parse(raw);
                // Discard stale state saved by an older/buggy version — force a clean re-upload.
                if (!payload || payload.version !== IMPORT_STATE_VERSION) {
                    localStorage.removeItem('solarLoadReaderImportedState');
                    return false;
                }

                if (payload.importedPVSystData) {
                    importedPVSystData = payload.importedPVSystData;
                    activeSolarSource = payload.activeSolarSource || 'pvsyst';
                    updatePVSystUI();
                }

                if (!payload.rawDataPoints || payload.rawDataPoints.length === 0) {
                    if (importedPVSystData) {
                        updateDashboard();
                        return true;
                    }
                    return false;
                }

                rawDataPoints = payload.rawDataPoints.map(p => ({
                    datetime: new Date(p.datetime),
                    kw: p.kw
                }));
                plantReportData = deserializeReportData(payload.plantReportData);
                importedNetLoadData = deserializeReportData(payload.importedNetLoadData);
                lastUploadedFiles = (payload.fileNames || []).map(name => ({ name }));
                lastAmpConversion = payload.ampConversion || null;
                if (lastAmpConversion) {
                    const vEl = document.getElementById('sysVoltageInput');
                    const pfEl = document.getElementById('powerFactorInput');
                    if (vEl) vEl.value = lastAmpConversion.voltage;
                    if (pfEl) pfEl.value = lastAmpConversion.pf;
                }
                rawDataPoints.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
                processDataPoints(rawDataPoints, lastUploadedFiles);
                return true;
            } catch (err) {
                console.warn('Could not restore imported state', err);
                return false;
            }
        }

        function escapeHtml(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function buildProposalModel() {
            if (!latestSummaryPayload) updateDashboard();
            const s = latestSummaryPayload;
            if (!s) return null;

            const projectName = (document.getElementById('proposalProjectName')?.value || '').trim() || 'โครงการโซลาร์เซลล์';
            const clientName = (document.getElementById('proposalClientName')?.value || '').trim() || 'ลูกค้า';
            const preparedBy = (document.getElementById('proposalPreparedBy')?.value || '').trim() || 'ทีมขาย / วิศวกรโครงการ';
            const note = (document.getElementById('proposalNote')?.value || '').trim();
            const today = new Date();
            const dateTh = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

            return { s, projectName, clientName, preparedBy, note, dateTh, isoDate: today.toISOString().slice(0, 10) };
        }

        function renderProposalHtml(model) {
            const { s, projectName, clientName, preparedBy, note, dateTh } = model;
            const fmt = (n) => formatter.format(Number(n) || 0);
            const num = (n, d = 1) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });
            const files = (s.fileNames && s.fileNames.length)
                ? s.fileNames.map(escapeHtml).join(', ')
                : 'ยังไม่ได้อัปโหลดไฟล์โหลด — ใช้ค่าตั้งต้น/สมมติฐาน';

            const sizeLines = [
                `โซลาร์ ${num(s.kwp, 2)} kWp`,
                `อินเวอร์เตอร์ ${num(s.invLimit, 1)} kW`
            ];
            if (s.hasBattery) {
                sizeLines.push(`แบตเตอรี่ ${num(s.batCap, 1)} kWh / ${num(s.batPower, 1)} kW`);
            }

            const compareRows = s.hasBattery ? `
              <tr>
                <td>ต้นทุนระบบ</td>
                <td>${escapeHtml(fmt(s.scenarioSolarOnly.cost))}</td>
                <td>${escapeHtml(fmt(s.scenarioWithBess.cost))}</td>
              </tr>
              <tr>
                <td>ประหยัดต่อปี</td>
                <td>${escapeHtml(fmt(s.scenarioSolarOnly.saveYear))}</td>
                <td>${escapeHtml(fmt(s.scenarioWithBess.saveYear))}</td>
              </tr>
              <tr>
                <td>Payback</td>
                <td>${escapeHtml(s.scenarioSolarOnly.paybackStr)}</td>
                <td>${escapeHtml(s.scenarioWithBess.paybackStr)}</td>
              </tr>
              <tr>
                <td>Peak หลังติดตั้ง</td>
                <td>${escapeHtml(num(s.scenarioSolarOnly.peak))} kW</td>
                <td>${escapeHtml(num(s.scenarioWithBess.peak))} kW</td>
              </tr>` : '';

            return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ข้อเสนอเบื้องต้น — ${escapeHtml(projectName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #142033;
    --muted: #5b6b7f;
    --line: #d7dee8;
    --sand: #f4f7fb;
    --card: #ffffff;
    --accent: #0f766e;
    --accent-soft: #ecfdf5;
    --amber: #b45309;
    --amber-soft: #fff7ed;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background: #e8eef5;
    font-family: 'Noto Sans Thai', 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.55;
  }
  .sheet {
    max-width: 820px;
    margin: 24px auto;
    background: var(--card);
    border: 1px solid var(--line);
    box-shadow: 0 18px 40px rgba(20, 32, 51, 0.08);
    padding: 36px 40px 28px;
  }
  .toolbar {
    max-width: 820px;
    margin: 16px auto 0;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .toolbar button {
    border: 1px solid var(--line);
    background: #fff;
    padding: 8px 14px;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
  }
  .toolbar button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .draft-banner {
    background: #fff1f2;
    border: 1px solid #fda4af;
    color: #9f1239;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 14px;
  }
  .brand-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .brand-name {
    font-family: 'Chakra Petch', sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .brand-sub { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
  .meta { text-align: right; font-size: 12.5px; color: var(--muted); }
  .meta strong { color: var(--ink); font-weight: 600; }
  h1 {
    font-family: 'Chakra Petch', sans-serif;
    font-size: 26px;
    margin: 0 0 6px;
    letter-spacing: 0.02em;
  }
  .lede { color: var(--muted); margin: 0 0 18px; max-width: 58ch; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 18px 0 22px;
  }
  .kpi {
    background: var(--sand);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .kpi.accent { background: var(--amber-soft); border-color: #fdba74; }
  .kpi .label { font-size: 11.5px; color: var(--muted); margin-bottom: 4px; }
  .kpi .value {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 20px;
    font-weight: 600;
  }
  .kpi .sub { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
  h2 {
    font-family: 'Chakra Petch', sans-serif;
    font-size: 15px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 22px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th, td {
    border-bottom: 1px solid var(--line);
    padding: 8px 6px;
    text-align: left;
    vertical-align: top;
  }
  th { color: var(--muted); font-weight: 600; font-size: 12px; }
  .assumptions {
    background: var(--accent-soft);
    border: 1px solid #99f6e4;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 12.5px;
  }
  .assumptions ul { margin: 6px 0 0; padding-left: 18px; }
  .note {
    margin-top: 16px;
    padding: 12px 14px;
    border-left: 3px solid var(--amber);
    background: var(--amber-soft);
    font-size: 13px;
  }
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 11.5px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet {
      margin: 0;
      border: 0;
      box-shadow: none;
      max-width: none;
      padding: 0;
    }
  }
  @media (max-width: 640px) {
    .sheet { margin: 0; border: 0; border-radius: 0; padding: 22px 18px; }
    .kpi-grid { grid-template-columns: 1fr; }
    .brand-row { flex-direction: column; }
    .meta { text-align: left; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">พิมพ์ / บันทึก PDF</button>
  </div>
  <article class="sheet">
    ${s.hasLoad ? '' : `<div class="draft-banner">ร่าง — ยังไม่มีไฟล์โหลด · ตัวเลขประหยัด/พีคยังไม่สะท้อนการใช้งานจริง อย่าส่งให้ลูกค้าจนกว่าจะอัปโหลดโหลดแล้ว Run ใหม่</div>`}
    <header class="brand-row">
      <div>
        <div class="brand-name">Solar Load Reader</div>
        <div class="brand-sub">ข้อเสนอเบื้องต้น · Mark II${s.hasLoad ? '' : ' · ร่าง'}</div>
      </div>
      <div class="meta">
        <div>วันที่ <strong>${escapeHtml(dateTh)}</strong></div>
        <div>เตรียมโดย <strong>${escapeHtml(preparedBy)}</strong></div>
      </div>
    </header>

    <h1>${escapeHtml(projectName)}</h1>
    <p class="lede">สำหรับ <strong>${escapeHtml(clientName)}</strong> — สรุปขนาดระบบที่เสนอ ประมาณการประหยัด และระยะเวลาคืนทุนจากสมมติฐานด้านล่าง</p>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">ขนาดที่เสนอ</div>
        <div class="value">${escapeHtml(num(s.kwp, 2))} kWp</div>
        <div class="sub">${escapeHtml(sizeLines.slice(1).join(' · '))}</div>
      </div>
      <div class="kpi accent">
        <div class="label">ประหยัดโดยประมาณ / ปี</div>
        <div class="value">${escapeHtml(fmt(s.saveYear))}</div>
        <div class="sub">เฉลี่ย ${escapeHtml(fmt(s.saveMonth))} / เดือน · โหมด ${escapeHtml(s.hasBattery ? 'Solar + BESS' : 'Solar only')}</div>
      </div>
      <div class="kpi">
        <div class="label">Payback</div>
        <div class="value" style="font-size:18px;">${escapeHtml(s.paybackStr)}</div>
        <div class="sub">ต้นทุนประมาณ ${escapeHtml(fmt(s.cost))}</div>
      </div>
      <div class="kpi">
        <div class="label">Self-consumption</div>
        <div class="value">