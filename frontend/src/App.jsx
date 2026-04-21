import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Customers from "./pages/Customers.jsx";
import CreateOrder from "./pages/CreateOrder.jsx";
import WorkInProgress from "./pages/WorkInProgress.jsx";
import CompletedWorks from "./pages/CompletedWorks.jsx";
import Admin from "./pages/Admin.jsx";
import { getToken, getUser } from "./api.js";
import OrderDetail from "./pages/OrderDetail.jsx";
import Decals from "./pages/Decals.jsx";
import PrintedDecals from "./pages/PrintedDecals.jsx";


function Protected({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }) {
  const user = getUser();
  if (user?.role !== "ADMIN") return <Navigate to="/work-in-progress" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/decals" element={<Decals />} />
      <Route path="/printed-decals" element={<PrintedDecals />} />
      <Route path="/" element={<Navigate to="/decals" replace />} />

      <Route path="/create-order" element={<Protected><CreateOrder /></Protected>} />
      <Route path="/orders/:id" element={<OrderDetail />} />

      <Route path="/work-in-progress" element={<Protected><WorkInProgress /></Protected>} />
      <Route path="/completed-works" element={<Protected><CompletedWorks /></Protected>} />
            {/* aliases so old links still work */}
      <Route path="/wip" element={<Protected><WorkInProgress /></Protected>} />
      <Route path="/completed" element={<Protected><CompletedWorks /></Protected>} />

      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/admin" element={<Protected><AdminOnly><Admin /></AdminOnly></Protected>} />

      <Route path="*" element={<Navigate to="/work-in-progress" replace />} />
    </Routes>
  );
}
