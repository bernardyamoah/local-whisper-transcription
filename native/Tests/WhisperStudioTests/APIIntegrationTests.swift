import Foundation
import Testing
@testable import WhisperStudio

struct APIIntegrationTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["STUDIO_TEST_API"] != nil))
    @MainActor func existingEngineContractAndEditsAndExport() async throws {
        let address = try #require(ProcessInfo.processInfo.environment["STUDIO_TEST_API"])
        let api = StudioAPI(base: try #require(URL(string: address)))
        let environment: StudioEnvironment = try await api.request("environment")
        #expect(environment.dataLocation.contains("whisper-swiftui-validation"))
        guard environment.dataLocation.contains("whisper-swiftui-validation") else { return }
        let _: Preferences = try await api.request("settings")
        let _: RecordingState = try await api.request("recordings")
        let _: ExportDestinations = try await api.request("export-destinations")
        let page: JobPage = try await api.request("jobs")
        let first = try #require(page.items.first)
        let detail: JobDetail = try await api.request("jobs/\(first.id)")
        #expect(detail.playbackAvailable)
        #expect(!detail.segments.isEmpty)
        let model = TranscriptModel()
        model.job = detail
        let segment = try #require(detail.segments.first)
        model.edit(segment: segment, text: "Native edit round-trip.", api: api)
        let deadline = Date.now.addingTimeInterval(5)
        while model.saving && Date.now < deadline { try await Task.sleep(for: .milliseconds(50)) }
        #expect(!model.unsaved)
        #expect(model.job?.segments.first?.text == "Native edit round-trip.")
        model.undo(api: api)
        while model.saving && Date.now < deadline { try await Task.sleep(for: .milliseconds(50)) }
        #expect(model.job?.segments.first?.text == segment.text)
        let destination = FileManager.default.temporaryDirectory.appending(path: "native-export-test-\(UUID().uuidString).md")
        defer { try? FileManager.default.removeItem(at: destination) }
        try await api.download("jobs/\(first.id)/export/md", to: destination)
        #expect(try String(contentsOf: destination, encoding: .utf8).contains(segment.text))
    }
}
