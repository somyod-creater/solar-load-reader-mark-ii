   function LAYOUT_1() {
            return {
                title: chartTitle('📈 Daily Load Profile vs. Solar Generation', 'Comparison of average daily demand and solar power potential'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: axTime(), yaxis: axPower(),
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.02 },
                margin: { r: 210, t: 90 }, shapes: []
            };
        }
        function LAYOUT_7() {
            return {
                title: chartTitle('Imported Net Load', 'Consumption (kWh) - Solar Phase 1 - Solar Phase 2'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: { title: { text: 'Time', font: { size: 13 } }, type: 'date', showgrid: true, gridcolor: '#eee' },
                yaxis: { title: { text: 'Energy (kWh)', font: { size: 13 } }, showgrid: true, gridcolor: '#eee', zeroline: true, zerolinecolor: '#888', rangemode: 'normal' },
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.02 },
                margin: { r: 230, t: 90 }
            };
        }
        function LAYOUT_3() {
            return {
                title: chartTitle('☀️ System Performance — Solar Only', 'Zero-export system operation without battery storage'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: axTime(), yaxis: axPower(),
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.02 },
                margin: { r: 210, t: 90 }
            };
        }
        function LAYOUT_4() {
            return {
                title: chartTitle('🔋 System Performance — Solar + BESS', 'Zero-export system operation with battery storage & peak shaving'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: axTime(), yaxis: axPower(),
                yaxis2: { title: { text: '🔋 Battery SOC (%)' }, titlefont: { color: '#9c27b0' }, tickfont: { color: '#9c27b0' }, overlaying: 'y', side: 'right', range: [0, 100] },
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.15 },
                margin: { r: 210, t: 90 }
            };
        }
        function LAYOUT_5() {
            return {
                title: chartTitle('⚖️ Grid Demand Comparison', 'Net Grid Load — Solar Only vs. Solar + BESS'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: axTime(), yaxis: axPower(),
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.02 },
                margin: { r: 210, t: 90 }
            };
        }
        function LAYOUT_6() {
            return {
                title: chartTitle('🔋 Battery Operation Profile', 'BESS Charge / Discharge / State of Charge'),
                hovermode: 'x unified', template: 'plotly_white',
                xaxis: axTime(),
                yaxis: { title: { text: '⚡ Battery Power (kW)  ▲Charge / ▼Discharge', font: { size: 13 } }, showgrid: true, gridcolor: '#eee', zeroline: true, zerolinecolor: '#888', zerolinewidth: 2 },
                yaxis2: { title: { text: '🔋 Battery SOC (%)' }, titlefont: { color: '#9c27b0' }, tickfont: { color: '#9c27b0' }, overlaying: 'y', side: 'right', range: [0, 100] },
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.15 },
                margin: { r: 210, t: 90 }
            };
        }
        function LAYOUT_2() {
            return {
                title: chartTitle('📦 Monthly Load Distribution', 'Monthly Demand Distribution (Box Plot)'),
                template: 'plotly_white',
                xaxis: { title: { text: '📅 Month', font: { size: 13 } } },
                yaxis: { title: { text: '⚡ Power (kW)', font: { size: 13 } } },
                margin: { b: 100, t: 90 }
            };
        }
        // Data-label helper: annotate the peak value of a curve
        // A peak marker belongs to one trace, but Plotly keeps annotations on screen
        // whatever the traces do — so hiding a line from the legend left its marker
        // floating. Each chart's markers are registered with the trace they describe and
        // re-applied whenever the legend changes.
        const peakAnnRegistry = {};

        function applyPeakAnnotations(chartId) {
            const gd = document.getElementById(chartId);
            const entries = peakAnnRegistry[chartId];
            if (!gd || !entries) return;
            const shown = idx => {
                const t = gd.data && gd.data[idx];
                if (!t) return false;
                return t.visible === undefined || t.visible === true;   // not false / 'legendonly'
            };
            const anns = entries
                .filter(e => e.traceIdx == null || shown(e.traceIdx))
                .map(e => e.ann);
            try { Plotly.relayout(chartId, { annotations: anns }); } catch (e) { }
        }

        // entries: [{ ann, traceIdx }] - traceIdx null keeps the annotation always visible
        function setPeakAnnotations(chartId, entries) {
            peakAnnRegistry[chartId] = entries.filter(e => e && e.ann);
            const gd = document.getElementById(chartId);
            if (gd && gd.on) {
                // Re-wire every time: Plotly.newPlot drops the div's handlers, and
                // replotCharts() calls it again after an import, so a one-shot guard
                // left the chart with no listener for the rest of the session.
                // Nothing else in the app listens for plotly_restyle.
                if (gd.removeAllListeners) gd.removeAllListeners('plotly_restyle');
                // fires on legend clicks; our own update uses relayout, so no loop
                gd.on('plotly_restyle', () => applyPeakAnnotations(chartId));
            }
            applyPeakAnnotations(chartId);
        }

        function peakAnn(xArr, yArr, label, color, ay) {
            const m = arrayMax(yArr);
            const i = yArr.indexOf(m);
            return {
                x: xArr[i], y: m, xref: 'x', yref: 'y',
                text: `${label}: <b>${m.toFixed(0)} kW</b>`,
                showarrow: true, arrowhead: 2, arrowsize: 1, arrowcolor: color,
                ax: 0, ay: ay || -35,
                bgcolor: 'rgba(255,255,255,0.9)', bordercolor: color, borderwidth: 1,
                font: { size: 11, color: color }
            };
        }

        function uniqueHeaders(headers) {
            const counts = {};
            return headers.map(h => {
                const base = String(h ?? '').trim();
                if (!base) return base;
                counts[base] = (counts[base] || 0) + 1;
                return counts[base] === 1 ? base : `${base} (${counts[base]})`;
            });
        }

        let netLoadPeriod = 'daily';
        let lastNetLoadRenderData = null;

        function emptyImportedNetLoadChart(message) {
            updateNetLoadPeriodButtons();
            const layout = LAYOUT_7();
            layout.xaxis.visible = false;
            layout.yaxis.visible = false;
            layout.annotations = [{
                text: message,
                xref: 'paper', yref: 'paper',
                x: 0.5, y: 0.5,
                showarrow: false,
                font: { size: 15, color: '#666' },
                align: 'center'
            }];
            Plotly.react('chart7', [], {
                ...layout
            });
        }

        function updateNetLoadPeriodButtons() {
            document.querySelectorAll('#netLoadTimeSegment button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.period === netLoadPeriod);
            });
        }

        function setNetLoadPeriod(period) {
            netLoadPeriod = period;
            updateNetLoadPeriodButtons();
            if (rawDataPoints && rawDataPoints.length > 0) {
                processDataPoints(rawDataPoints, lastUploadedFiles || []);
            } else if (importedPVSystData) {
                // No load uploaded, but PVSyst is driving chart1 - rebuild ITS time axis for the
                // selected period too, otherwise Daily/Weekly/Monthly does nothing when the panel
                // has no load data at all.
                rebuildEmptyLoadProfileForPeriod(period);
                if (lastNetLoadRenderData) renderImportedNetLoad(lastNetLoadRenderData);
            } else if (lastNetLoadRenderData) {
                renderImportedNetLoad(lastNetLoadRenderData);
            }
            renderFusionChart();
        }

        // Chart1's x-axis (times/hours) only gets rebuilt by processDataPoints(), which requires
        // real load rows. When there is no load but PVSyst data is selected, rebuild the same
        // empty-load time axis shape ourselves so the period toggle still updates the PVSyst
        // curve's x-axis (weekly = 7x24 slots repeating the same daily profile; monthly behaves
        // like daily here, matching how processDataPoints treats it for real load data too).
        function rebuildEmptyLoadProfileForPeriod(period) {
            let time_strs;
            if (period === 'weekly') {
                const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                time_strs = [];
                labels.forEach(day => {
                    for (let h = 0; h < 24; h++) time_strs.push(day + ' ' + String(h).padStart(2, '0') + ':00');
                });
            } else {
                time_strs = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
            }

            data.time_strs = time_strs;
            data.overall_mean = time_strs.map(() => 0);
            data.box_data = {};
            data.midday_min = 0;

            times.length = 0;
            times.push(...time_strs);
            hours.length = 0;
            hours.push(...times.map(t => timeSlotToHour(t)));

            // Per-month PVSyst comparison traces (mirrors the "Avg Load - <month>" lines real load
            // data gets), so a full year of simulated production can be compared month-to-month too.
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            if (importedPVSystData && importedPVSystData.monthlyHourlyProfiles) {
                monthsAreSolar = true;
                const monthsObj = {};
                importedPVSystData.monthlyHourlyProfiles.forEach((profile24, idx) => {
                    if (!profile24.some(v => v > 0)) return; // skip months with no data
                    monthsObj[monthNames[idx]] = hours.map(h => profile24[Math.floor(h) % 24] || 0);
                });
                data.months = monthsObj;
            } else {
                monthsAreSolar = false;
                data.months = {};
            }

            replotCharts();
            updateDashboard();
        }

        function startOfWeek(date) {
            const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
            return d;
        }

        // Weekly buckets by weekday, so "Mon" can stand for several dates. When the
        // loaded profile only covers one of them — the usual case for a few days of
        // data — the date is shown too, so it is obvious which Monday is on screen.
        let weekdayDateSuffix = {};

        function buildWeekdayDateSuffix(points) {
            const datesByWeekday = {};
            points.forEach(p => {
                const d = p.datetime;
                if (!(d instanceof Date) || isNaN(d.getTime())) return;
                const wd = d.getDay();
                const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (!datesB