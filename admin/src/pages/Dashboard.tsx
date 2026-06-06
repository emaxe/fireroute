import { useEffect, useState } from 'react';
import API from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, errors: 0, avgLatency: 0, todayCount: 0 });

  useEffect(() => {
    API.get('/stats').then((res) => setStats(res.data));
  }, []);

  const card = (title: string, value: number | string) => (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-gray-500 text-sm">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        {card('Total Requests', stats.total)}
        {card('Errors', stats.errors)}
        {card('Avg Latency (ms)', stats.avgLatency)}
        {card('Today', stats.todayCount)}
      </div>
    </div>
  );
}
