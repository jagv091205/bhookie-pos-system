import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import StatsScreen from "./StatsScreen";
import { collection, onSnapshot, orderBy, query, where, Timestamp, doc, updateDoc } from "firebase/firestore";

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [clearedOrders, setClearedOrders] = useState([]);
  const [recentlyCleared, setRecentlyCleared] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [error, setError] = useState(null);

  // Fetch orders and initialize clearedOrders from Firestore
  useEffect(() => {
    // Load cached orders for offline support
    const cachedOrders = JSON.parse(localStorage.getItem("cachedOrders") || "[]");
    if (cachedOrders.length > 0) setOrders(cachedOrders);

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

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          orderType: doc.data().orderType === "takeaway" ? "takeout" : doc.data().orderType || "dine-in",
          status: doc.data().status || "Pending",
        }));
        setOrders(data);
        const cleared = data
          .filter((order) => order.status === "Complete")
          .map((order) => order.id);
        setClearedOrders(cleared);
        localStorage.setItem("cachedOrders", JSON.stringify(data));
        setError(null);
      },
      (err) => {
        setError("Running in offline mode. Displaying cached orders.");
        console.error(err);
      }
    );

    return () => unsub();
  }, []);

  // Update current time for timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate elapsed time (stop timer for completed orders)
  const getElapsedTime = (order) => {
    if (!order.date?.seconds) return 0;
    if (order.status === "Complete" && order.completedAt?.seconds) {
      // Use completedAt for completed orders (timer stops)
      return Math.floor((order.completedAt.seconds - order.date.seconds));
    }
    // Use currentTime for pending orders (timer runs)
    const elapsedMs = currentTime - order.date.seconds * 1000;
    // If Firestore stores date in UTC, uncomment the following line:
    // const elapsedMs = currentTime - (order.date.seconds * 1000 + 5.5 * 60 * 60 * 1000);
    return Math.floor(elapsedMs / 1000);
  };

  // Handle clearing an order
  const handleClearOrder = async (orderId) => {
    try {
      await updateDoc(doc(db, "KOT", orderId), {
        status: "Complete",
        completedAt: Timestamp.now(),
      });
      setClearedOrders((prev) => [...prev, orderId]);
      setRecentlyCleared((prev) => [orderId, ...prev.slice(0, 9)]);
    } catch (err) {
      console.error("Failed to clear order:", err);
      setClearedOrders((prev) => [...prev, orderId]);
      setRecentlyCleared((prev) => [orderId, ...prev.slice(0, 9)]);
    }
  };

  // Handle undoing a clear
  const handleUndo = async () => {
    const lastId = recentlyCleared[0];
    try {
      await updateDoc(doc(db, "KOT", lastId), {
        status: "Pending",
        completedAt: null,
      });
      setClearedOrders((prev) => prev.filter((id) => id !== lastId));
      setRecentlyCleared((prev) => prev.slice(1));
    } catch (err) {
      console.error("Failed to undo clear:", err);
      setClearedOrders((prev) => prev.filter((id) => id !== lastId));
      setRecentlyCleared((prev) => prev.slice(1));
    }
  };

  // Calculate average time (using stopped timers for completed orders)
  const totalAvgTime = () => {
    const times = relevantOrders.map((order) => getElapsedTime(order));
    const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
    const mins = Math.floor(avg / 60);
    const secs = Math.floor(avg % 60);
    return `${mins}m ${secs}s`;
  };

  // Filter orders based on status
  const relevantOrders = showCleared
    ? orders.filter((order) => order.status === "Complete")
    : orders.filter((order) => order.status !== "Complete");

  const ordersPerPage = 5;
  const totalPages = Math.ceil(relevantOrders.length / ordersPerPage);
  const pagedOrders = relevantOrders.slice(
    currentPage * ordersPerPage,
    currentPage * ordersPerPage + ordersPerPage
  );

  if (showStats) return <StatsScreen onBack={() => setShowStats(false)} clearedOrders={clearedOrders} />;

  return (
    <div className="p-4 bg-gray-100 text-black min-h-screen font-sans">
      {error && (
        <div className="bg-red-500 text-white p-2 mb-4 rounded">
          {error}
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <div className="text-lg font-bold">Kitchen Orders</div>
        <div className="flex items-center gap-6">
          <div className="text-sm font-semibold">
            Total Orders: <span className="text-xl">{relevantOrders.length}</span>
          </div>
          <div className="text-sm font-semibold">
            Avg Time: <span className="text-xl">{totalAvgTime()}</span>
          </div>
          <button
            onClick={() => setShowStats(true)}
            className="bg-black text-white px-4 py-2 font-bold rounded hover:bg-gray-800 transition-colors"
          >
            📊 Stats
          </button>
          <button
            onClick={() => navigate(-1)}
            className="bg-black text-white px-4 py-2 font-bold rounded hover:bg-gray-800 transition-colors"
          >
            🔙 Back
          </button>
        </div>
      </div>

      {/* Order Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {pagedOrders.map((order) => (
          <div
            key={order.id}
            className={`bg-white rounded-xl border shadow-md p-4 min-h-[250px] ${
              getElapsedTime(order) > 600 && order.status !== "Complete" ? "border-red-600" : "border-gray-400"
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-red-600 font-bold text-lg">
                {(order.kot_id || order.id).slice(-3)}
              </h2>
              <span className="text-sm font-semibold text-gray-700">
                {order.orderType.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              ⏱ {formatTime(getElapsedTime(order))}
            </p>
            <div className="text-sm font-semibold mb-2">
              Status: {order.status || "Pending"}
            </div>
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
                    {item.specialRequests && (
                      <span className="block ml-4 text-red-500 text-xs font-bold">
                        Note: {item.specialRequests}
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
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
        {/* Clear Buttons */}
        <div className="flex flex-wrap gap-2">
          {pagedOrders.map((order, index) => (
            <button
              key={order.id}
              onClick={() => handleClearOrder(order.id)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded transition-colors"
            >
              ❌ Clear {index + 1}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="bg-gray-800 text-white px-4 py-2 rounded disabled:bg-gray-400 transition-colors"
          >
            ⏮ Prev
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="bg-gray-800 text-white px-4 py-2 rounded disabled:bg-gray-400 transition-colors"
          >
            Next ⏭
          </button>
        </div>

        {/* Undo & View Cleared */}
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={!recentlyCleared.length}
            className="bg-yellow-500 text-black font-bold px-4 py-2 rounded disabled:bg-yellow-300 transition-colors"
          >
            🔄 Bring Back
          </button>
          <button
            onClick={() => setShowCleared((prev) => !prev)}
            className="bg-blue-600 text-white font-bold px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            👁 {showCleared ? "Hide Cleared" : "View Cleared"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}