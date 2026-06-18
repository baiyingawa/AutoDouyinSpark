import React from 'react';
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

interface SparkDaysChartProps {
  labels: string[];
  avatars?: Record<string, string>;
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

const SparkDaysChart: React.FC<SparkDaysChartProps> = ({ labels, datasets, avatars }) => {
  const colors = ['#e94560', '#60a5fa', '#22c55e', '#eab308', '#a855f7', '#ec4899'];

  const chartData = {
    labels,
    datasets: datasets.map((ds, i) => ({
      ...ds,
      borderColor: ds.borderColor || colors[i % colors.length],
      backgroundColor: ds.backgroundColor || colors[i % colors.length] + '20',
      tension: 0.3,
      fill: false,
      pointRadius: 4,
      pointHoverRadius: 7,
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
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default SparkDaysChart;
