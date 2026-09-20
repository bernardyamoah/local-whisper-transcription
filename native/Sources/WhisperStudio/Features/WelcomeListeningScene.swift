import SwiftUI

struct WelcomeListeningScene: View {
    let audio: WelcomeAudio
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var elapsed = 0.0
    @State private var playing = false
    @State private var seeking = false
    private let duration = 6.36
    private let phrases = ["Every voice has a story.", "A passing thought.", "A new idea.", "Make it something worth keeping."]
    private let starts = [0.0, 1.88, 3.24, 4.64]
    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Label("A little preview", systemImage: "waveform").font(.callout).foregroundStyle(.secondary)
                Spacer()
                Text(StudioStyle.time(elapsed)).font(.callout.monospacedDigit()).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 12) {
                ForEach(phrases.indices, id: \.self) { index in
                    Text(phrases[index]).font(.system(size: 25, weight: .medium)).tracking(-0.4)
                        .foregroundStyle(.white.opacity(elapsed >= starts[index] ? 0.95 : 0.2))
                        .blur(radius: reduceMotion || elapsed >= starts[index] ? 0 : 1.5)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: elapsed >= starts[index])
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 16) {
                Button(playing ? "Pause sample" : "Play sample", systemImage: playing ? "pause.fill" : "play.fill") { toggle() }
                    .labelStyle(.iconOnly).studioButton(prominent: true)
                Slider(value: $elapsed, in: 0...duration) { editing in
                    seeking = editing
                    if editing { audio.stop() }
                    else if playing { audio.play("sample", at: elapsed) }
                }.accessibilityLabel("Sample playback")
                Button("Replay sample", systemImage: "arrow.counterclockwise") { elapsed = 0; playing = true; audio.play("sample") }
                    .labelStyle(.iconOnly).studioButton()
            }
        }.padding(28).frame(maxWidth: 520).studioGlass(radius: 24)
            .task {
                playing = !reduceMotion
                if playing { audio.play("sample") }
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                    if playing && !seeking { elapsed = min(duration, audio.position ?? (elapsed + 0.05)) }
                    if elapsed >= duration { playing = false; audio.stop() }
                }
            }
            .onChange(of: audio.enabled) { if playing { audio.play("sample", at: elapsed) } }
            .onDisappear { audio.stop() }
    }
    private func toggle() {
        if elapsed >= duration { elapsed = 0 }
        playing.toggle()
        if playing { audio.play("sample", at: elapsed) } else { audio.stop() }
    }
}
