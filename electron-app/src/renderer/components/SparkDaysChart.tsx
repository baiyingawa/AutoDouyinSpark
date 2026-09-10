import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const avatarImageCache = new Map<string, HTMLImageElement>();

interface AvatarPluginOptions {
  enabled?: boolean;
  avatars?: Record<string, string>;
}

// 插件必须从 Chart.js 的动态 options 读取开关。React 图表实例创建后不会
// 替换插件闭包，否则初始的 showAvatars=false 会让后续勾选永远不生效。
const avatarPointPlugin = {
  id: 'sparkAvatarPoints',
  afterDatasetsDraw(chart: any, _args: unknown, pluginOptions: AvatarPluginOptions) {
    if (!pluginOptions?.enabled) return;

    const avatars = pluginOptions.avatars || {};
    const groups = new Map<string, Array<{ x: number; y: number; label: string; color: string; index: number }>>();
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      let lastIndex = -1;
      dataset.data.forEach((value: number | null, index: number) => {
        if (value !== null && value !== undefined) lastIndex = index;
      });
      if (lastIndex < 0) return;
      const point = chart.getDatasetMeta(datasetIndex).data[lastIndex];
      if (!point) return;
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
      const group = groups.get(key) || [];
      group.push({ x: point.x, y: point.y, label: dataset.label, color: dataset.borderColor, index: group.length });
      groups.set(key, group);
    });

    const radius = 15;
    const { left, right, top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    groups.forEach((group) => group.forEach((item) => {
      const spread = (group.length - 1) * 12;
      const x = Math.max(left + radius, Math.min(right - radius, item.x + item.index * 12 - spread / 2));
      const y = Math.max(top + radius, Math.min(bottom - radius, item.y - Math.abs(item.index - (group.length - 1) / 2) * 5));
      const source = avatars[item.label];
      const image = source ? avatarImageCache.get(source) : null;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
      else {
        ctx.fillStyle = item.color;
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }));
  },
};

interface SparkDaysChartProps {
  labels: string[];
  avatars?: Record<string, string>;
  datasets: {
    label: string;
    data: Array<number | null>;
    borderColor?: string;
    backgroundColor?: string;
  }[];
  showAvatars?: boolean;
}

const SparkDaysChart: React.FC<SparkDaysChartProps> = ({ labels, datasets, avatars, showAvatars = false }) => {
  const colors = ['#e94560', '#60a5fa', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarSources = datasets.map((ds) => `${ds.label}:${avatars?.[ds.label] || ''}`).join('|');

  useEffect(() => {
    if (!showAvatars) return;
    const sources = [...new Set(datasets.map((ds) => avatars?.[ds.label]).filter(Boolean) as string[])];
    let pending = sources.length;
    if (pending === 0) return;
    sources.forEach((source) => {
      const image = avatarImageCache.get(source) || new Image();
      avatarImageCache.set(source, image);
      const complete = () => {
        pending -= 1;
        if (pending === 0) setAvatarVersion((value) => value + 1);
      };
      if (image.src && image.complete) complete();
      else {
        image.onload = complete;
        image.onerror = complete;
        image.src = source;
      }
    });
  }, [avatarSources, showAvatars]);

  const chartData = {
    labels,
    datasets: datasets.map((ds, i) => ({
      ...ds,
      borderColor: ds.borderColor || colors[i % colors.length],
      backgroundColor: ds.backgroundColor || colors[i % colors.length] + '20',
      tension: 0.3,
      fill: false,
      pointRadius: showAvatars ? 0 : 4,
      pointHoverRadius: 7,
      spanGaps: true,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    plugins: {
      legend: { display: false }, // 使用自定义图例
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#fff',
        bodyColor: '#94a3b8',
        borderColor: '#334155',
        borderWidth: 1,
      },
      sparkAvatarPoints: {
        enabled: showAvatars,
        avatars: avatars || {},
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', maxTicksLimit: 10 },
        grid: { color: '#334155' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#64748b', stepSize: 1 },
        grid: { color: '#334155' },
      },
    },
  };

  if (labels.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-gray-500 text-sm">暂无数据</p>
      </div>
    );
  }

  return (
    <div>
      {/* 自定义图例 */}
      <div className="flex flex-wrap gap-4 mb-3">
        {datasets.map((ds, i) => {
          const color = ds.borderColor || colors[i % colors.length];
          return (
            <div key={ds.label} className="flex items-center gap-1.5">
              {/* 颜色小方块 */}
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              {avatars?.[ds.label] ? (
                <img
                  src={avatars[ds.label]}
                  alt={ds.label}
                  className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 ${
                  avatars?.[ds.label] ? 'hidden' : ''
                }`}
                style={{ backgroundColor: color }}
              >
                {ds.label.charAt(0)}
              </div>
              <span
                className="text-xs"
                style={{ color: '#94a3b8' }}
              >
                {ds.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-64">
        <Line key={`${showAvatars}-${avatarSources}-${avatarVersion}`} data={chartData} options={options as any} plugins={[avatarPointPlugin]} />
      </div>
    </div>
  );
};

export default SparkDaysChart;
