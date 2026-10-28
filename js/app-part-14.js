 1, d.d, d.H, d.M, d.S);
                } catch (e) { }
                return null;
            }
            const str = String(v).trim();
            // "2026-09-23 12:30:01" is parsed as UTC by some engines — normalise to local.
            const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }

        // declaredCurrentFile: the file came from the current-file dropzone, so the user
        // has already said the values are Amps. Outside that zone this is never called.
        function convertCurrentGridToKw(grid, declaredCurrentFile) {
            if (!grid || grid.length < 2) return null;
            const { voltage, pf } = getAmpConversionSettings();

            for (let r = 0; r < Math.min(grid.length, 8); r++) {
                if (!grid[r]) continue;
                const cells = grid[r].map(c => String(c ?? '').trim());
                const timeIdx = cells.findIndex(c => TIME_HEADER_RE.test(c));
                if (timeIdx < 0) continue;

                // --- Shape A: Sensor Name N / Value N / Unit N triplets ---
                const triplets = [];
                cells.forEach((c, idx) => {
                    if (!/^sensor\s*name/i.test(c)) return;
                    const n = (c.match(/(\d+)\s*$/) || [])[1] || '';
                    const valIdx = cells.findIndex(h => new RegExp('^value\\s*' + n + '$', 'i').test(h));
                    const unitIdx = cells.findIndex(h => new RegExp('^unit\\s*' + n + '$', 'i').test(h));
                    if (valIdx >= 0) triplets.push({ valIdx, unitIdx, nameIdx: idx });
                });

                // --- Shape B: direct per-phase current columns ---
                const directCols = [];
                cells.forEach((c, idx) => {
                    if (idx === timeIdx) return;
                    const hasAmpUnit = AMP_SUFFIX_RE.test(c);
                    const bare = c.replace(AMP_SUFFIX_RE, '').trim();
                    // I1/I2/I3 stand alone. L1/Ph2/Phase A name only a phase, so they
                    // need either an Amp unit or the user's word that this is a current file.
                    if (CURRENT_NAME_RE.test(bare) ||
                        ((hasAmpUnit || declaredCurrentFile) && PHASE_NAME_RE.test(bare))) {
                        directCols.push({ idx, name: bare.toUpperCase() });
                    }
                });

                if (triplets.length === 0 && directCols.length === 0) continue;

                const channels = [];          // channel name → output column, in first-seen order
                const byTime = new Map();     // timestamp → { dt, amps: {channel: value} }
                let ampSamples = 0;

                for (let d = r + 1; d < grid.length; d++) {
                    const row = grid[d];
                    if (!row) continue;
                    const dt = toDateCell(row[timeIdx]);
                    if (!dt) continue;

                    const readings = [];
                    if (triplets.length > 0) {
                        triplets.forEach(t => {
                            const name = String(row[t.nameIdx] ?? '').trim();
                            const unit = t.unitIdx >= 0 ? String(row[t.unitIdx] ?? '').trim() : '';
                            const val = parseFloat(row[t.valIdx]);
                            if (!name || !isFinite(val)) return;
                            // Only current channels: unit says Amp, or the name looks like I1/L2/…
                            const namedAsCurrent = CURRENT_NAME_RE.test(name) ||
                                (declaredCurrentFile && PHASE_NAME_RE.test(name));
                            if (!(AMP_UNIT_RE.test(unit) || (unit === '' && namedAsCurrent))) return;
                            readings.push({ name: name.toUpperCase(), val });
                        });
                    }
                    directCols.forEach(c => {
                        const val = parseFloat(row[c.idx]);
                        if (isFinite(val)) readings.push({ name: c.name, val });
                    });
                    if (readings.length === 0) continue;

                    const key = dt.getTime();
                    let slot = byTime.get(key);
                    if (!slot) { slot = { dt, amps: {} }; byTime.set(key, slot); }
                    readings.forEach(rd => {
                        if (!channels.includes(rd.name)) channels.push(rd.name);
                        slot.amps[rd.name] = rd.val;
                        ampSamples++;
                    });
                }

                // Need a real body of current readings, otherwise let the normal parser try.
                if (ampSamples < 10 || channels.length === 0) continue;

                channels.sort();
                const out = [['Time', 'Load (kW)', ...channels.map(c => c + ' (A)')]];
                const slots = Array.from(byTime.values()).sort((a, b) => a.dt - b.dt);
                let rowsOut = 0, partialSkipped = 0;
                slots.forEach(slot => {
                    const amps = channels.map(c => slot.amps[c]);
                    // A 3-phase logger drops a phase now and then (start-up rows, sensor
                    // hiccups). Averaging only the phases present would read as a real dip
                    // in load, so those rows are skipped instead.
                    if (channels.length >= 3 && amps.some(a => !isFinite(a))) { partialSkipped++; return; }
                    const kw = ampsToKw(amps, voltage, pf);
                    if (kw == null) return;
                    out.push([slot.dt, kw, ...amps.map(a => (isFinite(a) ? a : null))]);
                    rowsOut++;
                });
                if (rowsOut === 0) continue;

                return {
                    grid: out,
                    meta: { channels, voltage, pf, rows: rowsOut, partialSkipped, shape: triplets.length > 0 ? 'sensor-triplet' : 'phase-columns' }
                };
            }
            return null;
        }

        // V or PF changed → kW scales linearly with both, so rescale in place
        // instead of asking the user to re-upload.
        function reconvertAmpData() {
            if (!lastAmpConversion || !rawDataPoints || rawDataPoints.length === 0) return;
            const { voltage, pf } = getAmpConversionSettings();
            const prevProduct = lastAmpConversion.voltage * lastAmpConversion.pf;
            if (!isFinite(prevProduct) || prevProduct <= 0) return;
            const scale = (voltage * pf) / prevProduct;
            if (!isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 1e-9) return;

            rawDataPoints.forEach(p => { p.kw *= scale; });
            if (plantReportData && plantReportData.rows) {
                plantReportData.rows.forEach(row => {
                    if (row.vals && typeof row.vals['Load (kW)'] === 'number') row.vals['Load (kW)'] *= scale;
                });
            }
            lastAmpConversion = Object.assign({}, lastAmpConversion, { voltage, pf });
            saveImportedState((lastUploadedFiles || []).map(f => f.name));
            processDataPoints(rawDataPoints, lastUploadedFiles || []);
        }

        // --- PEA AMI kW report ---------------------------------------------------
        // The utility's own 15-minute meter export, and nothing else the importer takes
        // looks like it: a Thai cover block above the table, the column names in Thai,
        // Buddhist-era dates with a dot before the minutes, hour 24 standing for midnight,
        // and the reading split across three TOU rate columns with one filled per row.
        // Rather than spread all of that through the main parser, the file is recognised
        // by its own header and rewritten into the plain Time + Load pair the rest of the
        // pipeline already reads, so everything downstream sees an ordinary load file.

        const PEA_TS_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[.:](\d{2})$/;
        const PEA_RATE_RE = /^rate\s*[abc]$/i;

        function peaAmiTimestamp(v) {
            const m = PEA_TS_RE.exec(String(v == null ? '' : v).trim());
            if (!m) return null;
            // Buddhist years only; a four-digit year past 2300 cannot be anything else.
            const year = +m[3] > 2300 ? +m[3] - 543 : +m[3];
            // Hour 24 is how the report writes the close of the last interval. Date
            // normalises it to 00:00 the following day, which is what it means.
            const d = new Date(year, +m[2] - 1, +m[1], +m[4], +m[5]);
            return isNaN(d.getTime()) ? null : d;
        }

        function convertPeaAmiGrid(grid) {
            if (!grid || grid.length < 2) return null;

            // Both halves of the signature are required. The Thai word for "time" on its
            // own would be far too easy to hit by accident in some other export.
            let headerRow = -1, timeCol = -1;
            const rateCols = [];
            for (let r = 0; r < Math.min(grid.length, 60); r++) {
                if (!grid[r]) continue;
                const cells = grid[r].map(c => String(c == null ? '' : c).trim());
                const t = cells.indexOf('เวลา');
                if (t < 0) continue;
                const rates = [];
                cells.forEach((c, i) => { if (PEA_RATE_RE.test(c)) rates.push(i); });
                if (rates.length < 2) continue;
                headerRow = r; timeCol = t; rateCols.push.apply(rateCols, rates);
                break;
            }
            if (headerRow < 0) return null;

            const out = [['Time', 'Load (kW)']];
            let pending = 0;
            for (let r = headerRow + 1; r < grid.length; r++) {
                const row = grid[r];
                if (!row) continue;
                // The three footer lines (the printed maxima, the rounding note and the
                // name of whoever printed it) sit in this column too and simply do not
                // parse as a timestamp.
                const t = peaAmiTimestamp(row[timeCol]);
                if (!t) continue;
                let kw = null;
                rateCols.forEach(c => {
                    const raw = row[c];
                    if (raw == null || raw === '') return;
                    const v = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                    // One rate is filled per interval. Taking the largest of whatever is
                    // there keeps a row readable if a future export ever fills two.
                    if (isFinite(v) && (kw == null || v > kw)) kw = v;
                });
                // A slot past the print date carries a timestamp and no reading - the
                // month is not over yet. Dropping it keeps the rest of the month out of
                // the profile instead of importing it as hours of 0 kW.
                if (kw == null) { pending++; continue; }
                out.push([t, kw]);
            }
            if (out.length < 2) return null;
            return {
                grid: out,
                meta: {
                    readings: out.length - 1,
                    pending,
                    from: out[1][0],
                    to: out[out.length - 1][0]
                }
            };
        }

        function proceedWithLoadUpload(files, isCurrentUpload) {
            lastUploadWasCurrentZone = !!isCurrentUpload;
            let filesLoaded = 0;
            fusionSolarData = { times: [], activePower: [], consumption: [], gridPower: [] };
            fusionLoadIsGrid = false;
            let newPoints = [];
            let importedHeadersAll = [];
            let importedRowsAll = [];
            let netLoadByTime = {};
            let netLoadPhaseHeaders =