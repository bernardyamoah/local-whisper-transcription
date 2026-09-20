import Foundation

struct StudioEnvironment: Decodable, Sendable {
    var version: String
    var freeBytes: Double
    var usedBytes: Double
    var dataLocation: String
    var compute: String
    var languages: [String]
    var models: [ModelInfo]
    var presets: [String: TranscriptionPreset]?
    var deepgram: ProviderStatus
    var jev: ProviderStatus
    var meetingTemplates: [MeetingTemplate]
}
