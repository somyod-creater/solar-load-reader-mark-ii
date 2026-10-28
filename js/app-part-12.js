sx') || fileName.toLowerCase().endsWith('.xls'))) {
                        // cellDates: SheetJS otherwise converts a timestamp column to an Excel
                        // serial, and that conversion lands about 4 s late (12:30:01 reads back
                        // as 12:30:05). With 1-minute data that is enough to drop a reading into
                        // the neighbouring minute, which skews the per-minute averaged profile.
                        const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        text = XLSX.utils.sheet_to_csv(firstSheet);
                    } else {
                        text = new TextDecoder('utf-8').decode(bytes);
                        if (text.includes('\uFFFD')) {
                            try { text = new TextDecoder('windows-874').decode(bytes); } catch (e) { }
                        }
                    }
                } catch (err) {
                    text = new TextDecoder('utf-8').decode(bytes);
                }
            }

            const lines = text.split(/\r?\n/);
            let meta = {
                software: 'PVSYST',
                project: '',
                projectDesc: '',
                site: '',
                weather: '',
                variant: '',
                simDate: '',
                simPeriod: '',
                fileName: fileName || 'PVSYST_Export.csv'
            };

            let headerLineIdx = -1;
            let unitLineIdx = -1;
            let colMap = { date: -1, pr: -1, eGrid: -1 };

            for (let i = 0; i < Math.min(lines.length, 40); i++) {
                const line = lines[i].trim();
                if (!line) continue;

                if (line.toUpperCase().includes('PVSYST')) {
                    meta.software = line.replace(/^\uFEFF/, '').trim();
                } else if (line.toLowerCase().startsWith('project,')) {
                    const parts = line.split(',');
                    meta.project = parts[1] ? parts[1].trim() : '';
                    if (parts[3]) meta.projectDesc = parts[3].trim();
                } else if (line.toLowerCase().startsWith('geographical site,')) {
                    const parts = line.split(',');
                    meta.site = (parts[3] || parts[1] || '').trim();
                } else if (line.toLowerCase().startsWith('weather data,')) {
                    const parts = line.split(',');
                    meta.weather = (parts[3] || parts[1] || '').trim();
                } else if (line.toLowerCase().startsWith('simulation variant,')) {
                    const parts = line.split(',');
                    meta.variant = (parts[3] || parts[1] || '').trim();
                } else if (line.toLowerCase().startsWith('simulation date,')) {
                    const parts = line.split(',');
                    meta.simDate = (parts[2] || parts[1] || '').trim();
                } else if (line.toLowerCase().startsWith('simulation:,')) {
                    meta.simPeriod = line.replace(/^simulation:,/i, '').trim();
                }

                const lowerLine = line.toLowerCase();
                if ((lowerLine.includes('date') || lowerLine.includes('time')) && (lowerLine.includes('e_grid') || lowerLine.includes('egrid') || lowerLine.includes('pr'))) {
                    headerLineIdx = i;
                    unitLineIdx = i + 1;
                    const cols = line.split(',').map(c => c.trim().toLowerCase());
                    cols.forEach((col, idx) => {
                        if (col === 'date' || col === 'dates' || col === 'time') colMap.date = idx;
                        else if (col === 'pr' || col.includes('perf') || col.includes('ratio')) colMap.pr = idx;
                        else if (col === 'e_grid' || col === 'egrid' || col.includes('e_grid')) colMap.eGrid = idx;
                    });
                    break;
                }
            }

            if (headerLineIdx === -1 || colMap.date === -1 || colMap.eGrid === -1) {
                return null;
            }

            const startRow = unitLineIdx + 1;
            const hourlyData = [];
            let peakPowerKw = 0;
            let totalEnergyKwh = 0;

            const hourSums = new Array(24).fill(0);
            const hourCounts = new Array(24).fill(0);
            const monthHourSums = Array.from({ length: 12 }, () => new Array(24).fill(0));
            const monthHourCounts = Array.from({ length: 12 }, () => new Array(24).fill(0));
            // Real per-weekday averages (index = JS Date.getDay(): 0=Sun..6=Sat) for the Weekly view,
            // so e.g. Tuesday shows the actual average of every Tuesday in the dataset instead of
            // just repeating the single annual-average daily profile 7 times.
            const weekdayHourSums = Array.from({ length: 7 }, () => new Array(24).fill(0));
            const weekdayHourCounts = Array.from({ length: 7 }, () => new Array(24).fill(0));

            const monthlyData = Array.from({ length: 12 }, () => ({
                eGridKwh: 0,
                prDaylightSum: 0,
                prDaylightCount: 0
            }));

            for (let i = startRow; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = line.split(',');
                if (cols.length <= Math.max(colMap.date, colMap.eGrid)) continue;

                const dateStr = cols[colMap.date].trim();
                const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{1,2})/);
                let d = 1, m = 1, y = 2024, h = 0, min = 0;
                if (dateParts) {
                    d = parseInt(dateParts[1], 10);
                    m = parseInt(dateParts[2], 10);
                    y = parseInt(dateParts[3], 10);
                    if (y < 100) y += 2000;
                    h = parseInt(dateParts[4], 10);
                    min = parseInt(dateParts[5], 10);
                } else {
                    const dt = new Date(dateStr);
                    if (!isNaN(dt.getTime())) {
                        d = dt.getDate();
                        m = dt.getMonth() + 1;
                        y = dt.getFullYear();
                        h = dt.getHours();
                        min = dt.getMinutes();
                    } else {
                        continue;
                    }
                }

                const rawEGrid = parseFloat(cols[colMap.eGrid]);
                if (isNaN(rawEGrid)) continue;

                const eGridKw = Math.max(0, rawEGrid);
                const pr = colMap.pr >= 0 ? (parseFloat(cols[colMap.pr]) || 0) : 0;

                if (eGridKw > peakPowerKw) {
                    peakPowerKw = eGridKw;
                }

                totalEnergyKwh += eGridKw;

                if (h >= 0 && h < 24) {
                    hourSums[h] += eGridKw;
                    hourCounts[h]++;
                }

                const monthIdx = m - 1;
                if (monthIdx >= 0 && monthIdx < 12) {
                    monthlyData[monthIdx].eGridKwh += eGridKw;
                    if (eGridKw > 0 && pr > 0) {
                        monthlyData[monthIdx].prDaylightSum += pr;
                        monthlyData[monthIdx].prDaylightCount++;
                    }
                    if (h >= 0 && h < 24) {
                        monthHourSums[monthIdx][h] += eGridKw;
                        monthHourCounts[monthIdx][h]++;
                    }
                }

                if (h >= 0 && h < 24) {
                    const dow = new Date(y, m - 1, d).getDay();
                    weekdayHourSums[dow][h] += eGridKw;
                    weekdayHourCounts[dow][h]++;
                }

                hourlyData.push({
                    dateStr,
                    month: m,
                    day: d,
                    hour: h,
                    eGridKw,
                    pr
                });
            }

            if (hourlyData.length === 0) return null;

            const hourlyMeanProfile = hourSums.map((sum, h) => hourCounts[h] > 0 ? (sum / hourCounts[h]) : 0);
            // Per-month version of hourlyMeanProfile, for the "Solar - Jan"/"Solar - Feb"/... comparison
            // traces on chart1 (same idea as the per-month "Avg Load" traces real load data gets).
            const monthlyHourlyProfiles = monthHourSums.map((sums, mi) =>
                sums.map((sum, h) => monthHourCounts[mi][h] > 0 ? (sum / monthHourCounts[mi][h]) : 0));
            const weekdayHourlyProfiles = weekdayHourSums.map((sums, wd) =>
                sums.map((sum, h) => weekdayHourCounts[wd][h] > 0 ? (sum / weekdayHourCounts[wd][h]) : 0));
            const avgDailyKwh = totalEnergyKwh / (hourlyData.length / 24);

            const monthlySummary = monthlyData.map((m, idx) => {
                const eGridMWh = m.eGridKwh / 1000;
                const avgPR = m.prDaylightCount > 0 ? (m.prDaylightSum / m.prDaylightCount) : 0;
                return {
                    monthIdx: idx,
                    eGridMWh: parseFloat(eGridMWh.toFixed(2)),
                    avgPR: parseFloat(avgPR.toFixed(3))
                };
            });

            return {
                meta,
                totalPoints: hourlyData.length,
                peakPowerKw: parseFloat(peakPowerKw.toFixed(2)),
                annualTotalMWh: parseFloat((totalEnergyKwh / 1000).toFixed(2)),
                avgDailyKwh: parseFloat(avgDailyKwh.toFixed(2)),
                hourlyMeanProfile,
                monthlyHourlyProfiles,
                weekdayHourlyProfiles,
                monthlySummary,
                hourlyData
            };
        }

        function handlePVSystUpload(files) {
            if (!files || files.length === 0) return;
            const file = files[0];
            const statusEl = document.getElementById('pvsystStatus');
            if (statusEl) statusEl.innerHTML = `⏳ กำลังอ่านข้อมูล PVSyst จาก ${file.name}...`;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const arrayBuffer = e.target.result;
                    const parsed = parsePVSystContent(arrayBuffer, file.name);
                    if (!parsed) {
                        if (statusEl) statusEl.innerHTML = `❌ ไม่พบข้อมูลคอลัมน์ date และ E_Grid ในไฟล์ ${file.name} กรุณาตรวจสอบว่าเป็นไฟล์ PVSyst Hourly Simulation Export`;
                        return;
                    }
                    importedPVSystData = parsed;
                    activeSolarSource = 'pvsyst';

                    updatePVSystUI();
                    if (!rawDataPoints || rawDataPoints.length === 0) {
                        // No real load uploaded - rebuild chart1's axis now so the per-month PVSyst
                        // comparison traces show up immediately, not only after the period toggle
                        // is clicked once.
                        rebuildEmptyLoadProfileForPeriod(netLoadPeriod);
                    } else {
                        updateDashboard();
                    }
                    saveImportedState(lastUploadedFiles.map(f => f.name));
                } catch (err) {
                    console.error('Error parsing PVSyst file', err);
                    if (statusEl) statusEl.innerHTML = `❌ เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message}`;
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function updatePVSystUI() {
            const statusEl = document.getElementById('pvsystStatus');
            const infoBox = document.getElementById('pvsystInfoBox');
            const badge = document.getElementById('pvsystSourceBadge');
            const srcGroup = document.getElementById('solarSourceControlGroup');

            // Tab 1 too