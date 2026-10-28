        // DOD (Depth of Discharge): how deep the daily cycle goes (peak SOC → trough after peak)
            const socMax = arrayMax(soc_percent_curve);
            const iSocMax = soc_percent_curve.indexOf(socMax);
            let socTrough = socMax;
            for (let i = iSocMax; i < soc_percent_curve.length; i++) socTrough = Math.min(socTrough, soc_percent_curve[i]);
            const dod_pct = Math.max(0, socMax - socTrough);
            const bess_savings_year = (bess_discharge_kwh_day * rate - grid_charge_kwh_day * rate_off_peak) * 365;
            const peak_bat = arrayMax(net_curve_bat);
            const peak_reduction_bat = Math.max(0, peak_original - peak_bat);
            const demand_savings_bat_year = peak_reduction_bat * demandChargeRate * 12;
            const total_rev_bat_year = solar_savings_bat_year + bess_savings_year + demand_savings_bat_year;
            const cost_bat = cost_no_bat + (batCap * batCost);
            const payback_bat_float = total_rev_bat_year > 0 ? cost_bat / total_rev_bat_year : 0;
            const self_cons_rate_bat = total_solar_kwh_day > 0 ? (self_consumed_bat / total_solar_kwh_day) * 100 : 0;

            // Base metrics UI updates
            const display_rev_year = batCap > 0 ? total_rev_bat_year : total_rev_no_bat_year;
            const display_self_cons = batCap > 0 ? self_cons_rate_bat : self_cons_rate_no_bat;
            const display_payback_float = batCap > 0 ? payback_bat_float : payback_no_bat_float;

            let p_years = Math.floor(display_payback_float);
            let p_months = Math.round((display_payback_float - p_years) * 12);
            let payback_str = display_payback_float > 0 ? `${p_years} Years ${p_months} Months` : "No Payback Point";

            document.getElementById('prodYear').innerText = Math.round(prod_year).toLocaleString('en-US') + ' kWh';
            document.getElementById('saveMonth').innerText = formatter.format(display_rev_year / 12.0);
            document.getElementById('saveYear').innerText = formatter.format(display_rev_year);
            document.getElementById('selfCons').innerText = display_self_cons.toFixed(1) + '%';
            document.getElementById('payback').innerText = payback_str;
            document.getElementById('carbon').innerText = ((prod_year * CO2_FACTOR) / 1000.0).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' Tons/Year';

            // Summary tab — คำตอบหลักในหน้าเดียว (อัปเดตทุกครั้งที่คำนวณ)
            const display_cost = batCap > 0 ? cost_bat : cost_no_bat;
            const summaryHasLoad = Array.isArray(load_curve) && load_curve.some(v => Number(v) > 0);
            const tariffSelect = document.getElementById('tariffProfile');
            const tariffLabel = tariffSelect && tariffSelect.selectedOptions && tariffSelect.selectedOptions[0]
                ? tariffSelect.selectedOptions[0].textContent.trim()
                : (tariffVal || '—');
            updateSummaryPanel({
                hasBattery: batCap > 0,
                kwp,
                invLimit,
                batCap,
                batPower,
                batCost,
                costWp,
                prodYear: prod_year,
                saveYear: display_rev_year,
                saveMonth: display_rev_year / 12.0,
                selfCons: display_self_cons,
                paybackStr: payback_str,
                paybackYears: display_payback_float,
                cost: display_cost,
                costSolarOnly: cost_no_bat,
                hasLoad: summaryHasLoad,
                tariffLabel,
                rateOnPeak: rate,
                rateOffPeak: rate_off_peak,
                demandChargeRate,
                ft,
                isTou: is_tou,
                carbonTons: (prod_year * CO2_FACTOR) / 1000.0,
                peakOriginal: peak_original,
                peakAfter: batCap > 0 ? peak_bat : peak_no_bat,
                peakReduction: batCap > 0 ? peak_reduction_bat : peak_reduction_no_bat,
                solarSource: isUsingPVSyst ? 'PVSyst (E_Grid)' : (isComparing ? 'เปรียบเทียบสูตร / PVSyst' : 'สูตรคำนวณ'),
                fileNames: (lastUploadedFiles || []).map(f => f.name).filter(Boolean),
                scenarioSolarOnly: {
                    cost: cost_no_bat,
                    saveYear: total_rev_no_bat_year,
                    paybackStr: payback_no_bat_float > 0
                        ? `${Math.floor(payback_no_bat_float)} Years ${Math.round((payback_no_bat_float - Math.floor(payback_no_bat_float)) * 12)} Months`
                        : 'No Payback Point',
                    selfCons: self_cons_rate_no_bat,
                    peak: peak_no_bat
                },
                scenarioWithBess: {
                    cost: cost_bat,
                    saveYear: total_rev_bat_year,
                    paybackStr: payback_bat_float > 0
                        ? `${Math.floor(payback_bat_float)} Years ${Math.round((payback_bat_float - Math.floor(payback_bat_float)) * 12)} Months`
                        : 'No Payback Point',
                    selfCons: self_cons_rate_bat,
                    peak: peak_bat
                }
            });

            // Comparison Table Population (Monthly Average)
            document.getElementById('compCostNoBat').innerText = formatter.format(cost_no_bat);
            document.getElementById('compCostBat').innerText = formatter.format(cost_bat);
            document.getElementById('compCostDiff').innerText = formatter.format(cost_bat - cost_no_bat);

            document.getElementById('compSelfNoBat').innerText = Math.round(useful_year_no_bat / 12).toLocaleString('en-US');
            document.getElementById('compSelfBat').innerText = Math.round(useful_year_bat / 12).toLocaleString('en-US');
            document.getElementById('compSelfDiff').innerText = '+' + Math.round((useful_year_bat - useful_year_no_bat) / 12).toLocaleString('en-US');

            document.getElementById('compWasteNoBat').innerText = Math.round(curtailed_no_bat * 365 / 12).toLocaleString('en-US');
            document.getElementById('compWasteBat').innerText = Math.round(curtailed_bat * 365 / 12).toLocaleString('en-US');
            document.getElementById('compWasteDiff').innerText = Math.round((curtailed_bat - curtailed_no_bat) * 365 / 12).toLocaleString('en-US');

            document.getElementById('compPeakNoBat').innerText = peak_no_bat.toFixed(1) + ' kW';
            document.getElementById('compPeakBat').innerText = peak_bat.toFixed(1) + ' kW';
            document.getElementById('compPeakDiff').innerText = (peak_bat - peak_no_bat).toFixed(1) + ' kW';

            document.getElementById('compRevNoBat').innerText = formatter.format(total_rev_no_bat_year / 12) + ' / ด.';
            document.getElementById('compRevBat').innerText = formatter.format(total_rev_bat_year / 12) + ' / ด.';
            document.getElementById('compRevDiff').innerText = '+' + formatter.format((total_rev_bat_year - total_rev_no_bat_year) / 12) + ' / ด.';

            let p_yr_nb = Math.floor(payback_no_bat_float); let p_mo_nb = Math.round((payback_no_bat_float - p_yr_nb) * 12);
            let p_yr_b = Math.floor(payback_bat_float); let p_mo_b = Math.round((payback_bat_float - p_yr_b) * 12);
            document.getElementById('compPaybackNoBat').innerText = payback_no_bat_float > 0 ? `${p_yr_nb}y ${p_mo_nb}m` : 'N/A';
            document.getElementById('compPaybackBat').innerText = payback_bat_float > 0 ? `${p_yr_b}y ${p_mo_b}m` : 'N/A';
            document.getElementById('compPaybackDiff').innerText = (payback_bat_float - payback_no_bat_float).toFixed(2) + 'y';

            // Monthly Savings Breakdown Updates
            const elSolarDirect = document.getElementById('monthlySolarDirect');
            if (elSolarDirect) elSolarDirect.innerText = formatter.format(solar_savings_bat_year / 12) + ' / เดือน';
            const elSolarDirectUnit = document.getElementById('monthlySolarDirectUnit');
            if (elSolarDirectUnit) elSolarDirectUnit.innerText = `${Math.round(direct_consumed_day * 365 / 12).toLocaleString('en-US')} kWh/เดือน (@ ${rate.toFixed(4)} ฿/kWh)`;

            const elBessArbitrage = document.getElementById('monthlyBessArbitrage');
            if (elBessArbitrage) elBessArbitrage.innerText = formatter.format(bess_savings_year / 12) + ' / เดือน';
            const elBessUnit = document.getElementById('monthlyBessUnit');
            if (elBessUnit) elBessUnit.innerText = batCap > 0 ? `ปล่อยไฟ ${Math.round(bess_discharge_kwh_day * 365 / 12).toLocaleString('en-US')} kWh/ด. (Arbitrage)` : 'ไม่ได้ติดตั้ง BESS';

            const elDemandSaving = document.getElementById('monthlyDemandSaving');
            if (elDemandSaving) elDemandSaving.innerText = formatter.format(demand_savings_bat_year / 12) + ' / เดือน';
            const elDemandKw = document.getElementById('monthlyDemandKw');
            if (elDemandKw) elDemandKw.innerText = batCap > 0 && demandChargeRate > 0 ? `ลด Peak ${peak_reduction_bat.toFixed(1)} kW (@ ${demandChargeRate.toFixed(2)} ฿/kW/ด.)` : (demandChargeRate === 0 ? 'ประเภทนี้ไม่มีค่า Demand Charge' : 'ไม่มีระบบลด Peak');

            const elTotalMonthly = document.getElementById('monthlyTotalSaving');
            if (elTotalMonthly) elTotalMonthly.innerText = formatter.format(display_rev_year / 12) + ' / เดือน';
            const elAnnualProj = document.getElementById('monthlyAnnualProjection');
            if (elAnnualProj) elAnnualProj.innerText = `ประมาณการรวมทั้งปี: ${formatter.format(display_rev_year)} / ปี`;

            // Chart 3 Annotations
            const curtailment_curve_no_bat = solar_curve.map((s, i) => Math.max(0, s - solar_actual_no_bat[i]));
            const maxCurtailmentNoBat = arrayMax(curtailment_curve_no_bat);
            const peakIdxNoBat = curtailment_curve_no_bat.indexOf(maxCurtailmentNoBat);
            const peakTimeNoBat = times[peakIdxNoBat];
            let curtailed_no_bat_pct = total_solar_kwh_day > 0 ? (curtailed_no_bat / total_solar_kwh_day) * 100 : 0;

            // Chart 4 Annotations
            const maxBessCharge = arrayMax(bess_charge_curve);
            const peakIdxBess = bess_charge_curve.indexOf(maxBessCharge);
            const peakTimeBess = times[peakIdxBess];

            const showDesignedSolar = isUsingPVSyst || (kwp > 0);

            // Chart 1 restyle based on activeSolarSource: 'formula' | 'pvsyst' | 'compare'
            if (activeSolarSource === 'compare' && importedPVSystData && pvsyst_curve) {
                // Primary trace: PVSyst simulation
                Plotly.restyle('chart1', {
                    'y': [pvsyst_curve],
                    'name': [`<b>☀️ PVSyst E_Grid (${importedPVSystData.peakPowerKw} kW peak)</b>`],
                    'line': [{ shape: 'spline', color: '#f59e0b', width: 3, dash: 'solid' }],
                    'fill': ['tozeroy'],
                    'fillcolor': ['rgba(245, 158, 11, 0.20)'],
                    'visible': [showDesignedSolar]
                }, [solarTraceIndex]);

                // Secondary comparison trace: Formula sine wave
                if (compareTraceIndex !== undefined && compareTraceIndex >= 0) {
                    Plotly.restyle('chart1', {
                        'y': [formula_curve],
                        'name': [`<b>⚙️ PVGIS (${kwp} kWp)</b>`],
                        'line': [{ shape: 'spline', color: '#8b5cf6', width: 2.5, dash: 'dash' }],
                        'fill': ['none'],
                        'visible': [showDesignedSolar]
                    }, [compareTraceIndex]);
                }
            } else if (activeSolarSource === 'pvsyst' && importedPVSystData && pvsyst_curve) {
                Plotly.restyle('chart1', {
                    'y': [solar_curve],
                    'name': [`<b>☀️ Solar Gen (PVSyst E_Grid - Peak ${importedPVSystData.peakPowerKw} kW)</b>`],
                    'line': [{ shape: 'spline', color: '#f59e0b', width: 3,