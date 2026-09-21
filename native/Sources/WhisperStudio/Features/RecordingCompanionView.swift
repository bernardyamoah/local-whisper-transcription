import SwiftUI

struct RecordingCompanionView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let open: () -> Void
    let resize: (CGFloat) -> Void
    @State private var speechArriving = false

    private var utterances: [LiveUtterance] { Array((store.recording.liveTranscript ?? []).suffix(2)) }
    private var failure: String? { store.error ?? store.recording.liveError }
    private var expanded: Bool { !utterances.isEmpty || failure != nil || !store.recording.active }
    private var height: CGFloat { expanded ? 238 : 100 }
    private var latestText: String { utterances.last?.text ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                CompanionSpeechPulse(active: store.recording.active, speaking: speechArriving)
                Text(store.busy ? "Finishing…" : store.recording.active ? "Listening" : "Recording captured")
                    .font(.callout.weight(.medium))
                Spacer(minLength: 4)
                if store.recording.active {
                    Text(StudioStyle.time(store.recording.elapsed ?? 0))
                        .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
                Button("Open Whisper Studio", systemImage: "arrow.up.right") { open() }
                    .labelStyle(.iconOnly).buttonStyle(.plain)
                    .padding(6).background(.primary.opacity(0.08), in: .circle)
                    .frame(width: 28, height: 28).help("Open Whisper Studio")
                if store.recording.active {
                    Button("Stop recording", systemImage: "stop.fill") { Task { await store.stopRecording() } }
                        .labelStyle(.iconOnly).buttonStyle(.plain).foregroundStyle(.red)
                        .padding(6).background(.red.opacity(0.14), in: .circle)
                        .font(.system(size: 11, weight: .semibold))
                        .frame(width: 30, height: 30)
                        .disabled(store.busy).help("Stop recording — Command–Shift–R")
                }
            }
            if expanded {
                if let failure {
                    Label(failure, systemImage: "exclamationmark.circle")
                        .font(.callout).foregroundStyle(.secondary).lineLimit(4)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                } else if !store.recording.active {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Your words, ready for what’s next.")
                            .font(.title3.weight(.medium))
                        Button("Open transcript", systemImage: "arrow.up.right") { open() }
                            .buttonStyle(.plain).fontWeight(.semibold)
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(StudioStyle.accent.opacity(0.18), in: .capsule)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    CompanionTranscript(utterances: utterances)
                }
            }
        }
        .padding(20).frame(width: 390, height: height, alignment: .topLeading)
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
        .overlay { RoundedRectangle(cornerRadius: 26).strokeBorder(.primary.opacity(0.12), lineWidth: 0.5) }
        .clipShape(.rect(cornerRadius: 26))
        .preferredColorScheme(store.scheme)
        .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: expanded)
        .onAppear { resize(height) }
        .onChange(of: height) { resize(height) }
        .task(id: latestText) {
            guard !latestText.isEmpty else { speechArriving = false; return }
            speechArriving = true
            do { try await Task.sleep(for: .milliseconds(900)); speechArriving = false } catch { }
        }
    }
}
