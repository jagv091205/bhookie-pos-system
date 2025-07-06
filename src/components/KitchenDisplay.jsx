import React, { useEffect, useState } from "react";
import { db } from "../firebase/config";
import StatsScreen from "./StatsScreen";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";

const categories = ["All", "Bites", "Burgers", "Drinks", "Steady"];

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("All");
  const [clearedOrders, setClearedOrders] = useState([]);
  const [recentlyCleared, setRecentlyCleared] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [timers, setTimers] = useState({});

  useEffect(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const q = query(
      collection(db, "KOT"),
      where("date", ">=", Timestamp.fromDate(startOfToday)),
      where("date", "<", Timestamp.fromDate(startOfTomorrow)),
      orderBy("date", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setOrders(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        const updated = { ...prev };
        for (let id in updated) {
          updated[id] += 1;
        }
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const newTimers = {};
    orders.forEach((order) => {
      if (!timers[order.id]) {
        newTimers[order.id] = 0;
      }
    });
    setTimers((prev) => ({ ...newTimers, ...prev }));
  }, [orders]);

  const relevantOrders = showCleared
    ? orders.filter((order) => clearedOrders.includes(order.id))
    : orders.filter((order) => {
        if (clearedOrders.includes(order.id)) return false;
        if (activeTab === "All") return true;
        return order.items?.some((item) =>
          item.name?.toLowerCase().includes(activeTab.toLowerCase())
        );
      });

  const ordersPerPage = 5;
  const totalPages = Math.ceil(relevantOrders.length / ordersPerPage);
  const pagedOrders = relevantOrders.slice(
    currentPage * ordersPerPage,
    currentPage * ordersPerPage + ordersPerPage
  );

  const handleClearOrder = (orderId) => {
    setClearedOrders((prev) => [...prev, orderId]);
    setRecentlyCleared((prev) => [orderId, ...prev.slice(0, 9)]);
  };

  const handleUndo = () => {
    const lastId = recentlyCleared[0];
    setClearedOrders((prev) => prev.filter((id) => id !== lastId));
    setRecentlyCleared((prev) => prev.slice(1));
  };

  const totalAvgTime = () => {
    const times = relevantOrders.map((o) =>
      timers[o.id] ? timers[o.id] : 0
    );
    const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
    const mins = Math.floor(avg / 60);
    const secs = Math.floor(avg % 60);
    return `${mins}m ${secs}s`;
  };

  if (showStats) return <StatsScreen onBack={() => setShowStats(false)} />;

  return (
    <div className="p-4 bg-[#f3eaff] text-black min-h-screen font-sans">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <div className="flex gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveTab(cat);
                setCurrentPage(0);
              }}
              className={`px-4 py-2 font-bold rounded text-sm ${
                activeTab === cat
                  ? "bg-red-600 text-white"
                  : "bg-white text-black border border-red-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-sm font-semibold">
            Total Orders: <span className="text-xl">{relevantOrders.length}</span>
          </div>
          <div className="text-sm font-semibold">
            Avg Time: <span className="text-xl">{totalAvgTime()}</span>
          </div>
          <button
            onClick={() => setShowStats(true)}
            className="bg-black text-white px-4 py-2 font-bold rounded"
          >
            📊 Stats
          </button>
        </div>
      </div>

      {/* Order Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {pagedOrders.map((order) => (
          <div
            key={order.id}
            className="bg-white rounded-xl border border-gray-400 shadow-md p-3 min-h-[250px]"
          >
            <h2 className="text-red-600 font-bold text-lg mb-1">
              {(order.kot_id || order.id).slice(-3)}
            </h2>
            <p className="text-sm text-gray-700 mb-2">
              ⏱ {timers[order.id] ? `${Math.floor(timers[order.id] / 60)}m ${timers[order.id] % 60}s` : "0m 0s"}
            </p>
            <ul className="text-sm font-semibold space-y-2">
              {order.items?.map((item, idx) => {
                const [mainName, extras] = item.name.split("(");
                return (
                  <li key={idx} className="leading-tight">
                    <span className="block text-base text-black">
                      <span className="font-medium">{item.quantity}x {mainName.trim()}</span>
                    </span>
                    {extras && (
                      <span className="block ml-4 text-gray-600 text-xs">
                        {extras.replace(")", "")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-between mt-2">
        {/* Clear Buttons */}
        <div className="flex gap-2">
          {pagedOrders.map((order, index) => (
            <button
              key={order.id}
              onClick={() => handleClearOrder(order.id)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded"
            >
              ❌ {index + 1}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            ⏮ Prev
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            Next ⏭
          </button>
        </div>

        {/* Undo & View Cleared */}
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            className="bg-yellow-500 text-black font-bold px-4 py-2 rounded"
          >
            🔄 Bring Back
          </button>
          <button
            onClick={() => setShowCleared((prev) => !prev)}
            className="bg-blue-600 text-white font-bold px-4 py-2 rounded"
          >
            👁 View Cleared
          </button>
        </div>
      </div>
    </div>
  );
}
