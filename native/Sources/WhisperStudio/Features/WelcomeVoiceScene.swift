import SwiftUI

struct WelcomeVoiceScene: View {
    let speech: WelcomeSpeech
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Label(speech.listening ? "Listening" : "Your voice", systemImage: "mic")
                    .foregroundStyle(.secondary)
                Spacer()
                Text("On this Mac · Not saved").font(.caption).foregroundStyle(.secondary)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if speech.text.isEmpty {
                            Text(speech.listening ? "Say something worth keeping…" : "What’s on your mind?")
                                .foregroundStyle(.white.opacity(0.35))
                        } else {
                            WordFlowLayout {
                                ForEach(Array(speech.text.split(whereSeparator: \.isWhitespace).enumerated()), id: \.offset) { _, word in
                                    RevealingWord(word: String(word)).id(String(word))
                                }
                            }.foregroundStyle(.white.opacity(0.95))
                                .accessibilityElement(children: .ignore).accessibilityLabel(speech.text)
                        }
                        if speech.listening {
                            Text("Your next thought…").foregroundStyle(.white.opacity(0.22))
                                .blur(radius: reduceMotion ? 0 : 2)
                        }
                        Color.clear.frame(height: 1).id("latest")
                    }.font(.system(size: 27, weight: .medium)).tracking(-0.4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.frame(height: 155)
                    .onChange(of: speech.text) { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo("latest", anchor: .bottom) } }
            }
            if let failure = speech.failure { Text(failure).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
            HStack {
                if speech.preparing { ProgressView().controlSize(.small) }
                Button(speech.listening ? "Stop listening" : speech.text.isEmpty ? "Try my voice" : "Try again", systemImage: speech.listening ? "stop.fill" : "mic.fill") {
                    if speech.listening { speech.stop() } else { Task { await speech.start() } }
                }
                .buttonStyle(.plain).fontWeight(.semibold)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(StudioStyle.accent.opacity(0.2), in: .capsule)
                .keyboardShortcut(.defaultAction)
                .disabled(speech.preparing || store.recording.active)
            }
        }.padding(28).frame(maxWidth: 560).studioGlass(radius: 24)
            .onDisappear { speech.stop() }
    }
}
