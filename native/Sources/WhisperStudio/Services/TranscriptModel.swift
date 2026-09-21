import SwiftUI

@MainActor @Observable
final class TranscriptModel {
    var job: JobDetail?
    var query = ""
    var matchIndex = 0
    var matches: [Int] = []
    var followPlayback = true
    var inspector = true
    var requestingAnalysis = false

    func analyze(summary: Bool, api: StudioAPI) async {
        guard let id = job?.id, !requestingAnalysis, job?.analysis?.busy != true else { return }
        requestingAnalysis = true
        defer { requestingAnalysis = false }
        do {
            let status: MeetingAnalysis = try await api.request("jobs/\(id)/analyze?summary=\(summary)", method: "POST", body: [:])
            job?.analysis = status
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private var pendingEdits = 0
    var saving: Bool { pendingEdits > 0 }
    var unsaved = false
    var failedEdits: [Int: String] = [:]
    var error: String?
    var history: [(Int, String)] = []
    private var editTask: Task<Void, Never>?
    let playback = PlaybackController()

    var matchId: Int? { matches.indices.contains(matchIndex) ? matches[matchIndex] : nil }
    var activeId: Int? { TranscriptSearch.active(job?.segments ?? [], at: playback.time) }

    func watch(id: String, api: StudioAPI) async {
        while !Task.isCancelled {
            do {
                let latest: JobDetail = try await api.request("jobs/\(id)")
                if Task.isCancelled { return }
                if !saving && !unsaved && latest.revision >= (job?.revision ?? 0) { job = latest; search() }
                if latest.playbackAvailable, playback.player.currentItem == nil {
                    playback.load(api.url("jobs/\(id)/\(latest.playbackKind == "video" ? "video" : "audio")"), duration: latest.duration)
                }
                try await Task.sleep(for: .seconds(latest.active ? 1 : 3))
            } catch is CancellationError { return }
            catch {
                self.error = error.localizedDescription
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
    func search() {
        matches = TranscriptSearch.matches(job?.segments ?? [], query: query)
        if matchIndex >= matches.count { matchIndex = 0 }
    }
    func step(_ direction: Int) { matchIndex = TranscriptSearch.nextIndex(current: matchIndex, direction: direction, count: matches.count) }

    func edit(segment: TranscriptSegment, text: String, api: StudioAPI, registerUndo: Bool = true) {
        guard text != segment.text else { return }
        let previous = editTask
        pendingEdits += 1
        editTask = Task { [weak self] in
            await previous?.value
            guard let self else { return }
            defer { self.pendingEdits -= 1 }
            guard let job = self.job else { return }
            do {
                try await api.mutate("jobs/\(job.id)", method: "PATCH", body: ["revision": job.revision, "segments": [["id": segment.id, "text": text]]])
                if registerUndo { self.history.append((segment.id, segment.text)) }
                self.job = try await api.request("jobs/\(job.id)")
                self.failedEdits.removeValue(forKey: segment.id)
                self.unsaved = !self.failedEdits.isEmpty
                self.error = nil
                self.search()
            } catch { self.error = error.localizedDescription; self.failedEdits[segment.id] = text; self.unsaved = true }
        }
    }
    func retryEdits(api: StudioAPI) async {
        guard let id = job?.id else { return }
        do {
            job = try await api.request("jobs/\(id)")
            for (id, text) in failedEdits {
                if let segment = job?.segments.first(where: { $0.id == id }) { edit(segment: segment, text: text, api: api) }
            }
        } catch { self.error = error.localizedDescription }
    }
    func undo(api: StudioAPI) {
        guard let last = history.popLast(), let segment = job?.segments.first(where: { $0.id == last.0 }) else { return }
        edit(segment: segment, text: last.1, api: api, registerUndo: false)
    }
    func rename(_ title: String, api: StudioAPI) async {
        await editTask?.value
        guard let job, !title.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        do {
            try await api.mutate("jobs/\(job.id)", method: "PATCH", body: ["revision": job.revision, "title": title])
            self.job = try await api.request("jobs/\(job.id)")
        } catch { self.error = error.localizedDescription }
    }
    func addBookmark(_ kind: String, api: StudioAPI) async {
        guard let job else { return }
        do {
            try await api.mutate("jobs/\(job.id)/bookmarks", body: ["at": playback.time, "kind": kind])
            self.job = try await api.request("jobs/\(job.id)")
        } catch { self.error = error.localizedDescription }
    }
    func renameSpeaker(_ speaker: Int, name: String, api: StudioAPI) async {
        await editTask?.value
        guard let job else { return }
        pendingEdits += 1
        defer { pendingEdits -= 1 }
        do {
            try await api.mutate("jobs/\(job.id)", method: "PATCH", body: ["revision": job.revision, "speakers": [["speaker": speaker, "name": name]]])
            self.job = try await api.request("jobs/\(job.id)")
        } catch { self.error = error.localizedDescription }
    }
    func identifySpeakers(api: StudioAPI) async throws -> SpeakerIdentityResult {
        guard let job else { throw StudioFailure(message: "The transcript is unavailable.") }
        let result: SpeakerIdentityResult = try await api.request(
            "jobs/\(job.id)/speakers/google-meet",
            method: "POST",
            body: [:]
        )
        self.job = try await api.request("jobs/\(job.id)")
        return result
    }
    func copy() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(job?.segments.map(\.text).joined(separator: "\n\n") ?? "", forType: .string)
    }
}

struct SpeakerIdentityResult: Decodable, Sendable {
    let status: String
    let renamed: Int
    let message: String
}
