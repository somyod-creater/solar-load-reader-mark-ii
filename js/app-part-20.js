>
                peakMarker(t.y, selected[i].name.split(/[（(]/)[0].trim(), selected[i].color, top1)));
            Plotly.react('plot-chart', traces1, plotAxisLayout(
                '📊 Average Daily Load Profile',
                plotData.averaged
                    ? `เฉลี่ยตามเวลาในวันจาก ${plotData.fileCount} ไฟล์ · ${plotData.rows.toLocaleString()} ช่วงเวลา`
                    : `ข้อมูลดิบ ${plotData.rows.toLocaleString()} แถว · ${plotData.series.length} คอลัมน์ตัวเลข`,
                'Power (kW)'), PLOT_CONFIG);
            registerPlotPeaks('plot-chart', traces1, marks1, []);

            const traces2 = gridSeries.map(plotSeriesTrace);
            const bits = [];
            if (gridSeries.length) bits.push('Grid' + (plotGridFlipped() ? ' (ขายไฟ = บวก)' : ' (ขายไฟ = ลบ)'));
            if (solarTrace) bits.push(solarTrace.name);

            const curtail = solarTrace ? plotCurtailment(solarTrace.y) : null;
            const battery = solarTrace ? plotBatterySim(solarTrace.y) : null;
            const sun = solarTrace ? plotSolarCurves() : null;
            const ann2 = [];

            // Every shaded region on this chart means one of exactly two things - the
            // battery took it, or it was thrown away - and those two colours are used for
            // nothing else, on the AC side and the DC side alike. Each legend entry
            // carries that side's running total, so changing the battery moves every
            // number on the chart instead of leaving a headline that answers to nothing.
            const STORED_FILL = 'rgba(45, 212, 191, 0.34)';
            const SPILT_FILL = 'rgba(229, 57, 53, 0.30)';

            const stepH = plotStepHours();
            const dayN = plotDayCount();
            const surplusAcDay = curtail ? curtail.kwhDay : 0;
            const clipDay = (sun && sun.clips && stepH > 0)
                ? sun.clip.reduce((a, v) => a + (v == null ? 0 : v * stepH), 0) / dayN
                : 0;
            const dcGenDay = (sun && stepH > 0)
                ? sun.dc.reduce((a, v) => a + (v == null ? 0 : v * stepH), 0) / dayN
                : 0;
            const storedDay = battery ? battery.storedDay : 0;
            const surplusDay = surplusAcDay + clipDay;
            const wastedDay = surplusDay - storedDay;

            if (curtail && curtail.kwhDay > 0) {
                // The lower edge the AC bands rest on. It is the load wherever the array
                // overshoots it, so the bands cover exactly the overshoot.
                traces2.push({
                    x: plotData.x, y: curtail.base,
                    type: 'scatter', mode: 'lines', line: { width: 0 },
                    showlegend: false, hoverinfo: 'skip', connectgaps: false
                });
                if (battery) {
                    traces2.push({
                        x: plotData.x,
                        y: curtail.base.map((b, i) =>
                            (b == null || battery.chargeAc[i] == null) ? null : b + battery.chargeAc[i]),
                        type: 'scatter', mode: 'lines', line: { width: 0 },
                        fill: 'tonexty', fillcolor: STORED_FILL,
                        legendgroup: 'stored',
                        name: `🔋 แบตเก็บไป ${fmtKwh(storedDay)} หน่วย/วัน`,
                        hoverinfo: 'skip', connectgaps: false
                    });
                }
                traces2.push({
                    x: plotData.x, y: curtail.top,
                    type: 'scatter', mode: 'lines', line: { width: 0 },
                    fill: 'tonexty', fillcolor: SPILT_FILL,
                    legendgroup: 'spilt',
                    name: `⚡ ทิ้งจริง (Curtailment) ${fmtKwh(wastedDay)} หน่วย/วัน`,
                    hoverinfo: 'skip', connectgaps: false
                });
                if (curtail.days > 1) bits.push(`เฉลี่ยจาก ${curtail.days} วันในไฟล์`);
            } else if (solarTrace && curtail) {
                bits.push('ไม่มีส่วนเกินเส้น Grid');
            } else if (solarTrace) {
                bits.push('ติ๊ก Grid เพื่อดูส่วนที่เกิน');
            }

            if (battery) {
                traces2.push({
                    x: plotData.x, y: battery.net,
                    type: 'scatter', mode: 'lines',
                    name: `🔋 Grid หลังโซลาร์ + แบต`,
                    line: { color: '#2DD4BF', width: 2 },
                    connectgaps: false
                });
            }

            if (solarTrace) traces2.push(solarTrace);

            // The DC side, drawn after the AC line so its fills land in the gap between
            // them. Same two colours, same meanings, grouped with the AC bands so each
            // appears once in the legend carrying the whole day's figure.
            if (solarTrace && sun && sun.clips) {
                if (battery) {
                    traces2.push({
                        x: plotData.x,
                        y: sun.ac.map((a, i) =>
                            (a == null || battery.chargeClip[i] == null) ? null : a + battery.chargeClip[i]),
                        type: 'scatter', mode: 'lines', line: { width: 0 },
                        fill: 'tonexty', fillcolor: STORED_FILL,
                        legendgroup: 'stored', showlegend: false,
                        hoverinfo: 'skip', connectgaps: false
                    });
                }
                traces2.push({
                    x: plotData.x, y: sun.dc,
                    type: 'scatter', mode: 'lines', line: { width: 0 },
                    fill: 'tonexty', fillcolor: SPILT_FILL,
                    legendgroup: 'spilt', showlegend: false,
                    hoverinfo: 'skip', connectgaps: false
                });
                // The boundary itself, carried by a trace of its own so the legend swatch
                // shows the dashed line rather than one of the two fills.
                traces2.push({
                    x: plotData.x, y: sun.dc,
                    type: 'scatter', mode: 'lines',
                    name: `DC ก่อนจำกัด ${fmtKwh(sun.kwp)} kWp`,
                    line: { color: '#FB923C', width: 1, dash: 'dash' },
                    connectgaps: false
                });
            }

            // One box. Three of them meant hunting across the chart to find out whether a
            // bigger battery had changed anything.
            if (solarTrace && curtail && surplusDay > 0) {
                const lines = [];
                if (battery) {
                    const cut = battery.peakBefore - battery.peakAfter;
                    lines.push(`🔋 <b>แบต ${fmtKwh(battery.batt.kwh)} kWh` +
                        (isFinite(battery.batt.kw) ? ` / ${fmtKwh(battery.batt.kw)} kW` : '') + `</b>`);
                    lines.push(`DOD ${Math.round(battery.batt.dod * 100)}% → ใช้ได้ ${fmtKwh(battery.batt.usable)} kWh`);
                    lines.push(`ใช้ไป ${battery.cyclesDay.toFixed(2)} รอบ/วัน`);
                    lines.push(`พีค <b>${battery.peakBefore.toFixed(1)} → ${battery.peakAfter.toFixed(1)} kW</b>` +
                        ` (ลด ${cut.toFixed(1)} kW)`);
                    lines.push('');
                }
                lines.push(`ผลิต AC <b>${fmtKwh(curtail.genDay)}</b> หน่วย/วัน`);
                lines.push(`ใช้เองทันที <b>${fmtKwh(curtail.genDay - surplusAcDay)}</b>`);
                lines.push(`⚡ <b>ไฟส่วนเกิน ${fmtKwh(surplusDay)} หน่วย/วัน</b>`);
                lines.push(`&nbsp;&nbsp;• เกินเส้น Grid ฝั่ง AC ${fmtKwh(surplusAcDay)}`);
                if (clipDay > 0) lines.push(`&nbsp;&nbsp;• DC ที่ inverter ตัด ${fmtKwh(clipDay)}`);
                if (battery) {
                    const share = surplusDay > 0 ? (storedDay / surplusDay) * 100 : 0;
                    lines.push(`🔋 แบตเก็บไป <b>${fmtKwh(storedDay)}</b> (${share.toFixed(1)}%)`);
                }
                // Quoted against the DC the array could have made, which is the
                // denominator a proposal is read against.
                const curtailPct = dcGenDay > 0 ? (wastedDay / dcGenDay) * 100 : 0;
                lines.push(`⚡ <b>ทิ้งจริง (Curtailment)</b>`);
                lines.push(`<b>${fmtKwh(wastedDay)} หน่วย/วัน</b> · ${curtailPct.toFixed(1)}% ของ DC ${fmtKwh(dcGenDay)}` +
                    (battery ? '' : '<br>ยังไม่ได้ใส่แบต'));
                // Sat inside the plot it covered the very peaks it was summarising - the
                // array's and the DC's both fall in the left half of the day. Under the
                // legend, outside the plot, no peak label can ever land on it.
                ann2.push({
                    xref: 'paper', yref: 'paper', x: 1.02, y: 0,
                    xanchor: 'left', yanchor: 'bottom', showarrow: false, align: 'left',
                    text: lines.join('<br>'),
                    bgcolor: battery ? 'rgba(13, 148, 136, 0.93)' : 'rgba(185, 45, 42, 0.93)',
                    bordercolor: battery ? '#2DD4BF' : '#E53935', borderwidth: 1,
                    borderpad: 6, font: { color: '#fff', size: 11 }
                });
            }

            const marks2 = [];
            if (solarTrace) {
                const cand = [];
                // Taken off the trace rather than recomputed: plotSeriesValues() hands back
                // a fresh array for a flipped Grid, and the register matches a marker to
                // its line by array identity.
                gridSeries.forEach((sr, i) => cand.push([traces2[i].y, sr.name.split(/[（(]/)[0].trim(), sr.color]));
                if (sun && sun.clips) cand.push([sun.dc, 'DC', '#FB923C']);
                cand.push([solarTrace.y, 'โซลาร์ AC', '#FFB020']);
                if (battery) cand.push([battery.net, 'หลังแบต', '#2DD4BF']);
                const top2 = cand.reduce((m, c) => {
                    const p = peakOf(c[0]);
                    return p && p.value > m ? p.value : m;
                }, 0);
                layoutPeakMarkers(cand.map(c => peakMarker(c[0], c[1], c[2], top2)))
                    .forEach(m => marks2.push(m));
            }

            if (card2) card2.style.display = traces2.length ? '' : 'none';
            if (traces2.length) {
                const layout2 = plotAxisLayout('☀️ Proposed Solar System vs Grid', bits.join(' · '), 'Power (kW)', ann2);
                if (ann2.length) layout2.margin = Object.assign({}, layout2.margin, { r: 250 });
                Plotly.react('plot-chart-2', traces2, layout2, PLOT_CONFIG);
                registerPlotPeaks('plot-chart-2', traces2, marks2, ann2);
                setTimeout(() => { try { Plotly.Plots.resize('plot-chart-2'); } catch (e) { } }, 30);
            }

            drawPlotGridBuyChart(solarTrace, battery);
        }

        // Chart three answers the one question the other two do not: after all this, what
        // is still coming off the meter. Only the positive side counts - an hour the site
        // exports is not an hour it buys - so each curve is clipped at zero before the
        // day's units are added up.
        function drawPlotGridBuyChart(solarTrace, battery) {
            const card3 = document.getElementById('plotChart3Card');
            if (!card3) return;
            const load = plotLoadReference();
            const after = solarTrace ? plotAfterSolar(solarTrace.y) : null;
            const step = plotStepHours();
            if (!load || !after || step <= 0) { card3.style.display = 'none'; return; }
            card3.style.display = '';

            const days = plotDayCount();
            const buy = arr => arr.map(v => (v == null ? null : Math.max(0, v)));
            const units = arr => arr.reduce((a, v) => a + (v == null ? 0 : Math.max(0, v) * step), 0) / days;

            const now = load.y;
            const nowBuy = buy(now), afterBuy = buy(after);
            const nowKwh = units(now), afterKwh = units(after);
            const battBuy = battery ? buy(battery.net) : null;
          