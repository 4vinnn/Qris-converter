import React from "react";
import QrisDynamicConverter from "./QrisDynamicConverter";
import "./App.css"; // styling ada di sini

export default function App() {
  return (
    <div className="app-container">
      <div className="card">
        <h1>QRIS Statis → Dinamis</h1>
        <QrisDynamicConverter />
      </div>
    </div>
  );
}
