failed', err);
                emptyImportedNetLoadChart('⚠️ เกิดข้อผิดพลาดในการวาดกราฟ Net Load<br>' + (err && err.message ? err.message : err));
            }
            isBatchImporting = false;

            // Update UI status
            const minDate = points[0].datetime.toLocaleDateString();
            const maxDate = points[points.length - 1].datetime.toLocaleDateString();
            const fileNames = Array.from(files).map(f => f.name).join(', ');
            document.getElementById((lastUploadWasCurrentZone || lastAmpConversion) ? 'currentStatus' : 'uploadStatus').innerHTML = `
                <div style="color: #155724; font-weight: bold; margin-bottom: 5px; background: #d4edda; border: 1px solid #c3e6cb; padding: 6px; border-radius: 4px;">✅ Data loaded successfully!</div>
                📄 File: <span style="font-family: monospace; font-size: 11px;">${fileNames}</span><br>
                📅 Data Period: <b>${minDate}</b> to <b>${maxDate}</b> (${points.length.toLocaleString()} rows)<br>
                📊 Resolution: <b>${time_strs.length === 24 ? 'Hourly' : (time_strs.length === 96 ? '15-Minute' : 'Custom (' + time_strs.length + ' points)')}</b>
                ${lastAmpConversion ? `<br>⚡ แปลงจากกระแส <b>${lastAmpConversion.channels.join(' / ')}</b> เป็น kW ที่ <b>${lastAmpConversion.voltage} V</b>, PF <b>${lastAmpConversion.pf}</b>` + (lastAmpConversion.partialSkipped ? ` · ข้าม ${lastAmpConversion.partialSkipped} แถวที่เฟสไม่ครบ` : '') : ''}
            `;
            try { onWizardLoadUploaded(); } catch (e) { }
        }

        function renderPlantReport(data) {
            plantReportNeedsRender = false;
            const status = document.getElementById('plant-status');
            const metrics = document.getElementById('plant-metrics');
            const chartIds = ['plant-chart-energy', 'plant-chart-solar', 'plant-chart-grid',
                'plant-chart-temp', 'plant-chart-finance', 'plant-chart-bess'];

            if (!data || !data.rows || data.rows.length === 0) {
                status.style.display = '';
                metrics.style.display = 'none';
                chartIds.forEach(id => document.getElementById(id).style.display = 'none');
                return;
            }
            status.style.display = 'none';

            const headers = data.headers;
            const rows = data.rows;
            const times = rows.map(r => r.time);

            const col = name => rows.map(r => r.vals[name] ?? null);
            const findCols = (...kws) => headers.filter(h => kws.some(k => h.toLowerCase().includes(k.toLowerCase())));

            const sumCol = name => {
                const key = headers.find(h => h.toLowerCase().includes(name.toLowerCase()));
                return key ? rows.reduce((s, r) => s + (r.vals[key] ?? 0), 0) : null;
            };
            const avgCol = name => {
                const key = headers.find(h => h.toLowerCase().includes(name.toLowerCase()));
                if (!key) return null;
                const vals = rows.map(r => r.vals[key]).filter(v => v != null);
                return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
            };

            const plotLayout = (title, yLabel, y2Label) => {
                const l = {
                    title: { text: title, font: { size: 14 } },
                    xaxis: { type: 'date', showgrid: true, gridcolor: '#eee' },
                    yaxis: { title: yLabel, showgrid: true, gridcolor: '#eee' },
                    legend: { orientation: 'h', y: -0.18 },
                    margin: { t: 40, l: 60, r: 40, b: 70 },
                    hovermode: 'x unified',
                    plot_bgcolor: '#fafafa', paper_bgcolor: 'white'
                };
                if (y2Label) l.yaxis2 = { title: y2Label, overlaying: 'y', side: 'right', showgrid: false };
                return l;
            };
            const mkLine = (h, y2) => ({
                x: times, y: col(h), type: 'scatter', mode: 'lines', name: h, line: { shape: 'spline', width: 1.5 }, ...(y2 ? { yaxis: 'y2' } : {})
            });
            const showChart = (id, traces, layout) => {
                const el = document.getElementById(id);
                if (traces.length > 0) { el.style.display = ''; Plotly.react(id, traces, layout); }
                else el.style.display = 'none';
            };

            // Energy overview
            const energyCols = findCols('yield', 'import', 'export', 'consumption', 'self-consumption', 'on-grid');
            showChart('plant-chart-energy',
                energyCols.map(h => mkLine(h)),
                plotLayout('⚡ Energy Overview', 'kWh'));

            // Solar yield + irradiation
            const irradCols = findCols('irradiation', 'irradiance');
            const solarYieldCols = findCols('theoretical', 'pv yield', 'inverter yield');
            showChart('plant-chart-solar',
                [...solarYieldCols.map(h => mkLine(h)), ...irradCols.map(h => mkLine(h, true))],
                plotLayout('☀️ Solar Yield & Irradiation', 'kWh', irradCols.length ? 'kWh/m²' : null));

            // Grid: import & export
            const gridCols = findCols('import', 'export');
            showChart('plant-chart-grid',
                gridCols.map(h => mkLine(h)),
                plotLayout('🔌 Grid: Import & Export', 'kWh'));

            // Temperature + irradiation
            const tempCols = findCols('temperature', 'temp');
            showChart('plant-chart-temp',
                [...tempCols.map(h => mkLine(h)), ...irradCols.map(h => mkLine(h, true))],
                plotLayout('🌡️ Temperature & Irradiation', '°C', irradCols.length ? 'kWh/m²' : null));

            // Revenue / Finance
            const financeCols = findCols('revenue', 'saving', 'income', 'earning');
            showChart('plant-chart-finance',
                financeCols.map(h => ({ x: times, y: col(h), type: 'bar', name: h })),
                plotLayout('💰 Revenue', '฿'));

            // BESS
            const bessCols = findCols('charge', 'discharge', 'battery', 'bess', 'soc');
            const bessTraces = bessCols.map(h => mkLine(h));
            const hasBESS = bessTraces.some(t => t.y.some(v => v != null && v !== 0));
            showChart('plant-chart-bess', hasBESS ? bessTraces : [],
                plotLayout('🔋 BESS Charge / Discharge', 'kWh'));

            // Summary cards
            const totalPV = sumCol('pv yield') ?? sumCol('inverter yield');
            const totalImport = sumCol('import');
            const totalCons = sumCol('consumption');
            const totalExport = sumCol('export');
            const totalRev = sumCol('revenue');
            const avgTemp = avgCol('temperature');
            const selfRate = (totalPV != null && totalCons != null && totalCons > 0 && totalImport != null)
                ? ((totalCons - totalImport) / totalCons * 100) : null;

            const fmt = v => v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
            const card = (label, value, unit, color) =>
                `<div class="metric-card"><div class="metric-title">${label} <span style="font-weight:normal">(${unit})</span></div>` +
                `<div class="metric-value" style="color:${color}">${fmt(value)}</div></div>`;

            metrics.style.display = '';
            metrics.innerHTML = [
                card('PV Yield', totalPV, 'kWh', '#e67e22'),
                card('Total Import', totalImport, 'kWh', '#e74c3c'),
                card('Consumption', totalCons, 'kWh', '#2c3e50'),
                card('Export', totalExport, 'kWh', '#27ae60'),
                card('Self-consumption', selfRate, '%', '#3498db'),
                card('Avg Module Temp', avgTemp, '°C', '#8e44ad'),
                ...(totalRev != null ? [card('Revenue', totalRev, '฿', '#16a085')] : [])
            ].join('');
        }

        function renderFusionChart() {
            if (fusionSolarData && fusionSolarData.times.length > 0) {
                document.getElementById('chart-fusion').style.display = 'block';

                var timeGroups = {};
                for (var i = 0; i < fusionSolarData.times.length; i++) {
                    var dt = new Date(fusionSolarData.times[i]);
                    if (isNaN(dt.getTime())) continue;
                    var hr = dt.getHours();
                    var min = dt.getMinutes();
                    var clockStr = hr.toString().padStart(2, '0') + ':' + min.toString().padStart(2, '0');

                    var timeStr;
                    if (netLoadPeriod === 'weekly') {
                        timeStr = profileSlotLabel(dt, clockStr);
                    } else if (netLoadPeriod === 'monthly') {
                        timeStr = dt.getFullYear() + '-' + (dt.getMonth() + 1).toString().padStart(2, '0');
                    } else {
                        timeStr = clockStr;
                    }

                    if (!timeGroups[timeStr]) {
                        timeGroups[timeStr] = { count: 0, activePower: 0, consumption: 0, gridPower: 0 };
                    }
                    timeGroups[timeStr].count++;
                    timeGroups[timeStr].activePower += fusionSolarData.activePower[i] || 0;
                    timeGroups[timeStr].consumption += fusionSolarData.consumption[i] || 0;
                    timeGroups[timeStr].gridPower += fusionSolarData.gridPower[i] || 0;
                }

                var time_strs = Object.keys(timeGroups).sort(function (a, b) {
                    if (netLoadPeriod === 'weekly') return sortProfileSlots(a, b);
                    return a.localeCompare(b);
                });

                var activeAvg = time_strs.map(function (t) { return timeGroups[t].activePower / timeGroups[t].count; });
                var consAvg = time_strs.map(function (t) { return timeGroups[t].consumption / timeGroups[t].count; });
                var gridAvg = time_strs.map(function (t) { return timeGroups[t].gridPower / timeGroups[t].count; });

                var xTitle = netLoadPeriod === 'monthly' ? 'Month' : 'Time';
                var chartType = netLoadPeriod === 'monthly' ? 'bar' : 'scatter';
                var periodLabel = netLoadPeriod.charAt(0).toUpperCase() + netLoadPeriod.slice(1);

                // AC coupling: if there is no solar (Active Power all ~0), omit the orange Solar line
                // entirely and show only Consumption (load) + Grid.
                var hasSolar = activeAvg.some(function (v) { return Math.abs(v) > 0.01; });
                var fusionTraces = [
                    { x: time_strs, y: consAvg, type: chartType, mode: 'lines', name: '<b>Average Consumption (Load)</b>', line: { shape: 'spline', color: '#2c3e50', width: 3 }, marker: { color: '#2c3e50' } }
                ];
                if (hasSolar) {
                    fusionTraces.push({ x: time_strs, y: activeAvg, type: chartType, mode: 'lines', name: '<b>Average Active Power (Solar)</b>', line: { shape: 'spline', color: '#f39c12', width: 3 }, marker: { color: '#f39c12' } });
                }
                fusionTraces.push({ x: time_strs, y: gridAvg, type: chartType, mode: 'lines', name: '<b>Average Grid Power</b>', line: { shape: 'spline', color: '#e74c3c', width: 2, dash: 'dot' }, marker: { color: '#e74c3c' } });

                var xTickConfig = buildTimeTickConfig(time_strs, netLoadPeriod);
                var fusionLayout = {
                    title: '<b>FusionSolar Aggregated Profile (' + periodLabel + ')</b>',
                    xaxis: Object.assign({ title: xTitle }, xTickConfig),
                    yaxis: { title: 'Average Power (kW)' },
                    margin: { l: 50, r: 20, t: 40, b: (netLoadPeriod === 'weekly' ? 90 : 60) },
                    paper_bgcolor: '#ffffff',
                    plot_bgcolor: '#f8f9fa',
                    legend: { orientation: 'h', y: -0.2 },
                    barmode: 'g