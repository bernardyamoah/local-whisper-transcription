import SwiftUI
import AVKit

struct PlaybackBar: View {
    @Bindable var controller: PlaybackController
    let video: Bool
    @State private var scrub = 0.0
    @State private var scrubbing = false
    @State private var expanded = false
    var body: some View {
        VStack(spacing: 12) {
            if video && expanded { VideoPlayer(player: controller.player).frame(height: 240).clipShape(.rect(cornerRadius: 12)) }
            HStack(spacing: 16) {
                Button("Back 10 seconds", systemImage: "gobackward.10") { controller.seek(controller.time - 10) }.labelStyle(.iconOnly).buttonStyle(.plain)
                Button(controller.playing ? "Pause" : "Play", systemImage: controller.playing ? "pause.fill" : "play.fill", action: controller.toggle)
                    .labelStyle(.iconOnly).buttonStyle(.plain).padding(9)
                    .background(StudioStyle.accent.opacity(0.16), in: .circle)
                Button("Forward 10 seconds", systemImage: "goforward.10") { controller.seek(controller.time + 10) }.labelStyle(.iconOnly).buttonStyle(.plain)
                Text(StudioStyle.time(scrubbing ? scrub : controller.time)).font(.caption).monospacedDigit().frame(width: 44)
                Slider(value: $scrub, in: 0...controller.duration) { editing in
                    scrubbing = editing
                    if !editing { controller.seek(scrub) }
                }.accessibilityLabel("Playback position")
                    .onChange(of: controller.time) { if !scrubbing { scrub = controller.time } }
                Text(StudioStyle.time(controller.duration)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                Picker("Playback speed", selection: $controller.speed) {
                    ForEach([Float(0.75), 1, 1.25, 1.5, 2], id: \.self) { value in Text("\(value.formatted())×").tag(value) }
                }.labelsHidden().buttonStyle(.plain).frame(width: 72).onChange(of: controller.speed) { controller.setSpeed() }
                if video { Button("Show video", systemImage: "video") { expanded.toggle() }.labelStyle(.iconOnly).buttonStyle(.plain) }
            }
            if let error = controller.error { Text(error).font(.caption).foregroundStyle(.red) }
        }.padding(12).studioGlass(radius: 12)
        .onAppear { expanded = video }
    }
}
