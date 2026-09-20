import Foundation

struct ProviderStatus: Decodable, Sendable {
    var configured: Bool
    var enabled: Bool?
    var error: String?
}
