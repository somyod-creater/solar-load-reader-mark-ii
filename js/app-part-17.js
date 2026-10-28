urn;
                        }

                        // Merge with existing or overwrite. We will OVERWRITE the loaded points
                        rawDataPoints = newPoints;
                        lastUploadedFiles = Array.from(files);
                        lastAmpConversion = fileAmpMeta;

                        // Sort by datetime
                        rawDataPoints.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
                        saveImportedState(Array.from(files).map(f => f.name));

                        processDataPoints(rawDataPoints, files);
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        }


        // ===================== Raw plot tab =====================
        // Deliberately standalone: its own file input, its own state, its own chart.
        // It reads a sheet, finds a time column, and draws every numeric column as it
        // stands — no averaging, no bucketing, no unit conversion, and nothing here is
        // read by the sizing or financial code.

        let plotData = null;   // { x, xIsTime, series: [{name, y, color, hasData}] }

        const PLOT_COLORS = ['#58A6FF', '#FFB020', '#2DD4BF', '#A78BFA', '#F87171',
            '#34D399', '#FB923C', '#F472B6', '#22D3EE', '#A3E635'];

        // Fixed colours for the series these exports always carry, so the same quantity
        // keeps the same colour whatever order the columns happen to arrive in.
        const PLOT_NAMED_COLORS = {
            production: '#3BCE76',
            grid: '#EB85FF',
            consumption: '#007F8D'
        };

        // "Consumption（kW）" / "Grid (kW)" -> "consumption" / "grid"
        function plotSeriesKey(name) {
            return String(name || '')
                .replace(/[（(\[].*?[）)\]]/g, ' ')
                .replace(/[^a-z]+/gi, ' ')
                .trim()
                .toLowerCase();
        }

        function plotFillColor(hex, alpha) {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
            if (!m) return 'rgba(255,255,255,' + alpha + ')';
            const n = parseInt(m[1], 16);
            return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
        }

        function plotSeriesColor(name, fallbackIndex) {
            return PLOT_NAMED_COLORS[plotSeriesKey(name)] || PLOT_COLORS[fallbackIndex % PLOT_COLORS.length];
        }

        function parsePlotGrid(grid) {
            if (!grid || grid.length < 2) return null;

            // Header row + time column: the first column whose next few rows parse as
            // dates. Falls back to row 0 with the row number as the x axis.
            let headerRow = -1, timeCol = -1;
            for (let r = 0; r < Math.min(grid.length - 1, 8) && headerRow < 0; r++) {
                const row = grid[r] || [];
                for (let c = 0; c < row.length; c++) {
                    let hits = 0, looked = 0;
                    for (let k = r + 1; k < Math.min(grid.length, r + 6); k++) {
                        const cell = grid[k] && grid[k][c];
                        if (cell == null || cell === '') continue;
                        looked++;
                        if (toDateCell(cell)) hits++;
                    }
                    if (looked >= 2 && hits === looked) { headerRow = r; timeCol = c; break; }
                }
            }
            if (headerRow < 0) { headerRow = 0; timeCol = -1; }

            const headers = (grid[headerRow] || []).map((h, i) => {
                const name = String(h == null ? '' : h).trim();
                return name || `Column ${i + 1}`;
            });
            const body = grid.slice(headerRow + 1).filter(r => r && r.some(c => c != null && c !== ''));
            if (body.length === 0) return null;

            const x = body.map((r, i) => {
                if (timeCol < 0) return i + 1;
                const d = toDateCell(r[timeCol]);
                return d || null;
            });
            const xHours = x.map(v => (v instanceof Date)
                ? v.getHours() + v.getMinutes() / 60 + v.getSeconds() / 3600
                : null);

            const series = [];
            for (let c = 0; c < headers.length; c++) {
                if (c === timeCol) continue;
                let numeric = 0, nonZero = 0;
                const y = body.map(r => {
                    const raw = r[c];
                    if (raw == null || raw === '') return null;
                    const v = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                    if (!isFinite(v)) return null;
                    numeric++;
                    if (v !== 0) nonZero++;
                    return v;
                });
                if (numeric === 0) continue;   // text or empty column - nothing to plot
                series.push({
                    name: headers[c],
                    isGrid: plotSeriesKey(headers[c]) === 'grid',
                    y,
                    points: numeric,
                    // all-zero columns (an unused generator, say) are kept but left
                    // unticked so they don't bury the series that carry data
                    hasData: nonZero > 0,
                    color: plotSeriesColor(headers[c], series.length),
                    selected: nonZero > 0
                });
            }
            if (series.length === 0) return null;

            return {
                x, xHours, xIsTime: timeCol >= 0,
                xName: timeCol >= 0 ? headers[timeCol] : 'Row',
                series, rows: body.length, fileCount: 1
            };
        }

        // One file per day is how these are exported, so two files never share a full
        // timestamp. Matching on the time of day is what lets them be averaged at all —
        // and for files that DO cover the same day it comes to the same grouping.
        //
        // Every slot averages whatever files reached it. The days start and end at
        // different times, so the early and late slots rest on fewer files than the
        // middle; the count per slot is carried through to the hover so a thin slot is
        // visible rather than implied.
        function mergePlotFiles(parsedList) {
            const slots = new Map();      // "HH:MM" -> { hour, perSeries: Map<name,{sum,n}>, files:Set }
            const seriesOrder = [];
            const seriesSeen = new Set();

            parsedList.forEach((p, fileIdx) => {
                p.series.forEach(sr => {
                    if (!seriesSeen.has(sr.name)) { seriesSeen.add(sr.name); seriesOrder.push(sr.name); }
                });
                p.x.forEach((xv, rowIdx) => {
                    const hour = p.xHours ? p.xHours[rowIdx] : null;
                    if (hour == null) return;
                    const hh = String(Math.floor(hour)).padStart(2, '0');
                    const mm = String(Math.round((hour - Math.floor(hour)) * 60)).padStart(2, '0');
                    const key = `${hh}:${mm}`;
                    let slot = slots.get(key);
                    if (!slot) { slot = { hour, perSeries: new Map(), files: new Set() }; slots.set(key, slot); }
                    let touched = false;
                    p.series.forEach(sr => {
                        const v = sr.y[rowIdx];
                        if (v == null) return;
                        let acc = slot.perSeries.get(sr.name);
                        if (!acc) { acc = { sum: 0, n: 0 }; slot.perSeries.set(sr.name, acc); }
                        acc.sum += v; acc.n++;
                        touched = true;
                    });
                    if (touched) slot.files.add(fileIdx);
                });
            });

            const keys = Array.from(slots.keys()).sort();
            if (keys.length === 0) return null;

            const series = seriesOrder.map((name, i) => {
                let numeric = 0, nonZero = 0;
                const y = keys.map(k => {
                    const acc = slots.get(k).perSeries.get(name);
                    if (!acc || acc.n === 0) return null;
                    const v = acc.sum / acc.n;
                    numeric++;
                    if (v !== 0) nonZero++;
                    return v;
                });
                return {
                    name,
                    isGrid: plotSeriesKey(name) === 'grid',
                    y,
                    points: numeric,
                    hasData: nonZero > 0,
                    color: plotSeriesColor(name, i),
                    selected: nonZero > 0
                };
            }).filter(sr => sr.points > 0);
            if (series.length === 0) return null;

            return {
                x: keys,
                xHours: keys.map(k => slots.get(k).hour),
                slotFiles: keys.map(k => slots.get(k).files.size),
                xIsTime: false,
                xName: 'เวลาในวัน',
                series,
                rows: keys.length,
                fileCount: parsedList.length,
                averaged: true
            };
        }

        function renderPlotSeriesList() {
            const box = document.getElementById('plotSeriesBox');
            const list = document.getElementById('plotSeriesList');
            if (!box || !list) return;
            if (!plotData) { box.style.display = 'none'; list.innerHTML = ''; return; }
            box.style.display = '';
            list.innerHTML = '';
            plotData.series.forEach((sr, i) => {
                const label = document.createElement('label');
                label.className = 'plot-series-item';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = sr.selected;
                cb.addEventListener('change', () => { sr.selected = cb.checked; drawPlotChart(); });
                const sw = document.createElement('span');
                sw.className = 'plot-series-swatch';
                sw.style.background = sr.color;
                const nm = document.createElement('span');
                nm.className = 'plot-series-name';
                nm.textContent = sr.name + (sr.hasData ? '' : ' (0 ทั้งคอลัมน์)');
                nm.title = `${sr.name} · ${sr.points.toLocaleString()} จุด`;
                label.appendChild(cb); label.appendChild(sw); label.appendChild(nm);
                list.appendChild(label);
            });
        }

        // Designed-solar overlay: a reference line drawn over the raw data, built from a
        // kWp typed on this tab and the same ideal day the rest of the app uses. It reads
        // nothing from the file and feeds nothing back - purely something to compare against.
        // The array's DC and the AC the inverter actually passes are two different
        // curves, and on a hybrid inverter the gap between them is not a loss: the DC the
        // inverter cannot pass goes straight into the battery on the DC side without ever
        // becoming AC. So the two are tracked apart rather than collapsed into one line.
        function plotSolarCurves() {
            const el = document.getElementById('plotKwpInput');
            const kwp = parseFloat(el && el.value);
            if (!isFinite(kwp) || kwp <= 0 || !plotData || !plotData.xHours) return null;
            const invEl = document.getElementById('plotInvInput');
            const invRaw = parseFloat(invEl && invEl.value);
            const invLimit = (isFinite(invRaw) && invRaw > 0) ? invRaw : 0;
            const dc = [], ac = [], clip = [];
            plotData.xHours.forEach(hour => {
                if (hour == null) { dc.push(null); ac.push(null); clip.push(null); return; }
                const d = kwp * solarPerKwpAtHour(hour);
                const a = invLimit > 0 ? Math.min(d, invLimit) : d;
                dc.push(d); ac.push(a); clip.push(d - a);
            });
