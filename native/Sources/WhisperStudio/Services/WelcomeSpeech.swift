import AVFoundation
import AppKit
@preconcurrency import Speech
import Observation

@MainActor @Observable
final class WelcomeSpeech {
    private(set) var text = ""
    private(set) var listening = false
    private(set) var preparing = false
    private(set) var failure: String?
    private var engine: AVAudioEngine?
    private var recognition: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var timeout: Task<Void, Never>?
    private var session = UUID()

    func start() async {
        guard !listening, !preparing else { return }
        stop()
        let current = session
        preparing = true; failure = nil; text = ""
        let mic = await requestMicrophoneAccess()
        restoreWindowFocus()
        guard session == current else { return }
        guard mic else { preparing = false; failure = "Allow microphone access in System Settings to try your voice."; return }
        let status = await requestSpeechAccess()
        restoreWindowFocus()
        guard session == current else { return }
        guard status == .authorized else { preparing = false; failure = "Allow Speech Recognition in System Settings, or skip this step."; return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable,
              recognizer.supportsOnDeviceRecognition else {
            preparing = false; failure = "Live speech for your Mac’s language isn’t available. You can skip this preview."; return
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            preparing = false; failure = "No microphone is available."; return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        self.engine = engine; self.request = request
        input.installTap(
            onBus: 0,
            bufferSize: 1024,
            format: format,
            block: Self.audioTapHandler(request)
        )
        recognition = recognizer.recognitionTask(
            with: request,
            resultHandler: Self.recognitionHandler(self, session: current)
        )
        do {
            engine.prepare(); try engine.start()
            preparing = false; listening = true
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                self?.stop()
            }
        } catch { stop(); failure = "Couldn’t start the microphone. Try again." }
    }
    func stop() {
        session = UUID()
        timeout?.cancel(); timeout = nil
        engine?.stop(); engine?.inputNode.removeTap(onBus: 0); engine = nil
        request?.endAudio(); request = nil
        recognition?.cancel(); recognition = nil
        listening = false; preparing = false
    }

    private nonisolated static func audioTapHandler(
        _ request: SFSpeechAudioBufferRecognitionRequest
    ) -> @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void {
        { buffer, _ in request.append(buffer) }
    }

    private nonisolated static func recognitionHandler(
        _ owner: WelcomeSpeech,
        session: UUID
    ) -> @Sendable (SFSpeechRecognitionResult?, (any Error)?) -> Void {
        { [weak owner] result, error in
            let words = result?.bestTranscription.formattedString
            let final = result?.isFinal == true
            let failed = error != nil
            Task { @MainActor [weak owner] in
                guard let owner, owner.session == session else { return }
                if let words { owner.text = words }
                if final || failed {
                    if failed && owner.text.isEmpty {
                        owner.failure = "Couldn’t hear speech. Check your microphone and try again."
                    }
                    owner.stop()
                }
            }
        }
    }

    private func restoreWindowFocus() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first(where: { $0.canBecomeKey })?.makeKeyAndOrderFront(nil)
    }

    private func requestMicrophoneAccess() async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(
                for: .audio,
                completionHandler: Self.microphoneAuthorizationHandler(continuation)
            )
        }
    }

    private func requestSpeechAccess() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization(Self.speechAuthorizationHandler(continuation))
        }
    }

    private nonisolated static func microphoneAuthorizationHandler(
        _ continuation: CheckedContinuation<Bool, Never>
    ) -> @Sendable (Bool) -> Void {
        { allowed in continuation.resume(returning: allowed) }
    }

    private nonisolated static func speechAuthorizationHandler(
        _ continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>
    ) -> @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void {
        { status in continuation.resume(returning: status) }
    }
}
