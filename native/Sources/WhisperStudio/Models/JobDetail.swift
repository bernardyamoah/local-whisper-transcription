import Foundation

struct JobDetail: Decodable, Identifiable, Sendable {
    var id: String
    var title: String
    var filename: String
    var duration: Double
    var state: String
    var progress: Double
    var preset: String
    var provider: String
    var error: String?
    var started: Double?
    var revision: Int
    var detectedLanguage: String?
    var language: String
    var playbackAvailable: Bool
    var playbackKind: String
    var sourceAvailable: Bool
    var segments: [TranscriptSegment]
    var bookmarks: [Bookmark]
    var notes: MeetingNotes?
    var analysis: MeetingAnalysis?
    var template: MeetingTemplate
    var active: Bool { ["queued", "preparing", "transcribing", "saving"].contains(state) }
}
