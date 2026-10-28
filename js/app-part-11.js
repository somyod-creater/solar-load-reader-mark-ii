${escapeHtml(num(s.selfCons, 1))}%</div>
        <div class="sub">ผลิตได้ ~${escapeHtml(num(s.prodYear, 0))} kWh/ปี · CO₂ ~${escapeHtml(num(s.carbonTons, 1))} ตัน/ปี</div>
      </div>
    </div>

    <h2>ผลต่อโหลด / พีค</h2>
    <table>
      <thead><tr><th>รายการ</th><th>ค่า</th></tr></thead>
      <tbody>
        <tr><td>Peak โหลดเดิม</td><td>${escapeHtml(num(s.peakOriginal))} kW</td></tr>
        <tr><td>Peak หลังติดตั้ง (${escapeHtml(s.hasBattery ? 'Solar + BESS' : 'Solar only')})</td><td>${escapeHtml(num(s.peakAfter))} kW</td></tr>
        <tr><td>ลด Peak ได้</td><td>${escapeHtml(num(s.peakReduction))} kW</td></tr>
      </tbody>
    </table>

    ${s.hasBattery ? `
    <h2>เปรียบเทียบ Solar only vs Solar + BESS</h2>
    <table>
      <thead><tr><th>Metric</th><th>Solar only</th><th>Solar + BESS</th></tr></thead>
      <tbody>${compareRows}</tbody>
    </table>` : ''}

    <h2>สมมติฐานที่ใช้คำนวณ</h2>
    <div class="assumptions">
      <div><strong>แหล่ง Solar:</strong> ${escapeHtml(s.solarSource)}</div>
      <div><strong>อัตราค่าไฟ:</strong> ${escapeHtml(s.tariffLabel)}</div>
      <ul>
        <li>On-peak ${escapeHtml(num(s.rateOnPeak, 4))} ฿/kWh${s.isTou ? ` · Off-peak ${escapeHtml(num(s.rateOffPeak, 4))} ฿/kWh` : ''}</li>
        <li>Demand charge ${escapeHtml(num(s.demandChargeRate, 2))} ฿/kW/เดือน · Ft ${escapeHtml(num(s.ft, 4))} ฿/kWh</li>
        <li>ต้นทุนโซลาร์ ${escapeHtml(num(s.costWp, 2))} ฿/Wp${s.hasBattery ? ` · แบต ${escapeHtml(num(s.batCost, 0))} ฿/kWh` : ''}</li>
        <li>ไฟล์โหลด: ${files}</li>
      </ul>
    </div>

    ${note ? `<div class="note"><strong>หมายเหตุถึงลูกค้า:</strong> ${escapeHtml(note)}</div>` : `
    <div class="note"><strong>หมายเหตุ:</strong> เอกสารนี้เป็นการประมาณการเบื้องต้นจากข้อมูลและสมมติฐานที่ระบุ ไม่ใช่ใบเสนอราคาผูกพัน — ตัวเลขจริงขึ้นกับสำรวจหน้างาน การออกแบบสุดท้าย และเรทค่าไฟ ณ วันติดตั้ง</div>`}

    <footer class="footer">
      <span>สร้างจาก Solar Load Reader Mark II</span>
      <span>หน้าเดียว · ส่งต่อลูกค้า / พิมพ์เป็น PDF ได้เลย</span>
    </footer>
  </article>
</body>
</html>`;
        }

        function exportProposal(opts) {
            const options = opts || {};
            if (!summaryRevealed) {
                // อนุญาตจากปุ่ม Summary หลัง Run เป็นหลัก — ถ้ายังไม่ Run ให้คำนวณแล้วเปิด Summary ก่อน
                updateDashboard();
                if (!latestSummaryPayload) {
                    alert('ยังไม่มีผลการคำนวณ — กรุณากด Run ที่แท็บ Input Data ก่อน Export ข้อเสนอ');
                    return;
                }
                revealSummaryPanel();
            }
            const model = buildProposalModel();
            if (!model) {
                alert('ยังไม่มีผลการคำนวณ — กรุณากด Run ก่อน Export ข้อเสนอ');
                return;
            }
            if (!model.s.hasLoad && options.skipDraftConfirm !== true) {
                const ok = window.confirm('ยังไม่มีไฟล์โหลด — ข้อเสนอนี้จะติดป้าย "ร่าง" และตัวเลขประหยัดอาจเป็น 0\nต้องการ Export ต่อไหม?');
                if (!ok) return;
            }

            const html = renderProposalHtml(model);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const viewUrl = URL.createObjectURL(blob);
            const downloadUrl = URL.createObjectURL(blob);

            // เปิดหน้าข้อเสนอก่อน (กัน popup blocker) แล้วค่อยดาวน์โหลดไฟล์
            if (options.openPrint !== false) {
                const win = window.open(viewUrl, '_blank');
                if (win) {
                    try { win.focus(); } catch (e) { }
                }
            }

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'Solar_Proposal_' + model.isoDate + '.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => {
                URL.revokeObjectURL(viewUrl);
                URL.revokeObjectURL(downloadUrl);
            }, 60000);
        }

        // Export the whole page as a self-contained, still-interactive HTML file for the customer:
        // the data is embedded (via localStorage seed) so charts, Daily/Weekly toggle, hover & drag all work offline-ish.
        function exportPage() {
            if (!rawDataPoints || rawDataPoints.length === 0) {
                alert('ยังไม่มีข้อมูล — กรุณาอัพโหลดไฟล์และกด Calculate ก่อน Export');
                return;
            }
            // 1) Persist current data so it can be embedded
            saveImportedState((lastUploadedFiles || []).map(f => f.name));
            const savedState = localStorage.getItem('solarLoadReaderImportedState');

            // 2) Freeze current input values into HTML attributes so they survive serialization
            document.querySelectorAll('input, select').forEach(el => {
                if (el.tagName === 'SELECT') {
                    Array.from(el.options).forEach(o => o.value === el.value ? o.setAttribute('selected', 'selected') : o.removeAttribute('selected'));
                } else if (el.type === 'checkbox') {
                    el.checked ? el.setAttribute('checked', 'checked') : el.removeAttribute('checked');
                } else {
                    el.setAttribute('value', el.value);
                }
            });

            // 3) Clone the document; clear Plotly divs so they re-render cleanly on open
            const clone = document.documentElement.cloneNode(true);
            clone.querySelectorAll('[id^="chart"], [id^="plant-chart"]').forEach(d => { d.innerHTML = ''; });
            const dz = clone.querySelector('#dropzone'); if (dz) dz.style.display = 'none';
            const eb = clone.querySelector('#exportBtn'); if (eb) eb.style.display = 'none';

            // 4) Bootstrap script (runs before the app) that seeds localStorage with the embedded data
            const safeState = JSON.stringify(savedState).replace(/</g, '\\u003c');
            const boot = document.createElement('script');
            // Embed as a global (works even when localStorage is blocked on file://). restoreImportedState() reads it first.
            boot.textContent = 'window.__SOLAR_STATE__ = ' + safeState + ';';
            const head = clone.querySelector('head');
            // Insert AFTER <meta charset> (keep charset in the first bytes so Thai text isn't garbled),
            // but still before the app script so restoreImportedState() finds the seeded data.
            const charsetMeta = head.querySelector('meta[charset]');
            if (charsetMeta) head.insertBefore(boot, charsetMeta.nextSibling);
            else head.insertBefore(boot, head.firstChild);

            // 5) Download
            const html = '<!DOCTYPE html>\n' + clone.outerHTML;
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Solar_Report_' + new Date().toISOString().slice(0, 10) + '.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'button') {
                    return;
                }
                fileInput.click();
            });

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    handleFileUpload(Array.from(e.dataTransfer.files));
                }
            });

            fileInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileUpload(Array.from(e.target.files));
                    fileInput.value = '';
                }
            });
        }

        // --- Current (Amp) load file: its own dropzone, separate from the Excel one ---
        const currentDropzone = document.getElementById('currentDropzone');
        const currentFileInput = document.getElementById('currentFileInput');

        if (currentDropzone && currentFileInput) {
            currentDropzone.addEventListener('click', (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'button') return;
                currentFileInput.click();
            });
            currentDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                currentDropzone.classList.add('dragover');
            });
            currentDropzone.addEventListener('dragleave', () => {
                currentDropzone.classList.remove('dragover');
            });
            currentDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                currentDropzone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) proceedWithLoadUpload(Array.from(e.dataTransfer.files), true);
            });
            currentFileInput.addEventListener('click', (e) => e.stopPropagation());
            currentFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    proceedWithLoadUpload(Array.from(e.target.files), true);
                    currentFileInput.value = '';
                }
            });
        }

        // --- PVSyst Simulation (E_Grid) Upload & Parsing ---
        const pvsystDropzone = document.getElementById('pvsystDropzone');
        const pvsystFileInput = document.getElementById('pvsystFileInput');

        if (pvsystDropzone && pvsystFileInput) {
            pvsystDropzone.addEventListener('click', (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'button') {
                    return;
                }
                pvsystFileInput.click();
            });

            pvsystDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                pvsystDropzone.classList.add('dragover');
            });

            pvsystDropzone.addEventListener('dragleave', () => {
                pvsystDropzone.classList.remove('dragover');
            });

            pvsystDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                pvsystDropzone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    handlePVSystUpload(Array.from(e.dataTransfer.files));
                }
            });

            pvsystFileInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            pvsystFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handlePVSystUpload(Array.from(e.target.files));
                    pvsystFileInput.value = '';
                }
            });
        }

        function parsePVSystContent(textOrBuffer, fileName) {
            let text = '';
            if (typeof textOrBuffer === 'string') {
                text = textOrBuffer;
            } else {
                const bytes = new Uint8Array(textOrBuffer);
                try {
                    if (fileName && (fileName.toLowerCase().endsWith('.xl