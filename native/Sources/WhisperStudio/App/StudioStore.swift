import SwiftUI

@MainActor @Observable
final class StudioStore {
    var api: StudioAPI?
    var environment: StudioEnvironment?
    var preferences = Preferences()
    var recording = RecordingState(state: "idle")
    var jobs: [JobSummary] = []
    var totalJobs = 0
    var route: Route? = .capture
    var loading = true
    var busy = false
    var error: String?
    var notice: String?
    var showOnboarding = false
    var showImporter = false
    var imported: ImportedMedia?
    var template = "general"
    var recordingName = ""
    var libraryQuery = ""
    var librarySort = "newest"
    let engine = EngineService()
    let companion = RecordingCompanion()
    let updates = AppUpdateController()

    var scheme: ColorScheme? {
        switch preferences.appearance { case "light": .light; case "dark": .dark; default: nil }
    }
    var selectedTemplate: MeetingTemplate? { environment?.meetingTemplates.first { $0.id == template } }

    func start() async {
        guard api == nil else { return }
        loading = true
        do {
            api = StudioAPI(base: try await engine.start())
            try await refreshEnvironment()
            if let api { preferences = try await api.request("settings") }
            showOnboarding = !preferences.onboardingCompleted
            try await refreshLibrary()
            companion.connect(self)
            loading = false
            Task { await updates.check() }
        } catch { self.error = error.localizedDescription; loading = false; api = nil; engine.stop() }
    }

    func monitor() async {
        var tick = 0
        while !Task.isCancelled {
            do {
                if let api {
                    recording = try await api.request("recordings")
                    if tick % 4 == 0 { try await refreshEnvironment() }
                    if tick % 5 == 0, route == .library { try await refreshLibrary() }
                    if tick > 0, tick % 21_600 == 0 { await updates.check() }
                }
                tick += 1
                try await Task.sleep(for: .seconds(1))
            } catch is CancellationError { return }
            catch {
                self.error = error.localizedDescription
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }

    func refreshEnvironment() async throws {
        if let api { environment = try await api.request("environment") }
    }

    func refreshLibrary(loadMore: Bool = false) async throws {
        guard let api else { return }
        let query = libraryQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+?#"))) ?? ""
        let count = loadMore ? jobs.count : 0
        let page: JobPage = try await api.request("jobs?q=\(query)&sort=\(librarySort)&limit=100&offset=\(count)")
        jobs = loadMore ? jobs + page.items : page.items
        totalJobs = page.total
    }

    func savePreferences(_ value: Preferences) async {
        guard let api else { return }
        do {
            let encoder = JSONEncoder(); encoder.keyEncodingStrategy = .convertToSnakeCase
            let body = try JSONSerialization.jsonObject(with: encoder.encode(value)) as? [String: Any]
            preferences = try await api.request("settings", method: "PUT", body: body)
        } catch { self.error = error.localizedDescription }
    }

    func completeWelcome(importRecording: Bool = false) async {
        var next = preferences
        next.onboardingCompleted = true
        await savePreferences(next)
        guard preferences.onboardingCompleted else { return }
        showOnboarding = false
        route = .capture
        showImporter = importRecording
    }

    func importFile(_ url: URL) async {
        guard let api, !busy else { return }
        busy = true; route = .capture
        defer { busy = false }
        do { imported = try await api.upload(url) } catch { self.error = error.localizedDescription }
    }

    func transcribe() async {
        guard let api, let imported, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let job: CreatedJob = try await api.request("jobs", method: "POST", body: [
                "media_id": imported.id, "title": URL(filePath: imported.name).deletingPathExtension().lastPathComponent,
                "language": preferences.language, "preset": preferences.preset,
                "provider": preferences.transcriptionProvider, "template": template,
            ])
            self.imported = nil; route = .job(job.id)
        } catch { self.error = error.localizedDescription }
    }

    func startRecording() async {
        guard let api, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            recording = try await api.request("recordings", method: "POST", body: ["name": recordingName.isEmpty ? "Meeting recording" : recordingName, "language": preferences.language, "template": template])
            route = .capture
            if recording.active { companion.show() }
        } catch { self.error = error.localizedDescription }
    }

    func stopRecording() async {
        guard let api, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let job: CreatedJob = try await api.request("recordings/stop", method: "POST", body: [:])
            recording = RecordingState(state: "idle")
            route = .job(job.id)
        } catch { self.error = error.localizedDescription }
    }

    func bookmark(_ kind: String) async {
        guard let api else { return }
        do {
            try await api.mutate("recordings/bookmarks", body: ["kind": kind])
            recording = try await api.request("recordings")
        } catch { self.error = error.localizedDescription }
    }

    func perform(_ path: String, method: String = "POST", body: [String: Any] = [:]) async {
        guard let api else { return }
        do { try await api.mutate(path, method: method, body: body); try await refreshEnvironment() }
        catch { self.error = error.localizedDescription }
    }
}
