import Testing
import Foundation
@testable import WhisperStudio

struct TranscriptTests {
    let segments = [
        TranscriptSegment(id: 1, start: 0, end: 5, text: "Résumé of our meeting"),
        TranscriptSegment(id: 2, start: 5, end: 10, text: "The next decision"),
        TranscriptSegment(id: 3, start: 10, end: 15, text: "A final decision"),
    ]
    @Test func searchFindsUtteranceIDsWithAccentsAndCase() {
        #expect(TranscriptSearch.matches(segments, query: "RESUME") == [1])
        #expect(TranscriptSearch.matches(segments, query: "decision") == [2, 3])
        #expect(TranscriptSearch.matches(segments, query: " ") == [])
        #expect(TranscriptSearch.matches(segments, query: "missing").isEmpty)
    }
    @Test func nextAndPreviousWrapWithoutInvalidIndex() {
        #expect(TranscriptSearch.nextIndex(current: 0, direction: -1, count: 2) == 1)
        #expect(TranscriptSearch.nextIndex(current: 1, direction: 1, count: 2) == 0)
        #expect(TranscriptSearch.nextIndex(current: 0, direction: 1, count: 0) == 0)
    }
    @Test func playbackUsesHalfOpenBoundaries() {
        #expect(TranscriptSearch.active(segments, at: 4.9) == 1)
        #expect(TranscriptSearch.active(segments, at: 5) == 2)
        #expect(TranscriptSearch.active(segments, at: 15) == nil)
    }
    @Test func timeHandlesInvalidAndLongMedia() {
        #expect(StudioStyle.time(.nan) == "00:00")
        #expect(StudioStyle.time(-5) == "00:00")
        #expect(StudioStyle.time(3661) == "61:01")
    }
    @Test @MainActor func preferencesRoundTripUsesExistingDatabaseContract() throws {
        var preferences = Preferences()
        preferences.transcriptionProvider = "deepgram"
        preferences.smartMoments = true
        let encoder = JSONEncoder(); encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(preferences)
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["transcription_provider"] as? String == "deepgram")
        #expect(object["smart_moments"] as? Bool == true)
        #expect(try StudioAPI.decoder.decode(Preferences.self, from: data) == preferences)
    }
    @Test @MainActor func apiURLsRemainOnLoopback() throws {
        let api = StudioAPI(base: try #require(URL(string: "http://127.0.0.1:5000/")))
        #expect(api.url("environment").absoluteString == "http://127.0.0.1:5000/api/environment")
        #expect(api.url("jobs?q=a%26b&limit=100").absoluteString == "http://127.0.0.1:5000/api/jobs?q=a%26b&limit=100")
    }
    @Test @MainActor func releaseManifestDecodesServerKeysAndMissingChecksum() throws {
        let data = Data(#"{"version":"0.5.20","download_url":"https://transcribe.bernardyamoah.com/download/Whisper-Studio.dmg","filename":"Whisper-Studio-0.5.20-arm64.dmg","size_bytes":162337467,"sha256":null,"published_at":"2026-09-20T19:39:55Z"}"#.utf8)
        let release = try AppUpdateController.decoder.decode(AppRelease.self, from: data)
        #expect(release.version == "0.5.20")
        #expect(release.downloadURL.absoluteString == "https://transcribe.bernardyamoah.com/download/Whisper-Studio.dmg")
        #expect(release.sizeBytes == 162_337_467)
        #expect(release.sha256 == nil)
        #expect(release.publishedAt != nil)
    }
}
