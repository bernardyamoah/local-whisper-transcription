import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Search01Icon,
  FileAudioIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { buttonVariants } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
      notice({
        title: "Recording deleted",
        description: "The retained source recording was removed from this Mac.",
        kind: "info",
      });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  return (
    <section className="library-page">
      <PageHeader
        title="Library"
        action={
          <Link className={buttonVariants()} to="/">
            New transcription
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          </Link>
        }
      />
      <div className="library-shelf">
        <div className="toolbar">
          <label className="visually-hidden" htmlFor="history-search">
            Search your library
          </label>
          <InputGroup className="library-search">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} size={18} aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="history-search"
              type="search"
              placeholder="Search titles, transcripts, speakers"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
          </InputGroup>
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
        <div className="library-section-heading">
          <h2>{query ? "Search results" : "Transcriptions"}</h2>
          <span role="status">
            {total} {total === 1 ? "recording" : "recordings"}
          </span>
        </div>
        {jobs.length ? (
          <div className="library-grid">
            {jobs.map((job) => (
              <HistoryRow key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={query ? "No results" : "No transcriptions yet"}
            action={
              query ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setOffset(0);
                  }}
                >
                  Clear search
                </Button>
              ) : (
                <Link className={buttonVariants()} to="/">
                  New transcription
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
                </Link>
              )
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
              <HugeiconsIcon
                icon={ArrowLeft02Icon}
                size={15}
                strokeWidth={1.8}
              />
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
      </div>
      {!!media.length && (
        <div className="retained">
          <div className="section-heading">
            <h2>Source recordings</h2>
            <span className="library-count">{media.length}</span>
          </div>
          <div className="source-recordings">
            {media.map((item) => (
              <div className="history-row" key={item.id}>
                <span className="file-icon" aria-hidden="true">
                  <HugeiconsIcon
                    icon={FileAudioIcon}
                    size={20}
                    strokeWidth={1.6}
                  />
                </span>
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
        </div>
      )}
    </section>
  );
}
