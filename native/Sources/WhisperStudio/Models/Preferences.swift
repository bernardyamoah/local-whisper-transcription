import Foundation

struct Preferences: Codable, Equatable, Sendable {
    var language = "auto"
    var preset = "balanced"
    var retainSource = true
    var onboardingCompleted = false
    var maxDurationHours = 4.0
    var hardware = "auto"
    var transcriptionProvider = "local"
    var smartMoments = false
    var appearance = "system"
}
