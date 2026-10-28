 c;
                            if (v === 'consumption(kw)') fusionConsIdx = c;
                            if (v.includes('grid connection power')) fusionGridIdx = c;
                        }
                        // Require the two FusionSolar-specific columns (Consumption + Grid connection
                        // power). Active power is OPTIONAL, so AC-coupling files (battery only, no solar
                        // installed yet) still activate the chart + Battery Analysis instead of the panel
                        // silently waiting for solar data. 'Grid connection power' is unique to FusionSolar,
                        // so plain AMR/load-only files won't false-trigger this.
                        const isFusionFile = fusionConsIdx !== -1 && fusionGridIdx !== -1;

                        // This data comes from a site that ALREADY has solar installed. The quantity that
                        // matters for load/battery analysis is the Grid connection power (net demand the
                        // grid actually sees, = Consumption − existing Solar) — NOT the gross Consumption.
                        // So feed the Grid column into the main load pipeline (Chart 1, sizing, net-load).
                        // Consumption + Solar are still captured separately in fusionSolarData.
                        if (isFusionFile) {
                            loadColIdx = fusionGridIdx;
                            fusionLoadIsGrid = true;
                        }

                        // Parse data rows
                        const ampasRows = [];
                        for (let r = headerRowIdx + 1; r < grid.length; r++) {
                            const row = grid[r];
                            if (!row || row[timeColIdx] == null) continue;

                            let dt = null;
                            const timeVal = row[timeColIdx];
                            if (timeVal instanceof Date) {
                                dt = timeVal;
                            } else if (typeof timeVal === 'number') {
                                try {
                                    const d = XLSX.SSF.parse_date_code(timeVal);
                                    dt = new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
                                } catch (e) { }
                            } else {
                                const timeStr = String(timeVal).trim();
                                dt = new Date(timeStr);
                                if (isNaN(dt.getTime())) {
                                    const parts = timeStr.split(/[\s/:\.-]+/);
                                    if (parts.length >= 5) {
                                        const dd = parseInt(parts[0]), mm = parseInt(parts[1]) - 1, yy = parseInt(parts[2]);
                                        const hr = parseInt(parts[3]), mn = parseInt(parts[4]);
                                        dt = new Date(yy, mm, dd, hr, mn);
                                    }
                                }
                            }

                            let kwVal = parseFloat(row[loadColIdx]);
                            // Grid power can go negative when existing solar exports to the grid; net
                            // grid demand can't be negative, so clamp export to 0. (Export is still
                            // shown signed in the FusionSolar chart + Battery Analysis.)
                            if (isFusionFile && !isNaN(kwVal)) kwVal = Math.max(0, kwVal);
                            if (dt && !isNaN(dt.getTime())) {
                                if (isFusionFile) {
                                    const activeVal = fusionActiveIdx !== -1 ? parseFloat(row[fusionActiveIdx]) : 0;
                                    const consVal = parseFloat(row[fusionConsIdx]);
                                    const gridVal = parseFloat(row[fusionGridIdx]);
                                    // Active power is optional (AC coupling has none) → default to 0.
                                    if (!isNaN(consVal) && !isNaN(gridVal)) {
                                        fusionSolarData.times.push(dt);
                                        fusionSolarData.activePower.push(isNaN(activeVal) ? 0 : activeVal);
                                        fusionSolarData.consumption.push(consVal);
                                        fusionSolarData.gridPower.push(gridVal);
                                    }
                                }

                                const directConsumption = parseFloat(row[plantReportConsumptionIdx]);
                                const directInverter = parseFloat(row[plantReportInverterIdx]);
                                if (!isNaN(directConsumption) || !isNaN(directInverter)) {
                                    const directKey = dt.getTime();
                                    if (!directNetLoadByTime[directKey]) {
                                        directNetLoadByTime[directKey] = { time: dt, consumption: null, phases: [] };
                                    }
                                    if (!isNaN(directConsumption)) {
                                        directNetLoadByTime[directKey].consumption = directNetLoadByTime[directKey].consumption == null
                                            ? directConsumption
                                            : Math.max(directNetLoadByTime[directKey].consumption, directConsumption);
                                    }
                                    if (!isNaN(directInverter)) {
                                        const directPhaseIdx = directNetPhaseHeaders.indexOf(directPhaseHeader);
                                        directNetLoadByTime[directKey].phases[directPhaseIdx] =
                                            (directNetLoadByTime[directKey].phases[directPhaseIdx] || 0) + directInverter;
                                    }
                                }

                                if (!isNaN(kwVal)) {
                                    newPoints.push({ datetime: dt, kw: kwVal });
                                }
                                const vals = {};
                                ampasHeaders.forEach((h, idx) => {
                                    if (idx !== timeColIdx && h) {
                                        const num = parseFloat(row[idx]);
                                        vals[h] = row[idx] != null && !isNaN(num) ? num : null;
                                        if (!importedHeadersAll.includes(h)) importedHeadersAll.push(h);
                                    }
                                });
                                ampasRows.push({ time: dt, vals });
                                importedRowsAll.push({ time: dt, vals });

                                const inverterYieldIdxs = Object.keys(inverterPhaseHeaderByIdx).map(idx => parseInt(idx));
                                if (consumptionIdxForNet >= 0 || inverterYieldIdxs.length > 0) {
                                    const key = dt.getTime();
                                    if (!netLoadByTime[key]) {
                                        netLoadByTime[key] = { time: dt, consumption: null, phases: [] };
                                    }

                                    if (consumptionIdxForNet >= 0) {
                                        const cons = parseFloat(row[consumptionIdxForNet]);
                                        if (!isNaN(cons)) {
                                            netLoadByTime[key].consumption = netLoadByTime[key].consumption == null
                                                ? cons
                                                : Math.max(netLoadByTime[key].consumption, cons);
                                        }
                                    }

                                    inverterYieldIdxs.forEach(idx => {
                                        const phaseHeader = inverterPhaseHeaderByIdx[idx];
                                        const phaseIdx = netLoadPhaseHeaders.indexOf(phaseHeader);
                                        const inv = parseFloat(row[idx]);
                                        if (!isNaN(inv)) {
                                            netLoadByTime[key].phases[phaseIdx] = (netLoadByTime[key].phases[phaseIdx] || 0) + inv;
                                        }
                                    });
                                }
                            }
                        }
                        plantReportData = (ampasRows.length > 0)
                            ? { headers: ampasHeaders.filter((h, idx) => idx !== timeColIdx && h), rows: ampasRows }
                            : null;
                    } catch (err) {
                        console.error("Error parsing file " + file.name, err);
                    }

                    filesLoaded++;
                    document.getElementById(progressBoxId).innerHTML = `⏳ Loaded ${filesLoaded}/${files.length} file(s)...`;
                    if (filesLoaded === files.length) {
                        plantReportData = (importedRowsAll.length > 0)
                            ? { headers: importedHeadersAll.filter(h => h), rows: importedRowsAll }
                            : plantReportData;
                        const netLoadRows = Object.values(netLoadByTime)
                            .filter(r => r.consumption != null)
                            .sort((a, b) => a.time.getTime() - b.time.getTime())
                            .map(r => {
                                const vals = { 'Consumption (kWh)': r.consumption };
                                netLoadPhaseHeaders.forEach((h, idx) => {
                                    vals[h] = r.phases[idx] || 0;
                                });
                                return { time: r.time, vals };
                            });
                        const directNetLoadRows = Object.values(directNetLoadByTime)
                            .filter(r => r.consumption != null)
                            .sort((a, b) => a.time.getTime() - b.time.getTime())
                            .map(r => {
                                const vals = { 'Consumption (kWh)': r.consumption };
                                directNetPhaseHeaders.forEach((h, idx) => {
                                    vals[h] = r.phases[idx] || 0;
                                });
                                return { time: r.time, vals };
                            });
                        importedNetLoadData = directNetLoadRows.length > 0
                            ? { headers: ['Consumption (kWh)', ...directNetPhaseHeaders], rows: directNetLoadRows }
                            : netLoadRows.length > 0
                                ? { headers: ['Consumption (kWh)', ...netLoadPhaseHeaders], rows: netLoadRows }
                                : null;

                        if (newPoints.length === 0) {
                            isBatchImporting = false;
                            if (isCurrentUpload) {
                                document.getElementById('currentStatus').innerHTML =
                                    `❌ อ่านข้อมูลจากไฟล์นี้ไม่ได้ — ต้องมีคอลัมน์เวลา (updated_at / Timestamp / Date / Time) ` +
                                    `และคอลัมน์โหลด — จะเป็นกระแสรายเฟส (I1 / I2 / I3, L1 / L2 / L3 ` +
                                    `หรือ Sensor Name / Value / Unit หน่วย Amp) หรือเป็น kW ก็ได้`;
                            } else {
                                document.getElementById('uploadStatus').innerHTML = `❌ Could not read valid data from the selected file(s)`;
                                alert("ไม่พบข้อมูลโหลดหรือคอลัมน์ 'Statistical period' และ 'Consumption (kWh)' ในไฟล์ที่เลือก!");
                            }
                            ret