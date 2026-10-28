 dash: 'solid' }],
                    'fill': ['tozeroy'],
                    'fillcolor': ['rgba(245, 158, 11, 0.25)'],
                    'visible': [showDesignedSolar]
                }, [solarTraceIndex]);

                if (compareTraceIndex !== undefined && compareTraceIndex >= 0) {
                    Plotly.restyle('chart1', { visible: [false] }, [compareTraceIndex]);
                }
            } else {
                Plotly.restyle('chart1', {
                    'y': [solar_curve],
                    'name': [`<b>⚙️ Solar Gen (${kwp} kWp)</b>`],
                    'line': [{ shape: 'spline', color: '#4fc3f7', width: 3, dash: 'dot' }],
                    'fill': ['tozeroy'],
                    'fillcolor': ['rgba(79, 195, 247, 0.25)'],
                    'visible': [showDesignedSolar]
                }, [solarTraceIndex]);

                if (compareTraceIndex !== undefined && compareTraceIndex >= 0) {
                    Plotly.restyle('chart1', { visible: [false] }, [compareTraceIndex]);
                }
            }

            // When the imported load is Grid power (already-solar site), relabel the black line and
            // caption so it's clear this is net grid demand, not gross consumption.
            const loadTraceName = fusionLoadIsGrid ? '<b>Grid Power (Net Load)</b>' : '<b>Overall Avg Load</b>';
            Plotly.restyle('chart1', { name: [loadTraceName] }, [0]);
            const c1cap = document.getElementById('chart1Caption');
            if (c1cap) {
                let sourceDesc = '';
                if (activeSolarSource === 'pvsyst' && importedPVSystData) {
                    sourceDesc = `<b style="color:#d97706;">☀️ แหล่งข้อมูล Solar: ข้อมูลจำลองจริง PVSyst (E_Grid)</b> · กำลังผลิตสูงสุด ${importedPVSystData.peakPowerKw.toLocaleString()} kW · ผลิตรวม ${importedPVSystData.annualTotalMWh.toLocaleString()} MWh/ปี (เฉลี่ย ${importedPVSystData.avgDailyKwh.toLocaleString()} kWh/วัน)`;
                } else if (activeSolarSource === 'compare' && importedPVSystData) {
                    sourceDesc = `<b style="color:#7c3aed;">🔀 โหมดเปรียบเทียบ:</b> เส้นทึบสีส้ม = <b style="color:#d97706;">PVSyst Simulation E_Grid</b> (${importedPVSystData.peakPowerKw.toLocaleString()} kW peak) เทียบกับ เส้นประสีม่วง = <b style="color:#7c3aed;">สูตรอุดมคติ</b> (${kwp} kWp)`;
                } else {
                    sourceDesc = `<b style="color:#0284c7;">⚙️ แหล่งข้อมูล Solar: สูตรอุดมคติ</b> · ${kwp} kWp · ยอดพีค ${(kwp * getSolarPeakRatio()).toFixed(0)} kW (PR ${(getSolarPeakRatio() * 100).toFixed(0)}%) · PSH ${getSolarPSH()} ชม./วัน → ${solarDailyKwh(kwp).toFixed(0)} kWh/วัน`;
                }
                const loadDesc = fusionLoadIsGrid
                    ? 'เส้นสีดำคือ <b>Grid Power (โหลดสุทธิ)</b> ที่โรงงานดึงจากระบบจำหน่ายไฟฟ้า'
                    : 'เส้นสีดำแสดง <b>กำลังไฟฟ้าที่โรงงานใช้งาน (Load)</b> แต่ละชั่วโมง';
                c1cap.innerHTML = `💡 ${sourceDesc}<br>${loadDesc} และพื้นที่ใต้กราฟสีแสดงศักยภาพการผลิตไฟฟ้าของโซลาร์เซลล์ หากพื้นที่สีสูงกว่าเส้นสีดำหมายถึงมีพลังงานเหลือ (Surplus)`;
            }

            // Chart 1 data labels: peak load & peak solar, each tied to its own trace
            const chart1Anns = [
                { ann: peakAnn(times, load_curve, fusionLoadIsGrid ? 'Peak Grid' : 'Peak Load', '#000000', -35), traceIdx: 0 }
            ];
            if (showDesignedSolar) {
                if (activeSolarSource === 'compare' && importedPVSystData && pvsyst_curve) {
                    chart1Anns.push({ ann: peakAnn(times, pvsyst_curve, 'Peak PVSyst', '#d97706', -35), traceIdx: solarTraceIndex });
                    chart1Anns.push({ ann: peakAnn(times, formula_curve, 'Peak Formula', '#7c3aed', -55), traceIdx: compareTraceIndex >= 0 ? compareTraceIndex : null });
                } else if (activeSolarSource === 'pvsyst' && importedPVSystData) {
                    chart1Anns.push({ ann: peakAnn(times, solar_curve, 'Peak PVSyst', '#d97706', -35), traceIdx: solarTraceIndex });
                } else if (kwp > 0) {
                    chart1Anns.push({ ann: peakAnn(times, solar_curve, 'Peak Solar', '#0288d1', -35), traceIdx: solarTraceIndex });
                }
            }
            setPeakAnnotations('chart1', chart1Anns);

            // Update Chart 3 (Solar Only)
            Plotly.restyle('chart3', { 'y': [load_curve] }, [0]);
            Plotly.restyle('chart3', { 'y': [solar_actual_no_bat] }, [1]);
            Plotly.restyle('chart3', { 'y': [solar_curve] }, [2]);
            Plotly.restyle('chart3', { 'y': [net_curve_no_bat] }, [3]);

            // Update Chart 4 (Solar + BESS)
            const shaved_bat = load_curve.map((l, i) => Math.max(0, l - net_curve_bat[i]));
            // Curtailment envelope: solar potential, but never below what's actually used+stored (avoids inverted fill)
            const curtail_top = solar_curve.map((s, i) => Math.max(s, solar_actual_bat[i]));
            Plotly.restyle('chart4', { 'y': [load_curve] }, [0]);
            Plotly.restyle('chart4', { 'y': [solar_actual_no_bat] }, [1]);
            Plotly.restyle('chart4', { 'y': [solar_actual_bat] }, [2]);
            Plotly.restyle('chart4', { 'y': [curtail_top] }, [3]); // Curtailment top = solar potential (red fill down to solar used+stored)
            Plotly.restyle('chart4', { 'y': [net_curve_bat] }, [4]);
            Plotly.restyle('chart4', { 'y': [load_curve], 'customdata': [shaved_bat] }, [5]); // Peak Shaving band (fills net→load)
            Plotly.restyle('chart4', { 'y': [bess_discharge_curve] }, [6]);
            Plotly.restyle('chart4', { 'y': [soc_percent_curve] }, [7]);

            // Update Chart 6 (Battery operation): charge up, discharge down, SOC on y2
            const discharge_neg = bess_discharge_curve.map(v => -v);
            Plotly.restyle('chart6', { 'y': [bess_charge_curve] }, [0]);
            Plotly.restyle('chart6', { 'y': [discharge_neg] }, [1]);
            Plotly.restyle('chart6', { 'y': [soc_percent_curve] }, [2]);

            // AC-coupling view: when NO new solar is being designed (System Size = 0 — e.g. adding a
            // battery to an existing plant and charging it from the grid), hide the *designed* solar
            // curves so charts 1/3/4 show only load + battery operation. The real historical solar
            // data in chart-fusion is untouched; the BESS simulation still runs (grid-charged).
            Plotly.restyle('chart1', { visible: showDesignedSolar }, [solarTraceIndex]);
            Plotly.restyle('chart3', { visible: showDesignedSolar }, [1, 2]);

            Plotly.restyle('chart4', { visible: showDesignedSolar }, [1, 2, 3]);

            // Chart 6 data labels: when & how much the battery charges / discharges
            const maxCharge = arrayMax(bess_charge_curve);
            const maxDischarge = arrayMax(bess_discharge_curve);
            const iCharge = bess_charge_curve.indexOf(maxCharge);
            const iDisch = bess_discharge_curve.indexOf(maxDischarge);
            Plotly.relayout('chart6', {
                annotations: [
                    ...(maxCharge > 0.1 ? [{
                        x: times[iCharge], y: maxCharge, xref: 'x', yref: 'y',
                        text: `🟢 <b>BESS Charge</b> Peak ${maxCharge.toFixed(0)} kW<br>☀️ Solar ${solar_charge_kwh_day.toFixed(0)}${grid_charge_kwh_day > 0.1 ? ` + 🔌 Grid ${grid_charge_kwh_day.toFixed(0)}` : ''} = Total <b>${total_charge_kwh_day.toFixed(0)} kWh/Day</b>`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#4caf50', ax: 0, ay: -40,
                        bgcolor: 'rgba(235,255,235,0.95)', bordercolor: '#4caf50', borderwidth: 1, font: { size: 11, color: '#2e7d32' }
                    }] : []),
                    ...(maxDischarge > 0.1 ? [{
                        x: times[iDisch], y: -maxDischarge, xref: 'x', yref: 'y',
                        text: `🔴 <b>BESS Discharge</b> ⏱ ${dischWindow}<br>Peak ${maxDischarge.toFixed(0)} kW · Total <b>${bess_discharge_kwh_day.toFixed(0)} kWh/Day</b> · DOD <b>${dod_pct.toFixed(0)}%</b>/${dod}%`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#e91e63', ax: 0, ay: 55,
                        bgcolor: 'rgba(255,235,240,0.95)', bordercolor: '#e91e63', borderwidth: 1, font: { size: 11, color: '#c2185b' }
                    }] : [])
                ]
            });

            // Update Chart 5 (Comparison)
            Plotly.restyle('chart5', { 'y': [load_curve] }, [0]);
            Plotly.restyle('chart5', { 'y': [net_curve_no_bat] }, [1]);
            Plotly.restyle('chart5', { 'y': [net_curve_bat] }, [2]);

            Plotly.relayout('chart3', {
                annotations: [
                    ...(curtailed_no_bat > 0 ? [{
                        x: peakTimeNoBat, y: solar_curve[peakIdxNoBat],
                        xref: 'x', yref: 'y',
                        text: `⚡ Wasted Solar (Curtailment)<br><b>${curtailed_no_bat.toFixed(1)} kWh/Day</b><br><b>${curtailed_no_bat_pct.toFixed(1)}% of generated</b>`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#e53935', ax: 60, ay: -60,
                        bgcolor: 'rgba(255,235,235,0.9)', bordercolor: '#e53935', borderwidth: 1, font: { size: 13, color: '#c62828' }
                    }] : []),
                    peakAnn(times, net_curve_no_bat, 'Grid Peak', '#ff6d00', 35)
                ]
            });

            // Region labels inside each coloured zone so customers understand the chart at a glance
            const idxAtHour = (hr) => { let best = 0, bd = Infinity; for (let i = 0; i < hours.length; i++) { const d = Math.abs(hours[i] - hr); if (d < bd) { bd = d; best = i; } } return best; };
            const midBand = (i) => (load_curve[i] + net_curve_bat[i]) / 2;
            const regionLabel = (i, y, text, color, bg) => ({ x: times[i], y, xref: 'x', yref: 'y', text, showarrow: false, align: 'center', bgcolor: bg, bordercolor: color, borderwidth: 1, borderpad: 4, font: { size: 11, color } });
            const iMid = idxAtHour(13);
            const maxDisch4 = arrayMax(bess_discharge_curve);
            const iDisch4 = bess_discharge_curve.indexOf(maxDisch4);
            // Curtailment on the Solar+BESS scenario (solar produced but neither used nor stored)
            const curtail_bat_curve = solar_dc_curve.map((s, i) => Math.max(0, s - solar_actual_bat[i]));
            const maxCurtailBat = arrayMax(curtail_bat_curve);
            const iCurtailBat = curtail_bat_curve.indexOf(maxCurtailBat);

            // Locate the off-peak grid-charging window (anchor for the 🔌 Grid Charge annotation)
            let gridChargeIdx = -1, gridChargeMax = 0;
            for (let i = 0; i < bess_charge_curve.length; i++) {
                const hh = hours[i];
                const isOffPk = (hh >= OFF_PEAK_START_H || hh < OFF_PEAK_END_H);
                if (isOffPk && bess_charge_curve[i] > gridChargeMax) { gridChargeMax = bess_charge_curve[i]; gridChargeIdx = i; }
            }
            Plotly.relayout('chart4', {
                annotations: [
                    // 🟢 charging from surplus solar — only when there is real solar charging
                    ...((batCap > 0 && solar_charge_kwh_day > 0.1) ? [{
                        x: peakTimeBess, y: solar_actual_bat[peakIdxBess] * 0.6,
                        xref: 'x', yref: 'y',
                        text: `🟢 <b>BESS Charge from Solar</b><br>⚡ Total <b>${solar_charge_kwh_day.toFixed(0)} kWh/Day</b><br><b>${solar_charge_pct.toFixed(1)}%</b> of generated solar`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#4caf50', ax: -55, ay: -30,
                        bgcolor: 'rgba(235,255,235,0.92)', bordercolor: '#4caf50', borderwidth: 1, font: { size: 11, color: '#2e7d32' }
                    }] : []),
                    // 🔌 charging from grid during off-peak (AC coupling / arbitrage) — how much & at what price
                    ...((batCap > 