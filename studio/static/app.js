const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const time = (n) => {
  n = Math.floor(n || 0);
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
};
const bytes = (n) =>
  n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`;
const date = (n) =>
  new Date(n * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const workspace = $("#workspace");
let environment,
  settings,
  imported = null,
  job = null,
  page = "",
  revision = 0;
let pending = new Map(),
  pendingTitle = null,
  saving = null,
  saveTimer,
  pollTimer,
  uploadBusy = false;
let historyOffset = 0,
  historyQuery = "",
  historySort = "newest",
  modelQuery = "",
  editUndo = [];
let matches = [],
  matchIndex = -1,
  routeGeneration = 0;

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "X-Studio-Request": "1",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Your studio is unreachable. Check that the host computer and application are running. On the host, try http://127.0.0.1:8765.",
    );
  }
  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      /* The tunnel may return HTML. */
    }
    if (response.status === 403)
      throw new Error(
        payload?.detail ||
          "Your Access session may have expired. Reload to sign in again.",
      );
    throw new Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : `The request failed (${response.status}). Check the connection and try again.`,
    );
  }
  return response.json();
}
function notice(message, error = false) {
  const el = $("#notice");
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle("error", error);
}
function safe(action) {
  return (...args) =>
    Promise.resolve()
      .then(() => action(...args))
      .catch((e) => notice(e.message, true));
}
function button(text, action, cls = "secondary", extras = "") {
  return `<button class="button ${cls}" data-action="${action}" ${extras}>${text}</button>`;
}
function heading(title, subtitle = "", aside = "") {
  return `<div class="page-heading"><div><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}</div>${aside}</div>`;
}
function languages(value) {
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  return (
    `<option value="auto">Detect automatically</option>` +
    [...environment.languages]
      .sort((a, b) => names.of(a).localeCompare(names.of(b)))
      .map(
        (code) =>
          `<option value="${code}" ${value === code ? "selected" : ""}>${escape(names.of(code))}</option>`,
      )
      .join("")
  );
}
function historyRows(items) {
  return items
    .map(
      (item) =>
        `<a class="history-row" href="#job/${item.id}"><span class="file-icon" aria-hidden="true">≋</span><span class="history-copy"><strong>${escape(item.title)}</strong><small>${time(item.duration)} · ${date(item.created)} · ${titleCase(item.preset)}${item.detected_language ? " · " + escape(item.detected_language.toUpperCase()) : ""}</small></span><span class="status ${item.state}">${titleCase(item.state)}</span><span aria-hidden="true">↗</span></a>`,
    )
    .join("");
}
async function confirmation(
  title,
  description,
  { danger = false, label = "Confirm", options = "" } = {},
) {
  const dialog = $("#confirm-dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-description").textContent = description;
  $("#dialog-options").innerHTML = options;
  $("#dialog-confirm").textContent = label;
  $("#dialog-confirm").classList.toggle("danger", danger);
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () =>
        resolve(
          dialog.returnValue === "confirm"
            ? $("input[name=scope]:checked", dialog)?.value || true
            : false,
        ),
      { once: true },
    ),
  );
}
async function renderNew() {
  workspace.innerHTML = `<section>${heading("New transcription")}
    <div class="upload-workspace"><div class="upload-panel"><div id="drop-area"></div><div class="format-strip">MP3 · WAV · M4A · AAC · FLAC · OGG · MP4 · MOV · MKV · WEBM</div>
    <div class="configuration"><div class="field"><label for="language">Recording language</label><select id="language">${languages(settings.language)}</select></div>
    <div class="field"><span class="label" id="quality-label">Quality</span><div class="quality-options" role="radiogroup" aria-labelledby="quality-label">${Object.entries(
      environment.presets,
    )
      .map(
        ([key, preset]) =>
          `<div class="quality"><input type="radio" name="quality" id="quality-${key}" value="${key}" ${settings.preset === key ? "checked" : ""}><label for="quality-${key}">${titleCase(key)}<small>${preset.memory} memory</small></label></div>`,
      )
      .join(
        "",
      )}</div></div><div class="field"><label for="model">Model</label><select id="model">${environment.models
      .filter((model) => model.installed)
      .map(
        (model) =>
          `<option value="${model.id}" ${model.id === environment.presets[settings.preset].model ? "selected" : ""}>${escape(model.name)}</option>`,
      )
      .join("")}</select></div>
    <div class="configuration-bottom"><p id="start-help" class="helper"></p>${button('Start transcription <span aria-hidden="true">↗</span>', "start", "", 'id="start-button" disabled')}</div></div></div>
    </div>
    <div class="recent"><div class="section-heading"><h2>Recent transcriptions</h2><a href="#library">Open library <span aria-hidden="true">↗</span></a></div><div id="recent-list"><p class="empty-inline">Loading…</p></div></div></section>`;
  renderDrop();
  $$("input[name=quality]").forEach((el) =>
    el.addEventListener("change", () => {
      const mapped = environment.presets[el.value].model;
      if ($(`#model option[value="${mapped}"]`)) $("#model").value = mapped;
      updateStart();
    }),
  );
  $("#model").addEventListener("change", updateStart);
  await refreshRecent();
}
function renderDrop() {
  const area = $("#drop-area");
  if (!area) return;
  area.innerHTML = imported
    ? `<div class="file-preview"><span class="file-icon" aria-hidden="true">≋</span><label for="recording-title">Title</label><input type="text" id="recording-title" maxlength="200" value="${escape(imported.name.replace(/\.[^.]+$/, ""))}"><p>${time(imported.duration)} · ${bytes(imported.size)} · ${escape(imported.codec)} audio</p><button class="text-button" data-action="replace">Choose another recording</button></div>`
    : `<div class="dropzone" id="dropzone"><h2>Drop an audio or video file</h2><input id="file-input" type="file" class="visually-hidden" accept="audio/*,video/*,.mkv,.flac,.ogg,.m4a"><label for="file-input" class="button">Choose file</label><p id="upload-status" aria-live="polite"></p><progress id="upload-progress" max="100" value="0" hidden aria-label="Upload progress"></progress></div>`;
  if (!imported) {
    $("#file-input").addEventListener(
      "change",
      safe((e) => upload(e.target.files[0])),
    );
    const drop = $("#dropzone");
    ["dragenter", "dragover"].forEach((type) =>
      drop.addEventListener(type, (e) => {
        e.preventDefault();
        drop.classList.add("dragover");
      }),
    );
    ["dragleave", "drop"].forEach((type) =>
      drop.addEventListener(type, (e) => {
        e.preventDefault();
        drop.classList.remove("dragover");
      }),
    );
    drop.addEventListener(
      "drop",
      safe((e) => upload(e.dataTransfer.files[0])),
    );
  }
  updateStart();
}
function updateStart() {
  const key = $("input[name=quality]:checked")?.value;
  if (!key) return;
  const model = $("#model").value;
  $("#start-button").disabled =
    !imported || !model || !environment.ffmpeg || uploadBusy;
  $("#start-help").innerHTML = !environment.ffmpeg
    ? "Install FFmpeg to transcribe."
    : !model
      ? `<a href="#settings">Install the ${key} model in Settings</a>`
      : imported
        ? ""
        : `Up to ${settings.max_duration_hours} hours per file.`;
}
async function upload(file) {
  if (!file || uploadBusy) return;
  uploadBusy = true;
  notice("");
  $("#file-input").disabled = true;
  $("#upload-progress").hidden = false;
  $("#upload-status").textContent = "Uploading…";
  try {
    imported = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media");
      xhr.setRequestHeader("X-Studio-Request", "1");
      xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && $("#upload-progress")) {
          $("#upload-progress").value = (e.loaded / e.total) * 100;
          if (e.loaded === e.total)
            $("#upload-status").textContent = "Checking the audio track…";
        }
      };
      xhr.onload = () => {
        let result;
        try {
          result = JSON.parse(xhr.responseText);
        } catch {
          /* Proxy error. */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(result);
        else
          reject(
            new Error(
              result?.detail ||
                (xhr.status === 413
                  ? "This recording exceeds the remote upload limit. Import it from http://127.0.0.1:8765 on the host computer."
                  : "Upload failed. Your Access session may have expired or the local host may be offline. Reload and try again."),
            ),
          );
      };
      xhr.onerror = () =>
        reject(
          new Error(
            "The upload was interrupted. Check your connection and that the host computer is running, then try again.",
          ),
        );
      xhr.send(file);
    });
  } finally {
    uploadBusy = false;
    renderDrop();
  }
}
async function refreshRecent() {
  const data = await api("/jobs?limit=3");
  $("#library-count").textContent = data.total || "";
  if ($("#recent-list"))
    $("#recent-list").innerHTML = data.items.length
      ? historyRows(data.items)
      : '<p class="empty-inline">No transcriptions yet.</p>';
}
async function renderLibrary() {
  workspace.innerHTML = `<section>${heading("Library", "", '<a class="button" href="#new">New transcription ＋</a>')}<div class="toolbar"><label class="visually-hidden" for="history-search">Search your library</label><input id="history-search" type="search" placeholder="Find a title or recording…" value="${escape(historyQuery)}"><label class="visually-hidden" for="history-sort">Sort library</label><select id="history-sort">${["newest", "oldest", "title", "duration", "status"].map((s) => `<option ${s === historySort ? "selected" : ""} value="${s}">${titleCase(s)}</option>`).join("")}</select></div><div id="history-list"></div><div id="pagination"></div><div id="retained-list" class="retained"></div></section>`;
  let timer;
  $("#history-search").addEventListener("input", () => {
    historyQuery = $("#history-search").value;
    historyOffset = 0;
    clearTimeout(timer);
    timer = setTimeout(safe(refreshLibrary), 250);
  });
  $("#history-sort").addEventListener(
    "change",
    safe(() => {
      historySort = $("#history-sort").value;
      historyOffset = 0;
      return refreshLibrary();
    }),
  );
  await refreshLibrary();
}
async function refreshLibrary() {
  const query = historyQuery,
    offset = historyOffset,
    sort = historySort;
  const [data, retained] = await Promise.all([
    api(`/jobs?q=${encodeURIComponent(query)}&sort=${sort}&offset=${offset}`),
    api("/media"),
  ]);
  if (
    !$("#history-list") ||
    query !== historyQuery ||
    offset !== historyOffset ||
    sort !== historySort
  )
    return;
  $("#history-list").innerHTML = data.items.length
    ? historyRows(data.items)
    : `<div class="empty-state"><h2>${query ? "No results" : "No transcriptions yet"}</h2><a href="#new" class="button">New transcription ＋</a></div>`;
  $("#pagination").innerHTML =
    data.total > 50
      ? `<div class="pagination">${button("← Previous", "previous", "secondary small", historyOffset === 0 ? "disabled" : "")}<span>${historyOffset + 1}–${Math.min(historyOffset + 50, data.total)} of ${data.total}</span>${button("Next →", "next", "secondary small", historyOffset + 50 >= data.total ? "disabled" : "")}</div>`
      : "";
  $("#retained-list").innerHTML = retained.length
    ? `<div class="section-heading"><h2>Retained recordings</h2></div>` +
      retained
        .map(
          (m) =>
            `<div class="history-row"><span class="history-copy"><strong>${escape(m.name)}</strong><small>${time(m.duration)} · ${bytes(m.size)}</small></span>${button("Transcribe", "reuse", "secondary small", `data-id="${m.id}"`)}${button("Delete", "delete-media", "secondary small danger-text", `data-id="${m.id}"`)}</div>`,
        )
        .join("")
    : "";
}
function renderSettings() {
  workspace.innerHTML = `<section>${heading("Settings")}<div class="settings-grid"><div><form id="settings-form" class="settings-section"><h2>Preferences</h2><div class="field"><label for="default-language">Default language</label><select id="default-language" name="language">${languages(settings.language)}</select></div><div class="field"><label for="default-preset">Default quality</label><select id="default-preset" name="preset">${["fast", "balanced", "accurate"].map((k) => `<option ${settings.preset === k ? "selected" : ""} value="${k}">${titleCase(k)}</option>`).join("")}</select></div><div class="field"><label for="duration-limit">Maximum recording length (hours)</label><input type="number" id="duration-limit" name="max_duration_hours" min="0.1" max="24" step="0.1" value="${settings.max_duration_hours}" required></div><div class="field"><label for="hardware">Hardware (next job)</label><select id="hardware" name="hardware">${["auto", "cpu", "cuda"].map((k) => `<option value="${k}" ${settings.hardware === k ? "selected" : ""}>${k === "auto" ? "Automatic" : k.toUpperCase()}</option>`).join("")}</select><p class="helper">Apple Silicon: CPU. NVIDIA: CUDA.</p></div><label class="toggle-row"><input type="checkbox" name="retain_source" ${settings.retain_source ? "checked" : ""}><span>Keep recordings after transcription<br><span class="muted">When off, audio is deleted after transcription.</span></span></label><button class="button" type="submit">Save preferences</button><span id="settings-saved" class="save-status" role="status"></span></form></div><div><div class="settings-section"><div class="model-heading"><h2>Models</h2><span id="model-count" class="count"></span></div><label class="visually-hidden" for="model-search">Search models</label><input id="model-search" type="search" placeholder="Search models" value="${escape(modelQuery)}"><div id="models-list"></div></div><details class="settings-section"><summary>Diagnostics</summary><div id="diagnostics"></div><a class="button secondary small" href="/api/diagnostics" download>Download diagnostics</a></details></div></div></section>`;
  $("#settings-form").addEventListener(
    "submit",
    safe(async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      settings = await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          language: data.get("language"),
          preset: data.get("preset"),
          max_duration_hours: Number(data.get("max_duration_hours")),
          hardware: data.get("hardware"),
          retain_source: data.has("retain_source"),
        }),
      });
      $("#settings-saved").textContent = " Preferences saved";
    }),
  );
  $("#model-search").addEventListener("input", () => {
    modelQuery = $("#model-search").value;
    renderModels();
  });
  updateEnvironment();
}
function renderModels() {
  if (!$("#models-list")) return;
  const query = modelQuery.trim().toLocaleLowerCase();
  const presetNames = Object.fromEntries(
    Object.entries(environment.presets).map(([name, preset]) => [
      preset.model,
      titleCase(name),
    ]),
  );
  const models = environment.models
    .filter((model) =>
      `${model.id} ${model.name}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => Number(b.installed) - Number(a.installed));
  $("#model-count").textContent =
    `${environment.models.filter((model) => model.installed).length} installed`;
  $("#models-list").innerHTML = models.length
    ? models
        .map((p) => {
          const label =
            p.phase === "verifying"
              ? "Verifying…"
              : p.progress === null
                ? "Connecting…"
                : `${Math.floor(p.progress)}% · ${bytes(p.downloaded_bytes)} / ${bytes(p.total_bytes)}`;
          const progress = p.downloading
            ? `<small role="status">${label}</small><progress aria-label="${escape(p.name)} model download" max="100" ${p.progress === null ? "" : `value="${p.progress}"`}></progress>`
            : "";
          const preset = presetNames[p.id]
            ? `<span class="model-preset">${presetNames[p.id]}</span>`
            : "";
          const actions = p.installed
            ? `${preset}<span class="status">Installed</span>${button("Delete", "delete-model", "secondary small danger-text", `data-model="${p.id}"`)}`
            : p.downloading
              ? preset
              : `${preset}${button(p.error ? "Retry" : "Install", "install", "secondary small", `data-model="${p.id}"`)}`;
          return `<div class="model-row" data-model="${p.id}"><div><strong>${escape(p.name)}</strong><small>${escape(p.id)} · ${p.size_bytes ? bytes(p.size_bytes) : p.estimate}</small>${progress}${p.error ? `<small class="danger-text">${escape(p.error)}</small>` : ""}</div><div class="model-actions">${actions}</div></div>`;
        })
        .join("")
    : '<p class="empty-inline">No matching models.</p>';
}
function updateEnvironment() {
  if (!$("#models-list")) return;
  renderModels();
  $("#diagnostics").innerHTML =
    `<dl><dt>Studio version</dt><dd>${environment.version}</dd><dt>FFmpeg</dt><dd>${environment.ffmpeg ? "Installed" : "Missing — install with brew install ffmpeg"}</dd><dt>Whisper runtime</dt><dd>faster-whisper ${environment.runtime}</dd><dt>Available backend</dt><dd>${environment.compute.toUpperCase()}</dd><dt>Database</dt><dd>${environment.database ? "Healthy" : "Needs attention"}</dd><dt>Studio storage</dt><dd>${bytes(environment.used_bytes)} · ${bytes(environment.free_bytes)} free</dd><dt>Data location</dt><dd>${escape(environment.data_location)}</dd><dt>Access boundary</dt><dd>${environment.access_verified ? "Verified Cloudflare identity" : "Local recovery connection"}</dd><dt>Tunnel</dt><dd>${escape(environment.tunnel)}</dd></dl>`;
}

function renderProgress() {
  const active = [
    "queued",
    "preparing",
    "transcribing",
    "saving",
    "cancelling",
  ].includes(job.state);
  workspace.innerHTML = `<section>${heading(escape(job.title), `${escape(job.filename)} · ${time(job.duration)} · ${titleCase(job.preset)}`)}<div class="progress-panel"><h2>${titleCase(job.state)}</h2>${job.error ? `<p>${escape(job.error)}</p>` : ""}<progress max="100" value="${job.progress}" aria-label="Transcription progress"></progress><div class="progress-details"><span>${Math.round(job.progress)}% · ${job.backend ? job.backend.toUpperCase() : "Local processing"}</span><span>${job.started ? time((job.finished || Date.now() / 1000) - job.started) + " elapsed" : "Waiting for the worker"}</span></div><div class="stages">${["preparing", "transcribing", "saving"].map((s) => `<span class="${s === job.state ? "current" : ""}">${titleCase(s)}</span>`).join('<span aria-hidden="true">·</span>')}</div>${active ? button(job.state === "cancelling" ? "Cancelling…" : "Cancel transcription", "cancel", "secondary", job.state === "cancelling" ? "disabled" : "") : button("Try again ↗", "retry", "", job.source_available ? "" : "disabled")} <a class="button secondary" href="#new">Add another recording</a>${!active ? `<div>${button("Delete recording or transcript", "delete", "secondary small danger-text")}</div>` : ""}</div></section>`;
}
function renderEditor() {
  pending.clear();
  pendingTitle = null;
  revision = job.revision;
  editUndo = [];
  matches = [];
  matchIndex = -1;
  workspace.innerHTML = `<section><h1 class="visually-hidden">Transcript editor</h1><div class="page-heading"><div class="editor-header"><label class="visually-hidden" for="transcript-title">Transcript title</label><input id="transcript-title" type="text" maxlength="200" value="${escape(job.title)}"><p class="subtitle">${time(job.duration)} · ${escape((job.detected_language || job.language).toUpperCase())} · ${titleCase(job.preset)} · ${date(job.created)}</p></div><span id="save-status" class="save-status" role="status">All changes saved</span></div><div class="editor-toolbar"><label class="visually-hidden" for="transcript-search">Find in transcript</label><input type="search" id="transcript-search" placeholder="Search transcript">${button("↑", "match-prev", "secondary small", 'aria-label="Previous search match"')}${button("↓", "match-next", "secondary small", 'aria-label="Next search match"')}<span id="match-count" class="helper" aria-live="polite"></span>${button("Undo", "undo", "secondary small")}${button("Copy", "copy", "secondary small")}<label class="visually-hidden" for="export-format">Export format</label><select id="export-format"><option value="txt">TXT</option><option value="srt">SRT</option><option value="vtt">VTT</option></select>${button("Export ↓", "export", "small")}</div><div class="player">${job.playback_available ? `<audio id="audio" controls preload="metadata" src="/api/jobs/${job.id}/audio"></audio><label class="visually-hidden" for="speed">Playback speed</label><select id="speed">${[0.75, 1, 1.25, 1.5, 2].map((n) => `<option value="${n}" ${n === 1 ? "selected" : ""}>${n}×</option>`).join("")}</select>` : '<p class="helper">Recording removed. Playback unavailable.</p>'}</div><label class="toggle-row"><input id="follow" type="checkbox" checked> Follow playback</label><div class="transcript">${job.segments.length ? job.segments.map((s) => `<div class="segment" data-segment="${s.id}"><button class="timestamp" data-action="seek" data-time="${s.start}" aria-label="Play from ${time(s.start)}" ${job.playback_available ? "" : "disabled"}>${time(s.start)}</button><textarea aria-label="Segment at ${time(s.start)}" data-id="${s.id}" rows="2">${escape(s.text)}</textarea></div>`).join("") : '<div class="blank">No speech detected.</div>'}</div><div class="editor-foot">${button("Delete…", "delete", "secondary small danger-text")}</div></section>`;
  $$("textarea[data-id]").forEach((el) => {
    el.addEventListener("focus", () => {
      el.dataset.before = el.value;
    });
    el.addEventListener("change", () => {
      if (el.dataset.before !== el.value)
        editUndo.push({ id: Number(el.dataset.id), text: el.dataset.before });
      el.dataset.before = el.value;
    });
    el.addEventListener("input", () => {
      pending.set(Number(el.dataset.id), el.value);
      scheduleSave();
      searchTranscript(false);
    });
  });
  $("#transcript-title").addEventListener("input", () => {
    pendingTitle = $("#transcript-title").value;
    scheduleSave();
  });
  $("#transcript-search").addEventListener("input", () =>
    searchTranscript(true),
  );
  const audio = $("#audio");
  if (audio) {
    $("#speed").addEventListener("change", () => {
      audio.playbackRate = Number($("#speed").value);
    });
    let lastActive;
    audio.addEventListener("timeupdate", () => {
      const active = job.segments.find(
        (s) => s.start <= audio.currentTime && audio.currentTime < s.end,
      )?.id;
      if (active === lastActive) return;
      lastActive = active;
      $$(".segment.active").forEach((e) => e.classList.remove("active"));
      const el = $(`[data-segment="${active}"]`);
      el?.classList.add("active");
      if (
        el &&
        $("#follow").checked &&
        document.activeElement.tagName !== "TEXTAREA"
      )
        el.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  if (job.error) notice(job.error, true);
}
function scheduleSave() {
  $("#save-status").textContent = "Unsaved changes";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(safe(flushEdits), 650);
}
async function flushEdits() {
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    if (pending.size || pendingTitle !== null) return flushEdits();
    return;
  }
  if (!pending.size && pendingTitle === null) return;
  const captured = new Map(pending),
    title = pendingTitle,
    identifier = job.id;
  const changes = [...captured].map(([id, text]) => ({ id, text }));
  if (title !== null && !title.trim())
    throw new Error("Give this transcript a title before leaving.");
  $("#save-status").textContent = "Saving…";
  saving = api(`/jobs/${identifier}`, {
    method: "PATCH",
    body: JSON.stringify({
      revision,
      segments: changes,
      ...(title !== null ? { title } : {}),
    }),
  })
    .then((result) => {
      revision = result.revision;
      for (const [id, text] of captured) {
        if (pending.get(id) === text) pending.delete(id);
        const segment = job.segments.find((s) => s.id === id);
        if (segment) segment.text = text;
      }
      if (title !== null) {
        job.title = title;
        if (pendingTitle === title) pendingTitle = null;
      }
      if ($("#save-status"))
        $("#save-status").textContent =
          pending.size || pendingTitle !== null
            ? "Unsaved changes"
            : "All changes saved";
    })
    .catch((error) => {
      if ($("#save-status"))
        $("#save-status").textContent = "Not saved · keep this tab open";
      throw error;
    })
    .finally(() => {
      saving = null;
    });
  await saving;
  if (pending.size || pendingTitle !== null) await flushEdits();
}
function searchTranscript(reset) {
  const query = $("#transcript-search").value.toLocaleLowerCase();
  matches = [];
  $$(".segment").forEach((el) => {
    const match =
      query && $("textarea", el).value.toLocaleLowerCase().includes(query);
    el.classList.toggle("match", !!match);
    el.classList.remove("selected-match");
    if (match) matches.push(el);
  });
  if (reset) matchIndex = matches.length ? 0 : -1;
  if (matchIndex >= matches.length) matchIndex = matches.length - 1;
  showMatch(false);
}
function showMatch(scroll) {
  $$(".selected-match").forEach((e) => e.classList.remove("selected-match"));
  if (matches[matchIndex]) {
    matches[matchIndex].classList.add("selected-match");
    if (scroll) matches[matchIndex].scrollIntoView({ block: "center" });
  }
  $("#match-count").textContent = $("#transcript-search").value
    ? `${Math.max(0, matchIndex + 1)} / ${matches.length}`
    : "";
}
const actions = {
  async start() {
    const selected = $("input[name=quality]:checked").value;
    const title = $("#recording-title").value;
    const button = $("#start-button");
    button.disabled = true;
    try {
      const created = await api("/jobs", {
        method: "POST",
        body: JSON.stringify({
          media_id: imported.id,
          title,
          language: $("#language").value,
          preset: selected,
          model: $("#model").value,
        }),
      });
      imported = null;
      location.hash = `job/${created.id}`;
    } finally {
      if ($("#start-button")) updateStart();
    }
  },
  replace() {
    imported = null;
    renderDrop();
  },
  async install(el) {
    const model = el.dataset.model,
      p = environment.models.find((item) => item.id === model);
    if (
      await confirmation(
        `Download ${p.name}?`,
        `${p.estimate} from Hugging Face. Internet required.`,
        { label: "Download model" },
      )
    ) {
      await api(`/models/${encodeURIComponent(model)}`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      environment = await api("/environment");
      updateEnvironment();
    }
  },
  async "delete-model"(el) {
    const model = el.dataset.model,
      item = environment.models.find((entry) => entry.id === model);
    if (
      await confirmation(
        `Delete ${item.name}?`,
        `Removes ${bytes(item.size_bytes)} from this computer.`,
        { danger: true, label: "Delete model" },
      )
    ) {
      await api(`/models/${encodeURIComponent(model)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      environment = await api("/environment");
      updateEnvironment();
    }
  },
  async cancel() {
    if (
      await confirmation(
        "Stop this transcription?",
        "The original recording stays available, so you can retry later.",
        { label: "Stop transcription" },
      )
    ) {
      job = await api(`/jobs/${job.id}/cancel`, { method: "POST" });
      renderProgress();
    }
  },
  async retry() {
    job = await api(`/jobs/${job.id}/retry`, { method: "POST" });
    renderProgress();
  },
  async delete() {
    await flushEdits();
    const scope = await confirmation(
      "Delete transcription?",
      `Choose what to remove for “${job.title}”. This cannot be undone.`,
      {
        danger: true,
        label: "Delete selected items",
        options:
          '<label><input type="radio" name="scope" value="transcript">Delete transcript and playback audio; keep original recording</label><label><input type="radio" name="scope" value="all" checked>Delete transcript, playback audio, and original recording</label>',
      },
    );
    if (scope) {
      await api(`/jobs/${job.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope, confirm: true }),
      });
      location.hash = "library";
    }
  },
  async "delete-media"(el) {
    if (
      await confirmation(
        "Delete this retained recording?",
        "The original file in studio storage will be permanently removed.",
        { danger: true, label: "Delete recording" },
      )
    ) {
      await api(`/media/${el.dataset.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      await refreshLibrary();
    }
  },
  async reuse(el) {
    const records = await api("/media");
    imported = records.find((m) => m.id === el.dataset.id);
    location.hash = "new";
  },
  previous() {
    historyOffset = Math.max(0, historyOffset - 50);
    return refreshLibrary();
  },
  next() {
    historyOffset += 50;
    return refreshLibrary();
  },
  async seek(el) {
    const audio = $("#audio");
    if (audio) {
      audio.currentTime = Number(el.dataset.time);
      await audio.play();
    }
  },
  "match-next"() {
    if (matches.length) {
      matchIndex = (matchIndex + 1) % matches.length;
      showMatch(true);
    }
  },
  "match-prev"() {
    if (matches.length) {
      matchIndex = (matchIndex - 1 + matches.length) % matches.length;
      showMatch(true);
    }
  },
  undo() {
    const last = editUndo.pop();
    if (!last) return;
    const el = $(`textarea[data-id="${last.id}"]`);
    el.value = last.text;
    el.dataset.before = last.text;
    pending.set(last.id, last.text);
    scheduleSave();
    searchTranscript(false);
  },
  async copy() {
    await flushEdits();
    await navigator.clipboard.writeText(
      job.segments.map((s) => s.text).join("\n\n"),
    );
    notice("Copied.");
  },
  async export() {
    await flushEdits();
    const link = document.createElement("a");
    link.href = `/api/jobs/${job.id}/export/${$("#export-format").value}`;
    link.download = "";
    link.click();
  },
};
document.addEventListener(
  "click",
  safe(async (e) => {
    const el = e.target.closest("[data-action]");
    if (el && !el.disabled) {
      const action = actions[el.dataset.action];
      if (action) await action(el);
    }
  }),
);
window.addEventListener("beforeunload", (e) => {
  if (pending.size || pendingTitle !== null || saving || uploadBusy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function route() {
  const next = location.hash.slice(1) || "new";
  if (uploadBusy) {
    history.replaceState(null, "", `#${page || "new"}`);
    notice("Wait for this upload to finish before leaving.");
    return;
  }
  try {
    await flushEdits();
  } catch (e) {
    history.replaceState(null, "", `#${page}`);
    throw e;
  }
  const generation = ++routeGeneration;
  clearTimeout(pollTimer);
  page = next;
  job = null;
  notice("");
  $$("[data-nav]").forEach((el) =>
    el.classList.toggle(
      "active",
      el.dataset.nav === (page.startsWith("job/") ? "library" : page),
    ),
  );
  if (page.startsWith("job/")) {
    const result = await api(`/jobs/${encodeURIComponent(page.slice(4))}`);
    if (generation !== routeGeneration) return;
    job = result;
    job.state === "completed" ? renderEditor() : renderProgress();
  } else if (page === "library") await renderLibrary();
  else if (page === "settings") {
    environment = await api("/environment");
    if (generation !== routeGeneration) return;
    renderSettings();
  } else await renderNew();
  if (generation !== routeGeneration) return;
  window.scrollTo(0, 0);
  pollTimer = setTimeout(poll, 2000);
}
async function poll() {
  const generation = routeGeneration;
  try {
    if (job && job.state !== "completed") {
      const result = await api(`/jobs/${job.id}`);
      if (generation !== routeGeneration) return;
      job = result;
      job.state === "completed" ? renderEditor() : renderProgress();
    } else if (page === "settings") {
      const result = await api("/environment");
      if (generation !== routeGeneration) return;
      environment = result;
      updateEnvironment();
    } else if (page === "library") await refreshLibrary();
    else if (page === "new") await refreshRecent();
    $("#connection").textContent = "Local engine";
  } catch (error) {
    notice(error.message, true);
    $("#connection").textContent = "Connection interrupted";
  }
  if (generation === routeGeneration) pollTimer = setTimeout(poll, 3000);
}
window.addEventListener("hashchange", safe(route));
async function boot() {
  [environment, settings] = await Promise.all([
    api("/environment"),
    api("/settings"),
  ]);
  await route();
  if (
    !environment.ffmpeg ||
    !Object.values(environment.presets).some((p) => p.installed)
  )
    notice("Open Settings to install a model or check FFmpeg.");
}
await safe(boot)();
