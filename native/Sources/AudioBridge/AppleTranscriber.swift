import AVFoundation
import Foundation
import Speech

enum AppleTranscriber {
    static func run(fileURL: URL, localeIdentifier: String) async throws {
        guard #available(macOS 26, *) else { throw BridgeError.unsupportedSpeechAnalyzer }
        guard SpeechTranscriber.isAvailable else { throw BridgeError.unsupportedSpeechAnalyzer }
        let locale = try await resolveLocale(localeIdentifier)
        let transcriber = SpeechTranscriber(
            locale: locale,
            preset: .timeIndexedProgressiveTranscription
        )
        try await installAssets(for: transcriber)
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let file = try AVAudioFile(forReading: fileURL)
        let resultTask = Task { try await emitResults(from: transcriber) }
        try await analyzer.start(inputAudioFile: file, finishAfterFile: true)
        try await resultTask.value
        JSONLine.write(["type": "transcription.completed"])
    }

    @available(macOS 26, *)
    private static func resolveLocale(_ identifier: String) async throws -> Locale {
        let requested = identifier == "auto" ? Locale.current : Locale(identifier: identifier)
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
            throw BridgeError.unsupportedLocale(requested.identifier)
        }
        return locale
    }

    @available(macOS 26, *)
    private static func installAssets(for transcriber: SpeechTranscriber) async throws {
        let modules: [any SpeechModule] = [transcriber]
        if await AssetInventory.status(forModules: modules) == .installed { return }
        guard let request = try await AssetInventory.assetInstallationRequest(supporting: modules) else {
            throw BridgeError.unavailableSpeechAssets
        }
        JSONLine.write(["type": "transcription.preparing"])
        try await request.downloadAndInstall()
    }

    @available(macOS 26, *)
    private static func emitResults(from transcriber: SpeechTranscriber) async throws {
        for try await result in transcriber.results {
            let seconds = result.range.start.seconds
            let duration = result.range.duration.seconds
            JSONLine.write([
                "type": result.isFinal ? "transcript.final" : "transcript.interim",
                "start": seconds.isFinite ? seconds : 0,
                "end": seconds.isFinite && duration.isFinite ? seconds + duration : 0,
                "text": String(result.text.characters),
            ])
        }
    }
}
