: 'rgba(231,76,60,0.15)');
            var lede = level === 'yes'
                ? ('จากข้อมูล FusionSolar จริง คุ้มค่าที่จะเก็บไฟส่วนเกินไว้ใช้เอง — ขนาดที่เริ่มพิจารณาประมาณ <b>' + recCapacity + ' kWh / ' + recPower + ' kW</b>')
                : (level === 'maybe'
                    ? ('มีสัญญาณบ้างแต่ยังไม่ชัดทุกข้อ — ถ้าจะลอง เริ่มที่ประมาณ <b>' + recCapacity + ' kWh / ' + recPower + ' kW</b> แล้วเทียบ payback อีกครั้ง')
                    : ('ตอนนี้ surplus / พีค / payback ยังไม่แข็งแรงพอจะผลักให้ติดแบตทันที (คะแนน ' + score + '/4)'));
            var meta = 'ประหยัดจากแบตโดยประมาณ ฿' + fmtNum(totalSavingPerYear) + '/ปี'
                + (paybackYears < 100 ? ' · Payback ~' + paybackYears.toFixed(1) + ' ปี' : ' · Payback N/A')
                + ' · แนะนำ ' + recCapacity + ' kWh / ' + recPower + ' kW';

            if (verdictEl) {
                verdictEl.style.background = bg;
                verdictEl.style.border = '2px solid ' + border;
                verdictEl.innerHTML =
                    '<div style="color:' + tone + '; font-size:20px; margin-bottom:6px;">' + title + '</div>'
                    + '<div style="font-size:13.5px; color:#d0d7de; font-weight:500; margin-bottom:8px;">' + lede + '</div>'
                    + '<div style="font-size:12.5px; color:#8892b0; font-weight:500;">' + meta + '</div>'
                    + (reasons.length
                        ? '<div style="margin-top:10px; font-size:12px; color:#8892b0; font-weight:normal;">เหตุผล: ' + reasons.join(' · ') + '</div>'
                        : '');
            }

            latestBatteryVerdict = {
                level: level,
                title: title,
                lede: lede.replace(/<\/?b>/g, ''),
                meta: meta,
                reasons: reasons,
                recCapacity: recCapacity,
                recPower: recPower,
                paybackYears: paybackYears,
                saveYear: totalSavingPerYear
            };
            syncSummaryBatteryCard();
        }

        function syncSummaryBatteryCard() {
            const card = document.getElementById('summaryBatteryCard');
            const box = document.getElementById('summaryBatteryVerdict');
            if (!card || !box) return;
            if (!latestBatteryVerdict) {
                card.hidden = true;
                return;
            }
            const v = latestBatteryVerdict;
            card.hidden = false;
            box.classList.remove('is-yes', 'is-maybe', 'is-no');
            box.classList.add(v.level === 'yes' ? 'is-yes' : (v.level === 'maybe' ? 'is-maybe' : 'is-no'));
            const titleEl = document.getElementById('summaryBatteryTitle');
            const ledeEl = document.getElementById('summaryBatteryLede');
            const metaEl = document.getElementById('summaryBatteryMeta');
            if (titleEl) titleEl.textContent = v.title;
            if (ledeEl) ledeEl.textContent = v.lede;
            if (metaEl) metaEl.textContent = v.meta + (v.reasons.length ? ' · ' + v.reasons.join(' · ') : '');
        }


        function replotCharts() {
            // Re-generate traces for Chart 1
            const traces1 = [];
            traces1.push({ x: times, y: data.overall_mean, mode: 'lines', name: '<b>Overall Avg Load</b>', line: { shape: 'spline', color: 'black', width: 4 } });
            Object.keys(data.months).forEach(m => {
                traces1.push({ x: times, y: data.months[m], mode: 'lines', name: `${monthsAreSolar ? 'Solar' : 'Avg Load'} - ${m}`, line: { shape: 'spline', width: 2 }, visible: 'legendonly' });
            });

            // Placeholder trace for solar curve (to be restyled by updateDashboard)
            traces1.push({
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: `<b>Solar Gen</b>`, line: { shape: 'spline', color: '#4fc3f7', width: 3, dash: 'dot' },
                fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.25)'
            });
            solarTraceIndex = traces1.length - 1;

            traces1.push({
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: `<b>Solar Gen (Formula)</b>`, line: { shape: 'spline', color: '#8b5cf6', width: 2.5, dash: 'dash' },
                visible: false
            });
            compareTraceIndex = traces1.length - 1;

            Plotly.newPlot('chart1', traces1, LAYOUT_1(), PLOT_CONFIG);

            // Re-generate Chart 3
            const chart3Traces = [
                { x: times, y: data.overall_mean, mode: 'lines', name: '<b>Average Load</b>', line: { shape: 'spline', color: 'black', width: 3 } },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Solar Gen (Used)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 2, dash: 'dot' }, fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.2)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Solar Gen (Potential)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 1, dash: 'dash' }, fill: 'tonexty', fillcolor: 'rgba(255, 50, 50, 0.25)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Net Load (Solar Only)</b>', line: { shape: 'spline', color: '#ff6d00', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(255, 109, 0, 0.15)' }
            ];
            Plotly.newPlot('chart3', chart3Traces, LAYOUT_3(), PLOT_CONFIG);

            // Re-generate Chart 4
            const chart4Traces = [
                { x: times, y: data.overall_mean, mode: 'lines', name: '<b>Average Load</b>', line: { shape: 'spline', color: 'black', width: 3 } },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Solar Gen (Direct Load)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 2, dash: 'dot' }, fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.2)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Solar Gen (BESS Charge)</b>', line: { shape: 'spline', color: '#4caf50', width: 1, dash: 'dash' }, fill: 'tonexty', fillcolor: 'rgba(76, 175, 80, 0.25)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>▼ Wasted Solar (Curtailment)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 1, dash: 'dash' }, fill: 'tonexty', fillcolor: 'rgba(229, 57, 53, 0.28)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Net Load (Solar + BESS)</b>', line: { shape: 'spline', color: '#ff6d00', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(255, 109, 0, 0.15)' },
                { x: times, y: Array(times.length).fill(0), customdata: Array(times.length).fill(0), mode: 'lines', name: '<b>🔻 Peak Shaving Shaved</b>', line: { shape: 'spline', color: 'rgba(0,0,0,0)', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(233, 30, 99, 0.18)', hovertemplate: 'Peak Shaved: %{customdata:.0f} kW<extra></extra>' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Battery Discharge</b>', line: { shape: 'spline', color: '#e91e63', width: 2, dash: 'solid' } },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Battery SOC (%)</b>', line: { shape: 'spline', color: '#9c27b0', width: 2, dash: 'dashdot' }, yaxis: 'y2' }
            ];
            Plotly.newPlot('chart4', chart4Traces, LAYOUT_4(), PLOT_CONFIG);

            // Re-generate Chart 6 (Battery operation)
            const chart6Traces = [
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🟢 BESS Charge</b>', line: { shape: 'spline', color: '#4caf50', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(76, 175, 80, 0.30)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🔴 BESS Discharge</b>', line: { shape: 'spline', color: '#e91e63', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(233, 30, 99, 0.30)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🔋 Battery SOC (%)</b>', line: { shape: 'spline', color: '#9c27b0', width: 3, dash: 'dashdot' }, yaxis: 'y2' }
            ];
            Plotly.newPlot('chart6', chart6Traces, LAYOUT_6(), PLOT_CONFIG);

            // Re-generate Chart 5
            const chart5Traces = [
                { x: times, y: data.overall_mean, mode: 'lines', name: '<b>Average Load (Reference)</b>', line: { shape: 'spline', color: 'black', width: 2, dash: 'dash' } },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Net Load (Solar Only)</b>', line: { shape: 'spline', color: '#2196f3', width: 3 }, fill: 'tonexty', fillcolor: 'rgba(33, 150, 243, 0.1)' },
                { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>Net Load (Solar + BESS)</b>', line: { shape: 'spline', color: '#4caf50', width: 3 }, fill: 'tonexty', fillcolor: 'rgba(76, 175, 80, 0.15)' }
            ];
            Plotly.newPlot('chart5', chart5Traces, LAYOUT_5(), PLOT_CONFIG);
        }

        async function loadHouseholdSample(opts) {
            const options = opts || {};
            const statusEl = document.getElementById('uploadStatus');
            const btn = document.getElementById('btnLoadHouseholdSample');
            const topBtn = document.getElementById('btnLoadHouseholdSampleTop');
            if (btn) btn.disabled = true;
            if (topBtn) topBtn.disabled = true;
            if (topBtn) topBtn.textContent = 'กำลังใส่ข้อมูล...';
            if (statusEl) {
                statusEl.classList.remove('is-warn');
                statusEl.innerHTML = '⏳ กำลังใส่ข้อมูลตัวอย่างบ้านเรือน (ก.ย. 2026)...';
            }
            try {
                const res = await fetch('sample-data/household_load_sep2026.xlsx', { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const buf = await res.arrayBuffer();
                const file = new File([buf], 'household_load_sep2026.xlsx', {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                // ขนาดบ้านเริ่มต้นที่สมเหตุสมผลกับโหลดตัวอย่าง
                const invType = document.getElementById('inverterType');
                if (invType) {
                    invType.value = 'on_grid';
                    if (typeof toggleInverterType === 'function') toggleInverterType();
                }
                const kwp = document.getElementById('kwpInput');
                const inv = document.getElementById('invInput');
                const cost = document.getElementById('costInput');
                const tariff = document.getElementById('tariffProfile');
                if (kwp) kwp.value = '3';
                if (inv) inv.value = '3';
                if (cost) cost.value = '35';
                if (tariff && [...tariff.options].some(o => o.value === 'pea_1_2_2')) {
                    tariff.value = 'pea_1_2_2';
                    if (typeof onTariffProfileChange === 'function') onTariffProfileChange();
                }
                const pn = document.getElementById('proposalProjectName');
                const cn = document.getElementById('proposalClientName');
                if (pn && !pn.value) pn.value = 'บ้านตัวอย่าง — โหลด ก.ย. 2026';
                if (cn && !cn.value) cn.value = 'คุณทดสอบ';

                lastUploadWasCurrentZone = false;
                handleFileUpload([file]);

                // รอให้ parse เสร็จก่อน Run
                const waitLoad = async () => {
                    for (let i = 0; i < 80; i++) {
                        if (Array.isArray(rawDataPoints) && rawDataPoints.length >= 700) return true;
                        await new Promise(r => setTimeout(r, 100));
                    }
                    return Array.isArray(rawDataPoints) && rawDataPoints.length > 0;
                };
                const ok = await waitLoad();
                if (!ok) th