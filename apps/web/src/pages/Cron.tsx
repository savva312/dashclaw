import { useState } from "react";
import { useAppState } from "../context";
import { executeRpc, fetchCronRuns } from "../api";

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
    await executeRpc("cron.run", { jobId });
    await refresh();
  };

  return (
    <>
      <h1 className="page-title">Cron and Automation</h1>
      <div className="grid grid-2">
        <div className="card">
          <h3>Jobs ({jobs.length})</h3>
          {jobs.length === 0 ? (
            <p className="empty">No cron jobs</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Schedule</th><th>Enabled</th><th></th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.name ?? j.id}</td>
                    <td className="mono">{j.schedule ?? "—"}</td>
                    <td><span className={`badge ${j.enabled ? "ok" : "neutral"}`}>{j.enabled ? "yes" : "no"}</span></td>
                    <td>
                      <button className="btn" type="button" onClick={() => void loadRuns(j.id)}>Runs</button>
                      <button className="btn" type="button" style={{ marginLeft: 8 }} onClick={() => void rerun(j.id)}>Run now</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Run History {selectedJob && `· ${selectedJob}`}</h3>
          {!runs ? (
            <p className="empty">Select a job to view runs</p>
          ) : (
            <pre className="mono" style={{ overflow: "auto", maxHeight: "60vh", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(runs, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
