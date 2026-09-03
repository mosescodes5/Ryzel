"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./home.module.css";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a tracking number to continue.");
      return;
    }
    setError("");
    router.push(`/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Track your shipment</h1>
        <p className={styles.subtitle}>Enter your tracking number to see real-time delivery status.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            placeholder="Enter tracking number"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button className={styles.button} type="submit">
            Track
          </button>
        </form>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
