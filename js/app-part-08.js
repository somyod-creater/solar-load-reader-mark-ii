yWeekday[wd]) datesByWeekday[wd] = new Set();
                datesByWeekday[wd].add(dm);
            });
            weekdayDateSuffix = {};
            Object.keys(datesByWeekday).forEach(wd => {
                const dates = datesByWeekday[wd];
                weekdayDateSuffix[wd] = dates.size === 1 ? ' ' + Array.from(dates)[0] : '';
            });
        }

        function weeklySlotLabel(date, timeStr) {
            const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const wd = date.getDay();
            return `${labels[wd]}${weekdayDateSuffix[wd] || ''} ${timeStr}`;
        }

        function profileSlotLabel(date, timeStr) {
            return netLoadPeriod === 'weekly' ? weeklySlotLabel(date, timeStr) : timeStr;
        }

        // Every Mon-Sun slot at the profile's own resolution, labelled exactly as
        // weeklySlotLabel() would label a real reading, so covered slots match up and
        // the rest stay empty.
        function buildFullWeekSlots(points) {
            const clocks = Array.from(new Set(points.map(p => {
                const d = p.datetime;
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            }))).sort();
            if (clocks.length === 0) return [];
            const week = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
            const slots = [];
            week.forEach(([name, dayIdx]) => {
                const suffix = weekdayDateSuffix[dayIdx] || '';
                clocks.forEach(c => slots.push(`${name}${suffix} ${c}`));
            });
            return slots;
        }

        function sortProfileSlots(a, b) {
            if (netLoadPeriod !== 'weekly') return a.localeCompare(b);
            const order = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
            // "Mon 28/09 08:00" or "Mon 08:00" - the clock is always the last token
            const partsA = a.split(' '), partsB = b.split(' ');
            const dayA = partsA[0], timeA = partsA[partsA.length - 1];
            const dayB = partsB[0], timeB = partsB[partsB.length - 1];
            const dayDiff = (order[dayA] ?? 0) - (order[dayB] ?? 0);
            return dayDiff !== 0 ? dayDiff : timeA.localeCompare(timeB);
        }

        function timeSlotToHour(slot) {
            const timePart = slot.includes(' ') ? slot.split(' ').pop() : slot;
            const parts = timePart.split(':');
            return parseInt(parts[0]) + parseInt(parts[1]) / 60.0;
        }

        function aggregateImportedNetRows(rows, seriesCols, period) {
            const designedKwp = parseFloat(document.getElementById('kwpInput').value) || 0;
            const designedInvLimit = parseFloat(document.getElementById('invInput').value) || 0;
            // Same measured PVGIS profile the main solar curve uses; this was still on
            // the old half-sine after that switch, so the Net Load chart disagreed with
            // chart 1 about how much the designed array makes at a given hour.
            const designedSolarAtHour = (hour) => {
                if (designedKwp <= 0) return 0;
                const dc = designedKwp * solarPerKwpAtHour(hour);
                return designedInvLimit > 0 ? Math.min(dc, designedInvLimit) : dc;
            };

            const groups = {};
            rows.forEach(r => {
                const d = new Date(r.time);
                if (isNaN(d.getTime())) return;
                let key;
                let xValue;
                if (period === 'weekly') {
                    const clock = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                    key = profileSlotLabel(d, clock);
                    xValue = key;
                } else if (period === 'monthly') {
                    const keyDate = new Date(d.getFullYear(), d.getMonth(), 1);
                    key = keyDate.getTime();
                    xValue = keyDate;
                } else {
                    const keyDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    key = keyDate.getTime();
                    xValue = keyDate;
                }
                if (!groups[key]) {
                    groups[key] = { time: xValue, sums: {}, counts: {} };
                    seriesCols.forEach(col => { groups[key].sums[col] = 0; groups[key].counts[col] = 0; });
                }
                seriesCols.forEach(col => {
                    const v = Number(r.vals[col]);
                    if (!isNaN(v)) {
                        groups[key].sums[col] += v;
                        groups[key].counts[col] += 1;
                    }
                });
            });

            return Object.values(groups)
                .sort((a, b) => period === 'weekly' ? sortProfileSlots(a.time, b.time) : a.time.getTime() - b.time.getTime())
                .map(g => {
                    const vals = {};
                    seriesCols.forEach(col => {
                        vals[col] = g.counts[col] ? g.sums[col] / g.counts[col] : 0;
                    });
                    return { time: g.time, vals };
                });
        }

        function renderImportedNetLoad(_ignored) {
            updateNetLoadPeriodButtons();
            // Plot straight from the RAW sheet data. plantReportData holds every column exactly as imported.
            // importedNetLoadData is a pre-digested derivative (no Import column, wrong phase-1) → only a last resort.
            const hasRows = d => d && d.rows && d.rows.length;
            let data = hasRows(plantReportData) ? plantReportData : (hasRows(importedNetLoadData) ? importedNetLoadData : null);
            lastNetLoadRenderData = data;
            if (!data) {
                emptyImportedNetLoadChart('ยังไม่มีข้อมูลดิบ (plantReportData)<br>กรุณาอัพโหลดไฟล์ Plant Report ใหม่');
                return;
            }

            const headers = [...new Set([
                ...(data.headers || []),
                ...((data.rows || []).flatMap(r => Object.keys(r.vals || {})))
            ])];
            const rows = data.rows || [];
            const norm = h => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const compact = h => norm(h).replace(/[^a-z0-9]/g, '');
            const findHeader = predicate => headers.find(h => predicate(norm(h)));
            const consumptionCol = headers.find(h => compact(h) === 'consumptionkwh')
                || findHeader(h => h.includes('consumption') && !h.includes('self-consumption'));
            const inverterYieldCols = headers.filter(h => {
                const n = norm(h);
                return compact(h) === 'inverteryieldkwh' || (n.includes('inverter') && n.includes('yield'));
            });

            const phase1Col = inverterYieldCols.find(h => /phase\s*1|phase1|ph\s*1|\bp1\b/i.test(h)) || inverterYieldCols[0];
            // Import (kWh) = current remaining load AFTER existing Phase 1 solar — the baseline we analyse for Phase 2
            const importCol = headers.find(h => compact(h) === 'importkwh')
                || findHeader(h => h.includes('import') && h.includes('kwh'))
                || findHeader(h => h.includes('import'));

            if (!importCol && !consumptionCol) {
                emptyImportedNetLoadChart('ไม่พบคอลัมน์ที่ต้องใช้<br>ต้องมี <b>Import (kWh)</b> หรือ <b>Consumption (kWh)</b> ในไฟล์ที่อัพโหลด');
                return;
            }

            // Designed Solar Phase 2 model — SAME (ideal) solar model as the main dashboard charts
            // (chart1/3/4/5), so every chart in the app is consistent.
            const designedKwp = parseFloat(document.getElementById('kwpInput').value) || 0;
            const designedInvLimit = parseFloat(document.getElementById('invInput').value) || 0;
            const isUsingPVSyst = (activeSolarSource === 'pvsyst' || activeSolarSource === 'compare') && importedPVSystData;
            const designedSolarAtHour = (hour) => {
                if (isUsingPVSyst) {
                    const hFloor = Math.floor(hour) % 24;
                    const dc = importedPVSystData.hourlyMeanProfile[hFloor] || 0;
                    return designedInvLimit > 0 ? Math.min(dc, designedInvLimit) : dc;
                }
                // was still the old half-sine after the PVGIS switch, so this chart
                // disagreed with chart 1 about the designed array's hourly output
                if (designedKwp <= 0) return 0;
                const dc = designedKwp * solarPerKwpAtHour(hour);
                return designedInvLimit > 0 ? Math.min(dc, designedInvLimit) : dc;
            };

            const groups = {};
            const overall = {};
            rows.forEach(r => {
                const d = new Date(r.time);
                if (isNaN(d.getTime())) return;
                const clock = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                const slot = profileSlotLabel(d, clock);
                const month = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                // Raw values straight from the sheet — no derived logic
                const consumptionVal = consumptionCol ? Number(r.vals[consumptionCol] ?? 0) : 0;
                const phase1Val = phase1Col ? Number(r.vals[phase1Col] ?? 0) : 0;
                const importVal = importCol ? Number(r.vals[importCol] ?? 0) : 0;
                const phase2Val = designedSolarAtHour(timeSlotToHour(slot));
                const netVal = importVal - phase2Val; // Import (raw) − Designed Phase 2

                if (!groups[month]) groups[month] = {};
                if (!groups[month][slot]) groups[month][slot] = { consumption: 0, phase1: 0, import: 0, phase2: 0, net: 0, count: 0 };
                groups[month][slot].consumption += consumptionVal;
                groups[month][slot].phase1 += phase1Val;
                groups[month][slot].import += importVal;
                groups[month][slot].phase2 += phase2Val;
                groups[month][slot].net += netVal;
                groups[month][slot].count += 1;

                if (!overall[slot]) overall[slot] = { consumption: 0, phase1: 0, import: 0, phase2: 0, net: 0, count: 0 };
                overall[slot].consumption += consumptionVal;
                overall[slot].phase1 += phase1Val;
                overall[slot].import += importVal;
                overall[slot].phase2 += phase2Val;
                overall[slot].net += netVal;
                overall[slot].count += 1;
            });

            const x = Object.keys(overall).sort(sortProfileSlots);
            const avgSeries = (bucket, key) => x.map(slot => {
                const item = bucket[slot];
                return item && item.count ? item[key] / item.count : 0;
            });
            const consumption = avgSeries(overall, 'consumption');
            const phase1 = avgSeries(overall, 'phase1');
            const importLoad = avgSeries(overall, 'import');
            const phase2 = avgSeries(overall, 'phase2');
            const netLoad = avgSeries(overall, 'net');

            const traces = [
                // Context: original load before any solar
                ...(consumptionCol ? [{ x, y: consumption, type: 'scatter', mode: 'lines', name: '<b>Consumption — โหลดเดิม (ก่อนโซลาร์)</b>', line: { shape: 'spline', color: '#2c3e50', width: 1.5, dash: 'dot' } }] : []),
                // Context: existing Phase 1 solar production
                ...(phase1Col ? [{ x, y: phase1, type: 'scatter', mode: 'lines', name: '<b>Solar Phase 1 (Inverter Yield)</b>', line: { shape: 'spline', color: '#f9a825', width: 1.5, dash: 'dot' } }] : []),
                // Baseline for Phase 2: current remaining load (Import)
                { x, y: importLoad, type: 'scatter', mode: 'lines', name: '<b>Import — โหลดคงเ