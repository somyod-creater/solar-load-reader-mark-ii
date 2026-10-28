// --- client-side Excel Parsing Logic ---
        var rawDataPoints = [];
        var fusionSolarData = null;
        var fusionLoadIsGrid = false; // true when the imported load = Grid power (FusionSolar / already-solar site)
        var plantReportData = null;
        var importedNetLoadData = null;
        var importedPVSystData = null;
        var activeSolarSource = 'formula'; // 'formula' | 'pvsyst' | 'compare'
        var monthsAreSolar = false; // true when data.months holds PVSyst per-month curves instead of real per-month load averages
        var compareTraceIndex = -1;
        var lastUploadedFiles = [];
        var isBatchImporting = false;
        var plantReportNeedsRender = false;
        // Set when the last load import came from a current (Amp) file, so the V / PF
        // inputs can rescale the converted kW without re-reading the file.
        var lastAmpConversion = null;
        // Which upload panel the last import came from, so its result is reported
        // in that panel rather than in whichever one the file's contents imply.
        var lastUploadWasCurrentZone = false;

        const data = (typeof window !== "undefined" && window.__EMBEDDED_LOAD_DATA__) ? window.__EMBEDDED_LOAD_DATA__ : { time_strs: [], overall_mean: [] };
        const times = data.time_strs;

        const hours = times.map(t => {
            let parts = t.split(':');
            return parseInt(parts[0]) + parseInt(parts[1]) / 60.0;
        });

        const formatter = new Intl.NumberFormat('th-TH', {
            style: 'currency', currency: 'THB', maximumFractionDigits: 0
        });

        const FIXED_PR = 1.0;
        const DEMAND_CHARGE_RATE = 132.93;  // THB/kW/month (MEA/PEA peak demand charge)
        const CO2_FACTOR = 0.5;             // tCO2/MWh (EGAT grid emission factor)
        const OFF_PEAK_RATE = 2.60;         // THB/kWh (TOU off-peak rate)
        const OFF_PEAK_START_H = 22;
        const OFF_PEAK_END_H = 8;
        const PSH = 4;                      // Peak Sun Hours (Thailand average)
        const SOLAR_SUNRISE = 6;
        const SOLAR_SUNSET = 18;
        const PSH_DEFAULT_NOTE = 'net full-power hours/day; set per site';
        const PEAK_SHAVE_SEARCH_MAX = 2500;
        const PEAK_SHAVE_STEP = 5;
        const arrayMax = arr => (arr && arr.length > 0) ? arr.reduce((a, b) => Math.max(a, b), -Infinity) : 0;
        const arrayMin = arr => (arr && arr.length > 0) ? arr.reduce((a, b) => Math.min(a, b), Infinity) : 0;
        const arraySum = arr => (arr && arr.length > 0) ? arr.reduce((a, b) => a + b, 0) : 0;
        const PEA_TARIFF_DATA = {
            'pea_3_2_2': {
                name: 'ประเภท 3.2.2 กิจการขนาดกลาง TOU (22–33 kV)',
                category: 'กิจการขนาดกลาง',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 4.1839,
                off_peak_rate: 2.6037,
                demand_charge: 132.93,
                service_charge: 312.24
            },
            'pea_3_2_3': {
                name: 'ประเภท 3.2.3 กิจการขนาดกลาง TOU (< 22 kV)',
                category: 'กิจการขนาดกลาง',
                voltage: '< 22 kV',
                is_tou: true,
                peak_rate: 4.3297,
                off_peak_rate: 2.6369,
                demand_charge: 210.00,
                service_charge: 312.24
            },
            'pea_3_2_1': {
                name: 'ประเภท 3.2.1 กิจการขนาดกลาง TOU (≥ 69 kV)',
                category: 'กิจการขนาดกลาง',
                voltage: '≥ 69 kV',
                is_tou: true,
                peak_rate: 4.1025,
                off_peak_rate: 2.5849,
                demand_charge: 74.14,
                service_charge: 312.24
            },
            'pea_4_2_2': {
                name: 'ประเภท 4.2.2 กิจการขนาดใหญ่ TOU (22–33 kV)',
                category: 'กิจการขนาดใหญ่',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 4.1839,
                off_peak_rate: 2.6037,
                demand_charge: 132.93,
                service_charge: 312.24
            },
            'pea_4_2_3': {
                name: 'ประเภท 4.2.3 กิจการขนาดใหญ่ TOU (< 22 kV)',
                category: 'กิจการขนาดใหญ่',
                voltage: '< 22 kV',
                is_tou: true,
                peak_rate: 4.3297,
                off_peak_rate: 2.6369,
                demand_charge: 210.00,
                service_charge: 312.24
            },
            'pea_4_2_1': {
                name: 'ประเภท 4.2.1 กิจการขนาดใหญ่ TOU (≥ 69 kV)',
                category: 'กิจการขนาดใหญ่',
                voltage: '≥ 69 kV',
                is_tou: true,
                peak_rate: 4.1025,
                off_peak_rate: 2.5849,
                demand_charge: 74.14,
                service_charge: 312.24
            },
            'pea_5_1_2': {
                name: 'ประเภท 5.1.2 โรงแรม/กิจการเฉพาะอย่าง TOU (22–33 kV)',
                category: 'กิจการเฉพาะอย่าง',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 4.1839,
                off_peak_rate: 2.6037,
                demand_charge: 132.93,
                service_charge: 312.24
            },
            'pea_5_1_3': {
                name: 'ประเภท 5.1.3 โรงแรม/กิจการเฉพาะอย่าง TOU (< 22 kV)',
                category: 'กิจการเฉพาะอย่าง',
                voltage: '< 22 kV',
                is_tou: true,
                peak_rate: 4.3297,
                off_peak_rate: 2.6369,
                demand_charge: 210.00,
                service_charge: 312.24
            },
            'pea_2_2_2': {
                name: 'ประเภท 2.2.2 กิจการขนาดเล็ก TOU (< 22 kV)',
                category: 'กิจการขนาดเล็ก',
                voltage: '< 22 kV',
                is_tou: true,
                peak_rate: 5.7982,
                off_peak_rate: 2.6369,
                demand_charge: 0,
                service_charge: 33.29
            },
            'pea_2_2_1': {
                name: 'ประเภท 2.2.1 กิจการขนาดเล็ก TOU (22–33 kV)',
                category: 'กิจการขนาดเล็ก',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 5.1135,
                off_peak_rate: 2.6037,
                demand_charge: 0,
                service_charge: 312.24
            },
            'pea_2_1_2': {
                name: 'ประเภท 2.1.2 กิจการขนาดเล็ก ปกติ (< 22 kV)',
                category: 'กิจการขนาดเล็ก',
                voltage: '< 22 kV',
                is_tou: false,
                peak_rate: 4.4217,
                off_peak_rate: 4.4217,
                demand_charge: 0,
                service_charge: 33.29
            },
            'pea_2_1_1': {
                name: 'ประเภท 2.1.1 กิจการขนาดเล็ก ปกติ (22–33 kV)',
                category: 'กิจการขนาดเล็ก',
                voltage: '22–33 kV',
                is_tou: false,
                peak_rate: 3.9086,
                off_peak_rate: 3.9086,
                demand_charge: 0,
                service_charge: 312.24
            },
            'pea_3_1_2': {
                name: 'ประเภท 3.1.2 กิจการขนาดกลาง ปกติ (22–33 kV)',
                category: 'กิจการขนาดกลาง',
                voltage: '22–33 kV',
                is_tou: false,
                peak_rate: 3.1471,
                off_peak_rate: 3.1471,
                demand_charge: 196.26,
                service_charge: 312.24
            },
            'pea_3_1_3': {
                name: 'ประเภท 3.1.3 กิจการขนาดกลาง ปกติ (< 22 kV)',
                category: 'กิจการขนาดกลาง',
                voltage: '< 22 kV',
                is_tou: false,
                peak_rate: 3.1751,
                off_peak_rate: 3.1751,
                demand_charge: 221.50,
                service_charge: 312.24
            },
            'pea_1_2_2': {
                name: 'ประเภท 1.2.2 บ้านอยู่อาศัย TOU (< 22 kV)',
                category: 'บ้านอยู่อาศัย',
                voltage: '< 22 kV',
                is_tou: true,
                peak_rate: 5.7982,
                off_peak_rate: 2.6369,
                demand_charge: 0,
                service_charge: 24.62
            },
            'pea_1_2_1': {
                name: 'ประเภท 1.2.1 บ้านอยู่อาศัย TOU (22–33 kV)',
                category: 'บ้านอยู่อาศัย',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 5.1135,
                off_peak_rate: 2.6037,
                demand_charge: 0,
                service_charge: 312.24
            },
            'pea_1_1_2': {
                name: 'ประเภท 1.1.2 บ้านอยู่อาศัย ปกติ (> 150 หน่วย/เดือน)',
                category: 'บ้านอยู่อาศัย',
                voltage: '< 22 kV',
                is_tou: false,
                peak_rate: 4.4217,
                off_peak_rate: 4.4217,
                demand_charge: 0,
                service_charge: 24.62
            },
            'pea_1_1_1': {
                name: 'ประเภท 1.1.1 บ้านอยู่อาศัย ปกติ (≤ 150 หน่วย/เดือน)',
                category: 'บ้านอยู่อาศัย',
                voltage: '< 22 kV',
                is_tou: false,
                peak_rate: 3.7171,
                off_peak_rate: 3.7171,
                demand_charge: 0,
                service_charge: 8.19
            },
            'pea_6_2_2': {
                name: 'ประเภท 6.2 องค์กรไม่แสวงหากำไร TOU (22–33 kV)',
                category: 'องค์กรไม่แสวงหากำไร',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 4.1839,
                off_peak_rate: 2.6037,
                demand_charge: 132.93,
                service_charge: 312.24
            },
            'pea_7_2_1': {
                name: 'ประเภท 7.2 สูบน้ำเพื่อการเกษตร TOU (22–33 kV)',
                category: 'สูบน้ำเพื่อการเกษตร',
                voltage: '22–33 kV',
                is_tou: true,
                peak_rate: 4.1839,
                off_peak_rate: 2.6037,
                demand_charge: 132.93,
                service_charge: 204.07
            },
            'pea_8': {
                name: 'ประเภท 8 ไฟฟ้าชั่วคราว (ทุกระดับแรงดัน)',
                category: 'ไฟฟ้าชั่วคราว',
                voltage: 'ทุกระดับ',
                is_tou: false,
                peak_rate: 6.8025,
                off_peak_rate: 6.8025,
                demand_charge: 0,
                service_charge: 0
            }
        };

        function onTariffProfileChange() {
            const val = document.getElementById('tariffProfile').value;
            const badge = document.getElementById('tariffInfoBadge');
            if (val === 'custom') {
                if (badge) badge.innerHTML = '⚙️ <b>กำหนดค่าเอง (Custom Rate):</b> สามารถระบุอัตราค่าไฟได้อิสระ';
                updateDashboard();
                return;
            }
            const data = PEA_TARIFF_DATA[val];
            if (data) {
                document.getElementById('rateInput').value = data.peak_rate.toFixed(4);
                document.getElementById('offPeakRateInput').value = data.off_peak_rate.toFixed(4);
                document.getElementById('demandRateInput').value = data.demand_charge.toFixed(2);
                if (badge) {
                    if (data.is_tou) {
                        badge.innerHTML = `⚡ <b>On-Peak:</b> ${data.peak_rate.toFixed(4)} ฿ | <b>Off-Peak:</b> ${data.off_peak_rate.toFixed(4)} ฿ | <b>Demand:</b> ${data.demand_charge > 0 ? data.demand_charge.toFixed(2) + ' ฿/kW' : 'ไม่มี'}`;
                    } else {
                        badge.innerHTML = `⚡ <b>Energy Rate:</b> ${data.peak_rate.toFixed(4)} ฿/kWh (ปกติ) | <b>Demand:</b> ${data.demand_charge > 0 ? data.demand_charge.toFixed(2) + ' ฿/kW' : 'ไม่มี'}`;
                    }
                }
            }
            updateDashboard();
        }

        function onManualRateChange() {
            const sel = document.getElementById('tariffProfile');
            sel.value = 'custom';
            const bad