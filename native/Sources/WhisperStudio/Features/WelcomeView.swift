import SwiftUI

struct WelcomeView: View {
    @Environment(StudioStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scene = 0
    @State private var saving = false
    @State private var audio = WelcomeAudio()
    @State private var speech = WelcomeSpeech()

    private let titles = ["Every voice.\nSomething worth keeping.", "Hear it. See it. Keep it.", "Choose where it happens.", "", "Now, make it yours.", "Your next idea starts here."]
    private let subtitles = ["Whisper Studio", "Your words, finding their place.", "You can change this anytime.", "", "Speak a thought. Watch it take shape.", "Bring a recording. Or start something new."]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if scene > 0 {
                    Button("Back", systemImage: "chevron.left") { move(to: scene - 1) }
                        .buttonStyle(.plain).keyboardShortcut(.leftArrow, modifiers: [])
                }
                Spacer()
            }.frame(height: 28).padding(28)

            ZStack {
                VStack(spacing: 26) {
                    if scene != 3 { illustration.frame(height: (scene == 1 || scene == 4) ? 300 : scene == 2 ? 100 : 210) }
                    VStack(spacing: 14) {
                        Text(scene == 3 ? (store.preferences.transcriptionProvider == "local" ? "Bring Whisper onto your Mac." : "Connect your cloud.") : titles[scene])
                            .font(.system(size: scene == 0 ? 48 : 34, weight: .medium))
                            .tracking(-1)
                            .multilineTextAlignment(.center)
                        Text(scene == 3 ? (store.preferences.transcriptionProvider == "local" ? "Download a model to transcribe offline." : "Your Deepgram API key.") : subtitles[scene]).font(.body).foregroundStyle(.secondary)
                    }
                    if scene == 2 { providerChoices }
                    if scene == 3 { WelcomeProviderSetup() }
                }
                .frame(maxWidth: 680)
                .padding(.horizontal, 32)
                .id(scene)
                .transition(reduceMotion ? .opacity : .modifier(
                    active: WelcomeSceneTransition(progress: 1),
                    identity: WelcomeSceneTransition(progress: 0)))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack(spacing: 22) {
                HStack(spacing: 12) {
                    if scene == 5 {
                        StudioGlassGroup(spacing: 12) {
                            HStack(spacing: 12) {
                                Button("Explore first") { Task { await finish(importRecording: false) } }.studioButton()
                                Button("Import recording", systemImage: "square.and.arrow.down") {
                                    Task { await finish(importRecording: true) }
                                }.studioButton(.primary).keyboardShortcut(.defaultAction)
                            }
                        }
                    } else {
                        advanceButton
                    }
                    if saving { ProgressView().controlSize(.small) }
                }.controlSize(.large).disabled(saving)
                HStack(spacing: 8) {
                    ForEach(0..<6) { index in
                        Capsule().fill(.primary.opacity(index == scene ? 0.75 : 0.16))
                            .frame(width: index == scene ? 22 : 6, height: 6)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Step \(scene + 1) of 6")
            }.padding(.top, 28).padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            ZStack {
                DesktopBackdrop().ignoresSafeArea()
                Color.black.opacity(0.34).ignoresSafeArea()
            }
        }
        .onAppear {
            audio.startMusic()
            audio.play("arrival")
        }
        .onDisappear { speech.stop(); audio.stopAll() }
    }

    @ViewBuilder private var illustration: some View {
        switch scene {
        case 0:
            VoiceRibbon().frame(maxWidth: 660)
        case 1:
            WelcomeListeningScene(audio: audio)
        case 4:
            WelcomeVoiceScene(speech: speech)
        case 2:
            VoiceRibbon(active: false, compact: true).frame(width: 340)
        default:
            VoiceRibbon(compact: true).frame(maxWidth: 480)
        }
    }

    private var providerChoices: some View {
        StudioGlassGroup(spacing: 12) {
            HStack(spacing: 12) {
                WelcomeChoice(title: "On this Mac", subtitle: "Local model · Works offline", icon: "laptopcomputer",
                              selected: store.preferences.transcriptionProvider == "local") {
                    store.preferences.transcriptionProvider = "local"
                }
                WelcomeChoice(title: "Deepgram", subtitle: "Cloud · API key required", icon: "cloud",
                              selected: store.preferences.transcriptionProvider == "deepgram") {
                    store.preferences.transcriptionProvider = "deepgram"
                }
            }
        }
    }

    private var providerReady: Bool {
        store.preferences.transcriptionProvider == "local"
            ? store.environment?.models.contains(where: \.installed) == true
            : store.environment?.deepgram.configured == true
    }

    @ViewBuilder private var advanceButton: some View {
        let title = scene == 0 ? "Let's begin" : scene == 3 && !providerReady ? "Skip for now" : "Continue"
        if scene == 4 {
            Button(title, systemImage: "arrow.right") { move(to: scene + 1) }
                .studioButton(.primary)
        } else {
            Button(title, systemImage: "arrow.right") { move(to: scene + 1) }
                .studioButton(.primary)
                .keyboardShortcut(.defaultAction)
        }
    }

    private func move(to next: Int) {
        guard (0..<6).contains(next), !saving else { return }
        speech.stop()
        audio.stop()
        audio.suspend(next == 4)
        if next != 1 && next != 4 { audio.play("arrival") }
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.65, dampingFraction: 1)) {
            scene = next
        }
    }

    private func finish(importRecording: Bool) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        await store.completeWelcome(importRecording: importRecording)
    }
}
