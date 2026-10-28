  const battKwh = battery ? units(battery.net) : null;

            const line = (y, name, color, dash) => ({
                x: plotData.x, y, type: 'scatter', mode: 'lines', name,
                line: Object.assign({ color, width: 2 }, dash ? { dash } : {}),
                fill: 'tozeroy', fillcolor: plotFillColor(color, 0.12),
                connectgaps: false
            });

            const traces = [
                line(nowBuy, `ปัจจุบัน ${fmtKwh(nowKwh)} หน่วย/วัน`, '#EB85FF'),
                line(afterBuy, `หลังติดโซลาร์ ${fmtKwh(afterKwh)} หน่วย/วัน`, '#FFB020', 'dot')
            ];
            if (battBuy) {
                traces.push(line(battBuy,
                    `หลังโซลาร์ + แบต ${fmtKwh(battKwh)} หน่วย/วัน`, '#2DD4BF'));
            }
            const top3 = [nowBuy, afterBuy, battBuy].reduce((m, y) => {
                const p = y ? peakOf(y) : null;
                return p && p.value > m ? p.value : m;
            }, 0);
            const marks3raw = [
                peakMarker(nowBuy, 'ปัจจุบัน', '#EB85FF', top3),
                peakMarker(afterBuy, 'หลังโซลาร์', '#FFB020', top3)
            ];
            if (battBuy) marks3raw.push(peakMarker(battBuy, 'หลังแบต', '#2DD4BF', top3));
            const marks3 = layoutPeakMarkers(marks3raw);

            const finalKwh = battBuy ? battKwh : afterKwh;
            const saved = nowKwh - finalKwh;
            const pct = nowKwh > 0 ? (saved / nowKwh) * 100 : 0;
            const bits = [];
            bits.push(`เทียบกับ ${load.name}`);
            if (days > 1) bits.push(`เฉลี่ยจาก ${days} วันในไฟล์`);

            const ann = [];
            ann.push({
                xref: 'paper', yref: 'paper', x: 0.02, y: 0.98,
                xanchor: 'left', yanchor: 'top', showarrow: false, align: 'left',
                text: `⚡ <b>ไฟที่ยังต้องซื้อ</b><br>` +
                    `ปัจจุบัน <b>${fmtKwh(nowKwh)}</b> → เหลือ <b>${fmtKwh(finalKwh)} หน่วย/วัน</b><br>` +
                    `ลดลง <b>${fmtKwh(saved)} หน่วย/วัน</b> (${pct.toFixed(1)}%)`,
                bgcolor: 'rgba(88, 166, 255, 0.92)', bordercolor: '#58A6FF', borderwidth: 1,
                borderpad: 5, font: { color: '#fff', size: 11 }
            });

            Plotly.react('plot-chart-3', traces,
                plotAxisLayout('⚡ ไฟที่ยังต้องซื้อจากการไฟฟ้า',
                    bits.join(' · '), 'Power (kW)', ann),
                PLOT_CONFIG);
            registerPlotPeaks('plot-chart-3', traces, marks3, ann);
            setTimeout(() => { try { Plotly.Plots.resize('plot-chart-3'); } catch (e) { } }, 30);
        }

        function readPlotFile(file) {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
                        const sheet = wb.Sheets[wb.SheetNames[0]];
                        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
                        const parsed = parsePlotGrid(grid);
                        resolve({ name: file.name, parsed });
                    } catch (err) {
                        console.error('plot read failed for ' + file.name, err);
                        resolve({ name: file.name, parsed: null, error: err && err.message ? err.message : String(err) });
                    }
                };
                reader.onerror = () => resolve({ name: file.name, parsed: null, error: 'read error' });
                reader.readAsArrayBuffer(file);
            });
        }

        async function handlePlotUpload(files) {
            const list = Array.from(files || []);
            if (list.length === 0) return;
            const statusEl = document.getElementById('plotStatus');
            if (statusEl) statusEl.innerHTML = `⏳ กำลังอ่าน ${list.length} ไฟล์...`;

            const results = await Promise.all(list.map(readPlotFile));
            const ok = results.filter(r => r.parsed);
            const skipped = results.filter(r => !r.parsed);

            if (ok.length === 0) {
                plotData = null;
                if (statusEl) statusEl.innerHTML = `❌ ไม่พบคอลัมน์ตัวเลขในไฟล์ที่เลือก`;
                renderPlotSeriesList();
                drawPlotChart();
                return;
            }

            plotData = ok.length === 1 ? ok[0].parsed : mergePlotFiles(ok.map(r => r.parsed));
            if (!plotData) {
                if (statusEl) statusEl.innerHTML = `❌ รวมข้อมูลไม่สำเร็จ`;
                renderPlotSeriesList();
                drawPlotChart();
                return;
            }

            if (statusEl) {
                let html = `<div style="color:#86efac;font-weight:600;margin-bottom:4px;">✅ อ่านไฟล์สำเร็จ</div>`;
                if (plotData.averaged) {
                    const counts = plotData.slotFiles || [];
                    const lo = counts.length ? Math.min.apply(null, counts) : 0;
                    const hi = counts.length ? Math.max.apply(null, counts) : 0;
                    html += `📄 ${ok.length} ไฟล์ · เฉลี่ยตามเวลาในวัน<br>` +
                        `🕐 ${plotData.x[0]} → ${plotData.x[plotData.x.length - 1]} · ${plotData.rows} ช่วงเวลา<br>` +
                        `📊 แต่ละช่วงเฉลี่ยจาก ${lo === hi ? lo : lo + '–' + hi} ไฟล์ (ชี้ที่กราฟเพื่อดูรายจุด)`;
                } else {
                    const p = plotData;
                    const span = p.xIsTime && p.x[0] && p.x[p.x.length - 1]
                        ? `${p.x[0].toLocaleString()} → ${p.x[p.x.length - 1].toLocaleString()}`
                        : `${p.rows.toLocaleString()} แถว`;
                    html += `📄 ${ok[0].name}<br>📅 ${span}<br>📊 ${p.rows.toLocaleString()} แถว · ` +
                        `${p.series.length} คอลัมน์ตัวเลข (เลือกไว้ ${p.series.filter(x => x.selected).length})`;
                }
                if (skipped.length) {
                    html += `<div style="margin-top:6px;color:#FCD48A;">⚠️ ข้าม ${skipped.length} ไฟล์ที่ไม่มีข้อมูล: ` +
                        skipped.map(r => r.name).join(', ') + `</div>`;
                }
                statusEl.innerHTML = html;
            }
            renderPlotSeriesList();
            drawPlotChart();
        }

        function clearPlotData() {
            plotData = null;
            const statusEl = document.getElementById('plotStatus');
            if (statusEl) statusEl.innerHTML = 'ยังไม่ได้อัปโหลดไฟล์';
            renderPlotSeriesList();
            drawPlotChart();
        }

        (function wirePlotDropzone() {
            const dz = document.getElementById('plotDropzone');
            const input = document.getElementById('plotFileInput');
            if (!dz || !input) return;
            dz.addEventListener('click', (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'button') return;
                input.click();
            });
            dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                dz.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) handlePlotUpload(Array.from(e.dataTransfer.files));
            });
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    // copy before clearing: input.files is live (see the load importers)
                    handlePlotUpload(Array.from(e.target.files));
                    input.value = '';
                }
            });
            drawPlotChart();
        })();

        function processDataPoints(points, files) {
            buildWeekdayDateSuffix(points);
            const timeGroups = {};
            const monthGroups = {};
            const boxGroups = {};
            let middayValues = [];

            points.forEach(p => {
                const dt = p.datetime;
                const hr = dt.getHours();
                const min = dt.getMinutes();
                const clockStr = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                const timeStr = profileSlotLabel(dt, clockStr);

                const monthStr = `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}`;

                if (!timeGroups[timeStr]) timeGroups[timeStr] = [];
                timeGroups[timeStr].push(p.kw);

                if (!monthGroups[monthStr]) monthGroups[monthStr] = {};
                if (!monthGroups[monthStr][timeStr]) monthGroups[monthStr][timeStr] = [];
                monthGroups[monthStr][timeStr].push(p.kw);

                if (!boxGroups[monthStr]) boxGroups[monthStr] = [];
                boxGroups[monthStr].push(p.kw);

                if (hr >= 10 && hr < 14) {
                    middayValues.push(p.kw);
                }
            });

            // Weekly always spans Mon-Sun. Using only the slots the file happens to
            // cover squeezes a part week across the full width, so the days no longer
            // line up with the grid and a missing weekday just vanishes. Build the whole
            // week and leave uncovered slots at 0.
            const time_strs = (netLoadPeriod === 'weekly')
                ? buildFullWeekSlots(points)
                : Object.keys(timeGroups).sort(sortProfileSlots);

            const overall_mean = time_strs.map(t => {
                const vals = timeGroups[t];
                if (!vals || vals.length === 0) return 0;
                return vals.reduce((a, b) => a + b, 0) / vals.length;
            });

            const months_data = {};
            Object.keys(monthGroups).forEach(m => {
                months_data[m] = time_strs.map(t => {
                    const vals = monthGroups[m][t] || [0];
                    return vals.reduce((a, b) => a + b, 0) / vals.length;
                });
            });

            const box_data = {};
            Object.keys(boxGroups).forEach(m => {
                box_data[m] = boxGroups[m];
            });

            const validMidday = middayValues.filter(v => v > 0);
            const midday_min = validMidday.length > 0 ? Math.min(...validMidday) : 0;

            // Overwrite page data variables
            monthsAreSolar = false;
            data.time_strs = time_strs;
            data.overall_mean = overall_mean;
            data.months = months_data;
            data.box_data = box_data;
            data.midday_min = midday_min;

            // Re-map times and hours global variables
            times.length = 0;
            times.push(...time_strs);

            hours.length = 0;
            hours.push(...times.map(t => timeSlotToHour(t)));

            // Re-render Plotly charts
            replotCharts();

            // Update calculations on Dashboard (guarded so a dashboard error can't block chart7)
            try {

                updateDashboard();
            } catch (err) {
                console.error('updateDashboard() failed during import — charts may be incomplete', err);
            }

            // Defer heavy Plant Report charts until the Plant Report tab is opened.
            plantReportNeedsRender = true;
            if (document.getElementById('tab-plant').classList.contains('active')) {
                try { renderPlantReport(plantReportData); } catch (err) { console.error('renderPlantReport() failed', err); }
            }
            // Always render Imported Net Load, even if the steps above threw
            try {
                renderImportedNetLoad(importedNetLoadData || plantReportData);
            } catch (err) {
                console.error('renderImportedNetLoad() 