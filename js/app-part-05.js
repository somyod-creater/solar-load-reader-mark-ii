0 && grid_charge_kwh_day > 0.1 && gridChargeIdx >= 0) ? [{
                        x: times[gridChargeIdx], y: Math.max(load_curve[gridChargeIdx], gridChargeMax),
                        xref: 'x', yref: 'y',
                        text: `🔌 <b>Grid Charge (Off-Peak)</b><br>⚡ Total <b>${grid_charge_kwh_day.toFixed(0)} kWh/Day</b><br>@ ${rate_off_peak.toFixed(2)} ฿/kWh`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#8e24aa', ax: 0, ay: -50,
                        bgcolor: 'rgba(243,229,245,0.95)', bordercolor: '#8e24aa', borderwidth: 1, font: { size: 11, color: '#6a1b9a' }
                    }] : []),
                    // ⚡ curtailment — wasted solar when battery is full & solar > load
                    ...(maxCurtailBat > 0.1 ? [{
                        x: times[iCurtailBat], y: solar_actual_bat[iCurtailBat],
                        xref: 'x', yref: 'y',
                        text: `⚡ <b>Wasted Solar</b> (Full Battery)<br>Total <b>${curtailed_bat.toFixed(0)} kWh/Day</b><br><b>${curtailed_bat_pct.toFixed(1)}%</b> of generated solar`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#e53935', ax: 0, ay: -45,
                        bgcolor: 'rgba(255,235,235,0.95)', bordercolor: '#e53935', borderwidth: 1, font: { size: 11, color: '#c62828' }
                    }] : []),
                    // ☀️ zone: solar directly serving load (midday) — sit low inside the blue solar area
                    ...(showDesignedSolar ? [regionLabel(iMid, Math.max(20, load_curve[iMid] * 0.4), `☀️ Direct Solar<br><b>${direct_consumed_day.toFixed(0)} kWh/Day</b><br><b>${direct_solar_pct.toFixed(1)}%</b> of generated solar`, '#0277bd', 'rgba(179,229,252,0.9)')] : []),
                    // 🔋 zone: battery discharging (evening) — energy delivered, hours, and depth of discharge
                    ...(maxDisch4 > 0.1 ? [{
                        x: times[iDisch4], y: midBand(iDisch4), xref: 'x', yref: 'y',
                        text: `🔋 <b>BESS Discharge</b><br>⏱ ${dischWindow}<br>⚡ Total <b>${bess_discharge_kwh_day.toFixed(0)} kWh/Day</b><br>🔻 DOD <b>${dod_pct.toFixed(0)}%</b> (Limit ${dod}%)`,
                        showarrow: true, arrowhead: 2, arrowcolor: '#c2185b', ax: 50, ay: -60,
                        bgcolor: 'rgba(248,187,208,0.95)', bordercolor: '#c2185b', borderwidth: 1, font: { size: 11, color: '#880e4f' }
                    }] : []),
                    peakAnn(times, net_curve_bat, 'Grid Peak', '#ff6d00', 35)
                ]
            });

            // Chart 5 data labels: peak grid draw before & after BESS
            setPeakAnnotations('chart5', [
                { ann: peakAnn(times, net_curve_no_bat, 'Solar Only', '#2196f3', -35), traceIdx: 1 },
                { ann: peakAnn(times, net_curve_bat, 'Solar + BESS', '#4caf50', 35), traceIdx: 2 }
            ]);

            // Lock chart1/3/4/5 to the SAME y-axis scale so they are visually comparable
            const yMaxShared = Math.ceil(Math.max(
                arrayMax(load_curve), arrayMax(solar_curve),
                arrayMax(net_curve_no_bat), arrayMax(net_curve_bat),
                arrayMax(solar_actual_bat), arrayMax(solar_actual_no_bat)
            ) * 1.15 / 50) * 50;
            ['chart1', 'chart3', 'chart4', 'chart5'].forEach(id =>
                Plotly.relayout(id, { 'yaxis.range': [0, yMaxShared] }));

            if (data.default_pvgis && data.default_pvgis.length > 0) {
                generatePVSystTable(kwp, invLimit, pr_float);
            }
            if (lastNetLoadRenderData && !isBatchImporting) {
                renderImportedNetLoad(lastNetLoadRenderData);
            }
            renderFusionChart();
        }

        function generatePVSystTable(kwp, invLimit, pr_float) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const tbody = document.querySelector('#pvsystTable tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            const isUsingPVSyst = (activeSolarSource === 'pvsyst' && importedPVSystData);
            // Ideal model: every day is identical, so a month is just its day count.
            const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            const idealDcDay = solarDailyKwh(kwp);
            const idealAcDay = solarDailyAcKwh(kwp, invLimit);
            const idealPsh = getSolarPSH();
            let totalGlobInc = 0;
            let totalEArrayMWh = 0;
            let totalEGridMWh = 0;
            let prSum = 0;
            let prCount = 0;
            let tAmbSum = 0;
            let tAmbCount = 0;

            for (let i = 0; i < 12; i++) {
                let globIncKWh, tAmbAvg, eArrayMWh, eGridMWh, pr;
                if (isUsingPVSyst && importedPVSystData.monthlySummary && importedPVSystData.monthlySummary[i]) {
                    const mData = importedPVSystData.monthlySummary[i];
                    eGridMWh = mData.eGridMWh;
                    pr = mData.avgPR > 0 ? mData.avgPR : 0.82;
                    globIncKWh = PSH * 30;
                    tAmbAvg = 30.0;
                    eArrayMWh = pr > 0 ? (eGridMWh / pr) : eGridMWh;
                    if (pr > 0) { prSum += pr; prCount++; }
                } else {
                    // PSH already nets out the losses, so EArray is the ideal DC energy and
                    // the only thing separating it from E_Grid is inverter clipping. PR is
                    // therefore the share that survives clipping, not a loss factor.
                    const nDays = DAYS_IN_MONTH[i];
                    globIncKWh = idealPsh * nDays;
                    tAmbAvg = null;                       // no temperature source in this mode
                    eArrayMWh = (idealDcDay * nDays) / 1000;
                    eGridMWh = (idealAcDay * nDays) / 1000;
                    pr = eArrayMWh > 0 ? (eGridMWh / eArrayMWh) : 0;
                    prSum += pr; prCount++;
                }

                totalGlobInc += globIncKWh;
                if (tAmbAvg != null) { tAmbSum += tAmbAvg; tAmbCount++; }
                totalEArrayMWh += eArrayMWh;
                totalEGridMWh += eGridMWh;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${months[i]}</td>
                    <td>${globIncKWh.toFixed(1)}</td>
                    <td>${tAmbAvg == null ? '—' : tAmbAvg.toFixed(2)}</td>
                    <td>${eArrayMWh.toFixed(2)}</td>
                    <td>${eGridMWh.toFixed(2)}</td>
                    <td>${pr.toFixed(3)}</td>
                `;
                tbody.appendChild(tr);
            }

            const overallPR = (isUsingPVSyst && prCount > 0 && totalGlobInc > 0 && kwp > 0)
                ? (totalEGridMWh * 1000) / (totalGlobInc * kwp)
                : (totalEArrayMWh > 0 ? totalEGridMWh / totalEArrayMWh : 1.0);
            const finalEGridYear = isUsingPVSyst ? importedPVSystData.annualTotalMWh : totalEGridMWh;
            const finalEArrayYear = totalEArrayMWh;
            const yearTAmb = tAmbCount > 0 ? (tAmbSum / tAmbCount) : null;

            const trTotal = document.createElement('tr');
            trTotal.className = 'total-row';
            trTotal.innerHTML = `
                <td>Year</td>
                <td>${totalGlobInc.toFixed(1)}</td>
                <td>${yearTAmb == null ? '—' : yearTAmb.toFixed(2)}</td>
                <td>${finalEArrayYear.toFixed(2)}</td>
                <td>${finalEGridYear.toFixed(2)}</td>
                <td>${overallPR.toFixed(3)}</td>
            `;
            tbody.appendChild(trTotal);
        }


        function autoCalcPeakTarget() {
            const kwp = parseFloat(document.getElementById('kwpInput').value) || 0;
            const invLimit = parseFloat(document.getElementById('invInput').value) || 0;

            const inverterType = document.getElementById('inverterType').value;
            const isHybrid = (inverterType === 'hybrid');
            const batCap = isHybrid ? (parseFloat(document.getElementById('batCapInput').value) || 0) : 0;
            const batPower = isHybrid ? (parseFloat(document.getElementById('pcsInput').value) || 0) : 0;

            if (batCap <= 0 || batPower <= 0) {
                alert("Please specify Battery Capacity and Max Power first!");
                return;
            }

            const interval_hours = (hours.length > 1) ? (hours[1] - hours[0]) : 0.25;
            const solar_dc_curve = buildSolarDcCurve(kwp, hours);
            const load_curve = data.overall_mean;
            const tariffVal = document.getElementById('tariffProfile').value;
            const tariffData = PEA_TARIFF_DATA[tariffVal];
            const is_tou = tariffData ? tariffData.is_tou : true;
            const allowGridCharge = document.getElementById('gridChargeInput').checked;
            const dod = Math.min(Math.max(parseFloat(document.getElementById('dodInput').value) || 80, 0), 100);

            const bestTarget = computeAutoPeakTarget(batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, interval_hours);
            document.getElementById('peakTargetInput').value = Math.round(bestTarget);

            updateDashboard();
        }

        function computeAutoPeakTarget(batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, interval_hours) {
            let bestTarget = 0;
            let minAchievedPeak = Infinity;
            const maxL = arrayMax(load_curve);
            const searchMax = Math.min(PEAK_SHAVE_SEARCH_MAX, Math.ceil((maxL > 0 ? maxL : 500) / 10) * 10);
            const step = Math.max(1, Math.round(searchMax / 60));
            for (let target = 0; target <= searchMax; target += step) {
                const result = simulateBESS(target, batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, hours, interval_hours);
                const achievedPeak = arrayMax(result.net_curve);
                if (achievedPeak < minAchievedPeak) {
                    minAchievedPeak = achievedPeak;
                    bestTarget = target;
                }
            }
            return bestTarget;
        }

        let summaryRevealed = false;
        let latestSummaryPayload = null;
        let latestBatteryVerdict = null;

        function applySummaryPayload(s) {
            if (!s) return;
            const scenario = s.hasBattery ? 'Solar + BESS' : 'Solar only';
            const setText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };

            setText('summaryScenario', scenario);
            setText('summaryHeadline', s.hasBattery
                ? 'คุ้มค่าไหมถ้าติดโซลาร์พร้อมแบต'
                : 'คุ้มค่าไหมถ้าติดโซลาร์อย่างเดียว');

            let lede;
            if (!s.hasLoad) {
                lede = 'ยังไม่พบโปรไฟล์โหลด — ตัวเลขด้านล่างอิงขนาดระบบและสมมติฐานค่าไฟที่ตั้งไว้ แนะนำอัปโหลด Excel โหลดเพื่อให้ผลใกล้ความจริง';
            } else if (s.paybackYears > 0 && s.paybackYears <= 7) {
                lede = `จากค่าที่ตั้งไว้ ระบบนี้คืนทุนประมาณ ${s.paybackStr} และประหยัดได้ราว ${formatter.format(s.saveYear)} ต่อปี`;
            } else if (s.paybackYears > 7) {
                lede = `คืนทุนประมาณ ${s.paybackStr} — ช้ากว่าเกณฑ์คร่าวๆ 7 ปี ลองปรับขนาดระบบ แบต หรือเรทค่าไฟแล้ว Run ใหม่`;
            } else {
                lede = 'ยังคำนวณจุดคืนทุนไม่ได้จากค่าปัจจุบัน ตรวจขนาดระบบ ต้นทุน และค่าไฟอีกครั้ง';
            }
            setText('summaryLede', lede);
            setText('summaryPayback', s.paybackStr);

            setText('summarySize', `${Number(s.kwp || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} kWp`);
            setText('summarySizeSub', s.hasBattery
                ? `Inverter ${Number(s.invLimit || 0).toLocaleString('en-US')} kW · BESS ${Numbe