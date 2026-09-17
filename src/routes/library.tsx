import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { buttonVariants } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { Input } from "@/components/ui/input";
import { useStudio } from "../components/studio-context";
import { Button, EmptyState, HistoryRow, PageHeader } from "../components/ui";
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

  async function remove(id: string) {
    try {
      await api(`/media/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
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
          <Link className={buttonVariants()} to="/">
            New transcription
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          </Link>
        }
      />
      <div className="toolbar">
        <label className="visually-hidden" htmlFor="history-search">
          Search your library
        </label>
        <Input
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
        <AppSelect
          id="history-sort"
          value={sort}
          onValueChange={(value) => {
            setSort(value);
            setOffset(0);
          }}
          options={[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "title", label: "Title" },
            { value: "duration", label: "Duration" },
            { value: "status", label: "Status" },
          ]}
        />
      </div>
      {jobs.length ? (
        jobs.map((job) => <HistoryRow key={job.id} job={job} />)
      ) : (
        <EmptyState
          title={query ? "No results" : "No transcriptions yet"}
          action={
            <Link className={buttonVariants()} to="/">
              New transcription
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
            </Link>
          }
        />
      )}
      {total > 50 && (
        <div className="pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={1.8} />
            Previous
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + 50, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + 50 >= total}
            onClick={() => setOffset(offset + 50)}
          >
            Next
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              size={15}
              strokeWidth={1.8}
            />
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
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStorage.setItem("reuse-media", JSON.stringify(item));
                  void navigate({ to: "/" });
                }}
              >
                Transcribe
              </Button>
              <DeleteButton
                className="model-delete"
                onConfirm={() => void remove(item.id)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
