import Foundation

struct StudioFailure: LocalizedError, Sendable {
    var message: String
    var errorDescription: String? { message }
}
