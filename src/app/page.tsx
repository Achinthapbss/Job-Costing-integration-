import { SyncDashboard } from "@/components/sync-dashboard";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <h1>SAP Integration Job Costing</h1>
        </section>

        <SyncDashboard />
      </div>
    </main>
  );
}
