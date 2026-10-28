                           charge_power += charge_kw;
                            grid_charge_power = charge_kw;
                            grid_charge_kwh += charge_kw * interval_hours;
                        }
                        const net_load = Math.max(0, l - direct_solar_used);
                        // When grid-charging is enabled, hold the off-peak charge for the daytime peak
                        // (don't discharge cheap off-peak energy). Otherwise discharge freely (self-consumption).
                        const hold_for_arbitrage = allowGridCharge && is_off_peak;
                        if (net_load > peakTarget && soc > socFloor && !hold_for_arbitrage) {
                            const req_discharge_kw = net_load - peakTarget;
                            const max_discharge_kw = Math.min(req_discharge_kw, invLimit - direct_solar_used);
                            const max_discharge_kwh = (soc - socFloor) * dischargeEff; // only energy above the DOD reserve
                            const discharge_kw = Math.min(max_discharge_kw, max_discharge_kwh / interval_hours);
                            soc = Math.max(socFloor, soc - (discharge_kw * interval_hours) / dischargeEff);
                            discharge_power += discharge_kw;
                        }
                    } else {
                        direct_solar_used = Math.min(Math.min(s_dc, invLimit), l);
                    }

                    solar_actual[i] = direct_solar_used + bess_solar_charge_power;
                    bess_charge_curve[i] = charge_power;
                    bess_discharge_curve[i] = discharge_power;
                    soc_percent_curve[i] = batCap > 0 ? (soc / batCap) * 100 : 0;
                    net_curve[i] = Math.max(0, l - direct_solar_used - discharge_power + grid_charge_power);
                    self_consumed += (direct_solar_used + bess_solar_charge_power) * interval_hours;
                    direct_consumed += direct_solar_used * interval_hours;
                    curtailed += Math.max(0, s_dc - (direct_solar_used + bess_solar_charge_power)) * interval_hours;
                }
            } // end warm-up / steady-state pass loop
            return { solar_actual, net_curve, bess_charge_curve, bess_discharge_curve, soc_percent_curve, self_consumed, direct_consumed, grid_charge_kwh, curtailed };
        }

        function updateDashboard() {
            const kwp = parseFloat(document.getElementById('kwpInput').value) || 0;
            const invLimit = parseFloat(document.getElementById('invInput').value) || 0;
            const costWp = parseFloat(document.getElementById('costInput').value) || 0;

            const pr_float = FIXED_PR;
            const interval_hours = (hours.length > 1) ? (hours[1] - hours[0]) : 0.25;
            // The profile can span more than one day (weekly = 7 days, monthly ≈ 30). Summed energies
            // below are therefore per-profile; divide by this to get true per-DAY figures so every
            // "kWh/Day" label and ×365 annual projection stays correct in every view.
            const daysInProfile = netLoadPeriod === 'weekly' ? 7 : (netLoadPeriod === 'monthly' ? 30 : 1);

            const isUsingPVSyst = (activeSolarSource === 'pvsyst' && importedPVSystData);
            const isComparing = (activeSolarSource === 'compare' && importedPVSystData);

            // 1. Formula calculation (ideal sine wave)
            const formula_dc_curve = buildSolarDcCurve(kwp, hours);
            const formula_curve = formula_dc_curve.map(s => (invLimit > 0 && s > invLimit) ? invLimit : s);

            // 2. PVSyst hourly simulation profile (if imported)
            let pvsyst_dc_curve = null;
            let pvsyst_curve = null;
            if (importedPVSystData) {
                if (hours.length === 24) {
                    pvsyst_dc_curve = importedPVSystData.hourlyMeanProfile.slice();
                } else {
                    // "Mon 09:00"-style labels (weekly view) carry a real day-of-week - use the actual
                    // per-weekday average for that day instead of just repeating the single annual-average
                    // daily profile 7 times, which looked identical every day and hid real weather-driven
                    // day-to-day variation that's genuinely in the imported data.
                    const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
                    pvsyst_dc_curve = times.map((t, i) => {
                        const h = hours[i];
                        const dayLabel = t.includes(' ') ? t.split(' ')[0] : null;
                        const wd = dayLabel != null ? WEEKDAY_INDEX[dayLabel] : null;
                        const profile = (wd != null && importedPVSystData.weekdayHourlyProfiles)
                            ? importedPVSystData.weekdayHourlyProfiles[wd]
                            : importedPVSystData.hourlyMeanProfile;
                        const hFloor = Math.floor(h) % 24;
                        const hNext = (hFloor + 1) % 24;
                        const frac = h - Math.floor(h);
                        return profile[hFloor] * (1 - frac) + profile[hNext] * frac;
                    });
                }
                pvsyst_curve = pvsyst_dc_curve.map(s => (invLimit > 0 && s > invLimit) ? invLimit : s);
            }

            // 3. Select active curve for simulation and financial calculations
            let solar_dc_curve;
            let total_solar_kwh_day;

            if ((isUsingPVSyst || isComparing) && pvsyst_dc_curve) {
                solar_dc_curve = pvsyst_dc_curve;
                total_solar_kwh_day = importedPVSystData.avgDailyKwh;
            } else {
                solar_dc_curve = formula_dc_curve;
                total_solar_kwh_day = solarDailyKwh(kwp);
            }

            const solar_curve = solar_dc_curve.map(s => (invLimit > 0 && s > invLimit) ? invLimit : s);
            const load_curve = data.overall_mean;

            const tariffVal = document.getElementById('tariffProfile').value;
            const tariffData = PEA_TARIFF_DATA[tariffVal];
            const is_tou = tariffData ? tariffData.is_tou : true;
            const ft = parseFloat(document.getElementById('ftInput')?.value) || 0;
            const baseRate = parseFloat(document.getElementById('rateInput').value) || 0;
            const baseOffPeak = parseFloat(document.getElementById('offPeakRateInput')?.value) ?? (is_tou ? OFF_PEAK_RATE : baseRate);
            const demandChargeRate = parseFloat(document.getElementById('demandRateInput')?.value) ?? (tariffData ? tariffData.demand_charge : DEMAND_CHARGE_RATE);

            const rate = baseRate + ft;
            const rate_off_peak = is_tou ? (baseOffPeak + ft) : rate;

            const inverterType = document.getElementById('inverterType').value;
            const isHybrid = (inverterType === 'hybrid');
            const batCap = isHybrid ? (parseFloat(document.getElementById('batCapInput').value) || 0) : 0;
            const batPower = isHybrid ? (parseFloat(document.getElementById('pcsInput').value) || 0) : 0;
            const batCost = isHybrid ? (parseFloat(document.getElementById('batCostInput').value) || 0) : 0;
            const allowGridCharge = isHybrid ? document.getElementById('gridChargeInput').checked : false;
            const dod = isHybrid ? Math.min(Math.max(parseFloat(document.getElementById('dodInput').value) || 80, 0), 100) : 100;
            // Peak Shaving Target is now ALWAYS auto-optimised (no manual entry): pick the target that
            // minimises the net grid peak for this battery, then reflect it in the read-only field.
            const peakTarget = (isHybrid && batCap > 0 && batPower > 0)
                ? computeAutoPeakTarget(batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, interval_hours)
                : 0;
            const peakTargetField = document.getElementById('peakTargetInput');
            if (peakTargetField) { peakTargetField.value = Math.round(peakTarget); peakTargetField.readOnly = true; }

            // Scenario 1: Solar Only
            const noBarResult = simulateBESS(0, 0, 0, invLimit, false, false, 100, solar_dc_curve, load_curve, hours, interval_hours);
            const solar_actual_no_bat = noBarResult.solar_actual;
            const net_curve_no_bat = noBarResult.net_curve;
            const self_consumed_no_bat = noBarResult.self_consumed / daysInProfile;
            const curtailed_no_bat = noBarResult.curtailed / daysInProfile;

            // Scenario 2: Solar + BESS
            const batResult = simulateBESS(peakTarget, batCap, batPower, invLimit, is_tou, allowGridCharge, dod, solar_dc_curve, load_curve, hours, interval_hours);
            const solar_actual_bat = batResult.solar_actual;
            const net_curve_bat = batResult.net_curve;
            const bess_charge_curve = batResult.bess_charge_curve;
            const bess_discharge_curve = batResult.bess_discharge_curve;
            const soc_percent_curve = batResult.soc_percent_curve;
            const self_consumed_bat = batResult.self_consumed / daysInProfile;
            const grid_charge_kwh_day = batResult.grid_charge_kwh / daysInProfile;
            const curtailed_bat = batResult.curtailed / daysInProfile;
            const direct_consumed_day = batResult.direct_consumed / daysInProfile;

            const prod_year = isUsingPVSyst ? (importedPVSystData.annualTotalMWh * 1000) : solarAnnualAcKwh(kwp, invLimit);

            // --- Financials: Solar Only ---
            const useful_year_no_bat = self_consumed_no_bat * 365;
            const rev_no_bat_year = useful_year_no_bat * rate;
            const peak_original = arrayMax(load_curve);
            const peak_no_bat = arrayMax(net_curve_no_bat);
            const peak_reduction_no_bat = Math.max(0, peak_original - peak_no_bat);
            const demand_savings_no_bat_year = peak_reduction_no_bat * demandChargeRate * 12;
            const total_rev_no_bat_year = rev_no_bat_year + demand_savings_no_bat_year;
            const cost_no_bat = kwp * 1000 * costWp;
            const payback_no_bat_float = total_rev_no_bat_year > 0 ? cost_no_bat / total_rev_no_bat_year : 0;
            const self_cons_rate_no_bat = total_solar_kwh_day > 0 ? (self_consumed_no_bat / total_solar_kwh_day) * 100 : 0;

            // --- Financials: Solar + BESS ---
            const useful_year_bat = self_consumed_bat * 365;
            const solar_savings_bat_year = direct_consumed_day * 365 * rate;
            const bess_discharge_kwh_day = bess_discharge_curve.reduce((sum, v) => sum + v * interval_hours, 0) / daysInProfile;
            // Discharge time-of-day window. Use the clock hour (works for daily AND weekly, where the
            // slot labels are "Mon 09:30" etc.) so we show a HH:MM–HH:MM range, not "Mon–Fri".
            const dischIdxs = bess_discharge_curve.map((v, i) => v > 0.1 ? i : -1).filter(i => i >= 0);
            const fmtHM = (hf) => `${String(Math.floor(hf)).padStart(2, '0')}:${String(Math.round((hf - Math.floor(hf)) * 60)).padStart(2, '0')}`;
            const dischWindow = dischIdxs.length ? `${fmtHM(Math.min(...dischIdxs.map(i => hours[i])))}–${fmtHM(Math.max(...dischIdxs.map(i => hours[i])))}` : '—';
            // Energy charged into the battery per day, split solar vs grid
            const total_charge_kwh_day = bess_charge_curve.reduce((sum, v) => sum + v * interval_hours, 0) / daysInProfile;
            const solar_charge_kwh_day = Math.max(0, total_charge_kwh_day - grid_charge_kwh_day);
            const direct_solar_pct = total_solar_kwh_day > 0 ? (direct_consumed_day / total_solar_kwh_day) * 100 : 0;
            const solar_charge_pct = total_solar_kwh_day > 0 ? (solar_charge_kwh_day / total_solar_kwh_day) * 100 : 0;
            const curtailed_bat_pct = total_solar_kwh_day > 0 ? (curtailed_bat / total_solar_kwh_day) * 100 : 0;
    