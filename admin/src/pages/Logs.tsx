import { useEffect, useState } from 'react';
import API from '../api/client';

interface Log {
  id: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  error?: string;
  createdAt: string;
  token?: { user?: { email: string } };
  key?: { name: string };
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    API.get('/stats/logs').then((res) => setLogs(res.data));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Request Logs</h1>
      <table className="w-full bg-white rounded shadow">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Time</th>
            <th className="p-2 text-left">Endpoint</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Latency (ms)</th>
            <th className="p-2 text-left">User</th>
            <th className="p-2 text-left">Key</th>
            <th className="p-2 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="p-2">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="p-2">{l.endpoint}</td>
              <td className={`p-2 ${l.status >= 400 ? 'text-red-500' : 'text-green-500'}`}>{l.status}</td>
              <td className="p-2">{l.latencyMs}</td>
              <td className="p-2">{l.token?.user?.email || '-'}</td>
              <td className="p-2">{l.key?.name || '-'}</td>
              <td className="p-2 text-red-400">{l.error || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
