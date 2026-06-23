import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

function useD3(render, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    render(svg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const C = {
  primary: 'oklch(0.62 0.17 35)',
  amber: 'oklch(0.82 0.13 75)',
  teal: 'oklch(0.66 0.10 195)',
  green: 'oklch(0.72 0.18 150)',
  red: 'oklch(0.60 0.22 25)',
  muted: 'oklch(0.45 0.03 30)',
};

// Horizontal bar chart: data = [{ label, value }]
export function BarChart({ data, height = 220, color = C.teal }) {
  const ref = useD3((svg) => {
    const W = 360, H = height, m = { top: 8, right: 40, bottom: 8, left: 110 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const max = d3.max(data, (d) => d.value) || 1;
    const x = d3.scaleLinear().domain([0, max]).range([m.left, W - m.right]);
    const y = d3.scaleBand().domain(data.map((d) => d.label)).range([m.top, H - m.bottom]).padding(0.25);
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', m.left).attr('y', (d) => y(d.label)).attr('height', y.bandwidth())
      .attr('width', (d) => x(d.value) - m.left).attr('rx', 5).attr('fill', color);
    svg.append('g').selectAll('text.lbl').data(data).join('text')
      .attr('x', m.left - 8).attr('y', (d) => y(d.label) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'end').attr('font-size', 11).attr('fill', C.muted).text((d) => d.label);
    svg.append('g').selectAll('text.val').data(data).join('text')
      .attr('x', (d) => x(d.value) + 5).attr('y', (d) => y(d.label) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('font-size', 11).attr('fill', C.muted).text((d) => d.value);
  }, [JSON.stringify(data), height, color]);
  return <svg ref={ref} />;
}

// Donut chart: data = [{ label, value, color }]
export function DonutChart({ data, height = 220 }) {
  const ref = useD3((svg) => {
    const W = 300, H = height, R = Math.min(W, H) / 2 - 10;
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);
    const total = d3.sum(data, (d) => d.value);
    const pie = d3.pie().value((d) => d.value).sort(null);
    const arc = d3.arc().innerRadius(R * 0.6).outerRadius(R);
    g.selectAll('path').data(pie(data)).join('path')
      .attr('d', arc).attr('fill', (d) => d.data.color || C.muted)
      .attr('stroke', 'var(--card)').attr('stroke-width', 2);
    g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('font-size', 22).attr('font-weight', 700).attr('fill', 'var(--foreground)').text(total);
  }, [JSON.stringify(data), height]);
  const total = data.reduce((s, d) => s + d.value, 0) || 0;
  return (
    <div>
      <svg ref={ref} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1rem', marginTop: 8 }}>
        {data.map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color || C.muted, flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{d.label}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>{d.value} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Vertical bars: data = [{ label, value, color }]
export function ColumnChart({ data, height = 220 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 0;
  const ref = useD3((svg) => {
    const W = 360, H = height, m = { top: 22, right: 12, bottom: 28, left: 32 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const max = d3.max(data, (d) => d.value) || 1;
    const x = d3.scaleBand().domain(data.map((d) => d.label)).range([m.left, W - m.right]).padding(0.3);
    const y = d3.scaleLinear().domain([0, max]).range([H - m.bottom, m.top]);
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(d.label)).attr('y', (d) => y(d.value))
      .attr('width', x.bandwidth()).attr('height', (d) => y(0) - y(d.value))
      .attr('rx', 4).attr('fill', (d) => d.color || C.primary);
    // Percentage on top of each bar.
    svg.append('g').selectAll('text.pct').data(data).join('text')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2).attr('y', (d) => y(d.value) - 6)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', 'var(--foreground)')
      .text((d) => (total ? `${Math.round((d.value / total) * 100)}%` : ''));
    svg.append('g').selectAll('text.lbl').data(data).join('text')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2).attr('y', H - 10)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', C.muted).text((d) => d.label);
  }, [JSON.stringify(data), height]);
  return (
    <div>
      <svg ref={ref} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1rem', marginTop: 8 }}>
        {data.map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color || C.primary, flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{d.label}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>{d.value} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Line chart: data = [{ x (label), y (number) }]
export function LineChart({ data, height = 220, color = C.primary }) {
  const ref = useD3((svg) => {
    const W = 480, H = height, m = { top: 14, right: 18, bottom: 28, left: 32 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    if (!data.length) return;
    const x = d3.scalePoint().domain(data.map((d) => d.x)).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - m.bottom, m.top]);
    const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y)).curve(d3.curveMonotoneX);
    svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5).attr('d', line);
    svg.append('g').selectAll('circle').data(data).join('circle')
      .attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 3.5).attr('fill', color);
    svg.append('g').selectAll('text').data(data).join('text')
      .attr('x', (d) => x(d.x)).attr('y', H - 10).attr('text-anchor', 'middle')
      .attr('font-size', 9).attr('fill', C.muted).text((d) => d.x);
  }, [JSON.stringify(data), height, color]);
  return <svg ref={ref} />;
}

// Risk heatmap (severity × probability). cells = { 'High|Medium': count, ... }
export function Heatmap({ cells, height = 220 }) {
  const ref = useD3((svg) => {
    const probs = ['Low', 'Medium', 'High'];
    const sevs = ['Critical', 'High', 'Medium', 'Low'];
    const W = 320, H = height, m = { top: 14, right: 10, bottom: 28, left: 70 };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');
    const x = d3.scaleBand().domain(probs).range([m.left, W - m.right]).padding(0.06);
    const y = d3.scaleBand().domain(sevs).range([m.top, H - m.bottom]).padding(0.06);
    const data = [];
    sevs.forEach((s) => probs.forEach((p) => data.push({ s, p, v: cells[`${s}|${p}`] || 0 })));
    const max = d3.max(data, (d) => d.v) || 1;
    const heat = d3.scaleLinear().domain([0, max]).range(['oklch(0.95 0.02 80)', 'oklch(0.60 0.22 25)']);
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(d.p)).attr('y', (d) => y(d.s)).attr('width', x.bandwidth()).attr('height', y.bandwidth())
      .attr('rx', 4).attr('fill', (d) => (d.v ? heat(d.v) : 'var(--muted)'));
    svg.append('g').selectAll('text.v').data(data).join('text')
      .attr('x', (d) => x(d.p) + x.bandwidth() / 2).attr('y', (d) => y(d.s) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 700)
      .attr('fill', (d) => (d.v > max / 2 ? '#fff' : C.muted)).text((d) => d.v || '');
    svg.append('g').selectAll('text.s').data(sevs).join('text')
      .attr('x', m.left - 6).attr('y', (d) => y(d) + y.bandwidth() / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'end').attr('font-size', 10).attr('fill', C.muted).text((d) => d);
    svg.append('g').selectAll('text.p').data(probs).join('text')
      .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', H - 10).attr('text-anchor', 'middle')
      .attr('font-size', 10).attr('fill', C.muted).text((d) => d);
  }, [JSON.stringify(cells), height]);
  return <svg ref={ref} />;
}
