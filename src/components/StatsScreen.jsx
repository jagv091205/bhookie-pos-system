import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";

const STAT_TYPES = ["Eat In", "Take Away", "Drive Thru", "Delivery"];

export default function StatsScreen({ onBack }) {
  const [kotData, setKotData] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "KOT"), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => doc.data());
      setKotData(data);
    });
    return () => unsub();
  }, []);

  const normalizeType = (type) => {
    const val = (type || "").toLowerCase();
    if (val.includes("take")) return "Take Away";
    if (val.includes("dine") || val.includes("eat")) return "Eat In";
    if (val.includes("drive")) return "Drive Thru";
    if (val.includes("deliv")) return "Delivery";
    return "Other";
  };

  const getStats = (start, end) => {
    const filtered = kotData.filter((k) => {
      const d = k.date?.seconds ? k.date.seconds * 1000 : null;
      if (!d) return false;
      return d >= start.getTime() && d <= end.getTime();
    });

    const stats = {};

    STAT_TYPES.forEach((type) => {
      const relevant = filtered.filter(
        (k) => normalizeType(k.orderType) === type
      );

      const total = relevant.length;
      const totalTime = relevant.reduce((sum, k) => {
        const diff = Date.now() - (k.date?.seconds * 1000 || 0);
        return sum + diff;
      }, 0);

      const under2min = relevant.filter(
        (k) => (Date.now() - (k.date?.seconds * 1000 || 0)) / 1000 <= 120
      ).length;

      stats[type] = {
        total,
        avgTime:
          total === 0 ? 0 : Math.round(totalTime / total / 1000), // in seconds
        under120: total === 0 ? 0 : Math.round((under2min / total) * 100),
      };
    });

    return stats;
  };

  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const lunchStart = new Date(); lunchStart.setHours(12, 0, 0, 0);
  const lunchEnd = new Date(); lunchEnd.setHours(14, 0, 0, 0);
  const dinnerStart = new Date(); dinnerStart.setHours(17, 0, 0, 0);
  const dinnerEnd = new Date(); dinnerEnd.setHours(20, 0, 0, 0);
  const mins15ago = new Date(now.getTime() - 15 * 60 * 1000);

  const data = {
    "Last 15 Min": getStats(mins15ago, now),
    "Total Today": getStats(todayStart, now),
    "Lunch Peak (12–14)": getStats(lunchStart, lunchEnd),
    "Dinner Peak (17–20)": getStats(dinnerStart, dinnerEnd),
  };

  return (
    <div className="bg-white min-h-screen p-6 text-black font-sans">
      <div className="flex justify-between items-center mb-6 border-b pb-3">
        <h1 className="text-3xl font-extrabold text-red-700 tracking-tight uppercase">
          Shift Statistics
        </h1>
        <button
          onClick={onBack}
          className="bg-black text-white font-semibold px-4 py-2 rounded"
        >
          🔙 Back to KOT Display
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {Object.entries(data).map(([label, stats], idx) => (
          <div
            key={idx}
            className="border border-gray-300 shadow-md rounded-lg overflow-hidden"
          >
            <div className="bg-red-700 text-white px-4 py-2 font-semibold text-lg">
              {label}
            </div>
            <table className="w-full text-sm text-center">
              <thead className="bg-gray-100 text-gray-800">
                <tr>
                  <th className="py-2 border">Order Type</th>
                  <th className="py-2 border"># Orders</th>
                  <th className="py-2 border">Avg Pack Time</th>
                  <th className="py-2 border">% Under 2 min</th>
                </tr>
              </thead>
              <tbody>
                {STAT_TYPES.map((type) => (
                  <tr key={type} className="border-t">
                    <td className="py-2 border font-medium">{type}</td>
                    <td className="py-2 border">{stats[type]?.total || 0}</td>
                    <td className="py-2 border text-blue-800 font-semibold">
                      {formatTime(stats[type]?.avgTime || 0)}
                    </td>
                    <td className="py-2 border text-green-700 font-semibold">
                      {stats[type]?.under120 || 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${pad(mins)}m ${pad(secs)}s`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}
