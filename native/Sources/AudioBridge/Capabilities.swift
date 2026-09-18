import Foundation
import Speech

enum Capabilities {
    static func report() async -> [String: Any] {
        var result: [String: Any] = [
            "type": "capabilities",
            "recording": ProcessInfo.processInfo.isOperatingSystemAtLeast(
                OperatingSystemVersion(majorVersion: 15, minorVersion: 0, patchVersion: 0)
            ),
            "speech_analyzer": false,
            "locales": [String](),
        ]
        guard #available(macOS 26, *), SpeechTranscriber.isAvailable else { return result }
        result["speech_analyzer"] = true
        result["locales"] = await SpeechTranscriber.supportedLocales.map(\.identifier).sorted()
        return result
    }
}
