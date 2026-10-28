 [];
            let directNetLoadByTime = {};
            let directNetPhaseHeaders = [];
            let fileAmpMeta = null;
            let filePeaMeta = null;
            isBatchImporting = true;

            // Show loading status
            const progressBoxId = isCurrentUpload ? 'currentStatus' : 'uploadStatus';
            document.getElementById(progressBoxId).innerHTML = `⏳ Loading ${files.length} file(s)...`;


            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();

                reader.onload = function (e) {
                    const arrayBuffer = e.target.result;
                    try {
                        // cellDates: SheetJS otherwise converts a timestamp column to an Excel
                        // serial, and that conversion lands about 4 s late (12:30:01 reads back
                        // as 12:30:05). With 1-minute data that is enough to drop a reading into
                        // the neighbouring minute, which skews the per-minute averaged profile.
                        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
                        const firstSheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[firstSheetName];

                        // Convert sheet to 2D array
                        let grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

                        // Only the dedicated current-file dropzone converts Amp to kW.
                        // The normal load path never guesses at it, so a kW file whose
                        // columns happen to be named per phase can't be mangled.
                        // Amp files get converted; anything else dropped on that panel is
                        // read as it comes, so a kW export lands wherever the user put it
                        // instead of being refused. The conversion still only runs when real
                        // current columns are present, so a kW file can never be multiplied
                        // by V x PF by mistake - which was the whole point of the two panels.
                        const ampConverted = isCurrentUpload ? convertCurrentGridToKw(grid, true) : null;
                        if (ampConverted) {
                            grid = ampConverted.grid;
                            fileAmpMeta = ampConverted.meta;
                        } else {
                            // A PEA AMI export becomes an ordinary Time + Load sheet here,
                            // before any of the header detection below runs.
                            const peaConverted = convertPeaAmiGrid(grid);
                            if (peaConverted) {
                                grid = peaConverted.grid;
                                filePeaMeta = peaConverted.meta;
                            }
                        }

                        // Find header row and map columns
                        let headerRowIdx = -1;
                        let timeColIdx = -1;
                        let loadColIdx = -1;

                        // Detect Ampas/Huawei Plant Report format (has 'Statistical period' header)
                        let isAmpasFormat = false;
                        let ampasHeaders = [];

                        // --- Find the header row ROBUSTLY by column-name keywords (NOT by exact text or fixed position).
                        // Data rows are numbers → no keyword hits, so only the real header row (kWh/Consumption/Import/...) matches. ---
                        const HEADER_KW = ['statistical period', 'kwh', 'consumption', 'import', 'inverter', 'yield', 'irradiation'];
                        for (let r = 0; r < Math.min(grid.length, 8); r++) {
                            const row = grid[r];
                            if (!row) continue;
                            const cells = row.map(c => String(c ?? '').toLowerCase());
                            const nameHits = cells.filter(v => HEADER_KW.some(k => v.includes(k))).length;
                            if (nameHits >= 2) {
                                isAmpasFormat = true;
                                ampasHeaders = uniqueHeaders(grid[r].map(c => String(c ?? '')));
                                headerRowIdx = r;

                                const timeMatch = ampasHeaders.findIndex(h => {
                                    const hl = h.toLowerCase();
                                    return hl.includes('time') || hl.includes('date') || hl.includes('period');
                                });
                                timeColIdx = timeMatch >= 0 ? timeMatch : 0;

                                const impExact = ampasHeaders.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'importkwh');
                                const impLoose = impExact >= 0 ? impExact : ampasHeaders.findIndex(h => {
                                    const hl = h.toLowerCase();
                                    return hl.includes('import') || hl.includes('consumption(kw)');
                                });
                                loadColIdx = impLoose >= 0 ? impLoose : (ampasHeaders.findIndex(h => h.toLowerCase().includes('consumption')) >= 0 ? ampasHeaders.findIndex(h => h.toLowerCase().includes('consumption')) : 7);
                                break;
                            }
                        }
                        // Fallback: generic (non-Plant-Report) file → find a row with time + load keywords
                        if (headerRowIdx === -1) {
                            for (let r = 0; r < Math.min(grid.length, 8); r++) {
                                const row = grid[r];
                                if (!row) continue;
                                let foundTime = false, foundLoad = false;
                                for (let c = 0; c < row.length; c++) {
                                    const v = String(row[c] ?? '').toLowerCase();
                                    if (!foundTime && (v.includes('time') || v.includes('date'))) { timeColIdx = c; foundTime = true; }
                                    if (!foundLoad && (v.includes('load') || v.includes('active') || v.includes('consumption') || v.includes('import'))) { loadColIdx = c; foundLoad = true; }
                                }

                                let activeColIdx = -1, consColIdx = -1, gridColIdx = -1;
                                for (let c = 0; c < row.length; c++) {
                                    const v = String(row[c] ?? '').toLowerCase();
                                    if (v.includes('active power')) activeColIdx = c;
                                    if (v === 'consumption(kw)') consColIdx = c;
                                    if (v.includes('grid connection power')) gridColIdx = c;
                                }
                                if (activeColIdx !== -1 && consColIdx !== -1 && gridColIdx !== -1) {
                                    headerRowIdx = r;
                                    loadColIdx = consColIdx; // Use consumption for AMR
                                    break;
                                }

                                if (foundTime && foundLoad) { headerRowIdx = r; break; }
                            }
                        }
                        // SheetJS dropped the header row (Huawei zip issue): if row 0 already looks like data
                        // (a date in col 0 + enough columns), assign the fixed Huawei layout and read data from row 0.
                        if (headerRowIdx === -1 && grid[0]) {
                            const c0 = grid[0][0];
                            const looksDate = c0 != null && !isNaN(new Date(c0).getTime());
                            if (looksDate && grid[0].length >= 11) {
                                ampasHeaders = HUAWEI_PLANT_HEADERS.slice();
                                isAmpasFormat = true;
                                timeColIdx = 0;
                                const impIdx = ampasHeaders.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'importkwh');
                                loadColIdx = impIdx >= 0 ? impIdx : 7;
                                // headerRowIdx stays -1 → data loop (r = headerRowIdx + 1) starts at row 0
                            }
                        }
                        if (headerRowIdx === -1 && ampasHeaders.length === 0) { headerRowIdx = 1; timeColIdx = 0; loadColIdx = 7; }
                        if (ampasHeaders.length === 0) {
                            ampasHeaders = uniqueHeaders((grid[headerRowIdx] || []).map(c => String(c ?? '')));
                        }

                        const normHeader = h => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();
                        const compactHeader = h => normHeader(h).replace(/[^a-z0-9]/g, '');
                        const consumptionIdxForNet = ampasHeaders.findIndex(h => {
                            const n = normHeader(h);
                            return n.includes('consumption') && !n.includes('self-consumption');
                        });
                        const directConsumptionIdx = ampasHeaders.findIndex(h => compactHeader(h) === 'consumptionkwh' || compactHeader(h) === 'consumptionkw');
                        const directInverterIdx = ampasHeaders.findIndex(h => compactHeader(h) === 'inverteryieldkwh' || compactHeader(h) === 'activepowerkw' || compactHeader(h) === 'totalpvyieldkwh');
                        const plantReportConsumptionIdx = directConsumptionIdx >= 0 ? directConsumptionIdx : 10; // K in the sample Plant Report
                        const plantReportInverterIdx = directInverterIdx >= 0 ? directInverterIdx : 5;        // F in the sample Plant Report
                        // Phase number must reflect the COLUMN (same across every uploaded file), NOT the file index.
                        // Otherwise 6 monthly files scatter one solar phase into 6 fake phases → each holds ~1/6 of the data.
                        const directPhaseHeader = 'Inverter Yield (kWh) Phase 1';
                        if (!directNetPhaseHeaders.includes(directPhaseHeader)) directNetPhaseHeaders.push(directPhaseHeader);
                        const inverterPhaseHeaderByIdx = {};
                        let fileInverterCount = 0; // count inverter columns WITHIN this file → position-based phase number
                        ampasHeaders.forEach((h, idx) => {
                            const n = normHeader(h);
                            if (!n.includes('inverter') || !n.includes('yield')) return;
                            fileInverterCount++;
                            let phaseHeader = h;
                            if (!phaseHeader || !/phase\s*\d|phase\d|ph\s*\d|\bp\d\b/i.test(phaseHeader)) {
                                phaseHeader = `Inverter Yield (kWh) Phase ${fileInverterCount}`;
                            }
                            if (!netLoadPhaseHeaders.includes(phaseHeader)) netLoadPhaseHeaders.push(phaseHeader);
                            inverterPhaseHeaderByIdx[idx] = phaseHeader;
                        });

                        // FusionSolar column detection — done ONCE here (header is identical for every
                        // data row), instead of re-scanning the header on every row inside the loop.
                        const fusionHeaderRow = headerRowIdx >= 0 ? grid[headerRowIdx] : null;
                        let fusionActiveIdx = -1, fusionConsIdx = -1, fusionGridIdx = -1;
                        for (let c = 0; fusionHeaderRow && c < fusionHeaderRow.length; c++) {
                            const v = String(fusionHeaderRow[c] ?? '').toLowerCase();
                            if (v.includes('active power')) fusionActiveIdx =