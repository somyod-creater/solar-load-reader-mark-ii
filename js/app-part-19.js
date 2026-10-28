,
                net: run.net,
                chargeAc: run.chargeAc,
                chargeClip: run.chargeClip,
                storedDay: run.stored / days,
                servedDay: run.served / days,
                spillDay: run.spill / days,
                fromClipDay: run.fromClip / days,
                fromAcDay: run.fromAc / days,
                spillClipDay: run.spillClip / days,
                spillAcDay: run.spillAc / days
            };
        }

        // Grid is logged signed: negative while exporting. Flipping the sign puts the
        // export above the axis without losing anything — import simply becomes negative.
        // Math.abs() would fold the two directions together and make +100 and -100 look
        // like the same reading, so it is not offered.
        function plotGridFlipped() {
            const el = document.getElementById('plotGridFlip');
            return !!(el && el.checked);
        }

        function plotSeriesValues(sr) {
            if (!(sr.isGrid && plotGridFlipped())) return sr.y;
            return sr.y.map(v => (v == null ? null : -v));
        }

        // A tariff with a demand charge is written against the top of a curve, so each
        // line gets its peak marked where it happens rather than listed off to the side:
        // read against the chart, a number at the end of a legend row says nothing about
        // when the site is actually at its worst. Taken from the values as plotted, so a
        // flipped Grid marks the peak the chart shows.
        function peakOf(y) {
            if (!y) return null;
            let m = null, idx = -1;
            for (let i = 0; i < y.length; i++) {
                const v = y[i];
                if (v == null || !isFinite(v)) continue;
                if (m == null || v > m) { m = v; idx = i; }
            }
            return idx < 0 ? null : { value: m, idx };
        }

        // nth staggers the boxes up the page: several lines can peak within minutes of
        // each other and the labels would otherwise land on top of one another.
        // A marker belongs to its line, so hiding the line from the legend should take
        // the marker with it. Plotly does that for traces but not for annotations, and
        // clicking a legend entry never reaches this code, so the chart keeps a register
        // of which marker goes with which trace and re-filters on every restyle. The
        // handler is re-attached each redraw because Plotly.react replaces the bindings
        // along with the data.
        const plotPeakReg = {};

        function plotPeaksOn() {
            const el = document.getElementById('plotShowPeaks');
            return !el || el.checked;
        }

        // Labels dismissed one at a time, kept by label text so the choice survives a
        // redraw when a kWp or a battery size changes.
        const plotPeakHidden = {};

        function applyPlotPeaks(id) {
            const reg = plotPeakReg[id];
            const gd = document.getElementById(id);
            if (!reg || !gd || !gd.data) return;
            const hidden = plotPeakHidden[id] || (plotPeakHidden[id] = {});
            reg.shown = plotPeaksOn()
                ? reg.markers.filter(m => {
                    if (hidden[m.key]) return false;
                    const t = gd.data[m.idx];
                    return t && t.visible !== 'legendonly' && t.visible !== false;
                })
                : [];
            Plotly.relayout(gd, { annotations: reg.other.concat(reg.shown.map(m => m.ann)) });
        }

        // markers: [{ ann, y, key }] - y is the very array the trace was given, so the
        // trace it belongs to is found by identity rather than by a position that could
        // drift.
        function registerPlotPeaks(id, traces, markers, other) {
            const gd = document.getElementById(id);
            if (!gd) return;
            plotPeakReg[id] = {
                other: other || [],
                markers: markers.filter(Boolean).map(m => ({
                    ann: m.ann, key: m.key, idx: traces.findIndex(t => t.y === m.y)
                })).filter(m => m.idx >= 0)
            };
            applyPlotPeaks(id);
            try { gd.removeAllListeners && gd.removeAllListeners('plotly_restyle'); } catch (e) { }
            try { gd.removeAllListeners && gd.removeAllListeners('plotly_clickannotation'); } catch (e) { }
            if (!gd.on) return;
            gd.on('plotly_restyle', () => applyPlotPeaks(id));
            // Clicking the label itself drops just that label. Hiding it from the legend
            // would have taken the line with it, which is not the same request.
            //
            // The label is identified by what was clicked, not by its position in the
            // list. A draggable label reports one click twice, and by the second report
            // the first has already removed a label - so a position would land on the
            // next one along and take that out too. By identity, the repeat is a no-op.
            gd.on('plotly_clickannotation', ev => {
                const r = plotPeakReg[id];
                if (!r) return;
                const txt = ev && (ev.annotation || ev.fullAnnotation || {}).text;
                const hit = r.markers.find(m => m.ann.text === txt);
                if (!hit) return;
                const hidden = (plotPeakHidden[id] = plotPeakHidden[id] || {});
                if (hidden[hit.key]) return;
                hidden[hit.key] = true;
                applyPlotPeaks(id);
            });
        }

        function redrawPlotPeaks() {
            // Ticking the box back on is the way to get dismissed labels back.
            if (plotPeaksOn()) Object.keys(plotPeakHidden).forEach(k => { plotPeakHidden[k] = {}; });
            Object.keys(plotPeakReg).forEach(applyPlotPeaks);
        }

        function peakMarker(y, label, color, topRef) {
            const p = peakOf(y);
            if (!p || !plotData) return null;
            // The highest line's own peak sets the top of the axis, so a box hung above it
            // is drawn off the plot and never seen. Those hang below the point instead.
            const below = topRef > 0 && p.value >= topRef * 0.98;
            return {
                y, key: label, at: p.idx, below,
                ann: {
                    x: plotData.x[p.idx], y: p.value,
                    text: `${label} <b>${p.value.toFixed(1)} kW</b>`,
                    showarrow: true, arrowhead: 2, arrowsize: 1, arrowwidth: 1.5,
                    arrowcolor: color, ax: 0, ay: below ? 26 : -26,
                    captureevents: true, hovertext: 'คลิกเพื่อซ่อนป้ายนี้',
                    bgcolor: 'rgba(13, 17, 23, 0.88)', bordercolor: color, borderwidth: 1,
                    borderpad: 3, font: { color: '#E6EDF3', size: 10 }
                }
            };
        }

        // Stacking by list position pushed a lone label three rows up for no reason while
        // two peaks minutes apart still landed on top of each other. Each label is raised
        // only over the ones it would actually collide with, judged by how far apart in
        // the day the two peaks are.
        //
        // Two labels can collide from opposite sides too - one hung below a ceiling peak,
        // the other raised above a peak just under it, meeting in the middle - so every
        // nearby label counts, whichever way it points. Crowded ones are pushed out
        // sideways rather than further up, which keeps clear of the plot's top edge and
        // stops one label's arrow running through another's box.
        const PEAK_SPREAD = [[0, 26], [-90, 34], [90, 34], [-90, 64], [90, 64]];
        function layoutPeakMarkers(marks) {
            const span = (plotData && plotData.x) ? plotData.x.length : 0;
            const near = Math.max(4, Math.round(span * 0.08));
            const placed = [];
            marks.filter(Boolean).forEach(m => {
                let level = 0;
                while (placed.some(p => p.level === level && Math.abs(p.at - m.at) <= near)) level++;
                placed.push({ at: m.at, level });
                const [ax, dy] = PEAK_SPREAD[Math.min(level, PEAK_SPREAD.length - 1)];
                m.ann.ax = ax;
                m.ann.ay = m.below ? dy : -dy;
            });
            return marks.filter(Boolean);
        }

        function plotSeriesTrace(sr) {
            return {
                x: plotData.x,
                y: plotSeriesValues(sr),
                type: 'scatter',
                mode: 'lines',
                // The legend stays as the file labels it. Screenshots get shared, and a
                // "(กลับเครื่องหมาย)" tag on one series reads as noise to anyone who was
                // not here when it was ticked; the subtitle carries the convention.
                name: sr.name,
                line: { color: sr.color, width: 2 },
                // several series overlap, so the shading stays faint enough to read through
                fill: 'tozeroy',
                fillcolor: plotFillColor(sr.color, 0.12),
                connectgaps: false,           // a blank cell stays a gap, not a straight line
                customdata: plotData.slotFiles || null,
                hovertemplate: plotData.slotFiles
                    ? '%{y:.2f}  <i>(เฉลี่ยจาก %{customdata} ไฟล์)</i><extra>%{fullData.name}</extra>'
                    : undefined
            };
        }

        function plotAxisLayout(titleMain, titleSub, yTitle, annotations) {
            return {
                title: chartTitle(titleMain, titleSub),
                xaxis: Object.assign(
                    { title: { text: plotData.xName, font: { size: 13 } }, showgrid: true },
                    plotData.xIsTime ? { type: 'date' } : {}
                ),
                yaxis: { title: { text: yTitle, font: { size: 13 } }, showgrid: true, zeroline: true },
                legend: { orientation: 'v', yanchor: 'top', y: 1, xanchor: 'left', x: 1.02 },
                margin: { l: 60, r: 20, t: 60, b: 60 },
                hovermode: 'x unified',
                // always set, so Plotly.react clears the previous chart's boxes
                annotations: annotations || []
            };
        }

        function drawPlotChart() {
            const el = document.getElementById('plot-chart');
            const card2 = document.getElementById('plotChart2Card');
            if (!el) return;
            if (!plotData) {
                if (card2) card2.style.display = 'none';
                const card3 = document.getElementById('plotChart3Card');
                if (card3) card3.style.display = 'none';
                Plotly.react('plot-chart', [], {
                    xaxis: { visible: false }, yaxis: { visible: false },
                    annotations: [{
                        text: 'ยังไม่ได้อัปโหลดไฟล์', xref: 'paper', yref: 'paper',
                        x: 0.5, y: 0.5, showarrow: false, font: { size: 15 }
                    }],
                    margin: { l: 50, r: 20, t: 30, b: 50 }
                }, PLOT_CONFIG);
                return;
            }

            // Chart one is the measured day, Grid included. Chart two repeats Grid
            // beside the designed solar line, which is the pair worth reading on its own
            // scale — Grid swings negative while exporting and would otherwise set the
            // range for everything.
            const selected = plotData.series.filter(sr => sr.selected);
            const gridSeries = selected.filter(sr => sr.isGrid);
            const solarTrace = plotSolarOverlayTrace();

            const traces1 = selected.map(plotSeriesTrace);
            const top1 = traces1.reduce((m, t) => {
                const p = peakOf(t.y);
                return p && p.value > m ? p.value : m;
            }, 0);
            const marks1 = layoutPeakMarkers(traces1.map((t, i) =