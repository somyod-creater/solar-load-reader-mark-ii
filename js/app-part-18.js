            if (!ac.some(v => v != null && v > 0)) return null;
            return { kwp, invLimit, dc, ac, clip, clips: clip.some(v => v != null && v > 1e-6) };
        }

        function plotSolarOverlayTrace() {
            const sun = plotSolarCurves();
            if (!sun) return null;
            const { kwp, invLimit } = sun;
            const y = sun.ac;
            return {
                x: plotData.x,
                y,
                type: 'scatter',
                mode: 'lines',
                name: invLimit > 0
                    ? `โซลาร์ออกแบบ ${kwp} kWp / ${invLimit} kW`
                    : `โซลาร์ออกแบบ ${kwp} kWp`,
                line: { color: '#FFB020', width: 2, dash: 'dot' },
                fill: 'tozeroy',
                fillcolor: plotFillColor('#FFB020', 0.14),
                connectgaps: false
            };
        }

        // ---- Curtailment: the slice of the designed solar curve sitting above the load ----
        // Nothing on site can absorb that part. Depending on the contract it is exported,
        // or simply thrown away, so it is the figure that decides whether the next 50 kWp
        // is worth buying. It is measured against the AC curve AFTER the inverter cap,
        // because clipped energy never leaves the inverter and is a separate loss.

        function fmtKwh(v) {
            if (!isFinite(v)) return '-';
            return v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1);
        }

        // On chart two the load IS Grid: that chart asks what a proposed array does to the
        // meter, so Grid is the demand it has to serve. Taken exactly as the chart plots it,
        // sign toggle included, and only while Grid is ticked - that way the shaded band
        // always sits on a line that is actually on screen.
        function plotLoadReference() {
            if (!plotData) return null;
            const grid = plotData.series.find(sr => sr.isGrid && sr.hasData && sr.selected);
            if (!grid) return null;
            return { y: plotSeriesValues(grid), name: grid.name, color: grid.color };
        }

        // Median spacing, so one gap in the export does not set the step for the whole sum.
        function plotStepHours() {
            const h = plotData && plotData.xHours;
            if (!h) return 0;
            const d = [];
            for (let i = 1; i < h.length; i++) {
                if (h[i] == null || h[i - 1] == null) continue;
                const gap = h[i] - h[i - 1];
                if (gap > 0) d.push(gap);
            }
            if (!d.length) return 0;
            d.sort((a, b) => a - b);
            return d[Math.floor(d.length / 2)];
        }

        // Averaged data is one synthetic day by construction; raw data is however many
        // dates the file actually covers, so the total is divided back down to a day.
        function plotDayCount() {
            if (!plotData) return 1;
            if (plotData.averaged) return 1;
            const days = new Set();
            plotData.x.forEach(v => { if (v instanceof Date) days.add(v.toDateString()); });
            return Math.max(1, days.size);
        }

        function plotCurtailment(solarY) {
            const load = plotLoadReference();
            const step = plotStepHours();
            if (!load || !solarY || step <= 0) return null;

            const base = [], top = [];
            let over = 0, gen = 0, peak = 0, peakIdx = -1;
            for (let i = 0; i < solarY.length; i++) {
                const sv = solarY[i], lv = load.y[i];
                if (sv != null) gen += sv * step;
                if (sv == null || lv == null) { base.push(null); top.push(null); continue; }
                // Band runs from min(solar, load) up to solar, so it covers exactly the
                // part above the load and can never render inverted.
                base.push(Math.min(sv, lv));
                top.push(sv);
                const x = Math.max(0, sv - lv);
                over += x * step;
                if (x > peak) { peak = x; peakIdx = i; }
            }
            if (gen <= 0) return null;
            const days = plotDayCount();
            return {
                load, base, top, step, days, peak, peakIdx,
                kwhDay: over / days,
                genDay: gen / days,
                pct: (over / gen) * 100
            };
        }

        // ---- Battery on chart two: store the surplus, spend it on the peak ----------
        // The chart already shows what a proposed array does to the meter. A battery
        // changes two things on it and nothing else: how much of the surplus stops being
        // thrown away, and how high what is left of the peak stands. Both are worked out
        // from the same two curves the chart draws.
        //
        // It charges from the surplus only - never from the grid - so what it gives back
        // is energy that was going to be wasted, not a second way to buy at night. The
        // run goes down the day in order, because a battery cannot spend at noon what it
        // only collects at three.

        // What the meter is left carrying once the array is on: the plotted Grid line
        // minus the array's output. Negative means the array has overshot and the site is
        // pushing back out; positive is what still has to be bought.
        function plotAfterSolar(solarY) {
            const load = plotLoadReference();
            if (!load || !solarY) return null;
            return solarY.map((sv, i) => {
                const lv = load.y[i];
                return (sv == null || lv == null) ? null : lv - sv;
            });
        }

        // A pack is not cycled flat. At 80% depth of discharge only that share of the
        // nameplate is ever moved in a day, so every energy figure here is worked out
        // against the usable share and the nameplate is kept only for the label.
        const PLOT_BATT_DOD = 0.80;

        function plotBatterySettings() {
            const kwhEl = document.getElementById('plotBattKwhInput');
            const kwEl = document.getElementById('plotBattKwInput');
            const kwh = parseFloat(kwhEl && kwhEl.value);
            const kw = parseFloat(kwEl && kwEl.value);
            const nameplate = (isFinite(kwh) && kwh > 0) ? kwh : 0;
            return {
                kwh: nameplate,
                usable: nameplate * PLOT_BATT_DOD,
                dod: PLOT_BATT_DOD,
                kw: (isFinite(kw) && kw > 0) ? kw : Infinity
            };
        }

        function plotBatteryRun(sun, after, step, cap, rate, target, soc0, budget) {
            let soc = soc0 || 0;
            let fromClip = 0, fromAc = 0, served = 0, spillClip = 0, spillAc = 0, peak = 0;
            // One cycle a day. Capacity alone would let the pack fill, empty and fill
            // again inside a single day, which is more use than a warranty is written
            // for, so the day's throughput is held to the usable capacity in each
            // direction rather than just the instantaneous state of charge.
            let inLeft = isFinite(budget) ? budget : Infinity;
            let outLeft = isFinite(budget) ? budget : Infinity;
            const chargeAc = [], chargeClip = [], net = [];
            for (let i = 0; i < after.length; i++) {
                const a = after[i];
                if (a == null) { chargeAc.push(null); chargeClip.push(null); net.push(null); continue; }
                const clipped = sun.clip[i] || 0;
                let room = (cap - soc) / step;

                // The clipped DC goes in first. It never reached the grid, so taking it
                // costs nothing, and there is no case where the AC surplus should be
                // preferred over it.
                const cC = Math.max(0, Math.min(clipped, rate, room, inLeft / step));
                room -= cC;
                inLeft -= cC * step;
                const surplus = Math.max(0, -a);
                const cA = Math.max(0, Math.min(surplus, rate - cC, room, inLeft / step));
                inLeft -= cA * step;
                soc += (cC + cA) * step;
                fromClip += cC * step;
                fromAc += cA * step;
                spillClip += (clipped - cC) * step;
                spillAc += (surplus - cA) * step;

                let d = 0;
                if (a > target) {
                    // Discharge leaves through the same inverter the array feeds, so the
                    // two share its rating. While the array is clipping there is no AC
                    // headroom left and the battery cannot help, which falls out of this
                    // on its own rather than needing a rule of its own.
                    const headroom = sun.invLimit > 0
                        ? Math.max(0, sun.invLimit - (sun.ac[i] || 0))
                        : Infinity;
                    d = Math.max(0, Math.min(a - target, rate, headroom, soc / step, outLeft / step));
                    soc -= d * step;
                    outLeft -= d * step;
                    served += d * step;
                }

                chargeAc.push(cA);
                chargeClip.push(cC);
                const n = a + cA - d;
                net.push(n);
                if (n > peak) peak = n;
            }
            return {
                chargeAc, chargeClip, net, served, peak, socEnd: soc,
                fromClip, fromAc, spillClip, spillAc,
                stored: fromClip + fromAc,
                spill: spillClip + spillAc
            };
        }

        // An averaged day is the same day repeated, so the battery does not start it
        // empty - it starts it holding whatever the day before left. Running the profile
        // a few times over and carrying SOC across the boundary settles that, and without
        // it the morning peak can never be shaved: the battery has not charged yet, so the
        // target is pinned by a peak that in reality yesterday's surplus would have cut.
        function plotBatteryCycle(sun, after, step, cap, rate, target, budget) {
            let soc = 0, run = null;
            for (let pass = 0; pass < 6; pass++) {
                run = plotBatteryRun(sun, after, step, cap, rate, target, soc, budget);
                if (Math.abs(run.socEnd - soc) < cap * 1e-6) break;
                soc = run.socEnd;
            }
            return run;
        }

        // The lowest flat peak this battery can actually hold all day. Raising the target
        // only ever makes it easier to hold, so the feasible targets form one range and a
        // bisection lands on its floor.
        function plotBatterySim(solarY) {
            const batt = plotBatterySettings();
            const load = plotLoadReference();
            const step = plotStepHours();
            const sun = plotSolarCurves();
            if (!batt.kwh || !load || !sun || step <= 0) return null;

            const after = plotAfterSolar(sun.ac);
            if (!after || !after.some(v => v != null)) return null;

            const days = plotDayCount();
            // The profile may span several days, so the allowance covers all of them.
            const budget = batt.usable * days;

            const rawPeak = after.reduce((m, v) => (v != null && v > m ? v : m), 0);
            let lo = 0, hi = rawPeak;
            for (let k = 0; k < 44; k++) {
                const mid = (lo + hi) / 2;
                if (plotBatteryCycle(sun, after, step, batt.usable, batt.kw, mid, budget).peak <= mid + 1e-6) hi = mid;
                else lo = mid;
            }
            const run = plotBatteryCycle(sun, after, step, batt.usable, batt.kw, hi, budget);
            return {
                batt, sun, after, step, days,
                cyclesDay: batt.usable > 0 ? (run.served / days) / batt.usable : 0,
                target: hi,
                peakBefore: rawPeak,
                peakAfter: run.peak