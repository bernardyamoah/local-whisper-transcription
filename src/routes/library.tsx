import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useStudio } from "../components/studio-context";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  HistoryRow,
  PageHeader,
  type ConfirmRequest,
} from "../components/ui";
import { api, bytes, time } from "../lib/api";
import type { Job, Media } from "../lib/types";

export const Route = createFileRoute("/library")({ component: Library });

function Library() {
  const { notice } = useStudio();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [history, retained] = await Promise.all([
        api<{ items: Job[]; total: number }>(
          `/jobs?q=${encodeURIComponent(query)}&sort=${sort}&offset=${offset}`,
        ),
        api<Media[]>("/media"),
      ]);
      setJobs(history.items);
      setTotal(history.total);
      setMedia(retained);
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }, [notice, offset, query, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function close(accepted: boolean) {
    setConfirm(null);
    if (!accepted || !removeId) return;
    try {
      await api(`/media/${removeId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      setRemoveId(null);
      await refresh();
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader
        title="Library"
        action={
          <Link className="button" to="/">
            New transcription ＋
          </Link>
        }
      />
      <div className="toolbar">
        <label className="visually-hidden" htmlFor="history-search">
          Search your library
        </label>
        <input
          id="history-search"
          type="search"
          placeholder="Find a title or recording…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
          }}
        />
        <label className="visually-hidden" htmlFor="history-sort">
          Sort library
        </label>
        <select
          id="history-sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setOffset(0);
          }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">Title</option>
          <option value="duration">Duration</option>
          <option value="status">Status</option>
        </select>
      </div>
      {jobs.length ? (
        jobs.map((job) => <HistoryRow key={job.id} job={job} />)
      ) : (
        <EmptyState
          title={query ? "No results" : "No transcriptions yet"}
          action={
            <Link className="button" to="/">
              New transcription ＋
            </Link>
          }
        />
      )}
      {total > 50 && (
        <div className="pagination">
          <Button
            className="secondary small"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            ← Previous
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + 50, total)} of {total}
          </span>
          <Button
            className="secondary small"
            disabled={offset + 50 >= total}
            onClick={() => setOffset(offset + 50)}
          >
            Next →
          </Button>
        </div>
      )}
      {!!media.length && (
        <div className="retained">
          <div className="section-heading">
            <h2>Retained recordings</h2>
          </div>
          {media.map((item) => (
            <div className="history-row" key={item.id}>
              <span className="history-copy">
                <strong>{item.name}</strong>
                <small>
                  {time(item.duration)} · {bytes(item.size)}
                </small>
              </span>
              <Button
                className="secondary small"
                onClick={() => {
                  sessionStorage.setItem("reuse-media", JSON.stringify(item));
                  void navigate({ to: "/" });
                }}
              >
                Transcribe
              </Button>
              <Button
                className="secondary small danger-text"
                onClick={() => {
                  setRemoveId(item.id);
                  setConfirm({
                    title: "Delete this retained recording?",
                    description:
                      "The original file will be permanently removed.",
                    label: "Delete recording",
                    danger: true,
                  });
                }}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        request={confirm}
        onClose={(accepted) => void close(accepted)}
      />
    </section>
  );
}
