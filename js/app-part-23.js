roup'
                };
                Plotly.newPlot('chart-fusion', fusionTraces, fusionLayout, { responsive: true, displayModeBar: false });
                renderBatteryAnalysis();
            } else {
                document.getElementById('chart-fusion').style.display = 'none';
                document.getElementById('battery-analysis-panel').style.display = 'none';
                latestBatteryVerdict = null;
                syncSummaryBatteryCard();
            }
        }

        function renderBatteryAnalysis() {
            if (!fusionSolarData || fusionSolarData.times.length < 2) return;
            document.getElementById('battery-analysis-panel').style.display = 'block';

            var n = fusionSolarData.times.length;
            // Financial inputs pulled from the app's own settings (single source of truth).
            var ft = parseFloat(document.getElementById('ftInput')?.value) || 0;
            var rate = (parseFloat(document.getElementById('rateInput').value) || 4.1839) + ft;
            var batteryCostPerKwh = parseFloat(document.getElementById('batCostInput').value) || 10000; // Battery Cost (Baht/kWh)
            var demandChargeRate = parseFloat(document.getElementById('demandRateInput')?.value) ?? DEMAND_CHARGE_RATE;

            // Determine data interval in hours from first two points
            var dt0 = new Date(fusionSolarData.times[0]);
            var dt1 = new Date(fusionSolarData.times[1]);
            var intervalHours = Math.max((dt1 - dt0) / 3600000, 0.25);

            // Count unique days and months
            var daySet = {};
            var monthSet = {};
            for (var i = 0; i < n; i++) {
                var d = new Date(fusionSolarData.times[i]);
                var dayKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
                var monKey = d.getFullYear() + '-' + (d.getMonth() + 1);
                daySet[dayKey] = true;
                monthSet[monKey] = true;
            }
            var numDays = Math.max(Object.keys(daySet).length, 1);
            var numMonths = Math.max(Object.keys(monthSet).length, 1);

            // === Box 1: Solar Surplus ===
            var totalExportKWh = 0;
            var curtailmentIntervals = 0;
            var peakSurplus = 0;
            for (var i = 0; i < n; i++) {
                var grid = fusionSolarData.gridPower[i] || 0;
                if (grid < 0) {
                    totalExportKWh += Math.abs(grid) * intervalHours;
                    curtailmentIntervals++;
                    if (Math.abs(grid) > peakSurplus) peakSurplus = Math.abs(grid);
                }
            }
            var exportPerDay = totalExportKWh / numDays;
            var exportPerMonth = totalExportKWh / numMonths;
            var curtailHoursPerDay = (curtailmentIntervals * intervalHours) / numDays;

            document.getElementById('ba-export-day').textContent = exportPerDay.toFixed(1) + ' kWh';
            document.getElementById('ba-export-month').textContent = exportPerMonth.toFixed(0) + ' kWh';
            document.getElementById('ba-curtail-hours').textContent = curtailHoursPerDay.toFixed(1) + ' hrs';
            document.getElementById('ba-peak-surplus').textContent = peakSurplus.toFixed(0) + ' kW';

            // === Box 2: Self-Consumption ===
            var totalSolar = 0;
            var totalConsumption = 0;
            for (var i = 0; i < n; i++) {
                var solar = fusionSolarData.activePower[i] || 0;
                var cons = fusionSolarData.consumption[i] || 0;
                totalSolar += solar * intervalHours;
                totalConsumption += cons * intervalHours;
            }
            var selfConsumedSolar = totalSolar - totalExportKWh;
            if (selfConsumedSolar < 0) selfConsumedSolar = 0;
            var selfConsumptionRate = totalSolar > 0 ? (selfConsumedSolar / totalSolar * 100) : 0;
            var selfSufficiencyRate = totalConsumption > 0 ? (selfConsumedSolar / totalConsumption * 100) : 0;

            document.getElementById('ba-total-solar').textContent = (totalSolar / numMonths).toFixed(0) + ' kWh/mo';
            document.getElementById('ba-self-consumed').textContent = (selfConsumedSolar / numMonths).toFixed(0) + ' kWh/mo';
            var scrEl = document.getElementById('ba-self-consumption-rate');
            scrEl.textContent = selfConsumptionRate.toFixed(1) + '%';
            scrEl.style.color = selfConsumptionRate < 80 ? '#e74c3c' : '#2ecc71';
            var ssEl = document.getElementById('ba-self-sufficiency');
            ssEl.textContent = selfSufficiencyRate.toFixed(1) + '%';
            ssEl.style.color = selfSufficiencyRate < 30 ? '#e74c3c' : '#2ecc71';

            // === Box 3: Night Load (18:00-06:00) ===
            var nightLoads = [];
            var nightWeekday = [];
            var nightWeekend = [];
            for (var i = 0; i < n; i++) {
                var d = new Date(fusionSolarData.times[i]);
                var hr = d.getHours();
                if (hr >= 18 || hr < 6) {
                    var cons = fusionSolarData.consumption[i] || 0;
                    nightLoads.push(cons);
                    var dow = d.getDay();
                    if (dow === 0 || dow === 6) {
                        nightWeekend.push(cons);
                    } else {
                        nightWeekday.push(cons);
                    }
                }
            }
            var avgNight = nightLoads.length > 0 ? nightLoads.reduce(function (a, b) { return a + b; }, 0) / nightLoads.length : 0;
            var nightEnergyPerNight = avgNight * 12;
            var avgNightWeekday = nightWeekday.length > 0 ? nightWeekday.reduce(function (a, b) { return a + b; }, 0) / nightWeekday.length : 0;
            var avgNightWeekend = nightWeekend.length > 0 ? nightWeekend.reduce(function (a, b) { return a + b; }, 0) / nightWeekend.length : 0;

            document.getElementById('ba-night-avg').textContent = avgNight.toFixed(0) + ' kW';
            document.getElementById('ba-night-energy').textContent = nightEnergyPerNight.toFixed(0) + ' kWh';
            document.getElementById('ba-night-weekday').textContent = avgNightWeekday.toFixed(0) + ' kW';
            document.getElementById('ba-night-weekend').textContent = avgNightWeekend.toFixed(0) + ' kW';

            // === Box 4: Peak Shaving ===
            var peakGrid = 0;
            var totalGridImport = 0;
            var gridImportCount = 0;
            var gridImports = [];
            for (var i = 0; i < n; i++) {
                var grid = fusionSolarData.gridPower[i] || 0;
                if (grid > 0) {
                    totalGridImport += grid;
                    gridImportCount++;
                    gridImports.push(grid);
                    if (grid > peakGrid) peakGrid = grid;
                }
            }
            var avgGrid = gridImportCount > 0 ? totalGridImport / gridImportCount : 0;
            // Real 90th-percentile of grid import (NOT 90% of the max). The demand a battery can
            // realistically shave is the gap between the absolute peak and the level the site
            // actually sits at ~90% of the time — brief spikes, not the whole baseline.
            gridImports.sort(function (a, b) { return a - b; });
            var p90Grid = gridImports.length ? gridImports[Math.floor(gridImports.length * 0.9)] : 0;
            // Honour the user's explicit Peak Shaving Target if set; otherwise shave down to p90.
            var userPeakTarget = parseFloat(document.getElementById('peakTargetInput').value) || 0;
            var shaveFloor = userPeakTarget > 0 ? userPeakTarget : p90Grid;
            var shavable = Math.max(0, peakGrid - shaveFloor);

            // Find peak hours: hours where grid import exceeds the shave floor
            var hourPeakCounts = {};
            for (var i = 0; i < n; i++) {
                var grid = fusionSolarData.gridPower[i] || 0;
                if (grid > shaveFloor) {
                    var d = new Date(fusionSolarData.times[i]);
                    var hrKey = d.getHours().toString().padStart(2, '0') + ':00';
                    hourPeakCounts[hrKey] = (hourPeakCounts[hrKey] || 0) + 1;
                }
            }
            var peakHoursSorted = Object.keys(hourPeakCounts).sort(function (a, b) { return hourPeakCounts[b] - hourPeakCounts[a]; });
            var topPeakHours = peakHoursSorted.slice(0, 3).join(', ') || '—';

            document.getElementById('ba-peak-grid').textContent = peakGrid.toFixed(0) + ' kW';
            document.getElementById('ba-avg-grid').textContent = avgGrid.toFixed(0) + ' kW';
            document.getElementById('ba-shavable').textContent = shavable.toFixed(0) + ' kW';
            document.getElementById('ba-peak-hours').textContent = topPeakHours;

            // === Box 5: Battery Sizing ===
            var recCapacity = Math.min(exportPerDay, nightEnergyPerNight);
            recCapacity = Math.ceil(recCapacity / 50) * 50;
            if (recCapacity < 50) recCapacity = 50;
            var recPower = Math.max(peakSurplus, shavable);
            recPower = Math.ceil(recPower / 50) * 50;
            if (recPower < 50) recPower = 50;
            var cRate = recCapacity > 0 ? recPower / recCapacity : 0;
            var batteryType = cRate > 0.5 ? 'Power-oriented (LFP C1)' : 'Energy-oriented (LFP C0.5)';

            document.getElementById('ba-rec-capacity').textContent = recCapacity + ' kWh';
            document.getElementById('ba-rec-power').textContent = recPower + ' kW';
            document.getElementById('ba-c-rate').textContent = 'C' + cRate.toFixed(2);
            document.getElementById('ba-battery-type').textContent = batteryType;

            // === Box 6: Financial ===
            var savedExportPerMonth = exportPerMonth * rate;
            var demandSavingPerMonth = shavable * demandChargeRate;
            var totalSavingPerYear = (savedExportPerMonth + demandSavingPerMonth) * 12;
            var batteryCost = recCapacity * batteryCostPerKwh;
            var paybackYears = totalSavingPerYear > 0 ? batteryCost / totalSavingPerYear : Infinity;

            function fmtNum(v) { return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
            document.getElementById('ba-saved-export').textContent = '\u0e3f' + fmtNum(savedExportPerMonth);
            document.getElementById('ba-demand-saving').textContent = '\u0e3f' + fmtNum(demandSavingPerMonth);
            document.getElementById('ba-total-saving').textContent = '\u0e3f' + fmtNum(totalSavingPerYear);
            document.getElementById('ba-payback').textContent = paybackYears < 100 ? paybackYears.toFixed(1) + ' years' : 'N/A';

            // === Verdict (ภาษาคนอ่าน + ขนาดที่แนะนำ) ===
            var verdictEl = document.getElementById('ba-verdict');
            var score = 0;
            var reasons = [];
            var exportShare = totalSolar > 0 ? (totalExportKWh / totalSolar) : 0;
            if (totalSolar > 0 && selfConsumptionRate < 80) { score++; reasons.push('ใช้โซลาร์เองได้แค่ ' + selfConsumptionRate.toFixed(0) + '% — ยังมีไฟเหลือ'); }
            if (totalSolar > 0 && exportShare > 0.2) { score++; reasons.push('ส่งออกกริด ' + (exportShare * 100).toFixed(0) + '% ของโซลาร์'); }
            if (peakGrid > 500) { score++; reasons.push('พีคซื้อกริดสูง ' + peakGrid.toFixed(0) + ' kW'); }
            if (paybackYears < 7) { score++; reasons.push('ประมาณคืนทุนแบต ~' + paybackYears.toFixed(1) + ' ปี'); }

            var level = score >= 3 ? 'yes' : (score >= 2 ? 'maybe' : 'no');
            var title = level === 'yes'
                ? 'แนะนำติดแบต'
                : (level === 'maybe' ? 'พิจารณาติดแบตได้' : 'ยังไม่แนะนำติดแบต');
            var tone = level === 'yes' ? '#2ecc71' : (level === 'maybe' ? '#f39c12' : '#e74c3c');
            var border = tone;
            var bg = level === 'yes' ? 'rgba(46,204,113,0.15)' : (level === 'maybe' ? 'rgba(243,156,18,0.15)' 