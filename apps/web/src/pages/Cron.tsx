import { useState } from "react";
import { useAppState } from "../context";
import { executeRpc, fetchCronRuns, requestConfirm } from "../api";
import { safeRawPreview } from "../validation";

export function CronPage() {
  const { snapshot, refresh } = useAppState();
  const jobs = snapshot?.cronJobs ?? [];
  const [runs, setRuns] = useState<unknown>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const loadRuns = async (jobId: string) => {
    setSelectedJob(jobId);
    try {
      setRuns(await fetchCronRuns(jobId));
    } catch {
      setRuns({ error: "Failed to load runs" });
    }
  };

  const rerun = async (jobId: string) => {
    const params = { jobId };
    const confirmed = window.confirm(`Run cron job ${jobId} now?`);
    if (!confirmed) return;
    const { confirmToken } = await requestConfirm("cron.run", params);
    await executeRpc("cron.run", params, confirmToken);
    await refresh();
  };

  return (
    <div className="page-shell cron-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cron and Automation</h1>
          <p className="page-subtitle">Scheduled jobs, manual reruns, and recent execution history.</p>
        </div>
      </div>

      <div className="grid grid-2 cron-grid">
        <div className="card">
          <h3>Jobs ({jobs.length})</h3>
          {jobs.length === 0 ? (
            <p className="empty">No cron jobs</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Schedule</th><th>Enabled</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="text-clip">{j.name ?? j.id}</td>
                    <td className="mono text-clip">{j.schedule ?? "—"}</td>
                    <td><span className={`badge ${j.enabled ? "ok" : "neutral"}`}>{j.enabled ? "yes" : "no"}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn" type="button" onClick={() => void loadRuns(j.id)}>Runs</button>
                        <button className="btn" type="button" onClick={() => void rerun(j.id)}>Run now</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card cron-runs-card">
          <h3>Run History {selectedJob ? `· ${selectedJob}` : ""}</h3>
          {!runs ? (
            <p className="empty">Select a job to view runs</p>
          ) : (
            <pre className="mono code-preview">{safeRawPreview(runs)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
