import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit
import Speech

final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    private let lock = NSLock()
    private var result: Result<Void, Error>?
    private var waiter: CheckedContinuation<Void, Error>?

    private func complete(_ value: Result<Void, Error>) {
        lock.lock()
        guard result == nil else { lock.unlock(); return }
        result = value
        let continuation = waiter
        waiter = nil
        lock.unlock()
        continuation?.resume(with: value)
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        complete(.success(()))
    }

    func waitForFinish() async throws {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let result {
                lock.unlock()
                continuation.resume(with: result)
            } else {
                waiter = continuation
                lock.unlock()
            }
        }
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: any Error) {
        complete(.failure(error))
    }
}

enum MeetingRecorder {
    static func run(outputURL: URL, localeIdentifier: String) async throws {
        guard #available(macOS 15, *) else { throw BridgeError.unsupportedRecording }
        let (stream, delegate) = try await makeStream(outputURL: outputURL)
        if #available(macOS 26, *), SpeechTranscriber.isAvailable {
            var liveTranscribers = [LiveTranscriber]()
            for (type, source) in [(SCStreamOutputType.audio, "Meeting"), (.microphone, "You")] {
                do {
                    let live = try await LiveTranscriber.make(
                        localeIdentifier: localeIdentifier,
                        source: source
                    )
                    try stream.addStreamOutput(
                        live,
                        type: type,
                        sampleHandlerQueue: DispatchQueue(label: "com.whisperstudio.live.\(source)")
                    )
                    try await live.start()
                    liveTranscribers.append(live)
                } catch {
                    JSONLine.write([
                        "type": "transcript.unavailable",
                        "message": error.localizedDescription,
                    ])
                }
            }
            try await capture(stream: stream, delegate: delegate, outputURL: outputURL) {
                for live in liveTranscribers {
                    await live.finish()
                }
            }
        } else {
            try await capture(stream: stream, delegate: delegate, outputURL: outputURL) {}
        }
    }

    @available(macOS 15, *)
    private static func capture(
        stream: SCStream,
        delegate: RecordingDelegate,
        outputURL: URL,
        finishLiveTranscript: () async -> Void
    ) async throws {
        try await stream.startCapture()
        JSONLine.write(["type": "recording.started", "path": outputURL.path])
        await waitForStopSignal()
        try await stream.stopCapture()
        try await delegate.waitForFinish()
        await finishLiveTranscript()
        let size = (try? outputURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        JSONLine.write(["type": "recording.stopped", "path": outputURL.path, "size": size])
    }

    @available(macOS 15, *)
    private static func makeStream(outputURL: URL) async throws -> (SCStream, RecordingDelegate) {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else { throw BridgeError.noDisplay }
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let configuration = recordingConfiguration()
        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        let outputConfiguration = SCRecordingOutputConfiguration()
        outputConfiguration.outputURL = outputURL
        outputConfiguration.outputFileType = .mp4
        outputConfiguration.videoCodecType = .h264
        let delegate = RecordingDelegate()
        let output = SCRecordingOutput(configuration: outputConfiguration, delegate: delegate)
        try stream.addRecordingOutput(output)
        RecorderLifetime.retain(delegate: delegate, output: output)
        return (stream, delegate)
    }

    @available(macOS 15, *)
    private static func recordingConfiguration() -> SCStreamConfiguration {
        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(seconds: 1, preferredTimescale: 600)
        configuration.queueDepth = 3
        configuration.showsCursor = false
        configuration.capturesAudio = true
        configuration.captureMicrophone = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48_000
        configuration.channelCount = 2
        return configuration
    }

    private static func waitForStopSignal() async {
        signal(SIGINT, SIG_IGN)
        signal(SIGTERM, SIG_IGN)
        await withCheckedContinuation { continuation in
            let finish = StopSignal(continuation)
            finish.listen(for: SIGINT)
            finish.listen(for: SIGTERM)
            RecorderLifetime.retain(signal: finish)
        }
    }
}

private final class StopSignal {
    private var continuation: CheckedContinuation<Void, Never>?
    private var sources = [DispatchSourceSignal]()

    init(_ continuation: CheckedContinuation<Void, Never>) {
        self.continuation = continuation
    }

    func listen(for signalNumber: Int32) {
        let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
        source.setEventHandler { [weak self] in self?.finish() }
        source.resume()
        sources.append(source)
    }

    private func finish() {
        continuation?.resume()
        continuation = nil
        sources.forEach { $0.cancel() }
        sources.removeAll()
    }
}

private enum RecorderLifetime {
    private static var objects = [AnyObject]()

    static func retain(delegate: RecordingDelegate, output: SCRecordingOutput) {
        objects.append(delegate)
        objects.append(output)
    }

    static func retain(signal: StopSignal) {
        objects.append(signal)
    }
}
