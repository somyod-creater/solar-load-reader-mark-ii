หลือปัจจุบัน (หลัง Phase 1)</b>', line: { shape: 'spline', color: '#1565c0', width: 2.5 } },
                // New designed Phase 2 solar
                { x, y: phase2, type: 'scatter', mode: 'lines', name: `<b>Designed Solar Phase 2 (${designedKwp} kWp)</b>`, line: { shape: 'spline', color: '#43a047', width: 2, dash: 'dash' } },
                // Result: net grid load after Phase 2
                {
                    x, y: netLoad, type: 'scatter', mode: 'lines', name: '<b>Net Load — หลังติด Phase 2</b>',
                    line: { shape: 'spline', color: '#ff6d00', width: 3 },
                    fill: 'tozeroy', fillcolor: 'rgba(255, 109, 0, 0.16)'
                },
                ...Object.keys(groups).sort().map(month => ({
                    x,
                    y: avgSeries(groups[month], 'net'),
                    type: 'scatter',
                    mode: 'lines',
                    name: `Net Load - ${month}`,
                    line: { shape: 'spline', width: 1.5 },
                    visible: 'legendonly'
                }))
            ];

            const layout = LAYOUT_7();
            const periodLabel = netLoadPeriod.charAt(0).toUpperCase() + netLoadPeriod.slice(1);
            const solarSourceLabel = isUsingPVSyst ? 'PVSyst Simulation E_Grid' : `Designed Solar (${designedKwp} kWp)`;
            // baseLabel was referenced here but never declared, so drawing this chart threw
            // a ReferenceError. The baseline is whichever column the net load was built from.
            const baseLabel = importCol || consumptionCol || 'Load';
            layout.title = chartTitle('Imported Net Load', `${periodLabel} average · Net Load = ${baseLabel} − ${solarSourceLabel}`);
            layout.xaxis.type = 'category';
            layout.xaxis.categoryorder = 'array';
            layout.xaxis.categoryarray = x;
            var chart7TickConfig = buildTimeTickConfig(x, netLoadPeriod);
            Object.assign(layout.xaxis, chart7TickConfig);
            layout.annotations = [];
            Plotly.react('chart7', traces, layout, PLOT_CONFIG);
        }

        // Setup Traces
        const traces = [];
        traces.push({ x: times, y: data.overall_mean, mode: 'lines', name: '<b>Overall Avg Load</b>', line: { shape: 'spline', color: 'black', width: 4 } });
        Object.keys(data.months).forEach(m => {
            traces.push({ x: times, y: data.months[m], mode: 'lines', name: `${monthsAreSolar ? 'Solar' : 'Avg Load'} - ${m}`, line: { shape: 'spline', width: 2 }, visible: 'legendonly' });
        });

        let solarTraceIndex = traces.length;
        traces.push({
            x: times, y: Array(times.length).fill(0),
            mode: 'lines', name: `<b>Solar Gen</b>`, line: { shape: 'spline', color: '#4fc3f7', width: 3, dash: 'dot' },
            fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.25)'
        });

        compareTraceIndex = traces.length;
        traces.push({
            x: times, y: Array(times.length).fill(0),
            mode: 'lines', name: `<b>Solar Gen (Formula)</b>`, line: { shape: 'spline', color: '#8b5cf6', width: 2.5, dash: 'dash' },
            visible: false
        });

        Plotly.newPlot('chart1', traces, LAYOUT_1(), PLOT_CONFIG);
        emptyImportedNetLoadChart('ยังไม่มีข้อมูล Import สำหรับ Net Load<br>กรุณาอัพโหลดไฟล์ Plant Report ในแท็บ 💰 การเงิน');

        // Chart 3: Net Load with clipping trace
        const chart3Traces = [
            {
                x: times, y: data.overall_mean,
                mode: 'lines', name: '<b>Average Load</b>', line: { shape: 'spline', color: 'black', width: 3 }
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Solar Gen (Used)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 2, dash: 'dot' },
                fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.2)'
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Solar Gen (Potential)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 1, dash: 'dash' },
                fill: 'tonexty', fillcolor: 'rgba(255, 50, 50, 0.25)'
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Net Load (Solar Only)</b>', line: { shape: 'spline', color: '#ff6d00', width: 2 },
                fill: 'tozeroy', fillcolor: 'rgba(255, 109, 0, 0.15)'
            }
        ];
        Plotly.newPlot('chart3', chart3Traces, LAYOUT_3(), PLOT_CONFIG);

        const chart4Traces = [
            {
                x: times, y: data.overall_mean,
                mode: 'lines', name: '<b>Average Load</b>', line: { shape: 'spline', color: 'black', width: 3 }
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Solar Gen (Direct Load)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 2, dash: 'dot' },
                fill: 'tozeroy', fillcolor: 'rgba(79, 195, 247, 0.2)'
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Solar Gen (BESS Charge)</b>', line: { shape: 'spline', color: '#4caf50', width: 1, dash: 'dash' },
                fill: 'tonexty', fillcolor: 'rgba(76, 175, 80, 0.25)' // Green fill for battery charging
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>▼ Wasted Solar (Curtailment)</b>', line: { shape: 'spline', color: '#4fc3f7', width: 1, dash: 'dash' },
                fill: 'tonexty', fillcolor: 'rgba(229, 57, 53, 0.28)' // Red fill for wasted solar
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Net Load (Solar + BESS)</b>', line: { shape: 'spline', color: '#ff6d00', width: 2 },
                fill: 'tozeroy', fillcolor: 'rgba(255, 109, 0, 0.15)'
            },
            {
                x: times, y: Array(times.length).fill(0), customdata: Array(times.length).fill(0),
                mode: 'lines', name: '<b>🔻 Peak Shaving Shaved</b>', line: { shape: 'spline', color: 'rgba(0,0,0,0)', width: 0 },
                fill: 'tonexty', fillcolor: 'rgba(233, 30, 99, 0.18)',
                hovertemplate: 'Peak Shaved: %{customdata:.0f} kW<extra></extra>'
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Battery Discharge</b>', line: { shape: 'spline', color: '#e91e63', width: 2, dash: 'solid' },
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Battery SOC (%)</b>', line: { shape: 'spline', color: '#9c27b0', width: 2, dash: 'dashdot' },
                yaxis: 'y2'
            }
        ];
        Plotly.newPlot('chart4', chart4Traces, LAYOUT_4(), PLOT_CONFIG);

        // Chart 6: Battery operation (charge up / discharge down / SOC)
        const chart6Traces = [
            { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🟢 BESS Charge</b>', line: { shape: 'spline', color: '#4caf50', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(76, 175, 80, 0.30)' },
            { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🔴 BESS Discharge</b>', line: { shape: 'spline', color: '#e91e63', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(233, 30, 99, 0.30)' },
            { x: times, y: Array(times.length).fill(0), mode: 'lines', name: '<b>🔋 Battery SOC (%)</b>', line: { shape: 'spline', color: '#9c27b0', width: 3, dash: 'dashdot' }, yaxis: 'y2' }
        ];
        Plotly.newPlot('chart6', chart6Traces, LAYOUT_6(), PLOT_CONFIG);

        const chart5Traces = [
            {
                x: times, y: data.overall_mean,
                mode: 'lines', name: '<b>Average Load (Reference)</b>', line: { shape: 'spline', color: 'black', width: 2, dash: 'dash' }
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Net Load (Solar Only)</b>', line: { shape: 'spline', color: '#2196f3', width: 3 },
                fill: 'tonexty', fillcolor: 'rgba(33, 150, 243, 0.1)'
            },
            {
                x: times, y: Array(times.length).fill(0),
                mode: 'lines', name: '<b>Net Load (Solar + BESS)</b>', line: { shape: 'spline', color: '#4caf50', width: 3 },
                fill: 'tonexty', fillcolor: 'rgba(76, 175, 80, 0.15)'
            }
        ];
        Plotly.newPlot('chart5', chart5Traces, LAYOUT_5(), PLOT_CONFIG);

        updateDashboard();


        // Bump this whenever the saved data structure changes, so stale localStorage from older
        // (buggy) versions is discarded instead of being restored and breaking the charts.
        const IMPORT_STATE_VERSION = 3;
        // Standard Huawei/Ampas Plant Report column order. SheetJS sometimes fails to read this file's
        // header row (zip "Bad uncompressed size") and drops it entirely — so we fall back to these fixed
        // positions. Verified against the real exports: idx5=Inverter Yield, idx7=Import, idx10=Consumption.
        const HUAWEI_PLANT_HEADERS = ['Statistical period', 'Global Irradiation (kWh/m²)', 'Average Temperature (℃)', 'Theoretical Yield (kWh)', 'PV Yield (kWh)', 'Inverter Yield (kWh)', 'Export (kWh)', 'Import (kWh)', 'Loss Due to Export Limitation (kWh)', 'Loss Due to Export Limitation (฿)', 'Consumption (kWh)', 'Self-consumption (kWh)', 'Charge (kWh)', 'Discharge (kWh)', 'Revenue(฿)'];

        function serializeReportData(reportData) {
            if (!reportData || !reportData.rows) return null;
            return {
                headers: reportData.headers || [],
                rows: reportData.rows.map(r => ({
                    time: r.time instanceof Date ? r.time.toISOString() : new Date(r.time).toISOString(),
                    vals: r.vals || {}
                }))
            };
        }

        function deserializeReportData(reportData) {
            if (!reportData || !reportData.rows) return null;
            return {
                headers: reportData.headers || [],
                rows: reportData.rows.map(r => ({
                    time: new Date(r.time),
                    vals: r.vals || {}
                }))
            };
        }

        function saveImportedState(fileNames) {
            try {
                const payload = {
                    version: IMPORT_STATE_VERSION,
                    savedAt: new Date().toISOString(),
                    fileNames: fileNames || [],
                    rawDataPoints: rawDataPoints.map(p => ({
                        datetime: p.datetime instanceof Date ? p.datetime.toISOString() : new Date(p.datetime).toISOString(),
                        kw: p.kw
                    })),
                    plantReportData: serializeReportData(plantReportData),
                    importedNetLoadData: serializeReportData(importedNetLoadData),
                    importedPVSystData: importedPVSystData ? {
                        meta: importedPVSystData.meta,
                        totalPoints: importedPVSystData.totalPoints,
                        peakPowerKw: importedPVSystData.peakPowerKw,
                        annualTotalMWh: importedPVSystData.annualTotalMWh,
                        avgDailyKwh: importedPVSystData.avgDailyKwh,
                        hourlyMeanProfile: importedPVSystData.hourlyMeanProfile,
                        monthlySummary: importedPVSystData.monthlySummary
                    } : null,
                    activeSolarSource: activeSolarSource,
                    ampConversion: lastAmpConversion
                };
                localStorage.setItem('solarLoadReaderImportedState', JSON.stringify(payload));
            } catch (err) {
       