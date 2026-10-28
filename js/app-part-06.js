r(s.batCap || 0).toLocaleString('en-US')} kWh / ${Number(s.batPower || 0).toLocaleString('en-US')} kW`
                : `Inverter ${Number(s.invLimit || 0).toLocaleString('en-US')} kW`);

            setText('summarySaveYear', formatter.format(s.saveYear || 0));
            setText('summarySaveMonth', `เฉลี่ยต่อเดือน ${formatter.format((s.saveYear || 0) / 12)}`);
            setText('summaryProdYear', Math.round(s.prodYear || 0).toLocaleString('en-US') + ' kWh');
            setText('summarySelfCons', (s.selfCons || 0).toFixed(1) + '%');
            setText('summaryCost', formatter.format(s.cost || 0));
            setText('summaryCostSub', s.hasBattery ? 'โซลาร์ + แบต ตามราคาที่ตั้งไว้' : 'โซลาร์ตามราคา ฿/Wp ที่ตั้งไว้');
        }

        function revealSummaryPanel() {
            const emptyEl = document.getElementById('summaryEmpty');
            const readyEl = document.getElementById('summaryReady');
            const actionsEl = document.getElementById('summaryActions');
            if (!emptyEl || !readyEl) return;
            summaryRevealed = true;
            emptyEl.hidden = true;
            readyEl.hidden = false;
            if (actionsEl) actionsEl.hidden = false;
            applySummaryPayload(latestSummaryPayload);
        }

        function updateSummaryPanel(s) {
            latestSummaryPayload = s;
            // เขียนตัวเลขไว้เสมอ แต่โชว์การ์ดผลหลังกด Run เท่านั้น
            if (summaryRevealed) applySummaryPayload(s);
        }

        function runAndShowSummary() {
            updateDashboard();
            revealSummaryPanel();
            syncSummaryBatteryCard();
            switchTab('tab-summary');
            const readyEl = document.getElementById('summaryReady');
            if (readyEl && !readyEl.hidden) {
                readyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // --- Input wizard (3 ขั้น) ---
        let wizardStep = 1;
        let wizardEnabled = true;
        const WIZARD_HINTS = {
            1: 'ขั้นที่ 1 — อัปโหลดไฟล์โหลด (Excel kW หรือไฟล์กระแส Amp) · PVSyst เป็นตัวเลือกเสริม',
            2: 'ขั้นที่ 2 — ตั้งขนาดโซลาร์ / อินเวอร์เตอร์ / ค่าไฟ (และแบตถ้ามี)',
            3: 'ขั้นที่ 3 — กด Run เพื่อไปหน้า Summary และ Export ข้อเสนอได้'
        };

        function applyWizardUi() {
            const tab = document.getElementById('tab-input');
            if (!tab) return;
            tab.classList.toggle('wizard-mode', wizardEnabled);
            tab.classList.remove('wizard-step-1', 'wizard-step-2', 'wizard-step-3');
            if (wizardEnabled) tab.classList.add('wizard-step-' + wizardStep);

            document.querySelectorAll('.wizard-step').forEach(btn => {
                const n = Number(btn.getAttribute('data-wizard-goto'));
                btn.classList.toggle('is-active', wizardEnabled && n === wizardStep);
                btn.classList.toggle('is-done', wizardEnabled && n < wizardStep);
            });

            const hint = document.getElementById('wizardHint');
            if (hint) {
                hint.textContent = wizardEnabled
                    ? (WIZARD_HINTS[wizardStep] || '')
                    : 'โหมดเต็ม — แสดงทุกแผงพร้อมกัน สามารถกลับไปใช้เส้นทาง 3 ขั้นได้ทุกเมื่อ';
            }
            const toggleBtn = document.getElementById('wizardToggleBtn');
            if (toggleBtn) toggleBtn.textContent = wizardEnabled ? 'ดูทั้งหมด' : 'ใช้เส้นทาง 3 ขั้น';

            const hasLoad = Array.isArray(rawDataPoints) && rawDataPoints.length > 0;
            const sampleCta = document.getElementById('sampleCta');
            // ปุ่มตัวอย่างต้องเห็นเสมอ — ถ้าซ่อนเมื่อมีโหลด คนจะติดหน้าว่างแล้วหาปุ่มไม่เจอ
            if (sampleCta) {
                sampleCta.classList.remove('is-hidden');
                const title = sampleCta.querySelector('.sample-cta-title');
                const sub = sampleCta.querySelector('.sample-cta-sub');
                if (hasLoad) {
                    if (title) title.textContent = 'มีโหลดอยู่แล้ว — อยากลองชุดบ้านตัวอย่างใหม่?';
                    if (sub) sub.textContent = 'กดปุ่มนี้เพื่อแทนที่ด้วยโหลดบ้าน 1 เดือน แล้วคำนวณ Summary ใหม่';
                } else {
                    if (title) title.textContent = 'ยังไม่มีไฟล์โหลด?';
                    if (sub) sub.textContent = 'กดปุ่มนี้เพื่อใส่โหลดบ้านเรือน 1 เดือน แล้วคำนวณ Summary ให้ทันที';
                }
            }

            try {
                localStorage.setItem('solarWizardEnabled', wizardEnabled ? '1' : '0');
                localStorage.setItem('solarWizardStep', String(wizardStep));
            } catch (e) { }
        }

        function setWizardStep(step) {
            wizardStep = Math.min(3, Math.max(1, Number(step) || 1));
            if (!wizardEnabled) wizardEnabled = true;
            applyWizardUi();
            if (wizardStep === 1) {
                document.getElementById('dropzone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (wizardStep === 2) {
                document.querySelector('[data-wizard-section="sizing"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                document.getElementById('calcBtn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function toggleWizardMode() {
            wizardEnabled = !wizardEnabled;
            applyWizardUi();
        }

        function onWizardLoadUploaded() {
            if (!wizardEnabled) return;
            if (wizardStep < 2) setWizardStep(2);
        }

        function wizardNext() {
            if (wizardStep >= 3) {
                runAndShowSummary();
                return;
            }
            setWizardStep(wizardStep + 1);
        }

        function initWizard() {
            try {
                const saved = localStorage.getItem('solarWizardEnabled');
                if (saved === '0') wizardEnabled = false;
                const savedStep = Number(localStorage.getItem('solarWizardStep'));
                if (savedStep >= 1 && savedStep <= 3) wizardStep = savedStep;
            } catch (e) { }
            // ถ้ามีโหลดอยู่แล้ว ข้ามขั้นอัปโหลด
            const hasLoad = Array.isArray(rawDataPoints) && rawDataPoints.length > 0;
            if (hasLoad && wizardStep === 1) wizardStep = 2;
            applyWizardUi();
        }

        function switchTab(tabId, evt) {
            document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            // Called without an event from setSolarSource(): find the tab button by its onclick target
            const tabBtn = (evt && evt.target && evt.target.closest('.tab-btn')) || document.querySelector(`.tab-btn[onclick*="'${tabId}'"]`);
            if (tabBtn) tabBtn.classList.add('active');
            // กันเคสพรีวิวค้าง Summary ว่าง ทั้งที่มีโหลดในหน่วยความจำแล้ว
            if (tabId === 'tab-summary' && !summaryRevealed && Array.isArray(rawDataPoints) && rawDataPoints.length > 0) {
                try { updateDashboard(); } catch (e) { console.error(e); }
                revealSummaryPanel();
                syncSummaryBatteryCard();
            }
            if (tabId === 'tab-plant' && plantReportNeedsRender) {
                renderPlantReport(plantReportData);
            }
            setTimeout(() => {
                ['chart1', 'chart3', 'chart4', 'chart5', 'chart6', 'chart7', 'chart-fusion',
                    'plant-chart-energy', 'plant-chart-solar', 'plant-chart-grid',
                    'plant-chart-temp', 'plant-chart-finance', 'plant-chart-bess',
                    'plot-chart', 'plot-chart-2', 'plot-chart-3']
                    .forEach(id => {
                        try {
                            const el = document.getElementById(id);
                            // Skip empty/hidden plot hosts — Plotly.Plots.resize rejects async when
                            // the div has no laid-out plot (common while other tabs are height:0).
                            if (!el || !el.querySelector || !el.querySelector('.js-plotly-plot')) return;
                            if (el.getClientRects().length === 0) return;
                            const ret = Plotly.Plots.resize(el);
                            if (ret && typeof ret.catch === 'function') ret.catch(() => { });
                        } catch (e) { }
                    });
            }, 50);
        }



        // ---- Helper: Clean X-axis time tick generator to prevent text overlap on 15-min / weekly profiles ----
        function buildTimeTickConfig(timeArray, period) {
            if (!timeArray || timeArray.length === 0) return {};
            if (period === 'monthly') {
                return { tickmode: 'array', tickvals: timeArray, ticktext: timeArray, tickangle: 0 };
            }
            if (period === 'weekly') {
                // Show every 6 or 12 hours to keep labels distinct and readable
                var weeklyTicks = timeArray.filter(function (t) {
                    return t.includes('00:00') || t.includes('06:00') || t.includes('12:00') || t.includes('18:00');
                });
                if (weeklyTicks.length > 28) {
                    weeklyTicks = timeArray.filter(function (t) {
                        return t.includes('00:00') || t.includes('12:00');
                    });
                }
                return {
                    tickmode: 'array',
                    tickvals: weeklyTicks.length > 0 ? weeklyTicks : timeArray,
                    ticktext: weeklyTicks.length > 0 ? weeklyTicks : timeArray,
                    tickangle: -45
                };
            }
            // Daily profile: 15-min (96 pts) or 30-min (48 pts) -> Show every 2 hours: 00:00, 02:00, 04:00 ... 22:00
            if (timeArray.length > 24) {
                var dailyTicks = timeArray.filter(function (t) {
                    var parts = t.split(':');
                    if (parts.length < 2) return false;
                    var h = parseInt(parts[0], 10);
                    var m = parseInt(parts[1], 10);
                    return m === 0 && (h % 2 === 0);
                });
                if (dailyTicks.length === 0) {
                    var step = timeArray.length > 48 ? 8 : 4;
                    dailyTicks = timeArray.filter(function (t, i) { return i % step === 0; });
                }
                return {
                    tickmode: 'array',
                    tickvals: dailyTicks,
                    ticktext: dailyTicks,
                    tickangle: 0
                };
            }
            return { tickmode: 'linear', dtick: 2, tickangle: 0 };
        }

        // ---- Shared chart layout builders (used by both initial plot & replotCharts) ----
        function axTime() {
            var tickConfig = (typeof times !== 'undefined' && times && times.length > 0)
                ? buildTimeTickConfig(times, typeof netLoadPeriod !== 'undefined' ? netLoadPeriod : 'daily')
                : {};
            return Object.assign({
                title: { text: '🕐 Time — Hour of Day', font: { size: 13 } },
                showgrid: true,
                gridcolor: '#eee'
            }, tickConfig);
        }
        function axPower() { return { title: { text: '⚡ Power (kW)', font: { size: 13 } }, showgrid: true, gridcolor: '#eee', rangemode: 'tozero' }; }
        function chartTitle(main, sub) {
            return { text: `<b>${main}</b><br><span style="font-size:12px;color:#777">${sub}</span>`, font: { size: 17 }, x: 0.5, xanchor: 'center' };
        }
        // Lets the user DRAG annotation boxes (and arrow tails) apart when they overlap.
        const PLOT_CONFIG = { edits: { annotationPosition: true, annotationTail: true }, displaylogo: false, responsive: true };
     