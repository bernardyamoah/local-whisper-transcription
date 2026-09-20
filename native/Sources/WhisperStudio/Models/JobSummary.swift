import Foundation

struct JobSummary: Decodable, Identifiable, Sendable {
    var id: String
    var title: String
    var filename: String
    var duration: Double
    var state: String
    var created: Double
    var progress: Double
    var preset: String
    var provider: String
    var active: Bool { ["queued", "preparing", "transcribing", "saving"].contains(state) }
}
