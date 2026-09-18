import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit
import Speech

@available(macOS 26, *)
final class LiveTranscriber: NSObject, SCStreamOutput, @unchecked Sendable {
    let source: String
    private let transcriber: SpeechTranscriber
    private let analyzer: SpeechAnalyzer
    private let audioFormat: AVAudioFormat
    private let inputs: AsyncStream<AnalyzerInput>
    private let continuation: AsyncStream<AnalyzerInput>.Continuation
    private var converter: AVAudioConverter?
    private var resultTask: Task<Void, Never>?

    static func make(localeIdentifier: String, source: String) async throws -> LiveTranscriber {
        let requested = localeIdentifier == "auto" ? Locale.current : Locale(identifier: localeIdentifier)
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
            throw BridgeError.unsupportedLocale(requested.identifier)
        }
        let transcriber = SpeechTranscriber(
            locale: locale,
            preset: .timeIndexedProgressiveTranscription
        )
        let modules: [any SpeechModule] = [transcriber]
        if await AssetInventory.status(forModules: modules) != .installed {
            guard let request = try await AssetInventory.assetInstallationRequest(supporting: modules) else {
                throw BridgeError.unavailableSpeechAssets
            }
            try await request.downloadAndInstall()
        }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules) else {
            throw BridgeError.unsupportedSpeechAnalyzer
        }
        return LiveTranscriber(source: source, transcriber: transcriber, audioFormat: format)
    }

    private init(source: String, transcriber: SpeechTranscriber, audioFormat: AVAudioFormat) {
        self.source = source
        self.transcriber = transcriber
        self.audioFormat = audioFormat
        let pair = AsyncStream<AnalyzerInput>.makeStream()
        inputs = pair.stream
        continuation = pair.continuation
        analyzer = SpeechAnalyzer(modules: [transcriber])
        super.init()
    }

    func start() async throws {
        try await analyzer.prepareToAnalyze(in: audioFormat)
        try await analyzer.start(inputSequence: inputs)
        let source = source
        let transcriber = transcriber
        resultTask = Task {
            do {
                for try await result in transcriber.results {
                    let seconds = result.range.start.seconds
                    let duration = result.range.duration.seconds
                    JSONLine.write([
                        "type": result.isFinal ? "transcript.final" : "transcript.interim",
                        "source": source,
                        "start": seconds.isFinite ? seconds : 0,
                        "end": seconds.isFinite && duration.isFinite ? seconds + duration : 0,
                        "text": String(result.text.characters),
                    ])
                }
            } catch {
                JSONLine.write(["type": "transcript.unavailable", "message": error.localizedDescription])
            }
        }
    }

    func finish() async {
        continuation.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            JSONLine.write(["type": "transcript.unavailable", "message": error.localizedDescription])
        }
        await resultTask?.value
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard sampleBuffer.isValid, let input = pcmBuffer(from: sampleBuffer) else { return }
        guard let converted = convert(input) else { return }
        continuation.yield(AnalyzerInput(buffer: converted))
    }

    private func pcmBuffer(from sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard
            let description = CMSampleBufferGetFormatDescription(sampleBuffer),
            let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(description),
            let format = AVAudioFormat(streamDescription: streamDescription)
        else { return nil }
        let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard
            frameCount > 0,
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        else { return nil }
        buffer.frameLength = frameCount
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: buffer.mutableAudioBufferList
        )
        return status == noErr ? buffer : nil
    }

    private func convert(_ input: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        if input.format == audioFormat { return input }
        if converter == nil || converter?.inputFormat != input.format {
            converter = AVAudioConverter(from: input.format, to: audioFormat)
        }
        guard let converter else { return nil }
        let ratio = audioFormat.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount(ceil(Double(input.frameLength) * ratio))
        guard let output = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: capacity) else {
            return nil
        }
        var supplied = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, state in
            if supplied {
                state.pointee = .noDataNow
                return nil
            }
            supplied = true
            state.pointee = .haveData
            return input
        }
        return status == .haveData || status == .inputRanDry ? output : nil
    }
}
