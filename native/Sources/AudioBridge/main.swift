import Foundation

enum BridgeError: LocalizedError {
    case invalidArguments
    case noDisplay
    case unavailableSpeechAssets
    case unsupportedLocale(String)
    case unsupportedRecording
    case unsupportedSpeechAnalyzer

    var errorDescription: String? {
        switch self {
        case .invalidArguments: "Invalid audio bridge command."
        case .noDisplay: "No display is available for meeting audio capture."
        case .unavailableSpeechAssets: "The requested Apple speech assets are unavailable."
        case let .unsupportedLocale(locale): "Apple Speech does not support \(locale) on this Mac."
        case .unsupportedRecording: "Meeting recording requires macOS 15 or later."
        case .unsupportedSpeechAnalyzer: "Apple Speech transcription requires macOS 26 or later."
        }
    }
}

@main
struct AudioBridge {
    static func main() async {
        do {
            try await run(arguments: Array(CommandLine.arguments.dropFirst()))
        } catch {
            JSONLine.error(error.localizedDescription)
            exit(1)
        }
    }

    private static func run(arguments: [String]) async throws {
        guard let command = arguments.first else { throw BridgeError.invalidArguments }
        switch command {
        case "capabilities":
            JSONLine.write(await Capabilities.report())
        case "record" where arguments.count == 2 || arguments.count == 3:
            try await MeetingRecorder.run(
                outputURL: URL(fileURLWithPath: arguments[1]),
                localeIdentifier: arguments.count == 3 ? arguments[2] : "auto"
            )
        case "transcribe" where arguments.count == 2 || arguments.count == 3:
            try await AppleTranscriber.run(
                fileURL: URL(fileURLWithPath: arguments[1]),
                localeIdentifier: arguments.count == 3 ? arguments[2] : "auto"
            )
        default:
            throw BridgeError.invalidArguments
        }
    }
}
