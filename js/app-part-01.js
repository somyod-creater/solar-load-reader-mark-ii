ge = document.getElementById('tariffInfoBadge');
            if (badge) badge.innerHTML = '⚙️ <b>กำหนดค่าเอง (Custom Rate):</b> ปรับแต่งค่าไฟด้วยตนเอง';
            updateDashboard();
        }


        let batteryMode = 'load_first';
        function setBatteryMode(mode) {
            batteryMode = mode;
            const btnLoadFirst = document.getElementById('btnLoadFirst');
            const btnBatteryFirst = document.getElementById('btnBatteryFirst');
            if (mode === 'load_first') {
                btnLoadFirst.style.background = '#6f42c1';
                btnBatteryFirst.style.background = '#6c757d';
            } else {
                btnLoadFirst.style.background = '#6c757d';
                btnBatteryFirst.style.background = '#6f42c1';
            }

            updateDashboard();
        }

        function toggleInverterType() {
            const inverterType = document.getElementById('inverterType').value;
            const bessPanel = document.getElementById('bessPanel');
            if (inverterType === 'on_grid') {
                bessPanel.style.display = 'none';
            } else {
                bessPanel.style.display = 'block';
            }

            updateDashboard();
        }

        // ===================== Solar model (ideal day) =====================
        // No irradiance data for the actual site, so the day is modelled from two
        // numbers the user sets, with nothing weather-derived baked in:
        //   Peak Ratio  - midday power as a share of kWp (system efficiency at full sun)
        //   PSH         - net full-power hours per day, which fixes the daily energy
        //
        // The shape is sin^n across the daylight window, with n solved so that
        //   peak = peakRatio x kWp      what the inverter sees at noon, so clipping shows
        //   area = PSH x kWp            the energy every financial figure is built on
        // A plain half-sine (n = 1) cannot do both: it pins the peak at
        // PSH*PI / (2 x window) = 52% of kWp whatever the array size, which sits under any
        // sensibly matched inverter and hides clipping entirely.
        //
        // data.default_pvgis still holds a measured year for Bangkok. It is deliberately
        // unused: it describes one location and would be wrong for a site elsewhere.

        function getSolarPeakRatio() {
            const el = document.getElementById('solarPeakRatioInput');
            const v = parseFloat(el && el.value);
            const pct = isFinite(v) ? v / 100 : 0.85;
            // Below PSH/window a peak that low cannot carry the day's energy; above ~95%
            // of kWp is not reachable once temperature and wiring losses are counted.
            const floor = (getSolarPSH() / (SOLAR_SUNSET - SOLAR_SUNRISE)) * 1.05;
            return Math.min(0.95, Math.max(floor, pct));
        }

        function getSolarPSH() {
            const el = document.getElementById('solarPshInput');
            const v = parseFloat(el && el.value);
            return (isFinite(v) && v > 0) ? v : PSH;
        }

        // (1/PI) * integral of sin^n over 0..PI, by Simpson's rule
        function sinPowerMean(n) {
            const N = 2000;
            let sum = 0;
            for (let i = 0; i <= N; i++) {
                const w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
                sum += w * Math.pow(Math.sin(Math.PI * i / N), n);
            }
            return sum / (3 * N);
        }

        let _solarShapeCache = { key: null, n: 1 };
        function getSolarShapeExponent(peakRatio, psh) {
            const key = peakRatio + '|' + psh;
            if (_solarShapeCache.key === key) return _solarShapeCache.n;
            const target = psh / (peakRatio * (SOLAR_SUNSET - SOLAR_SUNRISE));
            let n = 1;
            if (target > 0 && target < 1) {
                let lo = 0.05, hi = 40;
                for (let i = 0; i < 60; i++) {
                    const mid = (lo + hi) / 2;
                    if (sinPowerMean(mid) > target) lo = mid; else hi = mid;
                }
                n = (lo + hi) / 2;
            }
            _solarShapeCache = { key, n };
            return n;
        }

        function solarPerKwpAtHour(h) {
            if (h < SOLAR_SUNRISE || h >= SOLAR_SUNSET) return 0;
            const peakRatio = getSolarPeakRatio();
            const n = getSolarShapeExponent(peakRatio, getSolarPSH());
            const span = SOLAR_SUNSET - SOLAR_SUNRISE;
            return peakRatio * Math.pow(Math.sin(Math.PI * (h - SOLAR_SUNRISE) / span), n);
        }

        function buildSolarDcCurve(kwp, hoursArr) {
            return hoursArr.map(h => kwp * solarPerKwpAtHour(h));
        }

        function solarDailyKwh(kwp) {
            return kwp * getSolarPSH();
        }

        // Every day is the same ideal day, so clipping is worked out once across it at a
        // fine step and scaled to the year, rather than taken off an already-averaged curve.
        function solarDailyAcKwh(kwp, invLimit) {
            const cap = invLimit > 0 ? invLimit : Infinity;
            const steps = 24 * 60;            // one minute
            const dt = 24 / steps;
            let sum = 0;
            for (let i = 0; i < steps; i++) {
                sum += Math.min(kwp * solarPerKwpAtHour(i * dt), cap) * dt;
            }
            return sum;
        }

        function solarAnnualAcKwh(kwp, invLimit) {
            return solarDailyAcKwh(kwp, invLimit) * 365;
        }

        function simulateBESS(peakTarget, batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, hours, interval_hours) {
            const batEff = 1.00; // Ideal efficiency for simple customer understanding
            const chargeEff = Math.sqrt(batEff);
            const dischargeEff = Math.sqrt(batEff);
            const socFloor = batCap * (1 - dod / 100); // reserve that must not be discharged (DOD limit)
            // Start EMPTY (at the DOD floor), not full. With real load, the warm-up passes below
            // settle SOC to the same periodic day either way, so the starting guess doesn't matter.
            // But with zero load (e.g. PVSyst production reviewed on its own, no load profile
            // uploaded yet) nothing ever discharges the battery, so starting it full left it
            // permanently full - it could never accept the day's solar, showing 0% used / 100%
            // curtailed regardless of capacity. Starting empty lets it actually charge from the
            // daily solar surplus in that case, which is the only meaningful thing a battery can
            // do without a load to discharge into.
            let soc = socFloor;
            const n = solar_dc_curve.length;
            const solar_actual = new Array(n).fill(0);
            const net_curve = new Array(n).fill(0);
            const bess_charge_curve = new Array(n).fill(0);
            const bess_discharge_curve = new Array(n).fill(0);
            const soc_percent_curve = new Array(n).fill(0);
            let self_consumed = 0;
            let direct_consumed = 0;
            let grid_charge_kwh = 0;
            let curtailed = 0;

            // The off-peak charging window (22:00-08:00) wraps across midnight, so a single-day pass
            // that starts at the SOC floor would charge TWICE (00:00-08:00 AND 22:00-24:00) and grid
            // charge could exceed the battery capacity. Run the day several times, carrying SOC over,
            // so it settles to a steady-state (periodic) day; only the final pass's results are kept.
            //
            // That convergence assumes a periodic charge/discharge cycle exists. With zero load
            // (e.g. reviewing PVSyst production alone, before/without a load profile), nothing ever
            // discharges the battery, so it fills once and then just stays full every subsequent
            // pass - the "steady state" hides the one interesting thing there is to show: how the
            // battery fills from the day's solar. So skip the multi-pass convergence in that case
            // and report a single pass starting from the DOD floor instead.
            const hasLoad = load_curve.some(v => v > 0);
            const WARMUP_PASSES = hasLoad ? 3 : 0;
            for (let pass = 0; pass <= WARMUP_PASSES; pass++) {
                // Reset per-day accumulators & curves each pass (SOC intentionally carries over).
                self_consumed = 0; direct_consumed = 0; grid_charge_kwh = 0; curtailed = 0;
                for (let k = 0; k < n; k++) {
                    solar_actual[k] = 0; net_curve[k] = 0; bess_charge_curve[k] = 0;
                    bess_discharge_curve[k] = 0; soc_percent_curve[k] = 0;
                }
                for (let i = 0; i < n; i++) {
                    // With no load, each day is simulated independently starting from empty (see
                    // hasLoad above) - a multi-day view (e.g. Weekly's 7x24 slots) would otherwise
                    // let the battery fill up once early on and then sit full/idle for the rest of
                    // the days shown, understating what a typical day can actually charge.
                    if (!hasLoad && i % 24 === 0) soc = socFloor;
                    const s_dc = (invLimit > 0) ? Math.min(solar_dc_curve[i], invLimit) : solar_dc_curve[i]; // Capped at inverter limit for Ideal simple view
                    const l = load_curve[i];
                    const h = hours[i];
                    const is_off_peak = (h >= OFF_PEAK_START_H || h < OFF_PEAK_END_H);
                    let direct_solar_used = 0;
                    let bess_solar_charge_power = 0;
                    let charge_power = 0;
                    let discharge_power = 0;
                    let grid_charge_power = 0;

                    if (batCap > 0 && batPower > 0) {
                        if (batteryMode === 'battery_first') {
                            const max_charge_kw = Math.min(s_dc, batPower);
                            const max_charge_kwh = (batCap - soc) / chargeEff;
                            const charge_kw = Math.min(max_charge_kw, max_charge_kwh / interval_hours);
                            soc = Math.min(batCap, soc + charge_kw * interval_hours * chargeEff);
                            charge_power += charge_kw;
                            bess_solar_charge_power = charge_kw;
                            const remaining_dc = s_dc - bess_solar_charge_power;
                            direct_solar_used = Math.min(Math.min(remaining_dc, invLimit), l);
                        } else {
                            const solar_ac_potential = Math.min(s_dc, invLimit);
                            direct_solar_used = Math.min(solar_ac_potential, l);
                            const excess_solar_dc = s_dc - direct_solar_used;
                            if (excess_solar_dc > 0) {
                                const max_charge_kw = Math.min(excess_solar_dc, batPower);
                                const max_charge_kwh = (batCap - soc) / chargeEff;
                                const charge_kw = Math.min(max_charge_kw, max_charge_kwh / interval_hours);
                                soc = Math.min(batCap, soc + charge_kw * interval_hours * chargeEff);
                                charge_power += charge_kw;
                                bess_solar_charge_power = charge_kw;
                            }
                        }
                        if (allowGridCharge && is_off_peak && soc < batCap) {
                            const max_grid_charge_kw = Math.min(batPower - bess_solar_charge_power, invLimit);
                            const max_charge_kwh = (batCap - soc) / chargeEff;
                            const charge_kw = Math.min(max_grid_charge_kw, max_charge_kwh / interval_hours);
                            soc = Math.min(batCap, soc + charge_kw * interval_hours * chargeEff);
 