row new Error('อ่านไฟล์ตัวอย่างไม่สำเร็จ');

                if (wizardEnabled) setWizardStep(3);
                applyWizardUi();
                if (options.run !== false) runAndShowSummary();
                return true;
            } catch (err) {
                console.error(err);
                if (statusEl) {
                    statusEl.classList.add('is-warn');
                    statusEl.innerHTML = '❌ ใส่ตัวอย่างไม่สำเร็จ — ' + (err && err.message ? err.message : err);
                }
                alert('ใส่ตัวอย่างไม่สำเร็จ: ' + (err && err.message ? err.message : err));
                return false;
            } finally {
                if (btn) btn.disabled = false;
                const top = document.getElementById('btnLoadHouseholdSampleTop');
                if (top) {
                    top.disabled = false;
                    top.textContent = 'ใส่ตัวอย่างบ้าน 1 เดือน';
                }
            }
        }

        // ?demo=1 / ?reset=1 → ล้าง state เก่า แล้วเริ่มใหม่ให้คลิกเดโมได้
        try {
            const sp0 = new URLSearchParams(window.location.search);
            if (sp0.get('demo') === '1' || sp0.get('reset') === '1') {
                try { localStorage.removeItem('solarLoadReaderImportedState'); } catch (e) { }
                rawDataPoints = [];
                fusionSolarData = null;
                plantReportData = null;
                importedNetLoadData = null;
                importedPVSystData = null;
                lastUploadedFiles = [];
                summaryRevealed = false;
                latestSummaryPayload = null;
                latestBatteryVerdict = null;
            }
        } catch (e) { }

        restoreImportedState();
        initWizard();
        // สตาร์ทแอป: ถ้ามีโหลดอยู่แล้ว → คำนวณแล้วพาไป Summary
        // ถ้ายังไม่มีโหลด → ใส่ตัวอย่างบ้านอัตโนมัติ (เลิกพึ่งให้คนกดปุ่มเอง)
        // ?nosample=1 / ?demo=1 → ไม่ใส่ให้อัตโนมัติ เปิด Input ให้กดปุ่มตัวอย่างเอง
        try {
            const sp = new URLSearchParams(window.location.search);
            const manualDemo = sp.get('demo') === '1' || sp.get('nosample') === '1' || sp.get('sample') === '0';
            const hasLoad = Array.isArray(rawDataPoints) && rawDataPoints.length > 0;
            if (manualDemo) {
                wizardEnabled = true;
                wizardStep = 1;
                summaryRevealed = false;
                const emptyEl = document.getElementById('summaryEmpty');
                const readyEl = document.getElementById('summaryReady');
                const actionsEl = document.getElementById('summaryActions');
                if (emptyEl) emptyEl.hidden = false;
                if (readyEl) readyEl.hidden = true;
                if (actionsEl) actionsEl.hidden = true;
                applyWizardUi();
                switchTab('tab-input');
            } else if (hasLoad) {
                setTimeout(() => {
                    try { updateDashboard(); } catch (e) { console.error(e); }
                    revealSummaryPanel();
                    syncSummaryBatteryCard();
                    switchTab('tab-summary');
                    applyWizardUi();
                }, 100);
            } else {
                setTimeout(() => { loadHouseholdSample({ run: true }); }, 250);
            }
        } catch (e) { }