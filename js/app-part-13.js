lbar buttons
            const btnTbFormula = document.getElementById('btnSourceFormula');
            const btnTbPVSyst = document.getElementById('btnSourcePVSyst');
            const btnTbCompare = document.getElementById('btnSourceCompare');

            // Tab 2 panel buttons
            const btnFinFormula = document.getElementById('btnUseFormula');
            const btnFinPVSyst = document.getElementById('btnUsePVSyst');
            const btnFinCompare = document.getElementById('btnUseCompare');

            const hasPVSyst = !!importedPVSystData;

            // Synchronize active states
            [btnTbFormula, btnFinFormula].forEach(b => {
                if (b) b.classList.toggle('active', activeSolarSource === 'formula');
            });
            [btnTbPVSyst, btnFinPVSyst].forEach(b => {
                if (b) {
                    b.classList.toggle('active', activeSolarSource === 'pvsyst');
                    b.style.opacity = hasPVSyst ? '1' : '0.65';
                }
            });
            [btnTbCompare, btnFinCompare].forEach(b => {
                if (b) {
                    b.classList.toggle('active', activeSolarSource === 'compare');
                    b.style.opacity = hasPVSyst ? '1' : '0.65';
                }
            });

            if (!hasPVSyst) {
                if (statusEl) {
                    statusEl.innerHTML = `ℹ️ ยังไม่ได้นำเข้าไฟล์ PVSyst (ระบบกำลังใช้ข้อมูลแสง PVGIS รายชั่วโมง)`;
                    statusEl.style.background = '#fef9c3';
                    statusEl.style.color = '#854d0e';
                    statusEl.style.borderColor = '#fef08a';
                }
                if (infoBox) infoBox.style.display = 'none';
                if (badge) badge.style.display = 'none';
                if (srcGroup) srcGroup.style.display = 'none';
                return;
            }

            if (srcGroup) srcGroup.style.display = 'flex';

            if (badge) {
                badge.style.display = 'inline-block';
                if (activeSolarSource === 'pvsyst') {
                    badge.textContent = '☀️ PVSyst Active';
                    badge.style.background = '#fef3c7';
                    badge.style.color = '#b45309';
                } else if (activeSolarSource === 'compare') {
                    badge.textContent = '🔀 Compare Active';
                    badge.style.background = '#ede9fe';
                    badge.style.color = '#6d28d9';
                } else {
                    badge.textContent = '⚙️ Formula Active';
                    badge.style.background = '#f1f5f9';
                    badge.style.color = '#64748b';
                }
            }

            if (statusEl) {
                statusEl.innerHTML = `✅ นำเข้าข้อมูล PVSyst สำเร็จ: <b>${importedPVSystData.meta.project || importedPVSystData.meta.fileName}</b> (${importedPVSystData.totalPoints.toLocaleString()} ชม.)`;
                statusEl.style.background = '#ecfdf5';
                statusEl.style.color = '#065f46';
                statusEl.style.borderColor = '#a7f3d0';
            }

            if (infoBox) {
                infoBox.style.display = 'block';
                const metaDiv = document.getElementById('pvsystMetaTags');
                if (metaDiv) {
                    let tagsHtml = '';
                    if (importedPVSystData.meta.project) tagsHtml += `<span class="pvsyst-meta-badge">📁 ${importedPVSystData.meta.project}</span>`;
                    if (importedPVSystData.meta.site) tagsHtml += `<span class="pvsyst-meta-badge">📍 ${importedPVSystData.meta.site}</span>`;
                    if (importedPVSystData.meta.variant) tagsHtml += `<span class="pvsyst-meta-badge">⚙️ ${importedPVSystData.meta.variant}</span>`;
                    metaDiv.innerHTML = tagsHtml;
                }

                const peakEl = document.getElementById('pvsystPeakKw');
                const annualEl = document.getElementById('pvsystAnnualMwh');
                const hoursEl = document.getElementById('pvsystTotalHours');
                const dailyEl = document.getElementById('pvsystAvgDaily');

                if (peakEl) peakEl.textContent = importedPVSystData.peakPowerKw.toLocaleString();
                if (annualEl) annualEl.textContent = importedPVSystData.annualTotalMWh.toLocaleString();
                if (hoursEl) hoursEl.textContent = importedPVSystData.totalPoints.toLocaleString();
                if (dailyEl) dailyEl.textContent = importedPVSystData.avgDailyKwh.toLocaleString();
            }
        }

        function setSolarSource(source) {
            if ((source === 'pvsyst' || source === 'compare') && !importedPVSystData) {
                switchTab('tab-input');
                const dz = document.getElementById('pvsystDropzone');
                if (dz) {
                    dz.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    dz.style.outline = '3px dashed #d97706';
                    setTimeout(() => { dz.style.outline = 'none'; }, 3000);
                }
                const pInput = document.getElementById('pvsystFileInput');
                if (pInput) {
                    setTimeout(() => pInput.click(), 100);
                }
                return;
            }
            activeSolarSource = source;
            updatePVSystUI();
            updateDashboard();
            saveImportedState(lastUploadedFiles.map(f => f.name));
        }

        function clearPVSystData() {
            importedPVSystData = null;
            activeSolarSource = 'formula';
            const input = document.getElementById('pvsystFileInput');
            if (input) input.value = '';
            updatePVSystUI();
            if (monthsAreSolar) {
                // The per-month traces on chart1 were built from the PVSyst data we just cleared.
                monthsAreSolar = false;
                data.months = {};
                replotCharts();
            }
            updateDashboard();
            saveImportedState(lastUploadedFiles.map(f => f.name));
        }

        // Resets the Load panel back to its pristine (never-uploaded) state: an empty 24-hour
        // zero profile, same shape as the placeholder `data` object the page boots with.
        // PVSyst data (if any) is left untouched.
        function clearLoadData() {
            lastAmpConversion = null;
            const curStatus = document.getElementById('currentStatus');
            if (curStatus) curStatus.innerHTML = 'ยังไม่ได้นำเข้าไฟล์กระแส';
            rawDataPoints = [];
            lastUploadedFiles = [];
            fusionSolarData = { times: [], activePower: [], consumption: [], gridPower: [] };
            fusionLoadIsGrid = false;
            plantReportData = null;
            importedNetLoadData = null;

            // Rebuilds times/hours/data.months for the current period (also repopulates the
            // PVSyst per-month traces if PVSyst is still active) and re-renders chart1.
            rebuildEmptyLoadProfileForPeriod(netLoadPeriod);
            renderFusionChart();
            plantReportNeedsRender = true;
            if (document.getElementById('tab-plant').classList.contains('active')) {
                try { renderPlantReport(null); } catch (err) { console.error('renderPlantReport() failed', err); }
            }
            try {
                renderImportedNetLoad(null);
            } catch (err) {
                emptyImportedNetLoadChart('ยังไม่มีข้อมูลโหลด — กรุณาอัพโหลดไฟล์');
            }

            const input = document.getElementById('fileInput');
            if (input) input.value = '';
            const statusEl = document.getElementById('uploadStatus');
            if (statusEl) statusEl.innerHTML = '⚠️ ยังไม่ได้อัพโหลดข้อมูลโหลด โปรดอัพโหลดไฟล์ Excel เพื่อแสดงกราฟวิเคราะห์และคำนวณความคุ้มค่า';

            saveImportedState([]);
        }


        function handleFileUpload(files) {
            if (files.length === 0) return;

            // Auto-detect if user dropped a PVSyst simulation file onto the main dropzone
            if (files.length === 1) {
                const fname = (files[0].name || '').toLowerCase();
                if (fname.includes('pvsyst') || fname.endsWith('.csv') || fname.endsWith('.txt')) {
                    const testReader = new FileReader();
                    testReader.onload = function (evt) {
                        try {
                            const buf = evt.target.result;
                            const preview = new TextDecoder('utf-8').decode(new Uint8Array(buf).slice(0, 500));
                            if (preview.toUpperCase().includes('PVSYST') || (preview.toLowerCase().includes('e_grid') && preview.toLowerCase().includes('date'))) {
                                handlePVSystUpload(files);
                                return;
                            }
                        } catch (e) { }
                        proceedWithLoadUpload(files);
                    };
                    testReader.readAsArrayBuffer(files[0]);
                    return;
                }
            }
            proceedWithLoadUpload(files);
        }

        // ===================== Current (Amp) load files =====================
        // Some meters and data loggers export the load as per-phase CURRENT instead of
        // power, in one of two shapes:
        //   A) repeated "Sensor Name N / Value N / Unit N" triplets + a timestamp column
        //      (e.g. the "measure power" export: I1 / I2 / I3 in Amp, one row per minute)
        //   B) plain per-phase columns (I1, I2, I3 / L1, L2, L3) in Amp + a timestamp
        // convertCurrentGridToKw() rewrites such a sheet into a simple
        // [Time, Load (kW), I1 (A), ...] grid, so everything downstream parses it
        // unchanged. Current alone is not power, so the conversion needs the system
        // voltage and power factor, which the user supplies on the Input Data tab.

        function getAmpConversionSettings() {
            const vEl = document.getElementById('sysVoltageInput');
            const pfEl = document.getElementById('powerFactorInput');
            const v = parseFloat(vEl && vEl.value);
            const pf = parseFloat(pfEl && pfEl.value);
            return {
                voltage: (isFinite(v) && v > 0) ? v : 400,
                pf: (isFinite(pf) && pf > 0 && pf <= 1) ? pf : 0.85
            };
        }

        // 3 phases → P = √3 × V(line-to-line) × I(avg) × PF
        // 1–2 phases → each current is taken against the phase-to-neutral voltage
        function ampsToKw(amps, voltage, pf) {
            const vals = amps.filter(a => typeof a === 'number' && isFinite(a));
            if (vals.length === 0) return null;
            const sum = vals.reduce((a, b) => a + b, 0);
            if (vals.length >= 3) return Math.sqrt(3) * voltage * (sum / vals.length) * pf / 1000;
            return (voltage / Math.sqrt(3)) * sum * pf / 1000;
        }

        const AMP_UNIT_RE = /^(a|amp|amps|ampere|amperes)$/i;
        // "I" is the symbol for current, so I1/I2/I3 identify a current channel on their
        // own. L1/Ph2/Phase A only name a phase — the quantity could just as easily be
        // volts or kW — so those need the unit to say Amp before anything is converted.
        const CURRENT_NAME_RE = /^i\s*[-_]?\s*[123abc]$/i;
        const PHASE_NAME_RE = /^(l|ph|phase)\s*[-_]?\s*[123abc]$/i;
        const AMP_SUFFIX_RE = /[\(\[]\s*(a|amp|amps|ampere|amperes)\s*[\)\]]\s*$/i;
        const TIME_HEADER_RE = /updated[\s_]*at|timestamp|date\s*[\/_-]?\s*time|^date$|^time$|record[\s_]*time|^datetime$/i;

        function toDateCell(v) {
            if (v == null || v === '') return null;
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            if (typeof v === 'number') {
                try {
                    const d = XLSX.SSF.parse_date_code(v);
                    if (d) return new Date(d.y, d.m -