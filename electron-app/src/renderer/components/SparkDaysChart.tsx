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
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SparkDaysChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

const SparkDaysChart: React.FC<SparkDaysChartProps> = ({ labels, datasets }) => {
  const colors = ['#e94560', '#60a5fa', '#22c55e', '#eab308', '#a855f7', '#ec4899'];

  const chartData = {
    labels,
    datasets: datasets.map((ds, i) => ({
      ...ds,
      borderColor: ds.borderColor || colors[i % colors.length],
      backgroundColor: ds.backgroundColor || colors[i % colors.length] + '20',
      tension: 0.3,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 6,
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
      legend: {
        labels: {
          color: '#94a3b8',
          font: { size: 12 },
        },
      },
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
    <div className="h-64">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default SparkDaysChart;
